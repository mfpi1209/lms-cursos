import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3StorageAdapter, sanitizeS3Key } from '../src/storage/s3';
import { resolveStorageProvider, s3ConfigFromEnv } from '../src/storage';

type AnyCommand = { input: Record<string, unknown>; constructor: { name: string } };
type Handler = (cmd: AnyCommand) => unknown | Promise<unknown>;

/** Cliente falso: registra cada comando enviado e devolve o que o handler decidir. Sem rede. */
function fakeClient(handler: Handler) {
  const sent: AnyCommand[] = [];
  const send = async (cmd: AnyCommand) => {
    sent.push(cmd);
    return handler(cmd);
  };
  return { client: { send } as unknown as S3Client, sent };
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

const base = { bucket: 'meu-bucket', accessKeyId: 'AKIA_TESTE', secretAccessKey: 'segredo' };

describe('S3StorageAdapter', () => {
  it('putObject com bytes usa PutObjectCommand com Bucket, Key, ContentType e ContentLength', async () => {
    const { client, sent } = fakeClient(() => ({ ETag: '"x"' }));
    const s3 = new S3StorageAdapter({ ...base, client });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const r = await s3.putObject('ws1/video/ab/abc.mp4', bytes, 'video/mp4');
    expect(r).toEqual({ key: 'ws1/video/ab/abc.mp4' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(sent[0]!.input).toMatchObject({ Bucket: 'meu-bucket', Key: 'ws1/video/ab/abc.mp4', ContentType: 'video/mp4', ContentLength: 4 });
    expect(sent[0]!.input.Body).toBe(bytes);
  });

  it('putObject com Readable usa o upload em streaming do lib-storage (multipart gerenciado) e preserva ContentType', async () => {
    // cliente real (credenciais fictícias) com `send` substituído: o lib-storage usa client.config/middlewareStack, por isso não basta um objeto solto
    const sent: AnyCommand[] = [];
    const client = new S3Client({ region: 'us-east-1', credentials: { accessKeyId: 'AKIA_TESTE', secretAccessKey: 'segredo' } });
    client.send = (async (cmd: AnyCommand) => {
      sent.push(cmd);
      return { ETag: '"parte"', UploadId: 'up_1', Location: 'x' };
    }) as unknown as S3Client['send'];
    const s3 = new S3StorageAdapter({ ...base, client });
    const body = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    const r = await s3.putObject('ws1/video/stream.mp4', body, 'video/mp4');
    expect(r).toEqual({ key: 'ws1/video/stream.mp4' });
    // corpo menor que uma parte: o lib-storage resolve em um único PutObject com o conteúdo inteiro
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const put = sent.find((c) => c instanceof PutObjectCommand);
    expect(put).toBeDefined();
    expect(put!.input).toMatchObject({ Bucket: 'meu-bucket', Key: 'ws1/video/stream.mp4', ContentType: 'video/mp4' });
    expect(Buffer.from(put!.input.Body as Uint8Array).toString()).toBe('abcdef');
  });

  it('aplica S3_PREFIX na chave do objeto, mas devolve a chave lógica', async () => {
    const { client, sent } = fakeClient(() => ({}));
    const s3 = new S3StorageAdapter({ ...base, prefix: '/lms/prod/', client });
    const r = await s3.putObject('a/b.bin', new Uint8Array([0]), 'application/octet-stream');
    expect(r.key).toBe('a/b.bin');
    expect(sent[0]!.input.Key).toBe('lms/prod/a/b.bin');
  });

  it('head devolve o tamanho quando o objeto existe', async () => {
    const { client, sent } = fakeClient(() => ({ ContentLength: 1234, ContentType: 'audio/mpeg' }));
    const s3 = new S3StorageAdapter({ ...base, client });
    const info = await s3.head('ws1/audio/x.mp3');
    expect(info).toEqual({ key: 'ws1/audio/x.mp3', sizeBytes: 1234 });
    expect(sent[0]).toBeInstanceOf(HeadObjectCommand);
    expect(sent[0]!.input).toEqual({ Bucket: 'meu-bucket', Key: 'ws1/audio/x.mp3' });
  });

  it('head devolve null em 404 NotFound (classe do SDK e erro genérico com status 404)', async () => {
    const notFound = new NotFound({ $metadata: { httpStatusCode: 404 }, message: 'Not Found' });
    const a = new S3StorageAdapter({ ...base, client: fakeClient(() => { throw notFound; }).client });
    expect(await a.head('nao/existe')).toBeNull();

    const generic404 = new S3ServiceException({ name: 'UnknownError', $fault: 'client', $metadata: { httpStatusCode: 404 }, message: '404' });
    const b = new S3StorageAdapter({ ...base, client: fakeClient(() => { throw generic404; }).client });
    expect(await b.head('nao/existe')).toBeNull();
  });

  it('head propaga outros erros (ex.: 403 de credencial inválida)', async () => {
    const forbidden = new S3ServiceException({ name: 'AccessDenied', $fault: 'client', $metadata: { httpStatusCode: 403 }, message: 'Access Denied' });
    const s3 = new S3StorageAdapter({ ...base, client: fakeClient(() => { throw forbidden; }).client });
    await expect(s3.head('x')).rejects.toThrow(/Access Denied/);
  });

  it('getStream com range monta o header Range correto e devolve um Readable com o corpo', async () => {
    const { client, sent } = fakeClient(() => ({ Body: Readable.from([Buffer.from('cdef')]) }));
    const s3 = new S3StorageAdapter({ ...base, client });
    const out = await collect(s3.getStream('ws1/video/v.mp4', { start: 2, end: 5 }));
    expect(out.toString()).toBe('cdef');
    expect(sent[0]).toBeInstanceOf(GetObjectCommand);
    expect(sent[0]!.input).toEqual({ Bucket: 'meu-bucket', Key: 'ws1/video/v.mp4', Range: 'bytes=2-5' });
  });

  it('getStream sem range não envia Range', async () => {
    const { client, sent } = fakeClient(() => ({ Body: Readable.from([Buffer.from('tudo')]) }));
    const s3 = new S3StorageAdapter({ ...base, client });
    expect((await collect(s3.getStream('k'))).toString()).toBe('tudo');
    expect(sent[0]!.input).toEqual({ Bucket: 'meu-bucket', Key: 'k' });
  });

  it('getStream propaga erro do S3 como erro do stream (sem exceção síncrona)', async () => {
    const { client } = fakeClient(() => { throw new Error('NoSuchBucket'); });
    const s3 = new S3StorageAdapter({ ...base, client });
    await expect(collect(s3.getStream('k'))).rejects.toThrow(/NoSuchBucket/);
  });

  it('getStream rejeita range inválido como erro do stream', async () => {
    const { client, sent } = fakeClient(() => ({ Body: Readable.from([]) }));
    const s3 = new S3StorageAdapter({ ...base, client });
    await expect(collect(s3.getStream('k', { start: 10, end: 2 }))).rejects.toThrow(/intervalo/);
    expect(sent).toHaveLength(0);
  });

  it('deleteObject envia DeleteObjectCommand', async () => {
    const { client, sent } = fakeClient(() => ({}));
    const s3 = new S3StorageAdapter({ ...base, client });
    await s3.deleteObject('a/b');
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(sent[0]!.input).toEqual({ Bucket: 'meu-bucket', Key: 'a/b' });
  });

  it('rejeita chaves com ../ , barra inicial e segmentos vazios em todas as operações', async () => {
    const { client, sent } = fakeClient(() => ({}));
    const s3 = new S3StorageAdapter({ ...base, client });
    await expect(s3.putObject('../x', new Uint8Array([1]), 'text/plain')).rejects.toThrow(/chave de storage inválida/);
    await expect(s3.head('a/../../x')).rejects.toThrow(/chave de storage inválida/);
    await expect(s3.deleteObject('..')).rejects.toThrow(/chave de storage inválida/);
    expect(() => s3.getStream('../x')).toThrow(/chave de storage inválida/);
    expect(sent).toHaveLength(0);
    // normalizações aceitas
    expect(sanitizeS3Key('/ws/a/./b.mp4')).toBe('ws/a/b.mp4');
    expect(sanitizeS3Key('ws\\a\\b.mp4')).toBe('ws/a/b.mp4');
    expect(() => sanitizeS3Key('')).toThrow();
    expect(sanitizeS3Key('a//b')).toBe('a/b');
    expect(() => sanitizeS3Key('a/\u0000b')).toThrow();
  });

  it('getSignedUrl gera URL pré-assinada (SigV4) localmente, com prefixo e validade limitada a 7 dias', async () => {
    // cliente real com credenciais fictícias: a pré-assinatura é só criptografia local, nenhuma requisição sai
    const s3 = new S3StorageAdapter({ ...base, region: 'us-east-1', endpoint: 'https://s3.exemplo.test', forcePathStyle: true, prefix: 'lms' });
    const url = new URL(await s3.getSignedUrl('ws1/video/v.mp4', 10 * 24 * 60 * 60));
    expect(url.origin).toBe('https://s3.exemplo.test');
    expect(url.pathname).toBe('/meu-bucket/lms/ws1/video/v.mp4');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(7 * 24 * 60 * 60));
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIA_TESTE/');
    expect(url.href).not.toContain('segredo');
  });
});

describe('configuração por ambiente', () => {
  it('resolve o provider: explícito, automático por S3_BUCKET, ou local', () => {
    expect(resolveStorageProvider({} as NodeJS.ProcessEnv)).toBe('local');
    expect(resolveStorageProvider({ S3_BUCKET: 'b' } as NodeJS.ProcessEnv)).toBe('s3');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'local', S3_BUCKET: 'b' } as NodeJS.ProcessEnv)).toBe('local');
    expect(resolveStorageProvider({ STORAGE_PROVIDER: 'S3' } as NodeJS.ProcessEnv)).toBe('s3');
    expect(() => resolveStorageProvider({ STORAGE_PROVIDER: 'gcs' } as NodeJS.ProcessEnv)).toThrow(/não é suportado/);
  });

  it('s3ConfigFromEnv falha com mensagem clara listando as variáveis ausentes, sem vazar valores', () => {
    const err = (() => { try { s3ConfigFromEnv({ S3_BUCKET: 'b' } as NodeJS.ProcessEnv); return null; } catch (e) { return e as Error; } })();
    expect(err?.message).toMatch(/faltam variáveis de ambiente obrigatórias: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
  });

  it('s3ConfigFromEnv lê região padrão, endpoint, path style e prefixo', () => {
    const cfg = s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_ENDPOINT: 'http://minio:9000', S3_FORCE_PATH_STYLE: 'true', S3_PREFIX: 'lms' } as NodeJS.ProcessEnv);
    expect(cfg).toEqual({ bucket: 'b', region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's', endpoint: 'http://minio:9000', forcePathStyle: true, prefix: 'lms' });
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_REGION: 'sa-east-1' } as NodeJS.ProcessEnv)).toEqual({ bucket: 'b', region: 'sa-east-1', accessKeyId: 'k', secretAccessKey: 's' });
    expect(() => s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_ENDPOINT: 'minio:9000' } as NodeJS.ProcessEnv)).toThrow(/S3_ENDPOINT/);
  });
});

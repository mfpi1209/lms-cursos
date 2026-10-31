import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as presignGet } from '@aws-sdk/s3-request-presigner';
import type { StorageAdapter, StoredObjectInfo } from '../storage';

export interface S3StorageOptions {
  bucket: string;
  region?: string;
  /** endpoint customizado (MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces...) */
  endpoint?: string;
  /** `true` para provedores que não suportam virtual-hosted-style (MinIO local, alguns self-hosted) */
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  /** prefixo opcional dentro do bucket (ex.: `lms/`), sem barra inicial */
  prefix?: string;
  /** cliente já configurado (testes injetam um `send` falso); se omitido é criado a partir das opções acima */
  client?: S3Client;
}

/** Tamanho de parte do multipart (8 MiB) e paralelismo do upload em streaming. */
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_QUEUE_SIZE = 4;
/** Limite documentado de validade de URL pré-assinada SigV4 (7 dias). */
const MAX_PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Saneia a chave como o adapter local: separadores POSIX, sem barra inicial,
 * sem segmentos `.`/`..` e sem segmentos vazios. Lança em chave inválida.
 */
export function sanitizeS3Key(key: string): string {
  if (typeof key !== 'string' || key.length === 0) throw new Error('chave de storage inválida');
  const normalized = path.posix.normalize(key.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (normalized === '' || normalized === '.') throw new Error('chave de storage inválida');
  const segments = normalized.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) throw new Error('chave de storage inválida');
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error('chave de storage inválida');
  return normalized;
}

function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return '';
  const p = prefix.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!p) return '';
  if (p.split('/').some((s) => s === '' || s === '.' || s === '..')) throw new Error('S3_PREFIX inválido');
  return `${p}/`;
}

function isNotFound(e: unknown): boolean {
  if (e instanceof NotFound || e instanceof NoSuchKey) return true;
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (err.name === 'NotFound' || err.name === 'NoSuchKey') return true;
  return err.$metadata?.httpStatusCode === 404;
}

/**
 * Converte o Body do GetObject (Readable em Node; ReadableStream em outros runtimes) para Node Readable.
 * O tipo vem de `node:stream/web` para compilar igualmente com e sem a lib DOM no tsconfig consumidor.
 */
function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (typeof body === 'object' && body !== null) {
    const b = body as { transformToWebStream?: () => WebReadableStream<Uint8Array>; getReader?: unknown };
    if (typeof b.transformToWebStream === 'function') return Readable.fromWeb(b.transformToWebStream());
    if (typeof b.getReader === 'function') return Readable.fromWeb(body as WebReadableStream<Uint8Array>);
  }
  throw new Error('S3: corpo da resposta em formato inesperado');
}

export function createS3Client(opts: Omit<S3StorageOptions, 'client' | 'prefix' | 'bucket'>): S3Client {
  const config: S3ClientConfig = {
    region: opts.region ?? 'us-east-1',
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  };
  if (opts.endpoint) {
    config.endpoint = opts.endpoint;
    // Provedores S3-compatíveis frequentemente rejeitam os checksums CRC32 que o SDK passou a
    // enviar por padrão; só calculamos/validamos quando a operação exige.
    config.requestChecksumCalculation = 'WHEN_REQUIRED';
    config.responseChecksumValidation = 'WHEN_REQUIRED';
  }
  if (opts.forcePathStyle !== undefined) config.forcePathStyle = opts.forcePathStyle;
  return new S3Client(config);
}

/**
 * Storage em bucket S3 ou compatível (AWS S3, MinIO, Cloudflare R2, Backblaze B2).
 * Os arquivos continuam sendo servidos pela aplicação (`/api/assets/[id]`) com
 * suporte a Range; o bucket deve permanecer privado.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly provider = 's3';
  readonly bucket: string;
  readonly prefix: string;
  private readonly client: S3Client;

  constructor(opts: S3StorageOptions) {
    if (!opts.bucket) throw new Error('S3StorageAdapter: bucket é obrigatório');
    this.bucket = opts.bucket;
    this.prefix = normalizePrefix(opts.prefix);
    this.client = opts.client ?? createS3Client(opts);
  }

  /** Chave completa no bucket (prefixo + chave saneada). */
  objectKey(key: string): string {
    return this.prefix + sanitizeS3Key(key);
  }

  async putObject(key: string, body: Readable | Uint8Array, contentType: string): Promise<{ key: string }> {
    const Key = this.objectKey(key);
    if (body instanceof Readable) {
      // streaming: multipart gerenciado pelo lib-storage (bufferiza no máximo queueSize*partSize)
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key, Body: body, ContentType: contentType },
        partSize: MULTIPART_PART_SIZE,
        queueSize: MULTIPART_QUEUE_SIZE,
        leavePartsOnError: false,
      });
      await upload.done();
    } else {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key, Body: body, ContentType: contentType, ContentLength: body.byteLength }));
    }
    return { key };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const Key = this.objectKey(key);
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key }));
      return { key, sizeBytes: res.ContentLength ?? 0 };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  getStream(key: string, range?: { start: number; end: number }): Readable {
    const Key = this.objectKey(key);
    const out = new PassThrough();
    const input: { Bucket: string; Key: string; Range?: string } = { Bucket: this.bucket, Key };
    if (range) {
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start) {
        queueMicrotask(() => out.destroy(new Error('S3: intervalo (range) inválido')));
        return out;
      }
      input.Range = `bytes=${range.start}-${range.end}`;
    }
    const abort = new AbortController();
    out.once('close', () => abort.abort());
    this.client
      .send(new GetObjectCommand(input), { abortSignal: abort.signal })
      .then((res) => {
        if (out.destroyed) return;
        const src = toNodeReadable(res.Body);
        src.once('error', (err) => out.destroy(err));
        out.once('close', () => src.destroy());
        src.pipe(out);
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        out.destroy(err instanceof Error ? err : new Error(String(err)));
      });
    return out;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresIn = Math.min(Math.max(Math.floor(ttlSeconds), 1), MAX_PRESIGN_TTL_SECONDS);
    return presignGet(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }), { expiresIn });
  }
}

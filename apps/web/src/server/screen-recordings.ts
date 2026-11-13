import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { authoring, DomainError, getDb, media, newId, schema } from '@lms/db';
import { getStorage } from '@lms/media';
import { applyRecordingAsset, formatLimit, hasMp4Signature, listScreenRecordings, normalizeRecordingName, screenRecordingMaxBytes } from '@/lib/screen-recordings';
import { HttpError, type Viewer } from './viewer';

/** Limite por arquivo (bytes): `SCREEN_RECORDING_MAX_MB`, padrão 1024 MB. Lido a cada pedido (sem reiniciar para mudar). */
export function screenRecordingLimit(): number {
  return screenRecordingMaxBytes(process.env.SCREEN_RECORDING_MAX_MB);
}

export interface StoreScreenRecordingInput {
  viewer: Viewer;
  courseId: string;
  fileName: string;
  contentType: string | null;
  contentLength: number | null;
  body: ReadableStream<Uint8Array> | null;
}

export interface StoreScreenRecordingResult {
  assetId: string;
  sizeBytes: number;
  /** quantas gravações do curso foram ligadas (o mesmo nome em duas cenas liga nas duas) */
  linked: number;
  revision: number;
}

/**
 * Recebe UM MP4 de gravação de tela (corpo bruto, em fluxo: nada é carregado inteiro na memória), grava no storage,
 * cria o asset e liga o `assetId` a toda gravação do rascunho com o mesmo nome (sem diferenciar maiúsculas, com ou sem
 * `.mp4`), zerando `fit`/`durationSec`. O vínculo é uma nova revisão do rascunho (origem "screen-recording"), lida e
 * gravada de novo se outra pessoa gravou no meio. NÃO gera nem monta nada.
 */
export async function storeScreenRecording(input: StoreScreenRecordingInput): Promise<StoreScreenRecordingResult> {
  const { viewer, courseId, fileName } = input;
  const key = normalizeRecordingName(fileName);
  if (!key || fileName.length > 200) throw new DomainError('VALIDATION', 'Nome de arquivo inválido.');
  const max = screenRecordingLimit();

  // tudo o que dá para recusar sem ler o corpo vem antes
  const type = (input.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'video/mp4') throw new DomainError('VALIDATION', 'Envie um vídeo MP4 (Content-Type video/mp4).');
  if (input.contentLength !== null && input.contentLength > max) throw new HttpError(413, `O arquivo passa de ${formatLimit(max)}.`);
  const db = getDb();
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  if (!listScreenRecordings(draft.document).some((r) => normalizeRecordingName(r.fileName) === key)) {
    throw new DomainError('NOT_FOUND', 'Arquivo não reconhecido: nenhuma gravação de tela do curso tem esse nome.');
  }
  if (!input.body) throw new DomainError('VALIDATION', 'O arquivo está vazio.');

  // fluxo guardado: confere a assinatura no começo, conta bytes, calcula o hash e corta ao passar do limite
  const hash = createHash('sha256');
  let size = 0;
  let head = Buffer.alloc(0);
  async function* guarded(src: AsyncIterable<Buffer | Uint8Array>) {
    for await (const chunk of src) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.byteLength;
      if (size > max) throw new DomainError('VALIDATION', `O arquivo passa de ${formatLimit(max)}.`);
      if (head.byteLength < 12) {
        head = Buffer.concat([head, buf.subarray(0, 12 - head.byteLength)]);
        if (head.byteLength >= 12 && !hasMp4Signature(head)) throw new DomainError('VALIDATION', 'O arquivo não é um MP4 válido.');
      }
      hash.update(buf);
      yield buf;
    }
    if (size === 0) throw new DomainError('VALIDATION', 'O arquivo está vazio.');
    if (!hasMp4Signature(head)) throw new DomainError('VALIDATION', 'O arquivo não é um MP4 válido.');
  }

  const storage = await getStorage();
  const storageKey = `${viewer.workspace.id}/video/gravacoes/${newId('arq')}.mp4`;
  try {
    await storage.putObject(storageKey, Readable.from(guarded(Readable.fromWeb(input.body as never))), 'video/mp4');
  } catch (e) {
    await storage.deleteObject(storageKey).catch(() => undefined);
    throw e;
  }

  const asset = await media.createAsset(db, {
    workspaceId: viewer.workspace.id,
    kind: 'video',
    source: 'upload',
    mimeType: 'video/mp4',
    sizeBytes: size,
    storageProvider: storage.provider,
    storageKey,
    originalName: safeName(fileName),
    sha256: hash.digest('hex'),
    createdBy: viewer.user.id,
  });

  // vínculo no rascunho, com o controle de revisão de sempre: em conflito lê de novo e reaplica
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = attempt === 0 ? draft : await authoring.getDraft(db, courseId);
    if (!cur) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const { document, linked } = applyRecordingAsset(cur.document, fileName, asset.id);
    if (!linked) throw new DomainError('CONFLICT', 'A gravação deixou de existir no curso enquanto o arquivo subia. Nada foi ligado.');
    try {
      const saved = await authoring.saveDraft(db, { courseId, document, expectedRevision: cur.revision, userId: viewer.user.id, origin: 'screen-recording', note: `Gravação de tela: ${safeName(fileName)}` });
      await db.insert(schema.auditLogs).values({
        id: newId('aud'),
        workspaceId: viewer.workspace.id,
        actorId: viewer.user.id,
        action: 'screen_recording.link',
        entityType: 'course',
        entityId: courseId,
        data: { fileName: safeName(fileName), assetId: asset.id, sizeBytes: size, linked, revision: saved.revision },
      });
      return { assetId: asset.id, sizeBytes: size, linked, revision: saved.revision };
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT' && attempt < 4) continue;
      throw e;
    }
  }
  throw new DomainError('CONFLICT', 'Não foi possível ligar o arquivo: o rascunho está em edição intensa. Tente de novo.');
}

/** Nome só para mostrar: sem caminho, sem caracteres de controle, até 120 caracteres. */
function safeName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'gravacao.mp4').slice(0, 120);
}

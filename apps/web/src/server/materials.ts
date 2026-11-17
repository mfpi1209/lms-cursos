import { createHash } from 'node:crypto';
import { DomainError, media, type DbOrTx } from '@lms/db';
import { checkTaskFile, getStorage } from '@lms/media';

/** Material de apoio enviado pela equipe: PDF, PNG ou JPEG, até 25 MB, conferido pelos bytes (nunca pelo nome). */
export const MATERIAL_MAX_BYTES = 25 * 1024 * 1024;
export const MATERIAL_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export type StoredMaterialFile = { assetId: string; format: 'pdf' | 'image'; sizeBytes: number; mimeType: string; originalName: string };

/**
 * Grava o arquivo de um material: PDF vira asset `document` marcado com o curso (`metadata.courseMaterial`, lido por
 * quem está matriculado numa versão que o lista); imagem vira `image` (já legível pelo workspace, como as das cenas).
 * Mesmo conteúdo no mesmo curso = mesmo asset (sem duplicar no storage nem na tabela).
 */
export async function storeMaterialFile(db: DbOrTx, input: { workspaceId: string; courseId: string; userId: string; bytes: Uint8Array; fileName: string }): Promise<StoredMaterialFile> {
  const check = checkTaskFile(input.bytes, { maxBytes: MATERIAL_MAX_BYTES, accepted: MATERIAL_TYPES });
  if (!check.ok) throw new DomainError('VALIDATION', check.message);
  const isPdf = check.mime === 'application/pdf';
  const kind = isPdf ? 'document' : 'image';
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const originalName = sanitizeName(input.fileName, check.ext);
  const existing = (await media.findAssetsBySha256(db, input.workspaceId, sha256, kind)).find((a) => (!isPdf || a.metadata?.courseMaterial?.courseId === input.courseId));
  if (existing) return { assetId: existing.id, format: isPdf ? 'pdf' : 'image', sizeBytes: Number(existing.sizeBytes), mimeType: existing.mimeType, originalName: existing.originalName ?? originalName };
  const storage = await getStorage();
  const key = `${input.workspaceId}/${kind}/${sha256.slice(0, 2)}/${sha256}.${check.ext}`;
  await storage.putObject(key, input.bytes, check.mime);
  const asset = await media.createAsset(db, {
    workspaceId: input.workspaceId,
    kind,
    source: 'upload',
    mimeType: check.mime,
    sizeBytes: input.bytes.byteLength,
    storageProvider: storage.provider,
    storageKey: key,
    originalName,
    sha256,
    createdBy: input.userId,
    ...(isPdf ? { metadata: { courseMaterial: { courseId: input.courseId } } } : {}),
  });
  return { assetId: asset.id, format: isPdf ? 'pdf' : 'image', sizeBytes: input.bytes.byteLength, mimeType: check.mime, originalName };
}

function sanitizeName(name: string, ext: string): string {
  const base = name.replace(/[\x00-\x1f"\\/]/g, '').replace(/\.[a-z0-9]{2,4}$/i, '').trim().slice(0, 120) || 'material';
  return `${base}.${ext}`;
}

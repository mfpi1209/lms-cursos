import { createHash } from 'node:crypto';
import { DomainError, getDb, media } from '@lms/db';
import { checkTaskFile, getStorage } from '@lms/media';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

export const runtime = 'nodejs';

export const CERT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CERT_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

/**
 * Logo ou assinatura do emissor do certificado (multipart, campo "file"): PNG ou JPEG até 5 MB, conferido pelos bytes.
 * Grava um asset `image` do workspace (mesmo conteúdo = mesmo asset) e devolve `{ assetId, url }`. Só a equipe.
 */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireStaff();
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > CERT_IMAGE_MAX_BYTES + 512 * 1024) throw new DomainError('VALIDATION', 'A imagem passa de 5 MB.');
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DomainError('VALIDATION', 'Envie uma imagem no campo "file"');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkTaskFile(bytes, { maxBytes: CERT_IMAGE_MAX_BYTES, accepted: CERT_IMAGE_TYPES });
    if (!check.ok) throw new DomainError('VALIDATION', check.message);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const db = getDb();
    const existing = (await media.findAssetsBySha256(db, viewer.workspace.id, sha256, 'image'))[0];
    if (existing) return { assetId: existing.id, url: `/api/assets/${existing.id}` };
    const storage = await getStorage();
    const key = `${viewer.workspace.id}/image/${sha256.slice(0, 2)}/${sha256}.${check.ext}`;
    await storage.putObject(key, bytes, check.mime);
    const originalName = (file.name.replace(/[\x00-\x1f"\\/]/g, '').replace(/\.[a-z0-9]{2,4}$/i, '').trim().slice(0, 120) || 'certificado') + `.${check.ext}`;
    const asset = await media.createAsset(db, {
      workspaceId: viewer.workspace.id,
      kind: 'image',
      source: 'upload',
      mimeType: check.mime,
      sizeBytes: bytes.byteLength,
      storageProvider: storage.provider,
      storageKey: key,
      originalName,
      sha256,
      createdBy: viewer.user.id,
    });
    return { assetId: asset.id, url: `/api/assets/${asset.id}` };
  });
}

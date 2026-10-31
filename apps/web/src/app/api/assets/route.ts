import { createHash } from 'node:crypto';
import { getDb, media, DomainError } from '@lms/db';
import { ALLOWED_MEDIA, MAX_UPLOAD_BYTES, getStorage, sniffMime } from '@lms/media';
import { route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return route(async () => {
    const viewer = await requireStaff();
    const kind = new URL(req.url).searchParams.get('kind') as 'image' | 'audio' | 'video' | null;
    return { assets: await media.listAssets(getDb(), viewer.workspace.id, kind ?? undefined) };
  });
}

/**
 * Upload de mídia existente (multipart, campo "file"). Tipo detectado por
 * assinatura de bytes, limite por tipo, hash sha256 e gravação no storage.
 * Nunca aceita HTML/SVG/scripts.
 */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireEditor();
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES.video + 1024 * 1024) throw new DomainError('VALIDATION', 'Arquivo acima do limite de 300 MB');
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DomainError('VALIDATION', 'Envie um arquivo no campo "file"');
    const transcript = typeof form?.get('transcript') === 'string' ? String(form!.get('transcript')).slice(0, 20000) : undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffMime(bytes.subarray(0, 32));
    const allowed = mime ? ALLOWED_MEDIA[mime] : undefined;
    if (!mime || !allowed) throw new DomainError('VALIDATION', 'Formato não suportado. Use PNG, JPEG, WebP, MP3, WAV, OGG, MP4 ou WebM.');
    if (bytes.byteLength > MAX_UPLOAD_BYTES[allowed.kind]) throw new DomainError('VALIDATION', `Arquivo acima do limite de ${Math.round(MAX_UPLOAD_BYTES[allowed.kind] / 1024 / 1024)} MB para ${allowed.kind}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storage = await getStorage();
    const key = `${viewer.workspace.id}/${allowed.kind}/${sha256.slice(0, 2)}/${sha256}.${allowed.ext}`;
    await storage.putObject(key, bytes, mime);
    const asset = await media.createAsset(getDb(), {
      workspaceId: viewer.workspace.id,
      kind: allowed.kind,
      source: 'upload',
      mimeType: mime,
      sizeBytes: bytes.byteLength,
      storageProvider: storage.provider,
      storageKey: key,
      originalName: file.name.slice(0, 200),
      sha256,
      transcript,
      createdBy: viewer.user.id,
    });
    return { asset: { id: asset.id, kind: asset.kind, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, originalName: asset.originalName, url: `/api/assets/${asset.id}` } };
  });
}

import { Readable } from 'node:stream';
import { getDb, media, identity } from '@lms/db';
import { getStorage } from '@lms/media';
import { handleError } from '@/server/http';
import { HttpError, requireViewer } from '@/server/viewer';

export const runtime = 'nodejs';

/**
 * Entrega de mídia com suporte a Range (seek de vídeo/áudio); sem Range, o
 * arquivo inteiro (é assim que `<track>` busca legendas .vtt). Qualquer
 * membro autenticado do workspace do asset pode ler (alunos precisam ver as
 * cenas); o arquivo nunca é servido por URL pública sem sessão.
 */
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  try {
    const viewer = await requireViewer();
    const { assetId } = await ctx.params;
    const asset = await media.getAsset(getDb(), assetId);
    if (!asset || asset.workspaceId !== viewer.workspace.id) throw new HttpError(404, 'Mídia não encontrada');
    // Legendas (WebVTT) são texto pequeno que o aluno precisa ler junto do vídeo; outros documentos só para a equipe.
    const isCaptions = /^text\/vtt\b/i.test(asset.mimeType);
    if (asset.kind === 'document' && !isCaptions && !identity.isStaff(viewer.role)) throw new HttpError(404, 'Mídia não encontrada');
    const storage = await getStorage();
    if (storage.provider !== asset.storageProvider) throw new HttpError(500, 'Storage do asset indisponível neste ambiente');
    const info = await storage.head(asset.storageKey);
    if (!info) throw new HttpError(404, 'Arquivo não encontrado no storage');
    const size = info.sizeBytes;
    const headers = new Headers({
      'content-type': isCaptions ? 'text/vtt; charset=utf-8' : asset.mimeType,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-disposition': `inline; filename="${asset.id}"`,
    });
    const rangeHeader = req.headers.get('range');
    const m = rangeHeader && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (m) {
      let start = m[1] ? Number(m[1]) : NaN;
      let end = m[2] ? Number(m[2]) : size - 1;
      if (Number.isNaN(start)) {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      }
      if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      end = Math.min(end, size - 1);
      headers.set('content-range', `bytes ${start}-${end}/${size}`);
      headers.set('content-length', String(end - start + 1));
      const stream = Readable.toWeb(storage.getStream(asset.storageKey, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }
    headers.set('content-length', String(size));
    const stream = Readable.toWeb(storage.getStream(asset.storageKey)) as ReadableStream;
    return new Response(stream, { status: 200, headers });
  } catch (e) {
    return handleError(e);
  }
}

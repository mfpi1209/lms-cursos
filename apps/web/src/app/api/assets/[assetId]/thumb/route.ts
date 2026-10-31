import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getDb, media } from '@lms/db';
import { getStorage } from '@lms/media';
import { handleError } from '@/server/http';
import { HttpError, requireViewer } from '@/server/viewer';

export const runtime = 'nodejs';

/** Quadro do vídeo em `at` (fração da duração), com 2 casas: cada posição vira um arquivo em cache. */
function parseAt(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.4;
  return Math.round(Math.min(0.95, Math.max(0, n)) * 100) / 100;
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + String(d)).slice(-2000)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}: ${err.slice(-300)}`))));
  });
}

/**
 * Miniatura (JPEG 640 px) de um vídeo do workspace, para as capas e os
 * "capítulos" da área do aluno. Gerada na primeira vez com ffmpeg (sem custo,
 * nenhum provedor) e guardada no storage ao lado do vídeo; as próximas leem do
 * cache. Mesmas regras de acesso da mídia: só membros do workspace do asset.
 */
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  try {
    const viewer = await requireViewer();
    const { assetId } = await ctx.params;
    const asset = await media.getAsset(getDb(), assetId);
    if (!asset || asset.workspaceId !== viewer.workspace.id || asset.kind !== 'video') throw new HttpError(404, 'Vídeo não encontrado');
    const storage = await getStorage();
    if (storage.provider !== asset.storageProvider) throw new HttpError(500, 'Storage do asset indisponível neste ambiente');
    const at = parseAt(new URL(req.url).searchParams.get('at'));
    const key = `${asset.storageKey.replace(/\.[a-z0-9]+$/i, '')}.thumb-${Math.round(at * 100)}.jpg`;
    const headers = { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' };

    if (await storage.head(key)) return new Response(Readable.toWeb(storage.getStream(key)) as ReadableStream, { headers });

    const dir = await mkdtemp(path.join(tmpdir(), 'lms-thumb-'));
    try {
      const src = path.join(dir, 'in.mp4');
      const out = path.join(dir, 'out.jpg');
      await pipeline(storage.getStream(asset.storageKey), createWriteStream(src));
      const seconds = Math.max(0, (asset.durationSeconds ?? 0) * at);
      await ffmpeg(['-v', 'error', '-ss', seconds.toFixed(2), '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', '-y', out]);
      const bytes = new Uint8Array(await readFile(out));
      await storage.putObject(key, bytes, 'image/jpeg');
      return new Response(bytes, { headers });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (e) {
    return handleError(e);
  }
}

import { DomainError, getDb, media } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { publicJob } from '@/server/media';
import { BUMPER_PROVIDER, BUMPER_RENDERER_VERSION, BumperRequestSchema, bumperJobFromRequest, publicBumper } from '@/server/bumper';
import { getBrand } from '@/config/brand';
import { getMediaConfig } from '@/server/media';

/** Vinhetas do workspace (assets com `metadata.bumper`), a padrão de cada proporção e os jobs recentes. */
export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    const db = getDb();
    const [assets, jobs] = await Promise.all([media.listBumperAssets(db, viewer.workspace.id), media.listBumperJobs(db, viewer.workspace.id, 10)]);
    const bumpers = assets.map(publicBumper).filter((b): b is NonNullable<typeof b> => !!b);
    const brand = getBrand(viewer.workspace.id);
    const cfg = getMediaConfig();
    return {
      bumpers,
      defaults: { '16:9': bumpers.find((b) => b.default && b.aspect === '16:9')?.id ?? null, '9:16': bumpers.find((b) => b.default && b.aspect === '9:16')?.id ?? null },
      jobs: jobs.map(publicJob),
      /** valores iniciais do construtor (preset de marca do workspace) e a marca */
      builder: { ...brand.bumperDefaults, brandName: brand.name, logoLight: brand.logoLight ?? null, logoDark: brand.logoDark ?? null },
      /** som por IA (pago): só com ALLOW_PAID_PROVIDERS=1 e chave do ElevenLabs */
      aiSound: { available: cfg.paidAllowed && !!cfg.elevenLabsApiKey, simulation: cfg.simulation },
    };
  });
}

/**
 * Gera a vinheta (GRATUITO: render local no worker, nenhum provedor, custo 0 —
 * roda também em modo de demonstração). Cria um job `media_jobs` com
 * `input.kind = 'bumper'`; vinheta igual já guardada é reaproveitada pelo worker.
 * Áudio de arquivo precisa ser um áudio do workspace.
 */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireEditor();
    const body = await parseBody(req, BumperRequestSchema);
    const db = getDb();
    if (body.audio.kind === 'file') {
      const a = await media.getAsset(db, body.audio.assetId);
      if (!a || a.workspaceId !== viewer.workspace.id || a.kind !== 'audio') throw new DomainError('VALIDATION', 'Áudio da vinheta inválido: envie um arquivo de áudio deste workspace');
    }
    const j = bumperJobFromRequest(body, viewer.workspace.id);
    const open = await media.findOpenJobForNode(db, j.courseId, j.lessonId, j.nodeId);
    if (open) return { job: publicJob(open), existing: true };
    const job = await media.createJob(db, {
      workspaceId: viewer.workspace.id, courseId: j.courseId, lessonId: j.lessonId, nodeId: j.nodeId, kind: 'video', provider: BUMPER_PROVIDER, adapterVersion: BUMPER_RENDERER_VERSION,
      sceneHash: j.sceneHash, input: j.input as unknown as Record<string, unknown>, createdBy: viewer.user.id, simulated: false, costEstimatedUsd: 0,
    });
    return { job: publicJob(job), existing: false };
  });
}

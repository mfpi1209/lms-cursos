import { z } from 'zod';
import { getDb, authoring, media, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { getMediaConfig, publicJob, recomposeAlphaKey, recomposeJobInput, resolveSceneProduction, reusedMediaFor } from '@/server/media';
import { mediaBudgetCheck } from '@/server/spend';
import { BackdropFrameSchema, PRESENTER_GRADES } from '@lms/course-schema';

const CreateSchema = z.object({
  lessonId: z.string().min(1).max(64),
  nodeId: z.string().min(1).max(64),
  avatarId: z.string().min(1).max(120),
  voiceProvider: z.enum(['heygen', 'elevenlabs']),
  voiceId: z.string().max(120).nullable().default(null),
  /** roteiro; se omitido, usa o texto do bloco */
  script: z.string().max(5000).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  /** imagem de fundo (asset do workspace); tem precedência sobre a cor */
  backgroundAssetId: z.string().max(64).optional(),
  /** cenário: faixa do balcão por cima da apresentadora, enquadramento e desfoque (só com imagem; ausentes = os da apresentação quando a imagem é a dela) */
  foregroundFrom: z.number().min(0.5).max(1).optional(),
  backgroundFrame: BackdropFrameSchema.optional(),
  backgroundBlur: z.boolean().optional(),
  /** harmonização de cor da apresentadora (montagem nossa) */
  presenterGrade: z.enum(PRESENTER_GRADES).optional(),
  /**
   * "Trocar o fundo sem gerar de novo": remonta, só com ffmpeg local, o vídeo
   * transparente já pago desta fala (nenhum provedor; custo 0). Não é ação paga.
   */
  recompose: z.boolean().default(false),
  /** confirmação explícita de ação paga (obrigatória fora da remontagem) */
  confirmPaid: z.literal(true).optional(),
}).superRefine((b, ctx) => {
  if (!b.recompose && b.confirmPaid !== true) ctx.addIssue({ code: 'custom', path: ['confirmPaid'], message: 'Confirme a ação paga (confirmPaid: true)' });
});

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const url = new URL(req.url);
    const lessonId = url.searchParams.get('lessonId');
    const nodeId = url.searchParams.get('nodeId');
    let jobs = await media.listJobsForCourse(getDb(), courseId);
    if (lessonId) jobs = jobs.filter((j) => j.lessonId === lessonId);
    if (nodeId) jobs = jobs.filter((j) => j.nodeId === nodeId);
    return { jobs: jobs.map(publicJob) };
  });
}

/**
 * Ação explícita e paga: gerar vídeo de avatar para UMA cena. Reaproveita a
 * saída se já existe job bem-sucedido com o mesmo hash (roteiro + avatar + voz +
 * parâmetros + versão do adapter); senão enfileira um job com custo estimado,
 * dentro do teto diário do workspace (402 quando ultrapassaria). Para várias
 * cenas, use /media-jobs/quote + /media-jobs/batch.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, CreateSchema);
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    if (body.backgroundAssetId) {
      const bg = await media.getAsset(db, body.backgroundAssetId);
      if (!bg || bg.workspaceId !== viewer.workspace.id || bg.kind !== 'image') throw new DomainError('VALIDATION', 'Imagem de fundo inválida');
    }
    const cfg = getMediaConfig();
    const scene = resolveSceneProduction(draft.document, body, cfg);
    const estimate = scene.estimate;

    // a fila absorve o excesso (o worker inicia poucos por vez); só um limite de sanidade para cliques acidentais
    const maxQueued = Number(process.env.MEDIA_MAX_QUEUED_PER_COURSE ?? 200);
    const openCount = (await media.listJobsForCourse(db, courseId)).filter((j) => j.status === 'queued' || j.status === 'running').length;
    if (openCount >= maxQueued) throw new DomainError('CONFLICT', `A fila deste curso já tem ${openCount} vídeos (limite ${maxQueued}).`, { openCount, maxQueued });
    const open = await media.findOpenJobForNode(db, courseId, body.lessonId, body.nodeId);
    if (open) throw new DomainError('CONFLICT', 'Já existe um job em andamento para este bloco', { jobId: open.id });

    if (body.recompose) {
      // remontagem sem custo: exige o vídeo transparente já pago desta fala (mesma alphaKey) no workspace
      const alphaKey = recomposeAlphaKey(scene);
      if (!alphaKey) throw new DomainError('VALIDATION', 'Só dá para trocar o fundo sem gerar de novo em cenas de plano único com a apresentadora à direita ou à esquerda');
      const source = await media.findRecomposeSourceByAlphaKey(db, { workspaceId: viewer.workspace.id, alphaKey });
      if (!source) throw new DomainError('VALIDATION', 'Esta fala ainda não tem um vídeo transparente pago para remontar; gere o vídeo primeiro');
      // idempotente: o mesmo fundo/posição já montado (job REAL com o mesmo hash) é só anexado
      const done = await media.findSucceededJobByHash(db, { workspaceId: viewer.workspace.id, sceneHash: scene.sceneHash, provider: 'heygen', simulated: false });
      if (done && done.outputAssetId) {
        await authoring.setNodeMedia(db, { courseId, lessonId: body.lessonId, nodeId: body.nodeId, userId: viewer.user.id, note: 'Mídia reaproveitada (mesmo hash de cena)', media: reusedMediaFor(done, scene.sceneHash, scene.script) });
        return { reused: true, recompose: true, job: publicJob(done), estimate: { ...estimate, estimatedUsd: 0 }, budget: null };
      }
      const job = await media.createJob(db, {
        workspaceId: viewer.workspace.id, courseId, lessonId: body.lessonId, nodeId: body.nodeId, kind: 'video', provider: 'heygen', adapterVersion: scene.adapterVersion, sceneHash: scene.sceneHash,
        input: recomposeJobInput(scene, source, alphaKey), createdBy: viewer.user.id, simulated: false, costEstimatedUsd: 0,
        approvedBy: viewer.user.id, approvedAt: new Date(),
      });
      return { reused: false, recompose: true, sourceJobId: source.id, job: publicJob(job), estimate: { ...estimate, estimatedUsd: 0 }, budget: null };
    }

    // só no mesmo workspace e no mesmo modo: saída simulada nunca vale como vídeo real (e vice-versa)
    const reusable = await media.findSucceededJobByHash(db, { workspaceId: viewer.workspace.id, sceneHash: scene.sceneHash, provider: 'heygen', simulated: cfg.simulation });
    if (reusable && reusable.outputAssetId) {
      await authoring.setNodeMedia(db, { courseId, lessonId: body.lessonId, nodeId: body.nodeId, userId: viewer.user.id, note: 'Mídia reaproveitada (mesmo hash de cena)', media: reusedMediaFor(reusable, scene.sceneHash, scene.script) });
      return { reused: true, job: publicJob(reusable), estimate, budget: null };
    }

    // teto diário do workspace (só gasto real; simulação nunca é cobrada)
    const budget = cfg.simulation ? null : media.assertWithinBudget(await mediaBudgetCheck(viewer.workspace.id, estimate.estimatedUsd));
    const job = await media.createJob(db, {
      workspaceId: viewer.workspace.id, courseId, lessonId: body.lessonId, nodeId: body.nodeId, kind: 'video', provider: 'heygen', adapterVersion: scene.adapterVersion, sceneHash: scene.sceneHash,
      input: scene.jobInput, createdBy: viewer.user.id, simulated: cfg.simulation, costEstimatedUsd: cfg.simulation ? 0 : estimate.estimatedUsd,
      approvedBy: viewer.user.id, approvedAt: new Date(),
    });
    return { reused: false, job: publicJob(job), estimate, budget };
  });
}

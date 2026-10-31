import { getDb, authoring, media, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { publicJob } from '@/server/media';
import { ADJUST_PROVIDER, ADJUST_VERSION, AdjustRequestSchema, reactionAdjustJob, sceneAdjustContext, sceneAdjustJob, sceneSourceJobId } from '@/server/adjust';

/**
 * Ajuste fino SEM REGRAVAR (grátis): o que dá para ajustar na cena agora — planos com o texto que o aluno
 * ouve, se cada um pode sair ou perder a primeira/última frase, e o cartão "Pergunta a seguir" atual.
 */
export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const url = new URL(req.url);
    const lessonId = url.searchParams.get('lessonId') ?? '';
    const nodeId = url.searchParams.get('nodeId') ?? '';
    if (!lessonId || !nodeId) throw new DomainError('VALIDATION', 'Informe lessonId e nodeId');
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const src = sceneSourceJobId(draft.document, lessonId, nodeId);
    if ('reason' in src) return { available: false, reason: src.reason };
    const job = await media.getJob(db, src.jobId);
    if (!job || job.courseId !== courseId) return { available: false, reason: 'O job que gerou este vídeo não foi encontrado' };
    const c = sceneAdjustContext(draft.document, lessonId, nodeId, job);
    if ('reason' in c) return { available: false, reason: c.reason };
    return { available: true, sourceJobId: job.id, shots: c.options, teaser: c.teaser, state: c.current };
  });
}

/**
 * Pede o ajuste (GRATUITO: remontagem local no worker com os clipes já pagos; nenhum provedor, custo 0 —
 * roda também em modo de demonstração). Cena: `{ target: 'scene', drop, cut, teaser }`; reação:
 * `{ target: 'reaction', choiceId, optionId }` (começa direto no conteúdo). O andamento sai em
 * GET /media-jobs?lessonId&nodeId (nó da reação = "decisão~opção").
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, AdjustRequestSchema);
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    let built: ReturnType<typeof reactionAdjustJob>;
    if (body.target === 'scene') {
      const src = sceneSourceJobId(draft.document, body.lessonId, body.nodeId);
      if ('reason' in src) throw new DomainError('VALIDATION', src.reason);
      const job = await media.getJob(db, src.jobId);
      if (!job || job.courseId !== courseId) throw new DomainError('VALIDATION', 'O job que gerou este vídeo não foi encontrado');
      built = sceneAdjustJob(body, draft.document, job);
    } else {
      built = reactionAdjustJob(body, draft.document);
    }
    if ('error' in built) throw new DomainError('VALIDATION', built.error);
    const open = await media.findOpenJobForNode(db, courseId, body.lessonId, built.nodeId);
    if (open) throw new DomainError('CONFLICT', 'Já existe um vídeo em andamento para este bloco; espere terminar', { jobId: open.id });
    const job = await media.createJob(db, {
      workspaceId: viewer.workspace.id, courseId, lessonId: body.lessonId, nodeId: built.nodeId, kind: 'video', provider: ADJUST_PROVIDER, adapterVersion: ADJUST_VERSION,
      sceneHash: built.sceneHash, input: built.input as unknown as Record<string, unknown>, createdBy: viewer.user.id, simulated: false, costEstimatedUsd: 0,
    });
    return { job: publicJob(job) };
  });
}

import { z } from 'zod';
import { DomainError, authoring, getDb, reviewMarks } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { draftLessonContexts } from '@/server/video-review';
import { lessonMarkViews, loadReviewSpecs, markView } from '@/server/video-review-fix';
import { REVIEW_CATEGORIES, resolveMark } from '@/lib/video-review/resolve';

export const runtime = 'nodejs';

/**
 * Marcas da revisão "Assistir e marcar" de uma aula. `GET ?lessonId=` lista as marcas com o "Isso cai em" (recalculado
 * sobre o rascunho se a cena ainda tem o mesmo vídeo; senão o retrato salvo, `stale`). `POST` cria a marca no instante
 * do vídeo da cena: o servidor fixa o vídeo assistido (asset + hash), a revisão do rascunho e o retrato da resolução.
 */
export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const lessonId = new URL(req.url).searchParams.get('lessonId') ?? '';
    if (!lessonId) throw new DomainError('VALIDATION', 'Informe a aula em "lessonId".');
    const { marks } = await lessonMarkViews(viewer.workspace.id, courseId, lessonId);
    return { marks };
  });
}

const CreateSchema = z.object({
  lessonId: z.string().min(1).max(64),
  nodeId: z.string().min(1).max(64),
  /** vídeo que estava tocando (confere com o rascunho) */
  assetId: z.string().min(1).max(64),
  sceneTimeSec: z.number().min(0).max(36000),
  playerDurationSec: z.number().positive().max(36000).optional(),
  category: z.enum(REVIEW_CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  note: z.string().max(1000).default(''),
  expected: z.string().max(1000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, CreateSchema);
    const loaded = await draftLessonContexts(viewer.workspace.id, courseId, body.lessonId);
    const scene = loaded?.scenes.find((s) => s.nodeId === body.nodeId);
    if (!loaded || !scene) throw new DomainError('NOT_FOUND', 'Cena com vídeo não encontrada nesta aula');
    if (scene.assetId !== body.assetId) throw new DomainError('CONFLICT', 'O vídeo desta cena mudou desde que a página abriu. Recarregue para marcar no vídeo novo.');
    const resolution = resolveMark(scene, body.sceneTimeSec, body.playerDurationSec);
    const mark = await reviewMarks.createMark(getDb(), {
      workspaceId: viewer.workspace.id,
      courseId,
      actorId: viewer.user.id,
      lessonId: body.lessonId,
      nodeId: body.nodeId,
      sceneTimeSec: body.sceneTimeSec,
      draftRevision: loaded.revision,
      sceneAssetId: scene.assetId,
      sceneHash: scene.sceneHash,
      category: body.category as never,
      note: body.note,
      expected: body.expected ?? null,
      resolution: { ...resolution, ...(body.playerDurationSec ? { playerDurationSec: body.playerDurationSec } : {}) } as unknown as Record<string, unknown>,
    });
    const draft = await authoring.getDraft(getDb(), courseId);
    return { mark: markView({ id: courseId, title: draft!.document.title }, mark, loaded.scenes, loadReviewSpecs(draft!.document)) };
  });
}

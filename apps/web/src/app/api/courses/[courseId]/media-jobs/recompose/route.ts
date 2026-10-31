import { getDb, authoring, media, DomainError } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { getMediaConfig, recomposeAlphaKey, resolveSceneProduction, sceneRequestFromPresentation } from '@/server/media';

/**
 * "Trocar o fundo sem gerar de novo" está disponível para a cena? Resolve a cena
 * com a apresentação ATUAL e procura o vídeo transparente já pago da mesma fala
 * (mesma alphaKey) no workspace. `upToDate` = a mídia anexada já é deste
 * fundo/posição (nada a remontar). Nada é criado aqui.
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
    const doc = draft.document;
    if (!doc.presentation.avatarId) return { available: false, reason: 'Sem apresentador' };
    let scene: ReturnType<typeof resolveSceneProduction>;
    try {
      scene = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lessonId, nodeId), getMediaConfig());
    } catch (e) {
      if (e instanceof DomainError) return { available: false, reason: e.message };
      throw e;
    }
    const alphaKey = recomposeAlphaKey(scene);
    if (!alphaKey) return { available: false, reason: 'Só cenas de plano único com a apresentadora à direita ou à esquerda' };
    const source = await media.findRecomposeSourceByAlphaKey(db, { workspaceId: viewer.workspace.id, alphaKey });
    if (!source) return { available: false, reason: 'Esta fala ainda não tem vídeo transparente pago' };
    const node = findLesson(doc, lessonId)?.lesson.graph.nodes.find((n) => n.id === nodeId) as { media?: { generatedFrom?: { sceneHash?: string }; stale?: boolean } } | undefined;
    const upToDate = node?.media?.generatedFrom?.sceneHash === scene.sceneHash && !node?.media?.stale;
    return { available: !upToDate, upToDate, sourceJobId: source.id, sceneHash: scene.sceneHash };
  });
}

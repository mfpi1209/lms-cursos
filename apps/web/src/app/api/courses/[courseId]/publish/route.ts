import { z } from 'zod';
import { getDb, publishing, authoring, identity } from '@lms/db';
import { WIZARD_STEPS } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { HttpError, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { getMediaConfig } from '@/server/media';

const Schema = z.object({
  /** revisão validada pelo cliente: OBRIGATÓRIA (auditoria P2) — publicar sem saber o que se publica dá 422 */
  expectedRevision: z.number().int().min(1),
  /** "Publicar mesmo assim (vídeos de demonstração)": aceite explícito de vídeo simulado fora do modo de demonstração */
  allowSimulatedMedia: z.boolean().default(false),
});

/**
 * Publicação explícita: cria snapshot imutável. Erros de compilação -> 422 com issues.
 * Vídeo simulado bloqueia (422, `reason: 'simulated_media'`) a não ser em modo de
 * demonstração ou com `allowSimulatedMedia`. Na primeira publicação, grava no
 * rascunho `wizard.finished` (montagem concluída) com todos os passos marcados;
 * o cliente recarrega o rascunho depois de publicar.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    if (!identity.canPublish(viewer.role)) throw new HttpError(403, 'Seu papel não permite publicar');
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const { expectedRevision, allowSimulatedMedia } = await parseBody(req, Schema);
    const db = getDb();
    // em modo de demonstração o vídeo simulado é o esperado do ambiente; fora dele só com aceite do autor
    const demo = getMediaConfig().simulation;
    const result = await publishing.publishCourse(db, { courseId, userId: viewer.user.id, expectedRevision, allowSimulatedMedia: demo || allowSimulatedMedia });
    const draft = await authoring.getDraft(db, courseId);
    let draftRevision = draft?.revision ?? null;
    if (draft && !draft.document.wizard.finished) {
      try {
        const saved = await authoring.saveDraft(db, {
          courseId,
          userId: viewer.user.id,
          expectedRevision: draft.revision,
          origin: 'publish',
          note: `Montagem concluída: versão ${result.versionNumber} publicada`,
          document: { ...draft.document, wizard: { ...draft.document.wizard, finished: true, step: 'revisao', completedSteps: [...WIZARD_STEPS] } },
        });
        draftRevision = saved.revision;
      } catch {
        /* conflito de revisão (outra gravação no meio): a versão já foi publicada; o cliente marca localmente */
      }
    }
    return { ...result, draftRevision, demo };
  });
}

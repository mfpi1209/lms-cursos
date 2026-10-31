import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { allLessons } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';
import { partitionLessonsForGeneration } from './partition';

const Schema = z
  .object({
    lessonIds: z.array(z.string().max(64)).max(40).optional(),
    instruction: z.string().max(2000).optional(),
    /** só aulas ainda sem cenas (as com cenas escritas ficam de fora e são relatadas em `skipped`) */
    onlyEmpty: z.boolean().optional(),
  })
  .default({});

/**
 * Enfileira a geração de aulas (uma execução por aula). Aulas com execução
 * aberta são puladas, não param o lote; a resposta diz quais ficaram de fora.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = req.headers.get('content-type')?.includes('json') ? await parseBody(req, Schema) : {};
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const lessons = allLessons(draft.document).filter((l) => !body.lessonIds || body.lessonIds.includes(l.id));
    if (lessons.length === 0) throw new DomainError('VALIDATION', 'Nenhuma aula para gerar. Defina a estrutura primeiro.');
    const open = await agent.openRunsByLesson(getDb(), courseId);
    const { toRun, skipped } = partitionLessonsForGeneration(lessons, open, { onlyEmpty: body.onlyEmpty });
    const runs: Array<{ id: string; lessonId: string }> = [];
    for (const l of toRun) {
      try {
        const run = await enqueueRun(viewer, { courseId, task: 'lesson', lessonId: l.id, instruction: body.instruction });
        runs.push({ id: run.id, lessonId: l.id });
      } catch (e) {
        // corrida: outra execução entrou entre a consulta e o enfileiramento; pula sem derrubar o lote
        if (e instanceof DomainError && e.code === 'CONFLICT') skipped.push({ lessonId: l.id, title: l.title, reason: 'open_run', runId: (e.details as { runId?: string } | undefined)?.runId });
        else throw e;
      }
    }
    if (runs.length === 0 && skipped.length) throw new DomainError('CONFLICT', skipped.every((x) => x.reason === 'open_run') ? 'Todas as aulas pedidas já têm uma geração em andamento.' : 'Nenhuma aula vazia para gerar; as aulas pedidas já têm cenas.', { skipped });
    return { runs, skipped };
  });
}

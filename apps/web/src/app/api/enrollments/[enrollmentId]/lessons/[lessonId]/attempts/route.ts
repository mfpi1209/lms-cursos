import { z } from 'zod';
import { getDb, learning } from '@lms/db';
import { computeProgress } from '@lms/course-engine';
import { findLesson } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';

/** `forceNew` + `abandonOpen`: "Recomeçar aula" no meio (a tentativa aberta fica como abandonada). */
const Schema = z.object({ forceNew: z.boolean().optional(), abandonOpen: z.boolean().optional() }).default({});

/** Inicia ou retoma a tentativa da aula para a matrícula do próprio aluno. */
export async function POST(req: Request, ctx: { params: Promise<{ enrollmentId: string; lessonId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId, lessonId } = await ctx.params;
    const enr = await requireOwnEnrollment(viewer, enrollmentId);
    const body = req.headers.get('content-length') === '0' || !req.headers.get('content-type') ? {} : await parseBody(req, Schema);
    const { attempt, created } = await learning.startOrResumeAttempt(getDb(), { enrollmentId, lessonId, forceNew: body.forceNew, abandonOpen: body.abandonOpen });
    const lesson = findLesson(enr.document, lessonId)!.lesson;
    return { attempt: { id: attempt.id, revision: attempt.revision, status: attempt.status, attemptNumber: attempt.attemptNumber, state: attempt.state }, created, progress: computeProgress(lesson.graph, attempt.state) };
  });
}

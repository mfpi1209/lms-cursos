/**
 * Passo de banco da migração de matrícula para uma versão nova (usado por publicar-e-matricular.ts e testado em
 * test/matricula-migracao-db.test.ts). As regras puras ficam em matricula-migracao.ts.
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { newId } from '../ids';
import * as s from '../schema';
import { attemptsToClose, onlyRemovals, planAppend, removedNodes } from './matricula-migracao';

export interface MoveResult {
  appended: boolean;
  closedAttemptIds: string[];
  keptOpenAttempts: number;
  /** a matrícula estava concluída e continua (a aula nova é conteúdo novo, não obrigatória) */
  keptCompleted: boolean;
  /** aulas que ficaram como conteúdo novo opcional nesta matrícula */
  optionalLessonIds: string[];
  /** aulas novas que passaram a ser obrigatórias (matrícula em andamento) */
  newRequired: string[];
  removedNodes: number;
}

/**
 * Move UMA matrícula para a versão nova quando só saíram cenas e/ou só entraram aulas no fim.
 *  - a tentativa em andamento é encerrada SOMENTE se o aluno ESTÁ numa cena que saiu; quem só passou por ela continua;
 *  - quem já CONCLUIU o curso continua concluído (status, data, versão de conclusão, % e selos): a aula nova entra em
 *    `optionalLessonIds` ("conteúdo novo", jogável, sem reabrir nada);
 *  - quem está em andamento passa a ter a aula nova como obrigatória (`courseIsComplete` já conta com ela);
 *  - tudo numa transação por matrícula. `dryRun`: só calcula.
 */
export async function moveEnrollmentToVersion(
  db: Database,
  enrollment: { id: string; status: 'active' | 'completed' | 'canceled' },
  oldDoc: unknown,
  newest: { id: string; versionNumber: number; document: unknown },
  opts: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<MoveResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const tag = opts.dryRun ? '[dry-run] ' : '';
  const appended = !onlyRemovals(oldDoc, newest.document);
  const gone = removedNodes(oldDoc, newest.document);
  const open = await db
    .select({ id: s.lessonAttempts.id, lessonId: s.lessonAttempts.lessonId, state: s.lessonAttempts.state, revision: s.lessonAttempts.revision })
    .from(s.lessonAttempts)
    .where(and(eq(s.lessonAttempts.enrollmentId, enrollment.id), eq(s.lessonAttempts.status, 'in_progress')));
  const close = attemptsToClose(open, gone);
  const keep = open.length - close.length;
  for (const a of close) log(`  ${tag}tentativa ${a.id} (${a.lessonId}) ${opts.dryRun ? 'seria encerrada' : 'encerrada'}: o aluno está numa cena que saiu`);
  if (keep) log(`  ${tag}${keep} tentativa(s) em andamento continuam (não estão numa cena removida)`);

  let optionalLessonIds: string[] = [];
  let keptCompleted = false;
  let newRequired: string[] = [];
  let writeOptional: string[] | undefined;
  if (appended) {
    const done = await db.select({ lessonId: s.lessonAttempts.lessonId }).from(s.lessonAttempts).where(and(eq(s.lessonAttempts.enrollmentId, enrollment.id), eq(s.lessonAttempts.status, 'completed')));
    const [row] = await db.select({ optional: s.enrollments.optionalLessonIds, status: s.enrollments.status }).from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    const plan = planAppend({ status: row?.status ?? enrollment.status, oldDoc, newDoc: newest.document, doneLessonIds: done.map((d) => d.lessonId), optionalLessonIds: row?.optional ?? [] });
    optionalLessonIds = plan.optionalLessonIds;
    keptCompleted = plan.keepCompleted;
    newRequired = plan.required;
    if (plan.keepCompleted) {
      writeOptional = plan.optionalLessonIds;
      log(`  ${tag}matrícula ${enrollment.id} continua concluída; aula(s) nova(s) como conteúdo novo: ${plan.optionalLessonIds.join(', ')}`);
    } else if (plan.required.length) log(`  ${tag}matrícula ${enrollment.id} em andamento: aula(s) nova(s) obrigatória(s): ${plan.required.join(', ')}`);
  }

  if (!opts.dryRun) {
    await db.transaction(async (tx) => {
      for (const a of close) {
        await tx.update(s.lessonAttempts).set({ status: 'abandoned', updatedAt: new Date() }).where(eq(s.lessonAttempts.id, a.id));
        await tx.insert(s.learnerEvents).values({ id: newId('evt'), attemptId: a.id, eventId: newId('rst'), type: 'attempt_abandoned', nodeId: (a.state as { currentNodeId: string }).currentNodeId, payload: { reason: 'scene_removed' }, result: {}, resultingRevision: a.revision });
      }
      await tx.update(s.enrollments).set({ courseVersionId: newest.id, ...(writeOptional ? { optionalLessonIds: writeOptional } : {}) }).where(eq(s.enrollments.id, enrollment.id));
    });
  }
  log(`${tag}matrícula ${enrollment.id} → versão ${newest.versionNumber} (${appended ? 'aulas novas no fim' : 'só saíram cenas'}${gone.size ? `; cenas removidas: ${gone.size}` : ''})`);
  return { appended, closedAttemptIds: close.map((a) => a.id), keptOpenAttempts: keep, keptCompleted, optionalLessonIds, newRequired, removedNodes: gone.size };
}

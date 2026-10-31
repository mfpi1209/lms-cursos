import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { allLessons, findLesson, migrateCourseDocument, scalarType, variableScope, type AnyNode, type CourseDocument, type LessonGraph, type Scalar } from '@lms/course-schema';
import {
  applyIntent,
  carriedForGraph,
  computeProgress,
  createInitialState,
  EngineError,
  navigateBack,
  summarizeObjectives,
  type NavigationTarget,
  type AttemptState,
  type CourseAnswer,
  type Intent,
  type StepResult,
} from '@lms/course-engine';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { getLatestVersion } from './publishing';

export async function enrollStudent(db: Database, input: { courseId: string; userId: string; createdBy: string }) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, input.courseId), eq(s.enrollments.userId, input.userId))).limit(1);
    if (existing) return { enrollment: existing, created: false };
    const version = await getLatestVersion(tx, input.courseId);
    if (!version) throw new DomainError('VALIDATION', 'O curso precisa estar publicado antes de matricular alunos');
    const id = newId('enr');
    const [enrollment] = await tx
      .insert(s.enrollments)
      .values({ id, courseId: input.courseId, courseVersionId: version.id, userId: input.userId, createdBy: input.createdBy })
      .onConflictDoNothing({ target: [s.enrollments.courseId, s.enrollments.userId] })
      .returning();
    if (!enrollment) {
      const [again] = await tx.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, input.courseId), eq(s.enrollments.userId, input.userId))).limit(1);
      return { enrollment: again!, created: false };
    }
    await tx.insert(s.auditLogs).values({ id: newId('aud'), actorId: input.createdBy, action: 'enrollment.create', entityType: 'enrollment', entityId: id, data: { courseId: input.courseId, userId: input.userId, versionId: version.id } });
    await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'enrollment.created', version: 1, payload: { enrollmentId: id, courseId: input.courseId, userId: input.userId, versionId: version.id } });
    return { enrollment: enrollment!, created: true };
  });
}

export async function listEnrollmentsForUser(db: DbOrTx, userId: string) {
  return db
    .select({
      id: s.enrollments.id,
      status: s.enrollments.status,
      createdAt: s.enrollments.createdAt,
      completedAt: s.enrollments.completedAt,
      courseId: s.courses.id,
      courseTitle: s.courses.title,
      versionNumber: s.courseVersions.versionNumber,
      versionId: s.courseVersions.id,
    })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .innerJoin(s.courseVersions, eq(s.courseVersions.id, s.enrollments.courseVersionId))
    // curso arquivado sai da área do aluno (a matrícula e o histórico continuam guardados)
    .where(and(eq(s.enrollments.userId, userId), ne(s.courses.status, 'archived')))
    .orderBy(desc(s.enrollments.createdAt));
}

export async function listEnrollmentsForCourse(db: DbOrTx, courseId: string) {
  return db
    .select({
      id: s.enrollments.id,
      status: s.enrollments.status,
      createdAt: s.enrollments.createdAt,
      completedAt: s.enrollments.completedAt,
      userId: s.user.id,
      userName: s.user.name,
      userEmail: s.user.email,
      versionNumber: s.courseVersions.versionNumber,
    })
    .from(s.enrollments)
    .innerJoin(s.user, eq(s.user.id, s.enrollments.userId))
    .innerJoin(s.courseVersions, eq(s.courseVersions.id, s.enrollments.courseVersionId))
    .where(eq(s.enrollments.courseId, courseId))
    .orderBy(desc(s.enrollments.createdAt));
}

/** Matrícula com a versão fixada e documento, verificando o dono. */
export async function getEnrollmentWithVersion(db: DbOrTx, enrollmentId: string) {
  const [row] = await db
    .select({ enrollment: s.enrollments, version: s.courseVersions, course: s.courses })
    .from(s.enrollments)
    .innerJoin(s.courseVersions, eq(s.courseVersions.id, s.enrollments.courseVersionId))
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(eq(s.enrollments.id, enrollmentId))
    .limit(1);
  if (!row) return null;
  return { ...row, document: migrateCourseDocument(row.version.document) };
}

export async function listAttemptsForEnrollment(db: DbOrTx, enrollmentId: string) {
  return db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.enrollmentId, enrollmentId)).orderBy(asc(s.lessonAttempts.startedAt));
}

/** Variáveis que um grafo grava (efeitos de arestas e de consequências), por aresta/nó. */
function writersOf(graph: LessonGraph, varName: string) {
  const edges = graph.edges.filter((e) => e.effects?.some((f) => f.var === varName));
  const nodes = new Set(graph.nodes.filter((n) => n.type === 'consequence' && n.effects?.some((f) => f.var === varName)).map((n) => n.id));
  return { edges, nodes };
}

/**
 * A tentativa de fato gravou `varName`? Verdadeiro quando o caminho percorreu uma
 * aresta com efeito sobre ela (mesmo par origem→destino e, em decisões, a opção
 * respondida) ou entrou numa consequência que a altera. Uma tentativa que só
 * herdou o valor (ou ainda não chegou na pergunta) não conta.
 */
function attemptWroteVariable(graph: LessonGraph, state: AttemptState, varName: string): boolean {
  const { edges, nodes } = writersOf(graph, varName);
  if (edges.length === 0 && nodes.size === 0) return false;
  const path = state.path.map((p) => p.nodeId);
  if (path.some((id) => nodes.has(id))) return true;
  for (let i = 0; i + 1 < path.length; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;
    for (const e of edges) {
      if (e.from !== from || e.to !== to) continue;
      if (e.optionId && !(state.answers[from]?.optionIds ?? []).includes(e.optionId)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Valores das variáveis de CURSO (`scope: 'course'`) declaradas em `graph`,
 * derivados das tentativas da matrícula (nada novo é persistido):
 *  - considera tentativas de qualquer aula, exceto `abandoned`, da mais recente
 *    (`updatedAt`) para a mais antiga, cujo estado contém a variável com o tipo
 *    declarado;
 *  - prefere a mais recente que de fato GRAVOU a variável (ver
 *    `attemptWroteVariable`) — assim uma tentativa que só herdou o valor inicial
 *    (ex.: aula 2 aberta antes da aula 1, ou aula 1 refeita e parada antes da
 *    pergunta) não mascara a resposta real;
 *  - sem nenhuma que tenha gravado, usa a mais recente que a contém.
 * `excludeAttemptId` tira da conta a própria tentativa sendo (re)inicializada.
 */
export async function carriedCourseVariables(
  db: DbOrTx,
  input: { enrollmentId: string; document: CourseDocument; graph: LessonGraph; excludeAttemptId?: string },
): Promise<Record<string, Scalar>> {
  const courseVars = input.graph.variables.filter((v) => variableScope(v) === 'course');
  if (courseVars.length === 0) return {};
  const rows = await db
    .select({ id: s.lessonAttempts.id, lessonId: s.lessonAttempts.lessonId, state: s.lessonAttempts.state, updatedAt: s.lessonAttempts.updatedAt })
    .from(s.lessonAttempts)
    .where(and(eq(s.lessonAttempts.enrollmentId, input.enrollmentId), ne(s.lessonAttempts.status, 'abandoned')))
    .orderBy(desc(s.lessonAttempts.updatedAt), desc(s.lessonAttempts.attemptNumber));
  const attempts = rows.filter((r) => r.id !== input.excludeAttemptId);
  const graphs = new Map(allLessons(input.document).map((l) => [l.id, l.graph]));
  const carried: Record<string, Scalar> = {};
  for (const v of courseVars) {
    const holders = attempts.filter((a) => {
      const val = a.state.variables?.[v.name];
      return val !== undefined && val !== null && scalarType(val) === v.type;
    });
    if (holders.length === 0) continue;
    const writer = holders.find((a) => {
      const g = graphs.get(a.lessonId);
      return g ? attemptWroteVariable(g, a.state, v.name) : false;
    });
    carried[v.name] = (writer ?? holders[0]!).state.variables[v.name]!;
  }
  return carried;
}

/**
 * Retoma a tentativa em andamento da aula ou cria uma nova. Nova tentativa
 * explícita (`forceNew`) só é permitida quando a anterior está concluída.
 */
export async function startOrResumeAttempt(db: Database, input: { enrollmentId: string; lessonId: string; forceNew?: boolean; abandonOpen?: boolean }) {
  return db.transaction(async (tx) => {
    // serializa inícios concorrentes (duas abas / montagem dupla) na linha da matrícula
    await tx.select({ id: s.enrollments.id }).from(s.enrollments).where(eq(s.enrollments.id, input.enrollmentId)).for('update');
    const enr = await getEnrollmentWithVersion(tx, input.enrollmentId);
    if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
    const found = findLesson(enr.document, input.lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não existe nesta versão do curso');
    const attempts = await tx
      .select()
      .from(s.lessonAttempts)
      .where(and(eq(s.lessonAttempts.enrollmentId, input.enrollmentId), eq(s.lessonAttempts.lessonId, input.lessonId)))
      .orderBy(desc(s.lessonAttempts.attemptNumber));
    const open = attempts.find((a) => a.status === 'in_progress');
    if (open && !input.forceNew) {
      // Tentativa ainda intocada (nenhum evento aplicado): atualiza as variáveis de
      // curso, caso o aluno tenha respondido em outra aula depois de abri-la.
      if (open.revision === 1 && open.state.path.length === 1 && found.lesson.graph.variables.some((v) => variableScope(v) === 'course')) {
        const carried = await carriedCourseVariables(tx, { enrollmentId: input.enrollmentId, document: enr.document, graph: found.lesson.graph, excludeAttemptId: open.id });
        const fresh = carriedForGraph(found.lesson.graph, carried);
        const changed = Object.entries(fresh).some(([k, v]) => open.state.variables[k] !== v);
        if (changed) {
          const variables = { ...open.state.variables, ...fresh };
          // o snapshot do primeiro passo (voltar cenas) acompanha as variáveis herdadas
          const state: AttemptState = { ...open.state, variables, path: open.state.path.map((p, i) => (i === 0 ? { ...p, vars: { ...variables } } : p)) };
          const [updated] = await tx.update(s.lessonAttempts).set({ state, updatedAt: new Date() }).where(eq(s.lessonAttempts.id, open.id)).returning();
          return { attempt: updated!, created: false };
        }
      }
      return { attempt: open, created: false };
    }
    if (open && input.forceNew && !input.abandonOpen) throw new DomainError('CONFLICT', 'Conclua a tentativa atual antes de iniciar outra');
    if (open && input.forceNew && input.abandonOpen) {
      // "Recomeçar aula" no meio: a tentativa aberta vira `abandoned` (não some; fora da herança de variáveis de curso)
      const now = new Date();
      await tx.update(s.lessonAttempts).set({ status: 'abandoned', updatedAt: now }).where(eq(s.lessonAttempts.id, open.id));
      await tx.insert(s.learnerEvents).values({
        id: newId('evt'),
        attemptId: open.id,
        eventId: newId('rst'),
        type: 'attempt_abandoned',
        nodeId: open.state.currentNodeId,
        payload: { reason: 'restart' },
        result: {},
        resultingRevision: open.revision,
      });
    }
    const latest = attempts[0];
    if (latest && !input.forceNew) return { attempt: latest, created: false };
    const carried = await carriedCourseVariables(tx, { enrollmentId: input.enrollmentId, document: enr.document, graph: found.lesson.graph });
    const state = createInitialState(found.lesson.graph, { carried });
    const [attempt] = await tx
      .insert(s.lessonAttempts)
      .values({ id: newId('att'), enrollmentId: input.enrollmentId, lessonId: input.lessonId, attemptNumber: (latest?.attemptNumber ?? 0) + 1, state, revision: 1 })
      .returning();
    return { attempt: attempt!, created: true };
  });
}

export interface LearnerEventInput {
  attemptId: string;
  eventId: string;
  nodeId: string;
  expectedRevision: number;
  intent: Intent;
}

export interface LearnerEventResult {
  replayed: boolean;
  revision: number;
  state: AttemptState;
  feedback?: StepResult['feedback'];
  assessment?: StepResult['assessment'];
  transitioned: boolean;
  fromNodeId: string;
  toNodeId: string;
  progress: ReturnType<typeof computeProgress>;
  lessonCompleted: boolean;
  courseCompleted: boolean;
}

function courseIsComplete(doc: CourseDocument, completedLessonIds: Set<string>): boolean {
  const required = doc.completion.requiredLessonIds.length > 0 ? doc.completion.requiredLessonIds : allLessons(doc).map((l) => l.id);
  return required.every((id) => completedLessonIds.has(id));
}

/**
 * Aplica um evento do aluno. Transição e gravação ocorrem na mesma transação,
 * com bloqueio da linha da tentativa. Regras:
 *  - mesmo eventId -> devolve o mesmo resultado, sem reaplicar efeitos
 *  - expectedRevision diferente -> CONFLICT (outra aba já avançou)
 *  - nodeId diferente do nó atual -> CONFLICT
 */
export async function applyLearnerEvent(db: Database, input: LearnerEventInput): Promise<LearnerEventResult> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, input.attemptId)).for('update').limit(1);
    if (!attempt) throw new DomainError('NOT_FOUND', 'Tentativa não encontrada');

    const [existingEvent] = await tx
      .select()
      .from(s.learnerEvents)
      .where(and(eq(s.learnerEvents.attemptId, input.attemptId), eq(s.learnerEvents.eventId, input.eventId)))
      .limit(1);
    if (existingEvent) {
      return { ...(existingEvent.result as unknown as LearnerEventResult), replayed: true };
    }

    if (attempt.revision !== input.expectedRevision)
      throw new DomainError('CONFLICT', 'Esta tentativa já avançou em outra aba. Recarregue para continuar do ponto atual.', { currentRevision: attempt.revision });
    if (attempt.state.currentNodeId !== input.nodeId)
      throw new DomainError('CONFLICT', 'O bloco respondido não é o bloco atual.', { currentNodeId: attempt.state.currentNodeId });

    const enr = await getEnrollmentWithVersion(tx, attempt.enrollmentId);
    if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
    const found = findLesson(enr.document, attempt.lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não existe nesta versão');

    let step: StepResult;
    try {
      step = applyIntent(found.lesson.graph, attempt.state, input.intent);
    } catch (e) {
      if (e instanceof EngineError) throw new DomainError('ENGINE', e.message, { engineCode: e.code });
      throw e;
    }

    const revision = attempt.revision + 1;
    const now = new Date();
    const lessonCompleted = step.state.status === 'completed';
    await tx
      .update(s.lessonAttempts)
      .set({ state: step.state, revision, updatedAt: now, status: lessonCompleted ? 'completed' : 'in_progress', completedAt: lessonCompleted ? now : null })
      .where(eq(s.lessonAttempts.id, attempt.id));

    if (step.evidence.length > 0) {
      await tx.insert(s.objectiveEvidence).values(
        step.evidence.map((ev) => ({ id: newId('evd'), enrollmentId: attempt.enrollmentId, attemptId: attempt.id, objectiveId: ev.objectiveId, nodeId: ev.nodeId, kind: ev.kind, value: ev.value })),
      );
    }

    let courseCompleted = false;
    if (lessonCompleted) {
      await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'lesson.completed', version: 1, payload: { enrollmentId: attempt.enrollmentId, attemptId: attempt.id, lessonId: attempt.lessonId } });
      const completedAttempts = await tx
        .select({ lessonId: s.lessonAttempts.lessonId })
        .from(s.lessonAttempts)
        .where(and(eq(s.lessonAttempts.enrollmentId, attempt.enrollmentId), eq(s.lessonAttempts.status, 'completed')));
      const done = new Set([...completedAttempts.map((a) => a.lessonId), attempt.lessonId]);
      if (enr.enrollment.status === 'active' && courseIsComplete(enr.document, done)) {
        courseCompleted = true;
        await tx.update(s.enrollments).set({ status: 'completed', completedAt: now }).where(eq(s.enrollments.id, attempt.enrollmentId));
        await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'course.completed', version: 1, payload: { enrollmentId: attempt.enrollmentId, courseId: enr.course.id, userId: enr.enrollment.userId } });
      }
    }

    const result: LearnerEventResult = {
      replayed: false,
      revision,
      state: step.state,
      feedback: step.feedback,
      assessment: step.assessment,
      transitioned: step.transitioned,
      fromNodeId: step.fromNodeId,
      toNodeId: step.toNodeId,
      progress: computeProgress(found.lesson.graph, step.state),
      lessonCompleted,
      courseCompleted,
    };
    await tx.insert(s.learnerEvents).values({
      id: newId('evt'),
      attemptId: attempt.id,
      eventId: input.eventId,
      type: input.intent.kind,
      nodeId: input.nodeId,
      payload: input.intent as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      resultingRevision: revision,
    });
    return result;
  });
}

export interface NavigateAttemptInput {
  attemptId: string;
  eventId: string;
  /** cena atual vista pelo cliente (confere com o servidor) */
  nodeId: string;
  expectedRevision: number;
  target: NavigationTarget;
}

/**
 * "Cena anterior" / "Voltar para esta cena" no LMS. Mesmas garantias de
 * `applyLearnerEvent` (bloqueio da linha, revisão, nó atual, idempotência por
 * eventId). O estado da tentativa volta ao snapshot da cena (ver
 * `navigateBack`); o histórico NÃO é apagado: o evento `navigated_back` entra
 * em `learner_events` (só inclusão) e as evidências já gravadas ficam.
 * Bloqueado depois da conclusão (o aluno usa "Rever") e quando a aula tem
 * `allowBack: false`.
 */
export async function navigateAttempt(db: Database, input: NavigateAttemptInput): Promise<LearnerEventResult> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, input.attemptId)).for('update').limit(1);
    if (!attempt) throw new DomainError('NOT_FOUND', 'Tentativa não encontrada');

    const [existingEvent] = await tx
      .select()
      .from(s.learnerEvents)
      .where(and(eq(s.learnerEvents.attemptId, input.attemptId), eq(s.learnerEvents.eventId, input.eventId)))
      .limit(1);
    if (existingEvent) return { ...(existingEvent.result as unknown as LearnerEventResult), replayed: true };

    if (attempt.revision !== input.expectedRevision)
      throw new DomainError('CONFLICT', 'Esta tentativa já avançou em outra aba. Recarregue para continuar do ponto atual.', { currentRevision: attempt.revision });
    if (attempt.state.currentNodeId !== input.nodeId)
      throw new DomainError('CONFLICT', 'A cena atual mudou em outra aba.', { currentNodeId: attempt.state.currentNodeId });

    const enr = await getEnrollmentWithVersion(tx, attempt.enrollmentId);
    if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
    const found = findLesson(enr.document, attempt.lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não existe nesta versão');

    let nav: ReturnType<typeof navigateBack>;
    try {
      nav = navigateBack(found.lesson.graph, attempt.state, input.target, { allowBack: found.lesson.allowBack });
    } catch (e) {
      if (e instanceof EngineError) throw new DomainError('ENGINE', e.message, { engineCode: e.code });
      throw e;
    }

    const revision = attempt.revision + 1;
    const now = new Date();
    await tx.update(s.lessonAttempts).set({ state: nav.state, revision, updatedAt: now, status: 'in_progress', completedAt: null }).where(eq(s.lessonAttempts.id, attempt.id));

    const result: LearnerEventResult = {
      replayed: false,
      revision,
      state: nav.state,
      transitioned: true,
      fromNodeId: nav.fromNodeId,
      toNodeId: nav.toNodeId,
      progress: computeProgress(found.lesson.graph, nav.state),
      lessonCompleted: false,
      courseCompleted: false,
    };
    await tx.insert(s.learnerEvents).values({
      id: newId('evt'),
      attemptId: attempt.id,
      eventId: input.eventId,
      type: 'navigated_back',
      nodeId: input.nodeId,
      payload: { target: input.target, fromNodeId: nav.fromNodeId, toNodeId: nav.toNodeId, pathIndex: nav.pathIndex, undone: nav.undone, reconstructed: nav.reconstructed },
      result: result as unknown as Record<string, unknown>,
      resultingRevision: revision,
    });
    return result;
  });
}

/** Relatório básico por matrícula: progresso, caminhos e resultado por objetivo. */
export async function getEnrollmentReport(db: DbOrTx, enrollmentId: string) {
  const enr = await getEnrollmentWithVersion(db, enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const [student] = await db.select({ id: s.user.id, name: s.user.name, email: s.user.email }).from(s.user).where(eq(s.user.id, enr.enrollment.userId)).limit(1);
  const attempts = await listAttemptsForEnrollment(db, enrollmentId);
  const evidence = attempts.length
    ? await db.select().from(s.objectiveEvidence).where(inArray(s.objectiveEvidence.attemptId, attempts.map((a) => a.id)))
    : [];
  const lessons = allLessons(enr.document).map((lesson) => {
    const lessonAttempts = attempts.filter((a) => a.lessonId === lesson.id);
    const nodeTitle = (id: string) => lesson.graph.nodes.find((n) => n.id === id)?.title ?? id;
    return {
      lessonId: lesson.id,
      title: lesson.title,
      attempts: lessonAttempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        progress: computeProgress(lesson.graph, a.state),
        path: a.state.path.map((p) => ({ nodeId: p.nodeId, title: nodeTitle(p.nodeId), at: p.at })),
        answers: Object.entries(a.state.answers).map(([nodeId, ans]) => {
          const node = lesson.graph.nodes.find((n) => n.id === nodeId);
          const optionLabels =
            node && (node.type === 'choice' || node.type === 'assessment')
              ? (ans.optionIds ?? []).map((oid) => node.options.find((o) => o.id === oid)?.label ?? oid)
              : [];
          return { nodeId, title: nodeTitle(nodeId), type: node?.type ?? 'unknown', optionLabels, text: ans.text, passed: ans.passed, attempts: ans.attempts, answeredAt: ans.answeredAt };
        }),
      })),
    };
  });
  const objectives = summarizeObjectives(
    enr.document.objectives,
    evidence.map((e) => ({ objectiveId: e.objectiveId, nodeId: e.nodeId, kind: e.kind as 'choice' | 'reflection' | 'assessment', value: e.value })),
  );
  return { enrollment: enr.enrollment, course: { id: enr.course.id, title: enr.course.title, versionNumber: enr.version.versionNumber }, student, lessons, objectives };
}

const ANSWER_KINDS = new Set<CourseAnswer['kind']>(['choice', 'reflection', 'assessment']);

/**
 * Respostas do aluno no curso inteiro: a MAIS RECENTE por nó (`answeredAt`),
 * entre todas as tentativas da matrícula (todas na versão fixada da matrícula).
 * Só nós de decisão, reflexão e avaliação que existem na versão. Base da página
 * "Meu roteiro" com respostas de outras aulas.
 */
export async function courseAnswers(db: DbOrTx, input: { enrollmentId: string }): Promise<Record<string, CourseAnswer>> {
  const enr = await getEnrollmentWithVersion(db, input.enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const attempts = await listAttemptsForEnrollment(db, input.enrollmentId);
  const graphs = new Map(allLessons(enr.document).map((l) => [l.id, l.graph]));
  const out: Record<string, CourseAnswer> = {};
  for (const a of attempts) {
    const graph = graphs.get(a.lessonId);
    if (!graph) continue;
    for (const [nodeId, ans] of Object.entries(a.state.answers ?? {})) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node || !ANSWER_KINDS.has(node.type as CourseAnswer['kind'])) continue;
      const prev = out[nodeId];
      // tentativas em ordem de início: empate em answeredAt fica com a mais nova
      if (prev && prev.answeredAt > ans.answeredAt) continue;
      const kind = node.type as CourseAnswer['kind'];
      const rec: CourseAnswer = { lessonId: a.lessonId, kind, answeredAt: ans.answeredAt };
      if (ans.optionIds) rec.optionIds = [...ans.optionIds];
      if (ans.text !== undefined) rec.text = ans.text;
      if (kind === 'assessment' && ans.passed !== undefined) rec.passed = ans.passed;
      out[nodeId] = rec;
    }
  }
  return out;
}

export interface AnsweredNodeSummary {
  title: string;
  type: AnyNode['type'];
  /** decisão/avaliação: só id e rótulo (nunca o gabarito) */
  options?: Array<{ id: string; label: string }>;
}

/** Resumo dos nós referenciados pelas respostas (para traduzir optionIds em rótulos). */
export function answeredNodeSummaries(document: CourseDocument, answers: Record<string, unknown>): Record<string, AnsweredNodeSummary> {
  const wanted = new Set(Object.keys(answers));
  const out: Record<string, AnsweredNodeSummary> = {};
  for (const lesson of allLessons(document)) {
    for (const n of lesson.graph.nodes) {
      if (!wanted.has(n.id) || out[n.id]) continue;
      const summary: AnsweredNodeSummary = { title: n.title?.trim() || n.id, type: n.type };
      if (n.type === 'choice' || n.type === 'assessment') summary.options = n.options.map((o) => ({ id: o.id, label: o.label }));
      out[n.id] = summary;
    }
  }
  return out;
}


import { and, asc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import { allLessons, migrateCourseDocument, requiredLessonIdsFor, type CourseDocument, type Lesson } from '@lms/course-schema';
import type { AttemptState } from '@lms/course-engine';
import type { DbOrTx } from '../client';
import { DomainError } from '../errors';
import * as s from '../schema';

/*
 * Relatório de progresso: UMA linha por matrícula. Alimenta a API de integração (`GET /api/integracao/v1/progresso`),
 * a exportação CSV do estúdio e (no futuro) o certificado. Contrato documentado em docs/integracao/api-v1.md.
 *
 * Consulta em lote: uma consulta para a página de matrículas e uma para cada fonte (tentativas, entregas, acessos,
 * versões do curso), todas por `inArray` com os ids da página. Nada de uma consulta por aluno.
 *
 * Paginação: por id da matrícula (`enrollments.id`, ordem crescente), com cursor opaco. O id não muda, então novas
 * matrículas ou atividade durante a leitura nunca fazem uma linha repetir nem sumir entre páginas.
 *
 * Como cada avaliação (bloco `AV..` do roteiro) é resumida — ver `summarizeAssessments`.
 */

export const PROGRESS_LIMIT_MAX = 500;
export const PROGRESS_LIMIT_DEFAULT = 100;

export type TaskOverallStatus = 'pendente' | 'enviada' | 'aprovada' | 'devolvida';

export interface AssessmentSummary {
  aula_id: string;
  aula: string;
  /** id do grupo: o prefixo comum das perguntas (`av1` em `av1_q1`, `av1_q2`…) ou o id do próprio bloco */
  grupo_id: string;
  /** título do bloco sem o sufixo "· pergunta N de M" */
  titulo: string;
  /** perguntas acertadas (resposta com `passed`) */
  acertos: number;
  /** quantas perguntas o grupo tem no curso */
  total: number;
  /** perguntas já respondidas */
  respondidas: number;
  /** `true` aprovado; `false` reprovado (respondeu tudo e ficou abaixo do mínimo); `null` ainda sem resultado */
  aprovado: boolean | null;
}

export interface ReflectionSummary {
  aula_id: string;
  aula: string;
  /** id da cena de reflexão no roteiro */
  cena: string;
  /** título da cena (ou o id, se a cena não tem título) */
  titulo: string;
  /** a cena é obrigatória para concluir a aula (`required` do nó) */
  obrigatoria: boolean;
  /** texto da resposta MAIS RECENTE do aluno (texto livre, dado pessoal); `null` se nunca respondeu */
  resposta: string | null;
  /** quando a resposta mais recente foi dada (ISO 8601); `null` se nunca respondeu */
  respondida_em: string | null;
}

export interface TaskSummary {
  /** `null` = o curso não tem tarefa obrigatória nas aulas obrigatórias desta matrícula */
  status: TaskOverallStatus | null;
  total: number;
  pendentes: number;
  enviadas: number;
  aprovadas: number;
  devolvidas: number;
}

export interface ProgressRow {
  matricula_id: string;
  status_matricula: 'active' | 'completed' | 'canceled';
  aluno: { id: string; nome: string; email: string; rgm: string | null };
  curso: { id: string; slug: string; titulo: string };
  matriculado_em: string;
  primeiro_acesso: string | null;
  ultimo_acesso: string | null;
  /** o instante mais recente entre tudo o que a linha mostra (base do filtro `desde`) */
  atualizado_em: string;
  aulas_concluidas: number;
  aulas_total: number;
  avaliacoes: AssessmentSummary[];
  /** uma entrada por cena de reflexão do curso, na ordem do curso (vazio se o curso não tem reflexão) */
  reflexoes: ReflectionSummary[];
  tarefa: TaskSummary;
  curso_concluido: boolean;
  concluido_em: string | null;
  /** código do certificado de conclusão ativo (`null` sem certificado) */
  certificado_codigo: string | null;
}

/* ------------------------------------------------------------------------ */
/* Funções puras (testáveis sem banco)                                       */
/* ------------------------------------------------------------------------ */

export interface AssessmentGroup {
  lessonId: string;
  lessonTitle: string;
  groupId: string;
  title: string;
  /** perguntas em ordem (`_q1`, `_q2`…) */
  nodeIds: string[];
  /** mínimo de acertos lido da aresta de aprovação do roteiro (`acertos >= N`); `null` = não há critério explícito */
  passMin: number | null;
}

const QUESTION_ID_RE = /^(.*)_q(\d+)$/;
const QUESTION_TITLE_SUFFIX_RE = /\s*·\s*pergunta\s+\d+\s+de\s+\d+\s*$/i;

/**
 * Grupos de avaliação de um curso. O importador transforma cada bloco `AV..` em uma cena `assessment` POR PERGUNTA,
 * encadeadas (`av1_q1`, `av1_q2`, `av1_q3`) e ligadas pela variável `acertos`; um grupo junta essas perguntas.
 * Um nó `assessment` cujo id não segue esse padrão (curso feito à mão) é um grupo de uma pergunta só.
 * O mínimo de aprovação ("Aprovação: X de Y") está na aresta que sai da última pergunta (`acertos >= X`).
 */
export function assessmentGroupsOf(doc: CourseDocument): AssessmentGroup[] {
  const out: AssessmentGroup[] = [];
  for (const lesson of allLessons(doc)) {
    const groups = new Map<string, { nodes: Array<{ id: string; title: string; order: number }> }>();
    for (const node of lesson.graph.nodes) {
      if (node.type !== 'assessment') continue;
      const m = QUESTION_ID_RE.exec(node.id);
      const groupId = m ? m[1]! : node.id;
      const g = groups.get(groupId) ?? { nodes: [] };
      g.nodes.push({ id: node.id, title: node.title ?? '', order: m ? Number(m[2]) : 0 });
      groups.set(groupId, g);
    }
    for (const [groupId, g] of groups) {
      g.nodes.sort((a, b) => a.order - b.order);
      const last = g.nodes[g.nodes.length - 1]!;
      const title = (g.nodes[0]!.title.replace(QUESTION_TITLE_SUFFIX_RE, '').trim() || lesson.title);
      out.push({ lessonId: lesson.id, lessonTitle: lesson.title, groupId, title, nodeIds: g.nodes.map((n) => n.id), passMin: passMinOf(lesson, last.id) });
    }
  }
  return out;
}

function passMinOf(lesson: Lesson, lastNodeId: string): number | null {
  let min: number | null = null;
  for (const e of lesson.graph.edges) {
    const c = e.condition;
    if (e.from === lastNodeId && c && c.op === 'gte' && c.var === 'acertos' && typeof c.value === 'number') min = min === null ? c.value : Math.min(min, c.value);
  }
  return min;
}

export interface AttemptLike {
  lessonId: string;
  attemptNumber: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  state: Pick<AttemptState, 'answers' | 'path'>;
}

/**
 * Resumo de cada grupo de avaliação para UMA matrícula.
 *  - Tentativa considerada: a de maior número da aula que tenha resposta em alguma pergunta do grupo.
 *  - `acertos` = perguntas com resposta `passed`; `respondidas` = perguntas com qualquer resposta; `total` = perguntas do grupo.
 *  - Limiar de aprovação: o "X de Y" do roteiro (`passMin`); sem ele, todas as perguntas.
 *  - `aprovado`: `null` se nada foi respondido; `true` se `acertos >= limiar`; `false` se respondeu tudo e ficou abaixo;
 *    `null` se ainda há perguntas por responder e o limiar não foi atingido (em andamento).
 */
export function summarizeAssessments(groups: AssessmentGroup[], attempts: AttemptLike[]): AssessmentSummary[] {
  const byLesson = new Map<string, AttemptLike[]>();
  for (const a of attempts) {
    const list = byLesson.get(a.lessonId) ?? [];
    list.push(a);
    byLesson.set(a.lessonId, list);
  }
  for (const list of byLesson.values()) list.sort((a, b) => b.attemptNumber - a.attemptNumber);
  return groups.map((g) => {
    const attempt = (byLesson.get(g.lessonId) ?? []).find((a) => g.nodeIds.some((id) => a.state.answers?.[id]));
    let acertos = 0;
    let respondidas = 0;
    if (attempt) {
      for (const id of g.nodeIds) {
        const ans = attempt.state.answers?.[id];
        if (!ans) continue;
        respondidas += 1;
        if (ans.passed === true) acertos += 1;
      }
    }
    const total = g.nodeIds.length;
    const limiar = Math.min(total, g.passMin !== null ? Math.max(g.passMin, 0) : total);
    let aprovado: boolean | null = null;
    if (respondidas > 0) aprovado = acertos >= limiar ? true : respondidas >= total ? false : null;
    return { aula_id: g.lessonId, aula: g.lessonTitle, grupo_id: g.groupId, titulo: g.title, acertos, total, respondidas, aprovado };
  });
}

export interface ReflectionSlot {
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  title: string;
  required: boolean;
}

/** Cenas de reflexão do curso (`type: 'reflection'`), na ordem das aulas e das cenas. A missão (`mission`) não entra. */
export function reflectionSlotsOf(doc: CourseDocument): ReflectionSlot[] {
  const out: ReflectionSlot[] = [];
  for (const lesson of allLessons(doc)) {
    for (const node of lesson.graph.nodes) {
      if (node.type !== 'reflection') continue;
      out.push({ lessonId: lesson.id, lessonTitle: lesson.title, nodeId: node.id, title: node.title?.trim() || node.id, required: node.required });
    }
  }
  return out;
}

/**
 * Resposta mais recente de cada cena de reflexão para UMA matrícula: entre todas as tentativas da aula (em andamento,
 * concluídas ou abandonadas) vale a de maior `answeredAt`; empate, a tentativa de maior número. Resposta vazia conta como não respondida.
 */
export function summarizeReflections(slots: ReflectionSlot[], attempts: AttemptLike[]): ReflectionSummary[] {
  return slots.map((slot) => {
    let best: { text: string; at: number; n: number } | null = null;
    for (const a of attempts) {
      if (a.lessonId !== slot.lessonId) continue;
      const ans = a.state.answers?.[slot.nodeId];
      if (!ans || typeof ans.text !== 'string' || ans.text.trim() === '') continue;
      const at = Date.parse(ans.answeredAt);
      const when = Number.isNaN(at) ? 0 : at;
      if (!best || when > best.at || (when === best.at && a.attemptNumber > best.n)) best = { text: ans.text, at: when, n: a.attemptNumber };
    }
    return {
      aula_id: slot.lessonId,
      aula: slot.lessonTitle,
      cena: slot.nodeId,
      titulo: slot.title,
      obrigatoria: slot.required,
      resposta: best ? best.text : null,
      respondida_em: best && best.at ? new Date(best.at).toISOString() : null,
    };
  });
}

export interface TaskSubmissionLike {
  nodeId: string;
  status: 'submitted' | 'approved' | 'returned';
}

/**
 * Situação das tarefas OBRIGATÓRIAS das aulas obrigatórias da matrícula (mesma regra de `taskRequirementsMet`: uma tarefa
 * fora do caminho da última tentativa concluída da aula, e nunca enviada, não é cobrada).
 * Estado geral, por prioridade: `devolvida` (alguma devolvida: o aluno precisa agir) > `pendente` (alguma ainda não enviada)
 * > `enviada` (todas enviadas, alguma aguardando correção) > `aprovada` (todas aprovadas). Sem tarefa obrigatória: `null`.
 */
export function summarizeTasks(
  doc: CourseDocument,
  optionalLessonIds: string[],
  submissions: TaskSubmissionLike[],
  lastCompletedPath: Map<string, Set<string>>,
): TaskSummary {
  const requiredLessons = new Set(requiredLessonIdsFor(doc, optionalLessonIds));
  const byNode = new Map(submissions.map((r) => [r.nodeId, r]));
  let total = 0;
  let pendentes = 0;
  let enviadas = 0;
  let aprovadas = 0;
  let devolvidas = 0;
  for (const lesson of allLessons(doc)) {
    if (!requiredLessons.has(lesson.id)) continue;
    for (const node of lesson.graph.nodes) {
      if (node.type !== 'task' || !node.required) continue;
      const row = byNode.get(node.id);
      const path = lastCompletedPath.get(lesson.id);
      if (!row && path && !path.has(node.id)) continue;
      total += 1;
      if (!row) pendentes += 1;
      else if (row.status === 'approved') aprovadas += 1;
      else if (row.status === 'returned') devolvidas += 1;
      else enviadas += 1;
    }
  }
  let status: TaskOverallStatus | null = null;
  if (total > 0) status = devolvidas > 0 ? 'devolvida' : pendentes > 0 ? 'pendente' : enviadas > 0 ? 'enviada' : 'aprovada';
  return { status, total, pendentes, enviadas, aprovadas, devolvidas };
}

/* ------------------------------------------------------------------------ */
/* Cursor                                                                    */
/* ------------------------------------------------------------------------ */

export function encodeCursor(enrollmentId: string): string {
  return Buffer.from(`e1:${enrollmentId}`, 'utf8').toString('base64url');
}
export function decodeCursor(cursor: string): string {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!raw.startsWith('e1:') || raw.length < 4 || raw.length > 100) throw new DomainError('VALIDATION', 'cursor inválido');
  return raw.slice(3);
}

/* ------------------------------------------------------------------------ */
/* Consulta                                                                  */
/* ------------------------------------------------------------------------ */

export interface ProgressQuery {
  workspaceId: string;
  courseId?: string;
  /** só matrículas com atividade ou atualização DEPOIS deste instante (ver `docs/integracao/api-v1.md`) */
  since?: Date;
  limit: number;
  cursor?: string | null;
}

export interface ProgressPage {
  itens: ProgressRow[];
  /** `null` na última página */
  proximoCursor: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const maxDate = (...ds: Array<Date | null | undefined>): Date | null => ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
const minDate = (...ds: Array<Date | null | undefined>): Date | null => ds.reduce<Date | null>((m, d) => (d && (!m || d < m) ? d : m), null);

export async function progressRows(db: DbOrTx, q: ProgressQuery): Promise<ProgressPage> {
  const limit = Math.min(Math.max(Math.floor(q.limit) || PROGRESS_LIMIT_DEFAULT, 1), PROGRESS_LIMIT_MAX);
  const conds: SQL[] = [eq(s.courses.workspaceId, q.workspaceId)];
  if (q.courseId) conds.push(eq(s.enrollments.courseId, q.courseId));
  if (q.cursor) conds.push(gt(s.enrollments.id, decodeCursor(q.cursor)));
  if (q.since) {
    const t = q.since;
    const ts_ = t.toISOString();
    const touched = or(
      gt(s.enrollments.createdAt, t),
      gt(s.enrollments.completedAt, t),
      sql`exists (select 1 from ${s.lessonAttempts} la where la.enrollment_id = ${s.enrollments.id} and (la.started_at > ${ts_}::timestamptz or la.updated_at > ${ts_}::timestamptz or la.completed_at > ${ts_}::timestamptz))`,
      sql`exists (select 1 from ${s.taskSubmissions} ts where ts.enrollment_id = ${s.enrollments.id} and (ts.submitted_at > ${ts_}::timestamptz or ts.updated_at > ${ts_}::timestamptz or ts.reviewed_at > ${ts_}::timestamptz))`,
      sql`exists (select 1 from ${s.accessLogs} al where al.user_id = ${s.enrollments.userId} and al.occurred_at > ${ts_}::timestamptz)`,
    );
    if (touched) conds.push(touched);
  }

  const page = await db
    .select({
      id: s.enrollments.id,
      status: s.enrollments.status,
      createdAt: s.enrollments.createdAt,
      completedAt: s.enrollments.completedAt,
      optionalLessonIds: s.enrollments.optionalLessonIds,
      versionId: s.enrollments.courseVersionId,
      userId: s.user.id,
      userName: s.user.name,
      userEmail: s.user.email,
      rgm: s.workspaceMemberships.rgm,
      courseId: s.courses.id,
      courseSlug: s.courses.slug,
      courseTitle: s.courses.title,
    })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .innerJoin(s.user, eq(s.user.id, s.enrollments.userId))
    .leftJoin(s.workspaceMemberships, and(eq(s.workspaceMemberships.workspaceId, s.courses.workspaceId), eq(s.workspaceMemberships.userId, s.enrollments.userId)))
    .where(and(...conds))
    .orderBy(asc(s.enrollments.id))
    .limit(limit + 1);

  const hasMore = page.length > limit;
  const rows = hasMore ? page.slice(0, limit) : page;
  if (rows.length === 0) return { itens: [], proximoCursor: null };

  const enrollmentIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const versionIds = [...new Set(rows.map((r) => r.versionId))];

  const certRows = enrollmentIds.length
    ? await db
        .select({ enrollmentId: s.courseCertificates.enrollmentId, code: s.courseCertificates.code })
        .from(s.courseCertificates)
        .where(and(inArray(s.courseCertificates.enrollmentId, enrollmentIds), sql`${s.courseCertificates.revokedAt} is null`))
    : [];
  const certBy = new Map(certRows.map((c) => [c.enrollmentId, c.code]));
  const [attempts, submissions, access, versions] = await Promise.all([
    db
      .select({
        enrollmentId: s.lessonAttempts.enrollmentId,
        lessonId: s.lessonAttempts.lessonId,
        attemptNumber: s.lessonAttempts.attemptNumber,
        status: s.lessonAttempts.status,
        state: s.lessonAttempts.state,
        startedAt: s.lessonAttempts.startedAt,
        updatedAt: s.lessonAttempts.updatedAt,
        completedAt: s.lessonAttempts.completedAt,
      })
      .from(s.lessonAttempts)
      .where(inArray(s.lessonAttempts.enrollmentId, enrollmentIds)),
    db
      .select({ enrollmentId: s.taskSubmissions.enrollmentId, nodeId: s.taskSubmissions.nodeId, status: s.taskSubmissions.status, submittedAt: s.taskSubmissions.submittedAt, updatedAt: s.taskSubmissions.updatedAt, reviewedAt: s.taskSubmissions.reviewedAt })
      .from(s.taskSubmissions)
      .where(inArray(s.taskSubmissions.enrollmentId, enrollmentIds)),
    db
      .select({ userId: s.accessLogs.userId, first: sql<Date>`min(${s.accessLogs.occurredAt})`.mapWith((v) => new Date(v)), last: sql<Date>`max(${s.accessLogs.occurredAt})`.mapWith((v) => new Date(v)) })
      .from(s.accessLogs)
      .where(inArray(s.accessLogs.userId, userIds))
      .groupBy(s.accessLogs.userId),
    db.select({ id: s.courseVersions.id, document: s.courseVersions.document }).from(s.courseVersions).where(inArray(s.courseVersions.id, versionIds)),
  ]);

  const docs = new Map<string, { doc: CourseDocument; groups: AssessmentGroup[]; reflections: ReflectionSlot[] }>();
  for (const v of versions) {
    const doc = migrateCourseDocument(v.document);
    docs.set(v.id, { doc, groups: assessmentGroupsOf(doc), reflections: reflectionSlotsOf(doc) });
  }
  const attemptsBy = groupBy(attempts, (a) => a.enrollmentId);
  const submissionsBy = groupBy(submissions, (a) => a.enrollmentId);
  const accessBy = new Map(access.map((a) => [a.userId, a]));

  const itens = rows.map<ProgressRow>((r) => {
    const { doc, groups, reflections } = docs.get(r.versionId)!;
    const myAttempts = attemptsBy.get(r.id) ?? [];
    const mySubs = submissionsBy.get(r.id) ?? [];
    const acc = accessBy.get(r.userId);

    const required = requiredLessonIdsFor(doc, r.optionalLessonIds);
    const completed = new Set(myAttempts.filter((a) => a.status === 'completed').map((a) => a.lessonId));
    const lastPath = new Map<string, Set<string>>();
    for (const a of [...myAttempts].filter((x) => x.status === 'completed').sort((x, y) => (y.completedAt?.getTime() ?? 0) - (x.completedAt?.getTime() ?? 0) || y.attemptNumber - x.attemptNumber)) {
      if (!lastPath.has(a.lessonId)) lastPath.set(a.lessonId, new Set(a.state.path.map((p) => p.nodeId)));
    }

    const attemptFirst = minDate(...myAttempts.map((a) => a.startedAt));
    const attemptLast = maxDate(...myAttempts.map((a) => a.updatedAt), ...myAttempts.map((a) => a.completedAt));
    const updated = maxDate(r.createdAt, r.completedAt, attemptLast, ...myAttempts.map((a) => a.startedAt), ...mySubs.flatMap((x) => [x.submittedAt, x.updatedAt, x.reviewedAt]), acc?.last)!;

    return {
      matricula_id: r.id,
      status_matricula: r.status,
      aluno: { id: r.userId, nome: r.userName, email: r.userEmail, rgm: r.rgm ?? null },
      curso: { id: r.courseId, slug: r.courseSlug, titulo: r.courseTitle },
      matriculado_em: r.createdAt.toISOString(),
      // acesso: os registros de login/renovação; as tentativas de aula completam (os registros são apagados após 6 meses)
      primeiro_acesso: iso(minDate(acc?.first, attemptFirst)),
      ultimo_acesso: iso(maxDate(acc?.last, attemptLast)),
      atualizado_em: updated.toISOString(),
      aulas_concluidas: required.filter((id) => completed.has(id)).length,
      aulas_total: required.length,
      avaliacoes: summarizeAssessments(groups, myAttempts),
      reflexoes: summarizeReflections(reflections, myAttempts),
      tarefa: summarizeTasks(doc, r.optionalLessonIds, mySubs, lastPath),
      curso_concluido: r.status === 'completed',
      concluido_em: iso(r.completedAt),
      certificado_codigo: certBy.get(r.id) ?? null,
    };
  });

  return { itens, proximoCursor: hasMore ? encodeCursor(rows[rows.length - 1]!.id) : null };
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Percorre todas as páginas (para o CSV). `max` protege a memória: lança se passar. */
export async function* progressRowsAll(db: DbOrTx, q: Omit<ProgressQuery, 'cursor' | 'limit'> & { pageSize?: number }): AsyncGenerator<ProgressRow[]> {
  let cursor: string | null = null;
  do {
    const page: ProgressPage = await progressRows(db, { ...q, limit: q.pageSize ?? PROGRESS_LIMIT_MAX, cursor });
    if (page.itens.length) yield page.itens;
    cursor = page.proximoCursor;
  } while (cursor);
}

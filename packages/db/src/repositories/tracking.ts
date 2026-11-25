import { and, desc, eq, gte, isNull, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import * as s from '../schema';

/*
 * Acompanhamento dos alunos (tela "Acompanhamento" do estúdio). Complementa `reports.progressRows` com o que o
 * relatório por matrícula não traz: a atividade NO CURSO (tentativas de aula), o histórico diário de estudo e
 * quantas matrículas passaram por cada aula. Tudo em consultas agregadas por workspace (e curso, se filtrado),
 * sem uma consulta por aluno e sem lista de ids na consulta.
 *
 * "Estudar" aqui = registrar um passo numa aula (`learner_events`) ou ter uma tentativa de aula atualizada. O login
 * (`access_logs`) não entra: entrar na plataforma sem abrir uma aula não é atividade no curso.
 */

export interface TrackingScope {
  workspaceId: string;
  /** só este curso; sem ele, todos os cursos do workspace */
  courseId?: string;
}

function scopeConds(q: TrackingScope): SQL[] {
  const conds: SQL[] = [eq(s.courses.workspaceId, q.workspaceId)];
  if (q.courseId) conds.push(eq(s.enrollments.courseId, q.courseId));
  return conds;
}

export interface EnrollmentActivity {
  enrollmentId: string;
  /** tentativas de aula (qualquer situação) */
  attempts: number;
  /** aulas diferentes já abertas */
  lessonsStarted: number;
  /** primeira vez que abriu uma aula deste curso */
  firstActivity: Date | null;
  /** última atividade numa aula deste curso (passo, atualização ou conclusão) */
  lastActivity: Date | null;
}

const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));

/** Atividade no curso por matrícula (só as que já abriram alguma aula; as demais não aparecem). */
export async function enrollmentActivity(db: DbOrTx, q: TrackingScope): Promise<Map<string, EnrollmentActivity>> {
  const rows = await db
    .select({
      enrollmentId: s.lessonAttempts.enrollmentId,
      attempts: sql<number>`count(*)::int`,
      lessonsStarted: sql<number>`count(distinct ${s.lessonAttempts.lessonId})::int`,
      first: sql<string | null>`min(${s.lessonAttempts.startedAt})`,
      last: sql<string | null>`max(greatest(${s.lessonAttempts.updatedAt}, coalesce(${s.lessonAttempts.completedAt}, ${s.lessonAttempts.updatedAt})))`,
    })
    .from(s.lessonAttempts)
    .innerJoin(s.enrollments, eq(s.enrollments.id, s.lessonAttempts.enrollmentId))
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(...scopeConds(q)))
    .groupBy(s.lessonAttempts.enrollmentId);
  return new Map(
    rows.map((r) => [r.enrollmentId, { enrollmentId: r.enrollmentId, attempts: Number(r.attempts), lessonsStarted: Number(r.lessonsStarted), firstActivity: toDate(r.first), lastActivity: toDate(r.last) }]),
  );
}

export interface DailyActive {
  /** dia no fuso informado, `AAAA-MM-DD` */
  day: string;
  /** alunos diferentes que registraram algum passo em aula neste dia */
  students: number;
}

/**
 * Alunos que estudaram por dia, nos últimos `days` dias (contando hoje), no fuso `timeZone`. Dias sem atividade
 * vêm com zero, então a lista tem sempre `days` itens, do mais antigo ao de hoje. Matrículas canceladas não contam.
 */
export async function dailyActiveStudents(db: DbOrTx, q: TrackingScope & { days: number; timeZone?: string; now?: Date }): Promise<DailyActive[]> {
  const days = Math.min(Math.max(Math.floor(q.days) || 30, 1), 180);
  const tz = q.timeZone ?? 'America/Sao_Paulo';
  // o fuso vai como literal (o mesmo texto no select e no group by); só nomes IANA simples passam
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)*$/.test(tz)) throw new Error(`fuso inválido: ${tz}`);
  const now = q.now ?? new Date();
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  // margem de um dia na janela da consulta; o recorte exato é pelos rótulos de dia abaixo
  const since = new Date(now.getTime() - (days + 1) * 86_400_000);
  const day = sql<string>`to_char(${s.learnerEvents.createdAt} at time zone ${sql.raw(`'${tz}'`)}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, students: sql<number>`count(distinct ${s.enrollments.userId})::int` })
    .from(s.learnerEvents)
    .innerJoin(s.lessonAttempts, eq(s.lessonAttempts.id, s.learnerEvents.attemptId))
    .innerJoin(s.enrollments, eq(s.enrollments.id, s.lessonAttempts.enrollmentId))
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(...scopeConds(q), gte(s.learnerEvents.createdAt, since), sql`${s.enrollments.status} <> 'canceled'`))
    .groupBy(day);
  const by = new Map(rows.map((r) => [r.day, Number(r.students)]));
  const out: DailyActive[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * 86_400_000));
    if (out.length && out[out.length - 1]!.day === key) continue; // mudança de horário de verão: o mesmo dia duas vezes
    out.push({ day: key, students: by.get(key) ?? 0 });
  }
  return out;
}

export interface LessonReach {
  lessonId: string;
  /** matrículas (não canceladas) que abriram a aula */
  started: number;
  /** matrículas (não canceladas) com a aula concluída */
  completed: number;
}

/** Quantas matrículas de UM curso abriram e concluíram cada aula (base do "onde os alunos param"). */
export async function lessonReach(db: DbOrTx, q: { workspaceId: string; courseId: string }): Promise<Map<string, LessonReach>> {
  const rows = await db
    .select({
      lessonId: s.lessonAttempts.lessonId,
      started: sql<number>`count(distinct ${s.lessonAttempts.enrollmentId})::int`,
      completed: sql<number>`count(distinct ${s.lessonAttempts.enrollmentId}) filter (where ${s.lessonAttempts.status} = 'completed')::int`,
    })
    .from(s.lessonAttempts)
    .innerJoin(s.enrollments, eq(s.enrollments.id, s.lessonAttempts.enrollmentId))
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(...scopeConds(q), sql`${s.enrollments.status} <> 'canceled'`))
    .groupBy(s.lessonAttempts.lessonId);
  return new Map(rows.map((r) => [r.lessonId, { lessonId: r.lessonId, started: Number(r.started), completed: Number(r.completed) }]));
}

export interface TrackedCourse {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  enrollments: number;
}

/** Cursos do workspace que têm matrícula ou estão publicados (opções do filtro), com o total de matrículas. */
export async function trackedCourses(db: DbOrTx, workspaceId: string): Promise<TrackedCourse[]> {
  const enrollments = sql<number>`(select count(*)::int from ${s.enrollments} e where e.course_id = "courses"."id")`;
  const rows = await db
    .select({ id: s.courses.id, slug: s.courses.slug, title: s.courses.title, status: s.courses.status, enrollments })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, workspaceId), isNull(s.courses.archivedAt)))
    .orderBy(desc(enrollments), s.courses.title);
  return rows.map((r) => ({ ...r, enrollments: Number(r.enrollments) })).filter((r) => r.status === 'published' || r.enrollments > 0);
}

/** Documento da versão publicada mais recente de um curso (ordem e títulos das aulas). `null` sem versão. */
export async function latestCourseDocument(db: DbOrTx, courseId: string): Promise<unknown | null> {
  const [v] = await db
    .select({ document: s.courseVersions.document })
    .from(s.courseVersions)
    .where(eq(s.courseVersions.courseId, courseId))
    .orderBy(desc(s.courseVersions.versionNumber))
    .limit(1);
  return v?.document ?? null;
}

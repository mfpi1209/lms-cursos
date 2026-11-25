/*
 * Acompanhamento dos alunos (estúdio › Acompanhamento): regras puras, sem banco.
 *
 * Situação de cada matrícula, nesta ordem:
 *  - `cancelada`: matrícula cancelada;
 *  - `concluiu`: curso concluído;
 *  - `nao_comecou`: nunca abriu uma aula do curso;
 *  - `parado`: já começou, mas está há mais de STALE_DAYS dias sem estudar no curso;
 *  - `em_dia`: estudou no curso nos últimos STALE_DAYS dias.
 * "Estudar" = atividade numa aula do curso (não conta só entrar na plataforma).
 */

export const STALE_DAYS = 14;
export const ACTIVE_DAYS = 7;
export const PAGE_SIZE = 50;
const DAY = 86_400_000;

export type Situacao = 'concluiu' | 'em_dia' | 'parado' | 'nao_comecou' | 'cancelada';
export type TaskStatus = 'pendente' | 'enviada' | 'aprovada' | 'devolvida';

/** Ordem de exibição (faixa de situação e legendas). */
export const SITUACOES: Situacao[] = ['concluiu', 'em_dia', 'parado', 'nao_comecou', 'cancelada'];

export const SITUACAO_META: Record<Situacao, { label: string; hint: string; tone: 'success' | 'brand' | 'warning' | 'danger' | 'neutral' }> = {
  concluiu: { label: 'Concluiu', hint: 'Terminou o curso', tone: 'success' },
  em_dia: { label: 'Em dia', hint: `Estudou nos últimos ${STALE_DAYS} dias`, tone: 'brand' },
  parado: { label: 'Parado', hint: `Começou e está há mais de ${STALE_DAYS} dias sem estudar`, tone: 'warning' },
  nao_comecou: { label: 'Não começou', hint: 'Ainda não abriu nenhuma aula', tone: 'danger' },
  cancelada: { label: 'Cancelada', hint: 'Matrícula cancelada', tone: 'neutral' },
};

export const TASK_LABEL: Record<TaskStatus, string> = { pendente: 'Pendente', enviada: 'Aguardando correção', aprovada: 'Aprovada', devolvida: 'Devolvida' };

/** O que vem do relatório de progresso (`reports.ProgressRow`), só com os campos usados aqui. */
export interface ProgressLike {
  matricula_id: string;
  status_matricula: 'active' | 'completed' | 'canceled';
  aluno: { id: string; nome: string; email: string; rgm: string | null };
  curso: { id: string; slug: string; titulo: string };
  matriculado_em: string;
  ultimo_acesso: string | null;
  aulas_concluidas: number;
  aulas_total: number;
  avaliacoes: Array<{ aprovado: boolean | null }>;
  tarefa: { status: TaskStatus | null };
  concluido_em: string | null;
  certificado_codigo: string | null;
}

export interface ActivityLike {
  attempts: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
}

export interface TrackRow {
  enrollmentId: string;
  student: { id: string; name: string; email: string; rgm: string | null };
  course: { id: string; slug: string; title: string };
  enrolledAt: Date;
  completedAt: Date | null;
  lessonsDone: number;
  lessonsTotal: number;
  /** 0–100 */
  percent: number;
  assessmentsPassed: number;
  assessmentsFailed: number;
  assessmentsTotal: number;
  task: TaskStatus | null;
  /** última atividade numa aula deste curso */
  lastStudy: Date | null;
  /** último acesso à plataforma (login ou atividade em qualquer curso) */
  lastAccess: Date | null;
  situacao: Situacao;
  /** dias desde a última atividade no curso; `null` se nunca estudou */
  idleDays: number | null;
  certificate: boolean;
}

export function situacaoOf(input: { status: 'active' | 'completed' | 'canceled'; started: boolean; lastStudy: Date | null }, now: Date): Situacao {
  if (input.status === 'canceled') return 'cancelada';
  if (input.status === 'completed') return 'concluiu';
  if (!input.started) return 'nao_comecou';
  if (!input.lastStudy || now.getTime() - input.lastStudy.getTime() > STALE_DAYS * DAY) return 'parado';
  return 'em_dia';
}

const date = (v: string | null): Date | null => (v ? new Date(v) : null);

export function buildTrackRow(p: ProgressLike, activity: ActivityLike | undefined, now: Date): TrackRow {
  const lastStudy = activity?.lastActivity ?? null;
  const started = (activity?.attempts ?? 0) > 0 || p.aulas_concluidas > 0;
  const situacao = situacaoOf({ status: p.status_matricula, started, lastStudy }, now);
  const percent = p.status_matricula === 'completed' ? 100 : p.aulas_total > 0 ? Math.round((Math.min(p.aulas_concluidas, p.aulas_total) / p.aulas_total) * 100) : 0;
  return {
    enrollmentId: p.matricula_id,
    student: { id: p.aluno.id, name: p.aluno.nome, email: p.aluno.email, rgm: p.aluno.rgm },
    course: { id: p.curso.id, slug: p.curso.slug, title: p.curso.titulo },
    enrolledAt: new Date(p.matriculado_em),
    completedAt: date(p.concluido_em),
    lessonsDone: p.aulas_concluidas,
    lessonsTotal: p.aulas_total,
    percent,
    assessmentsPassed: p.avaliacoes.filter((a) => a.aprovado === true).length,
    assessmentsFailed: p.avaliacoes.filter((a) => a.aprovado === false).length,
    assessmentsTotal: p.avaliacoes.length,
    task: p.tarefa.status,
    lastStudy,
    lastAccess: date(p.ultimo_acesso),
    situacao,
    idleDays: lastStudy ? Math.max(0, Math.floor((now.getTime() - lastStudy.getTime()) / DAY)) : null,
    certificate: !!p.certificado_codigo,
  };
}

/* ------------------------------------------------------------------------ */
/* Resumos                                                                   */
/* ------------------------------------------------------------------------ */

export interface Summary {
  enrollments: number;
  students: number;
  counts: Record<Situacao, number>;
  /** alunos diferentes que estudaram nos últimos ACTIVE_DAYS dias */
  active7d: number;
  /** média do progresso das matrículas não canceladas (0–100) */
  avgPercent: number;
  /** concluídas / não canceladas (0–100) */
  completionRate: number;
  certificates: number;
}

const emptyCounts = (): Record<Situacao, number> => ({ concluiu: 0, em_dia: 0, parado: 0, nao_comecou: 0, cancelada: 0 });

export function summarize(rows: TrackRow[], now: Date): Summary {
  const counts = emptyCounts();
  const students = new Set<string>();
  const active = new Set<string>();
  let pctSum = 0;
  let live = 0;
  let certificates = 0;
  for (const r of rows) {
    counts[r.situacao] += 1;
    students.add(r.student.id);
    if (r.lastStudy && now.getTime() - r.lastStudy.getTime() <= ACTIVE_DAYS * DAY) active.add(r.student.id);
    if (r.situacao !== 'cancelada') {
      live += 1;
      pctSum += r.percent;
    }
    if (r.certificate) certificates += 1;
  }
  return {
    enrollments: rows.length,
    students: students.size,
    counts,
    active7d: active.size,
    avgPercent: live ? Math.round(pctSum / live) : 0,
    completionRate: live ? Math.round((counts.concluiu / live) * 100) : 0,
    certificates,
  };
}

export interface CourseSummary extends Summary {
  course: TrackRow['course'];
}

/** Um resumo por curso, do curso com mais matrículas ao com menos. */
export function summarizeByCourse(rows: TrackRow[], now: Date): CourseSummary[] {
  const groups = new Map<string, TrackRow[]>();
  for (const r of rows) {
    const list = groups.get(r.course.id);
    if (list) list.push(r);
    else groups.set(r.course.id, [r]);
  }
  return [...groups.values()]
    .map((list) => ({ course: list[0]!.course, ...summarize(list, now) }))
    .sort((a, b) => b.enrollments - a.enrollments || a.course.title.localeCompare(b.course.title, 'pt-BR'));
}

/** Percentuais inteiros que somam exatamente 100 (maior resto), para a faixa de situação. */
export function shares(counts: number[]): number[] {
  const total = counts.reduce((n, c) => n + c, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const out = raw.map(Math.floor);
  let rest = 100 - out.reduce((n, c) => n + c, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    if (counts[i]! > 0) {
      out[i]! += 1;
      rest -= 1;
    }
  }
  return out;
}

export interface LessonStep {
  lessonId: string;
  title: string;
  started: number;
  completed: number;
  /** concluídas / base (0–100) */
  percent: number;
}

/**
 * "Onde os alunos param": para cada aula (na ordem do curso), quantas matrículas a abriram e concluíram, sobre a
 * `base` (matrículas não canceladas do curso).
 */
export function lessonSteps(lessons: Array<{ id: string; title: string }>, reach: Map<string, { started: number; completed: number }>, base: number): LessonStep[] {
  return lessons.map((l) => {
    const r = reach.get(l.id);
    const completed = r?.completed ?? 0;
    return { lessonId: l.id, title: l.title, started: r?.started ?? 0, completed, percent: base ? Math.round((completed / base) * 100) : 0 };
  });
}

/** A aula com a maior queda de conclusões em relação à anterior (onde mais gente para). `null` se não há queda. */
export function biggestDrop(steps: LessonStep[]): { index: number; lost: number } | null {
  let best: { index: number; lost: number } | null = null;
  for (let i = 1; i < steps.length; i += 1) {
    const lost = steps[i - 1]!.completed - steps[i]!.completed;
    if (lost > 0 && (!best || lost > best.lost)) best = { index: i, lost };
  }
  return best;
}

/* ------------------------------------------------------------------------ */
/* Filtros, busca e ordem                                                    */
/* ------------------------------------------------------------------------ */

export type Ordem = 'atencao' | 'recentes' | 'progresso' | 'nome';
export const ORDENS: Array<{ value: Ordem; label: string }> = [
  { value: 'atencao', label: 'Atenção primeiro' },
  { value: 'recentes', label: 'Estudo mais recente' },
  { value: 'progresso', label: 'Maior progresso' },
  { value: 'nome', label: 'Nome (A–Z)' },
];

export type Visao = 'matriculas' | 'alunos';

export interface Filters {
  /** uma linha por matrícula (padrão) ou uma por aluno */
  visao: Visao;
  curso: string;
  situacao: Situacao | '';
  q: string;
  ordem: Ordem;
  pagina: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const situacao = one(sp.situacao);
  const ordem = one(sp.ordem);
  const pagina = Number.parseInt(one(sp.pagina), 10);
  return {
    visao: one(sp.visao) === 'alunos' ? 'alunos' : 'matriculas',
    curso: one(sp.curso).trim().slice(0, 120),
    situacao: (SITUACOES as string[]).includes(situacao) ? (situacao as Situacao) : '',
    q: one(sp.q).trim().slice(0, 120),
    ordem: ORDENS.some((o) => o.value === ordem) ? (ordem as Ordem) : 'atencao',
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Link para a mesma tela com alguns filtros trocados (os vazios e os padrões saem da URL). */
export function filtersHref(f: Filters, patch: Partial<Filters>): string {
  const next = { ...f, pagina: 1, ...patch };
  const p = new URLSearchParams();
  if (next.visao === 'alunos') p.set('visao', 'alunos');
  if (next.curso) p.set('curso', next.curso);
  if (next.situacao) p.set('situacao', next.situacao);
  if (next.q) p.set('q', next.q);
  if (next.ordem !== 'atencao') p.set('ordem', next.ordem);
  if (next.pagina > 1) p.set('pagina', String(next.pagina));
  const qs = p.toString();
  return `/estudio/acompanhamento${qs ? `?${qs}` : ''}`;
}

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Busca por nome, e-mail ou RGM, sem diferenciar acentos nem maiúsculas. */
export function matchesSearch(r: TrackRow, q: string): boolean {
  return matchesStudent(r, q);
}

/** Peso da situação na ordem "precisam de atenção primeiro". */
const ATTENTION: Record<Situacao, number> = { parado: 0, nao_comecou: 1, em_dia: 2, concluiu: 3, cancelada: 4 };

export function sortRows(rows: TrackRow[], ordem: Ordem): TrackRow[] {
  const byName = (a: TrackRow, b: TrackRow) => a.student.name.localeCompare(b.student.name, 'pt-BR');
  const t = (d: Date | null) => d?.getTime() ?? 0;
  const list = [...rows];
  switch (ordem) {
    case 'nome':
      return list.sort((a, b) => byName(a, b) || a.course.title.localeCompare(b.course.title, 'pt-BR'));
    case 'progresso':
      return list.sort((a, b) => b.percent - a.percent || t(b.lastStudy) - t(a.lastStudy) || byName(a, b));
    case 'recentes':
      return list.sort((a, b) => t(b.lastStudy) - t(a.lastStudy) || byName(a, b));
    default:
      return list.sort((a, b) => {
        const w = ATTENTION[a.situacao] - ATTENTION[b.situacao];
        if (w) return w;
        // parado: há mais tempo sem estudar primeiro; não começou: matrícula mais antiga primeiro; em dia: menor progresso primeiro
        if (a.situacao === 'parado') return t(a.lastStudy) - t(b.lastStudy) || byName(a, b);
        if (a.situacao === 'nao_comecou') return a.enrolledAt.getTime() - b.enrolledAt.getTime() || byName(a, b);
        if (a.situacao === 'em_dia') return a.percent - b.percent || byName(a, b);
        return t(b.completedAt) - t(a.completedAt) || byName(a, b);
      });
  }
}

/* ------------------------------------------------------------------------ */
/* Visão por aluno (todas as matrículas da pessoa juntas)                    */
/* ------------------------------------------------------------------------ */

export interface StudentRow {
  student: TrackRow['student'];
  /** matrículas não canceladas */
  courses: number;
  counts: Record<Situacao, number>;
  /** média do progresso das matrículas não canceladas (0–100) */
  percent: number;
  lessonsDone: number;
  lessonsTotal: number;
  /** última atividade numa aula de qualquer curso */
  lastStudy: Date | null;
  /** último acesso à plataforma (login ou aula) */
  lastAccess: Date | null;
  /** matrícula mais antiga */
  enrolledAt: Date;
  /**
   * Situação geral: `concluiu` se concluiu todas; senão `em_dia` se está em dia em alguma; senão `parado` se parou em
   * alguma; senão `nao_comecou`. Só canceladas: `cancelada`.
   */
  situacao: Situacao;
  idleDays: number | null;
  certificates: number;
}

export function overallSituacao(counts: Record<Situacao, number>): Situacao {
  const live = counts.concluiu + counts.em_dia + counts.parado + counts.nao_comecou;
  if (!live) return 'cancelada';
  if (counts.concluiu === live) return 'concluiu';
  if (counts.em_dia) return 'em_dia';
  if (counts.parado) return 'parado';
  return 'nao_comecou';
}

const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

export function summarizeByStudent(rows: TrackRow[], now: Date): StudentRow[] {
  const by = new Map<string, TrackRow[]>();
  for (const r of rows) {
    const list = by.get(r.student.id);
    if (list) list.push(r);
    else by.set(r.student.id, [r]);
  }
  return [...by.values()].map((list) => {
    const counts = emptyCounts();
    let lastStudy: Date | null = null;
    let lastAccess: Date | null = null;
    let pct = 0;
    let lessonsDone = 0;
    let lessonsTotal = 0;
    let certificates = 0;
    let enrolledAt = list[0]!.enrolledAt;
    for (const r of list) {
      counts[r.situacao] += 1;
      lastStudy = later(lastStudy, r.lastStudy);
      lastAccess = later(lastAccess, later(r.lastAccess, r.lastStudy));
      if (r.enrolledAt < enrolledAt) enrolledAt = r.enrolledAt;
      if (r.certificate) certificates += 1;
      if (r.situacao === 'cancelada') continue;
      pct += r.percent;
      lessonsDone += r.lessonsDone;
      lessonsTotal += r.lessonsTotal;
    }
    const courses = list.length - counts.cancelada;
    return {
      student: list[0]!.student,
      courses,
      counts,
      percent: courses ? Math.round(pct / courses) : 0,
      lessonsDone,
      lessonsTotal,
      lastStudy,
      lastAccess,
      enrolledAt,
      situacao: overallSituacao(counts),
      idleDays: lastStudy ? Math.max(0, Math.floor((now.getTime() - lastStudy.getTime()) / DAY)) : null,
      certificates,
    };
  });
}

export function sortStudents(rows: StudentRow[], ordem: Ordem): StudentRow[] {
  const byName = (a: StudentRow, b: StudentRow) => a.student.name.localeCompare(b.student.name, 'pt-BR');
  const t = (d: Date | null) => d?.getTime() ?? 0;
  const list = [...rows];
  switch (ordem) {
    case 'nome':
      return list.sort(byName);
    case 'progresso':
      return list.sort((a, b) => b.percent - a.percent || byName(a, b));
    case 'recentes':
      return list.sort((a, b) => t(b.lastStudy) - t(a.lastStudy) || byName(a, b));
    default:
      return list.sort((a, b) => {
        const w = ATTENTION[a.situacao] - ATTENTION[b.situacao];
        if (w) return w;
        if (a.situacao === 'parado') return t(a.lastStudy) - t(b.lastStudy) || byName(a, b);
        if (a.situacao === 'nao_comecou') return a.enrolledAt.getTime() - b.enrolledAt.getTime() || byName(a, b);
        if (a.situacao === 'em_dia') return a.percent - b.percent || byName(a, b);
        return byName(a, b);
      });
  }
}

export function matchesStudent(r: { student: TrackRow['student'] }, q: string): boolean {
  if (!q) return true;
  const needle = fold(q);
  return [r.student.name, r.student.email, r.student.rgm ?? ''].some((v) => fold(v).includes(needle));
}

/* ------------------------------------------------------------------------ */
/* Texto                                                                     */
/* ------------------------------------------------------------------------ */

/** "hoje", "ontem", "há 5 dias", "há 3 semanas", "há 2 meses", "há mais de um ano". */
export function relativeDays(d: Date | null, now: Date): string {
  if (!d) return 'nunca';
  const tz = 'America/Sao_Paulo';
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const days = Math.round((Date.parse(key(now)) - Date.parse(key(d))) / DAY);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 14) return `há ${days} dias`;
  if (days < 60) return `há ${Math.floor(days / 7)} semanas`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return 'há mais de um ano';
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

import { seriesForTrail, trailSlug, type TrailSeries } from '@lms/course-schema';
import type { LearnerCourse } from './learner-courses';

/**
 * Trilha em série (`TRAIL_SERIES` em @lms/course-schema): a vitrine mostra UM cartão que abre as partes, em vez de um
 * cartão por curso. Só apresentação: cursos, matrículas, conquistas e selo seguem como estão. Funções puras.
 */

export type SeriesStatus = 'new' | 'in_progress' | 'completed';

/** O que a série precisa de cada curso (o `LearnerCourse` já traz tudo isto). */
export type SeriesCourseInput = Pick<
  LearnerCourse,
  'slug' | 'trail' | 'enr' | 'shortTitle' | 'totalLessons' | 'completedLessons' | 'isDone' | 'started' | 'startHref' | 'cta' | 'lastActivity' | 'presenter' | 'portrait' | 'tagline' | 'lessons' | 'done' | 'nextLessonIndex'
>;

export interface SeriesPart {
  /** posição na série (Parte 1 = 1) */
  n: number;
  slug: string;
  /** o aluno tem matrícula neste curso (senão: "Ainda não liberado para você") */
  available: boolean;
  title: string;
  fullTitle?: string;
  lessons: number;
  completed: number;
  status: SeriesStatus;
  /** começar/continuar na aula certa; concluída: a página do curso */
  href: string;
  /** página do curso (capítulos) */
  chaptersHref?: string;
  cta: string;
  lessonTitles: string[];
  lessonDone: boolean[];
  nextLessonIndex?: number;
  summary?: string;
}

export interface SeriesCardData {
  trail: string;
  /** chave de URL da trilha (`/aprender/trilhas/<key>`) */
  key: string;
  href: string;
  /** quantas partes tem a série (mesmo as ainda não liberadas) */
  total: number;
  parts: SeriesPart[];
  instructor?: string;
  /** aulas somadas das partes liberadas */
  lessons: number;
  completed: number;
  percent: number;
  status: SeriesStatus;
  /** partes concluídas */
  partsDone: number;
  /** a parte do botão: a primeira não concluída que o aluno pode abrir */
  nextPart?: number;
  cta: { label: string; href: string };
  portrait?: string;
  /** o aluno já tem o Selo DNA Work da trilha */
  badge: boolean;
  /** a trilha tem Selo (checagem final definida) */
  hasBadge: boolean;
  lastActivity: number;
}

/** "3 partes · com Mauro" */
export function seriesMetaCopy(total: number, instructor?: string): string {
  return `${total} ${total === 1 ? 'parte' : 'partes'}${instructor ? ` · com ${instructor}` : ''}`;
}

/** "4 de 12 aulas concluídas" */
export function seriesLessonsCopy(completed: number, lessons: number): string {
  return `${completed} de ${lessons} ${lessons === 1 ? 'aula concluída' : 'aulas concluídas'}`;
}

/** "Parte 2 de 3 · Discordar sem brigar" */
export function partLabel(n: number, total: number): string {
  return `Parte ${n} de ${total}`;
}

/**
 * Monta o cartão da série a partir dos cursos do aluno naquela trilha. Sem nenhum curso da série matriculado: null
 * (nada aparece, como hoje). Partes que o aluno ainda não recebeu entram na lista como "não liberadas".
 */
export function buildSeriesCard(series: TrailSeries, courses: readonly SeriesCourseInput[], opts: { badge?: boolean; hasBadge?: boolean } = {}): SeriesCardData | null {
  const key = trailSlug(series.trail);
  const mine = courses.filter((c) => c.trail && trailSlug(c.trail) === key);
  const parts: SeriesPart[] = series.courses.map((slug, i) => {
    const c = mine.find((x) => x.slug === slug);
    const n = i + 1;
    if (!c) return { n, slug, available: false, title: `Parte ${n}`, lessons: 0, completed: 0, status: 'new', href: '', cta: '', lessonTitles: [], lessonDone: [] };
    const status: SeriesStatus = c.isDone ? 'completed' : c.started ? 'in_progress' : 'new';
    return {
      n,
      slug,
      available: true,
      title: c.shortTitle,
      ...(c.enr.courseTitle !== c.shortTitle ? { fullTitle: c.enr.courseTitle } : {}),
      lessons: c.totalLessons,
      completed: c.isDone ? c.totalLessons : c.completedLessons,
      status,
      href: c.startHref,
      chaptersHref: `/aprender/${c.enr.id}`,
      cta: c.cta,
      lessonTitles: c.lessons.map((l) => l.title),
      lessonDone: c.done,
      ...(c.nextLessonIndex !== undefined ? { nextLessonIndex: c.nextLessonIndex } : {}),
      ...(c.tagline ? { summary: c.tagline } : {}),
    };
  });
  const open = parts.filter((p) => p.available);
  if (open.length === 0) return null;
  const href = `/aprender/trilhas/${key}`;
  const lessons = open.reduce((a, p) => a + p.lessons, 0);
  const completed = open.reduce((a, p) => a + p.completed, 0);
  const partsDone = parts.filter((p) => p.status === 'completed').length;
  const allDone = parts.every((p) => p.available && p.status === 'completed');
  const started = open.some((p) => p.status !== 'new');
  const next = open.find((p) => p.status !== 'completed');
  const status: SeriesStatus = allDone ? 'completed' : started ? 'in_progress' : 'new';
  const cta = allDone ? { label: 'Ver selo', href } : next ? { label: started ? `Continuar parte ${next.n}` : 'Começar', href: next.href } : { label: 'Ver trilha', href };
  const presenters = open.map((p) => mine.find((x) => x.slug === p.slug)?.presenter).filter((x): x is string => !!x);
  const instructor = presenters[0];
  // imagem: o instrutor da parte do botão (ou da primeira liberada)
  const imgFrom = mine.find((x) => x.slug === (next ?? open[0])!.slug)?.portrait ?? mine.find((x) => x.portrait)?.portrait;
  return {
    trail: series.trail,
    key,
    href,
    total: series.courses.length,
    parts,
    ...(instructor ? { instructor } : {}),
    lessons,
    completed,
    percent: allDone ? 100 : lessons > 0 ? Math.round((completed / lessons) * 100) : 0,
    status,
    partsDone,
    ...(next && !allDone ? { nextPart: next.n } : {}),
    cta,
    ...(imgFrom ? { portrait: imgFrom } : {}),
    badge: !!opts.badge,
    hasBadge: opts.hasBadge ?? true,
    lastActivity: Math.max(0, ...mine.map((c) => c.lastActivity)),
  };
}

/** As séries do aluno, na ordem dos nomes de trilha dados; trilhas que não são série não entram. */
export function buildSeriesCards(courses: readonly SeriesCourseInput[], trails: readonly string[], badges: ReadonlySet<string>, hasBadge: (trail: string) => boolean): Map<string, SeriesCardData> {
  const out = new Map<string, SeriesCardData>();
  for (const t of trails) {
    const series = seriesForTrail(t);
    if (!series) continue;
    const card = buildSeriesCard(series, courses, { badge: badges.has(trailSlug(t)), hasBadge: hasBadge(t) });
    if (card) out.set(t, card);
  }
  return out;
}

/** O curso é parte de uma série? (a vitrine e "Continuar assistindo" mostram o nome da trilha e a parte). */
export function seriesInfoFor(c: Pick<LearnerCourse, 'slug' | 'trail'>): { trail: string; part: number; total: number } | null {
  const s = seriesForTrail(c.trail);
  const i = s ? s.courses.indexOf(c.slug) : -1;
  return s && i >= 0 ? { trail: s.trail, part: i + 1, total: s.courses.length } : null;
}

/** Uma parte vista do curso aberto no player. */
export interface SeriesSibling {
  n: number;
  title: string;
  /** o aluno tem matrícula */
  available: boolean;
  done: boolean;
  started: boolean;
  /** a aula certa da matrícula (a em andamento ou a primeira não concluída) */
  href: string;
}

/**
 * Para o fim do curso no player: as outras partes já estão concluídas? E qual abrir depois desta: a seguinte que ainda
 * falta (e que o aluno pode abrir), senão a primeira que falta. `siblings` são as outras partes da série (sem a atual).
 */
export function pickNextPart(currentPart: number, siblings: readonly SeriesSibling[]): { othersDone: boolean; next?: { n: number; title: string; href: string; started: boolean } } {
  const othersDone = siblings.every((p) => p.available && p.done);
  const open = siblings.filter((p) => p.available && !p.done).sort((a, b) => a.n - b.n);
  const pick = open.find((p) => p.n > currentPart) ?? open[0];
  return { othersDone, ...(pick ? { next: { n: pick.n, title: pick.title, href: pick.href, started: pick.started } } : {}) };
}

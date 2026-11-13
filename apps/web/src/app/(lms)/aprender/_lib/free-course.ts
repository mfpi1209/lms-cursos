import { requiredLessonIdsFor, type CourseDocument } from '@lms/course-schema';

/*
 * Curso livre (EaD, 4 a 8 h): dados do cartão da vitrine e o roteiro por MÓDULO da página do curso. Tudo puro, a partir
 * do documento publicado da matrícula e do que o aluno já fez (nada inventado: sem tentativa, a aula é "não iniciada").
 */

/** Cartão de um curso livre na vitrine e em `/aprender/cursos-livres`. */
export interface FreeCourseCardData {
  /** id da matrícula */
  id: string;
  /** página do curso (módulos) */
  href: string;
  /** a aula certa (em andamento ou a próxima); concluído: a página do curso */
  startHref: string;
  title: string;
  summary?: string;
  presenter?: string;
  /** foto do instrutor, sempre do nosso domínio */
  photo?: string;
  /** quadro do vídeo de abertura, se a foto não carregar */
  fallback?: string;
  /** carga horária em minutos */
  workloadMinutes: number;
  modules: number;
  /** todas as aulas da versão matriculada */
  lessons: number;
  /** aulas obrigatórias (base do progresso) e quantas delas estão concluídas */
  required: number;
  completed: number;
  percent: number;
  status: 'new' | 'in_progress' | 'completed';
  /** "Começar", "Continuar módulo 2" ou "Rever o curso" */
  cta: string;
  /** só quando o documento liga o certificado (`certificate.enabled`) */
  certificate: boolean;
}

/** Rótulo da ação do curso livre pelo estado real: o módulo (base 0) da próxima aula entra depois de começar. */
export function freeCourseCta(o: { isDone: boolean; started: boolean; nextModuleIndex: number }): string {
  if (o.isDone) return 'Rever o curso';
  if (!o.started || o.nextModuleIndex < 0) return 'Começar';
  return `Continuar módulo ${o.nextModuleIndex + 1}`;
}

/** A busca do cabeçalho (?q=) acha o curso livre pelo título, instrutor ou resumo. Mesma normalização da vitrine. */
const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function freeCourseMatches(c: Pick<FreeCourseCardData, 'title' | 'presenter' | 'summary'>, query: string | undefined): boolean {
  const q = norm(query?.trim() ?? '');
  return !q || norm(`${c.title} ${c.presenter ?? ''} ${c.summary ?? ''} curso livre cursos livres`).includes(q);
}

export type FreeLessonState = 'completed' | 'in_progress' | 'next' | 'not_started';
export interface Tally {
  total: number;
  /** avaliações: aprovadas; missões: feitas */
  done: number;
  /** avaliações respondidas (aprovadas ou não) */
  answered: number;
}

export interface FreeLessonRow {
  id: string;
  /** posição no curso, base 1 */
  index: number;
  title: string;
  state: FreeLessonState;
  /** andamento da aula em curso (0–100) */
  percent: number;
  /** minutos previstos (roteiro) */
  minutes: number;
  /** conta para concluir o curso */
  required: boolean;
  /** aula acrescentada depois de o aluno concluir: opcional */
  isNew: boolean;
  assessments: Tally;
  missions: Tally;
}

export interface FreeModuleRow {
  id: string;
  /** base 1, contando só módulos com aulas */
  index: number;
  title: string;
  description: string;
  lessons: FreeLessonRow[];
  done: number;
  total: number;
  minutes: number;
  state: 'completed' | 'in_progress' | 'not_started';
  /** o módulo da próxima aula: abre expandido */
  current: boolean;
  assessments: Tally;
  missions: Tally;
}

export interface FreeCourseOutline {
  modules: FreeModuleRow[];
  lessonsTotal: number;
  requiredTotal: number;
  requiredDone: number;
  percent: number;
  assessments: Tally;
  missions: Tally;
  /** próxima aula (em andamento ou a primeira não concluída); ausente com o curso concluído */
  next?: { lessonId: string; lessonIndex: number; moduleIndex: number; title: string; inProgress: boolean };
  /** o que falta para concluir: aulas obrigatórias, avaliações obrigatórias ainda não aprovadas e missões por fazer */
  remaining: { lessons: number; assessments: number; missions: number };
  completed: boolean;
}

export interface FreeCourseProgressInput {
  document: CourseDocument;
  /** estado de cada aula (sem entrada = não iniciada) */
  lessons: Record<string, { kind: 'not_started' | 'in_progress' | 'completed'; percent?: number }>;
  /** resposta mais recente por cena de avaliação (`passed`) */
  answers?: Record<string, { passed?: boolean }>;
  /** registro por cena de missão */
  missions?: Record<string, { status: string }>;
  /** aulas acrescentadas depois de o aluno concluir (opcionais) */
  optionalLessonIds?: readonly string[];
  /** matrícula concluída */
  completed: boolean;
}

const tally = (): Tally => ({ total: 0, done: 0, answered: 0 });
const add = (a: Tally, b: Tally): Tally => ({ total: a.total + b.total, done: a.done + b.done, answered: a.answered + b.answered });

/**
 * Roteiro do curso livre por módulo: estado de cada aula (concluída, em andamento, próxima, não iniciada), avaliações e
 * missões por módulo e o que falta para concluir. A conclusão do curso segue a regra da plataforma (todas as aulas
 * obrigatórias); avaliações e missões aparecem como pendência dentro das aulas, sem mudar a regra.
 */
export function buildFreeCourseOutline(input: FreeCourseProgressInput): FreeCourseOutline {
  const { document, completed } = input;
  const optional = new Set(input.optionalLessonIds ?? []);
  const required = new Set(requiredLessonIdsFor(document, optional));
  const answers = input.answers ?? {};
  const missions = input.missions ?? {};
  const kindOf = (id: string) => input.lessons[id]?.kind ?? 'not_started';

  const flat = document.modules.flatMap((m) => m.lessons);
  // próxima aula: a em andamento; senão a primeira não concluída (curso concluído: nenhuma)
  const inProgress = flat.find((l) => kindOf(l.id) === 'in_progress');
  const nextLesson = completed ? undefined : (inProgress ?? flat.find((l) => kindOf(l.id) !== 'completed'));

  let n = 0;
  let pendingAssessments = 0;
  const modules: FreeModuleRow[] = document.modules
    .filter((m) => m.lessons.length > 0)
    .map((m, mi) => {
      const lessons: FreeLessonRow[] = m.lessons.map((l) => {
        n += 1;
        const kind = kindOf(l.id);
        const isNew = completed && optional.has(l.id);
        const a = tally();
        const ms = tally();
        for (const node of l.graph.nodes) {
          if (node.type === 'assessment') {
            const ans = answers[node.id];
            a.total += 1;
            if (ans) a.answered += 1;
            if (ans?.passed === true) a.done += 1;
            else if (node.required !== false && required.has(l.id) && !completed) pendingAssessments += 1;
          } else if (node.type === 'mission') {
            ms.total += 1;
            if (missions[node.id]) ms.answered += 1;
            if (missions[node.id]?.status === 'done') ms.done += 1;
          }
        }
        const state: FreeLessonState = kind === 'completed' ? 'completed' : kind === 'in_progress' ? 'in_progress' : nextLesson?.id === l.id ? 'next' : 'not_started';
        const percent = kind === 'completed' ? 100 : kind === 'in_progress' ? Math.max(0, Math.min(100, Math.round(input.lessons[l.id]?.percent ?? 0))) : 0;
        return { id: l.id, index: n, title: l.title, state, percent, minutes: Number.isFinite(l.estimatedMinutes) ? Math.max(0, l.estimatedMinutes) : 0, required: required.has(l.id), isNew, assessments: a, missions: ms };
      });
      const done = lessons.filter((l) => l.state === 'completed').length;
      const state = done === lessons.length ? 'completed' : done > 0 || lessons.some((l) => l.state === 'in_progress') ? 'in_progress' : 'not_started';
      return {
        id: m.id,
        index: mi + 1,
        title: m.title,
        description: m.description ?? '',
        lessons,
        done,
        total: lessons.length,
        minutes: lessons.reduce((t, l) => t + l.minutes, 0),
        state,
        current: !!nextLesson && lessons.some((l) => l.id === nextLesson.id),
        assessments: lessons.reduce((t, l) => add(t, l.assessments), tally()),
        missions: lessons.reduce((t, l) => add(t, l.missions), tally()),
      };
    });

  const rows = modules.flatMap((m) => m.lessons);
  const requiredRows = rows.filter((l) => l.required);
  const requiredDone = requiredRows.filter((l) => l.state === 'completed').length;
  const assessments = modules.reduce((t, m) => add(t, m.assessments), tally());
  const missionTally = modules.reduce((t, m) => add(t, m.missions), tally());
  const nextRow = nextLesson ? rows.find((l) => l.id === nextLesson.id) : undefined;
  const nextModule = nextRow ? modules.find((m) => m.lessons.includes(nextRow)) : undefined;
  return {
    modules,
    lessonsTotal: rows.length,
    requiredTotal: requiredRows.length,
    requiredDone: completed ? requiredRows.length : requiredDone,
    percent: completed ? 100 : requiredRows.length ? Math.round((requiredDone / requiredRows.length) * 100) : 0,
    assessments,
    missions: missionTally,
    ...(nextRow && nextModule ? { next: { lessonId: nextRow.id, lessonIndex: nextRow.index, moduleIndex: nextModule.index, title: nextRow.title, inProgress: nextRow.state === 'in_progress' } } : {}),
    remaining: { lessons: completed ? 0 : requiredRows.length - requiredDone, assessments: completed ? 0 : pendingAssessments, missions: missionTally.total - missionTally.done },
    completed,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Faltam 18 aulas obrigatórias e 20 avaliações." / "Você concluiu este curso." (frase única, para a página e o leitor
 * de tela). Missões ficam fora da frase: aparecem na lista, mas não travam o curso.
 */
export function remainingCopy(o: Pick<FreeCourseOutline, 'remaining' | 'completed'>): string {
  if (o.completed) return 'Você concluiu este curso.';
  const parts = [
    o.remaining.lessons > 0 ? plural(o.remaining.lessons, 'aula obrigatória', 'aulas obrigatórias') : null,
    o.remaining.assessments > 0 ? plural(o.remaining.assessments, 'avaliação', 'avaliações') : null,
  ].filter((x): x is string => !!x);
  if (parts.length === 0) return 'Nenhuma pendência neste curso.';
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]!}`;
  const one = /^1 /.test(parts[0]!) && parts.length === 1;
  return `${one ? 'Falta' : 'Faltam'} ${list}.`;
}

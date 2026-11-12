import type { CourseDocument, Lesson } from './course';
import type { AnyNode } from './nodes';
import { richTextToPlain } from './richtext';
import { spokenWords } from './direction';
import type { CompileIssue } from './compile';

/*
 * Guarda de extensão do curso: estima quanto tempo cada aula toma (texto lido,
 * fala e decisões) e avisa quando uma aula ou o curso passam do razoável.
 * Avisos editoriais: nunca bloqueiam a publicação.
 */

export type CourseFormat = 'micro' | 'ead';

export interface LengthProfile {
  /** minutos estimados por aula a partir dos quais a aula é longa demais */
  lessonMaxMinutes: number;
  /** cenas (sem contar o encerramento) a partir das quais a aula é longa demais */
  lessonMaxScenes: number;
  /** fator sobre a duração alvo a partir do qual o curso é longo demais */
  courseTolerance: number;
  /** palavras de fala por cena de vídeo: acima disso, `NARRATION_TOO_LONG` */
  narrationMaxWords: number;
  /** palavras de fala por cena de vídeo: abaixo disso, `NARRATION_SHORT` */
  narrationMinWords: number;
}

/**
 * Limites editoriais por formato de curso (`brief.format`). É a única tabela:
 * ajuste os números aqui. `micro` (padrão, aulas de poucos minutos) reproduz
 * os avisos de sempre; `ead` serve cursos de 4 a 8 h, aulas de até 30 min.
 */
export const LENGTH_PROFILES: Record<CourseFormat, LengthProfile> = {
  micro: { lessonMaxMinutes: 6, lessonMaxScenes: 9, courseTolerance: 1.5, narrationMaxWords: 120, narrationMinWords: 60 },
  ead: { lessonMaxMinutes: 30, lessonMaxScenes: 40, courseTolerance: 1, narrationMaxWords: 300, narrationMinWords: 40 },
};

export function lengthProfile(format?: CourseFormat): LengthProfile {
  return LENGTH_PROFILES[format ?? 'micro'];
}

/** Minutos por aula a partir dos quais a aula é considerada longa demais (perfil `micro`). */
export const LESSON_MAX_EST_MINUTES = LENGTH_PROFILES.micro.lessonMaxMinutes;
/** Cenas (sem contar o encerramento) a partir das quais a aula é longa demais (perfil `micro`). */
export const LESSON_MAX_SCENES = LENGTH_PROFILES.micro.lessonMaxScenes;
/** Fator sobre a duração alvo a partir do qual o curso é longo demais (perfil `micro`). */
export const COURSE_LENGTH_TOLERANCE = LENGTH_PROFILES.micro.courseTolerance;
/** Palavras lidas por minuto (texto da tela). */
export const READING_WPM = 200;
/** Palavras faladas por segundo em português. */
export const SPOKEN_WPS = 2.6;
/** Minutos que uma decisão toma (ler as opções e escolher). */
export const DECISION_MINUTES = 0.5;

export interface LessonLengthReport {
  lessonId: string;
  title: string;
  /** cenas que o aluno vê (tudo menos o encerramento) */
  scenes: number;
  decisions: number;
  screenWords: number;
  spokenWords: number;
  /** minutos estimados: leitura + fala + decisões */
  estMinutes: number;
}

export interface CourseLengthReport {
  lessons: LessonLengthReport[];
  totals: { scenes: number; decisions: number; screenWords: number; spokenWords: number; estMinutes: number };
  targetMinutes: number;
  warnings: CompileIssue[];
}

const words = (s: string) => spokenWords(s).length;

/** Texto que aparece na tela para o aluno (corpo, pergunta, opções, orientação, retorno). */
export function nodeScreenWords(n: AnyNode): number {
  switch (n.type) {
    case 'scenario':
    case 'content':
      return words(richTextToPlain(n.body));
    case 'consequence':
      return words(richTextToPlain(n.body)) + words(richTextToPlain(n.guidance));
    case 'choice':
      return words(richTextToPlain(n.prompt)) + n.options.reduce((a, o) => a + words(o.label) + words(richTextToPlain(o.feedback)), 0);
    case 'reflection':
      // composição guiada: o molde e os blocos também ficam na tela
      return words(richTextToPlain(n.prompt)) + (n.scaffold ? words(n.scaffold.template.replace(/\{[^}]*\}/g, ' ')) + n.scaffold.slots.reduce((a, s) => a + s.options.reduce((b, o) => b + words(o), 0), 0) : 0);
    case 'mission':
      return words(n.intro) + words(n.action) + words(n.alternative) + words(n.tip ?? '') + words(n.example ?? '');
    case 'assessment':
      return words(richTextToPlain(n.prompt)) + n.options.reduce((a, o) => a + words(o.label) + words(richTextToPlain(o.feedback)), 0) + words(richTextToPlain(n.feedbackPassed)) + words(richTextToPlain(n.feedbackFailed));
    case 'end':
      return words(richTextToPlain(n.summary));
    default:
      return 0;
  }
}

/** Palavras faladas pela pessoa apresentadora (só a fala escrita; sem fala, nada é contado). */
export function nodeSpokenWords(n: AnyNode): number {
  return 'narration' in n && typeof n.narration === 'string' ? words(n.narration) : 0;
}

/** Minutos estimados: leitura a 200 palavras/min + fala a 2,6 palavras/s + meio minuto por decisão. */
export function estimateMinutes(r: { screenWords: number; spokenWords: number; decisions: number }): number {
  return r.screenWords / READING_WPM + r.spokenWords / SPOKEN_WPS / 60 + r.decisions * DECISION_MINUTES;
}

export function lessonLengthReport(lesson: Lesson): LessonLengthReport {
  const nodes = lesson.graph.nodes;
  const scenes = nodes.filter((n) => n.type !== 'end').length;
  const decisions = nodes.filter((n) => n.type === 'choice').length;
  const screenWords = nodes.reduce((a, n) => a + nodeScreenWords(n), 0);
  const spoken = nodes.reduce((a, n) => a + nodeSpokenWords(n), 0);
  const estMinutes = Math.round(estimateMinutes({ screenWords, spokenWords: spoken, decisions }) * 10) / 10;
  return { lessonId: lesson.id, title: lesson.title, scenes, decisions, screenWords, spokenWords: spoken, estMinutes };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * Relatório de extensão do curso: por aula e totais, com avisos
 * `LESSON_TOO_LONG` (cenas ou estimativa acima do perfil do formato: micro 9 cenas
 * e 6 min, ead 40 e 30) e `COURSE_TOO_LONG` (total estimado > tolerância × duração alvo).
 */
export function courseLengthReport(doc: CourseDocument): CourseLengthReport {
  const lessons = doc.modules.flatMap((m) => m.lessons).map(lessonLengthReport);
  const totals = lessons.reduce(
    (t, l) => ({ scenes: t.scenes + l.scenes, decisions: t.decisions + l.decisions, screenWords: t.screenWords + l.screenWords, spokenWords: t.spokenWords + l.spokenWords, estMinutes: t.estMinutes + l.estMinutes }),
    { scenes: 0, decisions: 0, screenWords: 0, spokenWords: 0, estMinutes: 0 },
  );
  totals.estMinutes = Math.round(totals.estMinutes * 10) / 10;
  const targetMinutes = doc.brief.targetMinutes;
  const profile = lengthProfile(doc.brief.format);
  const warnings: CompileIssue[] = [];
  for (const l of lessons) {
    const reasons: string[] = [];
    if (l.scenes > profile.lessonMaxScenes) reasons.push(`${l.scenes} cenas (recomendado até ${profile.lessonMaxScenes})`);
    if (l.estMinutes > profile.lessonMaxMinutes) reasons.push(`cerca de ${fmt(l.estMinutes)} min (recomendado até ${profile.lessonMaxMinutes})`);
    if (reasons.length) {
      const advice = doc.brief.format === 'ead' ? 'Divida a aula em duas ou encurte as cenas.' : 'Encurte para uma situação, uma decisão com três opções, as consequências e uma dica.';
      warnings.push({ code: 'LESSON_TOO_LONG', lessonId: l.lessonId, message: `A aula "${l.title}" está longa: ${reasons.join('; ')}. ${advice}` });
    }
  }
  const limit = targetMinutes * profile.courseTolerance;
  if (lessons.length && totals.estMinutes > limit) {
    warnings.push({ code: 'COURSE_TOO_LONG', message: `O curso está longo: cerca de ${fmt(totals.estMinutes)} min estimados para uma meta de ${targetMinutes} min (limite ${fmt(limit)}). Encurte as aulas mais longas ou ajuste a duração alvo.` });
  }
  return { lessons, totals, targetMinutes, warnings };
}

/**
 * Carga horária do curso em minutos: a declarada em `certificate.workloadMinutes`
 * ou, sem ela, a soma do `estimatedMinutes` das aulas.
 */
export function courseWorkloadMinutes(doc: CourseDocument): number {
  const declared = doc.certificate?.workloadMinutes;
  if (declared !== undefined) return declared;
  return doc.modules.reduce((t, m) => t + m.lessons.reduce((a, l) => a + (Number.isFinite(l.estimatedMinutes) ? Math.max(0, l.estimatedMinutes) : 0), 0), 0);
}

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

/** Minutos por aula a partir dos quais a aula é considerada longa demais. */
export const LESSON_MAX_EST_MINUTES = 6;
/** Cenas (sem contar o encerramento) a partir das quais a aula é longa demais. */
export const LESSON_MAX_SCENES = 9;
/** Fator sobre a duração alvo a partir do qual o curso é longo demais. */
export const COURSE_LENGTH_TOLERANCE = 1.5;
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
 * `LESSON_TOO_LONG` (cenas > 9 ou estimativa > 6 min) e `COURSE_TOO_LONG`
 * (total estimado > 1,5 × duração alvo).
 */
export function courseLengthReport(doc: CourseDocument): CourseLengthReport {
  const lessons = doc.modules.flatMap((m) => m.lessons).map(lessonLengthReport);
  const totals = lessons.reduce(
    (t, l) => ({ scenes: t.scenes + l.scenes, decisions: t.decisions + l.decisions, screenWords: t.screenWords + l.screenWords, spokenWords: t.spokenWords + l.spokenWords, estMinutes: t.estMinutes + l.estMinutes }),
    { scenes: 0, decisions: 0, screenWords: 0, spokenWords: 0, estMinutes: 0 },
  );
  totals.estMinutes = Math.round(totals.estMinutes * 10) / 10;
  const targetMinutes = doc.brief.targetMinutes;
  const warnings: CompileIssue[] = [];
  for (const l of lessons) {
    const reasons: string[] = [];
    if (l.scenes > LESSON_MAX_SCENES) reasons.push(`${l.scenes} cenas (recomendado até ${LESSON_MAX_SCENES})`);
    if (l.estMinutes > LESSON_MAX_EST_MINUTES) reasons.push(`cerca de ${fmt(l.estMinutes)} min (recomendado até ${LESSON_MAX_EST_MINUTES})`);
    if (reasons.length) {
      warnings.push({ code: 'LESSON_TOO_LONG', lessonId: l.lessonId, message: `A aula "${l.title}" está longa: ${reasons.join('; ')}. Encurte para uma situação, uma decisão com três opções, as consequências e uma dica.` });
    }
  }
  const limit = targetMinutes * COURSE_LENGTH_TOLERANCE;
  if (lessons.length && totals.estMinutes > limit) {
    warnings.push({ code: 'COURSE_TOO_LONG', message: `O curso está longo: cerca de ${fmt(totals.estMinutes)} min estimados para uma meta de ${targetMinutes} min (limite ${fmt(limit)}). Encurte as aulas mais longas ou ajuste a duração alvo.` });
  }
  return { lessons, totals, targetMinutes, warnings };
}

import { richTextToPlain, type AnyNode, type ChoiceQuality, type LessonGraph } from '@lms/course-schema';
import { mergeAnswers, type AnswerLike, type CourseAnswer } from './recap';
import type { AttemptState } from './state';

/** Marca exibida ao aluno: forte, ou pode melhorar (nunca "errado"). */
export type ReviewMark = 'strong' | 'improve';

export const REVIEW_MARK_LABELS: Record<ReviewMark, string> = { strong: 'Forte', improve: 'Pode melhorar' };

export interface ReviewItem {
  nodeId: string;
  /** a pergunta (enunciado da decisão, em texto) */
  question: string;
  /** rótulo da opção escolhida; `null` = ainda não respondida */
  answer: string | null;
  /** `null` quando não respondida ou quando a opção não marca qualidade */
  mark: ReviewMark | null;
  quality?: ChoiceQuality;
  /** a primeira frase do retorno da opção (a dica de uma linha) */
  tip: string | null;
}

export interface ReviewSummary {
  items: ReviewItem[];
  /** respostas com marca "Forte" */
  strong: number;
  /** decisões respondidas que têm marca (o denominador de "3 de 4") */
  marked: number;
  answered: number;
  total: number;
  /** "3 de 4 respostas fortes" (ou `null` se nada foi marcado) */
  headline: string | null;
}

export function reviewMarkOf(quality: ChoiceQuality | undefined): ReviewMark | null {
  if (!quality) return null;
  return quality === 'strong' ? 'strong' : 'improve';
}

/** Primeira frase do retorno (até ~160 caracteres): a dica de uma linha. */
export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = /^(.+?[.!?…])(?=["”»)]?\s|["”»)]?$)(["”»)]?)/u.exec(t);
  const s = m ? `${m[1]}${m[2] ?? ''}` : t;
  return s.length > 160 ? `${s.slice(0, 157).trimEnd()}…` : s;
}

/**
 * Revisão das decisões de uma cena de resultado (`ContentNode.reviewNodeIds`):
 * a pergunta, a resposta escolhida, a marca (da `quality` da opção) e a dica.
 * Puro: usa só as respostas (tentativa atual + curso, se informado).
 */
export function resolveReview(
  graph: LessonGraph,
  reviewNodeIds: readonly string[],
  state: Pick<AttemptState, 'answers'> | null | undefined,
  opts: { answers?: Record<string, CourseAnswer | AnswerLike>; lookupNode?: (id: string) => AnyNode | undefined } = {},
): ReviewSummary {
  const local = new Map<string, AnyNode>(graph.nodes.map((n) => [n.id, n]));
  const answers = opts.answers ? mergeAnswers(state?.answers, opts.answers) : (state?.answers ?? {});
  const items: ReviewItem[] = [];
  for (const id of reviewNodeIds) {
    const node = local.get(id) ?? opts.lookupNode?.(id);
    if (!node || node.type !== 'choice') continue;
    const question = richTextToPlain(node.prompt).replace(/\s+/g, ' ').trim() || node.title || id;
    const optionId = answers[id]?.optionIds?.[0];
    const option = optionId ? node.options.find((o) => o.id === optionId) : undefined;
    items.push({
      nodeId: id,
      question,
      answer: option?.label.trim() ?? null,
      mark: option ? reviewMarkOf(option.quality) : null,
      ...(option?.quality ? { quality: option.quality } : {}),
      tip: option ? firstSentence(richTextToPlain(option.feedback)) || null : null,
    });
  }
  const answered = items.filter((i) => i.answer !== null).length;
  const marked = items.filter((i) => i.mark !== null).length;
  const strong = items.filter((i) => i.mark === 'strong').length;
  const headline = marked > 0 ? `${strong} de ${marked} ${marked === 1 ? 'resposta forte' : 'respostas fortes'}` : null;
  return { items, strong, marked, answered, total: items.length, headline };
}

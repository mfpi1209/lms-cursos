import { richTextToPlain } from './richtext';
import type { LessonGraph } from './graph';
import type { AnyNode } from './nodes';

/**
 * Estúdio com zonas: dados das camadas da CENA que vêm do grafo da aula
 * (resolvidos no pedido de produção, entram no hash só quando presentes).
 * - pergunta a seguir: a cena narrada cujo PRÓXIMO nó é uma decisão mostra,
 *   nos últimos ≈ 3 s, o cartão "A seguir" com a pergunta (≤ 12 palavras);
 * - letreiro com o nome: na PRIMEIRA cena narrada da aula.
 */

/** Tipos de nó com vídeo da apresentadora (mesma lista do estúdio/worker). */
const NARRATED_TYPES = new Set(['scenario', 'content', 'choice', 'consequence']);

/** Palavras máximas da pergunta no cartão "A seguir". */
export const TEASER_QUESTION_WORDS = 12;

function spokenOf(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

/** O nó tem vídeo da apresentadora (tipo narrado com fala ou texto)? */
export function isNarratedNode(n: AnyNode): boolean {
  return NARRATED_TYPES.has(n.type) && spokenOf(n).length > 0;
}

/** Primeira cena narrada da aula: o nó inicial, se narrado; senão a primeira narrada na ordem do grafo. */
export function firstNarratedNodeId(graph: Pick<LessonGraph, 'nodes' | 'startNodeId'>): string | undefined {
  const start = graph.nodes.find((n) => n.id === graph.startNodeId);
  if (start && isNarratedNode(start)) return start.id;
  return graph.nodes.find(isNarratedNode)?.id;
}

const clipWords = (s: string, n: number) => {
  const w = s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ').replace(/[,;:]+$/, '')}…`;
};

/**
 * Pergunta curta de uma decisão: a ÚLTIMA frase interrogativa do enunciado
 * (ou da fala), senão o título; até 12 palavras.
 */
export function decisionQuestion(choice: Extract<AnyNode, { type: 'choice' }>): string {
  for (const text of [richTextToPlain(choice.prompt), choice.narration ?? '']) {
    const questions = (text.replace(/\s+/g, ' ').match(/[^.!?…]*\?/g) ?? []).map((q) => q.trim().replace(/^["'“”«»\-–—\s]+/, '')).filter((q) => q.length > 3);
    if (questions.length) return clipWords(questions[questions.length - 1]!, TEASER_QUESTION_WORDS);
  }
  return clipWords(choice.title ?? '', TEASER_QUESTION_WORDS);
}

/**
 * Pergunta da decisão que vem LOGO depois da cena `nodeId` (o próximo nó de
 * uma cena narrada que não é decisão); undefined quando o próximo não é uma
 * decisão ou quando há mais de um caminho possível.
 */
export function nextDecisionQuestion(graph: Pick<LessonGraph, 'nodes' | 'edges'>, nodeId: string): string | undefined {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.type === 'choice' || !isNarratedNode(node)) return undefined;
  const targets = [...new Set(graph.edges.filter((e) => e.from === nodeId).map((e) => e.to))];
  if (targets.length !== 1) return undefined;
  const next = graph.nodes.find((n) => n.id === targets[0]);
  if (!next || next.type !== 'choice') return undefined;
  const q = decisionQuestion(next);
  return q || undefined;
}

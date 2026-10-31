import { richTextToPlain, type RichTextDocument } from './richtext';
import type { LessonGraph } from './graph';
import type { AnyNode, ChoiceNode, ChoiceOption, ChoiceQuality, ConsequenceNode, MediaRef } from './nodes';

/*
 * Reação da instrutora a cada resposta (A14).
 *
 * Cada opção de decisão pode ter `reaction` = { text, media? }: depois de
 * confirmar a escolha, o player toca a reação daquela opção e só então mostra
 * "Sua escolha" (com ▶ Assistir da cena seguinte). Sem vídeo, nada muda.
 *
 * Produção: a reação é uma CENA DE MÍDIA própria, sem virar nó do grafo (a
 * estrutura da aula não muda, então as matrículas seguem para a versão nova).
 * O alvo do job é `reactionTargetId(choiceId, optionId)` ("q01~a"): o "~" nunca
 * aparece num id de nó (NodeIdSchema), então não há colisão. O pipeline trata o
 * alvo como uma cena narrada de plano único na câmera principal (frente/3/4 do
 * kit), sem pílulas nem cartões, com marca d'água e legenda.
 */

export const REACTION_SEP = '~';

/** Alvo de mídia da reação de uma opção. */
export function reactionTargetId(choiceId: string, optionId: string): string {
  return `${choiceId}${REACTION_SEP}${optionId}`;
}

/** Decisão e opção de um alvo de reação; null quando o id é de um nó comum. */
export function parseReactionTarget(targetId: string): { choiceId: string; optionId: string } | null {
  const i = targetId.indexOf(REACTION_SEP);
  if (i <= 0 || i === targetId.length - 1) return null;
  return { choiceId: targetId.slice(0, i), optionId: targetId.slice(i + 1) };
}

/** Gesto da reação pela qualidade da resposta (SAFE_GESTURES). */
export const REACTION_GESTURE: Record<ChoiceQuality | 'none', string> = {
  strong: 'smiles broadly, pleased',
  ok: 'nods slowly, warm',
  weak: 'relaxes the shoulders and smiles, reassuring',
  none: 'nods slowly, warm',
};

/** Palavras recomendadas para 5 a 10 s de fala. */
export const REACTION_WORDS = { min: 8, max: 26 } as const;

/**
 * Cena de produção da reação (nó "consequência" sintético, nunca gravado no
 * grafo): fala = texto da reação; mídia = a da reação; sem direção (plano único).
 */
export function reactionScene(choice: ChoiceNode, option: ChoiceOption): ConsequenceNode | null {
  const text = option.reaction?.text?.trim();
  if (!text) return null;
  const label = option.label.replace(/^["“”]+|["“”]+$/g, '').trim();
  return {
    id: reactionTargetId(choice.id, option.id),
    type: 'consequence',
    title: `Reação: ${label}`.slice(0, 120),
    objectiveIds: [],
    required: false,
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    narration: text,
    motionPrompt: REACTION_GESTURE[option.quality ?? 'none'],
    tone: option.quality === 'strong' ? 'positive' : 'neutral',
    ...(option.reaction?.media ? { media: option.reaction.media } : {}),
  };
}

/** Cenas de produção de todas as reações com texto da aula (para o orçamento e a contagem de vídeos). */
export function reactionScenes(graph: Pick<LessonGraph, 'nodes'>): ConsequenceNode[] {
  const out: ConsequenceNode[] = [];
  for (const n of graph.nodes) {
    if (n.type !== 'choice') continue;
    for (const o of n.options) {
      const sc = reactionScene(n, o);
      if (sc) out.push(sc);
    }
  }
  return out;
}

/** Cena de mídia de um alvo: o nó do grafo ou a cena sintética da reação. */
export function mediaSceneOf(graph: Pick<LessonGraph, 'nodes'>, targetId: string): AnyNode | null {
  const node = graph.nodes.find((n) => n.id === targetId);
  if (node) return node;
  const t = parseReactionTarget(targetId);
  if (!t) return null;
  const choice = graph.nodes.find((n) => n.id === t.choiceId);
  if (!choice || choice.type !== 'choice') return null;
  const option = choice.options.find((o) => o.id === t.optionId);
  return option ? reactionScene(choice, option) : null;
}

export interface ReactionStatus {
  choiceId: string;
  optionId: string;
  targetId: string;
  text: string | null;
  hasVideo: boolean;
  stale: boolean;
}

/** Situação das reações de cada opção da aula. */
export function reactionStatuses(graph: Pick<LessonGraph, 'nodes'>): ReactionStatus[] {
  const out: ReactionStatus[] = [];
  for (const n of graph.nodes) {
    if (n.type !== 'choice') continue;
    for (const o of n.options) {
      const m = o.reaction?.media;
      out.push({ choiceId: n.id, optionId: o.id, targetId: reactionTargetId(n.id, o.id), text: o.reaction?.text?.trim() || null, hasVideo: m?.kind === 'video', stale: m?.stale === true });
    }
  }
  return out;
}

/** Grava a mídia no alvo de reação (cópia da decisão); null = opção não encontrada. */
export function withReactionMedia(choice: ChoiceNode, optionId: string, media: MediaRef | null): ChoiceNode | null {
  const idx = choice.options.findIndex((o) => o.id === optionId);
  if (idx < 0) return null;
  const o = choice.options[idx]!;
  if (!o.reaction?.text) return null;
  const reaction = { ...o.reaction };
  if (media) reaction.media = media;
  else delete reaction.media;
  const options = choice.options.slice();
  options[idx] = { ...o, reaction };
  return { ...choice, options };
}

/** Troca o texto da reação; o vídeo já gravado fica desatualizado quando a fala muda. */
export function withReactionText(option: ChoiceOption, text: string): ChoiceOption {
  const t = text.trim();
  if (!t) return option;
  if (option.reaction?.text?.trim() === t) return option;
  const media = option.reaction?.media ? { media: { ...option.reaction.media, stale: true } } : {};
  return { ...option, reaction: { text: t, ...media } };
}

/* ------------------------------------------------------------------ */
/* Texto padrão a partir do retorno da opção                           */
/* ------------------------------------------------------------------ */

/** Aberturas por qualidade: acolhem, sem julgar (giram pela posição para não repetir). */
export const REACTION_OPENERS: Record<ChoiceQuality | 'none', readonly string[]> = {
  strong: ['Boa escolha!', 'Isso mesmo!', 'Mandou bem!', 'Exatamente!'],
  ok: ['Quase lá.', 'Bom começo.', 'Faz sentido, mas dá para ir além.', 'Tem um caminho ainda melhor.'],
  weak: ['Entendo por que você pensou nisso.', 'Muita gente responderia assim.', 'Vamos olhar isso com calma.', 'Faz sentido pensar assim, mas repara.'],
  none: ['Vamos ver.', 'Olha só.'],
};

function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Reação padrão (sem custo) a partir do retorno escrito da opção: abertura pela
 * qualidade + a explicação (primeira frase do retorno). Quando a explicação é
 * curta, entra também a dica ("Faça assim: x" vira "x", no imperativo), até
 * ~26 palavras (5 a 10 s de fala). `index` gira as aberturas.
 */
export function reactionFromFeedback(feedback: RichTextDocument | string | undefined, quality: ChoiceQuality | undefined, index = 0): string | null {
  const plain = (typeof feedback === 'string' ? feedback : richTextToPlain(feedback)).replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  const openers = REACTION_OPENERS[quality ?? 'none'];
  const opener = openers[((index % openers.length) + openers.length) % openers.length]!;
  const parts = sentences(plain);
  const tipAt = parts.findIndex((s) => /^faça assim\s*:/i.test(s));
  const explain = (tipAt === 0 ? [] : parts.slice(0, tipAt < 0 ? parts.length : tipAt)).slice(0, 1);
  const tip = tipAt >= 0 ? parts.slice(tipAt).join(' ').replace(/^faça assim\s*:\s*/i, '').trim() : '';
  const tipSentence = tip ? tip.charAt(0).toUpperCase() + tip.slice(1) : '';
  let text = [opener, ...explain].join(' ');
  if (tipSentence && (explain.length === 0 || words(text) + words(tipSentence) <= REACTION_WORDS.max) && words(explain.join(' ')) < 12) text = `${text} ${tipSentence}`;
  return text.trim();
}

/** Opções da decisão com a reação padrão onde ainda não há reação. */
export function withDefaultReactions(choice: ChoiceNode, startIndex = 0): ChoiceNode {
  let changed = false;
  const options = choice.options.map((o, i) => {
    if (o.reaction?.text?.trim()) return o;
    const text = reactionFromFeedback(o.feedback, o.quality, startIndex + i);
    if (!text) return o;
    changed = true;
    return { ...o, reaction: { text: text.slice(0, 400) } };
  });
  return changed ? { ...choice, options } : choice;
}

/** Aplica a reação padrão a todas as decisões da aula (sem tocar no que já existe). */
export function applyDefaultReactions<G extends Pick<LessonGraph, 'nodes'>>(graph: G, startIndex = 0): { graph: G; changed: string[] } {
  const changed: string[] = [];
  let k = startIndex;
  const nodes = graph.nodes.map((n) => {
    if (n.type !== 'choice') return n;
    const next = withDefaultReactions(n, k);
    k += n.options.length;
    if (next !== n) changed.push(n.id);
    return next;
  });
  return { graph: { ...graph, nodes }, changed };
}

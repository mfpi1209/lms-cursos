import type { AnyNode, CompileIssue, ExecutableNodeType, LessonGraph, NodeType } from '@lms/course-schema';
import { incomingEdges, orderedNodes, primaryEdge } from '@/components/studio/graph-ops';

/**
 * Modelo do roteiro: como o autor vê a aula — uma sequência de cenas. Tudo
 * aqui é puro e derivado do grafo; nada é persistido.
 */

export interface SceneTypeInfo {
  label: string;
  /** uma frase, linguagem de autor, para o seletor de cena */
  description: string;
  dot: string;
}

export const SCENE_TYPES: Record<ExecutableNodeType, SceneTypeInfo> = {
  scenario: { label: 'Situação', description: 'Apresenta o contexto: quem está envolvido, onde e o que está acontecendo.', dot: 'bg-fg-muted' },
  content: { label: 'Explicação', description: 'Conteúdo direto: um conceito, um passo a passo, uma dica.', dot: 'bg-fg-muted' },
  choice: { label: 'Decisão', description: 'Uma pergunta com opções. Cada opção leva a uma cena diferente.', dot: 'bg-accent' },
  consequence: { label: 'O que acontece', description: 'O resultado de uma escolha, com o que levar disso.', dot: 'bg-fg-muted' },
  reflection: { label: 'Reflexão', description: 'Uma pergunta aberta; a pessoa escreve a própria resposta.', dot: 'bg-fg-muted' },
  mission: { label: 'Leve para a vida real', description: 'Uma ação para fazer fora da plataforma, com alternativa para quem ainda não trabalha. Nunca trava a aula.', dot: 'bg-accent' },
  assessment: { label: 'Verificação', description: 'Pergunta com alternativas certas e erradas para checar o aprendizado.', dot: 'bg-accent' },
  end: { label: 'Encerramento', description: 'Fecha a aula com um resumo do que ficou.', dot: 'bg-fg-faint' },
};

export const SCENE_TYPE_ORDER: ExecutableNodeType[] = ['scenario', 'content', 'choice', 'consequence', 'reflection', 'mission', 'assessment', 'end'];

export function sceneTypeLabel(type: NodeType): string {
  return (SCENE_TYPES as Partial<Record<NodeType, SceneTypeInfo>>)[type]?.label ?? 'Cena (em breve)';
}

export function sceneTypeDot(type: NodeType): string {
  return (SCENE_TYPES as Partial<Record<NodeType, SceneTypeInfo>>)[type]?.dot ?? 'bg-fg-faint';
}

/** Ponto colorido da cena: "O que acontece" segue o tom (deu certo / neutro / deu errado). */
export function sceneDot(node: AnyNode): string {
  if (node.type === 'consequence') return node.tone === 'positive' ? 'bg-success' : node.tone === 'negative' ? 'bg-danger' : 'bg-fg-muted';
  return sceneTypeDot(node.type);
}

/** Letra da opção: A, B, C… */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/* ------------------------------------------------------------------ */
/* Sequência                                                           */
/* ------------------------------------------------------------------ */

export interface SceneEntry {
  node: AnyNode;
  /** número de sequência (1-based) sobre as cenas alcançáveis; 0 para as fora do caminho */
  seq: number;
  reachable: boolean;
}

export interface StoryboardModel {
  /** todas as cenas em ordem de leitura, incluindo as agrupadas */
  all: SceneEntry[];
  byId: Map<string, SceneEntry>;
  /** cenas de primeiro nível no caminho (as agrupadas sob uma opção ficam fora) */
  main: SceneEntry[];
  /** cenas que ninguém alcança */
  unreachable: SceneEntry[];
  /** nó agrupado → { decisão, opção } */
  groupedUnder: Map<string, { choiceId: string; optionId: string }>;
  /** decisão → opção → nó agrupado */
  groupsByChoice: Map<string, Map<string, string>>;
  /** decisão → nó onde os caminhos se reencontram (quando todos convergem) */
  mergeAt: Map<string, string>;
}

/**
 * Um "O que acontece" fica agrupado sob a opção que o alcança quando essa é a
 * única porta de entrada dele (e ele não é a primeira cena).
 */
export function buildStoryboard(graph: LessonGraph): StoryboardModel {
  const ordered = orderedNodes(graph);
  const all: SceneEntry[] = [];
  const byId = new Map<string, SceneEntry>();
  let seq = 0;
  for (const { node, reachable } of ordered) {
    const entry: SceneEntry = { node, seq: reachable ? ++seq : 0, reachable };
    all.push(entry);
    byId.set(node.id, entry);
  }

  const groupedUnder = new Map<string, { choiceId: string; optionId: string }>();
  const groupsByChoice = new Map<string, Map<string, string>>();
  const mergeAt = new Map<string, string>();

  for (const { node } of all) {
    if (node.type !== 'choice') continue;
    const groups = new Map<string, string>();
    const after: (string | null)[] = [];
    for (const o of node.options) {
      const edge = graph.edges.find((e) => e.from === node.id && e.optionId === o.id);
      const dest = edge ? graph.nodes.find((n) => n.id === edge.to) : undefined;
      if (!dest) {
        after.push(null);
        continue;
      }
      const inc = incomingEdges(graph, dest.id);
      const onlyViaOption = dest.type === 'consequence' && dest.id !== graph.startNodeId && inc.length > 0 && inc.every((e) => e.from === node.id && e.optionId === o.id) && !groupedUnder.has(dest.id);
      if (onlyViaOption) {
        groupedUnder.set(dest.id, { choiceId: node.id, optionId: o.id });
        groups.set(o.id, dest.id);
        after.push(primaryEdge(graph, dest.id)?.to ?? null);
      } else {
        after.push(dest.id);
      }
    }
    if (groups.size) groupsByChoice.set(node.id, groups);
    const first = after[0];
    if (node.options.length > 1 && first && after.every((a) => a === first)) mergeAt.set(node.id, first);
  }

  const main = all.filter((e) => e.reachable && !groupedUnder.has(e.node.id));
  const unreachable = all.filter((e) => !e.reachable);
  return { all, byId, main, unreachable, groupedUnder, groupsByChoice, mergeAt };
}

/** Rótulo curto de uma cena para selects e avisos: "4 · Como negociar um prazo". */
export function sceneLabel(model: StoryboardModel, nodeId: string): string {
  const e = model.byId.get(nodeId);
  if (!e) return nodeId;
  const title = e.node.title?.trim() || sceneTypeLabel(e.node.type);
  return e.reachable ? `${e.seq} · ${title}` : `${title} (fora do caminho)`;
}

export function sceneTitle(model: StoryboardModel, nodeId: string): string {
  const e = model.byId.get(nodeId);
  return e ? e.node.title?.trim() || sceneTypeLabel(e.node.type) : nodeId;
}

/* ------------------------------------------------------------------ */
/* Pendências em linguagem de autor                                    */
/* ------------------------------------------------------------------ */

export interface SceneNotice {
  code: string;
  severity: 'error' | 'warning';
  text: string;
  /** texto técnico original (tooltip) */
  technical: string;
  nodeId?: string;
  /** pendência que só se resolve no modo avançado */
  advanced?: boolean;
}

const quoted = (msg: string, re: RegExp): string | undefined => msg.match(re)?.[1];

/** Converte um código do compilador numa frase curta. O código fica como tooltip. */
export function humanizeIssue(issue: CompileIssue, severity: 'error' | 'warning', model: StoryboardModel): SceneNotice {
  const base = { code: issue.code, severity, technical: `${issue.code}: ${issue.message}`, nodeId: issue.nodeId };
  const opt = quoted(issue.message, /^Opção "(.*?)"/) ?? quoted(issue.message, /opção "(.*?)"/);
  const say = (text: string, advanced = false): SceneNotice => ({ ...base, text, advanced });
  switch (issue.code) {
    case 'OPTION_WITHOUT_DESTINATION':
      return say(`A opção "${opt ?? '?'}" ainda não leva a nenhuma cena.`);
    case 'OPTION_AMBIGUOUS':
      return say(`A opção "${opt ?? '?'}" tem várias saídas sem uma regra clara.`, true);
    case 'OPTION_NO_FEEDBACK':
      return say(`A opção "${opt ?? '?'}" ainda não tem um retorno para quem a escolhe.`);
    case 'PRIORITY_TIE':
      return say('Duas regras avançadas desta cena têm a mesma prioridade.', true);
    case 'NO_EXIT':
      return say('Esta cena não leva a lugar nenhum. Escolha a próxima cena.');
    case 'NO_FALLBACK':
      return say('Esta cena tem regras avançadas, mas falta a próxima cena padrão.');
    case 'UNCONDITIONED_BRANCH':
      return say('Esta cena tem mais de uma saída sem regra.', true);
    case 'EMPTY_BODY':
      return say('Esta cena ainda está sem texto.');
    case 'NO_OBJECTIVE':
      return say('Esta cena não está ligada a nenhum objetivo do curso.');
    case 'OBJECTIVE_MISSING':
      return say('Esta cena aponta para um objetivo que não existe mais.');
    case 'ASSESSMENT_NO_CORRECT':
      return say('Marque pelo menos uma alternativa como correta.');
    case 'ASSESSMENT_SINGLE_MULTI':
      return say('A verificação é de resposta única, mas há mais de uma alternativa correta.');
    case 'ASSESSMENT_MIN_TOO_HIGH':
      return say('O mínimo de acertos é maior que o número de alternativas corretas.');
    case 'DUPLICATE_OPTION_ID':
      return say('Há opções repetidas nesta cena.', true);
    case 'MEDIA_STALE':
      return say('Vídeo desatualizado: a cena mudou desde a geração. Gere de novo quando terminar de editar.');
    case 'RECAP_SOURCE_MISSING': {
      const item = quoted(issue.message, /^Item "(.*?)"/);
      const outside = /não está nesta aula/.test(issue.message);
      return say(
        outside
          ? `O item "${item ?? '?'}" de Meu roteiro aponta para uma cena de outra aula; será conferido ao publicar o curso.`
          : `O item "${item ?? '?'}" de Meu roteiro precisa apontar para uma cena de reflexão ou decisão válida.`,
      );
    }
    case 'RECAP_DUPLICATE_ID':
      return say('Há itens repetidos em Meu roteiro.', true);
    case 'UNBOUNDED_CYCLE':
      return say('O caminho volta para esta cena e nunca termina. Ciclos não são permitidos.');
    case 'DEAD_END_PATH':
      return say('A partir desta cena não há caminho até um encerramento.');
    case 'UNREACHABLE':
      return say('Ninguém chega a esta cena.');
    case 'EDGE_TO_MISSING':
      return say('Uma saída desta cena aponta para uma cena que não existe mais.', true);
    case 'EDGE_FROM_END':
      return say('Um encerramento não pode ter próxima cena.', true);
    case 'CHOICE_EDGE_WITHOUT_OPTION':
    case 'CHOICE_OPTION_MISSING':
    case 'OPTION_ON_NON_CHOICE':
      return say('Há uma ligação inconsistente nesta cena.', true);
    case 'CONDITION_TYPE':
    case 'EFFECT_TYPE':
      return say('Uma regra avançada desta cena usa uma variável de forma inválida.', true);
    case 'NODE_TYPE_NOT_EXECUTABLE':
      return say('Este tipo de cena ainda não está disponível para publicar.');
    case 'START_NOT_FOUND':
      return say('A aula não tem uma primeira cena válida.', true);
    case 'NO_END_REACHABLE':
      return say('Nenhum caminho a partir da primeira cena chega a um encerramento.');
    case 'NO_END_NODE':
      return say('A aula precisa de uma cena de encerramento.');
    case 'DUPLICATE_NODE_ID':
    case 'DUPLICATE_EDGE_ID':
    case 'DUPLICATE_VARIABLE':
    case 'VARIABLE_INITIAL_TYPE':
    case 'EDGE_FROM_MISSING':
      return say('Há um problema técnico na estrutura da aula.', true);
    default: {
      void model;
      return say(issue.message);
    }
  }
}

export function noticesByNode(notices: SceneNotice[]): Map<string, SceneNotice[]> {
  const map = new Map<string, SceneNotice[]>();
  for (const n of notices) {
    if (!n.nodeId) continue;
    map.set(n.nodeId, [...(map.get(n.nodeId) ?? []), n]);
  }
  return map;
}

/**
 * Frase-resumo das pendências. `stale` = quantos dos avisos são vídeos
 * desatualizados: eles não são "sugestões de melhoria", são vídeos a refazer.
 */
export function summaryLine(errors: number, warnings: number, stale = 0): string {
  const other = Math.max(0, warnings - stale);
  const staleText = stale === 1 ? '1 vídeo desatualizado' : `${stale} vídeos desatualizados`;
  const otherText = other === 1 ? '1 sugestão de melhoria' : `${other} sugestões de melhoria`;
  if (errors === 0 && warnings === 0) return 'Tudo certo para publicar.';
  if (errors === 0) {
    if (stale > 0 && other > 0) return `${staleText} e ${otherText}.`;
    if (stale > 0) return `${staleText}.`;
    return `${otherText}.`;
  }
  const e = errors === 1 ? '1 coisa para resolver antes de publicar' : `${errors} coisas para resolver antes de publicar`;
  const tail = [stale > 0 ? staleText : null, other > 0 ? (other === 1 ? '1 sugestão' : `${other} sugestões`) : null].filter(Boolean).join(' e ');
  return tail ? `${e}, ${tail}.` : `${e}.`;
}

/* ------------------------------------------------------------------ */
/* Rótulos dos códigos do compilador (telas de revisão)                 */
/* ------------------------------------------------------------------ */

const ISSUE_CODE_LABEL: Record<string, string> = {
  MEDIA_STALE: 'Vídeo desatualizado',
  RECAP_SOURCE_MISSING: 'Fonte do roteiro inválida',
  RECAP_DUPLICATE_ID: 'Itens do roteiro repetidos',
  OPTION_WITHOUT_DESTINATION: 'Opção sem destino',
  OPTION_AMBIGUOUS: 'Opção ambígua',
  OPTION_NO_FEEDBACK: 'Opção sem retorno',
  PRIORITY_TIE: 'Regras empatadas',
  NO_EXIT: 'Cena sem saída',
  NO_FALLBACK: 'Sem próxima cena padrão',
  UNCONDITIONED_BRANCH: 'Saídas sem regra',
  EMPTY_BODY: 'Cena sem texto',
  NO_OBJECTIVE: 'Cena sem objetivo',
  OBJECTIVE_MISSING: 'Objetivo inexistente',
  OBJECTIVE_UNCOVERED: 'Objetivo não trabalhado',
  ASSESSMENT_NO_CORRECT: 'Sem alternativa correta',
  ASSESSMENT_SINGLE_MULTI: 'Mais de uma correta',
  ASSESSMENT_MIN_TOO_HIGH: 'Mínimo de acertos alto demais',
  DUPLICATE_OPTION_ID: 'Opções repetidas',
  UNBOUNDED_CYCLE: 'Caminho em círculo',
  DEAD_END_PATH: 'Caminho sem encerramento',
  UNREACHABLE: 'Cena inalcançável',
  EDGE_TO_MISSING: 'Destino inexistente',
  EDGE_FROM_END: 'Encerramento com saída',
  CHOICE_EDGE_WITHOUT_OPTION: 'Ligação inconsistente',
  CHOICE_OPTION_MISSING: 'Ligação inconsistente',
  OPTION_ON_NON_CHOICE: 'Ligação inconsistente',
  CONDITION_TYPE: 'Regra inválida',
  EFFECT_TYPE: 'Regra inválida',
  NODE_TYPE_NOT_EXECUTABLE: 'Tipo de cena indisponível',
  START_NOT_FOUND: 'Sem primeira cena',
  NO_END_REACHABLE: 'Nenhum encerramento alcançável',
  NO_END_NODE: 'Sem cena de encerramento',
  DUPLICATE_NODE_ID: 'Estrutura inconsistente',
  DUPLICATE_EDGE_ID: 'Estrutura inconsistente',
  DUPLICATE_VARIABLE: 'Variável repetida',
  VARIABLE_INITIAL_TYPE: 'Variável inválida',
  EDGE_FROM_MISSING: 'Estrutura inconsistente',
};

/** Código do compilador em pt-BR ("MEDIA_STALE" → "Vídeo desatualizado"); códigos desconhecidos ficam legíveis. */
export function issueCodeLabel(code: string): string {
  const known = ISSUE_CODE_LABEL[code];
  if (known) return known;
  const words = code.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "1 aviso" / "N avisos" (sem "aviso(s)"). */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

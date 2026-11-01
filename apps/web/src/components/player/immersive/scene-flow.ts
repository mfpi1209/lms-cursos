import type { AnyNode, Lesson, MissionNode, MissionStatus } from '@lms/course-schema';

/**
 * Regras de fluxo do palco que olham o GRAFO da aula (o que vem depois deste nó) e a posição da aula no curso.
 * Sem React: testadas à parte. O player só apresenta o que estas funções decidem.
 */

type Graph = Pick<Lesson['graph'], 'nodes' | 'edges'> & { startNodeId?: string };

const byId = (graph: Graph, id: string): AnyNode | undefined => graph.nodes.find((n) => n.id === id);

/** Destinos distintos das arestas que saem de `nodeId`. */
export function nextIds(graph: Graph, nodeId: string): string[] {
  return [...new Set(graph.edges.filter((e) => e.from === nodeId).map((e) => e.to))];
}

/** O próximo nó, quando só há um caminho (cena de vídeo → missão, atividade → despedida…). */
export function soleNext(graph: Graph, nodeId: string): AnyNode | undefined {
  const outs = nextIds(graph, nodeId);
  return outs.length === 1 ? byId(graph, outs[0]!) : undefined;
}

/** A cena termina e o próximo passo é a missão "Leve para a vida real"? Devolve a missão. */
export function missionAfter(graph: Graph, nodeId: string): MissionNode | null {
  const next = soleNext(graph, nodeId);
  return next?.type === 'mission' ? next : null;
}

/** Esta aula é a última do curso (e está na lista de aulas do curso)? Fora da lista (prévia de uma aula só), não. */
export function isLastLessonOfCourse(lessons: ReadonlyArray<{ id: string }>, lessonId: string): boolean {
  const i = lessons.findIndex((l) => l.id === lessonId);
  return i >= 0 && i === lessons.length - 1;
}

/** Tudo o que se alcança a partir de `fromId` (sem contar ele), seguindo as arestas. */
function reachableFrom(graph: Graph, fromId: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...nextIds(graph, fromId)];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...nextIds(graph, id));
  }
  return seen;
}

/** Os nós que chegam até `toId` (sem contar ele). */
function ancestorsOf(graph: Graph, toId: string): Set<string> {
  const seen = new Set<string>();
  const queue = graph.edges.filter((e) => e.to === toId).map((e) => e.from);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of graph.edges) if (e.to === id) queue.push(e.from);
  }
  return seen;
}

const isPractice = (n: AnyNode | undefined) => n?.type === 'reflection' || n?.type === 'mission';

/**
 * O fechamento do curso: na ÚLTIMA aula, a cena de conteúdo logo antes do `end` (a despedida), depois da prática.
 * Não depende do id: vale para qualquer cena `content` cujo único destino é o `end` e que vem depois de uma missão ou
 * atividade (o id `despedida` dispensa só esta última exigência). Resumos com "Resultado da simulação" não contam.
 */
export function isClosingNode(graph: Graph, nodeId: string, lastLesson: boolean): boolean {
  if (!lastLesson) return false;
  const node = byId(graph, nodeId);
  if (node?.type !== 'content' || node.reviewNodeIds?.length) return false;
  if (graph.startNodeId === nodeId) return false;
  const outs = nextIds(graph, nodeId);
  if (outs.length === 0 || !outs.every((id) => byId(graph, id)?.type === 'end')) return false;
  if (nodeId === 'despedida') return true;
  return [...ancestorsOf(graph, nodeId)].some((id) => isPractice(byId(graph, id)));
}

/** O id do fechamento da aula, se houver. */
export function closingNodeId(graph: Graph, lastLesson: boolean): string | null {
  if (!lastLesson) return null;
  return graph.nodes.find((n) => isClosingNode(graph, n.id, true))?.id ?? null;
}

/** Depois desta cena vem o fechamento do curso? (a confirmação da missão diz "Falta só o fechamento") */
export function farewellAfter(graph: Graph, nodeId: string, lastLesson: boolean): boolean {
  const next = soleNext(graph, nodeId);
  return !!next && isClosingNode(graph, next.id, lastLesson);
}

/** A missão é a última prática do curso: última aula e nenhuma atividade nem missão adiante. */
export function isLastPractice(graph: Graph, missionId: string, lastLesson: boolean): boolean {
  if (!lastLesson) return false;
  return ![...reachableFrom(graph, missionId)].some((id) => isPractice(byId(graph, id)));
}

/* ------------------------------------------------------------------------ */
/* Textos                                                                    */
/* ------------------------------------------------------------------------ */

export const BRIDGE_EYEBROW = 'Agora é com você';
export const BRIDGE_LINE = 'É uma prática para a vida real, fora da plataforma. Se não der agora, você pode fazer depois.';
export const BRIDGE_BUTTON = 'Ver a missão';
export const LAST_PRACTICE_CHIP = 'Última prática do curso';
export const CLOSING_LABEL = 'Fechamento';
export const FAREWELL_FOLLOW = 'Falta só o fechamento do curso.';

/** "Fechamento do curso · Que roupa eu uso?" */
export function closingCardTitle(course: string): string {
  return `Fechamento do curso · ${course}`;
}

export interface MissionAck {
  /** frase principal, no tom de quem acolhe (não de recibo) */
  headline: string;
  /** só quando a despedida vem a seguir */
  follow: string | null;
  /** orientação pequena sobre o Meu roteiro */
  hint: string;
}

/**
 * Reconhecimento depois de tocar na missão. `status` é o que o SERVIDOR devolveu (ele não rebaixa "Já experimentei"
 * para "Vou fazer depois"); `requested` é o que a pessoa tocou agora. Se divergem, a tela diz o que ficou valendo.
 */
export function missionAckText(status: MissionStatus, opts: { farewell?: boolean; requested?: MissionStatus } = {}): MissionAck {
  const kept = status === 'done' && opts.requested === 'later';
  const headline = kept
    ? 'Você já tinha marcado “Já experimentei”. Mantive assim, no Meu roteiro.'
    : status === 'done'
      ? 'Boa! Missão registrada no Meu roteiro.'
      : 'Combinado. A missão fica em Missões para depois.';
  return {
    headline,
    follow: opts.farewell ? FAREWELL_FOLLOW : null,
    hint: status === 'done' ? 'Você pode editar o que percebeu depois, no Meu roteiro.' : 'Quando fizer, volte no Meu roteiro e marque “Já experimentei”.',
  };
}

/** O mesmo texto, em uma frase só, para a região viva (leitores de tela). */
export function missionAckAnnouncement(status: MissionStatus, opts: { farewell?: boolean; requested?: MissionStatus } = {}): string {
  const a = missionAckText(status, opts);
  return [a.headline, a.follow].filter(Boolean).join(' ');
}

/** Rótulo do botão que segue depois do reconhecimento da missão. */
export function missionContinueLabel(farewell: boolean): string {
  return farewell ? 'Ver o fechamento' : 'Continuar aula';
}

/**
 * A tela de fim é a do CURSO inteiro? Última aula do curso (na lista) e as outras já concluídas. A aula atual conta
 * como concluída (é a que está acabando).
 */
export function isCourseEnd(lessons: ReadonlyArray<{ id: string; status: string }>, lessonId: string): boolean {
  return isLastLessonOfCourse(lessons, lessonId) && lessons.every((l) => l.id === lessonId || l.status === 'completed');
}

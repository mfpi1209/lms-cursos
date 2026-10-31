import { isRichTextEmpty, mediaPresentationStale, reactionScenes, type CourseDocument, type Lesson, type LessonGraph, type Presentation } from '@lms/course-schema';
import { isMediaNode, nodeText } from './wizard/wizard-state';

/**
 * Contagem única de vídeos por aula/curso, usada em todas as telas (painel do
 * curso, storyboard, passo 6 da montagem, produção e revisão) para os números
 * baterem entre si.
 *
 * - total: cenas que recebem vídeo (tipos com mídia e com texto);
 * - ready: com vídeo atualizado;
 * - stale: com vídeo desatualizado (a cena mudou depois da geração OU a
 *   apresentação mudou: `presentationStale` é a parte "pela apresentação");
 * - generating: pedido na fila ou em produção (prevalece sobre o rascunho);
 * - missing: sem vídeo e sem pedido em andamento;
 * - simulated: com vídeo de demonstração (job simulado), pronto ou desatualizado.
 */
export interface VideoStats {
  total: number;
  ready: number;
  stale: number;
  /** subconjunto de `stale`: o vídeo foi gerado com outra apresentação (apresentador, voz, fundo, posição) */
  presentationStale: number;
  generating: number;
  missing: number;
  /** vídeos simulados (modo de demonstração); a publicação real os bloqueia */
  simulated: number;
}

/** O mínimo que precisamos de um item da fila (MediaQueueItem ou o resumo do pacote de IA). */
export interface QueueLike {
  lessonId: string;
  nodeId: string;
  status: string;
}

const ACTIVE = new Set(['queued', 'running']);

const key = (lessonId: string, nodeId: string) => `${lessonId}:${nodeId}`;

function activeSet(queue: readonly QueueLike[] | undefined): Set<string> {
  const s = new Set<string>();
  for (const q of queue ?? []) if (ACTIVE.has(q.status)) s.add(key(q.lessonId, q.nodeId));
  return s;
}

export function emptyVideoStats(): VideoStats {
  return { total: 0, ready: 0, stale: 0, presentationStale: 0, generating: 0, missing: 0, simulated: 0 };
}

export function graphVideoStats(lessonId: string, graph: LessonGraph, queue?: readonly QueueLike[], presentation?: Presentation): VideoStats {
  return graphVideoStatsWith(lessonId, graph, activeSet(queue), presentation);
}

function graphVideoStatsWith(lessonId: string, graph: LessonGraph, active: Set<string>, presentation?: Presentation): VideoStats {
  const s = emptyVideoStats();
  // cenas do grafo + reações da instrutora a cada resposta (vídeos curtos por opção; reaction.ts)
  for (const n of [...graph.nodes, ...reactionScenes(graph)]) {
    if (!isMediaNode(n) || isRichTextEmpty(nodeText(n))) continue;
    s.total++;
    if (n.media?.generatedFrom?.simulated) s.simulated++;
    if (active.has(key(lessonId, n.id))) s.generating++;
    else if (n.media?.stale) s.stale++;
    else if (n.media && mediaPresentationStale(n.media, presentation, n)) {
      s.stale++;
      s.presentationStale++;
    } else if (n.media) s.ready++;
    else s.missing++;
  }
  return s;
}

export function lessonVideoStats(lesson: Lesson, queue?: readonly QueueLike[], presentation?: Presentation): VideoStats {
  return graphVideoStats(lesson.id, lesson.graph, queue, presentation);
}

export function courseVideoStats(doc: CourseDocument, queue?: readonly QueueLike[]): VideoStats {
  const active = activeSet(queue);
  const out = emptyVideoStats();
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      const s = graphVideoStatsWith(l.id, l.graph, active, doc.presentation);
      out.total += s.total;
      out.ready += s.ready;
      out.stale += s.stale;
      out.presentationStale += s.presentationStale;
      out.generating += s.generating;
      out.missing += s.missing;
      out.simulated += s.simulated;
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "N desatualizados (M pela apresentação)" / "1 desatualizado (apresentação mudou)". */
export function staleLabel(s: Pick<VideoStats, 'stale' | 'presentationStale'>): string {
  const base = plural(s.stale, 'desatualizado', 'desatualizados');
  if (s.presentationStale === 0) return base;
  if (s.presentationStale === s.stale) return `${base} (apresentação mudou)`;
  return `${base} (${s.presentationStale} pela apresentação)`;
}

/**
 * Frase padrão: "X de Y cenas com vídeo pronto · N desatualizados · M faltando · K em produção".
 * Com `lead: false`, só a parte depois do "·" (para quem já mostrou "X de Y").
 */
export function videoStatsLine(s: VideoStats, opts: { lead?: boolean } = {}): string {
  const parts: string[] = [];
  if (opts.lead !== false) parts.push(`${s.ready} de ${s.total} ${s.total === 1 ? 'cena' : 'cenas'} com vídeo pronto`);
  if (s.stale > 0) parts.push(staleLabel(s));
  if (s.missing > 0) parts.push(plural(s.missing, 'faltando', 'faltando'));
  if (s.generating > 0) parts.push(plural(s.generating, 'em produção', 'em produção'));
  return parts.join(' · ');
}

/** "N de M vídeos prontos · K desatualizados" (produção/revisão). */
export function videosReadyLine(s: VideoStats): string {
  const parts = [`${s.ready} de ${s.total} ${s.total === 1 ? 'vídeo pronto' : 'vídeos prontos'}`];
  if (s.stale > 0) parts.push(staleLabel(s));
  if (s.generating > 0) parts.push(plural(s.generating, 'em produção', 'em produção'));
  if (s.missing > 0) parts.push(plural(s.missing, 'faltando', 'faltando'));
  if (s.simulated > 0) parts.push(plural(s.simulated, 'simulado', 'simulados'));
  return parts.join(' · ');
}

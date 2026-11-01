'use client';

import type { AnyNode, Lesson } from '@lms/course-schema';
import { videoMediaOf } from '../video-scene';

/** No máximo tantos vídeos pré-carregados de uma vez (não disputa banda com o vídeo que está tocando). */
const MAX = 5;

const outgoing = (lesson: Lesson, id: string) => [...new Set(lesson.graph.edges.filter((e) => e.from === id).map((e) => e.to))];
const nodeOf = (lesson: Lesson, id: string) => lesson.graph.nodes.find((n) => n.id === id) as AnyNode | undefined;

function reactionIds(node: AnyNode | undefined): string[] {
  if (!node || node.type !== 'choice') return [];
  return node.options.flatMap((o) => {
    const r = (o as { reaction?: { disabled?: boolean; media?: { kind?: string; assetId?: string } } }).reaction;
    const m = r?.disabled ? undefined : r?.media;
    return m?.kind === 'video' && m.assetId ? [m.assetId] : [];
  });
}

/**
 * Vídeos que podem tocar logo depois da cena atual (função pura): na decisão, as reações às respostas e
 * as cenas seguintes; numa cena, a(s) próxima(s) e, se a próxima for uma decisão, as reações dela.
 */
export function upcomingVideoAssetIds(lesson: Lesson, currentNodeId: string): string[] {
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  const cur = nodeOf(lesson, currentNodeId);
  reactionIds(cur).forEach(add);
  for (const nextId of outgoing(lesson, currentNodeId)) {
    const next = nodeOf(lesson, nextId);
    add(videoMediaOf(next)?.assetId);
    reactionIds(next).forEach(add);
  }
  return out.slice(0, MAX);
}

/**
 * Pré-carga invisível (A16): o navegador baixa os próximos vídeos enquanto o atual toca, então a troca
 * vídeo → pergunta → reação → vídeo não para para carregar. Mesma URL dos players (cache do navegador).
 */
export function VideoPrefetch({ lesson, currentNodeId, exclude }: { lesson: Lesson; currentNodeId: string | undefined; exclude?: string | null }) {
  if (!currentNodeId) return null;
  const ids = upcomingVideoAssetIds(lesson, currentNodeId).filter((id) => id !== exclude);
  if (!ids.length) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" data-testid="video-prefetch">
      {ids.map((id) => (
        <video key={id} src={`/api/assets/${encodeURIComponent(id)}#t=0.1`} preload="auto" muted playsInline tabIndex={-1} />
      ))}
    </div>
  );
}

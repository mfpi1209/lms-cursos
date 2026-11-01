/**
 * Duração de VÍDEO de uma aula/curso, pelo percurso real (não pela estimativa do roteiro).
 *
 * - Conta só o vídeo que toca: cenas (`scenario`/`content`/`consequence`), o vídeo próprio da pergunta quando ele
 *   toca (é pulado quando a cena anterior já fala a chamada: mesma regra do player) e a reação em vídeo da opção
 *   escolhida (reação desligada não toca). A vinheta da marca fica fora do tempo de conteúdo.
 * - Ramos: o aluno vê só a reação do caminho escolhido; o resultado é a faixa [mínimo, máximo] entre os percursos
 *   do início a um fim. Laços (refazer, voltar) não entram no tempo-base.
 * - A duração vem do asset final (o vídeo já cortado pelo ajuste fino é outro arquivo, com a duração dele).
 *   Mídia sem duração conhecida não vira zero: volta em `missing` e o total deve ser tratado como indisponível.
 * - Tudo em segundos; a formatação (minutos, faixa, "Menos de 1 min") fica nas funções `format*`.
 */

type Media = { kind?: string; assetId?: string; transcript?: string } | null | undefined;
type GNode = {
  id: string;
  type: string;
  media?: Media;
  narration?: unknown;
  bridge?: { call?: string };
  options?: Array<{ id: string; reaction?: { media?: Media; disabled?: boolean } }>;
};
type GEdge = { from: string; to: string; optionId?: string };
export interface RuntimeLesson {
  graph: { startNodeId?: string; nodes: readonly unknown[]; edges: readonly unknown[] };
}
export interface VideoRange {
  minS: number;
  maxS: number;
  /** assets de vídeo do percurso sem duração conhecida (o total não é definitivo) */
  missing: string[];
}

const SCENE_TYPES = new Set(['scenario', 'content', 'consequence']);
const videoId = (m: Media): string | null => (m?.kind === 'video' && m.assetId ? m.assetId : null);
const words = (t: string) =>
  t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * O vídeo próprio da pergunta `choiceId` é pulado? Sim quando a cena anterior (única, com vídeo, que não seja
 * outra pergunta) já termina falando a chamada da pergunta (situação + "Agora, responda: …"): repetir o vídeo
 * seria dizer tudo de novo. Regra ÚNICA, usada pelo player (palco, avanço automático) e pela duração do percurso.
 * A fala conferida é `media.transcript` (o que o vídeo realmente diz), senão `narration`.
 */
export function questionVideoSkipped(graph: RuntimeLesson['graph'], choiceId: string): boolean {
  const nodes = graph.nodes as GNode[];
  const choice = nodes.find((x) => x.id === choiceId);
  const call = choice?.type === 'choice' ? choice.bridge?.call?.trim() : '';
  if (!choice || !call) return false;
  const edges = graph.edges as GEdge[];
  const preds = [...new Set(edges.filter((e) => e.to === choice.id).map((e) => e.from))];
  if (preds.length !== 1) return false;
  const prev = nodes.find((x) => x.id === preds[0]);
  if (!prev || prev.type === 'choice' || !videoId(prev.media)) return false;
  const spoken = words(prev.media?.transcript ?? (typeof prev.narration === 'string' ? prev.narration : ''));
  return !!spoken && spoken.endsWith(words(call));
}

/**
 * Depois do vídeo da cena `fromId`, o vídeo PRÓPRIO da pergunta toca em seguida (continuidade, sem tela de "Continuar")?
 * Sim quando a cena segue só para uma pergunta que tem vídeo e esse vídeo não é pulado (a cena anterior não terminou
 * dizendo a chamada). É o complemento de `questionVideoSkipped`: ou a pergunta entra direto (vídeo pulado), ou o vídeo
 * dela começa direto (este caso). Usada pelo player no avanço automático ao fim do vídeo da cena.
 */
export function questionVideoFollows(graph: RuntimeLesson['graph'], fromId: string): boolean {
  const nodes = graph.nodes as GNode[];
  const from = nodes.find((x) => x.id === fromId);
  if (!from || from.type === 'choice' || from.type === 'end' || !videoId(from.media)) return false;
  const outs = [...new Set((graph.edges as GEdge[]).filter((e) => e.from === fromId).map((e) => e.to))];
  if (outs.length !== 1) return false;
  const next = nodes.find((x) => x.id === outs[0]);
  if (next?.type !== 'choice' || !videoId(next.media)) return false;
  return !questionVideoSkipped(graph, next.id);
}

/** Todos os vídeos que podem tocar na aula (para buscar as durações de uma vez). */
export function lessonVideoAssetIds(lesson: RuntimeLesson): string[] {
  const ids = new Set<string>();
  for (const n of lesson.graph.nodes as GNode[]) {
    const v = videoId(n.media);
    if (v) ids.add(v);
    for (const o of n.options ?? []) {
      const r = o.reaction?.disabled ? null : videoId(o.reaction?.media);
      if (r) ids.add(r);
    }
  }
  return [...ids];
}

type Durations = ReadonlyMap<string, number>;

/** Faixa de vídeo de uma aula (segundos), entre os percursos do início a qualquer fim. */
export function lessonVideoRange(lesson: RuntimeLesson, durations: Durations): VideoRange {
  const g = lesson.graph;
  const nodes = g.nodes as GNode[];
  const edges = g.edges as GEdge[];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const missing = new Set<string>();
  const dur = (id: string | null): number => {
    if (!id) return 0;
    const d = durations.get(id);
    if (d === undefined || !Number.isFinite(d) || d < 0) {
      missing.add(id);
      return 0;
    }
    return d;
  };
  const nodeCost = (n: GNode): number => {
    if (SCENE_TYPES.has(n.type)) return dur(videoId(n.media));
    if (n.type === 'choice') return questionVideoSkipped(g, n.id) ? 0 : dur(videoId(n.media));
    return 0;
  };
  const edgeCost = (from: GNode, e: GEdge): number => {
    if (from.type !== 'choice' || !e.optionId) return 0;
    const o = from.options?.find((x) => x.id === e.optionId);
    return o?.reaction?.disabled ? 0 : dur(videoId(o?.reaction?.media));
  };

  // melhor/pior caminho até um fim (DAG; arestas de volta, como "refazer", são ignoradas)
  const memo = new Map<string, [number, number]>();
  const onPath = new Set<string>();
  const walk = (id: string): [number, number] | null => {
    const n = byId.get(id);
    if (!n) return null;
    const cached = memo.get(id);
    if (cached) return cached;
    if (onPath.has(id)) return null;
    onPath.add(id);
    const own = nodeCost(n);
    const outs = edges.filter((e) => e.from === id);
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of outs) {
      const rest = walk(e.to);
      if (!rest) continue;
      const c = edgeCost(n, e);
      lo = Math.min(lo, c + rest[0]);
      hi = Math.max(hi, c + rest[1]);
    }
    onPath.delete(id);
    const res: [number, number] = Number.isFinite(lo) ? [own + lo, own + hi] : [own, own];
    memo.set(id, res);
    return res;
  };
  const start = g.startNodeId ?? nodes[0]?.id;
  const r = start ? walk(start) : null;
  return { minS: r ? r[0] : 0, maxS: r ? r[1] : 0, missing: [...missing] };
}

/** Faixa do curso: soma das faixas das aulas (cada aula começa do zero). */
export function courseVideoRange(lessons: readonly RuntimeLesson[], durations: Durations): VideoRange {
  let minS = 0;
  let maxS = 0;
  const missing = new Set<string>();
  for (const l of lessons) {
    const r = lessonVideoRange(l, durations);
    minS += r.minS;
    maxS += r.maxS;
    r.missing.forEach((m) => missing.add(m));
  }
  return { minS, maxS, missing: [...missing] };
}

/** Diferença que vale mostrar como faixa: os minutos arredondados para cima diferem. */
export function isRelevantRange(r: Pick<VideoRange, 'minS' | 'maxS'>): boolean {
  return Math.ceil(r.minS / 60) !== Math.ceil(r.maxS / 60);
}

/** "5 min", "1 h 5 min", "Menos de 1 min" (arredonda para cima, em minutos). */
export function formatMinutesCeil(seconds: number): string {
  if (!(seconds > 0)) return '0 min';
  if (seconds < 60) return 'Menos de 1 min';
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Duração do curso para cards e ficha: "5 min", "6–8 min" ou "Menos de 1 min"; null sem vídeo. */
export function formatCourseVideo(r: Pick<VideoRange, 'minS' | 'maxS'>): string | null {
  if (!(r.maxS > 0)) return null;
  if (!isRelevantRange(r)) return formatMinutesCeil(r.maxS);
  const lo = formatMinutesCeil(r.minS);
  const hi = formatMinutesCeil(r.maxS);
  // "6–8 min" (mesma unidade) ou "50 min–1 h 5 min"
  if (lo.endsWith(' min') && hi.endsWith(' min') && !lo.includes('h') && !hi.includes('h') && r.minS >= 60) return `${lo.replace(' min', '')}–${hi}`;
  return `${lo}–${hi}`;
}

/** "3:20" (minutos e segundos, arredondados para baixo no segundo) */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Diferença entre ramos que vale mostrar na aula (abaixo disso, mostra o maior percurso). */
export const LESSON_RANGE_MIN_DIFF_S = 10;

/** Duração da aula (detalhe): "3:20" ou "2:40–3:10" (faixa só com diferença relevante); null sem vídeo. */
export function formatLessonVideo(r: Pick<VideoRange, 'minS' | 'maxS'>): string | null {
  if (!(r.maxS > 0)) return null;
  return r.maxS - r.minS < LESSON_RANGE_MIN_DIFF_S ? formatClock(r.maxS) : `${formatClock(r.minS)}–${formatClock(r.maxS)}`;
}

/** Leitura acessível: "3 minutos e 20 segundos". */
export function spokenClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts = [m ? `${m} ${m === 1 ? 'minuto' : 'minutos'}` : '', r ? `${r} ${r === 1 ? 'segundo' : 'segundos'}` : ''].filter(Boolean);
  return parts.join(' e ') || '0 segundos';
}

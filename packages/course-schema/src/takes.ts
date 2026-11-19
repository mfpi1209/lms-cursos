import { continuousTakeGroups, shotNeedsPresenter, type Shot } from './direction';

/**
 * Tomadas de uma cena dirigida no TEMPO do vídeo (função pura). Tomada = grupo de planos consecutivos de apresentador
 * na mesma câmera (`continuousTakeGroups`), um pedido ao HeyGen. Usado pelo painel de pulsos (worker) e pela revisão
 * "Assistir e marcar" (estúdio), para que os dois cheguem ao MESMO rótulo `aula/cena#<1º plano>` do `refazer-tomadas`.
 *
 * Tempos sem os tempos das palavras: cada plano ocupa do vídeo a fatia proporcional ao tamanho da fala (planos tirados
 * no ajuste fino, `dropped`, não estão no vídeo e não contam).
 */

/** instantes recortados dentro de cada TOMADA pelo painel de pulsos (fração do tempo dela) */
export const TAKE_PERCENTS = [40, 75] as const;

export interface ShotSpan {
  id: string;
  /** índice do plano na direção (contando os tirados) */
  index: number;
  start: number;
  end: number;
}

/** Trecho de cada plano MANTIDO no vídeo, proporcional ao tamanho da fala. */
export function shotTimeline(shots: ReadonlyArray<Pick<Shot, 'id' | 'line'>>, opts: { durationSeconds: number; dropped?: readonly string[] }): ShotSpan[] {
  const dropped = new Set(opts.dropped ?? []);
  const kept = shots.map((s, index) => ({ s, index })).filter(({ s }) => !dropped.has(s.id));
  const total = kept.reduce((a, { s }) => a + s.line.length, 0) || 1;
  let acc = 0;
  return kept.map(({ s, index }) => {
    const start = (acc / total) * opts.durationSeconds;
    acc += s.line.length;
    return { id: s.id, index, start, end: (acc / total) * opts.durationSeconds };
  });
}

export interface TakeFrame {
  percent: number;
  /** instante no vídeo (s) */
  time: number;
  /** plano falado nesse instante (enquadramento/câmera do recorte) */
  shot: Pick<Shot, 'id' | 'line' | 'cameraId' | 'framing'> | undefined;
}

export interface TakePlan {
  /** id do 1º plano da tomada (o que `refazer-tomadas` espera) */
  firstShotId: string;
  shotIds: string[];
  cameraId: string | undefined;
  start: number;
  end: number;
  frames: TakeFrame[];
}

/**
 * Tomadas de apresentador da cena com o trecho do vídeo de cada uma (proporcional ao tamanho da fala; `dropped` = planos
 * tirados no ajuste fino, que não estão no vídeo) e os instantes dos recortes. Cenas em movimento e planos sem
 * apresentador (slide/cartão com voz à parte) ficam de fora.
 */
export function planTakes<T extends Pick<Shot, 'id' | 'line' | 'cameraId' | 'framing' | 'layout' | 'slide'>>(shots: readonly T[], opts: { hasNarrationAudio: boolean; durationSeconds: number; dropped?: readonly string[] }): TakePlan[] {
  const dropped = new Set(opts.dropped ?? []);
  const kept = shots.filter((s) => !dropped.has(s.id));
  if (!kept.length) return [];
  const spans = new Map(shotTimeline(kept, { durationSeconds: opts.durationSeconds }).map((sp) => [sp.id, sp]));
  const endOf = (s: T) => spans.get(s.id)!.end;
  const out: TakePlan[] = [];
  for (const g of continuousTakeGroups(kept, { hasNarrationAudio: opts.hasNarrationAudio })) {
    const first = kept[g[0]!]!;
    if (first.layout === 'cinematic' || !shotNeedsPresenter(first, opts.hasNarrationAudio)) continue;
    const a = spans.get(first.id)!.start;
    const b = endOf(kept[g[g.length - 1]!]!);
    const members = g.map((i) => kept[i]!);
    const frames = TAKE_PERCENTS.map((percent): TakeFrame => {
      const time = +(a + (b - a) * (percent / 100)).toFixed(3);
      const shot = members.find((m) => time <= endOf(m) + 1e-6) ?? members[members.length - 1];
      return { percent, time, shot };
    });
    out.push({ firstShotId: first.id, shotIds: members.map((m) => m.id), cameraId: first.cameraId, start: +a.toFixed(3), end: +b.toFixed(3), frames });
  }
  return out;
}

export interface QuoteLine {
  lessonId: string;
  nodeId: string;
  title: string;
  kind: 'avatar' | 'screen';
  reaction: boolean;
  seconds: number;
  chars: number;
  usd: number;
  reused: boolean;
}

export interface CourseTotals {
  avatar: { scenes: number; minutes: number; usd: number };
  screen: { scenes: number; minutes: number; usd: number };
  /** subconjunto de `avatar`/`screen` que são reações da instrutora às respostas */
  reactions: { scenes: number; minutes: number; usd: number };
  reused: { scenes: number; minutes: number };
  totalUsd: number;
}

/** Agrega as linhas do orçamento. Cenas reaproveitadas (vídeo já pago) têm custo 0 e não entram em avatar/tela. */
export function summarize(lines: QuoteLine[]): CourseTotals {
  const t: CourseTotals = { avatar: { scenes: 0, minutes: 0, usd: 0 }, screen: { scenes: 0, minutes: 0, usd: 0 }, reactions: { scenes: 0, minutes: 0, usd: 0 }, reused: { scenes: 0, minutes: 0 }, totalUsd: 0 };
  for (const l of lines) {
    if (l.reused) { t.reused.scenes++; t.reused.minutes += l.seconds / 60; continue; }
    const b = l.kind === 'screen' ? t.screen : t.avatar;
    b.scenes++; b.minutes += l.seconds / 60; b.usd += l.usd;
    if (l.reaction) { t.reactions.scenes++; t.reactions.minutes += l.seconds / 60; t.reactions.usd += l.usd; }
    t.totalUsd += l.usd;
  }
  return t;
}

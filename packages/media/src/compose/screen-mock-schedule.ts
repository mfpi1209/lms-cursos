/**
 * Agendamento dos passos da tela simulada (função pura). Os passos ocupam, em sequência, a janela entre uma folga
 * inicial (≈ 0,4 s) e uma folga final em que o estado final fica parado; o tempo de cada passo é proporcional
 * ao peso (padrão 1).
 */

export interface StepWindow {
  index: number;
  start: number;
  end: number;
  weight: number;
}

export interface StepSchedule {
  windows: StepWindow[];
  /** folga inicial (s) antes do primeiro passo */
  leadSec: number;
  /** segundos finais com o estado final segurado */
  holdSec: number;
  durationSec: number;
}

export const SCREEN_MOCK_LEAD_SEC = 0.4;

export function scheduleSteps(weights: Array<number | undefined>, durationSec: number, opts: { leadSec?: number; holdSec?: number } = {}): StepSchedule {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) throw new Error('durationSec deve ser positivo');
  const lead = Math.min(opts.leadSec ?? SCREEN_MOCK_LEAD_SEC, durationSec * 0.15);
  // segura o final por 12% da duração (entre 0,5 e 2 s), sem passar de 25% da duração
  const hold = Math.min(opts.holdSec ?? Math.min(2, Math.max(0.5, durationSec * 0.12)), durationSec * 0.25);
  const span = Math.max(0, durationSec - lead - hold);
  const ws = weights.map((w) => (w !== undefined && Number.isFinite(w) && w > 0 ? w : 1));
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let cursor = lead;
  const windows = ws.map((weight, index) => {
    const start = cursor;
    cursor += (span * weight) / total;
    return { index, start, end: index === ws.length - 1 ? lead + span : cursor, weight };
  });
  return { windows, leadSec: lead, holdSec: hold, durationSec };
}

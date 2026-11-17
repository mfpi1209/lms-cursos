/**
 * Estados de uma marca e as transições permitidas (função pura). Fluxo:
 *   aberta --Corrigir--> aguardando correção (edição/decisão/operador) | aguardando aprovação de gasto (pago)
 *                        | em reprocessamento (conserto grátis já enfileirado)
 *   aguardando aprovação --Aprovar--> aguardando correção (o operador executa)
 *   aguardando correção --executada--> em reprocessamento
 *   (vídeo da cena mudou) --> pronta para conferir --Resolvida--> resolvida | --Ainda errado--> aberta (tentativa +1)
 * Qualquer estado não resolvido pode ser resolvido; pedidos podem ser cancelados (volta a aberta).
 */
export const MARK_STATUSES = ['open', 'awaiting_fix', 'awaiting_approval', 'reprocessing', 'ready_to_check', 'resolved'] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];
export type FixKind = 'free' | 'edit' | 'paid' | 'manual';

export const STATUS_LABEL: Record<MarkStatus, string> = {
  open: 'aberta',
  awaiting_fix: 'aguardando correção',
  awaiting_approval: 'aguardando aprovação de gasto',
  reprocessing: 'em reprocessamento',
  ready_to_check: 'pronta para conferir',
  resolved: 'resolvida',
};

export type MarkEvent =
  | { type: 'request_fix'; kind: FixKind; enqueued?: boolean }
  | { type: 'approve' }
  | { type: 'executed' }
  | { type: 'asset_changed' }
  | { type: 'resolve' }
  | { type: 'still_wrong' }
  | { type: 'reopen' };

export class TransitionError extends Error {}

const PENDING: readonly MarkStatus[] = ['awaiting_fix', 'awaiting_approval', 'reprocessing'];

/** Próximo estado para o evento; erra se a transição não vale (ex.: aprovar uma marca que não pede gasto). */
export function transition(from: MarkStatus, ev: MarkEvent): MarkStatus {
  const bad = (): never => {
    throw new TransitionError(`não dá para "${ev.type}" uma marca ${STATUS_LABEL[from]}`);
  };
  switch (ev.type) {
    case 'request_fix':
      if (from !== 'open') return bad();
      if (ev.kind === 'paid') return 'awaiting_approval';
      if (ev.kind === 'free' && ev.enqueued) return 'reprocessing';
      return 'awaiting_fix';
    case 'approve':
      return from === 'awaiting_approval' ? 'awaiting_fix' : bad();
    case 'executed':
      return from === 'awaiting_fix' ? 'reprocessing' : bad();
    case 'asset_changed':
      return PENDING.includes(from) ? 'ready_to_check' : bad();
    case 'resolve':
      return from === 'resolved' ? bad() : 'resolved';
    case 'still_wrong':
      return from === 'ready_to_check' ? 'open' : bad();
    case 'reopen':
      return from === 'open' ? bad() : 'open';
  }
}

/** Estados em que o operador/worker ainda vai mexer: o vídeo novo da cena leva a "pronta para conferir". */
export function awaitsNewVideo(status: MarkStatus): boolean {
  return PENDING.includes(status);
}

/** A marca pendente deve virar "pronta para conferir"? (o vídeo da cena mudou desde o pedido de conserto) */
export function shouldMarkReady(status: MarkStatus, assetAtRequest: string | null | undefined, currentAssetId: string | null | undefined): boolean {
  return awaitsNewVideo(status) && !!assetAtRequest && !!currentAssetId && assetAtRequest !== currentAssetId;
}

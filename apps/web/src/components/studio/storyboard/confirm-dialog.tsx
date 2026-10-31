'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { OverlayPortal } from '@/components/ui/overlay-portal';
import { useFocusTrap } from '@/components/ui/focus-trap';

/**
 * Caixa de confirmação simples. `paid` usa a cor de ação paga (âmbar),
 * reservada a ações com custo. Foco inicial no botão de confirmar, Tab circula
 * dentro da caixa, Esc cancela e o foco volta a quem abriu.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  paid = false,
  danger = false,
  disabled = false,
  onCancel,
  onConfirm,
  testId,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  paid?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  useFocusTrap(dialogRef, {
    initialFocus: confirmRef,
    onEscape: () => {
      if (!busy) onCancelRef.current();
    },
  });
  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/75 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="rise w-full max-w-md space-y-3 rounded-[var(--radius-card)] border border-line-strong bg-surface p-5 shadow-2xl" data-testid={testId}>
        <h2 id={titleId} className="text-lg font-semibold text-fg">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            ref={confirmRef}
            size="sm"
            onClick={onConfirm}
            disabled={busy || disabled}
            variant={danger ? 'danger' : paid ? 'paid' : 'primary'}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { CourseMaterial } from '@lms/course-schema';
import { useFocusTrap } from '@/components/ui/focus-trap';
import { MaterialRow } from './material-row';

/** Gaveta lateral "Materiais" do player: os materiais do módulo da aula. Esc fecha, foco preso, foco volta ao botão. */
export function MaterialsDrawer({ open, onClose, materials, moduleLabel, courseHref }: { open: boolean; onClose: () => void; materials: CourseMaterial[]; moduleLabel?: string; courseHref?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(ref, { active: open, onEscape: close, initialFocus: '[data-materials-close]' });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" data-testid="materials-drawer">
      <div className="absolute inset-0 bg-[var(--im-overlay)] backdrop-blur-[2px]" aria-hidden="true" onClick={close} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="theme-platform absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-line bg-bg-2 shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.8)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 md:px-7">
          <p id={titleId} className="eyebrow">
            Materiais de apoio
          </p>
          <button type="button" data-materials-close onClick={close} aria-label="Fechar materiais" className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-fg/10">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 md:px-5">
          {moduleLabel && <p className="px-2 pb-2 text-sm text-fg-muted sm:px-3">{moduleLabel}</p>}
          <ul className="divide-y divide-line">
            {materials.map((m) => (
              <MaterialRow key={m.id} m={m} />
            ))}
          </ul>
          {courseHref && (
            <p className="px-2 pt-4 text-sm text-fg-muted sm:px-3">
              Os materiais dos outros módulos ficam na{' '}
              <a href={`${courseHref}#materiais`} className="font-medium text-fg underline underline-offset-2">
                página do curso
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

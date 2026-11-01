'use client';

import { Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ctaPrimary } from '@/app/(lms)/aprender/_components/learner-ui';

/** "Baixar PDF": abre a caixa de impressão do navegador (a folha já está em A4 paisagem; escolha "Salvar como PDF"). */
export function PrintButton() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" onClick={() => window.print()} className={cn(ctaPrimary, 'min-h-12 px-6')} data-testid="certificate-print">
        <Printer className="size-5" aria-hidden="true" />
        Baixar PDF
      </button>
      <p className="text-[15px] text-fg-muted">Escolha “Salvar como PDF”.</p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { ctaOutline } from '../../_components/learner-ui';

/** Texto pronto para o currículo + botão "Copiar" (mesmo retorno do "Copiar" do Meu roteiro). */
export function CvCopy({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await copyToClipboard(text);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="mt-2">
      <p className="whitespace-pre-line rounded-[12px] border border-line bg-bg-2 p-3.5 text-[15px] leading-relaxed text-fg" data-testid="badge-cv-text">
        {text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={cn(ctaOutline, 'min-h-11 px-5')} data-testid="badge-cv-copy">
          {state === 'done' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          Copiar
        </button>
        <span role="status" aria-live="polite" className="text-sm text-fg-muted">
          {state === 'done' ? 'Texto copiado.' : state === 'failed' ? 'Não foi possível copiar. Selecione o texto e copie.' : ''}
        </span>
      </div>
    </div>
  );
}

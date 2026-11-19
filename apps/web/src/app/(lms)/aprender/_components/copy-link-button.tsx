'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ctaOutline } from './learner-ui';

/** Copia o link (caminho relativo vira absoluto na hora do clique) e avisa por aria-live. */
export function CopyLinkButton({ path, label = 'Copiar link' }: { path: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setState('copied');
    } catch {
      setState('error');
    }
    window.setTimeout(() => setState('idle'), 3000);
  }
  return (
    <>
      <button type="button" onClick={() => void copy()} className={cn(ctaOutline, 'min-h-11 px-5 text-[15px]')}>
        {state === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
        {label}
      </button>
      <span role="status" aria-live="polite" className="text-sm text-fg-muted">
        {state === 'copied' ? 'Link copiado.' : state === 'error' ? 'Não foi possível copiar. Copie o endereço da página de verificação.' : ''}
      </span>
    </>
  );
}

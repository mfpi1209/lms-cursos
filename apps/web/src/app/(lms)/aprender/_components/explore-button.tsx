'use client';

import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ctaPrimary } from './learner-ui';

/**
 * "Explorar cursos": leva ao catálogo na mesma página. O alvo tem `scroll-margin` com a altura do
 * cabeçalho; com movimento reduzido o salto é imediato. O foco vai para o catálogo (leitor de tela e teclado).
 */
export function ExploreButton({ className }: { className?: string }) {
  return (
    <a
      href="#cursos"
      onClick={(e) => {
        const target = document.getElementById('cursos');
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
        history.replaceState(null, '', '#cursos');
      }}
      className={cn(ctaPrimary, 'min-h-13 px-7 text-[17px]', className)}
    >
      <Play className="size-5 fill-current" aria-hidden="true" />
      Explorar cursos
    </a>
  );
}

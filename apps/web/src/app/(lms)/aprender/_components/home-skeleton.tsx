import { cn } from '@/lib/utils';

/**
 * Esqueleto da vitrine enquanto os dados carregam: as mesmas proporções finais (hero, filtros e três cartões 4:3), sem
 * dados inventados. Sem animação com movimento reduzido.
 */
export function HomeSkeleton() {
  const block = 'rounded-[14px] bg-fg/10 motion-safe:animate-pulse md:rounded-[16px]';
  return (
    <div className="lms-editorial" role="status" aria-live="polite" aria-busy="true" data-testid="home-skeleton">
      <span className="sr-only">Carregando os cursos…</span>
      <div className="dna-hero" aria-hidden="true">
        <div className="space-y-4">
          <div className={cn(block, 'h-5 w-24')} />
          <div className={cn(block, 'h-[72px] w-full max-w-[480px] md:h-[104px]')} />
          <div className={cn(block, 'h-12 w-44')} />
        </div>
        <div className={cn(block, 'aspect-video w-full')} />
      </div>
      <div className="mt-6 flex gap-2 overflow-hidden" aria-hidden="true">
        {[88, 140, 176, 160, 132, 120].map((w) => (
          <div key={w} className="h-11 shrink-0 rounded-full bg-fg/10 motion-safe:animate-pulse md:h-10" style={{ width: w }} />
        ))}
      </div>
      <div className="dna-section" aria-hidden="true">
        <div className={cn(block, 'h-[30px] w-56')} />
        <ul className="dna-rail dna-rail--wide3 mt-3">
          {[0, 1, 2].map((k) => (
            <li key={k} className="dna-li">
              <div className={cn(block, 'aspect-[4/3] w-full')} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

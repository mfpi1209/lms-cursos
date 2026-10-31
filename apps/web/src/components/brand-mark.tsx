import { cn } from '@/lib/utils';

/** Marca da plataforma: três painéis empilhados, o da frente aceso. Herda a cor do texto. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('h-6 w-6 shrink-0', className)}>
      <rect x="2.5" y="9.5" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <rect x="6" y="6" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <rect x="9.5" y="2.5" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

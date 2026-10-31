import { cn } from '@/lib/utils';

/** Progresso do assistente em segmentos (um por passo): os passos já alcançados ficam no acento. */
export function StepProgressBar({ current, total, className }: { current: number; total: number; className?: string }) {
  const done = Math.max(0, Math.min(total, current));
  return (
    <div className={cn('seg-progress w-full', className)} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label={`Passo ${current} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} data-on={i < done ? 'true' : undefined} className="transition-colors duration-300" />
      ))}
    </div>
  );
}

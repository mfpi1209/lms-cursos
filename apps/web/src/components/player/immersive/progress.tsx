import { cn } from '@/lib/utils';
import type { LessonRunStatus } from '../types';

/**
 * Progresso do curso em segmentos (um por aula, como na referência): aulas
 * concluídas e a aula atual cheias no acento, as demais no trilho do tema. O
 * `progressbar` mede a AULA atual (o que muda a cada cena) e diz em que aula
 * do curso a pessoa está.
 */
export function SegmentedProgress({
  lessons,
  currentIndex,
  percent,
  className,
}: {
  lessons: Array<{ id: string; title: string; status: LessonRunStatus }>;
  currentIndex: number;
  percent: number;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const total = Math.max(1, lessons.length);
  const segs = lessons.length > 0 ? lessons : [{ id: '_', title: '', status: 'in_progress' as const }];
  return (
    <div
      role="progressbar"
      aria-label="Progresso da aula"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}% da aula ${currentIndex + 1} de ${total}`}
      data-testid="player-progress"
      className={cn('flex items-center gap-1.5', className)}
    >
      {segs.map((l, i) => (
        <span
          key={l.id}
          aria-hidden="true"
          data-on={i === currentIndex || l.status === 'completed' || undefined}
          className={cn('h-1 w-10 rounded-full md:w-14', i === currentIndex || l.status === 'completed' ? 'bg-[var(--im-accent)] shadow-[inset_0_0_0_1px_var(--im-seg-ring)]' : 'bg-fg/15')}
        />
      ))}
      <span className="sr-only">{value}%</span>
    </div>
  );
}

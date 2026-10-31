import { cn } from '@/lib/utils';

/**
 * Miniatura redonda do apresentador do curso. Com `src`, mostra a foto de prévia;
 * sem, um círculo com a primeira letra do título no acento.
 */
export function PresenterThumb({ src, name, size = 48, className }: { src?: string | null; name: string; size?: 40 | 48 | 64; className?: string }) {
  const dim = { 40: 'h-10 w-10 text-base', 48: 'h-12 w-12 text-lg', 64: 'h-16 w-16 text-2xl' }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover object-top ring-2 ring-surface', dim, className)} />;
  }
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full bg-surface-2 font-display font-bold text-accent ring-1 ring-line-strong', dim, className)}>
      {letter}
    </span>
  );
}

'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMediaQueue } from './use-media-queue';

/**
 * Pílula compacta "3 gerando · 12 na fila" para o cabeçalho do curso. Some
 * quando nada está na fila nem em produção; leva à página de produção.
 */
export function QueueIndicator({ courseId, className }: { courseId: string; className?: string }) {
  const { data } = useMediaQueue(courseId);
  if (!data) return null;
  const { active, waiting } = data.summary;
  if (active + waiting === 0) return null;
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} gerando`);
  if (waiting > 0) parts.push(`${waiting} na fila`);
  const text = parts.join(' · ');
  return (
    <Link
      href={`/estudio/cursos/${courseId}/producao`}
      className={cn('inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg', className)}
      data-testid="queue-indicator"
      aria-label={`Vídeos: ${text}. Abrir a produção de vídeos`}
    >
      <span className="pulse-dot h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
      <span className="tabular-nums">{text}</span>
    </Link>
  );
}

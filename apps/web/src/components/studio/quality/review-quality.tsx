'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatScore, isLowScore, scoreLabel, scoreTone } from './quality-model';
import { useCourseQuality } from './use-quality';

const TONE_TEXT = { danger: 'text-danger', warning: 'text-paid', success: 'text-success', neutral: 'text-fg-faint' } as const;

/**
 * Linha da avaliação no resumo de publicação. Aviso (não bloqueante) quando a
 * nota geral do curso está abaixo de 3. Some quando a rota não existe ou nada
 * foi avaliado ainda.
 */
export function ReviewQuality({ courseId, lessonCount }: { courseId: string; lessonCount: number }) {
  const quality = useCourseQuality(courseId);
  if (quality.unavailable || !quality.data) return null;
  const overall = quality.data.course.overall;
  const evaluated = quality.data.lessons.filter((l) => l.scorecard).length;
  const stale = quality.data.lessons.filter((l) => l.stale).length;
  const tone = scoreTone(overall);
  const low = isLowScore(overall);
  return (
    <div className="space-y-2" data-testid="review-quality" data-low={low ? 'true' : undefined}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <Gauge className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="font-medium text-fg">Avaliação:</span>{' '}
          {typeof overall === 'number' ? (
            <>
              <span className={cn('font-semibold tabular-nums', TONE_TEXT[tone])}>{formatScore(overall)}</span> de 5 · {scoreLabel(overall)}
              {lessonCount > 0 && ` · ${evaluated} de ${lessonCount} ${lessonCount === 1 ? 'aula avaliada' : 'aulas avaliadas'}`}
              {stale > 0 && ` · ${stale} ${stale === 1 ? 'desatualizada' : 'desatualizadas'}`}
            </>
          ) : (
            'nenhuma aula avaliada ainda'
          )}
        </span>
        <Link href={`/estudio/cursos/${courseId}`} className="font-medium text-accent-strong underline-offset-2 hover:underline">
          Ver qualidade do curso
        </Link>
      </p>
      {low && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid" data-testid="review-quality-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Avaliação baixa: revise antes de publicar.</span> A nota não bloqueia a publicação, mas indica que há cenas que precisam de ajustes.
          </span>
        </p>
      )}
    </div>
  );
}

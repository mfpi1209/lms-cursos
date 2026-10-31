'use client';

import * as React from 'react';
import Link from 'next/link';
import { Gauge, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { focusAfter } from '@/components/ui/focus-trap';
import { cn } from '@/lib/utils';
import { QUALITY_DIMENSION_LABELS, formatScore, scoreLabel, scoreTone, worstDimension } from './quality-model';
import { BasisToggle, OverallScore } from './quality-panel';
import { useCourseQuality } from './use-quality';

export interface CourseQualityLesson {
  id: string;
  title: string;
  /** vídeos prontos na aula (para a opção "Texto e vídeo") */
  readyVideos: number;
}

const TONE_BADGE = { danger: 'danger', warning: 'warning', success: 'success', neutral: 'neutral' } as const;

/**
 * "Qualidade do curso": nota geral do curso, uma linha por aula (nota, selo de
 * desatualizada, pior dimensão) e "Avaliar todas", que avalia aula por aula.
 */
export function CourseQualityCard({ courseId, lessons, headingLevel = 'h2', className }: { courseId: string; lessons: CourseQualityLesson[]; headingLevel?: 'h2' | 'h3'; className?: string }) {
  const Heading = headingLevel;
  const headingId = React.useId();
  const idPrefix = React.useId().replace(/:/g, '');
  const quality = useCourseQuality(courseId);
  const [includeVideo, setIncludeVideo] = React.useState(false);
  const base = `/estudio/cursos/${courseId}`;
  const readyVideos = lessons.reduce((s, l) => s + l.readyVideos, 0);
  React.useEffect(() => {
    if (readyVideos === 0) setIncludeVideo(false);
  }, [readyVideos]);

  const byLesson = React.useMemo(() => new Map((quality.data?.lessons ?? []).map((l) => [l.lessonId, l])), [quality.data]);
  const evaluated = lessons.filter((l) => byLesson.get(l.id)?.scorecard).length;
  const staleCount = lessons.filter((l) => byLesson.get(l.id)?.stale).length;
  const running = !!quality.progress?.running;
  const canEvaluate = !quality.unavailable && !running && lessons.length > 0;
  const title = (id: string) => lessons.find((l) => l.id === id)?.title ?? id;

  const evaluateAll = async () => {
    focusAfter(`[data-testid="course-quality-progress"]`, { preventScroll: true });
    await quality.evaluateAll(
      lessons.map((l) => l.id),
      includeVideo,
    );
  };

  const p = quality.progress;
  const progressText = (() => {
    if (!p) return '';
    if (p.running) return `Avaliando ${p.current} de ${p.total}: ${p.currentLessonId ? title(p.currentLessonId) : ''}…`;
    const parts: string[] = [];
    parts.push(`${p.done.length} de ${p.total} ${p.done.length === 1 ? 'aula avaliada' : 'aulas avaliadas'}.`);
    if (p.skipped.length) parts.push(`${p.skipped.length} ${p.skipped.length === 1 ? 'pulada (já tinha execução em andamento)' : 'puladas (já tinham execução em andamento)'}: ${p.skipped.map(title).join(', ')}.`);
    if (p.failed.length) parts.push(`${p.failed.length} com erro: ${p.failed.map((f) => `${title(f.lessonId)} (${f.error})`).join('; ')}.`);
    return parts.join(' ');
  })();

  return (
    <section aria-labelledby={headingId} data-testid="course-quality" data-state={quality.unavailable ? 'unavailable' : quality.data ? 'ready' : 'loading'} className={cn('panel space-y-4 p-5 sm:p-6', className)}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Heading id={headingId} className="flex items-center gap-2 text-xl sm:text-2xl">
          <Gauge className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          Qualidade do curso
        </Heading>
        <OverallScore score={quality.data?.course.overall ?? null} data-testid="course-quality-overall" />
        {quality.data && lessons.length > 0 && (
          <span className="text-xs text-fg-faint">
            {evaluated} de {lessons.length} {lessons.length === 1 ? 'aula avaliada' : 'aulas avaliadas'}
            {staleCount > 0 && ` · ${staleCount} ${staleCount === 1 ? 'desatualizada' : 'desatualizadas'}`}
          </span>
        )}
        <div className="flex basis-full flex-wrap items-center gap-2 sm:ml-auto sm:basis-auto sm:justify-end">
          {!quality.unavailable && <BasisToggle value={includeVideo} onChange={setIncludeVideo} readyVideos={readyVideos} disabled={!canEvaluate} idPrefix={`${idPrefix}-cq`} />}
          {running ? (
            <Button variant="ghost" size="sm" onClick={quality.cancelAll} data-testid="course-quality-cancel">
              Parar depois desta
            </Button>
          ) : (
            <Button
              variant="ai"
              size="sm"
              disabled={!canEvaluate}
              title={quality.unavailable ? 'A avaliação ainda não está disponível neste servidor' : lessons.length === 0 ? 'Nenhuma aula para avaliar' : 'Avalia as aulas uma a uma; cada avaliação usa a IA'}
              onClick={() => void evaluateAll()}
              data-testid="course-quality-evaluate-all"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Avaliar todas
            </Button>
          )}
        </div>
      </header>

      {(p || quality.error) && (
        <div className="space-y-2">
          {p && (
            <p tabIndex={-1} role="status" aria-live="polite" className={cn('flex flex-wrap items-center gap-x-2 rounded-full px-4 py-2 text-sm outline-none', p.running ? 'border border-ai/30 bg-ai-soft text-ai' : 'bg-surface-2 text-fg-muted')} data-testid="course-quality-progress">
              {p.running && <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-ai" aria-hidden="true" />}
              <span className="flex-1">{progressText}</span>
              {!p.running && (
                <button type="button" className="min-h-6 rounded text-xs underline" onClick={quality.cancelAll} aria-label="Fechar resumo">
                  Fechar
                </button>
              )}
            </p>
          )}
          {quality.error && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
              <span className="flex-1">{quality.error}</span>
              <button type="button" className="min-h-6 rounded text-xs underline" onClick={quality.clearError}>Fechar</button>
            </p>
          )}
        </div>
      )}

      {quality.unavailable ? (
        <p className="text-sm text-fg-muted" data-testid="course-quality-unavailable">Avaliação ainda não disponível.</p>
      ) : quality.loading && !quality.data ? (
        <p className="text-sm text-fg-muted">Carregando avaliação…</p>
      ) : lessons.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma aula para avaliar ainda.</p>
      ) : (
        <ul className="divide-y divide-line" aria-label="Avaliação por aula">
          {lessons.map((l, i) => {
            const q = byLesson.get(l.id);
            const sc = q?.scorecard ?? null;
            const worst = worstDimension(sc?.scores);
            const tone = scoreTone(sc?.overall);
            const current = p?.running && p.currentLessonId === l.id;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-testid={`course-quality-lesson-${l.id}`}>
                <span className="w-5 shrink-0 text-xs tabular-nums text-fg-faint" aria-hidden="true">{i + 1}</span>
                <Link href={`${base}/aulas/${l.id}#quality-panel`} className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-fg hover:underline">
                  {l.title}
                </Link>
                <span className="flex flex-wrap items-center gap-1.5">
                  {current ? (
                    <Badge tone="ai">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ai" aria-hidden="true" /> Avaliando…
                    </Badge>
                  ) : sc ? (
                    <>
                      <Badge tone={TONE_BADGE[tone]} aria-label={`Nota ${formatScore(sc.overall)} de 5: ${scoreLabel(sc.overall)}`}>
                        <span className="tabular-nums">{formatScore(sc.overall)}</span>
                        <span aria-hidden="true">/5 · {scoreLabel(sc.overall)}</span>
                      </Badge>
                      {q?.stale && <Badge tone="warning">Desatualizada</Badge>}
                      {worst && (
                        <span className="text-xs text-fg-muted">
                          Pior: {QUALITY_DIMENSION_LABELS[worst.dimension]} <span className="tabular-nums">{worst.score}</span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-fg-faint">Sem avaliação</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

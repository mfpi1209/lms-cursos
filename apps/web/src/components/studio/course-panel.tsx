'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clapperboard, Play, Wand2 } from 'lucide-react';
import { EXPERIENCE_FAMILY_LABELS, WIZARD_STEPS } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { PresenterThumb } from '@/components/studio/presenter-thumb';
import { useDraft } from './draft-provider';
import { ProductionPanel } from './media-queue/production-panel';
import { useMediaQueue } from './media-queue/use-media-queue';
import { STEP_META, lessonStats, nextStepFor, presentationSummary, type StepStatusContext } from './wizard/wizard-state';
import { primaryAction } from './wizard/next-action';
import { NextActionCard } from './wizard/next-action-card';
import { TrailStrip } from './wizard/trail';
import { useSources } from './wizard/use-sources';
import { useModes } from './wizard/use-modes';
import { STEP_PARAM } from './wizard/wizard-shell';
import { courseVideoStats, lessonVideoStats, videoStatsLine } from './video-stats';
import { CourseQualityCard } from './quality/course-quality-card';
import { CourseVideoList } from './test-mode/video-list';

/** Painel do curso. Lê o rascunho ao vivo; `assembling` mostra o aviso de montagem em andamento. */
export function CoursePanel({ courseId, latestVersionNumber, assembling = false }: { courseId: string; latestVersionNumber: number; assembling?: boolean }) {
  const { document: doc } = useDraft();
  const base = `/estudio/cursos/${courseId}`;
  const lessons = doc.modules.flatMap((m) => m.lessons.map((l) => ({ lesson: l, moduleTitle: m.title })));
  const totalMinutes = lessons.reduce((s, { lesson }) => s + lesson.estimatedMinutes, 0);
  const p = doc.presentation;
  const queue = useMediaQueue(courseId);
  const sources = useSources(courseId);
  const modes = useModes();
  const hasJobs = !!queue.data && queue.data.summary.total > 0;
  const videos = courseVideoStats(doc, queue.data?.items);

  const ctx = React.useMemo<StepStatusContext>(
    () => ({ sourcesProcessing: sources.processing, sourcesFailed: sources.failed, videosGenerating: videos.generating, videosStale: videos.stale }),
    [sources.processing, sources.failed, videos.generating, videos.stale],
  );
  // "Continuar montagem" leva ao primeiro passo que ainda não está pronto (não sempre à publicação)
  const nextStep = nextStepFor(doc, ctx);
  const action = React.useMemo(
    () =>
      primaryAction(doc, {
        ...ctx,
        courseId,
        aiConfigured: modes.aiConfigured ?? undefined,
        videos,
        sourcesReady: sources.ready,
        mediaQueue: queue.data?.items.map((i) => ({ lessonId: i.lessonId, nodeId: i.nodeId, status: i.status })),
      }),
    [doc, ctx, courseId, modes.aiConfigured, videos, sources.ready, queue.data?.items],
  );
  const hrefFor = (step: (typeof WIZARD_STEPS)[number]) => `${base}/montar?${STEP_PARAM}=${step}`;

  return (
    <div className="space-y-12" data-testid="course-panel">
      {assembling && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-fg" data-testid="assembling-banner">
          <Wand2 className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <span className="font-medium">Montagem em andamento.</span>
          <span className="text-fg-muted">O curso ainda não foi publicado. Próximo passo: {STEP_META[nextStep].label}.</span>
          <Link href={hrefFor(nextStep)} className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline">
            Continuar no assistente
          </Link>
        </p>
      )}

      <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="panel rise space-y-8 p-6 sm:p-8">
          <p className="max-w-prose text-lg leading-relaxed text-fg">{doc.brief.topic || doc.description || 'Sem resumo ainda. Edite em Detalhes.'}</p>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {doc.brief.audience && (
              <div>
                <dt className="text-sm text-fg-faint">Para quem</dt>
                <dd className="mt-1 text-fg">{doc.brief.audience}</dd>
              </div>
            )}
            {doc.brief.finalSkill && (
              <div>
                <dt className="text-sm text-fg-faint">Ao terminar, a pessoa consegue</dt>
                <dd className="mt-1 text-fg">{doc.brief.finalSkill}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-fg-faint">Tamanho</dt>
              <dd className="mt-1 text-fg">
                <span className="font-display text-2xl font-bold tabular-nums">{lessons.length}</span> {lessons.length === 1 ? 'aula' : 'aulas'}, cerca de {totalMinutes} min
              </dd>
            </div>
            <div>
              <dt className="text-sm text-fg-faint">Vídeos</dt>
              <dd className="mt-1 text-fg" data-testid="course-video-stats">
                <span className="font-display text-2xl font-bold tabular-nums">{videos.ready}</span> de {videos.total} {videos.total === 1 ? 'cena' : 'cenas'} com vídeo pronto
                {(videos.stale > 0 || videos.generating > 0 || videos.missing > 0) && <span className="block text-sm text-fg-muted">{videoStatsLine(videos, { lead: false })}</span>}
              </dd>
            </div>
          </dl>
          <div className="flex items-center gap-4 rounded-2xl bg-bg-2 p-4">
            <PresenterThumb src={p.avatarPreviewUrl} name={p.avatarName ?? doc.title} size={48} />
            <div className="min-w-0">
              <p className="text-sm text-fg-faint">Apresentação</p>
              <p className="truncate text-sm font-medium text-fg">{presentationSummary(p)}</p>
            </div>
          </div>
          {/* trilha de montagem: 8 passos com o estado de cada um; cada passo abre o assistente nele */}
          <TrailStrip doc={doc} ctx={ctx} hrefFor={hrefFor} className="border-t border-line pt-6" />
        </div>

        <div className="flex flex-col gap-3">
          <NextActionCard action={action} href={hrefFor(action.step)} variant="rail" />
          <Link href={hrefFor(nextStep)} className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')} data-testid="panel-continue">
            {assembling ? 'Continuar montagem' : 'Abrir o assistente'}: {STEP_META[nextStep].short}
          </Link>
          <Link href={`${base}/revisao`} className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>
            Revisão e publicação
          </Link>
          <Link href={`${base}/matriculas`} className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>
            Matrículas
          </Link>
          {videos.total > 0 && (
            <a href="#panel-videos" className={cn(buttonVariants({ variant: 'ghost' }), 'w-full gap-2')} data-testid="panel-videos-link">
              <Clapperboard className="h-4 w-4" aria-hidden="true" /> Vídeos e testes
            </a>
          )}
          <p className="text-center text-sm text-fg-faint">{latestVersionNumber > 0 ? `Versão publicada ${latestVersionNumber}` : 'Ainda não publicado'}</p>
        </div>
      </section>

      {hasJobs && <ProductionPanel courseId={courseId} headingLevel="h2" showPageLink />}

      <CourseQualityCard courseId={courseId} lessons={lessons.map(({ lesson }) => ({ id: lesson.id, title: lesson.title, readyVideos: lessonVideoStats(lesson, queue.data?.items, doc.presentation).ready }))} />

      <section aria-labelledby="panel-lessons" className="space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="panel-lessons" className="text-2xl sm:text-3xl">Aulas</h2>
          {lessons.length > 0 && <span className="text-sm text-fg-faint">{lessons.length} {lessons.length === 1 ? 'aula' : 'aulas'}</span>}
        </div>
        {lessons.length === 0 ? (
          <p className="panel px-6 py-10 text-center text-fg-muted">
            Nenhuma aula ainda.{' '}
            <Link href={hrefFor('estrutura')} className="font-medium text-accent-strong hover:underline">Abra o assistente</Link> para propor a estrutura.
          </p>
        ) : (
          <ul className="space-y-3">
            {lessons.map(({ lesson, moduleTitle }, i) => {
              const s = lessonStats(lesson);
              const v = lessonVideoStats(lesson, queue.data?.items, doc.presentation);
              return (
                <li key={lesson.id} className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid={`panel-lesson-${lesson.id}`}>
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-base font-bold text-accent-strong tabular-nums" aria-hidden="true">{i + 1}</span>
                    <div className="min-w-0 space-y-1">
                      <p id={`panel-lesson-title-${lesson.id}`} className="font-display text-lg font-bold leading-tight text-fg break-words">{lesson.title}</p>
                      <p className="text-sm text-fg-muted">{moduleTitle} · {EXPERIENCE_FAMILY_LABELS[lesson.family]}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {s.empty ? (
                          <Badge tone="warning">Sem cenas</Badge>
                        ) : (
                          <Badge tone="neutral">{s.scenes} {s.scenes === 1 ? 'cena' : 'cenas'}</Badge>
                        )}
                        {v.total > 0 && (
                          <Badge tone={v.ready === v.total ? 'success' : v.stale > 0 ? 'warning' : 'neutral'}>
                            <Clapperboard className="h-3 w-3" aria-hidden="true" /> {v.ready} de {v.total} com vídeo pronto
                            {v.stale > 0 && ` · ${v.stale} ${v.stale === 1 ? 'desatualizado' : 'desatualizados'}`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`${base}/aulas/${lesson.id}`} aria-describedby={`panel-lesson-title-${lesson.id}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Storyboard</Link>
                    <Link href={`${base}/aulas/${lesson.id}/previa`} aria-describedby={`panel-lesson-title-${lesson.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                      <Play className="h-4 w-4" aria-hidden="true" /> Prévia
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Vídeos: cada cena com vídeo/direção e "Testar" (prévia já nessa cena) */}
      <CourseVideoList courseId={courseId} />
    </div>
  );
}

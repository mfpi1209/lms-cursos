'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { WIZARD_STEPS, type WizardStep } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { SaveStatus, useDraft } from '@/components/studio/draft-provider';
import { useMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { courseVideoStats } from '@/components/studio/video-stats';
import { STEP_META, blockerFor, isWizardStep, maxReachableIndex, stepAt, stepIndex, stepStatus, type StepStatusContext } from './wizard-state';
import { primaryAction } from './next-action';
import { NextActionCard } from './next-action-card';
import { StepHeader } from './step-header';
import { DOT_STYLE, TrailStrip, trailStatuses } from './trail';
import { SourcesProvider, useSources } from './use-sources';
import { useModes } from './use-modes';
import { StepTema } from './step-tema';
import { StepConteudo } from './step-conteudo';
import { StepEstrutura } from './step-estrutura';
import { StepApresentacao } from './step-apresentacao';
import { StepAulas } from './step-aulas';
import { StepPrevia } from './step-previa';
import { StepProducao } from './step-producao';
import { StepRevisao } from './step-revisao';
import { AssistantScope } from '@/components/studio/assistant/use-assistant';
import { PromptChips, WIZARD_STEP_CHIPS } from '@/components/studio/assistant/prompt-chips';

/** Nome do parâmetro que abre o assistente num passo (`/montar?passo=apresentacao`). */
export const STEP_PARAM = 'passo';

export function WizardShell({ courseId, canPublish }: { courseId: string; canPublish: boolean }) {
  return (
    <SourcesProvider courseId={courseId}>
      <Shell courseId={courseId} canPublish={canPublish} />
    </SourcesProvider>
  );
}

function Shell({ courseId, canPublish }: { courseId: string; canPublish: boolean }) {
  const { document: doc, update } = useDraft();
  const sources = useSources(courseId);
  const queue = useMediaQueue(courseId);
  const modes = useModes();
  const current = doc.wizard.step;
  const idx = stepIndex(current);
  const reachable = maxReachableIndex(doc);
  const [attempted, setAttempted] = React.useState(false);
  const blocker = blockerFor(current, doc);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const videos = React.useMemo(() => courseVideoStats(doc, queue.data?.items), [doc, queue.data?.items]);
  const ctx = React.useMemo<StepStatusContext>(
    () => ({ sourcesProcessing: sources.processing, sourcesFailed: sources.failed, videosGenerating: videos.generating, videosStale: videos.stale }),
    [sources.processing, sources.failed, videos.generating, videos.stale],
  );
  const statuses = React.useMemo(() => trailStatuses(doc, ctx), [doc, ctx]);
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

  const goTo = React.useCallback(
    (step: WizardStep) => {
      setAttempted(false);
      update((d) => (d.wizard.step === step ? d : { ...d, wizard: { ...d.wizard, step } }));
      requestAnimationFrame(() => headingRef.current?.focus());
    },
    [update],
  );

  // `/montar?passo=<passo>`: abre nesse passo (se já estiver ao alcance) e limpa o parâmetro.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get(STEP_PARAM);
    if (!wanted) return;
    url.searchParams.delete(STEP_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    if (isWizardStep(wanted) && stepIndex(wanted) <= maxReachableIndex(doc)) goTo(wanted);
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    if (blocker) {
      setAttempted(true);
      return;
    }
    const n = stepAt(idx + 1);
    if (!n) return;
    setAttempted(false);
    update((d) => ({
      ...d,
      wizard: { ...d.wizard, step: n, completedSteps: d.wizard.completedSteps.includes(current) ? d.wizard.completedSteps : [...d.wizard.completedSteps, current] },
    }));
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const prev = () => {
    const p = stepAt(idx - 1);
    if (p) goTo(p);
  };

  const isLast = idx === WIZARD_STEPS.length - 1;
  const total = WIZARD_STEPS.length;
  const nextMeta = stepAt(idx + 1) ? STEP_META[stepAt(idx + 1)!] : null;
  const status = stepStatus(current, doc, ctx);

  return (
    <div className="space-y-8" data-testid="wizard">
      <AssistantScope context={{ screen: 'wizard', step: current }} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <nav aria-label="Trilha de navegação" className="min-w-0 text-fg-faint">
          <Link href="/estudio" className="inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline">Cursos</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/estudio/cursos/${courseId}`} className="inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline">{doc.title || 'Novo curso'}</Link>
          <span aria-hidden="true"> / </span>
          <span className="text-fg" aria-current="page">Montagem</span>
        </nav>
        <div className="flex items-center gap-4">
          <SaveStatus />
          <Link href={`/estudio/cursos/${courseId}/detalhes`} className="inline-flex min-h-11 items-center rounded-md px-1 text-fg-muted hover:text-fg hover:underline">Modo avançado</Link>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:gap-12">
        {/* Trilha vertical (desktop) */}
        <nav aria-label="Passos da montagem" className="hidden lg:block">
          <ol className="sticky top-28">
            {WIZARD_STEPS.map((s, i) => {
              const st = statuses[s];
              const isCurrent = s === current;
              const enabled = i <= reachable;
              const last = i === total - 1;
              return (
                <li key={s} className="relative pl-12 pb-7 last:pb-0">
                  {!last && <span aria-hidden="true" className={cn('absolute left-[15px] top-9 bottom-0 w-px', st === 'ready' ? 'bg-accent' : 'bg-line-strong')} />}
                  <span
                    aria-hidden="true"
                    className={cn('absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-semibold tabular-nums transition-colors', DOT_STYLE[st], isCurrent && 'pulse-dot ring-2 ring-accent/40 ring-offset-2 ring-offset-bg')}
                  >
                    {st === 'ready' && !isCurrent ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => enabled && goTo(s)}
                    disabled={!enabled}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-describedby={`wizard-step-lead-${s}`}
                    data-testid={`wizard-step-${s}`}
                    className={cn('block min-h-8 w-full rounded-lg py-1 text-left transition-colors', enabled && !isCurrent && 'hover:text-fg', !enabled && 'cursor-not-allowed')}
                  >
                    <span className={cn('block text-base font-semibold leading-6', isCurrent ? 'text-fg' : st !== 'not_started' ? 'text-fg-muted' : 'text-fg-faint')}>{STEP_META[s].label}</span>
                    <span className="sr-only">{isCurrent ? ' (passo atual)' : st === 'ready' ? ' (pronto)' : st === 'stale' ? ' (desatualizado)' : enabled ? ' (pendente)' : ' (ainda indisponível)'}</span>
                  </button>
                  <p id={`wizard-step-lead-${s}`} className={cn('mt-0.5 line-clamp-2 text-sm', isCurrent ? 'text-fg-muted' : 'text-fg-faint')}>{STEP_META[s].lead}</p>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Conteúdo */}
        <div className="min-w-0 max-w-3xl space-y-8">
          {/* Trilha compacta (celular/tablet) */}
          <div className="space-y-3 lg:hidden">
            <TrailStrip doc={doc} ctx={ctx} current={current} onSelect={goTo} reachableIndex={reachable} />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="icon" onClick={prev} disabled={idx === 0} aria-label="Passo anterior">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <p className="text-sm font-medium text-fg">
                Passo {idx + 1} de {total} <span className="text-fg-faint">·</span> {STEP_META[current].short}
              </p>
              <Button variant="ghost" size="icon" onClick={next} disabled={isLast} aria-label="Próximo passo">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Próxima ação em faixa (abaixo de xl; em xl vira a coluna da direita) */}
          <NextActionCard action={action} onGo={(a) => goTo(a.step)} variant="strip" className="xl:hidden" />

          <StepHeader ref={headingRef} step={current} status={status} />

          <div key={current} className="panel rise p-6 sm:p-10">
            {current === 'tema' && <StepTema />}
            {current === 'conteudo' && <StepConteudo />}
            {current === 'estrutura' && <StepEstrutura />}
            {current === 'aulas' && <StepAulas />}
            {current === 'apresentacao' && <StepApresentacao />}
            {current === 'previa' && <StepPrevia onTested={() => update((d) => (d.wizard.completedSteps.includes('previa') ? d : { ...d, wizard: { ...d.wizard, completedSteps: [...d.wizard.completedSteps, 'previa'] } }))} />}
            {current === 'producao' && <StepProducao />}
            {current === 'revisao' && <StepRevisao canPublish={canPublish} />}
          </div>

          <PromptChips key={`chips-${current}`} chips={WIZARD_STEP_CHIPS[current] ?? []} context={{ screen: 'wizard', step: current }} className="-mt-4" />

          <footer className="space-y-4">
            {attempted && blocker && (
              <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{blocker}</p>
            )}
            {!attempted && current === 'conteudo' && sources.processing > 0 && (
              <p role="status" className="rounded-xl border border-paid/30 bg-paid-soft px-4 py-3 text-sm text-fg">
                Ainda lendo {sources.processing === 1 ? '1 arquivo' : `${sources.processing} arquivos`}. Se continuar agora, a IA não usa esse material até a leitura terminar.
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={prev} disabled={idx === 0} data-testid="wizard-prev">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar
              </Button>
              {isLast ? (
                <Link href={`/estudio/cursos/${courseId}`} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))} data-testid="wizard-next">
                  Ir para o painel do curso
                </Link>
              ) : (
                <Button size="lg" onClick={next} data-testid="wizard-next">
                  Continuar para {nextMeta?.short}
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </footer>
        </div>

        {/* Coluna da direita (desktop largo): próxima ação */}
        <aside className="hidden xl:block">
          <div className="sticky top-28 space-y-4">
            <NextActionCard action={action} onGo={(a) => goTo(a.step)} variant="rail" />
          </div>
        </aside>
      </div>
    </div>
  );
}

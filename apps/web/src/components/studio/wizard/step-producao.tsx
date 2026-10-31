'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleAlert, ListVideo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { useDraft } from '@/components/studio/draft-provider';
import { ProductionPanel } from '../media-queue/production-panel';
import { useMediaQueue } from '../media-queue/use-media-queue';
import { courseVideoStats, videoStatsLine } from '../video-stats';
import { VideosBlock } from './step-revisao';
import { presentationSummary } from './wizard-state';

/**
 * Produção de vídeo: a única etapa paga. Resume o que vai ser produzido, com
 * quem e em que modo; o pedido em lote (orçamento → confirmação) é o
 * `VideosBlock`; a fila é o `ProductionPanel`.
 */
export function StepProducao() {
  const { courseId, document: doc } = useDraft();
  const queue = useMediaQueue(courseId);
  const stats = React.useMemo(() => courseVideoStats(doc, queue.data?.items), [doc, queue.data?.items]);
  const hasJobs = !!queue.data && queue.data.summary.total > 0;
  const inProduction = !!queue.data && queue.data.summary.active + queue.data.summary.waiting > 0;
  const tested = doc.wizard.completedSteps.includes('previa');
  const p = doc.presentation;
  const simulation = queue.data?.simulation ?? null;

  return (
    <div className="space-y-10">
      <section aria-labelledby="producao-resumo" className="space-y-4">
        <h2 id="producao-resumo" className="font-display text-xl font-bold">O que vai ser produzido</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat label="Cenas com texto" value={stats.total} note={stats.total === 1 ? 'vira 1 vídeo' : 'viram vídeos'} />
          <Stat label="Com vídeo pronto" value={stats.ready} note={stats.total > 0 ? videoStatsLine(stats, { lead: false }) : 'nada a produzir'} />
          <div className="rounded-xl border border-line bg-bg-2 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-faint">Apresentação</dt>
            <dd className="mt-1 text-sm text-fg">{presentationSummary(p)}</dd>
            <dd className="mt-2">
              <Badge tone={simulation === false ? 'warning' : 'neutral'}>{simulation === null ? 'Modo: …' : simulation ? 'Vídeo simulado (sem custo)' : 'Vídeo real (pago)'}</Badge>
            </dd>
          </div>
        </dl>
        {!p.avatarId && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Escolha quem apresenta no passo "Apresentação" antes de produzir.</span>
          </p>
        )}
        {!tested && stats.missing > 0 && (
          <p role="status" className="rounded-xl border border-paid/30 bg-paid-soft px-4 py-3 text-sm text-fg">
            Você ainda não testou o curso na Prévia. Vale fazer isso antes: trocar o texto depois do vídeo pronto deixa o vídeo desatualizado e custa de novo.
          </p>
        )}
        <p className="text-sm text-fg-muted">
          Como funciona: você pede o orçamento, confirma, e cada cena entra numa fila. Os vídeos ficam prontos aos poucos e aparecem no storyboard; você pode sair desta tela. Cenas que já têm vídeo atualizado não são refeitas.
        </p>
      </section>

      <VideosBlock courseId={courseId} />

      {hasJobs && !inProduction && (
        <section className="space-y-3">
          <ProductionPanel courseId={courseId} headingLevel="h3" />
        </section>
      )}

      <p className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
        <ListVideo className="h-4 w-4" aria-hidden="true" />
        Para ver cada vídeo, trocar um plano ou refazer uma cena, use a página de produção.
        <Link href={`/estudio/cursos/${courseId}/producao`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>Abrir a produção completa</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-faint">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold tabular-nums text-fg">{value}</dd>
      {note && <dd className="text-xs text-fg-muted">{note}</dd>}
    </div>
  );
}

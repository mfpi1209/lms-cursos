'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clapperboard, Film } from 'lucide-react';
import { findLesson } from '@lms/course-schema';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { useDraft } from '@/components/studio/draft-provider';
import { nodeScriptText } from '@/components/studio/graph-ops';
import { presentationBlocker, requestSceneVideo } from '@/components/studio/storyboard/generate';
import { useMediaQueue, type MediaQueueValue } from './use-media-queue';
import { courseVideoStats, videosReadyLine } from '../video-stats';
import {
  ACTIVE_PHASES,
  PHASE_LABEL,
  formatDuration,
  formatElapsed,
  humanizeJobError,
  isActivePhase,
  type MediaQueueItem,
  type MediaQueueResponse,
  type QueuePhase,
} from './queue-model';

const NO_HISTORY = 'estimativa disponível após o primeiro vídeo';
/** quantos itens da fila mostrar antes de "Mostrar todos" */
const WAITING_PREVIEW = 8;

export interface ProductionPanelProps {
  courseId: string;
  /** nível do título (h2 numa página, h3 dentro do assistente) */
  headingLevel?: 'h2' | 'h3' | 'h4';
  /** mostra o link para a página de produção (útil no painel do curso) */
  showPageLink?: boolean;
  className?: string;
}

/** Relógio que avança a cada `ms` enquanto `active`; serve ao "começou há X". */
function useNow(active: boolean, ms = 15000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
  return now;
}

/** Frase de cabeçalho em palavras simples: "3 gerando agora · 12 na fila · cerca de 25 min para terminar". */
export function queueHeadline(data: MediaQueueResponse): string {
  const { active, waiting } = data.summary;
  if (active + waiting === 0) return 'Nenhum vídeo em produção agora.';
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} gerando agora`);
  if (waiting > 0) parts.push(`${waiting} na fila`);
  if (data.avgSeconds === null) parts.push(NO_HISTORY);
  else if (data.etaSeconds !== null) parts.push(`${formatDuration(data.etaSeconds)} para terminar`);
  return parts.join(' · ');
}

function groupItems(items: MediaQueueItem[]) {
  const active: MediaQueueItem[] = [];
  const waiting: MediaQueueItem[] = [];
  const done: MediaQueueItem[] = [];
  const failed: MediaQueueItem[] = [];
  for (const it of items) {
    if (it.phase === 'waiting') waiting.push(it);
    else if (isActivePhase(it.phase)) active.push(it);
    else if (it.phase === 'done') done.push(it);
    else if (it.phase === 'failed' || it.status === 'reconciliation_required') failed.push(it);
  }
  waiting.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  // uma falha que já foi pedida de novo (há um pedido mais novo da mesma cena) não precisa aparecer
  const retried = (f: MediaQueueItem) => items.some((o) => o.jobId !== f.jobId && o.nodeId === f.nodeId && o.lessonId === f.lessonId && o.createdAt > f.createdAt && o.phase !== 'failed' && o.phase !== 'canceled');
  return { active, waiting, done, failed: failed.filter((f) => !retried(f)) };
}

/**
 * Painel "Produção de vídeos": o que está sendo gerado agora, o que espera na
 * fila, o que ficou pronto e o que falhou, com etapas e tempo estimado. O
 * HeyGen não informa porcentagem; por isso cada vídeo mostra a etapa, não uma
 * barra de progresso.
 */
export function ProductionPanel({ courseId, headingLevel = 'h2', showPageLink = false, className }: ProductionPanelProps) {
  const queue = useMediaQueue(courseId);
  const { data, loading, error } = queue;
  const { document: doc } = useDraft();
  // a mesma contagem do painel do curso, do storyboard e da revisão
  const videos = React.useMemo(() => courseVideoStats(doc, data?.items), [doc, data?.items]);
  const Heading = headingLevel;
  const headingId = React.useId();
  const busy = !!data && data.summary.active + data.summary.waiting > 0;
  const now = useNow(busy);
  const [confirmCancelAll, setConfirmCancelAll] = React.useState(false);
  const [cancelingAll, setCancelingAll] = React.useState(false);
  const [actionMsg, setActionMsg] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [showAllWaiting, setShowAllWaiting] = React.useState(false);

  const groups = React.useMemo(() => groupItems(data?.items ?? []), [data]);

  const cancelAll = async () => {
    setCancelingAll(true);
    setActionMsg(null);
    try {
      const n = await queue.cancelWaiting();
      setActionMsg({ tone: 'ok', text: n === 0 ? 'Nada foi cancelado: a fila já estava vazia.' : `${n} ${n === 1 ? 'vídeo foi retirado' : 'vídeos foram retirados'} da fila.` });
    } catch (e) {
      setActionMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível cancelar a fila.' });
    } finally {
      setCancelingAll(false);
      setConfirmCancelAll(false);
    }
  };

  const summary = data?.summary;
  const denominator = summary ? Math.max(0, summary.total - summary.canceled) : 0;
  const ratio = summary && denominator > 0 ? Math.min(1, summary.succeeded / denominator) : 0;
  const perCourse = data?.limits.perCourse ?? 0;
  const empty = !!data && data.items.length === 0 && data.summary.active + data.summary.waiting === 0;

  return (
    <section aria-labelledby={headingId} className={cn('panel space-y-6 p-5 sm:p-6', className)} data-testid="production-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paid-soft text-paid" aria-hidden="true">
            <Clapperboard className="h-5 w-5" />
          </span>
          <Heading id={headingId} className="font-display text-xl font-bold sm:text-2xl">Produção de vídeos</Heading>
        </div>
        {showPageLink && (
          <Link href={`/estudio/cursos/${courseId}/producao`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-accent-strong hover:underline">
            Abrir a produção completa
          </Link>
        )}
      </div>

      {data?.simulation && (
        <p className="rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid" data-testid="queue-simulation">
          Modo de demonstração: nenhum provedor está configurado, então os vídeos são simulados e nada é produzido no HeyGen.
        </p>
      )}

      {/* Resumo: frase, progresso do curso e explicação da fila */}
      <div className="space-y-3">
        <p role="status" aria-live="polite" className="text-base font-medium text-fg" data-testid="queue-summary">
          {data ? (empty ? 'Nenhum vídeo em produção.' : queueHeadline(data)) : loading ? 'Consultando a fila de vídeos…' : 'Fila de vídeos indisponível no momento.'}
        </p>
        {summary && denominator > 0 && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-label="Vídeos prontos no curso"
              aria-valuemin={0}
              aria-valuemax={denominator}
              aria-valuenow={summary.succeeded}
              aria-valuetext={`${summary.succeeded} de ${denominator} vídeos prontos`}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg tabular-nums">{summary.succeeded}</span> de <span className="tabular-nums">{denominator}</span> {denominator === 1 ? 'pedido concluído' : 'pedidos concluídos'}
              {summary.failed > 0 && <span> · {summary.failed} {summary.failed === 1 ? 'falhou' : 'falharam'}</span>}
              {summary.canceled > 0 && <span className="text-fg-faint"> · {summary.canceled} {summary.canceled === 1 ? 'cancelado' : 'cancelados'}</span>}
            </p>
          </div>
        )}
        {videos.total > 0 && (
          <p className="text-sm text-fg-muted" data-testid="production-video-stats">
            <span className="font-medium text-fg">Cenas do curso:</span> {videosReadyLine(videos)}
          </p>
        )}
        {data && !empty && (
          <p className="max-w-prose text-sm text-fg-muted">
            O HeyGen produz até {perCourse} {perCourse === 1 ? 'vídeo' : 'vídeos'} por vez para este curso; os demais esperam a vez. Vídeos já enviados ao HeyGen não podem ser cancelados.
          </p>
        )}
        {error && data && <p className="text-xs text-fg-faint">Não foi possível atualizar agora; tentando de novo em instantes.</p>}
        {error && !data && !loading && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>

      {/* Cancelar tudo o que ainda espera */}
      {summary && summary.waiting > 0 && (
        <div className="space-y-2">
          {!confirmCancelAll ? (
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmCancelAll(true)} data-testid="queue-cancel-waiting">
              Cancelar os que estão na fila
            </Button>
          ) : (
            <div role="alertdialog" aria-labelledby={`${headingId}-cancel`} className="space-y-3 rounded-2xl border border-danger/30 bg-danger-soft p-4">
              <p id={`${headingId}-cancel`} className="text-sm text-fg">
                Retirar da fila {summary.waiting === 1 ? 'o vídeo que ainda espera' : `os ${summary.waiting} vídeos que ainda esperam`}?
                {summary.active > 0 && ` ${summary.active === 1 ? 'O vídeo que já está' : `Os ${summary.active} vídeos que já estão`} no HeyGen ${summary.active === 1 ? 'continua e será concluído' : 'continuam e serão concluídos'}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" size="sm" onClick={() => void cancelAll()} disabled={cancelingAll} data-testid="queue-cancel-waiting-confirm">
                  {cancelingAll ? 'Cancelando…' : 'Sim, retirar da fila'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancelAll(false)} disabled={cancelingAll}>
                  Manter na fila
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {actionMsg && (
        <p role={actionMsg.tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', actionMsg.tone === 'error' ? 'text-danger' : 'text-fg-muted')}>
          {actionMsg.text}
        </p>
      )}

      {groups.active.length > 0 && (
        <Group title="Gerando agora" count={groups.active.length}>
          <ul className="space-y-2">
            {groups.active.map((it) => (
              <ActiveRow key={it.jobId} item={it} now={now} avgSeconds={data?.avgSeconds ?? null} />
            ))}
          </ul>
        </Group>
      )}

      {groups.waiting.length > 0 && (
        <Group title="Na fila" count={summary?.waiting ?? groups.waiting.length}>
          <ol className="space-y-2">
            {(showAllWaiting ? groups.waiting : groups.waiting.slice(0, WAITING_PREVIEW)).map((it) => (
              <WaitingRow key={it.jobId} item={it} avgSeconds={data?.avgSeconds ?? null} queue={queue} />
            ))}
          </ol>
          {groups.waiting.length > WAITING_PREVIEW && (
            <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline" onClick={() => setShowAllWaiting((v) => !v)} aria-expanded={showAllWaiting}>
              {showAllWaiting ? 'Mostrar menos' : `Mostrar todos os ${groups.waiting.length}`}
            </button>
          )}
        </Group>
      )}

      {groups.done.length > 0 && (
        <Group title="Prontos" count={groups.done.length}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.done.map((it) => (
              <DoneRow key={it.jobId} item={it} courseId={courseId} now={now} />
            ))}
          </ul>
        </Group>
      )}

      {groups.failed.length > 0 && (
        <Group title="Falharam" count={groups.failed.length}>
          <ul className="space-y-2">
            {groups.failed.map((it) => (
              <FailedRow key={it.jobId} item={it} courseId={courseId} queue={queue} />
            ))}
          </ul>
        </Group>
      )}
    </section>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className="space-y-2" role="group" aria-labelledby={id}>
      <p id={id} className="flex items-baseline gap-2 text-sm font-semibold text-fg">
        {title} <span className="font-normal text-fg-faint tabular-nums">{count}</span>
      </p>
      {children}
    </div>
  );
}

function SceneLabel({ item }: { item: MediaQueueItem }) {
  return (
    <p className="relative min-w-0 truncate text-sm" title={`${item.lessonTitle} › ${item.sceneTitle}`}>
      <span className="text-fg-muted">{item.lessonTitle}</span>
      <span className="text-fg-faint" aria-hidden="true"> › </span>
      <span className="sr-only">, cena </span>
      <span className="font-medium text-fg">{item.sceneTitle}</span>
    </p>
  );
}

/** Trilha das 5 etapas de produção, com a atual destacada. Não é porcentagem. */
export function StageTrack({ phase }: { phase: QueuePhase }) {
  const current = (ACTIVE_PHASES as readonly QueuePhase[]).indexOf(phase);
  return (
    <ol aria-label={`Etapa atual: ${PHASE_LABEL[phase]}`} className="grid grid-cols-5 gap-1.5">
      {ACTIVE_PHASES.map((p, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next';
        return (
          <li key={p} className="min-w-0 space-y-1" title={PHASE_LABEL[p]} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={cn('relative block h-1.5 rounded-full', state === 'done' ? 'bg-accent-fill shadow-[inset_0_0_0_1px_var(--t-progress-ring)]' : state === 'current' ? 'bg-accent-soft' : 'bg-surface-2')} aria-hidden="true">
              {state === 'current' && <span className="pulse-dot absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-accent" />}
            </span>
            <span className={cn('hidden truncate text-[11px] leading-tight sm:block', state === 'current' ? 'font-medium text-fg' : 'text-fg-faint')}>{PHASE_LABEL[p]}</span>
            <span className="sr-only">{state === 'done' ? ': concluída' : state === 'current' ? ': em andamento' : ': a seguir'}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveRow({ item, now, avgSeconds }: { item: MediaQueueItem; now: number; avgSeconds: number | null }) {
  const eta = item.etaSeconds !== null ? `pronto em ${formatDuration(item.etaSeconds)}` : avgSeconds === null ? NO_HISTORY : null;
  return (
    <li className="space-y-3 rounded-2xl border border-line bg-bg-2 p-4" data-testid={`queue-item-${item.jobId}`} data-phase={item.phase}>
      <SceneLabel item={item} />
      <StageTrack phase={item.phase} />
      <p className="flex flex-wrap gap-x-2 text-xs text-fg-muted">
        <span className="font-medium text-fg">{PHASE_LABEL[item.phase]}</span>
        {item.startedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span>começou {formatElapsed(item.startedAt, now)}</span>
          </>
        )}
        {eta && (
          <>
            <span aria-hidden="true">·</span>
            <span>{eta}</span>
          </>
        )}
      </p>
    </li>
  );
}

function WaitingRow({ item, avgSeconds, queue }: { item: MediaQueueItem; avgSeconds: number | null; queue: MediaQueueValue }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const startsIn = item.etaSeconds !== null && avgSeconds !== null ? `começa em ${formatDuration(Math.max(0, item.etaSeconds - avgSeconds))}` : avgSeconds === null ? NO_HISTORY : null;
  const cancel = async () => {
    setBusy(true);
    setErr(null);
    try {
      await queue.cancelOne(item.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível cancelar.');
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-bg-2 px-4 py-2" data-testid={`queue-item-${item.jobId}`} data-phase={item.phase}>
      <Badge tone="neutral" className="shrink-0 tabular-nums">
        <span className="sr-only">Posição na fila: </span>#{item.position ?? '?'}
      </Badge>
      <div className="min-w-0 flex-1">
        <SceneLabel item={item} />
        {startsIn && <p className="text-xs text-fg-muted">{startsIn}</p>}
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void cancel()} disabled={busy} aria-label={`Cancelar o vídeo da cena ${item.sceneTitle}`}>
        {busy ? 'Cancelando…' : 'Cancelar'}
      </Button>
    </li>
  );
}

/**
 * Miniatura de vídeo pronto. Começa com um pôster leve (foto do apresentador) e
 * só monta o `<video preload="metadata">` quando a linha entra na tela ou recebe
 * hover/foco, para não baixar os metadados de dezenas de vídeos de uma vez.
 */
function useMountWhenVisible<T extends Element>() {
  const ref = React.useRef<T>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return { ref, visible, reveal: () => setVisible(true) };
}

function DoneRow({ item, courseId, now }: { item: MediaQueueItem; courseId: string; now: number }) {
  const { document: doc } = useDraft();
  const poster = doc.presentation.avatarPreviewUrl;
  const { ref, visible, reveal } = useMountWhenVisible<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-bg-2 p-2.5"
      data-testid={`queue-item-${item.jobId}`}
      data-phase={item.phase}
      onMouseEnter={reveal}
      onFocus={reveal}
    >
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        {item.outputUrl && visible ? (
          <video src={item.outputUrl} poster={poster} preload="metadata" muted playsInline className="h-full w-full object-cover" aria-label={`Vídeo da cena ${item.sceneTitle}`} />
        ) : item.outputUrl && poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-fg-faint" aria-hidden="true">
            <Film className="h-5 w-5" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <SceneLabel item={item} />
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <Check className="h-3 w-3" aria-hidden="true" /> {item.simulated ? 'Pronto (simulado)' : PHASE_LABEL.done}
          </span>
          {item.finishedAt && <span>{formatElapsed(item.finishedAt, now)}</span>}
        </p>
        <Link
          href={`/estudio/cursos/${courseId}/aulas/${item.lessonId}?node=${encodeURIComponent(item.nodeId)}`}
          aria-label={`Ver a cena “${item.sceneTitle}” no editor`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline"
        >
          Ver na cena
        </Link>
      </div>
    </li>
  );
}

function FailedRow({ item, courseId, queue }: { item: MediaQueueItem; courseId: string; queue: MediaQueueValue }) {
  const { document: doc } = useDraft();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const node = findLesson(doc, item.lessonId)?.lesson.graph.nodes.find((n) => n.id === item.nodeId);
  const script = node ? nodeScriptText(node).trim() : '';
  const blocker = !node ? 'Esta cena não existe mais no rascunho.' : !script ? 'A cena está sem texto para narrar.' : presentationBlocker(doc.presentation);
  const canRetry = item.status !== 'reconciliation_required';

  const retry = async () => {
    setBusy(true);
    setErr(null);
    try {
      // sem `script`: o servidor usa a fala da apresentadora (narration) e, na falta dela, o texto da cena salvo
      await requestSceneVideo({ courseId, lessonId: item.lessonId, nodeId: item.nodeId, narration: node && 'narration' in node && typeof node.narration === 'string' ? node.narration : undefined, presentation: doc.presentation });
      setConfirming(false);
      await queue.refresh();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 409 ? 'Já existe um pedido em andamento para esta cena.' : e instanceof Error ? e.message : 'Não foi possível pedir de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-2xl border border-danger/30 bg-danger-soft/40 p-4" data-testid={`queue-item-${item.jobId}`} data-phase={item.phase}>
      <SceneLabel item={item} />
      <p className="flex items-start gap-2 text-sm text-danger" title={item.error ?? undefined}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{humanizeJobError(item)}</span>
      </p>
      {canRetry &&
        (!confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="paid" size="sm" onClick={() => setConfirming(true)} disabled={!!blocker} title={blocker ?? undefined}>
              Tentar de novo
            </Button>
            {blocker && <span className="text-xs text-fg-muted">{blocker}</span>}
            <Link href={`/estudio/cursos/${courseId}/aulas/${item.lessonId}?node=${encodeURIComponent(item.nodeId)}`} aria-label={`Abrir a cena “${item.sceneTitle}” no editor`} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent-strong hover:underline">
              Abrir a cena
            </Link>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-paid/40 bg-paid-soft p-3">
            <p className="text-sm text-fg">Pedir este vídeo de novo? É uma <strong className="text-paid">ação paga</strong> no HeyGen, e o pedido entra no fim da fila.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="paid" size="sm" onClick={() => void retry()} disabled={busy}>
                {busy ? 'Enviando…' : 'Gerar de novo'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                Voltar
              </Button>
            </div>
          </div>
        ))}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </li>
  );
}

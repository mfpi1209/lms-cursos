'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert, CircleDashed, Clapperboard } from 'lucide-react';
import { allLessons, callStatuses, reactionStatuses, type CourseCompileResult } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { useDraft } from '@/components/studio/draft-provider';
import { errorMessage, useApplyProposals } from './agent-api';
import { lessonStats } from './wizard-state';
import { ProductionPanel } from '../media-queue/production-panel';
import { useMediaQueue } from '../media-queue/use-media-queue';
import { formatDuration } from '../media-queue/queue-model';
import { courseVideoStats, videoStatsLine } from '../video-stats';
import { PublishConfirm, type MediaCounts } from '../publish-confirm';

type Validation = CourseCompileResult & { revision?: number; media?: MediaCounts };
const NO_MEDIA: MediaCounts = { stale: 0, simulated: 0, missing: 0, inProgress: 0 };
const DESTINATION_CODES = new Set(['OPTION_WITHOUT_DESTINATION', 'NO_EXIT', 'DEAD_END_PATH', 'NO_END_REACHABLE', 'NO_END_NODE', 'EDGE_TO_MISSING']);

export function StepRevisao({ canPublish }: { canPublish: boolean }) {
  const router = useRouter();
  const { courseId, document: doc, status } = useDraft();
  const { withRevision } = useApplyProposals();
  const [validation, setValidation] = React.useState<Validation | null>(null);
  const [valError, setValError] = React.useState<string | null>(null);
  const [published, setPublished] = React.useState<{ versionNumber: number } | null>(null);
  const [pubError, setPubError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'publish' | null>(null);
  /** confirmação em linha (lista o estado da mídia antes de criar a versão) */
  const [confirming, setConfirming] = React.useState(false);
  const queue = useMediaQueue(courseId);
  const videos = React.useMemo(() => courseVideoStats(doc, queue.data?.items), [doc, queue.data?.items]);

  const lessons = doc.modules.flatMap((m) => m.lessons);
  const allHaveScenes = lessons.length > 0 && lessons.every((l) => !lessonStats(l).empty);

  const validate = React.useCallback(async () => {
    setValError(null);
    try {
      setValidation(await api<Validation>(`/api/courses/${courseId}/validate`, { method: 'POST' }));
    } catch (e) {
      setValError(errorMessage(e, 'Não foi possível validar o curso'));
    }
  }, [courseId]);

  // Revalida quando o rascunho estabiliza (após gravar).
  React.useEffect(() => {
    if (status === 'saved') void validate();
  }, [status, validate]);

  const errors = validation?.errors ?? [];
  const warnings = validation?.warnings ?? [];
  const destinationsOk = validation ? !errors.some((e) => DESTINATION_CODES.has(e.code)) : null;
  const objectivesOk = validation ? doc.objectives.length > 0 && !warnings.some((w) => w.code === 'OBJECTIVE_UNCOVERED') : null;
  const otherErrors = errors.filter((e) => !DESTINATION_CODES.has(e.code));

  const publish = async (opts: { allowSimulatedMedia: boolean }) => {
    setBusy('publish');
    setPubError(null);
    try {
      // `expectedRevision` é obrigatório: publica exatamente a revisão validada (ou 409/422 e o autor revalida)
      const r = await withRevision((expectedRevision) => api<{ versionId: string; versionNumber: number; warnings: unknown[] }>(`/api/courses/${courseId}/publish`, { json: { expectedRevision, allowSimulatedMedia: opts.allowSimulatedMedia } }));
      setConfirming(false);
      setPublished({ versionNumber: r.versionNumber });
      // o servidor grava `wizard.finished` e os passos concluídos ao publicar; `withRevision` já recarregou o rascunho
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PUBLISH_BLOCKED' && e.details) {
        setValidation((v) => ({ ...(e.details as Validation), revision: v?.revision }));
        setPubError(e.message);
      } else if (e instanceof ApiError && e.code === 'CONFLICT') {
        setPubError(`${e.message} A lista foi conferida de novo.`);
        setConfirming(false);
        void validate();
      } else {
        setPubError(errorMessage(e, 'Não foi possível publicar'));
      }
    } finally {
      setBusy(null);
    }
  };

  if (published) {
    return (
      <div className="space-y-8 py-4 text-center" role="status" data-testid="publish-success">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-fill text-accent-fill-fg shadow-glow">
          <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-3xl font-bold">Curso publicado</h2>
          <p className="mx-auto max-w-md text-fg-muted">Versão {published.versionNumber} no ar. Quem se matricular agora recebe esta versão; você pode continuar editando o rascunho à vontade.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/aprender" className={cn(buttonVariants())}>Ver como aluno</Link>
          <Link href={`/estudio/cursos/${courseId}/matriculas`} className={cn(buttonVariants({ variant: 'secondary' }))}>Matricular alunos</Link>
          <Link href={`/estudio/cursos/${courseId}`} className={cn(buttonVariants({ variant: 'ghost' }))}>Ir para o painel do curso</Link>
        </div>
      </div>
    );
  }

  const checklistDone = [allHaveScenes, destinationsOk, objectivesOk, validation ? otherErrors.length === 0 : null].filter((x) => x === true).length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="checklist-title" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="checklist-title" className="font-display text-xl font-bold">Lista final</h2>
            <p className="text-sm text-fg-muted">{validation ? `${checklistDone} de 4 itens obrigatórios prontos.` : 'Conferindo o curso…'}</p>
          </div>
          <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline" onClick={() => void validate()}>Conferir de novo</button>
        </div>
        {valError && <p role="alert" className="text-sm text-danger">{valError}</p>}
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2" data-testid="review-checklist">
          <CheckRow ok={allHaveScenes} label="Todas as aulas têm cenas" detail={allHaveScenes ? undefined : `${lessons.filter((l) => lessonStats(l).empty).length} aula(s) ainda sem cenas. Gere no passo "Aulas" ou escreva no storyboard.`} />
          <VideoCheckRow courseId={courseId} />
          <CheckRow ok={destinationsOk} label="Nenhuma decisão sem destino" detail={destinationsOk === false ? 'Há opções ou cenas que não levam a lugar nenhum. Veja a lista abaixo.' : undefined} />
          <CheckRow ok={objectivesOk} label="Objetivos cobertos" detail={objectivesOk === false ? (doc.objectives.length === 0 ? 'O curso não tem objetivos. Volte ao passo "Estrutura".' : 'Há objetivos obrigatórios que nenhuma cena trabalha.') : undefined} />
          <CheckRow ok={validation ? otherErrors.length === 0 : null} label="Sem outros problemas que bloqueiem a publicação" detail={otherErrors.length ? `${otherErrors.length} problema(s) listados abaixo.` : undefined} />
        </ul>
        {errors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-danger">Precisa resolver antes de publicar</p>
            <ul className="space-y-1 text-sm">
              {errors.map((i, idx) => (
                <li key={idx} className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger">
                  {i.lessonId ? <Link href={`/estudio/cursos/${courseId}/aulas/${i.lessonId}${i.nodeId ? `?node=${encodeURIComponent(i.nodeId)}` : ''}`} className="hover:underline">{i.message}</Link> : i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <details className="rounded-xl border border-line bg-bg-2 px-4 py-1">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-fg">{warnings.length} {warnings.length === 1 ? 'sugestão' : 'sugestões'} (não bloqueiam)</summary>
            <ul className="mb-3 mt-1 space-y-1 text-sm text-fg-muted">
              {warnings.map((i, idx) => (
                <li key={idx} className="rounded-lg bg-surface-2 px-3 py-2">
                  {i.lessonId ? <Link href={`/estudio/cursos/${courseId}/aulas/${i.lessonId}${i.nodeId ? `?node=${encodeURIComponent(i.nodeId)}` : ''}`} className="hover:underline">{i.message}</Link> : i.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* os vídeos ficam no passo anterior (Produção de vídeo); aqui só a lista final e a publicação */}

      <section aria-labelledby="publish-title" className="panel panel-accent space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="publish-title" className="font-display text-xl font-semibold">Publicar</h2>
          <p className="mt-1 text-sm text-fg-muted">Publicar cria uma versão fixa do curso. Quem se matricular depois recebe esta versão; você continua editando o rascunho à vontade.</p>
        </div>
        {pubError && !confirming && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{pubError}</p>}
        {!canPublish && <p className="text-sm text-paid">Seu papel não permite publicar. Peça a alguém com permissão de publicação.</p>}
        {confirming && validation?.revision ? (
          <PublishConfirm
            revision={validation.revision}
            media={validation.media ?? NO_MEDIA}
            videos={videos}
            warningsCount={warnings.length}
            busy={busy === 'publish'}
            error={pubError}
            onConfirm={(o) => void publish(o)}
            onCancel={() => { setConfirming(false); setPubError(null); }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => { setPubError(null); setConfirming(true); }} disabled={!canPublish || busy !== null || !validation || !validation.ok || !validation.revision} data-testid="review-publish">
              {doc.wizard.finished ? 'Publicar nova versão' : 'Publicar curso'}
            </Button>
            {validation && !validation.ok && <p className="text-sm text-fg-muted">Resolva os itens da lista acima para liberar a publicação.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function CheckRow({ ok, label, detail, soft = false }: { ok: boolean | null; label: string; detail?: string; soft?: boolean }) {
  const Icon = ok === null ? CircleDashed : ok ? Check : CircleAlert;
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', ok === null ? 'bg-surface-2 text-fg-faint' : ok ? 'bg-success-soft text-success' : soft ? 'bg-paid-soft text-paid' : 'bg-danger-soft text-danger')}>
        <Icon className="h-4 w-4" strokeWidth={ok ? 3 : 2} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-sm">
        <span className="block font-medium text-fg">
          {label}
          <span className="sr-only">: {ok === null ? 'conferindo' : ok ? 'ok' : soft ? 'atenção' : 'pendente'}</span>
        </span>
        {detail && <span className="block text-fg-muted">{detail}</span>}
      </span>
    </li>
  );
}

/** Linha informativa: quantas cenas têm vídeo pronto (não bloqueia; vídeo simulado é avisado). */
function VideoCheckRow({ courseId }: { courseId: string }) {
  const { document: doc } = useDraft();
  const queue = useMediaQueue(courseId);
  const stats = React.useMemo(() => courseVideoStats(doc, queue.data?.items), [doc, queue.data?.items]);
  if (stats.total === 0) return <CheckRow ok label="Vídeos" detail="Nenhuma cena com texto para narrar." />;
  const complete = stats.ready === stats.total;
  const simulatedNote = stats.simulated > 0 ? (queue.data?.simulation ? ` ${stats.simulated} ${stats.simulated === 1 ? 'vídeo é simulado' : 'vídeos são simulados'} (modo de demonstração).` : ` ${stats.simulated} ${stats.simulated === 1 ? 'vídeo simulado precisa' : 'vídeos simulados precisam'} ser gerado de verdade antes de publicar (ou aceite na confirmação).`) : '';
  return (
    <CheckRow
      soft
      ok={complete ? true : stats.generating > 0 ? null : false}
      label={`Vídeos: ${stats.ready} de ${stats.total} ${stats.total === 1 ? 'cena com vídeo pronto' : 'cenas com vídeo pronto'}`}
      detail={complete ? (simulatedNote.trim() || undefined) : `${videoStatsLine(stats, { lead: false })}. Dá para publicar assim; as cenas sem vídeo mostram só o texto. Volte a "Produção de vídeo" para completar.${simulatedNote}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Vídeos                                                              */
/* ------------------------------------------------------------------ */

/** Resposta de POST /media-jobs/quote (orçamento calculado no servidor). */
interface QuoteItem { lessonId: string; nodeId: string; title: string; lessonTitle?: string; chars: number; seconds: number; reused: boolean; open: boolean; estimatedUsd: number; cinematicShots: number; recompose?: boolean; partialReuse?: { fromJobId: string; reusedShots: number; newShots: number } }
interface QuoteTotals { scenes: number; reused: number; recompose?: number; open: number; toProduce: number; chars: number; seconds: number; estimatedUsd: number }
interface BudgetInfo { limitUsd: number | null; spentUsd: number; addUsd: number; remainingUsd: number | null; exceeded: boolean }
interface QuoteResponse {
  quoteId: string;
  draftRevision: number;
  simulated: boolean;
  mode: 'demo' | 'real';
  items: QuoteItem[];
  totals: QuoteTotals;
  expiresAt: string;
  errors: Array<{ lessonId: string; nodeId: string; title: string; message: string }>;
  budget: BudgetInfo | null;
}
interface BatchResponse {
  created: Array<{ id: string }>;
  reused: Array<{ lessonId: string; nodeId: string; jobId: string; error?: string }>;
  skippedOpen: Array<{ lessonId: string; nodeId: string; jobId: string }>;
}

const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Vídeos das cenas: orçamento calculado no servidor ("Calcular orçamento"),
 * lista com totais e cenas reaproveitadas, e aprovação explícita ("Aprovar e
 * produzir") que cria o lote de uma vez. Renderizado no passo "Produção de vídeo" (step-producao.tsx).
 */
export function VideosBlock({ courseId }: { courseId: string }) {
  const { document: doc, status: draftStatus } = useDraft();
  const p = doc.presentation;
  const ready = !!p.avatarId;
  const queue = useMediaQueue(courseId);
  const q = queue.data;
  // a mesma contagem do painel do curso, do storyboard, da produção e da revisão
  const stats = React.useMemo(() => courseVideoStats(doc, q?.items), [doc, q?.items]);

  const [quote, setQuote] = React.useState<QuoteResponse | null>(null);
  const [busy, setBusy] = React.useState<'quote' | 'approve' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<{ created: number; reused: number; skipped: number; errors: string[] } | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const inProduction = !!q && q.summary.active + q.summary.waiting > 0;
  const pending = stats.missing + stats.stale;
  // vídeos que ganharam a chamada para a pergunta e ainda tocam a fala antiga (ponte vídeo → pergunta)
  const callHosts = React.useMemo(() => {
    const ids = new Set<string>();
    for (const l of allLessons(doc)) for (const st of callStatuses(l.graph)) if (st.hostId && st.needsRecording) ids.add(st.hostId);
    return [...ids];
  }, [doc]);
  // reações da instrutora a cada resposta com texto e sem vídeo atualizado
  const reactionTargets = React.useMemo(() => allLessons(doc).flatMap((l) => reactionStatuses(l.graph).filter((r) => r.text && (!r.hasVideo || r.stale)).map((r) => r.targetId)), [doc]);

  // o orçamento vence sozinho: relógio local só para mostrar o estado
  React.useEffect(() => {
    if (!quote) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [quote]);
  const expired = !!quote && Date.parse(quote.expiresAt) <= now;

  const calculate = async (nodeIds?: string[]) => {
    setBusy('quote');
    setError(null);
    setSent(null);
    try {
      setQuote(await api<QuoteResponse>(`/api/courses/${courseId}/media-jobs/quote`, { json: { includeStale: true, ...(nodeIds?.length ? { nodeIds } : {}) } }));
      setNow(Date.now());
    } catch (e) {
      setQuote(null);
      setError(errorMessage(e, 'Não foi possível calcular o orçamento'));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!quote) return;
    setBusy('approve');
    setError(null);
    try {
      const r = await api<BatchResponse>(`/api/courses/${courseId}/media-jobs/batch`, { json: { quoteId: quote.quoteId, confirmPaid: true } });
      setSent({ created: r.created.length, reused: r.reused.filter((x) => !x.error).length, skipped: r.skippedOpen.length, errors: r.reused.filter((x) => x.error).map((x) => `${x.nodeId}: ${x.error}`) });
      setQuote(null);
      await queue.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) setError(`${e.message}`);
      else if (e instanceof ApiError && e.status === 409) {
        setQuote(null);
        setError(`${e.message} Clique em "Calcular orçamento" para cotar de novo.`);
      } else setError(errorMessage(e, 'Não foi possível aprovar o lote'));
    } finally {
      setBusy(null);
    }
  };

  const toProduce = quote?.items.filter((it) => !it.reused && !it.open) ?? [];
  const reused = quote?.items.filter((it) => it.reused) ?? [];
  const openItems = quote?.items.filter((it) => it.open && !it.reused) ?? [];
  const canApprove = !!quote && !expired && busy === null && draftStatus !== 'saving' && (toProduce.length > 0 || reused.length > 0) && !(quote.budget?.exceeded);

  return (
    <section aria-labelledby="videos-title" className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-paid-soft text-paid"><Clapperboard className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 id="videos-title" className="font-display text-xl font-bold">Vídeos das cenas</h2>
          <p className="text-sm text-fg-muted">Gerar vídeo é uma ação paga no provedor. O servidor calcula o orçamento antes; nada é produzido sem a sua aprovação.</p>
        </div>
      </div>
      <div className="rounded-xl border border-paid/40 bg-bg-2 p-5">
        <p className="text-sm text-fg-muted" data-testid="review-video-stats">
          <span className="font-display text-2xl font-bold text-fg tabular-nums">{stats.ready}</span>
          <span className="font-medium text-fg"> de {stats.total}</span> {stats.total === 1 ? 'cena com vídeo pronto' : 'cenas com vídeo pronto'}
          {stats.stale > 0 || stats.missing > 0 || stats.generating > 0 ? ` · ${videoStatsLine(stats, { lead: false })}.` : stats.total > 0 ? '. Tudo pronto.' : '. Nenhuma cena com texto para narrar ainda.'}
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!quote && (pending > 0 || busy === 'quote') && (
          <div className="mt-4 space-y-2">
            <Button variant="paid" onClick={() => void calculate()} disabled={!ready || busy !== null} data-testid="review-generate-videos">
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
              {busy === 'quote' ? 'Calculando orçamento…' : `Calcular orçamento (${pending} ${pending === 1 ? 'cena' : 'cenas'})`}
            </Button>
            {reactionTargets.length > 0 && reactionTargets.length < pending && (
              <Button variant="secondary" onClick={() => void calculate(reactionTargets)} disabled={!ready || busy !== null} data-testid="review-quote-reactions">
                Só as reações ({reactionTargets.length} {reactionTargets.length === 1 ? 'vídeo' : 'vídeos'})
              </Button>
            )}
            {callHosts.length > 0 && callHosts.length < pending && (
              <Button variant="secondary" onClick={() => void calculate(callHosts)} disabled={!ready || busy !== null} data-testid="review-quote-calls">
                Só as chamadas para as perguntas ({callHosts.length} {callHosts.length === 1 ? 'vídeo' : 'vídeos'})
              </Button>
            )}
            {!ready && <p className="text-xs text-paid">Escolha um apresentador no passo "Apresentação" antes de gerar.</p>}
          </div>
        )}
        {busy === 'quote' && <span className="sr-only" role="status" aria-live="polite">Calculando orçamento</span>}
        {quote && (
          <div className="mt-4 space-y-4 rounded-xl border border-paid/50 bg-paid-soft p-4 text-sm text-fg" role="region" aria-labelledby="quote-title" data-testid="review-quote">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p id="quote-title" className="font-display text-base font-semibold text-paid">{quote.simulated ? 'Orçamento (modo de demonstração: nada será cobrado)' : 'Orçamento — esta ação é paga'}</p>
              <p className="text-xs text-fg-muted">{expired ? 'Orçamento vencido' : `Válido até ${new Date(quote.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`} · revisão {quote.draftRevision}</p>
            </div>
            <p className="font-medium text-fg" data-testid="review-generate-expectation">
              {toProduce.length} {toProduce.length === 1 ? 'cena a produzir' : 'cenas a produzir'} · {quote.totals.chars.toLocaleString('pt-BR')} caracteres · {formatDuration(quote.totals.seconds)} de narração · estimativa {usd(quote.totals.estimatedUsd)}
              {reused.length > 0 && ` · ${reused.length} ${reused.length === 1 ? 'cena reaproveitada' : 'cenas reaproveitadas'} (US$ 0,00)`}
              {(quote.totals.recompose ?? 0) > 0 && ` · ${quote.totals.recompose} com troca de fundo sem custo (só montagem local)`}
              {openItems.length > 0 && ` · ${openItems.length} já na fila`}
            </p>
            {quote.budget && (
              <p className={cn('text-xs', quote.budget.exceeded ? 'font-medium text-danger' : 'text-fg-muted')} data-testid="review-quote-budget">
                {quote.budget.limitUsd === null
                  ? `Sem teto diário configurado · ${usd(quote.budget.spentUsd)} comprometidos nas últimas 24 h.`
                  : `Teto diário de ${usd(quote.budget.limitUsd)} · ${usd(quote.budget.spentUsd)} já comprometidos nas últimas 24 h${quote.budget.exceeded ? ' · este lote ultrapassaria o teto; reduza as cenas ou ajuste o limite.' : ` · restam ${usd(quote.budget.remainingUsd ?? 0)}.`}`}
              </p>
            )}
            {quote.items.length > 0 && (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-bg-2" data-testid="review-quote-items">
                {quote.items.map((it) => (
                  <li key={`${it.lessonId}:${it.nodeId}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-fg">{it.title}</span>
                      {it.lessonTitle && <span className="text-fg-muted"> · {it.lessonTitle}</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                      {it.reused ? <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success" data-testid={it.recompose ? 'quote-item-recompose' : undefined}>{it.recompose ? 'Trocar fundo (sem custo)' : 'reaproveitado'}</span>
                        : it.open ? <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">já na fila</span>
                        : <>{it.partialReuse ? <span className="mr-1.5 rounded-full bg-success-soft px-2 py-0.5 font-medium text-success" data-testid="quote-item-partial">só o trecho novo</span> : null}{it.chars.toLocaleString('pt-BR')} car. · {formatDuration(it.seconds)} · {usd(it.estimatedUsd)}{it.cinematicShots > 0 ? ` · ${it.cinematicShots} em movimento` : ''}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {quote.errors.length > 0 && (
              <details className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-1 text-danger">
                <summary className="min-h-9 cursor-pointer py-2 font-medium">{quote.errors.length} {quote.errors.length === 1 ? 'cena não pode ser produzida' : 'cenas não podem ser produzidas'} (ficam de fora)</summary>
                <ul className="mb-2 space-y-1 text-xs">
                  {quote.errors.map((e) => <li key={`${e.lessonId}:${e.nodeId}`}>{e.title}: {e.message}</li>)}
                </ul>
              </details>
            )}
            <ul className="list-disc space-y-1 pl-5 text-fg-muted">
              <li>Valores estimados pela tabela de preços configurada; a fatura do HeyGen{p.voiceProvider === 'elevenlabs' ? ' e do ElevenLabs' : ''} é a referência.</li>
              <li>Os vídeos entram numa fila e ficam prontos aos poucos; você pode sair desta tela. Os que ainda estão na fila podem ser cancelados; os já enviados ao HeyGen, não.</li>
              <li>Se o rascunho mudar antes da aprovação, o orçamento é recusado e precisa ser recalculado.</li>
              {quote.simulated && <li>Modo de demonstração: os jobs serão simulados e nenhum vídeo real será produzido.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              {expired
                ? <Button variant="paid" onClick={() => void calculate(quote.items.length < pending ? quote.items.map((it) => it.nodeId) : undefined)} disabled={busy !== null}>Calcular de novo</Button>
                : <Button variant="paid" className="bg-paid font-semibold text-accent-fg hover:bg-paid hover:brightness-110" onClick={() => void approve()} disabled={!canApprove} data-testid="review-generate-confirm">{busy === 'approve' ? 'Enviando lote…' : 'Aprovar e produzir'}</Button>}
              <Button variant="ghost" onClick={() => { setQuote(null); setError(null); }} disabled={busy === 'approve'}>Cancelar</Button>
            </div>
          </div>
        )}
        {sent && (
          <p role="status" className="mt-4 text-sm text-fg-muted" data-testid="review-generate-sent">
            {sent.created} {sent.created === 1 ? 'pedido enviado' : 'pedidos enviados'} para a fila
            {sent.reused > 0 && `; ${sent.reused} ${sent.reused === 1 ? 'cena reaproveitou' : 'cenas reaproveitaram'} vídeo já pago`}
            {sent.skipped > 0 && `; ${sent.skipped} já ${sent.skipped === 1 ? 'estava' : 'estavam'} na fila`}.
            {sent.errors.length > 0 && <span className="text-danger"> {sent.errors.length} {sent.errors.length === 1 ? 'reaproveitamento falhou' : 'reaproveitamentos falharam'}: {sent.errors.join('; ')}.</span>}
          </p>
        )}
      </div>
      {(sent || inProduction) && <ProductionPanel courseId={courseId} headingLevel="h3" />}
    </section>
  );
}

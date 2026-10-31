'use client';

import * as React from 'react';
import { AlertCircle, Sparkles, X } from 'lucide-react';
import { findLesson } from '@lms/course-schema';
import { CAPPED_REVISION_FOCUS, REVISION_FOCUS, REVISION_FOCUS_LABELS, type RevisionFocus } from '@lms/ai/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useDraft } from '@/components/studio/draft-provider';
import { cn } from '@/lib/utils';
import { ProposalIssues, ProposalScenes, SceneBeforeAfter, graphSummaryLine, sceneTextDiffs } from './proposal-preview';
import { QUEUED_STALL_SECONDS, hasErrorsRefusal, isConflict, type AgentProposal, type AgentRun } from './use-agent-runs';
import { errorText } from './use-media-jobs';

/* ------------------------------------------------------------------ */
/* Menu "Revisar com IA"                                               */
/* ------------------------------------------------------------------ */

export function AiReviseMenu({ disabled, onRun }: { disabled: boolean; onRun: (body: { focus?: RevisionFocus; instruction?: string }) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [free, setFree] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (body: { focus?: RevisionFocus; instruction?: string }) => {
    setOpen(false);
    setFree(false);
    setInstruction('');
    await onRun(body);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ai" size="sm" aria-haspopup="menu" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen((v) => !v)} data-testid="ai-revise-menu">
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Revisar com IA
      </Button>
      {open && (
        <div id={id} role="menu" aria-label="Como revisar esta aula" className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-line-strong bg-surface p-1.5 shadow-2xl">
          <p className="px-3 pb-1 pt-2 text-xs text-fg-muted">A IA propõe uma nova versão da aula. Você revisa antes de aplicar.</p>
          {!free ? (
            <>
              {REVISION_FOCUS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-fg hover:bg-ai-soft hover:text-ai"
                  onClick={() => void run({ focus: f })}
                  data-testid={`ai-revise-focus-${f}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-ai" aria-hidden="true" />
                  <span className="flex-1">{REVISION_FOCUS_LABELS[f]}</span>
                  {CAPPED_REVISION_FOCUS.includes(f) && <span className="text-xs text-fg-muted">até 7 cenas</span>}
                </button>
              ))}
              <button type="button" role="menuitem" className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border-t border-line px-3 text-left text-sm text-fg hover:bg-ai-soft hover:text-ai" onClick={() => setFree(true)}>
                <span className="h-1.5 w-1.5 rounded-full bg-ai" aria-hidden="true" />
                Instrução livre…
              </button>
            </>
          ) : (
            <form
              className="space-y-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (instruction.trim()) void run({ instruction: instruction.trim() });
              }}
            >
              <label htmlFor={`${id}-free`} className="block text-sm font-medium text-fg">
                O que a IA deve mudar nesta aula?
              </label>
              <Textarea id={`${id}-free`} rows={4} maxLength={2000} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: torne a situação mais próxima de quem atende ao público…" autoFocus />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setFree(false)}>Voltar</Button>
                <Button type="submit" variant="ai" size="sm" disabled={!instruction.trim()} data-testid="ai-revise-run">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Pedir revisão
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de processamento                                              */
/* ------------------------------------------------------------------ */

function useElapsedSeconds(since: string) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`);

/**
 * Barra de execução da IA. Só o rótulo fica na região ao vivo (anunciado uma
 * vez); o tempo decorrido muda a cada segundo e fica fora dela. Sem jargão de
 * provedor/modelo. Focável (tabIndex -1) para receber o foco quando o botão
 * que disparou a execução fica desabilitado. Traz "Cancelar" e, na fila há
 * mais de 2 min, o aviso de worker sem resposta.
 */
export function AiRunBar({ run, label, testId = 'ai-run-bar', onCancel, busy = false }: { run: AgentRun; /** rótulo próprio (padrão: deduzido da tarefa) */ label?: string; testId?: string; onCancel?: (runId: string) => Promise<void> | void; busy?: boolean }) {
  const seconds = useElapsedSeconds(run.createdAt);
  const stalled = run.status === 'queued' && seconds >= QUEUED_STALL_SECONDS;
  const what = label ?? (run.task === 'lesson' ? 'Escrevendo as cenas da aula' : run.task === 'scene_variations' ? 'Criando variações de uma cena' : run.task === 'scene_direction' ? 'Dirigindo as cenas' : /evaluat|quality/i.test(run.task) ? 'Avaliando a aula' : 'Revisando a aula');
  return (
    <div
      id={`ai-run-${run.id}`}
      tabIndex={-1}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border px-4 py-2 text-sm', stalled ? 'border-paid/40 bg-paid-soft text-paid' : 'border-ai/30 bg-ai-soft text-ai')}
      data-testid={testId}
      data-status={run.status}
      data-stalled={stalled ? 'true' : undefined}
    >
      <span className={cn('pulse-dot h-2 w-2 shrink-0 rounded-full', stalled ? 'bg-paid' : 'bg-ai')} aria-hidden="true" />
      <span role="status" aria-live="polite" className="font-medium">{stalled ? `O worker não responde: na fila há ${fmt(seconds)}` : `${what}${run.status === 'queued' ? ' (na fila)' : ''}…`}</span>
      {!stalled && <span className="text-xs tabular-nums opacity-80" aria-hidden="true">{fmt(seconds)}</span>}
      {onCancel && (
        <button type="button" className="ml-auto min-h-6 rounded text-xs font-medium underline disabled:opacity-50" onClick={() => void onCancel(run.id)} disabled={busy} data-testid={`${testId}-cancel`}>
          Cancelar
        </button>
      )}
    </div>
  );
}

export function AiFailedBar({ run, onDismiss }: { run: AgentRun; onDismiss: () => void }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">A IA não conseguiu concluir{run.task === 'lesson' ? ' a geração da aula' : run.task === 'scene_variations' ? ' as variações' : run.task === 'scene_direction' ? ' a direção' : ' a revisão'}: {run.error ?? 'erro desconhecido'}.</span>
      <button type="button" className="min-h-6 rounded text-xs underline" onClick={onDismiss} aria-label="Fechar aviso">Fechar</button>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Painel de revisão (proposta revise_lesson)                          */
/* ------------------------------------------------------------------ */

export function AiProposalPanel({
  proposal,
  busy,
  onApply,
  onReject,
}: {
  proposal: Extract<AgentProposal, { kind: 'revise_lesson' | 'lesson' }>;
  busy: boolean;
  onApply: (opts: { force?: boolean; acceptErrors?: boolean }) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const { status: draftStatus, reload, document: doc } = useDraft();
  const [conflict, setConflict] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** o autor aceitou aplicar mesmo com erros de estrutura */
  const [acceptErrors, setAcceptErrors] = React.useState(false);
  const [tab, setTab] = React.useState<'diff' | 'scenes'>('diff');
  const s = proposal.summary;
  const generated = proposal.kind === 'lesson';
  const focusLabel = generated ? 'Aula gerada' : s.focus ? REVISION_FOCUS_LABELS[s.focus] : 'Instrução livre';
  const saving = draftStatus === 'saving' || draftStatus === 'dirty';
  const hasErrors = !!proposal.payload.hasErrors;
  const errors = proposal.payload.issues?.errors ?? [];
  const warnings = proposal.payload.issues?.warnings ?? [];
  const scoped = proposal.payload.nodeIds ?? [];

  // antes/depois por cena: o grafo ATUAL da aula contra o proposto (texto, não só contagens)
  const current = findLesson(doc, proposal.payload.lessonId)?.lesson.graph;
  const diffs = React.useMemo(() => (current ? sceneTextDiffs(current, proposal.payload.graph) : []), [current, proposal.payload.graph]);
  const changedIds = React.useMemo(() => new Set(diffs.map((d) => d.nodeId)), [diffs]);
  const currentEmpty = !current || (current.nodes.length <= 2 && current.nodes.some((n) => n.id === 'inicio'));

  const apply = async (force = false) => {
    setError(null);
    try {
      await onApply({ force, acceptErrors: acceptErrors || undefined });
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        return;
      }
      const refused = hasErrorsRefusal(e);
      if (refused) {
        setError(`A proposta ainda tem ${refused.length || ''} ${refused.length === 1 ? 'erro de estrutura' : 'erros de estrutura'}. Marque "Aplicar mesmo assim" para seguir e corrigir no storyboard.`);
        return;
      }
      // Rascunho mudou (409 sem conflito de estrutura): recarrega para alinhar a revisão e pede para tentar de novo.
      try {
        await reload();
      } catch {
        /* segue com a mensagem original */
      }
      setError(errorText(e, generated ? 'Não foi possível aplicar a aula' : 'Não foi possível aplicar a revisão'));
    }
  };

  const chip = (n: number | undefined, one: string, many: string) => `${n ?? 0} ${n === 1 ? one : many}`;
  const sceneName = (id: string) => proposal.payload.graph.nodes.find((n) => n.id === id)?.title?.trim() || current?.nodes.find((n) => n.id === id)?.title?.trim() || id;

  return (
    <section aria-labelledby={`ai-proposal-${proposal.id}`} className="panel rise overflow-hidden" data-testid="ai-proposal" data-kind={proposal.kind}>
      <header className="flex flex-wrap items-center justify-between gap-2 bg-ai-soft px-5 py-3">
        <h3 id={`ai-proposal-${proposal.id}`} className="flex items-center gap-2 text-sm font-semibold text-ai">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> {generated ? 'Aula proposta pela IA' : 'Revisão proposta pela IA'}
          <span className="rounded-full bg-bg/70 px-2 py-0.5 text-xs font-medium text-ai">{focusLabel}</span>
        </h3>
        <p className="text-xs text-ai/80">Nada muda até você aplicar.</p>
      </header>
      <div className="space-y-4 p-5">
        {proposal.rationale && <p className="text-base leading-relaxed text-fg">{proposal.rationale}</p>}
        <p className="text-sm text-fg-muted" data-testid="ai-proposal-summary-line">{graphSummaryLine(proposal.payload.graph)}</p>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Resumo da revisão">
          {!currentEmpty && (
            <>
              <li className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">{chip(s.changed, 'cena alterada', 'cenas alteradas')}</li>
              <li className="rounded-full bg-success-soft px-2.5 py-1 font-medium text-success">{chip(s.added, 'nova', 'novas')}</li>
              <li className="rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">{chip(s.removed, 'removida', 'removidas')}</li>
              {typeof s.unchanged === 'number' && <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">{chip(s.unchanged, 'sem mudança', 'sem mudança')}</li>}
            </>
          )}
          {!!s.errors && <li className="rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">{s.errors} {s.errors === 1 ? 'erro de estrutura' : 'erros de estrutura'}</li>}
          {!!s.warnings && <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">{s.warnings} {s.warnings === 1 ? 'aviso' : 'avisos'}</li>}
          {scoped.length > 0 && <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">só {scoped.length === 1 ? '1 cena entra' : `${scoped.length} cenas entram`}; o resto da aula fica como está</li>}
        </ul>
        {generated && !currentEmpty && (
          <p className="rounded-xl border border-paid/40 bg-paid-soft/40 px-3 py-2 text-sm text-fg" data-testid="ai-proposal-replaces">
            Aplicar substitui a aula inteira{s.replacesScenes ? `: ${s.replacesScenes} ${s.replacesScenes === 1 ? 'cena' : 'cenas'} de hoje` : ''}{s.replacesMedia ? ` e ${s.replacesMedia} ${s.replacesMedia === 1 ? 'vídeo' : 'vídeos'}` : ''} dão lugar à proposta.
          </p>
        )}
        {s.conversionWarnings && s.conversionWarnings.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm" data-testid="ai-proposal-conversion-warnings">
            <p className="font-medium text-fg">O que a IA não conseguiu preservar</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
              {s.conversionWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <ProposalIssues errors={errors} warnings={warnings} />

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Como ver a proposta">
            {!currentEmpty && (
              <button type="button" role="tab" aria-selected={tab === 'diff'} className={cn('min-h-9 rounded-full px-3 text-sm font-medium', tab === 'diff' ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-fg/5')} onClick={() => setTab('diff')} data-testid="ai-proposal-tab-diff">
                Antes e depois ({diffs.length})
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'scenes' || currentEmpty} className={cn('min-h-9 rounded-full px-3 text-sm font-medium', tab === 'scenes' || currentEmpty ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-fg/5')} onClick={() => setTab('scenes')} data-testid="ai-proposal-tab-scenes">
              Cenas propostas
            </button>
          </div>
          {tab === 'diff' && !currentEmpty ? <SceneBeforeAfter diffs={diffs} sceneName={sceneName} /> : <ProposalScenes graph={proposal.payload.graph} highlightIds={currentEmpty ? undefined : changedIds} issues={errors} dense />}
        </div>

        {hasErrors && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-danger/40 bg-danger-soft/40 px-3 py-2 text-sm text-fg">
            <input type="checkbox" className="mt-1 size-4 accent-danger" checked={acceptErrors} onChange={(e) => setAcceptErrors(e.target.checked)} data-testid="ai-proposal-accept-errors" />
            <span>
              Aplicar mesmo assim, com {errors.length || s.errors || ''} {(errors.length || s.errors) === 1 ? 'erro' : 'erros'} de estrutura
              <span className="block text-xs text-fg-muted">Você corrige no storyboard; a publicação continua bloqueada enquanto houver erros.</span>
            </span>
          </label>
        )}
        {conflict ? (
          <div role="alert" className="space-y-2 rounded-xl bg-paid-soft p-3 text-sm text-paid">
            <p>
              Esta aula foi editada depois que a IA preparou {generated ? 'a aula' : 'a revisão'}.{' '}
              {scoped.length ? `Aplicar mesmo assim troca só ${scoped.length === 1 ? 'a cena-alvo' : `as ${scoped.length} cenas-alvo`}; o que você mudou nas outras cenas continua.` : 'Aplicar mesmo assim substitui a aula inteira pelo que a IA propôs.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="paid" size="sm" disabled={busy} onClick={() => void apply(true)} data-testid="ai-proposal-force">
                Aplicar mesmo assim
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConflict(false)}>Voltar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ai" size="sm" disabled={busy || saving || (hasErrors && !acceptErrors)} onClick={() => void apply(false)} data-testid="ai-proposal-apply">
              {busy ? 'Aplicando…' : generated ? 'Aplicar aula' : 'Aplicar revisão'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onReject()} data-testid="ai-proposal-reject">
              <X className="h-4 w-4" aria-hidden="true" /> Descartar
            </Button>
            {saving && <span className="text-xs text-fg-muted">Aguardando salvar suas alterações…</span>}
            {hasErrors && !acceptErrors && <span className="text-xs text-danger">Aplicar está bloqueado enquanto houver erros.</span>}
          </div>
        )}
        {error && <p role="alert" className={cn('text-sm text-danger')}>{error}</p>}
      </div>
    </section>
  );
}

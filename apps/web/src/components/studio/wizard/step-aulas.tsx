'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Eye, Sparkles, X } from 'lucide-react';
import { EXPERIENCE_FAMILY_LABELS, type Lesson } from '@lms/course-schema';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { Checkbox, Textarea } from '@/components/ui/input';
import { OverlayPortal } from '@/components/ui/overlay-portal';
import { useFocusTrap } from '@/components/ui/focus-trap';
import { useDraft } from '@/components/studio/draft-provider';
import { ConfirmDialog } from '@/components/studio/storyboard/confirm-dialog';
import { ProposalIssues, ProposalScenes, graphSummaryLine } from '@/components/studio/storyboard/proposal-preview';
import {
  AI_NOT_CONFIGURED,
  ApplyConflict,
  RUN_ACTIVE,
  cancelRun,
  errorMessage,
  formatElapsed,
  isStalled,
  useAiCapabilities,
  useApplyProposals,
  useElapsedSeconds,
  type AgentProposal,
  type AgentRun,
  type LessonPayload,
  type LessonSummary,
} from './agent-api';
import { lessonStats } from './wizard-state';

const POLL_MS = 3000;

type LessonProposal = AgentProposal<LessonPayload, LessonSummary>;

interface SkippedLesson {
  lessonId: string;
  title: string;
  reason: 'open_run' | 'has_scenes';
}

export function StepAulas() {
  const { courseId, document: doc } = useDraft();
  const ai = useAiCapabilities();
  const { applyBatch, reject } = useApplyProposals();
  const lessons = React.useMemo(() => doc.modules.flatMap((m) => m.lessons.map((l) => ({ lesson: l, moduleTitle: m.title }))), [doc.modules]);

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(lessons.filter(({ lesson }) => lessonStats(lesson).empty).map(({ lesson }) => lesson.id)));
  const [instruction, setInstruction] = React.useState('');
  const [runs, setRuns] = React.useState<AgentRun[]>([]);
  const [proposals, setProposals] = React.useState<Record<string, LessonProposal>>({});
  const inflight = React.useRef(new Set<string>());
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  /** propostas com erros que o autor aceitou aplicar mesmo assim */
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<'generate' | 'apply' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [lastApplied, setLastApplied] = React.useState<Set<string>>(new Set());
  const [viewing, setViewing] = React.useState<string | null>(null);
  /** confirmação antes de gerar por cima de aulas com edições ou vídeos */
  const [overwrite, setOverwrite] = React.useState<{ ids: string[]; risky: Array<{ lesson: Lesson; scenes: number; media: number }> } | null>(null);

  const lessonById = React.useMemo(() => new Map(lessons.map(({ lesson }) => [lesson.id, lesson])), [lessons]);

  /** Último run por aula (a lista vem do mais recente para o mais antigo). */
  const latestByLesson = React.useMemo(() => {
    const m = new Map<string, AgentRun>();
    for (const r of runs) if (r.task === 'lesson' && r.lessonId && !m.has(r.lessonId)) m.set(r.lessonId, r);
    return m;
  }, [runs]);
  const anyActive = runs.some((r) => r.task === 'lesson' && RUN_ACTIVE.has(r.status));

  const fetchRuns = React.useCallback(async () => {
    const r = await api<{ runs: AgentRun[] }>(`/api/courses/${courseId}/agent/runs`);
    setRuns(r.runs);
    return r.runs;
  }, [courseId]);

  // Carrega o histórico uma vez; depois faz polling a cada 3 s enquanto houver run ativo.
  React.useEffect(() => {
    fetchRuns().catch(() => undefined);
  }, [fetchRuns]);
  React.useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => fetchRuns().catch(() => undefined), POLL_MS);
    return () => clearInterval(t);
  }, [anyActive, fetchRuns]);

  // Busca a proposta de cada run concluído (uma vez por proposta).
  React.useEffect(() => {
    const missing = [...latestByLesson.values()].filter((r) => r.status === 'succeeded' && r.proposalId && !proposals[r.proposalId] && !inflight.current.has(r.proposalId));
    if (missing.length === 0) return;
    for (const r of missing) inflight.current.add(r.proposalId!);
    // sem flag `alive`: o polling de runs re-executa este efeito e cancelaria a busca em voo
    Promise.all(
      missing.map((r) =>
        api<{ proposal: LessonProposal }>(`/api/agent-proposals/${r.proposalId}`)
          .then((p) => p.proposal)
          .catch(() => null),
      ),
    ).then((list) => {
      for (const r of missing) inflight.current.delete(r.proposalId!);
      setProposals((prev) => {
        const next = { ...prev };
        for (const p of list) if (p) next[p.id] = p;
        return next;
      });
      setChosen((prev) => {
        const next = new Set(prev);
        // propostas com erros não entram marcadas: o autor precisa ver e aceitar
        for (const p of list) if (p && (p.status === 'proposed' || p.status === 'conflict') && !p.payload.hasErrors) next.add(p.id);
        return next;
      });
    });
  }, [latestByLesson, proposals]);

  const generate = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy('generate');
    setError(null);
    setNotice(null);
    setOverwrite(null);
    try {
      const r = await api<{ runs: { id: string; lessonId: string }[]; skipped: SkippedLesson[] }>(`/api/courses/${courseId}/agent/lessons`, {
        json: { lessonIds: ids, ...(instruction.trim() ? { instruction: instruction.trim() } : {}) },
      });
      if (r.skipped?.length) {
        const names = r.skipped.map((s) => `“${s.title}”`).join(', ');
        setNotice(`${r.runs.length} ${r.runs.length === 1 ? 'aula entrou' : 'aulas entraram'} na fila. ${r.skipped.length === 1 ? 'Ficou de fora' : 'Ficaram de fora'} ${names}: já ${r.skipped.length === 1 ? 'tem' : 'têm'} uma geração em andamento.`);
      }
      await fetchRuns();
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível iniciar a geração'));
    } finally {
      setBusy(null);
    }
  };

  /** Antes de gerar: aulas com cenas escritas ou vídeos avisam que gerar de novo substitui tudo. */
  const requestGenerate = (ids: string[]) => {
    const risky = ids
      .map((id) => lessonById.get(id))
      .filter((l): l is Lesson => !!l)
      .map((lesson) => {
        const s = lessonStats(lesson);
        return { lesson, scenes: s.empty ? 0 : s.scenes, media: lesson.graph.nodes.filter((n) => 'media' in n && !!(n as { media?: unknown }).media).length };
      })
      .filter((x) => x.scenes > 0 || x.media > 0);
    if (risky.length === 0) return void generate(ids);
    setOverwrite({ ids, risky });
  };

  const cancel = async (run: AgentRun) => {
    setError(null);
    try {
      await cancelRun(run.id);
      await fetchRuns();
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível cancelar'));
    }
  };

  const pending = [...latestByLesson.values()]
    .map((r) => (r.proposalId ? proposals[r.proposalId] : undefined))
    .filter((p): p is LessonProposal => !!p && (p.status === 'proposed' || p.status === 'conflict') && lessonById.has(p.lessonId ?? ''));
  const toApply = pending.filter((p) => chosen.has(p.id));
  const withErrors = toApply.filter((p) => p.payload.hasErrors);

  const apply = async (extra: { force?: boolean } = {}) => {
    if (toApply.length === 0) return;
    setBusy('apply');
    setError(null);
    setNotice(null);
    const ids = toApply.map((p) => p.id);
    try {
      const r = await applyBatch(ids, { ...extra, ...(withErrors.length ? { acceptErrors: true } : {}) });
      setLastApplied((s) => new Set([...s, ...toApply.map((p) => p.lessonId!)]));
      setProposals((prev) => {
        const next = { ...prev };
        for (const id of ids) if (next[id]) next[id] = { ...next[id]!, status: 'applied' };
        return next;
      });
      setChosen(new Set());
      setViewing(null);
      setNotice(`${r.applied} ${r.applied === 1 ? 'aula aplicada' : 'aulas aplicadas'}. A prévia e o storyboard já mostram o novo conteúdo.${withErrors.length ? ` ${withErrors.length === 1 ? 'Uma aula ficou com erros de estrutura' : `${withErrors.length} aulas ficaram com erros de estrutura`}: corrija no storyboard antes de publicar.` : ''}`);
    } catch (e) {
      if (e instanceof ApplyConflict) {
        if (e.refusal.kind === 'conflict') setError('CONFLICT');
        else setError(e.message);
      } else setError(errorMessage(e, 'Não foi possível aplicar as propostas'));
    } finally {
      setBusy(null);
    }
  };

  const discard = async (p: LessonProposal) => {
    try {
      await reject(p.id);
    } catch {
      /* mantém o descarte local */
    }
    setProposals((prev) => ({ ...prev, [p.id]: { ...p, status: 'rejected' } }));
    setChosen((s) => {
      const n = new Set(s);
      n.delete(p.id);
      return n;
    });
    if (viewing === p.id) setViewing(null);
  };

  const allIds = lessons.map(({ lesson }) => lesson.id);
  const selIds = allIds.filter((id) => selected.has(id));
  const generateLabel = selIds.length === 0 ? 'Selecione aulas para gerar' : selIds.length === allIds.length ? `Gerar todas as ${allIds.length} aulas com IA` : `Gerar ${selIds.length} ${selIds.length === 1 ? 'aula selecionada' : 'aulas selecionadas'} com IA`;
  const aiBlocked = !ai.loading && !ai.configured;
  const viewingProposal = viewing ? proposals[viewing] : undefined;

  if (lessons.length === 0) {
    return <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-muted">Ainda não há aulas. Volte ao passo "Estrutura" para criar.</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-ai/40 bg-ai-soft/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg">
            <Checkbox
              checked={selIds.length === allIds.length}
              ref={(el) => {
                if (el) el.indeterminate = selIds.length > 0 && selIds.length < allIds.length;
              }}
              onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
            />
            Selecionar todas
          </label>
          <span className="text-xs text-fg-muted tabular-nums">{selIds.length} de {allIds.length} selecionadas</span>
        </div>
        <div>
          <label htmlFor="lessons-instruction" className="mb-1.5 block text-sm font-medium text-fg">Alguma orientação para a IA? (opcional)</label>
          <Textarea id="lessons-instruction" rows={2} value={instruction} placeholder="Ex.: use nomes de personagens brasileiros; evite jargão técnico; no máximo 3 decisões por aula" onChange={(e) => setInstruction(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ai" onClick={() => requestGenerate(selIds)} disabled={busy !== null || selIds.length === 0 || ai.loading || !ai.configured} data-testid="lessons-generate">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {busy === 'generate' ? 'Iniciando…' : generateLabel}
          </Button>
          {anyActive && (
            <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
              <span className="h-2 w-2 rounded-full bg-accent pulse-dot" aria-hidden="true" /> Geração em andamento; aulas ocupadas ficam de fora de um novo lote.
            </span>
          )}
        </div>
        {aiBlocked && <p className="text-xs text-fg-muted">{AI_NOT_CONFIGURED} Você pode escrever as cenas no storyboard de cada aula.</p>}
        <p className="text-xs text-fg-faint">A IA escreve um rascunho de cenas e decisões para cada aula a partir das cenas previstas na estrutura. Nada é alterado no curso até você ver e aplicar.</p>
      </section>

      {error === 'CONFLICT' ? (
        <div role="alert" className="space-y-2 rounded-xl bg-paid-soft p-3 text-sm text-paid" data-testid="lessons-conflict">
          <p>Alguma dessas aulas foi editada depois da proposta. Aplicar mesmo assim substitui a aula inteira pela proposta.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="paid" size="sm" disabled={busy !== null} onClick={() => void apply({ force: true })} data-testid="lessons-force">
              Aplicar mesmo assim
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Voltar</Button>
          </div>
        </div>
      ) : (
        error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {notice && <p role="status" className="rounded-xl border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2" data-testid="lesson-table">
        {lessons.map(({ lesson, moduleTitle }, i) => {
          const run = latestByLesson.get(lesson.id);
          const proposal = run?.proposalId ? proposals[run.proposalId] : undefined;
          return (
            <LessonTableRow
              key={lesson.id}
              courseId={courseId}
              index={i}
              lesson={lesson}
              moduleTitle={moduleTitle}
              generated={lastApplied.has(lesson.id) || (!!run && run.status === 'succeeded' && proposal?.status === 'applied')}
              selected={selected.has(lesson.id)}
              onSelect={(v) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (v) n.add(lesson.id);
                  else n.delete(lesson.id);
                  return n;
                })
              }
              run={run}
              proposal={proposal}
              chosen={!!proposal && chosen.has(proposal.id)}
              accepted={!!proposal && accepted.has(proposal.id)}
              onChoose={(v) =>
                proposal &&
                setChosen((s) => {
                  const n = new Set(s);
                  if (v) n.add(proposal.id);
                  else n.delete(proposal.id);
                  return n;
                })
              }
              onAccept={() => {
                if (!proposal) return;
                setAccepted((s) => new Set(s).add(proposal.id));
                setChosen((s) => new Set(s).add(proposal.id));
              }}
              onView={() => proposal && setViewing(proposal.id)}
              onRetry={() => requestGenerate([lesson.id])}
              onCancel={() => run && void cancel(run)}
              onDiscard={() => proposal && void discard(proposal)}
              disabled={busy !== null}
            />
          );
        })}
      </ul>

      {pending.length > 0 && (
        <div className="panel panel-accent sticky bottom-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-fg">
            {toApply.length === 0 ? 'Veja e marque as propostas que quer aplicar.' : `${toApply.length} de ${pending.length} ${pending.length === 1 ? 'proposta marcada' : 'propostas marcadas'}.`}
            {withErrors.length > 0 && <span className="block text-xs text-danger">{withErrors.length === 1 ? '1 proposta com erros será aplicada mesmo assim.' : `${withErrors.length} propostas com erros serão aplicadas mesmo assim.`}</span>}
          </p>
          <Button onClick={() => void apply()} disabled={busy !== null || toApply.length === 0} data-testid="lessons-apply">
            {busy === 'apply' ? 'Aplicando…' : toApply.length === 1 ? 'Aplicar 1 proposta' : `Aplicar ${toApply.length} propostas`}
          </Button>
        </div>
      )}

      {viewingProposal && lessonById.get(viewingProposal.lessonId ?? '') && (
        <ProposalDrawer
          proposal={viewingProposal}
          lesson={lessonById.get(viewingProposal.lessonId ?? '')!}
          chosen={chosen.has(viewingProposal.id)}
          accepted={accepted.has(viewingProposal.id)}
          onChoose={(v) =>
            setChosen((s) => {
              const n = new Set(s);
              if (v) n.add(viewingProposal.id);
              else n.delete(viewingProposal.id);
              return n;
            })
          }
          onAccept={() => {
            setAccepted((s) => new Set(s).add(viewingProposal.id));
            setChosen((s) => new Set(s).add(viewingProposal.id));
          }}
          onDiscard={() => void discard(viewingProposal)}
          onClose={() => setViewing(null)}
        />
      )}

      {overwrite && (
        <ConfirmDialog
          title={overwrite.risky.length === 1 ? 'Gerar de novo substitui esta aula' : `Gerar de novo substitui ${overwrite.risky.length} aulas`}
          confirmLabel={overwrite.ids.length === overwrite.risky.length ? 'Gerar mesmo assim' : `Gerar as ${overwrite.ids.length} mesmo assim`}
          danger
          busy={busy === 'generate'}
          onCancel={() => setOverwrite(null)}
          onConfirm={() => void generate(overwrite.ids)}
          testId="lessons-overwrite"
        >
          <p className="text-sm text-fg-muted">Estas aulas já têm cenas (edições suas) ou vídeos. Aplicar a nova proposta substitui tudo isso. Você ainda vê a proposta antes de aplicar, mas o que existe hoje só volta pelo histórico de revisões.</p>
          <ul className="space-y-1 rounded-xl border border-danger/30 bg-danger-soft/60 p-3 text-sm" data-testid="lessons-overwrite-list">
            {overwrite.risky.map((r) => (
              <li key={r.lesson.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-fg">{r.lesson.title}</span>
                <span className="text-danger">
                  {r.scenes ? `${r.scenes} ${r.scenes === 1 ? 'cena sua' : 'cenas suas'}` : ''}
                  {r.scenes && r.media ? ' · ' : ''}
                  {r.media ? `${r.media} ${r.media === 1 ? 'vídeo' : 'vídeos'}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {overwrite.ids.length > overwrite.risky.length && (
            <Button variant="secondary" size="sm" onClick={() => void generate(overwrite.ids.filter((id) => !overwrite.risky.some((r) => r.lesson.id === id)))} data-testid="lessons-generate-empty-only">
              Gerar só as {overwrite.ids.length - overwrite.risky.length} {overwrite.ids.length - overwrite.risky.length === 1 ? 'aula vazia' : 'aulas vazias'}
            </Button>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LessonTableRow({
  courseId,
  index,
  lesson,
  moduleTitle,
  generated,
  selected,
  onSelect,
  run,
  proposal,
  chosen,
  accepted,
  onChoose,
  onAccept,
  onView,
  onRetry,
  onCancel,
  onDiscard,
  disabled,
}: {
  courseId: string;
  index: number;
  lesson: Lesson;
  moduleTitle: string;
  generated: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  run?: AgentRun;
  proposal?: LessonProposal;
  chosen: boolean;
  accepted: boolean;
  onChoose: (v: boolean) => void;
  onAccept: () => void;
  onView: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDiscard: () => void;
  disabled: boolean;
}) {
  const stats = lessonStats(lesson);
  const active = !!run && RUN_ACTIVE.has(run.status);
  const elapsed = useElapsedSeconds(run?.createdAt, active);
  const stalled = isStalled(run, elapsed);
  const state: { label: string; tone: BadgeTone } = stats.empty
    ? { label: 'Sem cenas', tone: 'neutral' }
    : generated
      ? { label: `Rascunho da IA (${plural(stats.scenes, 'cena')}, ${plural(stats.decisions, 'decisão', 'decisões')})`, tone: 'ai' }
      : { label: `Editada manualmente (${plural(stats.scenes, 'cena')}, ${plural(stats.decisions, 'decisão', 'decisões')})`, tone: 'success' };
  const base = `/estudio/cursos/${courseId}/aulas/${lesson.id}`;
  const showProposal = !!proposal && (proposal.status === 'proposed' || proposal.status === 'conflict') && run?.status === 'succeeded';
  const hasErrors = !!proposal?.payload.hasErrors;
  const errorCount = proposal?.payload.issues?.errors.length ?? proposal?.summary.errors ?? 0;

  return (
    <li className="space-y-3 p-4" data-testid={`lesson-row-${lesson.id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="flex items-start gap-3 sm:flex-1">
          <Checkbox className="mt-1" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Selecionar aula ${lesson.title}`} />
          <span className="min-w-0">
            <span className="block font-medium text-fg">{index + 1}. {lesson.title}</span>
            <span className="block text-xs text-fg-faint">{moduleTitle} · {EXPERIENCE_FAMILY_LABELS[lesson.family]} · {lesson.estimatedMinutes} min{lesson.keyScenes?.length ? ` · ${plural(lesson.keyScenes.length, 'cena prevista', 'cenas previstas')}` : ''}</span>
            <Badge tone={state.tone} className="mt-1.5">{state.label}</Badge>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Link href={base} aria-label={`Abrir a aula “${lesson.title}” no storyboard`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Abrir no storyboard</Link>
          {!stats.empty && (
            <Link href={`${base}/previa`} aria-label={`Ver prévia da aula “${lesson.title}”`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>Ver prévia</Link>
          )}
        </div>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ai/30 bg-ai-soft/60 px-3 py-2 text-sm" role="status" aria-live="polite" data-testid={`lesson-run-${lesson.id}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent pulse-dot" aria-hidden="true" />
          <span className="text-fg">{run!.status === 'queued' ? 'Na fila…' : 'Escrevendo cenas…'}</span>
          <span className="text-xs text-fg-muted tabular-nums">{run!.provider} {run!.model} · {formatElapsed(elapsed)}</span>
          {stalled && <span className="text-xs text-paid" data-testid={`lesson-stalled-${lesson.id}`}>O worker não responde há {formatElapsed(elapsed)}.</span>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel} data-testid={`lesson-cancel-${lesson.id}`}>
            Cancelar
          </Button>
        </div>
      )}

      {run?.status === 'failed' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <span>Falhou: {run.error ?? 'erro desconhecido'}</span>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={disabled}>Tentar de novo</Button>
        </div>
      )}
      {run?.status === 'canceled' && <p className="text-xs text-fg-muted">Geração cancelada.</p>}

      {showProposal && proposal && (
        <div className={cn('space-y-2 rounded-xl border p-3', hasErrors ? 'border-danger/40 bg-danger-soft/30' : 'border-ai/40 bg-ai-soft/60')} data-testid={`lesson-proposal-${lesson.id}`}>
          <label className="flex items-start gap-3">
            <Checkbox className="mt-1" checked={chosen} disabled={hasErrors && !accepted} onChange={(e) => onChoose(e.target.checked)} data-testid={`proposal-${proposal.id}`} />
            <span className="min-w-0 text-sm">
              <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />
                Proposta pronta: {graphSummaryLine(proposal.payload.graph)}
                {hasErrors && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" /> {plural(errorCount, 'erro')}
                  </span>
                )}
                {!!proposal.summary.replacesScenes && <span className="rounded-full bg-paid-soft px-2 py-0.5 text-xs font-medium text-paid">substitui {plural(proposal.summary.replacesScenes, 'cena')}{proposal.summary.replacesMedia ? ` e ${plural(proposal.summary.replacesMedia, 'vídeo')}` : ''}</span>}
                {proposal.status === 'conflict' && <span className="rounded-full bg-paid-soft px-2 py-0.5 text-xs font-medium text-paid">aula editada depois da proposta</span>}
              </span>
              {proposal.rationale && <span className="mt-1 block text-fg-muted">{proposal.rationale}</span>}
              {hasErrors && !accepted && <span className="mt-1 block text-xs text-danger">Veja a proposta: aplicar com erros exige confirmação.</span>}
            </span>
          </label>
          <div className="flex flex-wrap gap-2 pl-8">
            <Button variant="secondary" size="sm" onClick={onView} data-testid={`proposal-view-${lesson.id}`}>
              <Eye className="h-4 w-4" aria-hidden="true" /> Ver proposta
            </Button>
            {hasErrors && !accepted && (
              <Button variant="paid" size="sm" onClick={onAccept} data-testid={`proposal-accept-errors-${lesson.id}`}>
                Aplicar mesmo assim
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDiscard} disabled={disabled}>Descartar proposta</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Gaveta "Ver proposta": a aula proposta, só de leitura               */
/* ------------------------------------------------------------------ */

function ProposalDrawer({
  proposal,
  lesson,
  chosen,
  accepted,
  onChoose,
  onAccept,
  onDiscard,
  onClose,
}: {
  proposal: LessonProposal;
  lesson: Lesson;
  chosen: boolean;
  accepted: boolean;
  onChoose: (v: boolean) => void;
  onAccept: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  useFocusTrap(ref, { initialFocus: closeRef, onEscape: () => onCloseRef.current() });
  const graph = proposal.payload.graph;
  const errors = proposal.payload.issues?.errors ?? [];
  const warnings = proposal.payload.issues?.warnings ?? [];
  const hasErrors = !!proposal.payload.hasErrors;
  const stats = lessonStats(lesson);
  const s = proposal.summary;
  const diffLine = !stats.empty && (s.changed !== undefined || s.added !== undefined) ? `Em relação à aula de hoje: ${plural(s.changed ?? 0, 'cena alterada', 'cenas alteradas')}, ${plural(s.added ?? 0, 'nova')}, ${plural(s.removed ?? 0, 'removida')}.` : null;
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex justify-end bg-bg/75 backdrop-blur-sm" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full w-full max-w-2xl flex-col border-l border-line-strong bg-surface shadow-2xl" data-testid="proposal-drawer">
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ai"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Proposta da IA · só leitura</p>
              <h2 id={titleId} className="truncate font-display text-xl font-bold text-fg">{lesson.title}</h2>
              <p className="text-sm text-fg-muted" data-testid="proposal-summary-line">{graphSummaryLine(graph)}</p>
              {diffLine && <p className="text-xs text-fg-faint">{diffLine}</p>}
            </div>
            <Button ref={closeRef} variant="ghost" size="icon" aria-label="Fechar" onClick={onClose} data-testid="proposal-drawer-close">
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {proposal.rationale && <p className="text-sm text-fg-muted">{proposal.rationale}</p>}
            {!stats.empty && (
              <p className="rounded-xl border border-paid/40 bg-paid-soft/40 px-3 py-2 text-sm text-fg" data-testid="proposal-replaces">
                Aplicar substitui a aula inteira: {plural(stats.scenes, 'cena')} de hoje{stats.withMedia ? ` e ${plural(stats.withMedia, 'vídeo')}` : ''} dão lugar a esta proposta.
              </p>
            )}
            <ProposalIssues errors={errors} warnings={warnings} />
            <ProposalScenes graph={graph} issues={errors} />
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            {hasErrors && !accepted ? (
              <>
                <span className="text-sm text-danger">Esta proposta tem {plural(errors.length || (s.errors ?? 0), 'erro')}. Aplicar exige confirmação.</span>
                <Button variant="paid" size="sm" onClick={onAccept} data-testid="proposal-drawer-accept-errors">Aplicar mesmo assim</Button>
              </>
            ) : (
              <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg">
                <Checkbox checked={chosen} onChange={(e) => onChoose(e.target.checked)} data-testid="proposal-drawer-choose" />
                Marcar para aplicar
              </label>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onDiscard}>Descartar</Button>
            <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
          </footer>
        </div>
      </div>
    </OverlayPortal>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

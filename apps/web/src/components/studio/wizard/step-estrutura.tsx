'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { EXPERIENCE_FAMILIES, EXPERIENCE_FAMILY_LABELS, type CourseDocument, type Lesson, type Module, type Objective } from '@lms/course-schema';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { useDraft } from '@/components/studio/draft-provider';
import { createLesson, createModule, createObjective, moveItem } from '@/components/studio/graph-ops';
import { ConfirmDialog } from '@/components/studio/storyboard/confirm-dialog';
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
  type ApplyRefusal,
  type OutlineLessonPlan,
  type OutlinePayload,
  type OutlineSummary,
} from './agent-api';

const POLL_MS = 2500;

export function StepEstrutura() {
  const { document: doc, update } = useDraft();
  const hasLessons = doc.modules.some((m) => m.lessons.length > 0);
  const [manual, setManual] = React.useState(false);
  const [askAi, setAskAi] = React.useState(false);

  if (!hasLessons && !manual && doc.modules.length === 0) {
    return <OutlineStart onManual={() => setManual(true)} />;
  }
  return (
    <div className="space-y-10">
      {askAi ? (
        <section className="space-y-4 rounded-xl border border-ai/40 bg-ai-soft/60 p-5" aria-label="Nova proposta de estrutura">
          <p className="text-sm text-fg-muted">A IA recebe a estrutura atual e mantém as aulas que continuam (com as cenas). Antes de aplicar, você vê lado a lado o que muda, e nada se perde sem a sua confirmação.</p>
          <OutlineStart onManual={() => setAskAi(false)} onApplied={() => setAskAi(false)} />
        </section>
      ) : (
        <p className="text-sm text-fg-muted">
          Quer outra proposta?{' '}
          <button type="button" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ai underline-offset-2 hover:underline" onClick={() => setAskAi(true)} data-testid="outline-ask-again">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Pedir uma proposta à IA
          </button>
        </p>
      )}
      <ObjectivesEditor objectives={doc.objectives} />
      <ModulesEditor modules={doc.modules} objectives={doc.objectives} />
      {!hasLessons && (
        <p className="text-sm text-fg-muted">
          Prefere uma proposta pronta?{' '}
          <button type="button" className="inline-flex min-h-11 items-center font-medium text-ai underline-offset-2 hover:underline" onClick={() => update((d) => ({ ...d, modules: [] }))}>
            Voltar e pedir à IA
          </button>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plano por aula (mesma regra do servidor, calculado contra o rascunho ao vivo) */
/* ------------------------------------------------------------------ */

function visibleScenes(l: Lesson): number {
  const nodes = l.graph.nodes;
  const placeholder = nodes.length <= 2 && nodes.some((n) => n.id === 'inicio') && nodes.some((n) => n.type === 'end');
  return placeholder ? 0 : nodes.filter((n) => n.type !== 'end').length;
}
const mediaScenes = (l: Lesson) => l.graph.nodes.filter((n) => 'media' in n && !!(n as { media?: unknown }).media).length;

export function outlinePlan(doc: CourseDocument, payload: OutlinePayload): OutlineLessonPlan[] {
  const current = new Map<string, { lesson: Lesson; moduleId: string }>();
  for (const m of doc.modules) for (const l of m.lessons) current.set(l.id, { lesson: l, moduleId: m.id });
  const out: OutlineLessonPlan[] = [];
  const seen = new Set<string>();
  for (const m of payload.modules) {
    for (const l of m.lessons) {
      seen.add(l.id);
      const prev = current.get(l.id);
      if (!prev) {
        out.push({ lessonId: l.id, title: l.title, status: 'new', sceneCount: 0, mediaCount: 0, moduleId: m.id });
        continue;
      }
      const same = prev.lesson.title.trim() === l.title.trim();
      out.push({ lessonId: l.id, title: l.title, ...(same ? {} : { previousTitle: prev.lesson.title }), status: same ? 'kept' : 'retitled', sceneCount: visibleScenes(prev.lesson), mediaCount: mediaScenes(prev.lesson), moduleId: m.id });
    }
  }
  for (const [id, { lesson, moduleId }] of current) {
    if (seen.has(id)) continue;
    const scenes = visibleScenes(lesson);
    out.push({ lessonId: id, title: lesson.title, status: scenes > 0 ? 'contentLost' : 'removed', sceneCount: scenes, mediaCount: mediaScenes(lesson), moduleId });
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Marca curta por aula ("mantém 6 cenas", "perde 6 cenas", "nova", "removida", "renomeada"). */
export function planMark(p: OutlineLessonPlan): { label: string; tone: BadgeTone } {
  switch (p.status) {
    case 'new':
      return { label: 'nova', tone: 'brand' };
    case 'kept':
      return p.sceneCount ? { label: `mantém ${plural(p.sceneCount, 'cena')}${p.mediaCount ? ` e ${plural(p.mediaCount, 'vídeo')}` : ''}`, tone: 'success' } : { label: 'continua (sem cenas)', tone: 'neutral' };
    case 'retitled':
      return p.sceneCount ? { label: `renomeada · mantém ${plural(p.sceneCount, 'cena')}`, tone: 'success' } : { label: 'renomeada', tone: 'neutral' };
    case 'removed':
      return { label: 'removida', tone: 'warning' };
    case 'contentLost':
      return { label: `perde ${plural(p.sceneCount, 'cena')}${p.mediaCount ? ` e ${plural(p.mediaCount, 'vídeo')}` : ''}`, tone: 'danger' };
  }
}

/* ------------------------------------------------------------------ */
/* Início: propor com IA ou montar à mão                               */
/* ------------------------------------------------------------------ */

function OutlineStart({ onManual, onApplied }: { onManual: () => void; /** a proposta foi aplicada: a seção "pedir outra" pode fechar */ onApplied?: () => void }) {
  const { courseId, document: doc, update } = useDraft();
  const ai = useAiCapabilities();
  const { applyOne, reject } = useApplyProposals();
  const [run, setRun] = React.useState<AgentRun | null>(null);
  const [proposal, setProposal] = React.useState<AgentProposal<OutlinePayload, OutlineSummary> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'start' | 'apply' | 'reject' | 'cancel' | null>(null);
  const [askAnother, setAskAnother] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  /** o servidor pediu uma confirmação (perda de cenas, conflito de revisão) */
  const [refusal, setRefusal] = React.useState<ApplyRefusal | null>(null);
  /** flags já confirmadas nesta tentativa (um 409 pode seguir outro: conflito → perda) */
  const confirmed = React.useRef<{ force?: boolean; confirmLoss?: boolean }>({});

  const active = !!run && RUN_ACTIVE.has(run.status);
  const elapsed = useElapsedSeconds(run?.createdAt, active);
  const stalled = isStalled(run, elapsed);

  // Ao abrir o passo, recupera a última proposta de estrutura ainda pendente ou em conflito (sobrevive a recarregar a página).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api<{ runs: AgentRun[] }>(`/api/courses/${courseId}/agent/runs`);
        const last = r.runs.find((x) => x.task === 'outline');
        if (!last) return;
        let p: AgentProposal<OutlinePayload, OutlineSummary> | null = null;
        if (last.status === 'succeeded' && last.proposalId) {
          const got = (await api<{ proposal: AgentProposal<OutlinePayload, OutlineSummary> }>(`/api/agent-proposals/${last.proposalId}`)).proposal;
          if (got.status === 'proposed' || got.status === 'conflict') p = got;
        }
        if (!alive) return;
        if (p) setProposal(p);
        if (RUN_ACTIVE.has(last.status) || p) setRun(last);
      } catch {
        /* sem histórico */
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  // Polling do run a cada 2,5 s até sair de queued/running.
  React.useEffect(() => {
    if (!run || !RUN_ACTIVE.has(run.status)) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ run: AgentRun }>(`/api/agent-runs/${run.id}`);
        // busca a proposta ANTES de atualizar o run: mudar `run` limpa este efeito (alive=false)
        let p: AgentProposal<OutlinePayload, OutlineSummary> | null = null;
        if (r.run.status === 'succeeded' && r.run.proposalId) {
          p = (await api<{ proposal: AgentProposal<OutlinePayload, OutlineSummary> }>(`/api/agent-proposals/${r.run.proposalId}`)).proposal;
        }
        if (!alive) return;
        if (p) setProposal(p);
        setRun(r.run);
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Perdemos o contato com a geração. Tente de novo.'));
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [run]);

  const start = async (instr?: string) => {
    setBusy('start');
    setError(null);
    setRefusal(null);
    confirmed.current = {};
    setAskAnother(false);
    try {
      const r = await api<{ run: { id: string; status: 'queued' } }>(`/api/courses/${courseId}/agent/outline`, { json: instr ? { instruction: instr } : {} });
      // a proposta anterior continua na tela até a nova chegar (o servidor a substitui)
      setRun({ id: r.run.id, task: 'outline', status: 'queued', provider: ai.caps?.provider ?? '', model: ai.caps?.model ?? '', createdAt: new Date().toISOString() });
      setProposal(null);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível pedir a proposta'));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!run) return;
    setBusy('cancel');
    try {
      const r = await cancelRun(run.id);
      setRun(r);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível cancelar'));
    } finally {
      setBusy(null);
    }
  };

  const apply = async (extra: { force?: boolean; confirmLoss?: boolean } = {}) => {
    if (!proposal) return;
    setBusy('apply');
    setError(null);
    setRefusal(null);
    confirmed.current = { ...confirmed.current, ...extra };
    try {
      await applyOne(proposal.id, confirmed.current);
      update((d) => (d.wizard.contentMode === 'none' ? { ...d, wizard: { ...d.wizard, contentMode: 'generate' } } : d));
      setProposal(null);
      setRun(null);
      confirmed.current = {};
      onApplied?.();
    } catch (e) {
      if (e instanceof ApplyConflict) {
        if (e.refusal.kind === 'stale') setError(e.message);
        else setRefusal(e.refusal);
      } else setError(errorMessage(e, 'Não foi possível aplicar a proposta'));
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!proposal) return;
    setBusy('reject');
    try {
      await reject(proposal.id);
    } catch {
      /* descartar localmente mesmo assim */
    } finally {
      setProposal(null);
      setRun(null);
      setRefusal(null);
      confirmed.current = {};
      setBusy(null);
    }
  };

  if (proposal) {
    const plan = outlinePlan(doc, proposal.payload);
    const lost = plan.filter((p) => p.status === 'contentLost');
    const firstLost = lost[0];
    return (
      <div className="space-y-6">
        <OutlineProposalView proposal={proposal} plan={plan} />
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {refusal?.kind === 'conflict' && (
          <div role="alert" className="space-y-2 rounded-xl bg-paid-soft p-3 text-sm text-paid" data-testid="outline-conflict">
            <p>A estrutura foi editada depois desta proposta. Aplicar mesmo assim substitui objetivos, módulos e aulas pela proposta; as cenas das aulas que continuam (mesmo id) são preservadas.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="paid" size="sm" disabled={busy !== null} onClick={() => void apply({ force: true })} data-testid="outline-force">
                Aplicar mesmo assim
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRefusal(null)}>Voltar</Button>
            </div>
          </div>
        )}
        {askAnother ? (
          <form
            className="space-y-3 rounded-xl border border-ai/40 bg-ai-soft/60 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void start(instruction.trim() || undefined);
            }}
          >
            <label htmlFor="outline-instruction" className="block text-sm font-medium text-fg">O que mudar na próxima proposta?</label>
            <p className="text-xs text-fg-muted">A IA parte desta proposta e da estrutura atual: aulas que continuam mantêm o identificador e as cenas.</p>
            <Textarea id="outline-instruction" rows={3} value={instruction} placeholder="Ex.: menos aulas, mais foco em situações de conflito, incluir uma aula sobre devoluções" onChange={(e) => setInstruction(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="ai" disabled={busy !== null}>
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Pedir nova proposta
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAskAnother(false)}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void apply()} disabled={busy !== null || !!refusal} data-testid="outline-apply">
              {busy === 'apply' ? 'Aplicando…' : 'Aplicar estrutura'}
            </Button>
            <Button variant="ai" onClick={() => setAskAnother(true)} disabled={busy !== null}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Pedir outra proposta
            </Button>
            <Button variant="ghost" onClick={() => void discard()} disabled={busy !== null}>Descartar</Button>
            {lost.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-danger" data-testid="outline-loss-hint">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {plural(lost.length, 'aula')} com cenas {lost.length === 1 ? 'seria removida' : 'seriam removidas'}: aplicar pede confirmação.
              </span>
            )}
          </div>
        )}
        {refusal?.kind === 'contentLoss' && (
          <ConfirmDialog
            title={`Aplicar a estrutura e perder ${plural(refusal.lostScenes, 'cena')}?`}
            confirmLabel="Aplicar e perder as cenas"
            danger
            busy={busy === 'apply'}
            onCancel={() => setRefusal(null)}
            onConfirm={() => void apply({ confirmLoss: true })}
            testId="outline-loss"
          >
            <p className="text-sm text-fg-muted">Estas aulas não estão na proposta. Ao aplicar, elas saem do curso com todas as cenas (e vídeos) que têm hoje:</p>
            <ul className="space-y-1 rounded-xl border border-danger/30 bg-danger-soft/60 p-3 text-sm" data-testid="outline-loss-list">
              {refusal.lost.map((l) => (
                <li key={l.lessonId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-fg">{l.title}</span>
                  <span className="text-danger">
                    perde {plural(l.sceneCount, 'cena')}
                    {l.mediaCount ? ` e ${plural(l.mediaCount, 'vídeo')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">
              Dá para recuperar pelo histórico de revisões (modo avançado de qualquer aula).{' '}
              {firstLost && (
                <Link href={`/estudio/cursos/${courseId}/aulas/${firstLost.lessonId}`} className="font-medium text-accent hover:underline" data-testid="outline-loss-history">
                  Ver histórico
                </Link>
              )}
            </p>
          </ConfirmDialog>
        )}
      </div>
    );
  }

  if (run && active) {
    return (
      <div className="space-y-4 rounded-xl border border-ai/40 bg-ai-soft/60 p-5" role="status" aria-live="polite" data-testid="outline-run-bar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent pulse-dot" aria-hidden="true" />
            <p className="font-display text-xl font-bold text-fg">{run.status === 'queued' ? 'Na fila para gerar a proposta…' : 'Escrevendo a proposta de estrutura…'}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void cancel()} disabled={busy !== null} data-testid="outline-cancel">
            {busy === 'cancel' ? 'Cancelando…' : 'Cancelar'}
          </Button>
        </div>
        {stalled ? (
          <p className="rounded-lg bg-paid-soft px-3 py-2 text-sm text-paid" data-testid="outline-stalled">O worker não responde: a execução está na fila há {formatElapsed(elapsed)}. Confira se o worker está rodando ou cancele e peça de novo.</p>
        ) : (
          <p className="text-sm text-fg-muted">Pode levar 1 a 2 minutos. A IA lê o briefing, as fontes e a estrutura atual, e propõe objetivos, módulos e aulas, explicando por que escolheu cada dinâmica.</p>
        )}
        <p className="text-xs text-fg-faint tabular-nums">
          {run.provider || ai.caps?.provider} {run.model || ai.caps?.model} · {formatElapsed(elapsed)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {run?.status === 'failed' && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-medium">A geração falhou.</p>
          <p>{run.error ?? 'Erro desconhecido.'}</p>
        </div>
      )}
      {run?.status === 'canceled' && <p role="status" className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-sm text-fg-muted">Execução cancelada. Peça outra proposta quando quiser.</p>}
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="space-y-4 rounded-xl border border-ai/40 bg-ai-soft/60 p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ai-soft text-ai"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
            <h2 className="font-display text-xl font-bold">Propor estrutura com IA</h2>
          </div>
          <p className="text-sm text-fg-muted">
            A IA sugere objetivos, módulos e aulas a partir do briefing e das fontes. Você revisa tudo antes de aceitar e pode editar depois.
          </p>
          {doc.modules.some((m) => m.lessons.length > 0) && (
            <div>
              <label htmlFor="outline-instruction-start" className="mb-1 block text-sm font-medium text-fg">O que mudar em relação à estrutura atual? (opcional)</label>
              <Textarea id="outline-instruction-start" rows={2} value={instruction} placeholder="Ex.: menos aulas, mais foco em situações de conflito" onChange={(e) => setInstruction(e.target.value)} data-testid="outline-instruction-start" />
            </div>
          )}
          <Button variant="ai" onClick={() => void start(instruction.trim() || undefined)} disabled={busy !== null || ai.loading || !ai.configured} data-testid="outline-propose">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {busy === 'start' ? 'Pedindo…' : run?.status === 'failed' ? 'Tentar de novo' : 'Propor estrutura'}
          </Button>
          {!ai.loading && !ai.configured && <p className="text-xs text-fg-muted">{AI_NOT_CONFIGURED}</p>}
          {ai.caps?.configured && <p className="text-xs text-fg-faint">Provedor: {ai.caps.provider} ({ai.caps.model}).</p>}
        </div>
        <div className="space-y-4 rounded-xl border border-line bg-bg-2 p-5">
          <h2 className="font-display text-xl font-bold">Montar manualmente</h2>
          <p className="text-sm text-fg-muted">Você escreve os objetivos e cria módulos e aulas um a um. Bom quando a estrutura já está decidida.</p>
          <Button
            variant="secondary"
            onClick={() => {
              update((d) => ({ ...d, modules: [createModule('Módulo 1')] }));
              onManual();
            }}
            data-testid="outline-manual"
          >
            Montar manualmente
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Proposta: comparação lado a lado com a estrutura atual              */
/* ------------------------------------------------------------------ */

function OutlineProposalView({ proposal, plan }: { proposal: AgentProposal<OutlinePayload, OutlineSummary>; plan: OutlineLessonPlan[] }) {
  const { document: doc } = useDraft();
  const { objectives, modules } = proposal.payload;
  const lessons = modules.flatMap((m) => m.lessons);
  const totalMin = lessons.reduce((s, l) => s + (l.estimatedMinutes || 0), 0);
  const byId = new Map(plan.map((p) => [p.lessonId, p]));
  const hasCurrent = doc.modules.some((m) => m.lessons.length > 0);
  const kept = plan.filter((p) => p.status === 'kept' || p.status === 'retitled').length;
  const added = plan.filter((p) => p.status === 'new').length;
  const removed = plan.filter((p) => p.status === 'removed' || p.status === 'contentLost');
  const lostScenes = removed.reduce((a, p) => a + p.sceneCount, 0);
  return (
    <div className="space-y-8" data-testid="outline-proposal">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ai"><Sparkles className="h-3 w-3" aria-hidden="true" /> Proposta da IA</Badge>
          {proposal.status === 'conflict' && <Badge tone="warning">a estrutura mudou depois desta proposta</Badge>}
        </div>
        <h2 className="font-display text-2xl font-bold">Proposta de estrutura</h2>
        <p className="text-sm text-fg-muted">
          {objectives.length} {objectives.length === 1 ? 'objetivo' : 'objetivos'}, {modules.length} {modules.length === 1 ? 'módulo' : 'módulos'}, {lessons.length} {lessons.length === 1 ? 'aula' : 'aulas'}, cerca de {totalMin} min no total.
        </p>
        {hasCurrent && (
          <p className="text-sm text-fg-muted" data-testid="outline-plan-line">
            Em relação a hoje: {plural(kept, 'aula continua', 'aulas continuam')}, {plural(added, 'nova')}, {plural(removed.length, 'removida')}
            {lostScenes > 0 ? <span className="text-danger"> ({plural(lostScenes, 'cena')} {lostScenes === 1 ? 'seria perdida' : 'seriam perdidas'})</span> : removed.length > 0 ? ' (sem cenas)' : ''}.
          </p>
        )}
        {proposal.rationale && <p className="max-w-prose text-sm text-fg-muted">{proposal.rationale}</p>}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-fg">Ao terminar, a pessoa consegue</h3>
        <ol className="space-y-2">
          {objectives.map((o, i) => (
            <li key={o.id} className="flex gap-4 rounded-xl border border-line bg-bg-2 p-4 text-sm">
              <span className="font-display text-xl font-bold leading-none text-accent tabular-nums">{i + 1}</span>
              <div className="space-y-1">
                <p className="font-medium text-fg">{o.title}</p>
                {o.criterion && <p className="text-fg-muted">Como saber: {o.criterion}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={cn('grid gap-4', hasCurrent && 'lg:grid-cols-2')} aria-label="Comparação entre a estrutura atual e a proposta" data-testid="outline-compare">
        {hasCurrent && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold">Hoje</h3>
            {doc.modules.map((m, mi) => (
              <div key={m.id} className="space-y-2">
                <p className="text-sm font-medium text-fg-muted">Módulo {mi + 1}: {m.title}</p>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2">
                  {m.lessons.map((l, li) => {
                    const p = byId.get(l.id);
                    const gone = p?.status === 'removed' || p?.status === 'contentLost';
                    const mark = p ? planMark(p) : null;
                    return (
                      <li key={l.id} className={cn('flex flex-wrap items-center justify-between gap-2 p-3 text-sm', gone && 'bg-danger-soft/40')} data-testid={`outline-current-${l.id}`} data-status={p?.status}>
                        <span className={cn('font-medium', gone ? 'text-fg-muted line-through decoration-danger/60' : 'text-fg')}>{li + 1}. {l.title}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-fg-faint tabular-nums">{plural(visibleScenes(l), 'cena')}</span>
                          {gone && mark && <Badge tone={mark.tone}>{mark.label}</Badge>}
                        </span>
                      </li>
                    );
                  })}
                  {m.lessons.length === 0 && <li className="p-3 text-sm text-fg-muted">Sem aulas.</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {hasCurrent && <h3 className="font-display text-lg font-bold">Proposta</h3>}
          {modules.map((m, mi) => (
            <section key={m.id} className="space-y-2">
              <div>
                <p className={cn(hasCurrent ? 'text-sm font-medium text-fg-muted' : 'font-display text-xl font-bold')}>Módulo {mi + 1}: {m.title}</p>
                {m.description && !hasCurrent && <p className="text-sm text-fg-muted">{m.description}</p>}
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2">
                {m.lessons.map((l, li) => {
                  const p = byId.get(l.id);
                  const mark = p && hasCurrent ? planMark(p) : null;
                  return (
                    <li key={l.id} className="space-y-2 p-3 sm:p-4" data-testid={`outline-proposed-${l.id}`} data-status={p?.status}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-fg">
                          {li + 1}. {l.title}
                          {p?.previousTitle && <span className="block text-xs font-normal text-fg-faint">antes: {p.previousTitle}</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {mark && <Badge tone={mark.tone}>{mark.label}</Badge>}
                          <Badge tone="brand">{EXPERIENCE_FAMILY_LABELS[l.family] ?? l.family}</Badge>
                          <span className="text-xs text-fg-faint tabular-nums">{l.estimatedMinutes} min</span>
                        </div>
                      </div>
                      {l.description && <p className="text-sm text-fg-muted">{l.description}</p>}
                      {l.rationale && (
                        <p className="text-sm text-fg-muted">
                          <span className="font-medium text-fg">Por que essa dinâmica: </span>
                          {l.rationale}
                        </p>
                      )}
                      {l.keyScenes?.length > 0 && (
                        <div className="text-sm">
                          <p className="font-medium text-fg">Cenas principais</p>
                          <ul className="list-disc pl-5 text-fg-muted">
                            {l.keyScenes.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edição da estrutura                                                 */
/* ------------------------------------------------------------------ */

function ObjectivesEditor({ objectives }: { objectives: Objective[] }) {
  const { update } = useDraft();
  const [newTitle, setNewTitle] = React.useState('');
  const setObjective = (id: string, patch: Partial<Objective>, coalesce?: string) =>
    update((d) => ({ ...d, objectives: d.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), coalesce ? { coalesce } : undefined);
  const remove = (id: string) => {
    if (!window.confirm('Remover este objetivo? As aulas ligadas a ele perdem a referência.')) return;
    update((d) => ({
      ...d,
      objectives: d.objectives.filter((o) => o.id !== id),
      modules: d.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({
          ...l,
          objectiveIds: l.objectiveIds.filter((x) => x !== id),
          graph: { ...l.graph, nodes: l.graph.nodes.map((n) => ({ ...n, objectiveIds: n.objectiveIds.filter((x) => x !== id) })) },
        })),
      })),
    }));
  };
  return (
    <section className="space-y-4" aria-labelledby="objetivos-title">
      <div>
        <h2 id="objetivos-title" className="font-display text-xl font-bold">Ao terminar, a pessoa consegue</h2>
        <p className="text-sm text-fg-muted">Um objetivo por linha, sempre algo observável. As aulas se ligam a eles.</p>
      </div>
      {objectives.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-fg-muted">Nenhum objetivo ainda. Escreva o primeiro abaixo.</p>}
      <ol className="space-y-2" data-testid="objective-list">
        {objectives.map((o, idx) => (
          <li key={o.id} className="grid gap-3 rounded-xl border border-line bg-bg-2 p-3 sm:grid-cols-[auto_1fr_auto]" data-testid={`objective-${o.id}`}>
            <span className="pt-2.5 font-display text-xl font-bold leading-none text-accent tabular-nums">{idx + 1}</span>
            <div className="space-y-2">
              <Input aria-label={`Objetivo ${idx + 1}`} value={o.title} maxLength={200} onChange={(e) => setObjective(o.id, { title: e.target.value }, `obj.title.${o.id}`)} />
              <Input aria-label={`Como saber que o objetivo ${idx + 1} foi alcançado`} placeholder="Como saber que aprendeu (ex.: resolve a reclamação em até 3 min)" value={o.criterion} maxLength={500} onChange={(e) => setObjective(o.id, { criterion: e.target.value }, `obj.crit.${o.id}`)} />
              <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg-muted">
                <Checkbox checked={o.required} onChange={(e) => setObjective(o.id, { required: e.target.checked })} />
                Obrigatório para concluir o curso
              </label>
            </div>
            <RowActions
              label={`objetivo ${idx + 1}`}
              canUp={idx > 0}
              canDown={idx < objectives.length - 1}
              onUp={() => update((d) => ({ ...d, objectives: moveItem(d.objectives, idx, -1) }))}
              onDown={() => update((d) => ({ ...d, objectives: moveItem(d.objectives, idx, 1) }))}
              onRemove={() => remove(o.id)}
            />
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const t = newTitle.trim();
          if (!t) return;
          update((d) => ({ ...d, objectives: [...d.objectives, createObjective(t, new Set(d.objectives.map((o) => o.id)))] }));
          setNewTitle('');
        }}
      >
        <label htmlFor="new-objective" className="sr-only">Novo objetivo</label>
        <Input id="new-objective" placeholder="Ex.: Negociar um prazo com o gestor" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!newTitle.trim()} data-testid="add-objective">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar objetivo
        </Button>
      </form>
    </section>
  );
}

/**
 * Aula adicionada à mão depois de uma estrutura: entra em `requiredLessonIds`
 * quando a lista já é usada (lista vazia = todas as aulas contam), para o aluno
 * não concluir o curso sem ela.
 */
export function addLessonToModule(d: CourseDocument, moduleId: string, lesson: Lesson): CourseDocument {
  const required = d.completion.requiredLessonIds;
  return {
    ...d,
    modules: d.modules.map((x) => (x.id === moduleId ? { ...x, lessons: [...x.lessons, lesson] } : x)),
    completion: { requiredLessonIds: required.length > 0 && !required.includes(lesson.id) ? [...required, lesson.id] : required },
  };
}

function ModulesEditor({ modules, objectives }: { modules: Module[]; objectives: Objective[] }) {
  const { update } = useDraft();
  const [newModule, setNewModule] = React.useState('');
  const setModule = (id: string, fn: (m: Module) => Module, coalesce?: string) =>
    update((d) => ({ ...d, modules: d.modules.map((m) => (m.id === id ? fn(m) : m)) }), coalesce ? { coalesce } : undefined);
  const removeModule = (m: Module) => {
    const msg = m.lessons.length ? `Remover o módulo "${m.title}" e suas ${m.lessons.length} aula(s)?` : `Remover o módulo "${m.title}"?`;
    if (!window.confirm(msg)) return;
    const ids = new Set(m.lessons.map((l) => l.id));
    update((d) => ({ ...d, modules: d.modules.filter((x) => x.id !== m.id), completion: { requiredLessonIds: d.completion.requiredLessonIds.filter((id) => !ids.has(id)) } }));
  };
  return (
    <section className="space-y-4" aria-labelledby="modulos-title">
      <div>
        <h2 id="modulos-title" className="font-display text-xl font-bold">Módulos e aulas</h2>
        <p className="text-sm text-fg-muted">Na ordem em que o aluno vê. Cada aula ganha cenas no passo "Aulas".</p>
      </div>
      <ol className="space-y-4" data-testid="module-list">
        {modules.map((m, mi) => (
          <li key={m.id} className="overflow-hidden rounded-xl border border-line bg-bg-2" data-testid={`module-${m.id}`}>
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <span className="block text-xs font-medium text-fg-faint">Módulo {mi + 1}</span>
                <Input aria-label={`Nome do módulo ${mi + 1}`} value={m.title} maxLength={160} className="font-display text-base" onChange={(e) => setModule(m.id, (x) => ({ ...x, title: e.target.value }), `mod.title.${m.id}`)} />
                <Input aria-label={`Descrição do módulo ${mi + 1}`} placeholder="Uma linha sobre o que este módulo cobre (opcional)" value={m.description} maxLength={1000} onChange={(e) => setModule(m.id, (x) => ({ ...x, description: e.target.value }), `mod.desc.${m.id}`)} />
              </div>
              <RowActions
                label={`módulo ${mi + 1}`}
                canUp={mi > 0}
                canDown={mi < modules.length - 1}
                onUp={() => update((d) => ({ ...d, modules: moveItem(d.modules, mi, -1) }))}
                onDown={() => update((d) => ({ ...d, modules: moveItem(d.modules, mi, 1) }))}
                onRemove={() => removeModule(m)}
              />
            </div>
            <ol className="divide-y divide-line">
              {m.lessons.map((l, li) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  index={li}
                  count={m.lessons.length}
                  objectives={objectives}
                  onChange={(fn, coalesce) => setModule(m.id, (x) => ({ ...x, lessons: x.lessons.map((y) => (y.id === l.id ? fn(y) : y)) }), coalesce)}
                  onMove={(delta) => setModule(m.id, (x) => ({ ...x, lessons: moveItem(x.lessons, li, delta) }))}
                  onRemove={() => {
                    if (!window.confirm(`Remover a aula "${l.title}" e todas as suas cenas?`)) return;
                    update((d) => ({
                      ...d,
                      modules: d.modules.map((x) => (x.id === m.id ? { ...x, lessons: x.lessons.filter((y) => y.id !== l.id) } : x)),
                      completion: { requiredLessonIds: d.completion.requiredLessonIds.filter((id) => id !== l.id) },
                    }));
                  }}
                />
              ))}
              {m.lessons.length === 0 && <li className="px-4 py-3 text-sm text-fg-muted">Este módulo ainda não tem aulas.</li>}
            </ol>
            <AddInline id={`new-lesson-${m.id}`} placeholder="Nome da nova aula" cta="Adicionar aula" testId={`add-lesson-${m.id}`} onAdd={(t) => update((d) => addLessonToModule(d, m.id, createLesson(t)))} />
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const t = newModule.trim();
          if (!t) return;
          update((d) => ({ ...d, modules: [...d.modules, createModule(t)] }));
          setNewModule('');
        }}
      >
        <label htmlFor="new-module" className="sr-only">Nome do novo módulo</label>
        <Input id="new-module" placeholder="Nome do novo módulo" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!newModule.trim()} data-testid="add-module">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar módulo
        </Button>
      </form>
    </section>
  );
}

function AddInline({ id, placeholder, cta, testId, onAdd }: { id: string; placeholder: string; cta: string; testId: string; onAdd: (t: string) => void }) {
  const [v, setV] = React.useState('');
  return (
    <form
      className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const t = v.trim();
        if (!t) return;
        onAdd(t);
        setV('');
      }}
    >
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <Input id={id} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="submit" variant="ghost" size="sm" disabled={!v.trim()} data-testid={testId}>
        <Plus className="h-4 w-4" aria-hidden="true" /> {cta}
      </Button>
    </form>
  );
}

function LessonRow({
  lesson,
  index,
  count,
  objectives,
  onChange,
  onMove,
  onRemove,
}: {
  lesson: Lesson;
  index: number;
  count: number;
  objectives: Objective[];
  onChange: (fn: (l: Lesson) => Lesson, coalesce?: string) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = `lesson-more-${lesson.id}`;
  const scenes = visibleScenes(lesson);
  return (
    <li className="space-y-2 p-3" data-testid={`lesson-${lesson.id}`}>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <span className="pt-2.5 text-sm font-semibold text-fg-faint tabular-nums">{index + 1}</span>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input aria-label={`Nome da aula ${index + 1}`} value={lesson.title} maxLength={160} onChange={(e) => onChange((l) => ({ ...l, title: e.target.value }), `lesson.title.${lesson.id}`)} />
          <div className="flex items-center gap-2">
            <label htmlFor={`min-${lesson.id}`} className="sr-only">Minutos</label>
            <Input
              id={`min-${lesson.id}`}
              type="number"
              min={1}
              max={600}
              className="w-20 tabular-nums"
              value={lesson.estimatedMinutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1 && v <= 600) onChange((l) => ({ ...l, estimatedMinutes: v }), `lesson.min.${lesson.id}`);
              }}
            />
            <span className="text-sm text-fg-muted">min</span>
          </div>
          <label htmlFor={`fam-${lesson.id}`} className="sr-only">Dinâmica da aula</label>
          <Select id={`fam-${lesson.id}`} className="text-sm sm:col-span-2" value={lesson.family} onChange={(e) => onChange((l) => ({ ...l, family: e.target.value as Lesson['family'] }))}>
            {EXPERIENCE_FAMILIES.map((f) => (
              <option key={f} value={f}>{EXPERIENCE_FAMILY_LABELS[f]}</option>
            ))}
          </Select>
        </div>
        <RowActions label={`aula ${index + 1}`} canUp={index > 0} canDown={index < count - 1} onUp={() => onMove(-1)} onDown={() => onMove(1)} onRemove={onRemove} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar descrição e objetivos' : 'Descrição e objetivos'}
        </button>
        {scenes > 0 && <span className="text-xs text-fg-faint tabular-nums">{plural(scenes, 'cena')} escrita{scenes === 1 ? '' : 's'}</span>}
        {lesson.keyScenes?.length ? <span className="text-xs text-fg-faint">{plural(lesson.keyScenes.length, 'cena prevista', 'cenas previstas')}</span> : null}
      </div>
      <div id={panelId} className={cn('space-y-3 pl-5', !open && 'hidden')}>
        <Textarea aria-label="Descrição da aula" rows={2} maxLength={1000} placeholder="Em uma linha, o que acontece nesta aula" value={lesson.description} onChange={(e) => onChange((l) => ({ ...l, description: e.target.value }), `lesson.desc.${lesson.id}`)} />
        {lesson.rationale && (
          <p className="text-sm text-fg-muted" data-testid={`lesson-rationale-${lesson.id}`}>
            <span className="font-medium text-fg">Por que essa dinâmica: </span>
            {lesson.rationale}
          </p>
        )}
        {lesson.keyScenes?.length ? (
          <div className="text-sm" data-testid={`lesson-keyscenes-${lesson.id}`}>
            <p className="font-medium text-fg">Cenas previstas (a IA escreve a aula a partir delas)</p>
            <ol className="list-decimal pl-5 text-fg-muted">
              {lesson.keyScenes.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ) : null}
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-fg">Objetivos trabalhados</legend>
          {objectives.length === 0 ? (
            <p className="text-sm text-fg-muted">Escreva objetivos acima para ligá-los à aula.</p>
          ) : (
            <ul className="space-y-1">
              {objectives.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg">
                    <Checkbox checked={lesson.objectiveIds.includes(o.id)} onChange={(e) => onChange((l) => ({ ...l, objectiveIds: e.target.checked ? [...l.objectiveIds, o.id] : l.objectiveIds.filter((x) => x !== o.id) }))} />
                    {o.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
    </li>
  );
}

function RowActions({ label, canUp, canDown, onUp, onDown, onRemove }: { label: string; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1 sm:flex-col">
      <Button variant="ghost" size="icon" aria-label={`Mover ${label} para cima`} disabled={!canUp} onClick={onUp}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Mover ${label} para baixo`} disabled={!canDown} onClick={onDown}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Remover ${label}`} className="text-danger hover:text-danger" onClick={onRemove}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

'use client';

import * as React from 'react';
import type { LessonGraph, SceneDirection } from '@lms/course-schema';
import type { RevisionFocus } from '@lms/ai/client';
import { api, ApiError } from '@/lib/api';
import { useDraft } from '@/components/studio/draft-provider';
import { errorText } from './use-media-jobs';

/* ------------------------------------------------------------------ */
/* Tipos públicos da API do agente                                     */
/* ------------------------------------------------------------------ */

export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type AgentTask = 'lesson' | 'revise_lesson' | 'scene_variations' | 'scene_direction' | string;

/** tarefas do agente que este hook acompanha numa aula */
const LESSON_TASKS: ReadonlySet<string> = new Set(['lesson', 'revise_lesson', 'scene_variations', 'scene_direction']);

/** Execução na fila há mais que isto sem o worker a reivindicar: "o worker não responde". */
export const QUEUED_STALL_SECONDS = 120;

export interface AgentRun {
  id: string;
  task: AgentTask;
  lessonId: string | null;
  status: AgentRunStatus;
  provider: string;
  model: string;
  error: string | null;
  proposalId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LessonIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export interface ReviseSummary {
  changed?: number;
  added?: number;
  removed?: number;
  unchanged?: number;
  focus?: RevisionFocus;
  errors?: number;
  warnings?: number;
  hasErrors?: boolean;
  conversionWarnings?: string[];
  /** geração: cenas/vídeos da aula atual que a proposta substitui */
  replacesScenes?: number;
  replacesMedia?: number;
}

export interface LessonGraphPayload {
  lessonId: string;
  graph: LessonGraph;
  /** ainda há erros de estrutura depois dos reparos: aplicar exige `acceptErrors` */
  hasErrors?: boolean;
  issues?: { errors: LessonIssue[]; warnings: LessonIssue[] };
  /** revisão restrita: só estas cenas entram sobre a aula atual */
  nodeIds?: string[];
}

export interface VariationsSummary {
  nodeId: string;
  nodeType?: string;
  variations?: number;
  labels?: string[];
  warnings?: number;
  conversionWarnings?: string[];
}

export interface DirectionSummary {
  scenes?: number;
  shots?: number;
  slides?: number;
  cameras?: number;
  warnings?: number;
  conversionWarnings?: string[];
  /** cenas-alvo cuja direção atual foi ajustada pelo autor (o servidor pode informar; senão calculamos do rascunho) */
  authoredTargets?: string[];
}

export type AgentProposal =
  | { id: string; runId: string; kind: 'revise_lesson' | 'lesson'; lessonId: string | null; baseRevision: number; status: string; rationale: string; summary: ReviseSummary; payload: LessonGraphPayload }
  | {
      id: string;
      runId: string;
      kind: 'scene_variations';
      lessonId: string | null;
      baseRevision: number;
      status: string;
      rationale: string;
      summary: VariationsSummary;
      payload: { lessonId: string; nodeId: string; variations: { label: string; graph: LessonGraph }[] };
    }
  | {
      id: string;
      runId: string;
      kind: 'scene_direction';
      lessonId: string | null;
      baseRevision: number;
      status: string;
      rationale: string;
      summary: DirectionSummary;
      payload: { lessonId: string; scenes: { nodeId: string; direction: SceneDirection }[] };
    };

export const ACTIVE_RUN: ReadonlySet<AgentRunStatus> = new Set(['queued', 'running']);
const POLL_MS = 3000;

/** Erro de aplicação com conflito: a aula mudou depois da proposta; dá para forçar. */
export function isConflict(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409 && !!(e.details as { conflict?: boolean } | undefined)?.conflict;
}

/** 409 porque a proposta ainda tem erros de estrutura; dá para aplicar com `acceptErrors`. */
export function hasErrorsRefusal(e: unknown): LessonIssue[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = e.details as { hasErrors?: boolean; errors?: LessonIssue[] } | undefined;
  return d?.hasErrors ? (d.errors ?? []) : null;
}

/** true quando a execução está na fila há mais de QUEUED_STALL_SECONDS (o worker não a reivindicou). */
export function isStalledRun(run: Pick<AgentRun, 'status' | 'createdAt'>, now = Date.now()): boolean {
  return run.status === 'queued' && now - new Date(run.createdAt).getTime() >= QUEUED_STALL_SECONDS * 1000;
}

/** Direção: nada foi aplicado porque todas as cenas-alvo foram ajustadas pelo autor; dá para pedir `overwriteAuthored`. */
export function authoredConflict(e: unknown): { skippedAuthored: string[]; skippedMismatch: string[] } | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = e.details as { authoredConflict?: boolean; skippedAuthored?: string[]; skippedMismatch?: string[] } | undefined;
  if (!d?.authoredConflict) return null;
  return { skippedAuthored: d.skippedAuthored ?? [], skippedMismatch: d.skippedMismatch ?? [] };
}

/** Resposta de POST /api/agent-proposals/[id]/apply (direção traz as cenas puladas). */
export interface ApplyResult {
  revision: number;
  skippedAuthored?: string[];
  skippedMismatch?: string[];
}

/**
 * Execuções do agente para UMA aula: revisão da aula inteira, variações de
 * cena e direção cinematográfica. Carrega o histórico ao montar (para retomar o que estava em andamento
 * ou ainda não foi decidido), consulta as ativas a cada 3 s e traz a proposta
 * quando uma termina. Nada é aplicado sem o autor clicar.
 */
export function useAgentRuns(courseId: string, lessonId: string) {
  const { revision, reload } = useDraft();
  const [runs, setRuns] = React.useState<AgentRun[]>([]);
  const [proposals, setProposals] = React.useState<Map<string, AgentProposal>>(() => new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** propostas descartadas/aplicadas nesta sessão (somem da tela sem esperar a lista) */
  const [settled, setSettled] = React.useState<Set<string>>(() => new Set());
  const fetchedRef = React.useRef<Set<string>>(new Set());

  const upsertRun = React.useCallback((run: AgentRun) => {
    setRuns((prev) => {
      const rest = prev.filter((r) => r.id !== run.id);
      return [run, ...rest].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });
  }, []);

  const loadProposal = React.useCallback(async (proposalId: string) => {
    if (fetchedRef.current.has(proposalId)) return;
    fetchedRef.current.add(proposalId);
    try {
      const r = await api<{ proposal: AgentProposal }>(`/api/agent-proposals/${proposalId}`);
      setProposals((prev) => new Map(prev).set(proposalId, r.proposal));
    } catch (e) {
      fetchedRef.current.delete(proposalId);
      setError(errorText(e, 'Não foi possível carregar a proposta'));
    }
  }, []);

  // Histórico ao montar: retoma runs ativas e propostas ainda não decididas.
  React.useEffect(() => {
    let cancelled = false;
    api<{ runs: AgentRun[] }>(`/api/courses/${courseId}/agent/runs`)
      .then((r) => {
        if (cancelled) return;
        const mine = r.runs.filter((x) => x.lessonId === lessonId && LESSON_TASKS.has(x.task));
        setRuns(mine);
        for (const x of mine) if (x.status === 'succeeded' && x.proposalId) void loadProposal(x.proposalId);
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e, 'Não foi possível consultar as revisões da IA'));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId, loadProposal]);

  // Consulta as ativas a cada 3 s.
  const activeIds = runs.filter((r) => ACTIVE_RUN.has(r.status)).map((r) => r.id).join(',');
  React.useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(',');
    const tick = async () => {
      for (const id of ids) {
        try {
          const r = await api<{ run: AgentRun }>(`/api/agent-runs/${id}`);
          upsertRun(r.run);
          if (r.run.status === 'succeeded' && r.run.proposalId) void loadProposal(r.run.proposalId);
        } catch (e) {
          setError(errorText(e, 'Não foi possível consultar a execução'));
        }
      }
    };
    const t = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(t);
  }, [activeIds, upsertRun, loadProposal]);

  const activeRuns = runs.filter((r) => ACTIVE_RUN.has(r.status));
  const hasActive = activeRuns.length > 0;
  const failedRun = runs.find((r) => r.status === 'failed' && !settled.has(r.id));

  /** propostas abertas (status 'proposed'), já com o run correspondente */
  const open = React.useMemo(() => {
    const list: AgentProposal[] = [];
    for (const r of runs) {
      if (r.status !== 'succeeded' || !r.proposalId || settled.has(r.proposalId)) continue;
      const p = proposals.get(r.proposalId);
      if (p && p.status === 'proposed') list.push(p);
    }
    return list;
  }, [runs, proposals, settled]);
  /** proposta de aula inteira aberta: revisão ou geração ("Gerar esta aula com IA") */
  const lessonProposal = open.find((p): p is Extract<AgentProposal, { kind: 'revise_lesson' | 'lesson' }> => p.kind === 'revise_lesson' || p.kind === 'lesson');
  const directionProposal = open.find((p): p is Extract<AgentProposal, { kind: 'scene_direction' }> => p.kind === 'scene_direction');
  /** cenas cobertas pela proposta de direção aberta */
  const directionNodeIds = React.useMemo(() => new Set(directionProposal?.payload.scenes.map((s) => s.nodeId) ?? []), [directionProposal]);
  const variationsByNode = React.useMemo(() => {
    const m = new Map<string, Extract<AgentProposal, { kind: 'scene_variations' }>>();
    for (const p of open) if (p.kind === 'scene_variations' && !m.has(p.payload.nodeId)) m.set(p.payload.nodeId, p);
    return m;
  }, [open]);

  const startRevise = React.useCallback(
    async (body: { focus?: RevisionFocus; instruction?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ run: AgentRun }>(`/api/courses/${courseId}/agent/lessons/${lessonId}/revise`, { json: body });
        upsertRun(r.run);
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma revisão em andamento para esta aula.' : errorText(e, 'Não foi possível pedir a revisão'));
      } finally {
        setBusy(false);
      }
    },
    [courseId, lessonId, upsertRun],
  );

  const startVariations = React.useCallback(
    async (nodeId: string, instruction?: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ run: AgentRun }>(`/api/courses/${courseId}/agent/lessons/${lessonId}/nodes/${nodeId}/variations`, { json: instruction ? { instruction } : {} });
        upsertRun(r.run);
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma execução da IA em andamento para esta aula.' : errorText(e, 'Não foi possível pedir as variações'));
      } finally {
        setBusy(false);
      }
    },
    [courseId, lessonId, upsertRun],
  );

  /** "Gerar esta aula com IA": mesma rota do wizard (uma execução para esta aula). */
  const startGenerate = React.useCallback(
    async (instruction?: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ runs: Array<{ id: string; lessonId: string }>; skipped: Array<{ lessonId: string; reason: string }> }>(`/api/courses/${courseId}/agent/lessons`, { json: { lessonIds: [lessonId], ...(instruction ? { instruction } : {}) } });
        const created = r.runs[0];
        if (created) {
          const run = await api<{ run: AgentRun }>(`/api/agent-runs/${created.id}`);
          upsertRun(run.run);
        } else setError('Já existe uma execução da IA em andamento para esta aula.');
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma execução da IA em andamento para esta aula.' : errorText(e, 'Não foi possível pedir a geração'));
      } finally {
        setBusy(false);
      }
    },
    [courseId, lessonId, upsertRun],
  );

  /** Cancela uma execução presa (fila ou em andamento). */
  const cancel = React.useCallback(
    async (runId: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ run: AgentRun }>(`/api/agent-runs/${runId}/cancel`, { method: 'POST' });
        upsertRun(r.run);
      } catch (e) {
        setError(errorText(e, 'Não foi possível cancelar a execução'));
      } finally {
        setBusy(false);
      }
    },
    [upsertRun],
  );

  /** Pede à IA a direção (planos) das cenas indicadas, ou de todas as cenas com vídeo. */
  const startDirection = React.useCallback(
    async (body: { nodeIds?: string[]; instruction?: string } = {}) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ run: AgentRun }>(`/api/courses/${courseId}/agent/lessons/${lessonId}/direction`, { json: body });
        upsertRun(r.run);
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma execução da IA em andamento para esta aula.' : errorText(e, 'Não foi possível pedir a direção'));
      } finally {
        setBusy(false);
      }
    },
    [courseId, lessonId, upsertRun],
  );

  /**
   * Aplica a proposta com a revisão atual do rascunho. Lança o erro para quem
   * chamou decidir (conflito → oferecer "Aplicar mesmo assim").
   */
  const apply = React.useCallback(
    async (proposalId: string, opts: { choice?: number; force?: boolean; overwriteAuthored?: boolean; acceptErrors?: boolean } = {}): Promise<ApplyResult> => {
      setBusy(true);
      setError(null);
      try {
        // overwriteAuthored (direção): substituir também as cenas "Ajustada por você" (padrão: puladas e devolvidas em skippedAuthored)
        // acceptErrors (aula): aplicar uma proposta que ainda tem erros de estrutura
        const r = await api<ApplyResult>(`/api/agent-proposals/${proposalId}/apply`, {
          json: { expectedRevision: revision, force: opts.force, choice: opts.choice, ...(opts.overwriteAuthored !== undefined ? { overwriteAuthored: opts.overwriteAuthored } : {}), ...(opts.acceptErrors ? { acceptErrors: true } : {}) },
        });
        setSettled((prev) => new Set(prev).add(proposalId));
        await reload();
        return r;
      } finally {
        setBusy(false);
      }
    },
    [revision, reload],
  );

  const reject = React.useCallback(async (proposalId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/agent-proposals/${proposalId}/reject`, { method: 'POST' });
      setSettled((prev) => new Set(prev).add(proposalId));
    } catch (e) {
      setError(errorText(e, 'Não foi possível descartar a proposta'));
    } finally {
      setBusy(false);
    }
  }, []);

  const dismissFailed = React.useCallback((runId: string) => setSettled((prev) => new Set(prev).add(runId)), []);

  return {
    runs,
    activeRuns,
    hasActive,
    failedRun,
    lessonProposal,
    variationsByNode,
    directionProposal,
    directionNodeIds,
    busy,
    error,
    startRevise,
    startVariations,
    startDirection,
    startGenerate,
    cancel,
    apply,
    reject,
    dismissFailed,
    clearError: () => setError(null),
  };
}

export type AgentRunsApi = ReturnType<typeof useAgentRuns>;

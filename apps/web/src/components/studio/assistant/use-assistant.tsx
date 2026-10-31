'use client';

import * as React from 'react';
import type { AssistantAction, AssistantContext } from '@lms/ai/client';
import type { RevisionFocus } from '@lms/ai/client';
import type { AgentRunStatus } from '@/components/studio/storyboard/use-agent-runs';

/**
 * Contratos e ganchos leves do assistente do estúdio. Fica separado do
 * provider (assistant-context.tsx) para que componentes em linha (chips de
 * prompt, escopos de página) não importem a lógica pesada de execução.
 */

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** cartões de ação devolvidos pelo assistente */
  actions?: AssistantAction[];
  /** resposta em modo de demonstração (sem provedor real) */
  simulated?: boolean;
  /** resposta que é, na verdade, um erro de comunicação */
  error?: boolean;
  context: AssistantContext;
}

export interface ActionOutcome {
  tone: 'success' | 'info' | 'error';
  message: string;
  href?: string;
  hrefLabel?: string;
  /** execução da IA acompanhada pelo assistente (fora do storyboard) */
  runId?: string;
}

/** Prévia do pedido de novo ângulo (primeira etapa, sem cobrança). */
export interface AnglePreview {
  prompt: string;
  note: string;
  simulated: boolean;
}

/** O que um pedido de vídeos vai gerar de fato (para a confirmação). */
export interface VideoPlan {
  nodeIds: string[];
  chars: number;
  summary: string;
  blocker: string | null;
  /** cenas pedidas que ficam de fora (já têm vídeo, sem fala ou não existem) */
  skipped: number;
}

export interface TrackedRun {
  id: string;
  lessonId: string | null;
  status: AgentRunStatus;
  proposalId: string | null;
  error: string | null;
}

/**
 * Ponte com o storyboard aberto: quando a aula da ação está na tela, os
 * pedidos à IA passam pelo mesmo hook (useAgentRuns) para a proposta aparecer
 * nos painéis de revisão de sempre.
 */
export interface LessonBridge {
  revise(body: { focus?: RevisionFocus; instruction?: string }): Promise<void>;
  direct(body: { nodeIds?: string[]; instruction?: string }): Promise<void>;
  vary(nodeId: string): Promise<void>;
  jobsChanged(): Promise<void>;
  /** há execução da IA em andamento ou pedido sendo enviado */
  busy: boolean;
}

export interface AssistantCommands {
  ask(message: string, override?: Partial<AssistantContext>): Promise<void>;
  /** Executa um cartão de ação. Ações pagas exigem `confirmed: true` (dois cliques na interface). */
  runAction(action: AssistantAction, opts?: { confirmed?: boolean }): Promise<ActionOutcome | null>;
  previewAngle(action: Extract<AssistantAction, { kind: 'generate_angle' }>): Promise<AnglePreview>;
  planVideos(action: Extract<AssistantAction, { kind: 'generate_videos' }>): VideoPlan;
  setOpen(open: boolean): void;
  toggle(): void;
  /** cena em foco no storyboard (null limpa) */
  focusNode(lessonId: string, nodeId: string | null): void;
  pushScope(id: string, ctx: AssistantContext | null): void;
  registerBridge(lessonId: string, get: () => LessonBridge): () => void;
  clearConversation(): void;
}

export interface AssistantState {
  courseId: string;
  context: AssistantContext;
  open: boolean;
  turns: AssistantTurn[];
  busy: boolean;
  /** último modo informado pelo assistente; null enquanto não houve resposta */
  simulated: boolean | null;
  runs: ReadonlyMap<string, TrackedRun>;
}

export const AssistantCommandsContext = React.createContext<AssistantCommands | null>(null);
export const AssistantStateContext = React.createContext<AssistantState | null>(null);

export function useAssistantCommands(): AssistantCommands | null {
  return React.useContext(AssistantCommandsContext);
}

export function useAssistantState(): AssistantState | null {
  return React.useContext(AssistantStateContext);
}

/** Estado + comandos; lança fora do <AssistantProvider>. */
export function useAssistant(): AssistantState & AssistantCommands {
  const state = React.useContext(AssistantStateContext);
  const cmds = React.useContext(AssistantCommandsContext);
  if (!state || !cmds) throw new Error('useAssistant precisa estar dentro de <AssistantProvider>');
  return React.useMemo(() => ({ ...state, ...cmds }), [state, cmds]);
}

/**
 * Define o contexto do assistente enquanto a página está montada. O escopo
 * mais recente vence; ao desmontar, volta ao anterior (ou ao contexto deduzido
 * da URL).
 */
export function AssistantScope({ context, children }: { context: AssistantContext; children?: React.ReactNode }) {
  const cmds = React.useContext(AssistantCommandsContext);
  const id = React.useId();
  const key = JSON.stringify(context);
  React.useEffect(() => {
    if (!cmds) return;
    cmds.pushScope(id, JSON.parse(key) as AssistantContext);
    return () => cmds.pushScope(id, null);
  }, [cmds, id, key]);
  return <>{children}</>;
}

/** Liga o storyboard aberto ao assistente (ver LessonBridge). */
export function useAssistantLessonBridge(lessonId: string, bridge: LessonBridge) {
  const cmds = React.useContext(AssistantCommandsContext);
  const ref = React.useRef(bridge);
  ref.current = bridge;
  React.useEffect(() => cmds?.registerBridge(lessonId, () => ref.current), [cmds, lessonId]);
}

const noop = () => undefined;

/** Marca a cena em foco (para o contexto "Cena: …"). Sem provider, não faz nada. */
export function useAssistantFocus(): (lessonId: string, nodeId: string | null) => void {
  const cmds = React.useContext(AssistantCommandsContext);
  return cmds?.focusNode ?? noop;
}

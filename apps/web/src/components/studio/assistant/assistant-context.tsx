'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { findLesson, type AnyNode, type Camera, type Presentation, type WizardStep } from '@lms/course-schema';
import { REVISION_FOCUS, assistantHistoryText, type AssistantAction, type AssistantContext, type AssistantReply, type RevisionFocus } from '@lms/ai/client';
import { api, ApiError } from '@/lib/api';
import { useDraft } from '@/components/studio/draft-provider';
import { nodeMedia, nodeSupportsMedia } from '@/components/studio/graph-ops';
import { useSharedMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { presentationBlocker, presentationSummary, requestSceneVideo } from '@/components/studio/storyboard/generate';
import { nodeNarration, spokenScript } from '@/components/studio/storyboard/narration-fields';
import { errorText } from '@/components/studio/storyboard/use-media-jobs';
import { ACTIVE_RUN, type AgentRun } from '@/components/studio/storyboard/use-agent-runs';
import { ANGLE_LABEL, FRAMING_LABEL, MAX_CAMERAS, newCameraId } from '@/components/studio/direction/direction-model';
import {
  AssistantCommandsContext,
  AssistantStateContext,
  type ActionOutcome,
  type AnglePreview,
  type AssistantCommands,
  type AssistantState,
  type AssistantTurn,
  type LessonBridge,
  type TrackedRun,
  type VideoPlan,
} from './use-assistant';

export * from './use-assistant';

/** Conversa da sessão: últimas 10 trocas (pergunta + resposta). */
const MAX_MESSAGES = 20;
/** O contrato aceita até 10 mensagens de histórico. */
const MAX_HISTORY = 10;
const RUN_POLL_MS = 3000;
const LOOK_POLL_MS = 5000;

type AssistantResponse = AssistantReply & { meta?: { provider?: string; simulated?: boolean } };

let seq = 0;
const newTurnId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Contexto deduzido da URL quando a página não declarou um <AssistantScope>. */
function contextFromPath(pathname: string | null, step: WizardStep): AssistantContext {
  const m = /^\/estudio\/cursos\/[^/]+\/(aulas\/([^/]+)|montar|producao|revisao)/.exec(pathname ?? '');
  if (!m) return { screen: 'course' };
  if (m[2]) return { screen: 'storyboard', lessonId: decodeURIComponent(m[2]) };
  if (m[1] === 'montar') return { screen: 'wizard', step };
  if (m[1] === 'producao') return { screen: 'production' };
  return { screen: 'review' };
}

function clean(ctx: AssistantContext): AssistantContext {
  const out: AssistantContext = { screen: ctx.screen };
  if (ctx.step) out.step = ctx.step;
  if (ctx.lessonId) out.lessonId = ctx.lessonId;
  if (ctx.nodeId) out.nodeId = ctx.nodeId;
  return out;
}

function asFocus(f: string | undefined): RevisionFocus | undefined {
  return f && (REVISION_FOCUS as readonly string[]).includes(f) ? (f as RevisionFocus) : undefined;
}

function askErrorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return 'O assistente ainda não está disponível neste ambiente.';
  if (e instanceof ApiError && e.status >= 500) return 'O assistente teve um problema agora. Tente de novo em instantes.';
  if (e instanceof ApiError && e.status === 429) return e.message || 'Muitos pedidos seguidos. Espere um pouco e tente de novo.';
  return errorText(e, 'Não foi possível falar com o assistente agora.');
}

/** Abre o animatic de uma cena do storyboard na tela (o botão vive no painel de direção). */
function openAnimaticOnPage(nodeId: string): ActionOutcome {
  const card = document.getElementById(`scene-${nodeId}`);
  if (!card) return { tone: 'error', message: 'Não encontrei esta cena na aula.' };
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const btn = card.querySelector<HTMLButtonElement>('[data-testid="animatic-play"]');
  if (!btn) return { tone: 'info', message: 'Esta cena ainda não tem direção. Peça a direção para ver o animatic.' };
  if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
  return { tone: 'success', message: 'Animatic aberto na cena.' };
}

/**
 * Assistente do estúdio para um curso: guarda o contexto da tela, a conversa
 * da sessão e executa os cartões de ação. Ações de IA viram propostas
 * revisáveis; ações pagas só rodam com `confirmed: true` (a interface pede
 * dois cliques). Fica dentro do DraftProvider e do MediaQueueProvider.
 */
export function AssistantProvider({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const draft = useDraft();
  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const queue = useSharedMediaQueue();
  const queueRef = React.useRef(queue);
  queueRef.current = queue;
  const router = useRouter();
  const pathname = usePathname();

  const [scopes, setScopes] = React.useState<{ id: string; ctx: AssistantContext }[]>([]);
  const [focus, setFocus] = React.useState<{ lessonId: string; nodeId: string } | null>(null);
  const [open, setOpenState] = React.useState(false);
  const [turns, setTurns] = React.useState<AssistantTurn[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [simulated, setSimulated] = React.useState<boolean | null>(null);
  const [runs, setRuns] = React.useState<Map<string, TrackedRun>>(() => new Map());

  const turnsRef = React.useRef(turns);
  turnsRef.current = turns;
  const busyRef = React.useRef(false);
  const bridges = React.useRef(new Map<string, () => LessonBridge>());
  const pendingAnimatic = React.useRef<{ lessonId: string; nodeId: string } | null>(null);

  const step = draft.document.wizard.step;
  const base = React.useMemo(() => contextFromPath(pathname, step), [pathname, step]);
  const scoped = scopes[scopes.length - 1]?.ctx ?? base;
  const context = React.useMemo<AssistantContext>(() => {
    const c = clean(scoped);
    if (c.screen === 'storyboard' && c.lessonId && !c.nodeId && focus?.lessonId === c.lessonId) c.nodeId = focus.nodeId;
    return c;
  }, [scoped, focus]);
  const contextRef = React.useRef(context);
  contextRef.current = context;

  /* ---------------- conversa ---------------- */

  const ask = React.useCallback<AssistantCommands['ask']>(
    async (message, override) => {
      const text = message.trim().slice(0, 2000);
      if (!text || busyRef.current) return;
      const ctx = clean({ ...contextRef.current, ...override });
      if (override?.nodeId && ctx.lessonId) setFocus({ lessonId: ctx.lessonId, nodeId: override.nodeId });
      setOpenState(true);
      // respostas do assistente levam "[cartões: …]" no histórico: um "sim/pode/confirmo" curto confirma o cartão pago da vez anterior
      const history = turnsRef.current
        .filter((t) => !t.error)
        .slice(-MAX_HISTORY)
        .map((t) => ({ role: t.role, text: t.role === 'assistant' ? assistantHistoryText(t.text, t.actions ?? []) : t.text.slice(0, 2000) }));
      setTurns((prev) => [...prev, { id: newTurnId(), role: 'user' as const, text, context: ctx }].slice(-MAX_MESSAGES));
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await api<AssistantResponse>(`/api/courses/${courseId}/assistant`, { json: { message: text, context: ctx, history } });
        const sim = !!res.meta?.simulated;
        setSimulated(sim);
        setTurns((prev) =>
          [...prev, { id: newTurnId(), role: 'assistant' as const, text: res.reply, actions: res.actions ?? [], simulated: sim, context: ctx }].slice(-MAX_MESSAGES),
        );
      } catch (e) {
        setTurns((prev) => [...prev, { id: newTurnId(), role: 'assistant' as const, text: askErrorText(e), error: true, context: ctx }].slice(-MAX_MESSAGES));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [courseId],
  );

  /* ---------------- execuções da IA fora do storyboard ---------------- */

  const track = React.useCallback((run: AgentRun) => {
    setRuns((prev) => new Map(prev).set(run.id, { id: run.id, lessonId: run.lessonId, status: run.status, proposalId: run.proposalId, error: run.error }));
  }, []);

  const activeRunIds = [...runs.values()].filter((r) => ACTIVE_RUN.has(r.status)).map((r) => r.id).join(',');
  React.useEffect(() => {
    if (!activeRunIds) return;
    const ids = activeRunIds.split(',');
    const t = window.setInterval(() => {
      for (const id of ids) {
        api<{ run: AgentRun }>(`/api/agent-runs/${encodeURIComponent(id)}`)
          .then((r) => track(r.run))
          .catch(() => undefined);
      }
    }, RUN_POLL_MS);
    return () => window.clearInterval(t);
  }, [activeRunIds, track]);

  /* ---------------- ângulos gerados fora do kit de câmeras ---------------- */

  const cams = draft.document.presentation.cameras ?? [];
  const pendingLooks = cams
    .filter((c) => c.status === 'generating' && c.generationId)
    .map((c) => `${c.id}:${c.generationId}`)
    .join(',');
  // o próprio kit de câmeras consulta quando está na tela
  const kitVisible = /\/montar$/.test(pathname ?? '') && step === 'apresentacao';
  React.useEffect(() => {
    if (!pendingLooks || kitVisible) return;
    const pending = pendingLooks.split(',').map((x) => {
      const at = x.indexOf(':');
      return { id: x.slice(0, at), generationId: x.slice(at + 1) };
    });
    let cancelled = false;
    const setCameras = (fn: (list: Camera[]) => Camera[]) =>
      draftRef.current.update((d) => ({ ...d, presentation: { ...d.presentation, cameras: fn(d.presentation.cameras ?? []) } }));
    const tick = async () => {
      for (const { id, generationId } of pending) {
        try {
          const r = await api<{ status: 'pending' | 'processing' | 'completed' | 'failed'; lookId?: string; previewUrl?: string; error?: string }>(`/api/media/looks/${encodeURIComponent(generationId)}`);
          if (cancelled) return;
          if (r.status === 'completed' && r.lookId) {
            const lookId = r.lookId;
            setCameras((list) => list.map((c) => (c.id === id && c.status === 'generating' ? { ...c, status: 'ready', lookId, previewUrl: r.previewUrl ?? c.previewUrl, generationError: undefined } : c)));
          } else if (r.status === 'failed') {
            setCameras((list) => list.map((c) => (c.id === id && c.status === 'generating' ? { ...c, status: 'failed', generationError: (r.error ?? 'A geração falhou no provedor').slice(0, 500) } : c)));
          }
        } catch {
          /* tenta de novo no próximo ciclo */
        }
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), LOOK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [pendingLooks, kitVisible]);

  /* ---------------- ações ---------------- */

  const lessonHref = React.useCallback((lessonId: string) => `/estudio/cursos/${courseId}/aulas/${encodeURIComponent(lessonId)}`, [courseId]);

  const planVideos = React.useCallback<AssistantCommands['planVideos']>((action) => {
    const doc = draftRef.current.document;
    const found = findLesson(doc, action.params.lessonId);
    const wanted = [...new Set(action.params.nodeIds)];
    const nodes = new Map<string, AnyNode>((found?.lesson.graph.nodes ?? []).map((n) => [n.id, n]));
    const nodeIds: string[] = [];
    let chars = 0;
    for (const id of wanted) {
      const node = nodes.get(id);
      if (!node || !nodeSupportsMedia(node)) continue;
      const media = nodeMedia(node);
      if (media && !media.stale) continue;
      const script = spokenScript(node).trim();
      if (!script) continue;
      nodeIds.push(id);
      chars += script.length;
    }
    return {
      nodeIds,
      chars,
      summary: presentationSummary(doc.presentation),
      blocker: found ? presentationBlocker(doc.presentation) : 'Esta aula não existe mais no rascunho.',
      skipped: wanted.length - nodeIds.length,
    };
  }, []);

  const angleSource = () => {
    const p = draftRef.current.document.presentation;
    const list = p.cameras ?? [];
    const sourceLookId = list.find((c) => c.status === 'ready' && c.lookId)?.lookId || p.avatarId;
    if (!sourceLookId) throw new Error('Escolha um apresentador em Apresentação antes de gerar um ângulo.');
    if (list.length + (list.length === 0 ? 1 : 0) >= MAX_CAMERAS) throw new Error('O kit de câmeras já está cheio. Remova uma câmera em Apresentação.');
    return sourceLookId;
  };

  const angleBody = (action: Extract<AssistantAction, { kind: 'generate_angle' }>, confirm: boolean) => ({
    sourceLookId: angleSource(),
    angle: action.params.angle,
    framing: action.params.framing,
    extra: action.params.extra?.trim() ? action.params.extra.trim().slice(0, 300) : undefined,
    confirm,
  });

  const previewAngle = React.useCallback<AssistantCommands['previewAngle']>(async (action) => {
    const r = await api<{ prompt: string; simulated?: boolean; estimate?: { note?: string } }>('/api/media/looks', { json: angleBody(action, false) });
    return { prompt: r.prompt, note: r.estimate?.note ?? '', simulated: !!r.simulated } satisfies AnglePreview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAi = async (action: Extract<AssistantAction, { cost: 'ai' }>): Promise<ActionOutcome> => {
    const lessonId = action.params.lessonId;
    const bridge = bridges.current.get(lessonId)?.();
    // avaliação não vira proposta: vai sempre pela rota de execução (o painel "Avaliação" acompanha a execução)
    if (bridge && action.kind !== 'evaluate_lesson') {
      if (bridge.busy) return { tone: 'error', message: 'Já existe uma execução da IA em andamento nesta aula. Aguarde ou decida a proposta aberta.' };
      if (action.kind === 'revise_lesson') await bridge.revise({ focus: asFocus(action.params.focus), instruction: action.params.instruction });
      else if (action.kind === 'direct_lesson') await bridge.direct({ nodeIds: action.params.nodeIds, instruction: action.params.instruction });
      else await bridge.vary(action.params.nodeId);
      return { tone: 'success', message: 'Pedido enviado. A proposta aparece nesta aula para você revisar antes de aplicar.' };
    }
    const res = await api<{ run?: AgentRun }>(`/api/courses/${courseId}/assistant/execute`, { json: { action, expectedRevision: draftRef.current.revision } });
    if (!res.run) return { tone: 'success', message: 'Pedido enviado.' };
    track(res.run);
    if (action.kind === 'evaluate_lesson') return { tone: 'info', message: 'Avaliação em andamento. As notas aparecem no painel "Avaliação" da aula.', runId: res.run.id, href: `${lessonHref(lessonId)}#quality-panel`, hrefLabel: 'Ver avaliação' };
    return { tone: 'info', message: 'Pedido enviado à IA.', runId: res.run.id, href: lessonHref(lessonId), hrefLabel: 'Revisar proposta na aula' };
  };

  const generateVideos = async (action: Extract<AssistantAction, { kind: 'generate_videos' }>): Promise<ActionOutcome> => {
    const plan: VideoPlan = planVideos(action);
    if (plan.blocker) return { tone: 'error', message: plan.blocker };
    if (plan.nodeIds.length === 0) return { tone: 'info', message: 'Nada a gerar: essas cenas já têm vídeo ou estão sem fala.' };
    const { lessonId } = action.params;
    const doc = draftRef.current.document;
    const graph = findLesson(doc, lessonId)?.lesson.graph;
    const errors: string[] = [];
    let anyReused = false;
    for (const nodeId of plan.nodeIds) {
      const node = graph?.nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      try {
        const r = await requestSceneVideo({ courseId, lessonId, nodeId, narration: nodeNarration(node), presentation: doc.presentation });
        if (r.reused) anyReused = true;
      } catch (e) {
        errors.push(`${node.title || nodeId}: ${errorText(e, 'falhou')}`);
      }
    }
    await Promise.all([queueRef.current?.refresh(), bridges.current.get(lessonId)?.().jobsChanged()].map((p) => Promise.resolve(p).catch(() => undefined)));
    if (anyReused && draftRef.current.status === 'saved') await draftRef.current.reload().catch(() => undefined);
    const ok = plan.nodeIds.length - errors.length;
    return {
      tone: errors.length && ok === 0 ? 'error' : 'success',
      message: `${ok} de ${plan.nodeIds.length} ${plan.nodeIds.length === 1 ? 'pedido enviado' : 'pedidos enviados'} para a fila.${errors.length ? ` Com erro: ${errors.join('; ')}` : ''}`,
      href: `/estudio/cursos/${courseId}/producao`,
      hrefLabel: 'Acompanhar a produção',
    };
  };

  const generateAngle = async (action: Extract<AssistantAction, { kind: 'generate_angle' }>): Promise<ActionOutcome> => {
    const body = angleBody(action, true);
    const r = await api<{ generationId: string; prompt?: string; simulated?: boolean }>('/api/media/looks', { json: body });
    const { angle, framing } = action.params;
    // grava a câmera na hora: o resultado pago não se perde se a página fechar
    draftRef.current.update((d) => {
      const pres = d.presentation;
      const list = pres.cameras ?? [];
      const baseList: Camera[] =
        list.length > 0 || !pres.avatarId
          ? list
          : [{ id: newCameraId(), name: 'Câmera principal', lookId: pres.avatarId, previewUrl: pres.avatarPreviewUrl, nativeFraming: 'medium', angle: 'front', status: 'ready' }];
      const cam: Camera = {
        id: newCameraId(),
        name: `${FRAMING_LABEL[framing]} · ${ANGLE_LABEL[angle].toLowerCase()}`.slice(0, 60),
        lookId: '',
        angle,
        nativeFraming: framing,
        status: 'generating',
        generationId: r.generationId.slice(0, 120),
        generationPrompt: (r.prompt ?? '').slice(0, 1000) || undefined,
        sourceLookId: body.sourceLookId,
      };
      return { ...d, presentation: { ...pres, cameras: [...baseList, cam].slice(0, MAX_CAMERAS) } };
    });
    return { tone: 'success', message: 'Câmera adicionada ao kit. A geração leva alguns minutos e aparece em Apresentação quando ficar pronta.' };
  };

  const runAction = React.useCallback<AssistantCommands['runAction']>(
    async (action, opts = {}) => {
      switch (action.kind) {
        case 'open':
          router.push(action.params.href);
          return { tone: 'info', message: 'Abrindo…' };
        case 'preview_animatic': {
          const { lessonId, nodeId } = action.params;
          if (bridges.current.has(lessonId)) return openAnimaticOnPage(nodeId);
          pendingAnimatic.current = { lessonId, nodeId };
          router.push(lessonHref(lessonId));
          return { tone: 'info', message: 'Abrindo a aula para mostrar o animatic…' };
        }
        case 'update_direction_style': {
          const { pace, useSlides, maxCinematicPerLesson } = action.params;
          const patch: Partial<Presentation['directionStyle']> = {};
          if (pace) patch.pace = pace;
          if (useSlides !== undefined) patch.useSlides = useSlides;
          if (maxCinematicPerLesson !== undefined) patch.maxCinematicPerLesson = maxCinematicPerLesson;
          if (Object.keys(patch).length === 0) return { tone: 'info', message: 'Nada para mudar no estilo de direção.' };
          draftRef.current.update((d) => ({ ...d, presentation: { ...d.presentation, directionStyle: { ...d.presentation.directionStyle, ...patch } } }));
          return { tone: 'success', message: 'Estilo de direção atualizado. Dá para desfazer.' };
        }
        case 'revise_lesson':
        case 'direct_lesson':
        case 'scene_variations':
        case 'evaluate_lesson':
          return startAi(action);
        case 'generate_videos':
          if (!opts.confirmed) throw new Error('Ação paga: confirme antes de gerar.');
          return generateVideos(action);
        case 'generate_angle':
          if (!opts.confirmed) throw new Error('Ação paga: confirme antes de gerar.');
          return generateAngle(action);
        default:
          return null;
      }
    },
    // as funções internas leem refs; só dependem do curso e do roteador
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, router, lessonHref, planVideos, track],
  );

  /* ---------------- escopo, foco, ponte ---------------- */

  const pushScope = React.useCallback<AssistantCommands['pushScope']>((id, ctx) => {
    setScopes((prev) => {
      const rest = prev.filter((s) => s.id !== id);
      return ctx ? [...rest, { id, ctx }] : rest;
    });
  }, []);

  const focusNode = React.useCallback<AssistantCommands['focusNode']>((lessonId, nodeId) => {
    setFocus((prev) => (nodeId === null ? null : prev?.lessonId === lessonId && prev.nodeId === nodeId ? prev : { lessonId, nodeId }));
  }, []);

  const registerBridge = React.useCallback<AssistantCommands['registerBridge']>((lessonId, get) => {
    bridges.current.set(lessonId, get);
    const pending = pendingAnimatic.current;
    if (pending && pending.lessonId === lessonId) {
      pendingAnimatic.current = null;
      window.setTimeout(() => openAnimaticOnPage(pending.nodeId), 400);
    }
    return () => {
      if (bridges.current.get(lessonId) === get) bridges.current.delete(lessonId);
    };
  }, []);

  const setOpen = React.useCallback((v: boolean) => setOpenState(v), []);
  const toggle = React.useCallback(() => setOpenState((v) => !v), []);
  const clearConversation = React.useCallback(() => setTurns([]), []);

  const commands = React.useMemo<AssistantCommands>(
    () => ({ ask, runAction, previewAngle, planVideos, setOpen, toggle, focusNode, pushScope, registerBridge, clearConversation }),
    [ask, runAction, previewAngle, planVideos, setOpen, toggle, focusNode, pushScope, registerBridge, clearConversation],
  );
  const state = React.useMemo<AssistantState>(() => ({ courseId, context, open, turns, busy, simulated, runs }), [courseId, context, open, turns, busy, simulated, runs]);

  return (
    <AssistantCommandsContext.Provider value={commands}>
      <AssistantStateContext.Provider value={state}>{children}</AssistantStateContext.Provider>
    </AssistantCommandsContext.Provider>
  );
}

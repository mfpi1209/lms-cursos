'use client';

import * as React from 'react';
import Link from 'next/link';
import { PreviewLink } from '@/components/studio/test-mode/preview-link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Clapperboard, Eye, Film, Info, SlidersHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { compileLesson, findLesson, type AnyNode, type ExecutableNodeType, type LessonGraph } from '@lms/course-schema';
import { Button, buttonVariants } from '@/components/ui/button';
import { focusAfter } from '@/components/ui/focus-trap';
import { SaveStatus, useDraft } from '@/components/studio/draft-provider';
import {
  createNode,
  insertNodeAfter,
  newNodeId,
  newOptionId,
  nodeMedia,
  nodeSupportsMedia,
  removeNodeRewiring,
  setStartNode,
  updateLesson,
  updateLessonGraph,
} from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import { AddSceneSlot } from './add-scene';
import { ConfirmDialog } from './confirm-dialog';
import { presentationBlocker, presentationSummary, requestSceneVideo, type GenerateResult } from './generate';
import { InlineTitle } from './inline-editors';
import { isSpokenNode, nodeNarration, spokenScript } from './narration-fields';
import { SceneCard } from './scene-card';
import { buildStoryboard, humanizeIssue, noticesByNode, sceneTitle, summaryLine, type SceneNotice } from './scene-model';
import { ACTIVE_JOB, errorText, useLessonMediaJobs } from './use-media-jobs';
import { useAgentRuns } from './use-agent-runs';
import { AiFailedBar, AiProposalPanel, AiReviseMenu, AiRunBar } from './ai-revise';
import { DirectionProposalPanel } from '@/components/studio/direction/direction-review';
import { useMediaQueue } from '../media-queue/use-media-queue';
import { queueHeadline } from '../media-queue/production-panel';
import { AssistantScope, useAssistantFocus, useAssistantLessonBridge } from '@/components/studio/assistant/use-assistant';
import { NextSteps } from '@/components/studio/assistant/next-steps';
import { QualityPanel } from '@/components/studio/quality/quality-panel';
import { useLessonQuality } from '@/components/studio/quality/use-quality';
import { findingsByScene, requestOpenQuality } from '@/components/studio/quality/quality-model';
import { lessonVideoStats } from '@/components/studio/video-stats';

export interface StoryboardEditorProps {
  courseId: string;
  lessonId: string;
  /** alterna para o editor avançado (opcionalmente já com um bloco selecionado) */
  onOpenAdvanced(nodeId?: string): void;
}

/** Cópia de um nó com ids novos (nó e opções), pronta para ser inserida. */
function cloneNode(src: AnyNode): AnyNode {
  let copy: AnyNode = { ...structuredClone(src), id: newNodeId(src.type), title: src.title ? `${src.title} (cópia)` : undefined };
  if (copy.type === 'choice' || copy.type === 'assessment') copy = { ...copy, options: copy.options.map((o) => ({ ...o, id: newOptionId() })) } as AnyNode;
  return copy;
}

/** Largura da coluna da espinha (linha do tempo) à esquerda dos cartões: mais estreita no celular. */
const SPINE = 'pl-9 sm:pl-12';

export function StoryboardEditor({ courseId, lessonId, onOpenAdvanced }: StoryboardEditorProps) {
  const { document: doc, update, undo, canUndo, status: draftStatus, reload } = useDraft();
  const searchParams = useSearchParams();
  const found = findLesson(doc, lessonId);
  const graph = found?.lesson.graph;
  const directionButtonRef = React.useRef<HTMLButtonElement>(null);

  // ?node=<id> (links "Ver na cena" da produção e da revisão): rola até a cena e leva o foco a ela, uma vez
  const deepLinked = React.useRef(false);
  React.useEffect(() => {
    if (deepLinked.current || !graph) return;
    const nodeId = searchParams.get('node');
    if (!nodeId || !graph.nodes.some((n) => n.id === nodeId)) return;
    deepLinked.current = true;
    const el = document.getElementById(`scene-${nodeId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    focusAfter(el, { preventScroll: true });
  }, [graph, searchParams]);
  const jobs = useLessonMediaJobs(courseId, lessonId);
  const queue = useMediaQueue(courseId);
  const refreshJobs = React.useCallback(async () => {
    await Promise.all([jobs.refresh(), queue.refresh()]);
  }, [jobs.refresh, queue.refresh]);
  const agent = useAgentRuns(courseId, lessonId);
  // Avaliação de qualidade (scorecard) desta aula; os selos das cenas usam a contagem de apontamentos por cena.
  const quality = useLessonQuality(courseId, lessonId);
  const qualityByScene = React.useMemo(() => findingsByScene(quality.data?.scorecard?.findings), [quality.data]);
  // cena cujas variações foram pedidas nesta sessão (a execução não expõe o nó até a proposta existir)
  const [varyingNode, setVaryingNode] = React.useState<string | null>(null);
  // cenas cuja direção foi pedida nesta sessão
  const [directingNodes, setDirectingNodes] = React.useState<ReadonlySet<string> | null>(null);
  React.useEffect(() => {
    if (!agent.hasActive) {
      setVaryingNode(null);
      setDirectingNodes(null);
    }
  }, [agent.hasActive]);
  const [bulk, setBulk] = React.useState<{ confirming: boolean; running: boolean; done: number; total: number; errors: string[] } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  /** "Gerar esta aula com IA" numa aula que já tem cenas ou vídeos: confirma antes */
  const [confirmGenerate, setConfirmGenerate] = React.useState(false);
  /** resultado da última direção aplicada: cenas puladas (ajustadas por você / fala mudou) */
  const [applyNotice, setApplyNotice] = React.useState<string | null>(null);
  const scrollToRef = React.useRef<string | null>(null);

  const model = React.useMemo(() => (graph ? buildStoryboard(graph) : null), [graph]);
  // nós das outras aulas: fontes de "Meu roteiro" fora desta aula são verificadas contra o curso inteiro
  const externalNodes = React.useMemo(() => {
    const m = new Map<string, AnyNode>();
    for (const mod of doc.modules) for (const l of mod.lessons) if (l.id !== lessonId) for (const n of l.graph.nodes) if (!m.has(n.id)) m.set(n.id, n);
    return m;
  }, [doc.modules, lessonId]);
  const live = React.useMemo(
    () => (graph ? compileLesson(graph, { lessonId, objectiveIds: new Set(doc.objectives.map((o) => o.id)), externalNodes, presentation: doc.presentation }) : null),
    [graph, lessonId, doc.objectives, externalNodes, doc.presentation],
  );
  const notices = React.useMemo<SceneNotice[]>(() => {
    if (!live || !model) return [];
    return [...live.errors.map((i) => humanizeIssue(i, 'error', model)), ...live.warnings.map((i) => humanizeIssue(i, 'warning', model))];
  }, [live, model]);
  const byNode = React.useMemo(() => noticesByNode(notices), [notices]);
  const lessonLevel = notices.filter((n) => !n.nodeId);
  const staleCount = notices.filter((n) => n.code === 'MEDIA_STALE').length;

  // Assistente: pedidos à IA desta aula passam pelo mesmo hook (propostas nos painéis abaixo).
  const focusScene = useAssistantFocus();
  useAssistantLessonBridge(lessonId, {
    busy: agent.hasActive || agent.busy,
    revise: agent.startRevise,
    direct: async (body) => {
      const ids = body.nodeIds?.length
        ? body.nodeIds
        : (model?.all.filter(({ node, reachable }) => reachable && isSpokenNode(node) && nodeSupportsMedia(node) && spokenScript(node).trim().length > 0).map((e) => e.node.id) ?? []);
      setDirectingNodes(new Set(ids));
      await agent.startDirection(ids.length ? { nodeIds: ids, instruction: body.instruction } : { instruction: body.instruction });
    },
    vary: async (nodeId) => {
      setVaryingNode(nodeId);
      await agent.startVariations(nodeId);
    },
    jobsChanged: refreshJobs,
  });

  // Leva o cartão recém-criado à vista.
  React.useEffect(() => {
    const id = scrollToRef.current;
    if (!id) return;
    scrollToRef.current = null;
    requestAnimationFrame(() => document.getElementById(`scene-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [graph]);

  if (!found || !graph || !model || !live) {
    return (
      <div className="space-y-3">
        <p className="text-fg-muted">Esta aula não existe mais no rascunho.</p>
        <Link href={`/estudio/cursos/${courseId}`} className="text-sm font-medium text-accent hover:underline">Voltar ao painel do curso</Link>
      </div>
    );
  }

  const { lesson, module } = found;
  const changeGraph = (fn: (g: LessonGraph) => LessonGraph, coalesce?: string) => update((d) => updateLessonGraph(d, lessonId, fn), coalesce ? { coalesce } : undefined);
  const setLessonTitle = (title: string) => update((d) => updateLesson(d, lessonId, (l) => ({ ...l, title })), { coalesce: `lesson.title.${lessonId}` });

  const addAfter = (afterId: string, type: ExecutableNodeType, optionId?: string) => {
    const node = createNode(type);
    scrollToRef.current = node.id;
    changeGraph((g) => insertNodeAfter(g, afterId, node, { optionId }));
  };
  const duplicate = (nodeId: string) => {
    const src = graph.nodes.find((n) => n.id === nodeId);
    if (!src) return;
    const copy = cloneNode(src);
    scrollToRef.current = copy.id;
    changeGraph((g) => insertNodeAfter(g, nodeId, copy));
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    changeGraph((g) => removeNodeRewiring(g, pendingDelete));
    setPendingDelete(null);
  };
  const setStart = (nodeId: string) => changeGraph((g) => setStartNode(g, nodeId));
  const goTo = (nodeId: string) => document.getElementById(`scene-${nodeId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const onJobCreated = async (r: GenerateResult) => {
    await refreshJobs();
    if (r.reused && draftStatus === 'saved') await reload();
  };

  /* ---- gerar em lote ---- */
  const bulkTargets = model.all.filter(({ node, reachable }) => reachable && nodeSupportsMedia(node) && !nodeMedia(node) && spokenScript(node).trim().length > 0 && !(jobs.latestByNode.get(node.id) && ACTIVE_JOB.has(jobs.latestByNode.get(node.id)!.status)));
  const bulkChars = bulkTargets.reduce((s, t) => s + spokenScript(t.node).trim().length, 0);
  const blocker = presentationBlocker(doc.presentation);
  const runBulk = async () => {
    setBulk({ confirming: false, running: true, done: 0, total: bulkTargets.length, errors: [] });
    let anyReused = false;
    const errors: string[] = [];
    let done = 0;
    for (const t of bulkTargets) {
      try {
        const r = await requestSceneVideo({ courseId, lessonId, nodeId: t.node.id, narration: nodeNarration(t.node), presentation: doc.presentation });
        if (r.reused) anyReused = true;
      } catch (e) {
        errors.push(`${sceneTitle(model, t.node.id)}: ${errorText(e, 'falhou')}`);
      }
      done++;
      setBulk({ confirming: false, running: true, done, total: bulkTargets.length, errors: [...errors] });
    }
    await refreshJobs();
    if (anyReused && draftStatus === 'saved') await reload();
    setBulk({ confirming: false, running: false, done, total: bulkTargets.length, errors });
  };

  /* ---- direção com IA ---- */
  const directionTargets = model.all.filter(({ node, reachable }) => reachable && isSpokenNode(node) && nodeSupportsMedia(node) && spokenScript(node).trim().length > 0).map((e) => e.node.id);
  const direct = async (nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    setDirectingNodes(new Set(nodeIds));
    await agent.startDirection({ nodeIds });
    // o botão fica desabilitado durante a execução: o foco vai para a barra de andamento
    focusAfter('[data-testid="ai-run-bar"]', { preventScroll: true });
  };

  /* ---- gerar esta aula com IA (mesma rota do wizard) ---- */
  const lessonIsEmpty = graph.nodes.length <= 2 && graph.nodes.some((n) => n.id === 'inicio') && graph.nodes.some((n) => n.type === 'end');
  const lessonMediaCount = graph.nodes.filter((n) => !!nodeMedia(n)).length;
  const requestGenerate = () => {
    if (lessonIsEmpty) void agent.startGenerate();
    else setConfirmGenerate(true);
  };

  const editorHref = `/estudio/cursos/${courseId}/aulas/${lessonId}`;
  const decisions = model.all.filter((e) => e.reachable && e.node.type === 'choice').length;
  const sceneCount = model.all.filter((e) => e.reachable).length;
  const pendingNode = pendingDelete ? graph.nodes.find((n) => n.id === pendingDelete) : undefined;
  const deleteTail = pendingNode ? `A cena anterior passa a levar direto para o que vinha depois dela, quando isso estiver claro.` : '';
  const lastMain = model.main[model.main.length - 1];

  const renderCard = (nodeId: string, nested = false) => {
    const entry = model.byId.get(nodeId);
    if (!entry) return null;
    const { node } = entry;
    return (
      <SceneCard
        key={node.id}
        courseId={courseId}
        lessonId={lessonId}
        graph={graph}
        entry={entry}
        model={model}
        notices={byNode.get(node.id) ?? []}
        objectives={doc.objectives}
        presentation={doc.presentation}
        latestJob={jobs.latestByNode.get(node.id)}
        changeGraph={changeGraph}
        onDuplicate={duplicate}
        onDelete={setPendingDelete}
        onSetStart={setStart}
        onOpenAdvanced={onOpenAdvanced}
        onJobCreated={onJobCreated}
        onJobsChanged={refreshJobs}
        canDelete={graph.nodes.length > 1}
        nested={nested}
        onActivate={(id) => focusScene(lessonId, id)}
        qualityCount={qualityByScene.get(node.id)}
        onOpenQuality={(id) => requestOpenQuality({ nodeId: id })}
        directionAi={
          isSpokenNode(node) && nodeSupportsMedia(node)
            ? {
                canSuggest: !agent.hasActive && !agent.busy,
                suggesting: !!directingNodes?.has(node.id) && agent.hasActive,
                pending: agent.directionNodeIds.has(node.id),
                onSuggest: () => direct([node.id]),
              }
            : undefined
        }
        ai={
          node.type === 'choice' || node.type === 'consequence'
            ? {
                canVary: !agent.hasActive && !agent.busy,
                varying: varyingNode === node.id && agent.hasActive,
                proposal: agent.variationsByNode.get(node.id),
                busy: agent.busy,
                onVary: async () => {
                  setVaryingNode(node.id);
                  await agent.startVariations(node.id);
                },
                onApply: async (opts) => {
                  await agent.apply(agent.variationsByNode.get(node.id)!.id, opts);
                },
                onReject: () => agent.reject(agent.variationsByNode.get(node.id)!.id),
              }
            : undefined
        }
        renderNested={
          node.type === 'choice'
            ? (optionId) => {
                const groupedId = model.groupsByChoice.get(node.id)?.get(optionId);
                if (!groupedId) return null;
                return (
                  <div
                    className="relative mt-2 pt-1 sm:ml-3.5 sm:border-l sm:border-line-strong sm:pl-4 sm:before:absolute sm:before:left-0 sm:before:top-7 sm:before:h-px sm:before:w-4 sm:before:bg-line-strong"
                    data-testid={`branch-${optionId}`}
                  >
                    {renderCard(groupedId, true)}
                    <AddSceneSlot label="Adicionar cena depois desta" className="mt-1" onAdd={(type) => addAfter(groupedId, type)} />
                  </div>
                );
              }
            : undefined
        }
      />
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AssistantScope context={{ screen: 'storyboard', lessonId }} />
      {/* Cabeçalho */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          <Link href={`/estudio/cursos/${courseId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md hover:text-fg hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Painel do curso
          </Link>
          <span aria-hidden="true" className="text-fg-faint">·</span>
          <span data-testid="lesson-dynamic-label" className="text-fg-faint">
            {module.title} · {sceneCount} {sceneCount === 1 ? 'cena' : 'cenas'} · {decisions} {decisions === 1 ? 'decisão' : 'decisões'}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display basis-full text-3xl sm:text-4xl" data-testid="lesson-title">
            <InlineTitle id="lesson-title-input" label="Título da aula" value={lesson.title} maxLength={160} onChange={setLessonTitle} className="display text-3xl sm:text-4xl" />
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SaveStatus />
            <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração" data-testid="undo">
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer
            </Button>
            <PreviewLink href={`${editorHref}/previa`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))} data-testid="preview-link">
              <Eye className="h-4 w-4" aria-hidden="true" /> Prévia
            </PreviewLink>
            <Button variant="ghost" size="sm" onClick={() => onOpenAdvanced()} aria-pressed={false} data-testid="advanced-toggle">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Modo avançado
            </Button>
            <Button variant="ai" size="sm" disabled={agent.hasActive || agent.busy} onClick={requestGenerate} title={lessonIsEmpty ? 'A IA escreve as cenas desta aula a partir das cenas previstas na estrutura' : 'Gera uma nova versão inteira desta aula; você vê a proposta antes de aplicar'} data-testid="generate-lesson">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {lessonIsEmpty ? 'Gerar esta aula com IA' : 'Gerar de novo com IA'}
            </Button>
            <AiReviseMenu disabled={agent.hasActive || agent.busy || lessonIsEmpty} onRun={agent.startRevise} />
            <Button
              ref={directionButtonRef}
              variant="ai"
              size="sm"
              disabled={agent.hasActive || agent.busy || directionTargets.length === 0}
              title={directionTargets.length === 0 ? 'Nenhuma cena com vídeo e fala para dirigir' : 'A IA propõe planos, enquadramentos, câmeras e slides para cada cena com vídeo'}
              onClick={() => void direct(directionTargets)}
              data-testid="direction-lesson"
            >
              <Clapperboard className="h-4 w-4" aria-hidden="true" /> Dirigir aula com IA
            </Button>
          </div>
        </div>
      </header>

      <NextSteps lessonId={lessonId} variant="inline" collapsible storageKey="lms.next-steps.storyboard.collapsed" headingLevel="h3" />

      {/* Avaliação de qualidade: notas, apontamentos e correções sugeridas pela IA */}
      <QualityPanel
        quality={quality}
        sceneName={(id) => (model.byId.has(id) ? sceneTitle(model, id) : null)}
        onGoTo={(id) => {
          goTo(id);
          // além de rolar, o foco vai para o cartão da cena (teclado e leitor de tela)
          focusAfter(() => document.getElementById(`scene-${id}`), { preventScroll: true });
        }}
        readyVideos={lessonVideoStats(lesson, queue.data?.items, doc.presentation).ready}
        otherBusy={agent.hasActive || agent.busy}
        headingLevel="h3"
      />

      {/* IA: execução em andamento, falha, proposta de revisão da aula */}
      {agent.activeRuns.map((r) => (
        <AiRunBar key={r.id} run={r} onCancel={agent.cancel} busy={agent.busy} />
      ))}
      {agent.failedRun && <AiFailedBar run={agent.failedRun} onDismiss={() => agent.dismissFailed(agent.failedRun!.id)} />}
      {agent.error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <span className="flex-1">{agent.error}</span>
          <button type="button" className="min-h-6 rounded text-xs underline" onClick={agent.clearError}>Fechar</button>
        </p>
      )}
      {agent.lessonProposal && (
        <AiProposalPanel
          proposal={agent.lessonProposal}
          busy={agent.busy}
          onApply={async (opts) => {
            await agent.apply(agent.lessonProposal!.id, opts);
          }}
          onReject={() => agent.reject(agent.lessonProposal!.id)}
        />
      )}
      {/* leitores de tela: avisa quando uma proposta da IA chega (os painéis abaixo aparecem sem troca de foco) */}
      <p className="sr-only" role="status" aria-live="polite">
        {agent.directionProposal ? 'Direção proposta pela IA pronta para revisão.' : agent.lessonProposal ? 'Revisão da aula proposta pela IA pronta para revisão.' : ''}
      </p>
      {agent.directionProposal && (
        <DirectionProposalPanel
          proposal={agent.directionProposal}
          busy={agent.busy}
          sceneName={(id) => sceneTitle(model, id)}
          onGoTo={goTo}
          onApply={async (opts) => {
            const r = await agent.apply(agent.directionProposal!.id, opts);
            const names = (ids: string[] | undefined) => (ids ?? []).map((id) => `“${sceneTitle(model, id)}”`).join(', ');
            const parts: string[] = [];
            if (r.skippedAuthored?.length) parts.push(`${r.skippedAuthored.length === 1 ? '1 cena ajustada por você ficou como estava' : `${r.skippedAuthored.length} cenas ajustadas por você ficaram como estavam`}: ${names(r.skippedAuthored)}.`);
            if (r.skippedMismatch?.length) parts.push(`${r.skippedMismatch.length === 1 ? '1 cena ficou de fora porque a fala mudou' : `${r.skippedMismatch.length} cenas ficaram de fora porque a fala mudou`}: ${names(r.skippedMismatch)}.`);
            setApplyNotice(parts.length ? `Direção aplicada. ${parts.join(' ')}` : 'Direção aplicada em todas as cenas da proposta.');
            return r;
          }}
          onReject={() => agent.reject(agent.directionProposal!.id)}
          returnFocusTo={() => directionButtonRef.current}
        />
      )}
      {applyNotice && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-ai-soft px-3 py-2 text-sm text-ai" data-testid="direction-apply-notice">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{applyNotice}</span>
          <button type="button" className="min-h-6 rounded text-xs underline" onClick={() => setApplyNotice(null)}>Fechar</button>
        </p>
      )}

      {/* Resumo das pendências: uma barra fina com o estado */}
      <section aria-labelledby="issues-heading" data-testid="storyboard-issues" className={cn('panel px-4 py-2.5', live.errors.length > 0 && 'ring-1 ring-danger/50')}>
        <h3 id="issues-heading" className="flex items-center gap-2 text-sm font-medium text-fg">
          {live.errors.length ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          ) : staleCount > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-paid" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          )}
          {summaryLine(live.errors.length, live.warnings.length, staleCount)}
        </h3>
        {notices.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
            {lessonLevel.map((n, i) => (
              <li key={`l-${i}`} title={n.technical} className="flex items-start gap-2 text-fg-muted">
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.severity === 'error' ? 'bg-danger' : 'bg-fg-faint')} aria-hidden="true" />
                {n.text}
              </li>
            ))}
            {[...byNode.entries()].map(([nodeId, list]) => (
              <li key={nodeId} className="flex flex-wrap items-baseline gap-x-2 text-fg-muted">
                <button type="button" className="min-h-6 rounded font-medium text-accent hover:underline" onClick={() => goTo(nodeId)}>
                  {sceneTitle(model, nodeId)}
                </button>
                <span className="text-fg-faint">
                  {list.length === 1 ? list[0]!.text : `${list.filter((x) => x.severity === 'error').length || 'nenhum'} para resolver, ${list.filter((x) => x.severity === 'warning').length || 'nenhuma'} sugestão`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="paid"
          size="sm"
          disabled={!!blocker || bulkTargets.length === 0 || !!bulk?.running}
          title={blocker ?? (bulkTargets.length === 0 ? 'Todas as cenas com texto já têm mídia' : undefined)}
          onClick={() => setBulk({ confirming: true, running: false, done: 0, total: bulkTargets.length, errors: [] })}
          data-testid="generate-all"
        >
          <Film className="h-4 w-4" aria-hidden="true" /> Gerar vídeos de todas as cenas sem mídia{bulkTargets.length ? ` (${bulkTargets.length})` : ''}
        </Button>
        {blocker && (
          <span className="text-xs text-fg-muted">
            {blocker}{' '}
            <Link href={`/estudio/cursos/${courseId}/montar`} className="font-medium text-accent hover:underline">Abrir Apresentação</Link>
          </span>
        )}
        {bulk && (bulk.running || bulk.done > 0) && (
          <p role="status" aria-live="polite" className="text-xs text-fg-muted" data-testid="generate-all-progress">
            {bulk.running ? `Enviando ${Math.min(bulk.done + 1, bulk.total)} de ${bulk.total}…` : `${bulk.done - bulk.errors.length} de ${bulk.total} pedidos enviados para a fila.`}
            {bulk.errors.length > 0 && <span className="text-danger"> {bulk.errors.length} com erro: {bulk.errors.join('; ')}</span>}
          </p>
        )}
      </div>
      {queue.data && queue.data.summary.active + queue.data.summary.waiting > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted" data-testid="storyboard-queue-line">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span>Vídeos do curso: {queueHeadline(queue.data)}</span>
          <Link href={`/estudio/cursos/${courseId}/producao`} className="inline-flex min-h-9 items-center font-medium text-accent-strong hover:underline">Acompanhar a produção</Link>
        </p>
      )}
      {jobs.notice && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{jobs.notice}</span>
          <button type="button" className="min-h-6 rounded text-xs underline" onClick={jobs.dismissNotice}>Fechar</button>
        </p>
      )}
      {jobs.error && <p role="alert" className="text-xs text-danger">{jobs.error}</p>}

      {/* Sequência: linha do tempo com a espinha à esquerda */}
      <ol className="relative" aria-label="Cenas da aula em ordem" data-testid="storyboard">
        <span className="absolute bottom-6 left-[13px] top-6 w-0.5 rounded-full bg-accent-soft sm:left-[17px]" aria-hidden="true" />
        {model.main.map((entry, i) => {
          const prev = model.main[i - 1];
          return (
            <li key={entry.node.id} className={cn('relative', SPINE)}>
              {prev && <AddSceneSlot afterChoice={prev.node.type === 'choice' ? prev.node : undefined} onAdd={(type, optionId) => addAfter(prev.node.id, type, optionId)} />}
              {renderCard(entry.node.id)}
            </li>
          );
        })}
        {lastMain && lastMain.node.type !== 'end' && (
          <li className={cn('relative', SPINE)}>
            <AddSceneSlot
              label="Adicionar cena no fim"
              afterChoice={lastMain.node.type === 'choice' ? (lastMain.node as Extract<AnyNode, { type: 'choice' }>) : undefined}
              onAdd={(type, optionId) => addAfter(lastMain.node.id, type, optionId)}
            />
          </li>
        )}
      </ol>

      {/* Fora do caminho */}
      {model.unreachable.length > 0 && (
        <section aria-labelledby="unreachable-heading" className="space-y-2" data-testid="unreachable-scenes">
          <h3 id="unreachable-heading" className="text-sm font-semibold text-fg">Cenas fora do caminho</h3>
          <p className="text-xs text-fg-muted">Ninguém chega a estas cenas. Escolha-as como destino de alguma opção ou “Próxima cena”, ou exclua-as.</p>
          <ol className="relative space-y-3">
            {model.unreachable.map((entry) => (
              <li key={entry.node.id} className={cn('relative', SPINE)}>{renderCard(entry.node.id)}</li>
            ))}
          </ol>
        </section>
      )}

      {pendingNode && (
        <ConfirmDialog
          title={`Excluir a cena “${pendingNode.title || sceneTitle(model, pendingNode.id)}”?`}
          confirmLabel="Excluir cena"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          testId="delete-scene"
        >
          <p className="text-sm text-fg-muted">{deleteTail} Dá para desfazer logo em seguida.</p>
        </ConfirmDialog>
      )}

      {confirmGenerate && (
        <ConfirmDialog
          title="Gerar de novo substitui esta aula"
          confirmLabel="Gerar mesmo assim"
          danger
          busy={agent.busy}
          onCancel={() => setConfirmGenerate(false)}
          onConfirm={() => {
            setConfirmGenerate(false);
            void agent.startGenerate();
          }}
          testId="generate-lesson-confirm"
        >
          <p className="text-sm text-fg-muted">
            Esta aula tem {sceneCount} {sceneCount === 1 ? 'cena sua' : 'cenas suas'}{lessonMediaCount ? ` e ${lessonMediaCount} ${lessonMediaCount === 1 ? 'vídeo' : 'vídeos'}` : ''}. A IA escreve uma versão nova inteira; você vê a proposta antes de aplicar, mas aplicar substitui tudo o que existe hoje (o histórico de revisões guarda a versão atual).
          </p>
        </ConfirmDialog>
      )}

      {bulk?.confirming && (
        <ConfirmDialog
          title="Gerar vídeos de todas as cenas sem mídia"
          confirmLabel={`Gerar ${bulkTargets.length} ${bulkTargets.length === 1 ? 'vídeo' : 'vídeos'}`}
          paid
          onCancel={() => setBulk(null)}
          onConfirm={() => void runBulk()}
          testId="generate-all-confirm"
        >
          <p className="text-sm text-fg-muted">
            Esta é uma <strong className="text-paid">ação paga</strong> nos provedores externos. Serão pedidos {bulkTargets.length} vídeos, um por cena, com a fala escrita para cada cena (ou o texto da cena, quando a fala estiver vazia). Cenas que já têm mídia ficam de fora.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-fg-muted">Apresentação</dt>
            <dd className="text-fg">{presentationSummary(doc.presentation)}</dd>
            <dt className="text-fg-muted">Caracteres no total</dt>
            <dd className="text-fg">{bulkChars.toLocaleString('pt-BR')}</dd>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import { AlertCircle, Copy, Flag, Gauge, Info, MoreHorizontal, Trash2 } from 'lucide-react';
import type { AnyNode, LessonGraph, Objective, Presentation, RichTextDocument } from '@lms/course-schema';
import { markMediaStale, nodeMedia, nodeSupportsMedia, replaceNode, withNodeMedia } from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import type { GenerateResult } from './generate';
import { InlineRichText, InlineTitle } from './inline-editors';
import { MediaStrip } from './media-strip';
import { isSpokenNode, NarrationFields, nodeNarration, spokenScript } from './narration-fields';
import { AssessmentFields, ChoiceOptions, ConsequenceFields, EndFields, MissionFields, NextScene, ReflectionFields, makePatch, type GraphChange } from './scene-fields';
import { sceneDot, sceneTypeLabel, type SceneEntry, type SceneNotice, type StoryboardModel } from './scene-model';
import { RecapEditor } from './recap-fields';
import { ACTIVE_JOB, type MediaJob } from './use-media-jobs';
import type { AgentProposal } from './use-agent-runs';
import { SceneVaryButton, SceneVaryProcessing, VariationChooser } from './scene-variations';
import { DirectionPanel, type DirectionAi } from '@/components/studio/direction/direction-panel';
import { TestFromHereButton } from '@/components/studio/test-mode/test-from-here';

export interface SceneCardProps {
  courseId: string;
  lessonId: string;
  graph: LessonGraph;
  entry: SceneEntry;
  model: StoryboardModel;
  notices: SceneNotice[];
  objectives: Objective[];
  presentation: Presentation;
  latestJob: MediaJob | undefined;
  changeGraph: GraphChange;
  onDuplicate(nodeId: string): void;
  onDelete(nodeId: string): void;
  onSetStart(nodeId: string): void;
  onOpenAdvanced(nodeId: string): void;
  onJobCreated(result: GenerateResult): Promise<void>;
  onJobsChanged(): Promise<void>;
  /** cartão agrupado sob uma opção de decisão */
  nested?: boolean;
  /** cartões agrupados sob as opções desta decisão */
  renderNested?: (optionId: string) => React.ReactNode;
  canDelete: boolean;
  /** comandos da IA para esta cena (só decisões e consequências) */
  ai?: {
    canVary: boolean;
    varying: boolean;
    proposal?: Extract<AgentProposal, { kind: 'scene_variations' }>;
    busy: boolean;
    onVary(): Promise<void>;
    onApply(opts: { choice: number; force?: boolean }): Promise<void>;
    onReject(): Promise<void>;
  };
  /** direção cinematográfica pela IA (cenas com vídeo) */
  directionAi?: DirectionAi;
  /** a cena recebeu foco ou clique (ex.: contexto do assistente) */
  onActivate?(nodeId: string): void;
  /** apontamentos da última avaliação de qualidade que citam esta cena */
  qualityCount?: number;
  /** abre o painel "Avaliação" já no primeiro apontamento desta cena */
  onOpenQuality?(nodeId: string): void;
}

const MAIN_TEXT_LABEL: Record<string, { label: string; placeholder: string }> = {
  scenario: { label: 'A situação', placeholder: 'Descreva a situação: quem está envolvido, onde, o que está acontecendo…' },
  content: { label: 'A explicação', placeholder: 'Explique o conceito, o passo a passo ou a dica…' },
  choice: { label: 'A pergunta', placeholder: 'Qual é a decisão que a pessoa precisa tomar?' },
  consequence: { label: 'O que acontece', placeholder: 'O que acontece depois dessa escolha?' },
  reflection: { label: 'A pergunta para refletir', placeholder: 'Que pergunta aberta a pessoa vai responder?' },
  mission: { label: 'A missão', placeholder: '' },
  assessment: { label: 'O enunciado', placeholder: 'Escreva a pergunta da verificação…' },
  end: { label: 'O resumo final', placeholder: 'O que fica dessa aula? Resuma em poucas linhas…' },
};

function mainText(node: AnyNode): RichTextDocument | undefined {
  switch (node.type) {
    case 'scenario':
    case 'content':
    case 'consequence':
      return node.body;
    case 'choice':
    case 'reflection':
    case 'assessment':
      return node.prompt;
    case 'end':
      return node.summary;
    default:
      return undefined;
  }
}

function withMainText(node: AnyNode, doc: RichTextDocument): AnyNode {
  switch (node.type) {
    case 'scenario':
    case 'content':
    case 'consequence':
      return { ...node, body: doc };
    case 'choice':
    case 'reflection':
    case 'assessment':
      return { ...node, prompt: doc };
    case 'end':
      return { ...node, summary: doc };
    default:
      return node;
  }
}

/** Nó da espinha: número da cena num círculo. Acento na primeira cena; pulsa com vídeo em geração. */
function SpineNode({ seq, reachable, isStart, active, nested }: { seq: number; reachable: boolean; isStart: boolean; active: boolean; nested?: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
        nested ? 'h-7 w-7' : 'absolute -left-9 top-4 h-7 w-7 sm:-left-[46px] sm:top-5 sm:h-8 sm:w-8',
        reachable ? 'border-accent bg-accent-fill text-accent-fill-fg' : 'border-dashed border-line-strong bg-surface-2 text-fg-faint',
        isStart && reachable && 'ring-4 ring-accent-soft',
        active && 'pulse-dot',
      )}
      aria-label={reachable ? `Cena ${seq}` : 'Cena fora do caminho'}
    >
      {reachable ? seq : '–'}
    </span>
  );
}

export function SceneCard(props: SceneCardProps) {
  const { courseId, lessonId, graph, entry, model, notices, objectives, presentation, latestJob, changeGraph, nested, renderNested, canDelete, ai } = props;
  const { node, seq, reachable } = entry;
  const headingId = `scene-heading-${node.id}`;
  const isStart = graph.startNodeId === node.id;
  const patch = makePatch<AnyNode>(node.id, changeGraph);
  const errors = notices.filter((n) => n.severity === 'error');
  const warnings = notices.filter((n) => n.severity === 'warning');
  const text = MAIN_TEXT_LABEL[node.type] ?? { label: 'Texto', placeholder: 'Clique para escrever…' };
  const activeJob = !!latestJob && ACTIVE_JOB.has(latestJob.status);

  const setText = (doc: RichTextDocument) =>
    changeGraph((g) => {
      const cur = g.nodes.find((n) => n.id === node.id);
      if (!cur) return g;
      const next = withMainText(cur, doc);
      // com fala própria, o texto da tela não muda o que o apresentador diz
      return replaceNode(g, nodeNarration(cur) ? next : markMediaStale(next));
    }, `node.text.${node.id}`);

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      id={`scene-${node.id}`}
      data-testid={`scene-${node.id}`}
      data-type={node.type}
      onFocusCapture={props.onActivate ? () => props.onActivate?.(node.id) : undefined}
      onPointerDownCapture={props.onActivate ? () => props.onActivate?.(node.id) : undefined}
      tabIndex={-1}
      className={cn(
        // margens internas menores no celular: sobra largura para o editor de plano e os controles aninhados
        'panel relative scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-accent',
        errors.length > 0 && 'ring-1 ring-danger/50',
        nested ? 'p-3 sm:p-4' : 'p-3 sm:p-6',
        !reachable && 'opacity-80',
      )}
    >
      {!nested && <SpineNode seq={seq} reachable={reachable} isStart={isStart} active={activeJob} />}
      {node.type === 'consequence' && (
        <span aria-hidden="true" className={cn('absolute inset-y-5 left-0 w-1 rounded-r-full', node.tone === 'positive' ? 'bg-success' : node.tone === 'negative' ? 'bg-danger' : 'bg-line-strong')} />
      )}

      {/* Cabeçalho do cartão */}
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {nested && <SpineNode seq={seq} reachable={reachable} isStart={isStart} active={activeJob} nested />}
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', sceneDot(node))} aria-hidden="true" />
              {sceneTypeLabel(node.type)}
            </span>
            {isStart && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Primeira cena</span>}
            {!!props.qualityCount && (
              <button
                type="button"
                className="inline-flex min-h-6 items-center gap-1 rounded-full bg-paid-soft px-2 py-0.5 font-medium text-paid hover:underline"
                onClick={() => props.onOpenQuality?.(node.id)}
                title="Ver na avaliação"
                aria-label={`${props.qualityCount} ${props.qualityCount === 1 ? 'apontamento' : 'apontamentos'} da avaliação nesta cena. Ver na avaliação`}
                data-testid={`scene-quality-${node.id}`}
              >
                <Gauge className="h-3 w-3" aria-hidden="true" />
                {props.qualityCount} {props.qualityCount === 1 ? 'apontamento' : 'apontamentos'}
              </button>
            )}
          </div>
          <h3 className={cn('display mt-0.5', nested ? 'text-lg' : 'text-xl sm:text-2xl')} id={headingId}>
            <InlineTitle id={`title-${node.id}`} testId="scene-title" label={`Título da cena ${reachable ? seq : ''}`.trim()} value={node.title ?? ''} placeholder={`Dê um nome a esta ${sceneTypeLabel(node.type).toLowerCase()}`} onChange={(v) => patch({ title: v }, `node.title.${node.id}`)} className="display" />
          </h3>
        </div>
        {/* Ações: linha própria no celular, à direita do título a partir de sm */}
        <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
          <TestFromHereButton courseId={courseId} lessonId={lessonId} graph={graph} nodeId={node.id} />
          {ai && !ai.varying && !ai.proposal && <SceneVaryButton nodeId={node.id} disabled={!ai.canVary} onVary={ai.onVary} />}
          <CardMenu nodeId={node.id} isStart={isStart} canDelete={canDelete} onDuplicate={props.onDuplicate} onDelete={props.onDelete} onSetStart={props.onSetStart} />
        </div>
      </header>
      {ai?.varying && (
        <div className="mt-3">
          <SceneVaryProcessing />
        </div>
      )}
      {ai?.proposal && (
        <div className="mt-3">
          <VariationChooser proposal={ai.proposal} busy={ai.busy} onApply={ai.onApply} onReject={ai.onReject} />
        </div>
      )}

      {/* Pendências */}
      {notices.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Pendências desta cena">
          {[...errors, ...warnings].map((n, i) => (
            <li key={`${n.code}-${i}`} data-testid={`notice-${n.code}`} title={n.technical} className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-1.5 text-sm', n.severity === 'error' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted')}>
              {n.severity === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="flex-1">{n.text}</span>
              {n.advanced && (
                <button type="button" className="min-h-6 rounded text-xs font-medium underline" onClick={() => props.onOpenAdvanced(node.id)}>
                  Abrir no modo avançado
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('mt-4 flex flex-col gap-5', nodeSupportsMedia(node) && (nested ? 'md:grid md:grid-cols-[minmax(0,1fr)_12rem] md:items-start' : 'md:grid md:grid-cols-[minmax(0,1fr)_15rem] md:items-start'))}>
      <div className={cn('min-w-0 space-y-4', nested && 'space-y-3')}>
        {/* Texto principal (a missão tem campos próprios, abaixo) */}
        {node.type !== 'mission' && (
          <div>
            <p className="mb-0.5 text-xs font-medium text-fg-muted">{text.label}</p>
            <InlineRichText id={`text-${node.id}`} label={text.label} placeholder={text.placeholder} value={mainText(node)} onChange={setText} />
          </div>
        )}

        {/* Fala e gesto do apresentador (vídeo) */}
        {isSpokenNode(node) && <NarrationFields node={node} changeGraph={changeGraph} />}

        {/* Direção: planos, câmeras, slides (vídeo). Na escolha fica junto da fala; nas demais cenas ocupa a largura toda, abaixo */}
        {isSpokenNode(node) && nodeSupportsMedia(node) && node.type === 'choice' && <DirectionPanel node={node} presentation={presentation} changeGraph={changeGraph} ai={props.directionAi} />}

        {/* Partes por tipo */}
        {node.type === 'choice' && <ChoiceOptions graph={graph} node={node} model={model} changeGraph={changeGraph} renderNested={renderNested ?? (() => null)} />}
        {node.type === 'consequence' && <ConsequenceFields node={node} changeGraph={changeGraph} />}
        {node.type === 'reflection' && <ReflectionFields node={node} changeGraph={changeGraph} />}
        {node.type === 'mission' && <MissionFields node={node} graph={graph} changeGraph={changeGraph} />}
        {node.type === 'assessment' && <AssessmentFields node={node} changeGraph={changeGraph} />}
        {node.type === 'end' && <EndFields node={node} changeGraph={changeGraph} />}
        {node.type === 'end' && <RecapEditor node={node} model={model} changeGraph={changeGraph} />}

        {/* Próxima cena */}
        {node.type !== 'choice' && node.type !== 'end' && <NextScene graph={graph} node={node} model={model} changeGraph={changeGraph} onOpenAdvanced={props.onOpenAdvanced} />}

        {/* Detalhes opcionais */}
        <details className="text-xs">
          <summary className="min-h-6 cursor-pointer select-none rounded text-fg-muted hover:text-fg">Mais detalhes</summary>
          <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-2.5">
            <fieldset>
              <legend className="mb-1 font-medium text-fg">Objetivos trabalhados nesta cena</legend>
              {objectives.length === 0 ? (
                <p className="text-fg-muted">Cadastre objetivos no painel do curso para ligá-los às cenas.</p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {objectives.map((o) => (
                    <li key={o.id}>
                      <label className="flex min-h-6 items-start gap-2 text-sm text-fg">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-accent"
                          checked={node.objectiveIds.includes(o.id)}
                          onChange={(e) => patch({ objectiveIds: e.target.checked ? [...node.objectiveIds, o.id] : node.objectiveIds.filter((x) => x !== o.id) })}
                        />
                        <span>{o.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <label className="flex min-h-6 items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={node.required} onChange={(e) => patch({ required: e.target.checked })} />
              Obrigatória para concluir a aula quando estiver no caminho da pessoa
            </label>
            <p className="text-fg-faint">Identificador: {node.id}</p>
          </div>
        </details>
      </div>

      {/* Quadro de vídeo: acima no celular, à direita no desktop */}
      {nodeSupportsMedia(node) && (
        <div className={cn('order-first min-w-0 md:order-none', !(isSpokenNode(node) && node.type !== 'choice') && 'md:sticky md:top-20')}>
          <MediaStrip
            courseId={courseId}
            lessonId={lessonId}
            nodeId={node.id}
            media={nodeMedia(node)}
            script={spokenScript(node)}
            narration={nodeNarration(node)}
            presentation={presentation}
            latestJob={latestJob}
            onMediaChange={(m) => changeGraph((g) => replaceNode(g, withNodeMedia(g.nodes.find((n) => n.id === node.id) ?? node, m)))}
            onJobCreated={props.onJobCreated}
            onJobCanceled={props.onJobsChanged}
            direction={'direction' in node ? node.direction : undefined}
          />
        </div>
      )}
      {isSpokenNode(node) && nodeSupportsMedia(node) && node.type !== 'choice' && (
        <div className="min-w-0 md:col-span-2">
          <DirectionPanel node={node} presentation={presentation} changeGraph={changeGraph} ai={props.directionAi} />
        </div>
      )}
      </div>
    </section>
  );
}

function CardMenu({
  nodeId,
  isStart,
  canDelete,
  onDuplicate,
  onDelete,
  onSetStart,
}: {
  nodeId: string;
  isStart: boolean;
  canDelete: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetStart: (id: string) => void;
}) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const item = 'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 disabled:opacity-50';
  return (
    <details ref={ref} className="relative shrink-0">
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden" aria-label="Ações da cena" data-testid="scene-menu">
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div role="menu" className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-line-strong bg-surface py-1 shadow-xl">
        <button type="button" role="menuitem" className={item} onClick={() => { close(); onDuplicate(nodeId); }} data-testid="scene-duplicate">
          <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar cena
        </button>
        <button type="button" role="menuitem" className={item} disabled={isStart} onClick={() => { close(); onSetStart(nodeId); }} data-testid="scene-set-start">
          <Flag className="h-4 w-4" aria-hidden="true" /> {isStart ? 'Já é a primeira cena' : 'Tornar a primeira cena'}
        </button>
        <button type="button" role="menuitem" className={cn(item, 'text-danger')} disabled={!canDelete} onClick={() => { close(); onDelete(nodeId); }} data-testid="scene-delete">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir cena
        </button>
      </div>
    </details>
  );
}

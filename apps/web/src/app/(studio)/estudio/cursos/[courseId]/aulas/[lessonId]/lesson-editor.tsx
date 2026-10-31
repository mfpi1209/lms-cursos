'use client';

import * as React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, History, Plus, Undo2 } from 'lucide-react';
import {
  EXECUTABLE_NODE_TYPES,
  NODE_TYPE_LABELS,
  compileLesson,
  findLesson,
  type ExecutableNodeType,
  type LessonGraph,
} from '@lms/course-schema';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { SaveStatus, useDraft } from '@/components/studio/draft-provider';
import { NODE_COLORS } from '@/components/studio/flow-map';
import {
  addNode,
  createNode,
  duplicateNode,
  moveNode,
  orderedNodes,
  removeEdges,
  removeNode,
  setNextEdge,
  setOptionEdge,
  setStartNode,
  updateLessonGraph,
} from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import { NodeForm, VariablesEditor } from './node-form';
import { RevisionsDrawer } from './revisions-drawer';
import { LiveIssues, ValidationPanel } from './validation-panel';

const FlowMap = dynamic(() => import('@/components/studio/flow-map').then((m) => m.FlowMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-fg-muted">Carregando mapa…</div>,
});

type MobileView = 'blocks' | 'map' | 'check';

export function LessonEditor({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { document: doc, update, undo, canUndo } = useDraft();
  const searchParams = useSearchParams();
  const found = findLesson(doc, lessonId);
  const graph = found?.lesson.graph;

  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get('node') ?? graph?.startNodeId ?? null);
  const [revisionsOpen, setRevisionsOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [view, setView] = React.useState<MobileView>('blocks');
  const addMenuRef = React.useRef<HTMLDivElement>(null);
  const formRef = React.useRef<HTMLDivElement>(null);

  const live = React.useMemo(
    () => (graph ? compileLesson(graph, { lessonId, objectiveIds: new Set(doc.objectives.map((o) => o.id)) }) : null),
    [graph, lessonId, doc.objectives],
  );
  const errorNodeIds = React.useMemo(() => new Set((live?.errors ?? []).map((i) => i.nodeId).filter((x): x is string => !!x)), [live]);

  // Fecha o menu "Adicionar bloco" ao clicar fora / Escape.
  React.useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [addOpen]);

  // Se o nó selecionado deixou de existir (exclusão/recarga), volta ao início.
  React.useEffect(() => {
    if (!graph) return;
    if (selectedId && !graph.nodes.some((n) => n.id === selectedId)) setSelectedId(graph.startNodeId);
  }, [graph, selectedId]);

  if (!found || !graph || !live) {
    return (
      <div className="space-y-3">
        <p className="text-fg-muted">Esta aula não existe mais no rascunho.</p>
        <Link href={`/estudio/cursos/${courseId}`} className="text-sm font-medium text-accent hover:underline">Painel do curso</Link>
      </div>
    );
  }

  const { lesson, module } = found;
  const changeGraph = (fn: (g: LessonGraph) => LessonGraph, coalesce?: string) =>
    update((d) => updateLessonGraph(d, lessonId, fn), coalesce ? { coalesce } : undefined);

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      setView('blocks');
      // leva o formulário à vista em telas pequenas
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  };

  const handleAdd = (type: ExecutableNodeType) => {
    const node = createNode(type);
    changeGraph((g) => addNode(g, node));
    setAddOpen(false);
    select(node.id);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    const node = graph.nodes.find((n) => n.id === selectedId);
    if (!node) return;
    if (!window.confirm(`Excluir o bloco "${node.title ?? node.id}" e todas as ligações que chegam ou saem dele?`)) return;
    const order = orderedNodes(graph).map((x) => x.node.id);
    const idx = order.indexOf(selectedId);
    const fallback = order[idx + 1] ?? order[idx - 1] ?? null;
    changeGraph((g) => removeNode(g, selectedId));
    setSelectedId(fallback);
  };

  const handleDuplicate = () => {
    if (!selectedId) return;
    let newId: string | null = null;
    changeGraph((g) => {
      const r = duplicateNode(g, selectedId);
      if (!r) return g;
      newId = r.newId;
      return r.graph;
    });
    if (newId) select(newId);
  };

  const selectedNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null;
  const ordered = orderedNodes(graph);
  const editorHref = `/estudio/cursos/${courseId}/aulas/${lessonId}`;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          <Link href={`/estudio/cursos/${courseId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md hover:text-fg hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Painel do curso
          </Link>
          <span aria-hidden="true" className="text-fg-faint">·</span>
          <span className="text-fg-faint">{module.title}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-2xl" data-testid="lesson-title">{lesson.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SaveStatus />
            <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração" data-testid="undo">
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRevisionsOpen(true)} data-testid="open-revisions">
              <History className="h-4 w-4" aria-hidden="true" /> Revisões
            </Button>
            <Link href={`${editorHref}/previa`} className={buttonVariants({ variant: 'secondary', size: 'sm' })} data-testid="preview-link">
              <Eye className="h-4 w-4" aria-hidden="true" /> Prévia
            </Link>
          </div>
        </div>
      </header>

      {/* Alternância de vista em telas pequenas */}
      <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1 xl:hidden" role="tablist" aria-label="Vista do editor">
        {(
          [
            ['blocks', 'Blocos'],
            ['map', 'Mapa'],
            ['check', 'Validação'],
          ] as [MobileView, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            aria-controls={`view-${v}`}
            onClick={() => setView(v)}
            className={cn('min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors', view === v ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg')}
          >
            {label}
            {v === 'check' && live.errors.length > 0 && <span className="ml-1 rounded-full bg-danger-soft px-1.5 text-xs text-danger">{live.errors.length}</span>}
          </button>
        ))}
      </div>

      {/*
        Grade: em xl, três colunas (lista | formulário | mapa) com a validação
        abaixo da lista. Em telas menores, as abas acima escolhem a vista.
        Cada painel é renderizado UMA vez (sem duplicar testids por breakpoint).
      */}
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
        {/* Lista de blocos + variáveis */}
        <div id="view-blocks-list" className={cn('space-y-4 xl:col-start-1 xl:row-start-1', view !== 'blocks' && 'hidden xl:block')}>
          <section aria-labelledby="blocks-heading" className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="blocks-heading" className="text-sm font-semibold text-fg">Blocos</h3>
              <div className="relative" ref={addMenuRef}>
                <Button size="sm" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)} data-testid="add-block">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar bloco
                </Button>
                {addOpen && (
                  <ul role="menu" aria-label="Tipo de bloco" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line-strong bg-surface py-1 shadow-xl">
                    {EXECUTABLE_NODE_TYPES.map((t) => (
                      <li key={t} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
                          onClick={() => handleAdd(t)}
                          data-testid={`add-block-${t}`}
                        >
                          <span className={cn('h-2.5 w-2.5 rounded-full', NODE_COLORS[t].dot)} aria-hidden="true" />
                          {NODE_TYPE_LABELS[t]}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <ol className="space-y-1" data-testid="block-list" aria-label="Blocos da aula em ordem de fluxo">
              {ordered.map(({ node, reachable }) => {
                const isStart = node.id === graph.startNodeId;
                const colors = NODE_COLORS[node.type];
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-testid={`block-${node.id}`}
                      aria-current={selectedId === node.id ? 'true' : undefined}
                      onClick={() => select(node.id)}
                      className={cn(
                        'flex min-h-11 w-full items-start gap-2 rounded-md border-l-2 px-2 py-2 text-left text-sm text-fg hover:bg-surface-2',
                        colors.border,
                        selectedId === node.id && 'bg-surface-2 ring-1 ring-accent/40',
                        !reachable && 'opacity-70',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                          <span className={cn('h-2 w-2 rounded-full', colors.dot)} aria-hidden="true" />
                          {NODE_TYPE_LABELS[node.type]}
                          {isStart && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">Início</span>}
                          {!reachable && <span className="text-fg-faint">(inalcançável)</span>}
                        </span>
                        <span className="block truncate">{node.title || node.id}</span>
                      </span>
                      {errorNodeIds.has(node.id) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Com erro" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <details className="panel p-3">
            <summary className="min-h-6 cursor-pointer rounded text-sm font-semibold text-fg">Variáveis da aula ({graph.variables.length})</summary>
            <div className="mt-3">
              <VariablesEditor variables={graph.variables} onChange={(variables) => changeGraph((g) => ({ ...g, variables }), 'vars')} />
            </div>
          </details>
        </div>

        {/* Validação (abaixo da lista em xl; aba própria em telas menores) */}
        <div id="view-check" className={cn('panel p-3 xl:col-start-1 xl:row-start-2', view !== 'check' && 'hidden xl:block')}>
          <ValidationPanel courseId={courseId} lessonId={lessonId} live={live} onSelectNode={select} />
          <div className="mt-3">
            <LiveIssues live={live} onSelectNode={select} />
          </div>
        </div>

        {/* Formulário do bloco */}
        <div id="view-blocks" ref={formRef} className={cn('panel p-4 xl:col-start-2 xl:row-span-2 xl:row-start-1', view !== 'blocks' && 'hidden xl:block')}>
          {selectedNode ? (
            <NodeForm
              key={selectedNode.id}
              courseId={courseId}
              lessonId={lessonId}
              graph={graph}
              node={selectedNode}
              objectives={doc.objectives}
              onGraphChange={changeGraph}
              onSetStart={() => changeGraph((g) => setStartNode(g, selectedNode.id))}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              canDelete={graph.nodes.length > 1}
            />
          ) : (
            <p className="text-sm text-fg-muted">Selecione um bloco na lista ou no mapa.</p>
          )}
        </div>

        {/* Mapa */}
        <div
          id="view-map"
          className={cn(
            'panel h-[480px] overflow-hidden xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:h-[calc(100dvh-8rem)] xl:self-start xl:sticky xl:top-4',
            view !== 'map' && 'hidden xl:block',
          )}
        >
          <FlowMap
            graph={graph}
            selectedId={selectedId}
            errorNodeIds={errorNodeIds}
            onSelect={select}
            onMoveNode={(id, pos) => changeGraph((g) => moveNode(g, id, pos), `move.${id}`)}
            onConnect={({ from, to, optionId }) => changeGraph((g) => (optionId ? setOptionEdge(g, from, optionId, to) : setNextEdge(g, from, to)))}
            onDeleteEdges={(ids) => changeGraph((g) => removeEdges(g, ids))}
          />
        </div>
      </div>

      <RevisionsDrawer
        open={revisionsOpen}
        onClose={() => setRevisionsOpen(false)}
      />

      <p className="text-xs text-fg-muted">
        <Badge tone="neutral">Dica</Badge> Tudo que o mapa faz também é possível pelo formulário: destinos, saídas condicionais e bloco inicial.
      </p>
    </div>
  );
}

'use client';

import * as React from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react';
import { NODE_TYPE_LABELS, type AnyNode, type LessonGraph, type NodeType } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { describeCondition, resolvePositions } from './graph-ops';

/* ------------------------------------------------------------------ */
/* Aparência por tipo                                                  */
/* ------------------------------------------------------------------ */

/** Todos os nós compartilham a superfície; só o ponto muda (acento para decisão e verificação). */
const BASE = { bg: 'bg-surface-2', border: 'border-line', text: 'text-fg' };
const PENDING = { bg: 'bg-surface-2', border: 'border-dashed border-line', text: 'text-fg-muted', dot: 'bg-fg-faint' };
export const NODE_COLORS: Record<NodeType, { bg: string; border: string; text: string; dot: string }> = {
  scenario: { ...BASE, dot: 'bg-fg-muted' },
  content: { ...BASE, dot: 'bg-fg-muted' },
  choice: { ...BASE, dot: 'bg-accent' },
  consequence: { ...BASE, dot: 'bg-fg-muted' },
  reflection: { ...BASE, dot: 'bg-fg-muted' },
  assessment: { ...BASE, dot: 'bg-accent' },
  end: { ...BASE, dot: 'bg-fg-faint' },
  dialogue: PENDING,
  task: PENDING,
  evidence: PENDING,
  resource_simulation: PENDING,
  ai_feedback: PENDING,
};

const MINIMAP_COLOR: Record<NodeType, string> = {
  scenario: 'var(--t-fg-faint)',
  content: 'var(--t-fg-faint)',
  choice: 'var(--t-accent)',
  consequence: 'var(--t-fg-faint)',
  reflection: 'var(--t-fg-faint)',
  assessment: 'var(--t-accent)',
  end: 'var(--t-line-strong)',
  dialogue: 'var(--t-line)',
  task: 'var(--t-line)',
  evidence: 'var(--t-line)',
  resource_simulation: 'var(--t-line)',
  ai_feedback: 'var(--t-line)',
};

type BlockNodeData = {
  node: AnyNode;
  isStart: boolean;
  hasError: boolean;
  [key: string]: unknown;
};
type BlockNode = RFNode<BlockNodeData, 'block'>;

function BlockNodeComponent({ data, selected }: NodeProps<BlockNode>) {
  const { node, isStart, hasError } = data;
  const colors = NODE_COLORS[node.type];
  const sourceHandles =
    node.type === 'choice' ? node.options.map((o) => ({ id: o.id, label: o.label })) : node.type === 'end' ? [] : [{ id: 'next', label: 'Próximo' }];
  return (
    <div
      className={cn(
        'w-56 rounded-lg border bg-bg shadow-sm',
        colors.border,
        selected && 'border-accent ring-4 ring-accent/25',
        hasError && 'outline outline-2 outline-danger',
      )}
      aria-label={`${NODE_TYPE_LABELS[node.type]}: ${node.title ?? node.id}`}
    >
      <Handle type="target" position={Position.Top} id="in" className="h-3! w-3! border-bg! bg-fg-muted!" aria-label="Entrada" />
      <div className={cn('flex items-center gap-2 rounded-t-lg px-2 py-1 text-[11px] font-medium', colors.bg, 'text-fg-muted')}>
        <span className={cn('h-2 w-2 rounded-full', colors.dot)} aria-hidden="true" />
        <span className="truncate">{NODE_TYPE_LABELS[node.type]}</span>
        {isStart && <span className="ml-auto rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Início</span>}
      </div>
      <div className={cn('px-2 py-2 text-sm font-medium leading-snug', colors.text)}>
        <span className="line-clamp-2">{node.title || node.id}</span>
      </div>
      {sourceHandles.length > 0 && (
        <div className="relative flex h-5 items-end justify-around px-1">
          {sourceHandles.map((h) => (
            <Handle
              key={h.id}
              type="source"
              position={Position.Bottom}
              id={h.id}
              title={h.label}
              aria-label={`Saída: ${h.label}`}
              className={cn('static! transform-none! h-3! w-3! translate-y-1.5! border-bg!', node.type === 'choice' ? 'bg-accent!' : 'bg-fg-muted!')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { block: BlockNodeComponent };

/* ------------------------------------------------------------------ */
/* Mapa                                                                */
/* ------------------------------------------------------------------ */

export interface FlowMapProps {
  graph: LessonGraph;
  selectedId: string | null;
  /** IDs de nós com erro de compilação (destacados) */
  errorNodeIds?: Set<string>;
  onSelect(nodeId: string | null): void;
  onMoveNode(nodeId: string, position: { x: number; y: number }): void;
  /** Conexão criada no mapa. `optionId` vem do handle de origem em decisões. */
  onConnect(input: { from: string; to: string; optionId?: string }): void;
  onDeleteEdges(edgeIds: string[]): void;
  className?: string;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function buildNodes(graph: LessonGraph, selectedId: string | null, errorNodeIds?: Set<string>): BlockNode[] {
  const positions = resolvePositions(graph);
  return graph.nodes.map((n) => ({
    id: n.id,
    type: 'block',
    position: positions[n.id] ?? { x: 0, y: 0 },
    selected: n.id === selectedId,
    data: { node: n, isStart: n.id === graph.startNodeId, hasError: errorNodeIds?.has(n.id) ?? false },
  }));
}

function buildEdges(graph: LessonGraph): RFEdge[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const title = (id: string) => byId.get(id)?.title || id;
  return graph.edges.map((e) => {
    const from = byId.get(e.from);
    let label = '';
    let stroke = 'var(--t-line-strong)';
    let dashed = false;
    if (from?.type === 'choice') {
      const opt = from.options.find((o) => o.id === e.optionId);
      label = opt ? opt.label : `opção ${e.optionId ?? '?'}`;
      stroke = 'var(--t-accent)';
    }
    if (e.isDefault) {
      label = label ? `${label} · senão` : 'senão';
      stroke = 'var(--t-fg-faint)';
    } else if (e.condition) {
      const cond = `se ${describeCondition(e.condition, title)}`;
      label = label ? `${label} · ${cond}` : cond;
      dashed = true;
    }
    const sourceHandle = from?.type === 'choice' ? e.optionId : 'next';
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: sourceHandle ?? undefined,
      targetHandle: 'in',
      label: label.length > 48 ? `${label.slice(0, 47)}…` : label,
      type: 'smoothstep',
      style: { stroke, strokeWidth: 1.5, strokeDasharray: dashed ? '6 4' : undefined },
      labelStyle: { fontSize: 11, fill: 'var(--t-fg-muted)' },
      labelBgStyle: { fill: 'var(--t-bg)', fillOpacity: 0.95 },
      labelBgPadding: [4, 2] as [number, number],
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 },
      ariaLabel: `De ${title(e.from)} para ${title(e.to)}${label ? `: ${label}` : ''}`,
    };
  });
}

function FlowMapInner({ graph, selectedId, errorNodeIds, onSelect, onMoveNode, onConnect, onDeleteEdges, className }: FlowMapProps) {
  const large = useMediaQuery('(min-width: 1024px)');
  const [nodes, setNodes] = React.useState<BlockNode[]>(() => buildNodes(graph, selectedId, errorNodeIds));
  const edges = React.useMemo(() => buildEdges(graph), [graph]);

  // Sincroniza a partir do grafo (fonte da verdade); o estado local só existe
  // para que o arrasto seja fluido antes de gravar a posição.
  React.useEffect(() => {
    setNodes(buildNodes(graph, selectedId, errorNodeIds));
  }, [graph, selectedId, errorNodeIds]);

  const onNodesChange = React.useCallback((changes: NodeChange<BlockNode>[]) => {
    // Remoção de nós só pelo formulário (com confirmação); o mapa não remove blocos.
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  }, []);

  const handleConnect = React.useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const from = graph.nodes.find((n) => n.id === c.source);
      if (!from || from.type === 'end') return;
      if (from.type === 'choice') {
        if (!c.sourceHandle) return;
        onConnect({ from: c.source, to: c.target, optionId: c.sourceHandle });
      } else {
        onConnect({ from: c.source, to: c.target });
      }
    },
    [graph, onConnect],
  );

  return (
    <div className={cn('relative h-full w-full', className)} data-testid="flow-map">
      <ReactFlow<BlockNode, RFEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_e, n) => onSelect(n.id)}
        onNodeDragStop={(_e, n) => onMoveNode(n.id, n.position)}
        onConnect={handleConnect}
        onEdgesDelete={(deleted) => onDeleteEdges(deleted.map((e) => e.id))}
        onBeforeDelete={async ({ edges: toDelete }) => ({ nodes: [], edges: toDelete.filter((e) => e.selected) })}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesConnectable
        elementsSelectable
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        aria-label="Mapa de fluxo da aula"
      >
        <Background gap={24} color="var(--t-line)" />
        <Controls aria-label="Controles do mapa" showInteractive={false} />
        {large && <MiniMap pannable zoomable ariaLabel="Miniatura do mapa" nodeColor={(n) => MINIMAP_COLOR[(n as BlockNode).data.node.type]} />}
      </ReactFlow>
    </div>
  );
}

/** Mapa de fluxo: vista alternativa do mesmo grafo. Arrastar só altera `layout.positions`. */
export function FlowMap(props: FlowMapProps) {
  return (
    <ReactFlowProvider>
      <FlowMapInner {...props} />
    </ReactFlowProvider>
  );
}

export default FlowMap;

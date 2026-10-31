'use client';

import * as React from 'react';
import { Copy, Flag, Plus, Trash2 } from 'lucide-react';
import {
  NODE_TYPE_LABELS,
  type AnyNode,
  type AssessmentNode,
  type ChoiceNode,
  type Condition,
  type ConsequenceNode,
  type Edge,
  type Effect,
  type EndNode,
  type LessonGraph,
  type Objective,
  type ReflectionNode,
  type RichTextDocument,
  type VariableDeclaration,
} from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/input';
import { RichTextEditor } from '@/components/studio/rich-text-editor';
import { ScaffoldFields } from '@/components/studio/scaffold-fields';
import { MediaPanel } from '@/components/studio/media-panel';
import { ReactionFineAdjust, SceneFineAdjust } from '@/components/studio/fine-adjust';
import {
  addConditionalEdge,
  conditionalEdges,
  describeCondition,
  newOptionId,
  nodeMedia,
  nodeScriptText,
  nodeSupportsMedia,
  primaryEdge,
  removeEdges,
  replaceEdge,
  replaceNode,
  setNextEdge,
  setOptionEdge,
  withNodeMedia,
} from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';

const selectClass = 'block min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-base text-fg focus:border-accent focus:outline-none';

export interface NodeFormProps {
  courseId: string;
  lessonId: string;
  graph: LessonGraph;
  node: AnyNode;
  objectives: Objective[];
  /** aplica uma transformação ao grafo; `coalesce` agrupa digitação para desfazer */
  onGraphChange(fn: (g: LessonGraph) => LessonGraph, coalesce?: string): void;
  onSetStart(): void;
  onDuplicate(): void;
  onDelete(): void;
  canDelete: boolean;
}

export function NodeForm({ courseId, lessonId, graph, node, objectives, onGraphChange, onSetStart, onDuplicate, onDelete, canDelete }: NodeFormProps) {
  const patch = <N extends AnyNode>(p: Partial<N>, coalesce?: string) => onGraphChange((g) => replaceNode(g, { ...(node as N), ...p } as AnyNode), coalesce);
  /**
   * Alteração do texto principal (body/prompt). Se a mídia foi gerada a partir
   * do texto, marca `stale` na MESMA atualização — nunca gera nada sozinho.
   */
  const patchText = <N extends AnyNode>(p: Partial<N>, coalesce?: string) =>
    onGraphChange((g) => {
      let next = { ...(node as N), ...p } as AnyNode;
      const media = nodeMedia(next);
      if (media?.generatedFrom && !media.stale) next = withNodeMedia(next, { ...media, stale: true });
      return replaceNode(g, next);
    }, coalesce);
  const media = nodeMedia(node);
  const nodeTitle = (id: string) => graph.nodes.find((n) => n.id === id)?.title || id;
  const others = graph.nodes.filter((n) => n.id !== node.id);
  const isStart = graph.startNodeId === node.id;

  return (
    <div className="space-y-5" data-testid="node-form" aria-label={`Bloco ${node.title ?? node.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">{NODE_TYPE_LABELS[node.type]}</p>
          <p className="text-xs text-fg-faint">ID: {node.id}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="secondary" size="sm" onClick={onSetStart} disabled={isStart} data-testid="node-set-start">
            <Flag className="h-4 w-4" aria-hidden="true" /> {isStart ? 'Bloco inicial' : 'Definir como bloco inicial'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDuplicate} data-testid="node-duplicate">
            <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar bloco
          </Button>
          <Button variant="secondary" size="sm" className="text-danger" onClick={onDelete} disabled={!canDelete} data-testid="node-delete">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir bloco
          </Button>
        </div>
      </div>

      <Field label="Título" htmlFor={`node-title-${node.id}`} hint="Aparece na lista e no mapa; o aluno vê como cabeçalho do bloco.">
        <Input id={`node-title-${node.id}`} data-testid="node-title" maxLength={120} value={node.title ?? ''} onChange={(e) => patch({ title: e.target.value }, `node.title.${node.id}`)} />
      </Field>

      <ObjectiveChecks
        id={`node-obj-${node.id}`}
        objectives={objectives}
        selected={node.objectiveIds}
        onChange={(ids) => patch({ objectiveIds: ids })}
      />

      <label className="flex min-h-6 items-center gap-2 text-sm text-fg">
        <input type="checkbox" className="h-4 w-4 accent-accent" checked={node.required} onChange={(e) => patch({ required: e.target.checked })} data-testid="node-required" />
        Obrigatório para conclusão quando estiver no caminho do aluno
      </label>

      {(node.type === 'scenario' || node.type === 'content') && (
        <RichField id={`node-body-${node.id}`} label="Texto" value={node.body} onChange={(doc) => patchText({ body: doc }, `node.body.${node.id}`)} />
      )}

      {node.type === 'choice' && <ChoiceFields courseId={courseId} lessonId={lessonId} graph={graph} node={node} others={others} patch={patch} patchText={patchText} onGraphChange={onGraphChange} />}

      {node.type === 'consequence' && <ConsequenceFields graph={graph} node={node} patch={patch} patchText={patchText} />}

      {nodeSupportsMedia(node) && (
        <MediaPanel
          courseId={courseId}
          lessonId={lessonId}
          nodeId={node.id}
          media={media}
          scriptDefault={nodeScriptText(node)}
          onChange={(m, coalesce) => onGraphChange((g) => replaceNode(g, withNodeMedia(g.nodes.find((n) => n.id === node.id) ?? node, m)), coalesce)}
        />
      )}

      {nodeSupportsMedia(node) && media?.kind === 'video' && media.generatedFrom?.jobId && (
        <SceneFineAdjust courseId={courseId} lessonId={lessonId} nodeId={node.id} mediaAssetId={media.assetId} />
      )}

      {node.type === 'reflection' && <ReflectionFields node={node} patch={patch} />}

      {node.type === 'assessment' && <AssessmentFields node={node} patch={patch} />}

      {node.type === 'end' && <EndFields node={node} patch={patch} />}

      {!['scenario', 'content', 'choice', 'consequence', 'reflection', 'assessment', 'end'].includes(node.type) && (
        <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          Este tipo de bloco ainda não tem executor. Ele bloqueia a publicação; troque por um tipo disponível ou exclua.
        </p>
      )}

      {node.type !== 'choice' && node.type !== 'end' && (
        <ExitsEditor graph={graph} node={node} others={others} nodeTitle={nodeTitle} onGraphChange={onGraphChange} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campos compartilhados                                               */
/* ------------------------------------------------------------------ */

function RichField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: RichTextDocument | undefined; onChange: (d: RichTextDocument) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <RichTextEditor id={id} value={value} onChange={onChange} />
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function ObjectiveChecks({ id, objectives, selected, onChange }: { id: string; objectives: Objective[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-fg-muted">Objetivos trabalhados</legend>
      {objectives.length === 0 ? (
        <p className="text-xs text-fg-muted">Cadastre objetivos no painel do curso.</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {objectives.map((o) => (
            <li key={o.id}>
              <label className="flex min-h-6 items-start gap-2 text-sm text-fg" htmlFor={`${id}-${o.id}`}>
                <input
                  id={`${id}-${o.id}`}
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-accent"
                  checked={selected.includes(o.id)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
                />
                <span>{o.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function DestinationSelect({
  id,
  label,
  value,
  others,
  onChange,
  testId,
  allowNone = true,
}: {
  id: string;
  label: string;
  value: string | undefined;
  others: AnyNode[];
  onChange: (to: string | null) => void;
  testId?: string;
  allowNone?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} data-testid={testId} className={selectClass} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowNone && <option value="">— sem destino —</option>}
        {others.map((n) => (
          <option key={n.id} value={n.id}>
            {NODE_TYPE_LABELS[n.type]}: {n.title || n.id}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decisão                                                             */
/* ------------------------------------------------------------------ */

function ChoiceFields({
  courseId,
  lessonId,
  graph,
  node,
  others,
  patch,
  patchText,
  onGraphChange,
}: {
  courseId: string;
  lessonId: string;
  graph: LessonGraph;
  node: ChoiceNode;
  others: AnyNode[];
  patch: (p: Partial<ChoiceNode>, coalesce?: string) => void;
  patchText: (p: Partial<ChoiceNode>, coalesce?: string) => void;
  onGraphChange: NodeFormProps['onGraphChange'];
}) {
  const setOption = (optId: string, p: Partial<ChoiceNode['options'][number]>, coalesce?: string) =>
    patch({ options: node.options.map((o) => (o.id === optId ? { ...o, ...p } : o)) }, coalesce);
  return (
    <div className="space-y-4">
      <RichField id={`node-prompt-${node.id}`} label="Pergunta / situação de decisão" value={node.prompt} onChange={(d) => patchText({ prompt: d }, `node.prompt.${node.id}`)} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-fg-muted">Opções (2 a 6). O destino de cada opção é a única ligação de saída.</legend>
        {node.options.map((o, idx) => {
          const edge = graph.edges.find((e) => e.from === node.id && e.optionId === o.id);
          return (
            <div key={o.id} className="space-y-3 rounded-lg border border-line bg-surface-2/60 p-3" data-testid={`option-${o.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <Field label={`Opção ${idx + 1}`} htmlFor={`opt-label-${o.id}`}>
                    <Input id={`opt-label-${o.id}`} maxLength={300} value={o.label} onChange={(e) => setOption(o.id, { label: e.target.value }, `opt.label.${o.id}`)} />
                  </Field>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-6 text-danger"
                  aria-label={`Remover opção ${idx + 1}`}
                  disabled={node.options.length <= 2}
                  onClick={() => onGraphChange((g) => setOptionEdge(replaceNode(g, { ...node, options: node.options.filter((x) => x.id !== o.id) }), node.id, o.id, null))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <RichField id={`opt-feedback-${o.id}`} label="Feedback ao escolher" value={o.feedback} onChange={(d) => setOption(o.id, { feedback: d }, `opt.fb.${o.id}`)} />
              <ReactionFineAdjust courseId={courseId} lessonId={lessonId} choiceId={node.id} optionId={o.id} reaction={o.reaction} />
              <DestinationSelect
                id={`opt-dest-${o.id}`}
                testId={`option-dest-${o.id}`}
                label="Destino desta opção"
                value={edge?.to}
                others={others}
                onChange={(to) => onGraphChange((g) => setOptionEdge(g, node.id, o.id, to))}
              />
            </div>
          );
        })}
        <Button
          variant="secondary"
          size="sm"
          disabled={node.options.length >= 6}
          onClick={() => patch({ options: [...node.options, { id: newOptionId(), label: `Opção ${node.options.length + 1}` }] })}
          data-testid="add-option"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar opção
        </Button>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Consequência                                                        */
/* ------------------------------------------------------------------ */

const TONE_LABELS: Record<ConsequenceNode['tone'], string> = { positive: 'Positiva', neutral: 'Neutra', negative: 'Negativa' };

function ConsequenceFields({
  graph,
  node,
  patch,
  patchText,
}: {
  graph: LessonGraph;
  node: ConsequenceNode;
  patch: (p: Partial<ConsequenceNode>, coalesce?: string) => void;
  patchText: (p: Partial<ConsequenceNode>, coalesce?: string) => void;
}) {
  return (
    <div className="space-y-4">
      <RichField id={`node-body-${node.id}`} label="O que acontece" value={node.body} onChange={(d) => patchText({ body: d }, `node.body.${node.id}`)} />
      <Field label="Tom" htmlFor={`node-tone-${node.id}`}>
        <select id={`node-tone-${node.id}`} className={selectClass} value={node.tone} onChange={(e) => patch({ tone: e.target.value as ConsequenceNode['tone'] })}>
          {(Object.keys(TONE_LABELS) as ConsequenceNode['tone'][]).map((t) => (
            <option key={t} value={t}>{TONE_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      <RichField
        id={`node-guidance-${node.id}`}
        label="Orientação"
        hint="O que fazer diferente ou por que funcionou."
        value={node.guidance}
        onChange={(d) => patch({ guidance: d }, `node.guidance.${node.id}`)}
      />
      <EffectsEditor id={`node-effects-${node.id}`} variables={graph.variables} effects={node.effects ?? []} onChange={(effects) => patch({ effects: effects.length ? effects : undefined })} />
    </div>
  );
}

function EffectsEditor({ id, variables, effects, onChange }: { id: string; variables: VariableDeclaration[]; effects: Effect[]; onChange: (e: Effect[]) => void }) {
  const varType = (name: string) => variables.find((v) => v.name === name)?.type;
  const setAt = (i: number, e: Effect) => onChange(effects.map((x, j) => (j === i ? e : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-fg-muted">Efeitos nas variáveis</legend>
      {variables.length === 0 && <p className="text-xs text-fg-muted">Declare variáveis na aula para usar efeitos.</p>}
      {effects.map((ef, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor={`${id}-op-${i}`}>Operação</Label>
            <select
              id={`${id}-op-${i}`}
              className={selectClass}
              value={ef.op}
              onChange={(e) => {
                const op = e.target.value as Effect['op'];
                setAt(i, op === 'inc' ? { op: 'inc', var: ef.var, by: 1 } : { op: 'set', var: ef.var, value: defaultFor(varType(ef.var)) });
              }}
            >
              <option value="set">definir</option>
              <option value="inc" disabled={varType(ef.var) !== 'number'}>somar</option>
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-var-${i}`}>Variável</Label>
            <select
              id={`${id}-var-${i}`}
              className={selectClass}
              value={ef.var}
              onChange={(e) => {
                const name = e.target.value;
                const t = varType(name);
                setAt(i, ef.op === 'inc' && t === 'number' ? { op: 'inc', var: name, by: ef.by } : { op: 'set', var: name, value: defaultFor(t) });
              }}
            >
              {!variables.some((v) => v.name === ef.var) && <option value={ef.var}>{ef.var} (não declarada)</option>}
              {variables.map((v) => (
                <option key={v.name} value={v.name}>{v.label ? `${v.label} (${v.name})` : v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-val-${i}`}>{ef.op === 'inc' ? 'Somar' : 'Valor'}</Label>
            {ef.op === 'inc' ? (
              <Input id={`${id}-val-${i}`} type="number" value={ef.by} onChange={(e) => setAt(i, { ...ef, by: Number(e.target.value) || 0 })} />
            ) : (
              <ScalarInput id={`${id}-val-${i}`} type={varType(ef.var) ?? 'string'} value={ef.value} onChange={(value) => setAt(i, { ...ef, value })} />
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-danger" aria-label={`Remover efeito ${i + 1}`} onClick={() => onChange(effects.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={variables.length === 0 || effects.length >= 10}
        onClick={() => {
          const v = variables[0]!;
          onChange([...effects, { op: 'set', var: v.name, value: defaultFor(v.type) }]);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar efeito
      </Button>
    </fieldset>
  );
}

type Scalar = number | boolean | string;
function defaultFor(type: VariableDeclaration['type'] | undefined): Scalar {
  return type === 'number' ? 0 : type === 'boolean' ? false : '';
}

function ScalarInput({ id, type, value, onChange }: { id: string; type: VariableDeclaration['type']; value: Scalar; onChange: (v: Scalar) => void }) {
  if (type === 'boolean') {
    return (
      <select id={id} className={selectClass} value={String(value === true)} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">verdadeiro</option>
        <option value="false">falso</option>
      </select>
    );
  }
  if (type === 'number') {
    return <Input id={id} type="number" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
  }
  return <Input id={id} maxLength={200} value={typeof value === 'string' ? value : String(value)} onChange={(e) => onChange(e.target.value)} />;
}

/* ------------------------------------------------------------------ */
/* Reflexão                                                            */
/* ------------------------------------------------------------------ */

function ReflectionFields({ node, patch }: { node: ReflectionNode; patch: (p: Partial<ReflectionNode>, coalesce?: string) => void }) {
  return (
    <div className="space-y-4">
      <RichField id={`node-prompt-${node.id}`} label="Pergunta para reflexão" value={node.prompt} onChange={(d) => patch({ prompt: d }, `node.prompt.${node.id}`)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mínimo de caracteres" htmlFor={`node-min-${node.id}`}>
          <Input
            id={`node-min-${node.id}`}
            type="number"
            min={0}
            max={2000}
            value={node.minLength}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 0 && v <= 2000) patch({ minLength: v });
            }}
          />
        </Field>
        <Field label="Máximo de caracteres" htmlFor={`node-max-${node.id}`}>
          <Input
            id={`node-max-${node.id}`}
            type="number"
            min={10}
            max={5000}
            value={node.maxLength}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 10 && v <= 5000) patch({ maxLength: v });
            }}
          />
        </Field>
      </div>
      <Field label="Texto de apoio no campo (placeholder)" htmlFor={`node-ph-${node.id}`}>
        <Input id={`node-ph-${node.id}`} maxLength={200} value={node.placeholder ?? ''} onChange={(e) => patch({ placeholder: e.target.value || undefined }, `node.ph.${node.id}`)} />
      </Field>
      <ScaffoldFields idPrefix={`node-${node.id}`} scaffold={node.scaffold} onChange={(scaffold, coalesce) => patch({ scaffold }, coalesce)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avaliação                                                           */
/* ------------------------------------------------------------------ */

function AssessmentFields({ node, patch }: { node: AssessmentNode; patch: (p: Partial<AssessmentNode>, coalesce?: string) => void }) {
  const setOption = (optId: string, p: Partial<AssessmentNode['options'][number]>, coalesce?: string) =>
    patch({ options: node.options.map((o) => (o.id === optId ? { ...o, ...p } : o)) }, coalesce);
  const correctCount = node.options.filter((o) => o.correct).length;
  return (
    <div className="space-y-4">
      <RichField id={`node-prompt-${node.id}`} label="Enunciado" value={node.prompt} onChange={(d) => patch({ prompt: d }, `node.prompt.${node.id}`)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Modo" htmlFor={`node-mode-${node.id}`}>
          <select id={`node-mode-${node.id}`} className={selectClass} value={node.mode} onChange={(e) => patch({ mode: e.target.value as AssessmentNode['mode'] })}>
            <option value="single">Resposta única</option>
            <option value="multiple">Múltiplas respostas</option>
          </select>
        </Field>
        <Field label="Critério de aprovação" htmlFor={`node-passing-${node.id}`}>
          <select
            id={`node-passing-${node.id}`}
            className={selectClass}
            value={node.passing.kind}
            onChange={(e) => patch({ passing: e.target.value === 'min_correct' ? { kind: 'min_correct', min: Math.max(1, correctCount) } : { kind: 'all_correct' } })}
          >
            <option value="all_correct">Todas as corretas</option>
            <option value="min_correct">Mínimo de acertos</option>
          </select>
        </Field>
        {node.passing.kind === 'min_correct' ? (
          <Field label="Mínimo de acertos" htmlFor={`node-min-${node.id}`}>
            <Input
              id={`node-min-${node.id}`}
              type="number"
              min={1}
              value={node.passing.min}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1) patch({ passing: { kind: 'min_correct', min: v } });
              }}
            />
          </Field>
        ) : (
          <div aria-hidden="true" />
        )}
        <Field label="Tentativas permitidas" htmlFor={`node-attempts-${node.id}`}>
          <Input
            id={`node-attempts-${node.id}`}
            type="number"
            min={1}
            max={10}
            value={node.maxAttempts}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 1 && v <= 10) patch({ maxAttempts: v });
            }}
          />
        </Field>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-fg-muted">Alternativas (2 a 8)</legend>
        {node.options.map((o, idx) => (
          <div key={o.id} className="space-y-3 rounded-lg border border-line bg-surface-2/60 p-3" data-testid={`option-${o.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Field label={`Alternativa ${idx + 1}`} htmlFor={`aopt-label-${o.id}`}>
                  <Input id={`aopt-label-${o.id}`} maxLength={300} value={o.label} onChange={(e) => setOption(o.id, { label: e.target.value }, `aopt.label.${o.id}`)} />
                </Field>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-6 text-danger"
                aria-label={`Remover alternativa ${idx + 1}`}
                disabled={node.options.length <= 2}
                onClick={() => patch({ options: node.options.filter((x) => x.id !== o.id) })}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <label className="flex min-h-6 items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="h-4 w-4 accent-success" checked={o.correct} onChange={(e) => setOption(o.id, { correct: e.target.checked })} />
              Correta
            </label>
            <RichField id={`aopt-feedback-${o.id}`} label="Feedback desta alternativa" value={o.feedback} onChange={(d) => setOption(o.id, { feedback: d }, `aopt.fb.${o.id}`)} />
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          disabled={node.options.length >= 8}
          onClick={() => patch({ options: [...node.options, { id: newOptionId(), label: `Alternativa ${node.options.length + 1}`, correct: false }] })}
          data-testid="add-option"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar alternativa
        </Button>
      </fieldset>
      <RichField id={`node-fb-pass-${node.id}`} label="Feedback ao ser aprovado" value={node.feedbackPassed} onChange={(d) => patch({ feedbackPassed: d }, `node.fbp.${node.id}`)} />
      <RichField id={`node-fb-fail-${node.id}`} label="Feedback ao não atingir o critério" value={node.feedbackFailed} onChange={(d) => patch({ feedbackFailed: d }, `node.fbf.${node.id}`)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Encerramento                                                        */
/* ------------------------------------------------------------------ */

function EndFields({ node, patch }: { node: EndNode; patch: (p: Partial<EndNode>, coalesce?: string) => void }) {
  return (
    <div className="space-y-4">
      <RichField id={`node-summary-${node.id}`} label="Resumo de encerramento" value={node.summary} onChange={(d) => patch({ summary: d }, `node.summary.${node.id}`)} />
      <Field label="Rótulo do resultado" htmlFor={`node-outcome-${node.id}`} hint="Ex.: Aula concluída.">
        <Input id={`node-outcome-${node.id}`} maxLength={80} value={node.outcomeLabel ?? ''} onChange={(e) => patch({ outcomeLabel: e.target.value || undefined }, `node.outcome.${node.id}`)} />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Saídas: próximo bloco + condicionais                                 */
/* ------------------------------------------------------------------ */

function ExitsEditor({
  graph,
  node,
  others,
  nodeTitle,
  onGraphChange,
}: {
  graph: LessonGraph;
  node: AnyNode;
  others: AnyNode[];
  nodeTitle: (id: string) => string;
  onGraphChange: NodeFormProps['onGraphChange'];
}) {
  const next = primaryEdge(graph, node.id);
  const conditionals = conditionalEdges(graph, node.id);
  const [open, setOpen] = React.useState(conditionals.length > 0);
  const [draft, setDraft] = React.useState<{ to: string; condition: Condition } | null>(null);

  React.useEffect(() => {
    if (conditionals.length > 0) setOpen(true);
  }, [conditionals.length]);

  const startDraft = () => {
    const target = others[0];
    if (!target) return;
    setDraft({ to: target.id, condition: defaultCondition(graph) });
    setOpen(true);
  };

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface-2/40 p-3">
      <DestinationSelect
        id={`node-next-${node.id}`}
        testId="node-next"
        label={conditionals.length > 0 ? 'Próximo bloco (fallback, quando nenhuma condição vale)' : 'Próximo bloco'}
        value={next?.to}
        others={others}
        onChange={(to) => onGraphChange((g) => setNextEdge(g, node.id, to))}
      />

      <div>
        <button
          type="button"
          className="min-h-9 rounded text-sm font-medium text-fg-muted hover:text-fg hover:underline"
          aria-expanded={open}
          aria-controls={`exits-adv-${node.id}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'} Avançado: saídas condicionais {conditionals.length > 0 && `(${conditionals.length})`}
        </button>
        <div id={`exits-adv-${node.id}`} className={cn('mt-2 space-y-3', !open && 'hidden')}>
          <p className="text-xs text-fg-muted">
            Saídas condicionais são avaliadas por prioridade (menor número primeiro). Quando nenhuma vale, o aluno segue para o fallback acima.
          </p>
          {conditionals.map((e) => (
            <ConditionalEdgeRow
              key={e.id}
              graph={graph}
              edge={e}
              others={others}
              nodeTitle={nodeTitle}
              onChange={(ne) => onGraphChange((g) => replaceEdge(g, ne))}
              onRemove={() => onGraphChange((g) => removeEdges(g, [e.id]))}
              onMakeFallback={() =>
                onGraphChange((g) => {
                  const current = primaryEdge(g, node.id);
                  let edges = g.edges.map((x) => (x.id === e.id ? { ...x, condition: undefined, priority: undefined, isDefault: true } : x));
                  if (current) edges = edges.filter((x) => x.id !== current.id);
                  return { ...g, edges };
                })
              }
            />
          ))}
          {draft ? (
            <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-3" data-testid="conditional-draft">
              <ConditionBuilder id={`cond-new-${node.id}`} graph={graph} value={draft.condition} onChange={(condition) => setDraft({ ...draft, condition })} />
              <DestinationSelect id={`cond-new-to-${node.id}`} label="Destino quando a condição vale" value={draft.to} others={others} allowNone={false} onChange={(to) => to && setDraft({ ...draft, to })} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onGraphChange((g) => addConditionalEdge(g, node.id, draft.to, draft.condition));
                    setDraft(null);
                  }}
                  data-testid="conditional-add"
                >
                  Adicionar saída condicional
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={startDraft} disabled={others.length === 0} data-testid="conditional-new">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nova saída condicional
            </Button>
          )}
          {conditionals.length > 0 && !next && (
            <p className="rounded-md bg-danger-soft p-2 text-xs text-danger">Defina o "Próximo bloco" acima: ele é o fallback obrigatório quando há saídas condicionais.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionalEdgeRow({
  graph,
  edge,
  others,
  nodeTitle,
  onChange,
  onRemove,
  onMakeFallback,
}: {
  graph: LessonGraph;
  edge: Edge;
  others: AnyNode[];
  nodeTitle: (id: string) => string;
  onChange: (e: Edge) => void;
  onRemove: () => void;
  onMakeFallback: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3" data-testid={`conditional-${edge.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">se</span> {describeCondition(edge.condition, nodeTitle)}, <span className="font-medium">leva a</span> {nodeTitle(edge.to)}
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{editing ? 'Fechar' : 'Editar'}</Button>
          <Button variant="ghost" size="sm" onClick={onMakeFallback} title="Transforma esta saída no fallback (remove a condição)">Tornar fallback</Button>
          <Button variant="ghost" size="sm" className="text-danger" aria-label="Remover saída condicional" onClick={onRemove}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="space-y-3">
          <ConditionBuilder id={`cond-${edge.id}`} graph={graph} value={edge.condition} onChange={(condition) => onChange({ ...edge, condition })} />
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <DestinationSelect id={`cond-to-${edge.id}`} label="Destino" value={edge.to} others={others} allowNone={false} onChange={(to) => to && onChange({ ...edge, to })} />
            <Field label="Prioridade" htmlFor={`cond-prio-${edge.id}`}>
              <Input
                id={`cond-prio-${edge.id}`}
                type="number"
                min={0}
                max={1000}
                value={edge.priority ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 0 && v <= 1000) onChange({ ...edge, priority: v });
                }}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Construtor de condições (subconjunto da DSL)                        */
/* ------------------------------------------------------------------ */

type CompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
const COMPARE_OPS: { op: CompareOp; label: string }[] = [
  { op: 'eq', label: 'igual a' },
  { op: 'neq', label: 'diferente de' },
  { op: 'gt', label: 'maior que' },
  { op: 'gte', label: 'maior ou igual a' },
  { op: 'lt', label: 'menor que' },
  { op: 'lte', label: 'menor ou igual a' },
];

type SimpleCondition = Extract<Condition, { op: CompareOp | 'answered' | 'passed' }>;

function isSimple(c: Condition | undefined): c is SimpleCondition {
  return !!c && (c.op === 'answered' || c.op === 'passed' || COMPARE_OPS.some((x) => x.op === c.op));
}

function defaultCondition(graph: LessonGraph): Condition {
  const v = graph.variables[0];
  if (v) return { op: 'eq', var: v.name, value: v.initial };
  const q = graph.nodes.find((n) => n.type === 'choice' || n.type === 'assessment');
  if (q) return q.type === 'assessment' ? { op: 'passed', nodeId: q.id } : { op: 'answered', nodeId: q.id };
  return { op: 'answered', nodeId: graph.startNodeId };
}

function ConditionBuilder({ id, graph, value, onChange }: { id: string; graph: LessonGraph; value: Condition | undefined; onChange: (c: Condition) => void }) {
  const kind: 'simple' | 'and' | 'or' | 'other' = isSimple(value) ? 'simple' : value?.op === 'and' || value?.op === 'or' ? (value.op as 'and' | 'or') : 'other';
  if (kind === 'other') {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-fg-muted">
          Condição avançada: <code className="rounded bg-surface-2 px-1 text-fg">{describeCondition(value)}</code>. Este editor só constrói comparações, respostas e aprovações (com "e"/"ou").
        </p>
        <Button variant="secondary" size="sm" onClick={() => onChange(defaultCondition(graph))}>Substituir por condição simples</Button>
      </div>
    );
  }
  const parts: Condition[] = kind === 'simple' ? [value as Condition] : (value as Extract<Condition, { op: 'and' | 'or' }>).conditions;
  const first = isSimple(parts[0]) ? parts[0] : defaultCondition(graph);
  const second = isSimple(parts[1]) ? parts[1] : null;

  const setKind = (k: 'simple' | 'and' | 'or') => {
    if (k === 'simple') onChange(first);
    else onChange({ op: k, conditions: [first, second ?? defaultCondition(graph)] });
  };
  const setPart = (idx: 0 | 1, c: Condition) => {
    if (kind === 'simple') onChange(c);
    else {
      const conds = [first, second ?? defaultCondition(graph)];
      conds[idx] = c;
      onChange({ op: kind, conditions: conds });
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Combinação" htmlFor={`${id}-kind`}>
        <select id={`${id}-kind`} className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as 'simple' | 'and' | 'or')}>
          <option value="simple">Uma condição</option>
          <option value="and">Duas condições (ambas valem)</option>
          <option value="or">Duas condições (qualquer uma vale)</option>
        </select>
      </Field>
      <SimpleConditionEditor id={`${id}-a`} graph={graph} value={first} onChange={(c) => setPart(0, c)} />
      {kind !== 'simple' && (
        <>
          <p className="text-center text-xs font-semibold text-fg-muted">{kind === 'and' ? 'e' : 'ou'}</p>
          <SimpleConditionEditor id={`${id}-b`} graph={graph} value={second ?? defaultCondition(graph)} onChange={(c) => setPart(1, c)} />
        </>
      )}
    </div>
  );
}

function SimpleConditionEditor({ id, graph, value, onChange }: { id: string; graph: LessonGraph; value: Condition; onChange: (c: Condition) => void }) {
  const simple: SimpleCondition = isSimple(value) ? value : defaultCondition(graph) as SimpleCondition;
  const type: 'compare' | 'answered' | 'passed' = simple.op === 'answered' ? 'answered' : simple.op === 'passed' ? 'passed' : 'compare';
  const questionNodes = graph.nodes.filter((n) => n.type === 'choice' || n.type === 'assessment');
  const assessmentNodes = graph.nodes.filter((n) => n.type === 'assessment');
  const varType = (name: string) => graph.variables.find((v) => v.name === name)?.type ?? 'string';

  const setType = (t: 'compare' | 'answered' | 'passed') => {
    if (t === 'compare') {
      const v = graph.variables[0];
      onChange({ op: 'eq', var: v?.name ?? 'variavel', value: v?.initial ?? '' });
    } else if (t === 'answered') onChange({ op: 'answered', nodeId: questionNodes[0]?.id ?? graph.startNodeId });
    else onChange({ op: 'passed', nodeId: assessmentNodes[0]?.id ?? questionNodes[0]?.id ?? graph.startNodeId });
  };

  return (
    <div className="grid gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-3 sm:items-end">
      <div>
        <Label htmlFor={`${id}-type`}>Tipo</Label>
        <select id={`${id}-type`} className={selectClass} value={type} onChange={(e) => setType(e.target.value as 'compare' | 'answered' | 'passed')}>
          <option value="compare" disabled={graph.variables.length === 0}>Comparar variável</option>
          <option value="answered" disabled={questionNodes.length === 0}>Respondeu opção</option>
          <option value="passed" disabled={assessmentNodes.length === 0}>Aprovado em avaliação</option>
        </select>
      </div>
      {type === 'compare' && simple.op !== 'answered' && simple.op !== 'passed' && (
        <>
          <div>
            <Label htmlFor={`${id}-var`}>Variável</Label>
            <select
              id={`${id}-var`}
              className={selectClass}
              value={simple.var}
              onChange={(e) => {
                const t = varType(e.target.value);
                onChange({ op: t === 'number' ? simple.op : simple.op === 'eq' || simple.op === 'neq' ? simple.op : 'eq', var: e.target.value, value: defaultFor(t) });
              }}
            >
              {!graph.variables.some((v) => v.name === simple.var) && <option value={simple.var}>{simple.var} (não declarada)</option>}
              {graph.variables.map((v) => (
                <option key={v.name} value={v.name}>{v.label ? `${v.label} (${v.name})` : v.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-op`}>Operador</Label>
              <select id={`${id}-op`} className={selectClass} value={simple.op} onChange={(e) => onChange({ ...simple, op: e.target.value as CompareOp })}>
                {COMPARE_OPS.filter((o) => varType(simple.var) === 'number' || o.op === 'eq' || o.op === 'neq').map((o) => (
                  <option key={o.op} value={o.op}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${id}-value`}>Valor</Label>
              <ScalarInput id={`${id}-value`} type={varType(simple.var)} value={simple.value} onChange={(value) => onChange({ ...simple, value })} />
            </div>
          </div>
        </>
      )}
      {type === 'answered' && simple.op === 'answered' && (
        <>
          <div>
            <Label htmlFor={`${id}-node`}>Bloco</Label>
            <select id={`${id}-node`} className={selectClass} value={simple.nodeId} onChange={(e) => onChange({ op: 'answered', nodeId: e.target.value })}>
              {questionNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.title || n.id}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-opt`}>Opção</Label>
            <select id={`${id}-opt`} className={selectClass} value={simple.optionId ?? ''} onChange={(e) => onChange({ op: 'answered', nodeId: simple.nodeId, optionId: e.target.value || undefined })}>
              <option value="">qualquer resposta</option>
              {(() => {
                const n = graph.nodes.find((x) => x.id === simple.nodeId);
                return n && (n.type === 'choice' || n.type === 'assessment') ? n.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>) : null;
              })()}
            </select>
          </div>
        </>
      )}
      {type === 'passed' && simple.op === 'passed' && (
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-node`}>Avaliação</Label>
          <select id={`${id}-node`} className={selectClass} value={simple.nodeId} onChange={(e) => onChange({ op: 'passed', nodeId: e.target.value })}>
            {assessmentNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.title || n.id}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variáveis                                                           */
/* ------------------------------------------------------------------ */

export function VariablesEditor({ variables, onChange }: { variables: VariableDeclaration[]; onChange: (v: VariableDeclaration[]) => void }) {
  const setAt = (i: number, v: VariableDeclaration) => onChange(variables.map((x, j) => (j === i ? v : x)));
  return (
    <div className="space-y-3" data-testid="variables-editor">
      {variables.length === 0 && <p className="text-xs text-fg-muted">Nenhuma variável. Variáveis guardam estado (ex.: confiança) alterado por consequências e usado em condições.</p>}
      {variables.map((v, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor={`var-name-${i}`}>Nome</Label>
            <Input id={`var-name-${i}`} value={v.name} pattern="^[a-zA-Z_][a-zA-Z0-9_-]*$" onChange={(e) => setAt(i, { ...v, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_') })} />
          </div>
          <div>
            <Label htmlFor={`var-type-${i}`}>Tipo</Label>
            <select
              id={`var-type-${i}`}
              className={selectClass}
              value={v.type}
              onChange={(e) => {
                const type = e.target.value as VariableDeclaration['type'];
                setAt(i, { ...v, type, initial: defaultFor(type) });
              }}
            >
              <option value="number">número</option>
              <option value="boolean">verdadeiro/falso</option>
              <option value="string">texto</option>
            </select>
          </div>
          <div>
            <Label htmlFor={`var-init-${i}`}>Valor inicial</Label>
            <ScalarInput id={`var-init-${i}`} type={v.type} value={v.initial} onChange={(initial) => setAt(i, { ...v, initial })} />
          </div>
          <div>
            <Label htmlFor={`var-label-${i}`}>Rótulo</Label>
            <Input id={`var-label-${i}`} maxLength={80} value={v.label ?? ''} onChange={(e) => setAt(i, { ...v, label: e.target.value || undefined })} />
          </div>
          <Button variant="ghost" size="sm" className="text-danger" aria-label={`Remover variável ${v.name}`} onClick={() => onChange(variables.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={variables.length >= 30}
        onClick={() => {
          const taken = new Set(variables.map((v) => v.name));
          let name = 'variavel';
          let i = 2;
          while (taken.has(name)) name = `variavel_${i++}`;
          onChange([...variables, { name, type: 'number', initial: 0 }]);
        }}
        data-testid="add-variable"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar variável
      </Button>
    </div>
  );
}

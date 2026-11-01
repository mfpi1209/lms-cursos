'use client';

import * as React from 'react';
import { CornerDownRight, GitMerge, Plus, Trash2 } from 'lucide-react';
import type { AnyNode, AssessmentNode, ChoiceNode, ConsequenceNode, EndNode, LessonGraph, MissionNode, ReflectionNode } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { conditionalEdges, createNode, describeCondition, insertNodeAfter, newOptionId, primaryEdge, removeEdges, replaceNode, setNextEdge, setOptionEdge } from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import { ScaffoldFields } from '@/components/studio/scaffold-fields';
import { InlineRichText, selectClass } from './inline-editors';
import { optionLetter, sceneLabel, sceneTitle, type StoryboardModel } from './scene-model';

export type GraphChange = (fn: (g: LessonGraph) => LessonGraph, coalesce?: string) => void;

/** Patch tipado sobre o nó atual do grafo (nunca sobre um fechamento antigo). */
export function makePatch<N extends AnyNode>(nodeId: string, changeGraph: GraphChange) {
  return (p: Partial<N>, coalesce?: string) =>
    changeGraph((g) => {
      const cur = g.nodes.find((n) => n.id === nodeId);
      return cur ? replaceNode(g, { ...(cur as N), ...p } as AnyNode) : g;
    }, coalesce);
}

const smallInput = 'min-h-11 w-24 px-2 text-sm';

/** Crachá da letra da opção (A, B, C…). */
function LetterBadge({ letter }: { letter: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent" aria-hidden="true">
      {letter}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Seletor de cena de destino                                          */
/* ------------------------------------------------------------------ */

export function SceneSelect({
  id,
  label,
  value,
  model,
  excludeId,
  onChange,
  testId,
  extra,
  className,
}: {
  id: string;
  label: string;
  value: string | undefined;
  model: StoryboardModel;
  excludeId: string;
  onChange: (to: string | null | '__new') => void;
  testId?: string;
  /** rótulo da opção "criar nova cena"; omitido = sem essa opção */
  extra?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      data-testid={testId}
      className={cn(selectClass, className)}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === '__new' ? '__new' : e.target.value)}
    >
      <option value="">— ainda sem destino —</option>
      {extra && <option value="__new">+ {extra}</option>}
      {model.all
        .filter((s) => s.node.id !== excludeId)
        .map((s) => (
          <option key={s.node.id} value={s.node.id}>
            {sceneLabel(model, s.node.id)}
          </option>
        ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Decisão                                                             */
/* ------------------------------------------------------------------ */

export function ChoiceOptions({
  graph,
  node,
  model,
  changeGraph,
  renderNested,
}: {
  graph: LessonGraph;
  node: ChoiceNode;
  model: StoryboardModel;
  changeGraph: GraphChange;
  /** cartão(ões) agrupado(s) sob a opção, se houver */
  renderNested: (optionId: string) => React.ReactNode;
}) {
  const patch = makePatch<ChoiceNode>(node.id, changeGraph);
  const setOption = (optId: string, p: Partial<ChoiceNode['options'][number]>, coalesce?: string) =>
    changeGraph((g) => {
      const cur = g.nodes.find((n) => n.id === node.id);
      if (!cur || cur.type !== 'choice') return g;
      return replaceNode(g, { ...cur, options: cur.options.map((o) => (o.id === optId ? { ...o, ...p } : o)) });
    }, coalesce);
  const merge = model.mergeAt.get(node.id);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-fg-muted">Opções e para onde cada uma leva</p>
      <ol className="space-y-2" aria-label="Opções da decisão">
        {node.options.map((o, idx) => {
          const edge = graph.edges.find((e) => e.from === node.id && e.optionId === o.id);
          const letter = optionLetter(idx);
          return (
            <li key={o.id} className="rounded-xl border border-line bg-bg p-2.5 sm:p-3" data-testid={`option-${o.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <LetterBadge letter={letter} />
                <Input
                  aria-label={`Texto da opção ${letter}`}
                  className="min-h-11 min-w-[10rem] flex-1 text-sm"
                  maxLength={300}
                  value={o.label}
                  onChange={(e) => setOption(o.id, { label: e.target.value }, `opt.label.${o.id}`)}
                />
                <CornerDownRight className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden="true" />
                <SceneSelect
                  id={`opt-dest-${o.id}`}
                  testId={`option-dest-${o.id}`}
                  label={`Destino da opção ${letter}`}
                  value={edge?.to}
                  model={model}
                  excludeId={node.id}
                  extra="Criar cena “O que acontece” para esta opção"
                  className="w-auto min-w-[12rem] flex-1 sm:flex-none"
                  onChange={(to) =>
                    changeGraph((g) =>
                      to === '__new' ? insertNodeAfter(g, node.id, createNode('consequence'), { optionId: o.id }) : setOptionEdge(g, node.id, o.id, to),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover opção ${letter}`}
                  disabled={node.options.length <= 2}
                  onClick={() =>
                    changeGraph((g) => {
                      const cur = g.nodes.find((n) => n.id === node.id);
                      if (!cur || cur.type !== 'choice' || cur.options.length <= 2) return g;
                      return setOptionEdge(replaceNode(g, { ...cur, options: cur.options.filter((x) => x.id !== o.id) }), node.id, o.id, null);
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-1.5 sm:pl-10">
                <InlineRichText
                  id={`opt-fb-${o.id}`}
                  compact
                  label={`Retorno ao escolher ${letter}`}
                  placeholder={`Retorno ao escolher ${letter} (o que a pessoa lê logo após escolher)…`}
                  value={o.feedback}
                  onChange={(d) => setOption(o.id, { feedback: d }, `opt.fb.${o.id}`)}
                />
              </div>
              {renderNested(o.id)}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={node.options.length >= 6}
          onClick={() => patch({ options: [...node.options, { id: newOptionId(), label: `Opção ${node.options.length + 1}` }] })}
          data-testid="add-option"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar opção
        </Button>
        {merge && (
          <p className="inline-flex items-center gap-2 rounded-full border border-dashed border-line-strong px-3 py-1 text-xs text-fg-muted" data-testid="merge-marker">
            <GitMerge className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
            <span>
              Os caminhos se reencontram em <span className="font-medium text-fg">{sceneTitle(model, merge)}</span>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* O que acontece                                                      */
/* ------------------------------------------------------------------ */

const TONES: { value: ConsequenceNode['tone']; label: string; cls: string }[] = [
  { value: 'positive', label: 'Deu certo', cls: 'data-[on=true]:bg-success-soft data-[on=true]:text-success data-[on=true]:border-success/40' },
  { value: 'neutral', label: 'Neutro', cls: 'data-[on=true]:bg-surface-2 data-[on=true]:text-fg data-[on=true]:border-line-strong' },
  { value: 'negative', label: 'Deu errado', cls: 'data-[on=true]:bg-danger-soft data-[on=true]:text-danger data-[on=true]:border-danger/40' },
];

export function ConsequenceFields({ node, changeGraph }: { node: ConsequenceNode; changeGraph: GraphChange }) {
  const patch = makePatch<ConsequenceNode>(node.id, changeGraph);
  const name = `tone-${node.id}`;
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-fg-muted">Como foi?</legend>
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((t) => (
            <label key={t.value} data-on={node.tone === t.value} className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-fg-muted hover:bg-surface-2 focus-within:outline focus-within:outline-2 focus-within:outline-accent', t.cls)}>
              <input type="radio" name={name} value={t.value} checked={node.tone === t.value} onChange={() => patch({ tone: t.value })} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="mb-0.5 text-xs font-medium text-fg-muted">O que levar disso</p>
        <InlineRichText
          id={`guidance-${node.id}`}
          compact
          label="O que levar disso"
          placeholder="Por que funcionou, ou o que fazer diferente da próxima vez…"
          value={node.guidance}
          onChange={(d) => patch({ guidance: d }, `node.guidance.${node.id}`)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reflexão                                                            */
/* ------------------------------------------------------------------ */

export function ReflectionFields({ node, changeGraph }: { node: ReflectionNode; changeGraph: GraphChange }) {
  const patch = makePatch<ReflectionNode>(node.id, changeGraph);
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
        Mínimo de caracteres
        <Input
          type="number"
          min={0}
          max={2000}
          className={smallInput}
          value={node.minLength}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 0 && v <= 2000) patch({ minLength: v });
          }}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
        Máximo de caracteres
        <Input
          type="number"
          min={10}
          max={5000}
          className={smallInput}
          value={node.maxLength}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 10 && v <= 5000) patch({ maxLength: v });
          }}
        />
      </label>
      <label className="flex basis-full flex-col gap-0.5 text-xs font-medium text-fg-muted">
        Ponte para a atividade (aparece abaixo do título: o que a aula ensinou e o que o aluno monta agora)
        <Input className="min-h-11 text-sm" maxLength={300} value={node.intro ?? ''} onChange={(e) => patch({ intro: e.target.value || undefined }, `node.intro.${node.id}`)} />
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-xs font-medium text-fg-muted">
        Dica dentro do campo de resposta
        <Input className="min-h-11 text-sm" maxLength={200} value={node.placeholder ?? ''} onChange={(e) => patch({ placeholder: e.target.value || undefined }, `node.ph.${node.id}`)} />
      </label>
      <div className="basis-full">
        <ScaffoldFields idPrefix={`sb-${node.id}`} scaffold={node.scaffold} onChange={(scaffold, coalesce) => patch({ scaffold }, coalesce)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Verificação                                                         */
/* ------------------------------------------------------------------ */

export function AssessmentFields({ node, changeGraph }: { node: AssessmentNode; changeGraph: GraphChange }) {
  const patch = makePatch<AssessmentNode>(node.id, changeGraph);
  const setOption = (optId: string, p: Partial<AssessmentNode['options'][number]>, coalesce?: string) =>
    changeGraph((g) => {
      const cur = g.nodes.find((n) => n.id === node.id);
      if (!cur || cur.type !== 'assessment') return g;
      return replaceNode(g, { ...cur, options: cur.options.map((o) => (o.id === optId ? { ...o, ...p } : o)) });
    }, coalesce);
  const correctCount = node.options.filter((o) => o.correct).length;
  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label="Alternativas">
        {node.options.map((o, idx) => {
          const letter = optionLetter(idx);
          return (
            <li key={o.id} className="rounded-xl border border-line bg-bg p-3" data-testid={`option-${o.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <LetterBadge letter={letter} />
                <Input aria-label={`Texto da alternativa ${letter}`} className="min-h-11 min-w-[10rem] flex-1 text-sm" maxLength={300} value={o.label} onChange={(e) => setOption(o.id, { label: e.target.value }, `aopt.label.${o.id}`)} />
                <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm', o.correct ? 'border-success/40 bg-success-soft text-success' : 'border-line bg-surface text-fg-muted')}>
                  <input type="checkbox" className="h-4 w-4 accent-success" checked={o.correct} onChange={(e) => setOption(o.id, { correct: e.target.checked })} /> Correta
                </label>
                <Button variant="ghost" size="sm" aria-label={`Remover alternativa ${letter}`} disabled={node.options.length <= 2} onClick={() => patch({ options: node.options.filter((x) => x.id !== o.id) })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-1.5 pl-10">
                <InlineRichText id={`aopt-fb-${o.id}`} compact label={`Retorno da alternativa ${letter}`} placeholder={`Retorno ao marcar ${letter}…`} value={o.feedback} onChange={(d) => setOption(o.id, { feedback: d }, `aopt.fb.${o.id}`)} />
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" disabled={node.options.length >= 8} onClick={() => patch({ options: [...node.options, { id: newOptionId(), label: `Alternativa ${node.options.length + 1}`, correct: false }] })} data-testid="add-option">
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar alternativa
      </Button>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Tipo de resposta
          <select className={cn(selectClass, 'w-auto')} value={node.mode} onChange={(e) => patch({ mode: e.target.value as AssessmentNode['mode'] })}>
            <option value="single">Uma alternativa</option>
            <option value="multiple">Várias alternativas</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Passa quando
          <select
            className={cn(selectClass, 'min-h-9 w-auto')}
            value={node.passing.kind}
            onChange={(e) => patch({ passing: e.target.value === 'min_correct' ? { kind: 'min_correct', min: Math.max(1, correctCount) } : { kind: 'all_correct' } })}
          >
            <option value="all_correct">acerta todas</option>
            <option value="min_correct">acerta um mínimo</option>
          </select>
        </label>
        {node.passing.kind === 'min_correct' && (
          <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
            Mínimo de acertos
            <Input
              type="number"
              min={1}
              className={smallInput}
              value={node.passing.min}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1) patch({ passing: { kind: 'min_correct', min: v } });
              }}
            />
          </label>
        )}
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Tentativas
          <Input
            type="number"
            min={1}
            max={10}
            className={smallInput}
            value={node.maxAttempts}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 1 && v <= 10) patch({ maxAttempts: v });
            }}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-0.5 text-xs font-medium text-fg-muted">Se passar</p>
          <InlineRichText id={`fbpass-${node.id}`} compact label="Retorno se passar" placeholder="O que a pessoa lê ao passar…" value={node.feedbackPassed} onChange={(d) => patch({ feedbackPassed: d }, `node.fbp.${node.id}`)} />
        </div>
        <div>
          <p className="mb-0.5 text-xs font-medium text-fg-muted">Se não passar</p>
          <InlineRichText id={`fbfail-${node.id}`} compact label="Retorno se não passar" placeholder="O que a pessoa lê ao não atingir o mínimo…" value={node.feedbackFailed} onChange={(d) => patch({ feedbackFailed: d }, `node.fbf.${node.id}`)} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Encerramento                                                        */
/* ------------------------------------------------------------------ */

export function EndFields({ node, changeGraph }: { node: EndNode; changeGraph: GraphChange }) {
  const patch = makePatch<EndNode>(node.id, changeGraph);
  return (
    <label className="flex max-w-sm flex-col gap-0.5 text-xs font-medium text-fg-muted">
      Rótulo do resultado (ex.: “Aula concluída”)
      <Input className="min-h-11 text-sm" maxLength={80} value={node.outcomeLabel ?? ''} onChange={(e) => patch({ outcomeLabel: e.target.value || undefined }, `node.outcome.${node.id}`)} />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Próxima cena + regras avançadas                                     */
/* ------------------------------------------------------------------ */

export function NextScene({
  graph,
  node,
  model,
  changeGraph,
  onOpenAdvanced,
}: {
  graph: LessonGraph;
  node: AnyNode;
  model: StoryboardModel;
  changeGraph: GraphChange;
  onOpenAdvanced: (nodeId: string) => void;
}) {
  const next = primaryEdge(graph, node.id);
  const rules = conditionalEdges(graph, node.id);
  const titleOf = (id: string) => sceneTitle(model, id);
  const [rulesOpen, setRulesOpen] = React.useState(rules.length > 0);
  React.useEffect(() => {
    if (rules.length > 0) setRulesOpen(true);
  }, [rules.length]);
  return (
    <div className="space-y-2">
      {/* no celular o seletor ocupa a largura toda (rótulo em cima); a partir de sm fica ao lado do rótulo */}
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <label htmlFor={`next-${node.id}`} className="text-xs font-medium text-fg-muted">
          {rules.length ? 'Próxima cena (quando nenhuma regra vale)' : 'Próxima cena'}
        </label>
        <SceneSelect
          id={`next-${node.id}`}
          testId="node-next"
          label="Próxima cena"
          value={next?.to}
          model={model}
          excludeId={node.id}
          className="w-full sm:w-auto sm:min-w-[14rem]"
          onChange={(to) => changeGraph((g) => setNextEdge(g, node.id, to === '__new' ? null : to))}
        />
      </div>
      <details className="group text-xs" open={rulesOpen} onToggle={(e) => setRulesOpen(e.currentTarget.open)}>
        <summary className="min-h-6 cursor-pointer select-none rounded text-fg-muted hover:text-fg">
          Regras avançadas{rules.length ? ` (${rules.length})` : ''}
        </summary>
        <div className="mt-1.5 space-y-1.5 rounded-lg border border-line bg-surface-2 p-2.5">
          {rules.length === 0 && <p className="text-fg-muted">Sem regras. Regras levam a outra cena dependendo de respostas ou variáveis.</p>}
          {rules.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`rule-${e.id}`}>
              <p className="text-fg-muted">
                Se <span className="font-medium text-fg">{describeCondition(e.condition, titleOf)}</span>, leva a <span className="font-medium text-fg">{titleOf(e.to)}</span>
              </p>
              <Button variant="ghost" size="sm" aria-label="Remover regra" onClick={() => changeGraph((g) => removeEdges(g, [e.id]))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <button type="button" className="min-h-6 rounded font-medium text-accent hover:underline" onClick={() => onOpenAdvanced(node.id)}>
            {rules.length ? 'Editar regras no modo avançado' : 'Criar uma regra no modo avançado'}
          </button>
        </div>
      </details>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Missão "Leve para a vida real"                                       */
/* ------------------------------------------------------------------ */

const missionField = 'text-sm';

/**
 * Campos da missão: por que (intro), a ação concreta, a alternativa para quem ainda não trabalha, dica e exemplo
 * opcionais e, se houver uma atividade "Na prática" nesta aula, a frase montada pelo aluno para ele copiar.
 * O título da cena é o da missão. Publicar exige título, intro, ação e alternativa.
 */
export function MissionFields({ node, graph, changeGraph }: { node: MissionNode; graph: LessonGraph; changeGraph: GraphChange }) {
  const patch = makePatch<MissionNode>(node.id, changeGraph);
  const sources = graph.nodes.filter((n) => n.type === 'reflection' && !!n.scaffold);
  const field = (key: 'intro' | 'action' | 'alternative', label: string, hint: string, max: number, optional = false) => (
    <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
      {label}
      <Textarea
        className={cn(missionField, 'min-h-20')}
        rows={2}
        maxLength={max}
        value={node[key]}
        placeholder={hint}
        data-testid={`mission-${key}`}
        aria-required={!optional}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<MissionNode>, `node.${key}.${node.id}`)}
      />
      <span className="self-end font-normal text-fg-faint">{node[key].length}/{max}</span>
    </label>
  );
  return (
    <div className="space-y-3" data-testid={`mission-fields-${node.id}`}>
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-fg">
        Terceiro momento da aula, depois de “Você decide”: algo para fazer <strong>fora da plataforma</strong>. A pessoa escolhe “Já experimentei” ou “Vou fazer depois” e pode contar o que percebeu. Nunca trava a aula, o curso nem o selo.
      </p>
      {field('intro', 'Por que vale a pena (1 a 2 frases)', 'Ex.: Ensaiar a frase na vida real é o que faz ela sair natural na hora certa.', 400)}
      {field('action', 'O que fazer (uma ação concreta)', 'Ex.: Hoje, ofereça ajuda a um colega usando a frase que você montou.', 500)}
      {field('alternative', 'Alternativa para quem ainda não trabalha', 'Ex.: Treine a frase com um colega de curso ou com alguém da família.', 500)}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Dica (opcional)
          <Input className="min-h-11 text-sm" maxLength={300} value={node.tip ?? ''} data-testid="mission-tip" onChange={(e) => patch({ tip: e.target.value || undefined }, `node.tip.${node.id}`)} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Exemplo (opcional)
          <Input className="min-h-11 text-sm" maxLength={300} value={node.example ?? ''} data-testid="mission-example" onChange={(e) => patch({ example: e.target.value || undefined }, `node.example.${node.id}`)} />
        </label>
      </div>
      <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
        Mostrar a frase que a pessoa montou antes (com botão Copiar)
        <select className={selectClass} value={node.draftFromNodeId ?? ''} data-testid="mission-draft" onChange={(e) => patch({ draftFromNodeId: e.target.value || undefined })}>
          <option value="">— nenhuma —</option>
          {sources.map((n) => (
            <option key={n.id} value={n.id}>{n.title?.trim() || n.id}</option>
          ))}
          {node.draftFromNodeId && !sources.some((n) => n.id === node.draftFromNodeId) && <option value={node.draftFromNodeId}>{node.draftFromNodeId} (não encontrada)</option>}
        </select>
        {sources.length === 0 && <span className="font-normal text-fg-faint">Esta aula não tem atividade “Na prática” com molde para trazer a frase.</span>}
      </label>
    </div>
  );
}

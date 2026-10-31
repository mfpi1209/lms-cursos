'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { richTextToPlain, type AnyNode, type LessonGraph, type RichTextDocument } from '@lms/course-schema';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/utils';
import { buildStoryboard, optionLetter, sceneDot, sceneTypeLabel } from './scene-model';

export interface ProposalIssue {
  code: string;
  message: string;
  nodeId?: string;
}

/** "7 cenas, 3 decisões, 2 consequências" (sem contar o encerramento). */
export function graphSummaryLine(graph: LessonGraph): string {
  const nodes = graph.nodes.filter((n) => n.type !== 'end');
  const count = (type: AnyNode['type']) => nodes.filter((n) => n.type === type).length;
  const parts = [`${nodes.length} ${nodes.length === 1 ? 'cena' : 'cenas'}`];
  const decisions = count('choice');
  const consequences = count('consequence');
  const assessments = count('assessment');
  const reflections = count('reflection');
  parts.push(`${decisions} ${decisions === 1 ? 'decisão' : 'decisões'}`);
  if (consequences) parts.push(`${consequences} ${consequences === 1 ? 'consequência' : 'consequências'}`);
  if (reflections) parts.push(`${reflections} ${reflections === 1 ? 'reflexão' : 'reflexões'}`);
  if (assessments) parts.push(`${assessments} ${assessments === 1 ? 'verificação' : 'verificações'}`);
  return parts.join(', ');
}

/** Texto principal e fala de um nó (para comparar antes/depois e para a lista). */
export function sceneTexts(n: AnyNode): { screen?: RichTextDocument; narration?: string; options?: Array<{ id: string; label: string }>; guidance?: RichTextDocument; tone?: string } {
  const narration = 'narration' in n && typeof n.narration === 'string' && n.narration.trim() ? n.narration : undefined;
  switch (n.type) {
    case 'scenario':
    case 'content':
      return { screen: n.body, narration };
    case 'consequence':
      return { screen: n.body, narration, guidance: n.guidance, tone: n.tone };
    case 'choice':
      return { screen: n.prompt, narration, options: n.options.map((o) => ({ id: o.id, label: o.label })) };
    case 'assessment':
      return { screen: n.prompt, options: n.options.map((o) => ({ id: o.id, label: `${o.label}${o.correct ? ' ✓' : ''}` })) };
    case 'reflection':
      return { screen: n.prompt };
    case 'end':
      return { screen: n.summary };
    default:
      return {};
  }
}

const TONE_LABEL: Record<string, string> = { positive: 'deu certo', neutral: 'neutro', negative: 'deu errado' };

/**
 * Lista compacta e SÓ DE LEITURA das cenas de um grafo proposto, na ordem do
 * storyboard: tipo, título, texto da tela, fala e opções. Para o autor ver a
 * proposta antes de aplicar (nada aqui edita o rascunho).
 */
export function ProposalScenes({ graph, highlightIds, issues, dense = false }: { graph: LessonGraph; /** cenas a destacar (ex.: alteradas) */ highlightIds?: ReadonlySet<string>; issues?: ProposalIssue[]; dense?: boolean }) {
  const model = React.useMemo(() => buildStoryboard(graph), [graph]);
  const byNode = React.useMemo(() => {
    const m = new Map<string, ProposalIssue[]>();
    for (const i of issues ?? []) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i]);
    return m;
  }, [issues]);
  return (
    <ol className="space-y-2" aria-label="Cenas da proposta" data-testid="proposal-scenes">
      {model.all.map(({ node, seq, reachable }) => {
        const t = sceneTexts(node);
        const own = byNode.get(node.id) ?? [];
        const highlighted = highlightIds?.has(node.id);
        return (
          <li key={node.id} className={cn('rounded-xl border border-line bg-bg p-3', highlighted && 'border-ai/60 bg-ai-soft/30', !reachable && 'opacity-70')} data-testid={`proposal-scene-${node.id}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
              <span className="font-semibold tabular-nums text-fg">{reachable ? seq : '–'}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', sceneDot(node))} aria-hidden="true" />
                {sceneTypeLabel(node.type)}
              </span>
              {t.tone && <span>· {TONE_LABEL[t.tone] ?? t.tone}</span>}
              {highlighted && <span className="rounded-full bg-ai-soft px-2 py-0.5 font-medium text-ai">alterada</span>}
              {!reachable && <span>· fora do caminho</span>}
            </div>
            <p className="mt-0.5 font-medium text-fg">{node.title?.trim() || sceneTypeLabel(node.type)}</p>
            {t.screen && !dense && <RichText doc={t.screen} className="mt-1 text-sm text-fg-muted [&_p]:my-1" />}
            {t.screen && dense && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{richTextToPlain(t.screen)}</p>}
            {t.narration && (
              <p className="mt-1 text-sm text-fg">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">Fala · </span>
                {t.narration}
              </p>
            )}
            {t.guidance && (
              <p className="mt-1 text-sm text-fg-muted">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">O que levar · </span>
                {richTextToPlain(t.guidance)}
              </p>
            )}
            {t.options && t.options.length > 0 && (
              <ol className="mt-1.5 space-y-1" aria-label="Opções">
                {t.options.map((o, j) => (
                  <li key={o.id} className="flex items-start gap-2 text-sm text-fg">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ai-soft text-[11px] font-semibold text-ai" aria-hidden="true">{optionLetter(j)}</span>
                    <span>{o.label}</span>
                  </li>
                ))}
              </ol>
            )}
            {own.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {own.map((i, k) => (
                  <li key={k} className="flex items-start gap-1.5 text-danger">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Erros e avisos de uma proposta (compilador + regras), legíveis. */
export function ProposalIssues({ errors, warnings }: { errors: ProposalIssue[]; warnings: ProposalIssue[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="space-y-2" data-testid="proposal-issues">
      {errors.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft/60 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-danger">
            <AlertCircle className="h-4 w-4" aria-hidden="true" /> {errors.length} {errors.length === 1 ? 'erro de estrutura' : 'erros de estrutura'} (a IA não conseguiu corrigir nos reparos)
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
            {errors.slice(0, 12).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-fg">
            <AlertTriangle className="h-4 w-4 text-paid" aria-hidden="true" /> {warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
            {warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Diferença de texto por cena entre o grafo atual e o proposto (título, texto da tela, fala, opções). */
export interface SceneTextDiff {
  nodeId: string;
  title: { before?: string; after?: string };
  screen: { before?: string; after?: string };
  narration: { before?: string; after?: string };
  options: { before?: string[]; after?: string[] };
  status: 'changed' | 'added' | 'removed';
}

export function sceneTextDiffs(before: LessonGraph, after: LessonGraph): SceneTextDiff[] {
  const prev = new Map(before.nodes.map((n) => [n.id, n]));
  const next = new Map(after.nodes.map((n) => [n.id, n]));
  const out: SceneTextDiff[] = [];
  const plain = (d?: RichTextDocument) => (d ? richTextToPlain(d).trim() : '');
  const entry = (a: AnyNode | undefined, b: AnyNode | undefined, status: SceneTextDiff['status']): SceneTextDiff => {
    const ta = a ? sceneTexts(a) : {};
    const tb = b ? sceneTexts(b) : {};
    return {
      nodeId: (a ?? b)!.id,
      status,
      title: { before: a?.title, after: b?.title },
      screen: { before: plain(ta.screen), after: plain(tb.screen) },
      narration: { before: ta.narration ?? '', after: tb.narration ?? '' },
      options: { before: ta.options?.map((o) => o.label), after: tb.options?.map((o) => o.label) },
    };
  };
  const same = (x: SceneTextDiff) => x.title.before === x.title.after && x.screen.before === x.screen.after && x.narration.before === x.narration.after && JSON.stringify(x.options.before ?? []) === JSON.stringify(x.options.after ?? []);
  for (const n of after.nodes) {
    const p = prev.get(n.id);
    if (!p) out.push(entry(undefined, n, 'added'));
    else {
      const e = entry(p, n, 'changed');
      if (!same(e)) out.push(e);
    }
  }
  for (const n of before.nodes) if (!next.has(n.id)) out.push(entry(n, undefined, 'removed'));
  return out;
}

function Pair({ label, before, after }: { label: string; before?: string; after?: string }) {
  if (!before && !after) return null;
  if (before === after) return null;
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-2">
      <p className="rounded-lg bg-danger-soft/40 px-2 py-1 text-fg-muted">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label} · antes</span>
        {before || <span className="italic text-fg-faint">(vazio)</span>}
      </p>
      <p className="rounded-lg bg-success-soft/40 px-2 py-1 text-fg">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label} · depois</span>
        {after || <span className="italic text-fg-faint">(vazio)</span>}
      </p>
    </div>
  );
}

/** Antes/depois do texto de cada cena alterada (título, tela, fala, opções). */
export function SceneBeforeAfter({ diffs, sceneName }: { diffs: SceneTextDiff[]; sceneName?: (nodeId: string) => string }) {
  if (!diffs.length) return <p className="text-sm text-fg-muted">Nenhuma cena muda de texto.</p>;
  return (
    <ol className="space-y-3" aria-label="Antes e depois por cena" data-testid="scene-before-after">
      {diffs.map((d) => (
        <li key={d.nodeId} className="space-y-1.5 rounded-xl border border-line bg-bg p-3" data-testid={`before-after-${d.nodeId}`} data-status={d.status}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {sceneName?.(d.nodeId) ?? d.title.after ?? d.title.before ?? d.nodeId}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', d.status === 'added' ? 'bg-success-soft text-success' : d.status === 'removed' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent')}>
              {d.status === 'added' ? 'nova' : d.status === 'removed' ? 'removida' : 'alterada'}
            </span>
          </p>
          <Pair label="Título" before={d.title.before} after={d.title.after} />
          <Pair label="Texto da tela" before={d.screen.before} after={d.screen.after} />
          <Pair label="Fala" before={d.narration.before} after={d.narration.after} />
          <Pair label="Opções" before={d.options.before?.join(' · ')} after={d.options.after?.join(' · ')} />
        </li>
      ))}
    </ol>
  );
}

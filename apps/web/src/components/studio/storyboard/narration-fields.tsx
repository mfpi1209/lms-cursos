'use client';

import * as React from 'react';
import { AlertTriangle, Mic } from 'lucide-react';
import type { AnyNode } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { markMediaStale, nodeMedia, nodeScriptText, replaceNode } from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import { SCRIPT_MAX } from './generate';
import { NARRATION_CHIPS, PromptChips } from '@/components/studio/assistant/prompt-chips';
import type { GraphChange } from './scene-fields';

/** Cenas que viram vídeo com apresentador e, portanto, têm fala e gesto próprios. */
export type SpokenNode = Extract<AnyNode, { type: 'scenario' | 'content' | 'choice' | 'consequence' }>;

export function isSpokenNode(node: AnyNode): node is SpokenNode {
  return node.type === 'scenario' || node.type === 'content' || node.type === 'choice' || node.type === 'consequence';
}

/** Fala escrita para o apresentador (sem espaços nas pontas), ou undefined. */
export function nodeNarration(node: AnyNode): string | undefined {
  if (!isSpokenNode(node)) return undefined;
  const n = node.narration?.trim();
  return n ? n : undefined;
}

/** O que o apresentador vai dizer: a fala, quando existe; senão o texto da cena. */
export function spokenScript(node: AnyNode): string {
  return nodeNarration(node) ?? nodeScriptText(node);
}

export const MOTION_MAX = 200;

const MOTION_EXAMPLES = ['nods and smiles, encouraging', 'open hands while explaining, calm', 'leans in slightly, curious'];

/**
 * Atualiza fala/gesto de uma cena. Vídeo gerado a partir da versão anterior
 * fica desatualizado na MESMA alteração (um único passo de desfazer).
 */
function patchSpoken(changeGraph: GraphChange, nodeId: string, p: { narration?: string; motionPrompt?: string }, coalesce: string) {
  changeGraph((g) => {
    const cur = g.nodes.find((n) => n.id === nodeId);
    if (!cur || !isSpokenNode(cur)) return g;
    const next: SpokenNode = { ...cur };
    if ('narration' in p) next.narration = p.narration ? p.narration : undefined;
    if ('motionPrompt' in p) next.motionPrompt = p.motionPrompt ? p.motionPrompt : undefined;
    return replaceNode(g, markMediaStale(next));
  }, coalesce);
}

export function NarrationFields({ node, changeGraph }: { node: SpokenNode; changeGraph: GraphChange }) {
  const narration = node.narration ?? '';
  const motion = node.motionPrompt ?? '';
  const [open, setOpen] = React.useState(() => narration.length > 0 || motion.length > 0);
  const stale = !!nodeMedia(node)?.stale;
  const screenText = nodeScriptText(node).trim();
  const narrationId = `narration-${node.id}`;
  const narrationHint = `narration-hint-${node.id}`;
  const motionId = `motion-${node.id}`;
  const motionHint = `motion-hint-${node.id}`;
  const len = narration.trim().length;

  return (
    <details
      className="group rounded-xl border border-line bg-surface-2/60"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-testid={`narration-${node.id}`}
    >
      <summary className="flex min-h-11 cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <Mic className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span>O que o apresentador fala</span>
        <span className="text-xs font-normal text-fg-faint">{narration.trim() ? 'fala própria' : 'usa o texto da cena'}</span>
        {stale && (
          <span className="inline-flex items-center gap-1 rounded-full bg-paid-soft px-2 py-0.5 text-xs font-medium text-paid">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Vídeo desatualizado: a cena mudou desde a geração
          </span>
        )}
        <span aria-hidden="true" className="ml-auto text-fg-faint transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
      </summary>

      <div className="space-y-4 border-t border-line px-3 pb-3 pt-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label htmlFor={narrationId} className="text-xs font-medium text-fg-muted">
              Fala do apresentador
            </label>
            <Button
              variant="ghost"
              size="sm"
              disabled={!screenText || narration.trim() === screenText}
              onClick={() => patchSpoken(changeGraph, node.id, { narration: screenText.slice(0, SCRIPT_MAX) }, `node.narration.copy.${node.id}`)}
              data-testid="narration-copy-text"
            >
              Usar o texto da cena
            </Button>
          </div>
          <Textarea
            id={narrationId}
            rows={4}
            maxLength={SCRIPT_MAX}
            value={narration}
            placeholder="Se vazio, o apresentador lê o texto da cena."
            aria-describedby={narrationHint}
            onChange={(e) => patchSpoken(changeGraph, node.id, { narration: e.target.value }, `node.narration.${node.id}`)}
            className="text-sm leading-relaxed"
            data-testid="narration-text"
          />
          <div id={narrationHint} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span className="min-w-0 flex-1">Escreva para ser falado: frases curtas, fale com o aluno (você), sem listas nem aspas dentro de aspas.</span>
            <span className={cn('shrink-0 tabular-nums', len > SCRIPT_MAX * 0.9 && 'text-paid')}>
              {len.toLocaleString('pt-BR')}/{SCRIPT_MAX.toLocaleString('pt-BR')}
            </span>
          </div>
          <PromptChips chips={NARRATION_CHIPS} context={{ nodeId: node.id }} className="pt-1" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={motionId} className="text-xs font-medium text-fg-muted">
            Gesto do apresentador
          </label>
          <Input
            id={motionId}
            maxLength={MOTION_MAX}
            value={motion}
            placeholder="Um gesto e uma emoção, em inglês"
            aria-describedby={motionHint}
            onChange={(e) => patchSpoken(changeGraph, node.id, { motionPrompt: e.target.value }, `node.motion.${node.id}`)}
            className="min-h-11 text-sm"
            data-testid="motion-prompt"
          />
          <p id={motionHint} className="flex flex-wrap justify-between gap-x-3 text-xs text-fg-muted">
            <span>Um gesto e uma emoção, em inglês. Exemplos:</span>
            <span className="tabular-nums">
              {motion.length}/{MOTION_MAX}
            </span>
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Exemplos de gesto">
            {MOTION_EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  aria-pressed={motion === ex}
                  onClick={() => patchSpoken(changeGraph, node.id, { motionPrompt: ex }, `node.motion.chip.${node.id}`)}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-full border px-3 text-xs',
                    motion === ex ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-bg text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

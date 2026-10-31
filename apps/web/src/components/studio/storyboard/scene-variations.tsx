'use client';

import * as React from 'react';
import { Sparkles, X } from 'lucide-react';
import type { AnyNode, LessonGraph } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/rich-text';
import { useDraft } from '@/components/studio/draft-provider';
import { cn } from '@/lib/utils';
import { optionLetter } from './scene-model';
import { isConflict, type AgentProposal } from './use-agent-runs';
import { errorText } from './use-media-jobs';

/** Botão "Variar esta cena" (só decisões e consequências). */
export function SceneVaryButton({ nodeId, disabled, onVary }: { nodeId: string; disabled: boolean; onVary: () => Promise<void> }) {
  return (
    <Button variant="ai" size="sm" disabled={disabled} onClick={() => void onVary()} data-testid={`scene-vary-${nodeId}`} aria-label="Variar esta cena" title={disabled ? 'Aguarde a execução atual da IA terminar' : 'Variar esta cena'}>
      <Sparkles className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Variar esta cena</span>
    </Button>
  );
}

export function SceneVaryProcessing() {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-full border border-ai/30 bg-ai-soft px-3 py-1.5 text-xs font-medium text-ai">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ai" aria-hidden="true" /> A IA está criando variações desta cena…
    </p>
  );
}

function variantNode(graph: LessonGraph, nodeId: string): AnyNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

/** Seletor de variações de UMA cena, dentro do cartão. */
export function VariationChooser({
  proposal,
  busy,
  onApply,
  onReject,
}: {
  proposal: Extract<AgentProposal, { kind: 'scene_variations' }>;
  busy: boolean;
  onApply: (opts: { choice: number; force?: boolean }) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const { status: draftStatus, reload } = useDraft();
  const [choice, setChoice] = React.useState<number | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const name = React.useId();
  const nodeId = proposal.payload.nodeId;
  const saving = draftStatus === 'saving' || draftStatus === 'dirty';

  const apply = async (force = false) => {
    if (choice === null) return;
    setError(null);
    try {
      await onApply({ choice, force });
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        return;
      }
      try {
        await reload();
      } catch {
        /* segue com a mensagem original */
      }
      setError(errorText(e, 'Não foi possível aplicar a variação'));
    }
  };

  return (
    <section aria-label="Variações propostas pela IA" className="rise overflow-hidden rounded-2xl border border-ai/30" data-testid="scene-variations">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-ai-soft px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ai">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Variações desta cena
        </p>
        <p className="text-xs text-ai/80">Escolha uma; a cena atual é substituída só ao aplicar.</p>
      </header>
      <div className="space-y-3 p-4">
        {proposal.rationale && <p className="text-sm leading-relaxed text-fg-muted">{proposal.rationale}</p>}
        <ul className="space-y-2" role="radiogroup" aria-label="Variações">
          {proposal.payload.variations.map((v, i) => {
            const node = variantNode(v.graph, nodeId);
            const text = node ? (node.type === 'choice' ? node.prompt : node.type === 'consequence' ? node.body : undefined) : undefined;
            const selected = choice === i;
            return (
              <li key={i}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg p-3 transition-colors hover:border-line-strong has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-ai', selected && 'border-ai bg-ai-soft/40')}>
                  <input type="radio" name={name} className="mt-1 size-5 shrink-0 accent-ai" checked={selected} onChange={() => setChoice(i)} data-testid={`variation-${i}`} />
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block text-sm font-semibold text-fg">{v.label || `Variação ${i + 1}`}</span>
                    {node?.title && <span className="block text-xs text-fg-muted">{node.title}</span>}
                    {text && <RichText doc={text} className="text-sm text-fg [&_p]:my-1" />}
                    {node?.type === 'choice' && (
                      <ol className="space-y-1 pt-1" aria-label="Opções desta variação">
                        {node.options.map((o, j) => (
                          <li key={o.id} className="flex items-start gap-2 text-sm text-fg">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ai-soft text-[11px] font-semibold text-ai" aria-hidden="true">
                              {optionLetter(j)}
                            </span>
                            <span>{o.label}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {proposal.summary.conversionWarnings && proposal.summary.conversionWarnings.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded-xl bg-surface-2 py-2 pl-7 pr-3 text-xs text-fg-muted">
            {proposal.summary.conversionWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {conflict ? (
          <div role="alert" className="space-y-2 rounded-xl bg-paid-soft p-3 text-sm text-paid">
            <p>Esta aula foi editada depois que a IA preparou as variações. Aplicar mesmo assim troca SÓ esta cena (texto, opções e saídas) na aula atual; o que você mudou nas outras cenas continua.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="paid" size="sm" disabled={busy} onClick={() => void apply(true)} data-testid="variation-force">
                Aplicar mesmo assim
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConflict(false)}>Voltar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ai" size="sm" disabled={busy || saving || choice === null} onClick={() => void apply(false)} data-testid="variation-apply">
              {busy ? 'Aplicando…' : 'Usar esta variação'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onReject()} data-testid="variation-reject">
              <X className="h-4 w-4" aria-hidden="true" /> Descartar
            </Button>
            {saving && <span className="text-xs text-fg-muted">Aguardando salvar suas alterações…</span>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </section>
  );
}

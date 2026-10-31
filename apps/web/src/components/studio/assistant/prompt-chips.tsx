'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import type { AssistantContext, PromptSuggestion } from '@lms/ai/client';
import { cn } from '@/lib/utils';
import { useAssistantCommands } from './use-assistant';

export { DIRECTION_CHIPS, NARRATION_CHIPS, WIZARD_STEP_CHIPS } from './suggestions';

/**
 * Linha "Pedir à IA:" com 2–4 atalhos que mandam um prompt ao assistente já
 * com o contexto certo (ex.: a cena). A resposta abre no painel do assistente;
 * nada muda no curso sem o autor confirmar um cartão de ação.
 */
export function PromptChips({
  chips,
  context,
  label = 'Pedir à IA:',
  className,
}: {
  chips: PromptSuggestion[];
  /** contexto extra deste lugar (ex.: { nodeId }); o resto vem da página */
  context?: Partial<AssistantContext>;
  label?: string;
  className?: string;
}) {
  const assistant = useAssistantCommands();
  const labelId = React.useId();
  if (!assistant || chips.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-labelledby={labelId} data-testid="prompt-chips">
      <span id={labelId} className="inline-flex items-center gap-1 text-xs font-medium text-ai">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      {chips.slice(0, 4).map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => void assistant.ask(c.prompt, context)}
          title={c.prompt}
          className="inline-flex min-h-9 items-center rounded-full border border-ai/25 bg-ai-soft/60 px-3 text-xs font-medium text-ai transition-colors hover:border-ai/50 hover:bg-ai-soft"
          data-testid={`prompt-chip-${c.id}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

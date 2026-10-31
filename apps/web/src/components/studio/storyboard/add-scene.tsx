'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import type { ChoiceNode, ExecutableNodeType } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { optionLetter, SCENE_TYPE_ORDER, SCENE_TYPES } from './scene-model';
import { selectClass } from './inline-editors';

/**
 * "Adicionar cena aqui": um traço pontilhado entre cartões com um "+" no
 * centro, que abre o seletor de tipo em linguagem de autor. Quando a cena
 * anterior é uma decisão, pergunta depois de qual opção a nova cena entra.
 */
export function AddSceneSlot({
  afterChoice,
  onAdd,
  className,
  label = 'Adicionar cena aqui',
}: {
  /** decisão imediatamente anterior, se houver (pede a opção) */
  afterChoice?: ChoiceNode;
  onAdd: (type: ExecutableNodeType, optionId?: string) => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [optionId, setOptionId] = React.useState<string>(afterChoice?.options[0]?.id ?? '');
  const id = React.useId();

  React.useEffect(() => {
    if (afterChoice && !afterChoice.options.some((o) => o.id === optionId)) setOptionId(afterChoice.options[0]?.id ?? '');
  }, [afterChoice, optionId]);

  return (
    <div className={cn('relative py-1.5', className)}>
      {!open ? (
        <div className="group flex items-center gap-2">
          <span className="h-px flex-1 border-t border-dashed border-line-strong" aria-hidden="true" />
          <button
            type="button"
            data-testid="add-scene"
            aria-expanded={open}
            aria-controls={id}
            aria-label={label}
            title={label}
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line bg-bg px-3 text-xs font-medium text-fg-faint transition-colors hover:border-accent hover:text-accent focus-visible:text-accent group-hover:border-line-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
          <span className="h-px flex-1 border-t border-dashed border-line-strong" aria-hidden="true" />
        </div>
      ) : (
        <div id={id} role="group" aria-label="Que tipo de cena entra aqui?" className="panel space-y-3 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-fg">Que tipo de cena entra aqui?</p>
            <Button variant="ghost" size="sm" aria-label="Fechar" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {afterChoice && (
            <div>
              <label htmlFor={`${id}-opt`} className="mb-1 block text-xs font-medium text-fg-muted">
                Depois de qual opção?
              </label>
              <select id={`${id}-opt`} className={selectClass} value={optionId} onChange={(e) => setOptionId(e.target.value)}>
                {afterChoice.options.map((o, i) => (
                  <option key={o.id} value={o.id}>
                    {optionLetter(i)}. {o.label}
                  </option>
                ))}
                <option value="">Sem ligação (ligo depois)</option>
              </select>
            </div>
          )}
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {SCENE_TYPE_ORDER.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  data-testid={`add-scene-${t}`}
                  onClick={() => {
                    onAdd(t, afterChoice ? optionId || undefined : undefined);
                    setOpen(false);
                  }}
                  className="flex min-h-11 w-full items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:border-accent"
                >
                  <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', SCENE_TYPES[t].dot)} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{SCENE_TYPES[t].label}</span>
                    <span className="block text-xs text-fg-muted">{SCENE_TYPES[t].description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

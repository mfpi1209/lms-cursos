'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Opções em cartões (vidro escuro no tema escuro, branco no claro): texto à esquerda, controle à direita. O controle É
 * o input nativo (radio/checkbox) redesenhado — semântica de grupo, setas do
 * teclado e o `data-testid="option-…"` continuam no próprio input.
 */
export function OptionCards({
  options,
  selected,
  onToggle,
  multiple = false,
  disabled = false,
  legend,
  describedBy,
}: {
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** texto para leitores de tela (o enunciado visível fica no título) */
  legend: string;
  describedBy?: string;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} aria-describedby={describedBy} className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="space-y-3" role="presentation">
        {options.map((opt) => {
          const on = selected.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={cn(
                // vidro (como a referência): escuro = preto 35% + desfoque, borda branca 12%; claro = branco com borda cinza. Raio 18
                'group flex min-h-[72px] w-full cursor-pointer items-center gap-5 rounded-[18px] border-[1.5px] px-5 py-4 text-left text-[18px] font-normal leading-snug text-fg backdrop-blur-[12px] transition-[border-color,background-color,box-shadow] duration-150 md:px-7 md:text-[19px]',
                'has-disabled:cursor-not-allowed has-disabled:opacity-60',
                'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--im-accent-ink)]',
                // marcada: anel do acento (lima no escuro; oliva sobre lima clara no tema claro, texto marinho)
                on
                  ? 'border-[var(--im-accent-line)] bg-[var(--im-selected)] shadow-[0_0_0_1px_var(--im-seg-ring)]'
                  : 'border-[var(--im-glass-line)] bg-[var(--im-glass)] hover:border-[var(--im-glass-line-hover)] hover:bg-[var(--im-glass-hover)]',
              )}
            >
              <span className="min-w-0 flex-1">{opt.label}</span>
              <span className="relative grid size-6 shrink-0 place-items-center">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={name}
                  value={opt.id}
                  checked={on}
                  onChange={() => onToggle(opt.id)}
                  data-testid={`option-${opt.id}`}
                  className={cn(
                    'peer size-6 cursor-pointer appearance-none border-[1.5px] border-[var(--im-control)] bg-transparent outline-none! transition-colors group-hover:border-[var(--im-control-hover)]',
                    multiple ? 'rounded-md' : 'rounded-full',
                    'checked:border-[var(--im-accent-line)]',
                    multiple
                      ? 'checked:bg-[var(--im-accent-line)]'
                      : 'checked:bg-[radial-gradient(circle,var(--im-accent-line)_0_5px,transparent_5.5px)]',
                  )}
                />
                {multiple && <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-4 text-[var(--im-on-line)] opacity-0 peer-checked:opacity-100" />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

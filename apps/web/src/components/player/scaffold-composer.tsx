'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { assembleScaffold, cleanScaffoldValue, isScaffoldComplete, parseScaffoldTemplate, type ReflectionScaffold } from '@lms/course-schema';
import { cn } from '@/lib/utils';

export interface ComposedSentence {
  /** frase montada (lacunas vazias como "…") */
  text: string;
  /** todas as lacunas preenchidas */
  complete: boolean;
}

/**
 * "Monte sua frase": o molde vira uma frase com botões nas lacunas. Tocar numa
 * lacuna abre os blocos prontos dela; "Outro…" (quando a lacuna permite) abre um
 * campo curto. Abaixo, a frase montada ao vivo. Quem envia é o painel que usa
 * este componente ("Usar esta frase" → intenção `reflect` com o texto).
 *
 * Teclado e leitor de tela: cada lacuna é um botão `aria-expanded` que controla
 * o grupo de opções (botões `aria-pressed`); Esc fecha e devolve o foco; ao
 * escolher, o foco vai para a próxima lacuna vazia. A prévia é `aria-live`.
 * Só tokens de tema (claro/escuro).
 */
export function ScaffoldComposer({
  scaffold,
  disabled = false,
  onChange,
  className,
}: {
  scaffold: ReflectionScaffold;
  disabled?: boolean;
  onChange: (sentence: ComposedSentence) => void;
  className?: string;
}) {
  const parts = useMemo(() => parseScaffoldTemplate(scaffold.template), [scaffold.template]);
  const slots = useMemo(() => new Map(scaffold.slots.map((s) => [s.id, s])), [scaffold.slots]);
  const order = useMemo(() => [...new Set(parts.flatMap((p) => (p.kind === 'slot' && slots.has(p.slotId) ? [p.slotId] : [])))], [parts, slots]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(order[0] ?? null);
  const [custom, setCustom] = useState<{ slotId: string; text: string } | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const customRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const previewId = `${baseId}-preview`;

  // prévia com as lacunas vazias como "___" (a frase enviada só sai quando completa)
  const text = assembleScaffold(scaffold, values, '___');
  const complete = isScaffoldComplete(scaffold, values);
  useEffect(() => onChange({ text, complete }), [text, complete, onChange]);
  useEffect(() => {
    if (custom) customRef.current?.focus();
  }, [custom]);

  const focusChip = (id: string) => requestAnimationFrame(() => chipRefs.current[id]?.focus());

  const choose = (slotId: string, value: string) => {
    const v = cleanScaffoldValue(value);
    if (!v) return;
    const next = { ...values, [slotId]: v };
    setValues(next);
    setCustom(null);
    // próxima lacuna vazia (depois desta, em ordem circular); sem vazias, fecha e volta o foco à lacuna
    const i = order.indexOf(slotId);
    const nextEmpty = [...order.slice(i + 1), ...order.slice(0, i)].find((id) => !next[id]);
    if (nextEmpty) {
      setOpen(nextEmpty);
      focusChip(nextEmpty);
    } else {
      setOpen(null);
      focusChip(slotId);
    }
  };

  const toggle = (slotId: string) => {
    setCustom(null);
    setOpen((cur) => (cur === slotId ? null : slotId));
  };

  const openSlot = open ? slots.get(open) : undefined;

  return (
    <div className={cn('space-y-4', className)} data-testid="scaffold-composer">
      {/* a frase com as lacunas como botões */}
      <p className="m-0 text-[20px] leading-[2.35] text-fg md:text-[22px]" data-testid="scaffold-sentence">
        {parts.map((p, i) => {
          if (p.kind === 'text') return <span key={i}>{p.text}</span>;
          const slot = slots.get(p.slotId);
          if (!slot) return <span key={i}>…</span>;
          const value = values[slot.id];
          const isOpen = open === slot.id;
          return (
            <button
              key={i}
              ref={(el) => {
                chipRefs.current[slot.id] = el;
              }}
              type="button"
              disabled={disabled}
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              aria-label={`${slot.label || slot.id}: ${value ? value : 'escolher'}`}
              onClick={() => toggle(slot.id)}
              data-testid={`scaffold-slot-${slot.id}`}
              data-filled={value ? 'true' : undefined}
              className={cn(
                'mx-0.5 inline-flex min-h-11 max-w-full items-center rounded-[12px] border-2 px-3 py-0.5 align-middle text-[18px] leading-snug transition-colors disabled:opacity-60 md:text-[19px]',
                value ? 'border-accent-strong bg-accent-soft font-medium text-fg' : 'border-dashed border-line-strong text-fg-muted hover:border-fg/50 hover:text-fg',
                isOpen && 'ring-2 ring-accent-strong ring-offset-2 ring-offset-bg',
              )}
            >
              <span className="whitespace-normal text-left">{value || 'escolha aqui'}</span>
            </button>
          );
        })}
      </p>

      {/* opções da lacuna aberta */}
      {openSlot && (
        <div
          id={panelId}
          role="group"
          aria-label={`Opções para ${openSlot.label || openSlot.id}`}
          data-testid="scaffold-options"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(null);
              setCustom(null);
              focusChip(openSlot.id);
            }
          }}
          className="rounded-[16px] border border-line bg-surface-2/80 p-3 backdrop-blur-md md:p-4"
        >
          <p className="mb-2.5 text-sm font-medium text-fg-muted" aria-hidden="true">
            Escolha uma opção para completar a frase:
          </p>
          <div className="flex flex-wrap gap-2">
            {openSlot.options
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) => {
                const on = values[openSlot.id] === cleanScaffoldValue(o);
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => choose(openSlot.id, o)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-left text-[16px] leading-snug text-fg transition-colors disabled:opacity-60',
                      on ? 'border-accent-strong bg-accent-soft font-medium' : 'border-line-strong bg-bg/40 hover:border-fg/40 hover:bg-fg/5',
                    )}
                  >
                    {on && <Check className="size-4 shrink-0 text-accent-strong" strokeWidth={3} aria-hidden="true" />}
                    {o}
                  </button>
                );
              })}
            {openSlot.allowCustom && custom?.slotId !== openSlot.id && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setCustom({ slotId: openSlot.id, text: '' })}
                data-testid="scaffold-custom"
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-dashed border-line-strong px-3.5 py-2 text-[16px] text-fg-muted hover:border-fg/40 hover:text-fg disabled:opacity-60"
              >
                <Pencil className="size-4" aria-hidden="true" /> Outro…
              </button>
            )}
          </div>
          {openSlot.allowCustom && custom?.slotId === openSlot.id && (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                choose(openSlot.id, custom.text);
              }}
            >
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-medium text-fg-muted">
                Escreva do seu jeito
                <input
                  ref={customRef}
                  value={custom.text}
                  maxLength={openSlot.customMaxLength}
                  onChange={(e) => setCustom({ slotId: openSlot.id, text: e.target.value })}
                  disabled={disabled}
                  data-testid="scaffold-custom-input"
                  className="min-h-11 rounded-[12px] border border-line-strong bg-bg/60 px-3 text-[16px] text-fg outline-none placeholder:text-fg-faint focus-visible:border-accent-strong"
                  placeholder={openSlot.options[0] ?? ''}
                />
              </label>
              <button
                type="submit"
                disabled={disabled || !cleanScaffoldValue(custom.text)}
                className="inline-flex min-h-11 items-center rounded-[12px] border border-accent-strong px-4 text-[16px] font-medium text-fg hover:bg-accent-soft disabled:opacity-50"
              >
                Usar
              </button>
            </form>
          )}
        </div>
      )}

      {/* prévia ao vivo */}
      <div className="rounded-[16px] border border-line bg-surface/70 px-4 py-3 backdrop-blur-md md:px-5" data-testid="scaffold-preview">
        <p id={previewId} className="text-sm font-medium text-fg-muted">
          Sua frase
        </p>
        <p aria-live="polite" className="mt-1 text-[18px] font-medium leading-relaxed text-fg">
          {text}
        </p>
      </div>
    </div>
  );
}

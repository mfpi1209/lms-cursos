'use client';

import * as React from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyThemePref, parseThemePref, type ThemePref } from '@/lib/theme';

const OPTIONS: Array<{ value: ThemePref; label: string; Icon: typeof Sun }> = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Escuro', Icon: Moon },
];

/* Preferência atual = atributo `data-theme-pref` em <html> (posto pelo servidor/script inline). */
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-pref'] });
  return () => obs.disconnect();
}
const getSnapshot = () => parseThemePref(document.documentElement.getAttribute('data-theme-pref'));
const getServerSnapshot = (): ThemePref => 'system';

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [pref, applyThemePref];
}

/**
 * Seletor de tema "Sistema / Claro / Escuro".
 * - ≥ 640px: grupo segmentado (radiogroup; setas mudam a escolha, Tab entra e sai do grupo).
 * - < 640px: um botão com o ícone atual que abre um menu com as três opções.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div className={cn('flex items-center', className)} data-testid="theme-switch">
      <Segmented pref={pref} onChange={setPref} className="max-sm:hidden" />
      <ThemeMenu pref={pref} onChange={setPref} className="sm:hidden" />
    </div>
  );
}

function Segmented({ pref, onChange, className }: { pref: ThemePref; onChange: (p: ThemePref) => void; className?: string }) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? OPTIONS.length - 1 : delta ? (i + delta + OPTIONS.length) % OPTIONS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(OPTIONS[to]!.value);
    refs.current[to]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Tema da interface" className={cn('inline-flex items-center gap-0.5 rounded-full border border-line-strong/70 bg-surface/60 p-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }, i) => {
        const on = pref === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Tema ${label.toLowerCase()}`}
            title={`Tema: ${label}`}
            tabIndex={on ? 0 : -1}
            data-theme-option={value}
            onClick={() => onChange(value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex size-9 [.lms-chrome_&]:size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-3! focus-visible:outline-offset-1! focus-visible:outline-accent!',
              on ? 'bg-accent-fill text-accent-fill-fg shadow-[inset_0_0_0_1px_var(--t-progress-ring)]' : 'text-fg-muted hover:bg-fg/8 hover:text-fg',
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ThemeMenu({ pref, onChange, className }: { pref: ThemePref; onChange: (p: ThemePref) => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = React.useId();
  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0]!;

  React.useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, OPTIONS.findIndex((o) => o.value === pref));
    itemRefs.current[idx]?.focus();
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
    // foco inicial só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Tema da interface: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-full border border-line-strong/70 text-fg hover:bg-fg/8 focus-visible:outline-3! focus-visible:outline-offset-1! focus-visible:outline-accent!"
      >
        <current.Icon className="size-5" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Tema da interface"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl border border-line bg-surface p-1.5 text-fg shadow-[0_16px_40px_-16px_rgb(0_0_0/0.45)]"
        >
          {OPTIONS.map(({ value, label, Icon }, i) => (
            <button
              key={value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={pref === value}
              data-theme-option={value}
              onClick={() => {
                onChange(value);
                close();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-3! focus-visible:-outline-offset-3! focus-visible:outline-accent!"
            >
              <Icon className="size-[18px] text-fg-muted" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {pref === value && <Check className="size-4 text-accent" strokeWidth={3} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

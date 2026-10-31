import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Chip as ChipData } from './theme';

/**
 * Primitivos do player da plataforma (embrulham o visual; os de components/ui
 * ficam intactos). Cores pelo acento do curso (`--im-accent`, `--im-on-accent`).
 */

const FOCUS = 'focus-visible:outline-3! focus-visible:outline-offset-2! focus-visible:outline-[var(--im-accent-ink)]!';

const VARIANTS = {
  // plano (sem brilho/sombra), como a referência. Desabilitado: acento a 35% com texto marinho.
  primary:
    'bg-[var(--im-accent)] text-[var(--im-on-accent)] font-semibold hover:brightness-105 disabled:bg-[color-mix(in_oklab,var(--im-accent)_35%,var(--im-disabled-base))] disabled:text-[color-mix(in_oklab,var(--im-on-accent)_80%,transparent)]',
  outline: 'border border-line-strong bg-[var(--im-outline-bg)] text-fg hover:border-fg/40 hover:bg-fg/5 font-medium backdrop-blur-[12px] disabled:opacity-50',
  ghost: 'text-fg/80 hover:text-fg hover:bg-fg/5 font-medium disabled:opacity-50',
} as const;

const SIZES = {
  xl: 'min-h-16 px-7 text-[18px] rounded-[14px] gap-3',
  lg: 'min-h-14 px-7 text-[17px] rounded-[14px] gap-3',
  md: 'min-h-12 px-5 text-base rounded-[12px] gap-2.5',
  sm: 'min-h-11 px-4 text-sm rounded-full gap-2',
} as const;

export type ImVariant = keyof typeof VARIANTS;
export type ImSize = keyof typeof SIZES;

export function imButtonClass(variant: ImVariant = 'primary', size: ImSize = 'lg', className?: string) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap transition-[background-color,border-color,filter] duration-150 disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    FOCUS,
    className,
  );
}

export const ImButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ImVariant; size?: ImSize }>(
  ({ variant = 'primary', size = 'lg', className, type = 'button', ...props }, ref) => <button ref={ref} type={type} className={imButtonClass(variant, size, className)} {...props} />,
);
ImButton.displayName = 'ImButton';

export function ImLink({ href, variant = 'primary', size = 'lg', className, ...props }: React.ComponentProps<typeof Link> & { variant?: ImVariant; size?: ImSize }) {
  return <Link href={href} className={imButtonClass(variant, size, className)} {...props} />;
}

const DOT: Record<ChipData['tone'], string> = {
  accent: 'bg-[var(--im-accent)] shadow-[0_0_0_1.5px_var(--im-seg-ring)]',
  neutral: 'bg-fg/70',
  warm: 'bg-paid',
  danger: 'bg-danger',
};

/** Pílula de estado da cena ("SUA VEZ"): texto em caixa normal no DOM, caixa alta no CSS. */
export function StatusChip({ chip, className }: { chip: ChipData; className?: string }) {
  return (
    <p
      data-testid="scene-chip"
      className={cn('inline-flex min-h-9 items-center gap-2.5 rounded-full border border-[var(--im-chip-line)] bg-[var(--im-chip)] px-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg backdrop-blur-md', className)}
    >
      <span aria-hidden="true" className={cn('size-2.5 rounded-full', DOT[chip.tone])} />
      {chip.label}
    </p>
  );
}

/** Caixa translúcida no tom do tema (avisos, retorno da escolha, resposta aberta). */
export function ImCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[16px] border border-line bg-[var(--im-card)] p-4 backdrop-blur-md md:p-5', className)} {...props} />;
}

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Botões do sistema: retângulos arredondados (14px), como na linguagem da plataforma.
 * Uma só cor de ação (accent, com texto `accent-fg`); `secondary` é contorno;
 * violeta (`ai`) só para o que a IA faz; âmbar (`paid`) só para ação paga.
 * Alvos de toque ≥ 44px em todos os tamanhos.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[14px] font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 min-h-12 px-6 text-sm select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-accent-fill font-semibold text-accent-fill-fg hover:bg-accent-fill-strong',
        secondary: 'border border-line-strong bg-transparent text-fg hover:border-fg/40 hover:bg-fg/5',
        ghost: 'text-fg-muted hover:bg-fg/5 hover:text-fg',
        danger: 'bg-danger-soft text-danger border border-danger/30 hover:border-danger/60',
        ai: 'bg-ai-soft text-ai border border-ai/30 hover:border-ai/60',
        paid: 'bg-paid-soft text-paid border border-paid/30 hover:border-paid/60',
      },
      size: {
        sm: 'min-h-11 px-4 text-sm',
        md: '',
        lg: 'min-h-14 px-8 text-base',
        icon: 'min-h-11 min-w-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
export { buttonVariants };

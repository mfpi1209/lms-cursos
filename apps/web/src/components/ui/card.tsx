import { cn } from '@/lib/utils';

/** Cartão do tema (no estúdio: marinho translúcido com borda branca 10%). `accent` liga o contorno do acento (destaque da tela). */
export function Card({ className, accent = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: boolean }) {
  return <div className={cn('panel p-6', accent && 'panel-accent', className)} {...props} />;
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'ai';

/** Cor do ponto que identifica o tom (o texto fica sempre em `fg`, legível em qualquer tema). */
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'before:bg-fg-faint',
  success: 'before:bg-success',
  warning: 'before:bg-paid',
  danger: 'before:bg-danger',
  brand: 'before:bg-accent',
  ai: 'before:bg-ai',
};

export function Badge({ className, tone = 'neutral', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        // pílula branca 10% com ponto colorido (como o "SUA VEZ" da plataforma); com ícone, o ícone substitui o ponto
        'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-fg/5 px-2.5 py-0.5 text-xs font-medium leading-5 text-fg',
        "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:content-[''] has-[svg]:before:hidden",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Estilo base compartilhado por input, textarea e select. O foco de teclado vem do :focus-visible global. */
export const fieldClassName =
  'block w-full rounded-[14px] border border-line-strong bg-surface-2 text-base text-fg placeholder:text-fg-faint transition-[border-color,box-shadow] hover:border-fg/40 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none disabled:cursor-not-allowed disabled:bg-bg-2 disabled:opacity-70';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldClassName, 'min-h-12 px-4', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClassName, 'px-4 py-3 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldClassName,
      'min-h-12 appearance-none bg-no-repeat pl-4 pr-10 [background-image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] [background-position:calc(100%-18px)_50%,calc(100%-13px)_50%] [background-size:5px_5px,5px_5px]',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

/** Caixa de seleção nativa, na cor do acento e com alvo de toque confortável. */
export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(({ className, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn('h-5 w-5 shrink-0 rounded border-line-strong accent-accent', className)} {...props} />
));
Checkbox.displayName = 'Checkbox';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-2 block text-sm font-medium text-fg', className)} {...props} />;
}

/** id do parágrafo de dica de um campo; use em `aria-describedby` do controle. */
export const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`;

/**
 * Rótulo + controle + dica. Com `required`, mostra "obrigatório" junto ao rótulo
 * (o controle deve receber `aria-required`/`required`). A dica ganha o id
 * `fieldHintId(htmlFor)` para ser ligada ao controle por `aria-describedby`.
 */
export function Field({ label, htmlFor, hint, required = false, children }: { label: string; htmlFor: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-2 text-xs font-medium text-fg-muted">(obrigatório)</span>}
      </Label>
      {children}
      {hint && <p id={fieldHintId(htmlFor)} className="mt-2 text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

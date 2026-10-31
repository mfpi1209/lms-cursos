'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { isRichTextEmpty, type RichTextDocument } from '@lms/course-schema';
import { RichText } from '@/components/rich-text';
import { RichTextEditor } from '@/components/studio/rich-text-editor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Título editável no lugar: um input que parece texto até receber foco. */
export function InlineTitle({
  id,
  value,
  onChange,
  label,
  placeholder,
  className,
  testId,
  maxLength = 120,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  maxLength?: number;
}) {
  return (
    // textarea de uma "linha lógica" que cresce com o conteúdo: títulos longos quebram em vez de serem cortados
    <textarea
      id={id}
      rows={1}
      aria-label={label}
      data-testid={testId}
      maxLength={maxLength}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn(
        'block w-full min-w-0 resize-none overflow-hidden [field-sizing:content] rounded-md border border-transparent bg-transparent px-1.5 py-1 -mx-1.5 font-semibold leading-tight text-fg placeholder:font-normal placeholder:text-fg-faint hover:border-line focus:border-accent focus:bg-surface-2 focus:outline-none',
        className,
      )}
    />
  );
}

/**
 * Texto rico editável no lugar: renderizado como leitura até o clique; vira o
 * editor até "Concluir" ou Escape. O rótulo acompanha o editor.
 */
export function InlineRichText({
  id,
  label,
  value,
  onChange,
  placeholder = 'Clique para escrever…',
  className,
  compact = false,
}: {
  id: string;
  label: string;
  value: RichTextDocument | undefined;
  onChange: (doc: RichTextDocument) => void;
  placeholder?: string;
  className?: string;
  /** versão menor (feedback de opção, orientação) */
  compact?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const empty = isRichTextEmpty(value);

  React.useEffect(() => {
    if (!editing) return;
    // O Tiptap monta de forma assíncrona (immediatelyRender: false); dá tempo de aparecer.
    const t = window.setTimeout(() => document.getElementById(id)?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [editing, id]);

  if (editing) {
    return (
      <div
        ref={wrapRef}
        className={cn('space-y-2', className)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
      >
        <span id={`${id}-label`} className="sr-only">{label}</span>
        <RichTextEditor id={id} value={value} onChange={onChange} aria-labelledby={`${id}-label`} className={compact ? 'text-sm' : undefined} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} data-testid={`${id}-done`}>
            Concluir
          </Button>
          <span className="text-xs text-fg-muted">Salva sozinho enquanto você escreve.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}. Pressione Enter para editar.`}
      data-testid={`${id}-view`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        'group relative min-h-11 cursor-text rounded-md border border-transparent px-2 py-1.5 -mx-2 text-fg hover:border-line hover:bg-surface-2 focus:outline-none focus-visible:border-accent',
        className,
      )}
    >
      {empty ? (
        <p className={cn('text-fg-faint', compact ? 'text-sm' : 'text-base')}>{placeholder}</p>
      ) : (
        <RichText doc={value} className={cn(compact && 'text-sm [&_p]:my-1')} />
      )}
      <Pencil className="absolute right-2 top-2 h-3.5 w-3.5 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
    </div>
  );
}

export const selectClass =
  'block min-h-11 w-full rounded-lg border border-line bg-surface-2 px-2.5 text-sm text-fg focus:border-accent focus:outline-none disabled:opacity-60';

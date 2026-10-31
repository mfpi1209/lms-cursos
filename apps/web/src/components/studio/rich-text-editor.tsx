'use client';

import * as React from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RichTextDocumentSchema, type RichTextDocument } from '@lms/course-schema';
import { cn } from '@/lib/utils';

const EMPTY: RichTextDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

/** Normaliza um documento vazio (sem blocos) para o que o Tiptap produz. */
function normalize(doc: RichTextDocument | undefined): RichTextDocument {
  if (!doc || doc.content.length === 0) return EMPTY;
  return doc;
}

export interface RichTextEditorProps {
  id: string;
  value: RichTextDocument | undefined;
  onChange(doc: RichTextDocument): void;
  placeholder?: string;
  className?: string;
  /** rótulo acessível quando não há <label htmlFor> */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * Editor restrito ao subconjunto permitido por `RichTextDocumentSchema`:
 * parágrafo, título (2 e 3), negrito, itálico, listas. Tudo que não passa no
 * schema é descartado antes de emitir.
 */
export function RichTextEditor({ id, value, onChange, placeholder, className, ...aria }: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = React.useRef<RichTextDocument | undefined>(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        hardBreak: false,
        link: false,
        underline: false,
      }),
    ],
    content: normalize(value),
    editorProps: {
      attributes: {
        id,
        class: 'prose-lms min-h-[7rem] px-3 py-2 text-base text-fg outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(aria['aria-label'] ? { 'aria-label': aria['aria-label'] } : {}),
        ...(aria['aria-labelledby'] ? { 'aria-labelledby': aria['aria-labelledby'] } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const parsed = RichTextDocumentSchema.safeParse(ed.getJSON());
      if (!parsed.success) return;
      lastEmittedRef.current = parsed.data;
      onChangeRef.current(parsed.data);
    },
  });

  // Só reescreve o conteúdo quando o valor externo difere do que o editor tem.
  React.useEffect(() => {
    if (!editor) return;
    const next = normalize(value);
    if (deepEqual(next, lastEmittedRef.current ?? EMPTY)) return;
    if (deepEqual(next, editor.getJSON())) return;
    lastEmittedRef.current = next;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            h2: ed.isActive('heading', { level: 2 }),
            h3: ed.isActive('heading', { level: 3 }),
            bullet: ed.isActive('bulletList'),
            ordered: ed.isActive('orderedList'),
          }
        : null,
  });

  const toolbarButton = (label: string, pressed: boolean, onClick: () => void, children: React.ReactNode, title?: string) => (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={!editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'min-h-9 min-w-9 rounded-md px-2 text-sm font-semibold text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50',
        pressed && 'bg-accent-soft text-accent',
      )}
    >
      {children}
    </button>
  );

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-surface focus-within:border-accent', className)}>
      <div role="toolbar" aria-label="Formatação" aria-controls={id} className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-2 py-1">
        {toolbarButton('Negrito', !!active?.bold, () => editor?.chain().focus().toggleBold().run(), <span className="font-bold">B</span>, 'Negrito (Ctrl+B)')}
        {toolbarButton('Itálico', !!active?.italic, () => editor?.chain().focus().toggleItalic().run(), <span className="italic">I</span>, 'Itálico (Ctrl+I)')}
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden="true" />
        {toolbarButton('Título nível 2', !!active?.h2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
        {toolbarButton('Título nível 3', !!active?.h3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), 'H3')}
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden="true" />
        {toolbarButton('Lista com marcadores', !!active?.bullet, () => editor?.chain().focus().toggleBulletList().run(), '•≡')}
        {toolbarButton('Lista numerada', !!active?.ordered, () => editor?.chain().focus().toggleOrderedList().run(), '1≡')}
      </div>
      <EditorContent editor={editor} />
      {placeholder && (!value || value.content.every((b) => !('content' in b) || !b.content || b.content.length === 0)) && (
        <p className="px-3 pb-2 text-xs text-fg-muted">{placeholder}</p>
      )}
    </div>
  );
}

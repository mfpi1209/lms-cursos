'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import type { LessonGraph, Scalar } from '@lms/course-schema';
import { buttonVariants } from '@/components/ui/button';
import { useDraft } from '@/components/studio/draft-provider';
import { cn } from '@/lib/utils';
import { defaultTestValues, previewHref, readsCourseVariables, testVariables } from './test-model';
import { PreviewLink } from './preview-link';
import { VariableInput } from './variable-input';

/**
 * "Testar a partir daqui" (cartão da cena no storyboard). Abre a prévia (sem
 * salvar nada) já nesta cena. Se a aula depende de variáveis de curso (ex.:
 * `perfil`), um seletor pequeno pede os valores, com padrões sensatos.
 */
export function TestFromHereButton({ courseId, lessonId, graph, nodeId, className }: { courseId: string; lessonId: string; graph: LessonGraph; nodeId: string; className?: string }) {
  const router = useRouter();
  const { document: doc, status: draftStatus, saveNow } = useDraft();
  const needsPicker = React.useMemo(() => readsCourseVariables(graph), [graph]);
  const vars = React.useMemo(() => testVariables(graph, doc).filter((v) => v.scope === 'course'), [graph, doc]);
  const defaults = React.useMemo(() => defaultTestValues(graph, nodeId, doc), [graph, nodeId, doc]);
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, Scalar>>(defaults);
  const wrap = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const popId = React.useId();
  const cls = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 px-3', className);

  React.useEffect(() => {
    if (!open) return;
    setValues(defaults);
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('select,input')?.focus());
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, defaults]);

  if (!needsPicker) {
    return (
      <PreviewLink href={previewHref(courseId, lessonId, { nodeId, variables: defaults })} className={cls} data-testid={`test-from-here-${nodeId}`} title="Abre a prévia nesta cena (nada é salvo; o rascunho é gravado antes)">
        <Play className="h-4 w-4" aria-hidden="true" /> Testar a partir daqui
      </PreviewLink>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <button ref={trigger} type="button" className={cls} aria-expanded={open} aria-controls={popId} onClick={() => setOpen((o) => !o)} data-testid={`test-from-here-${nodeId}`}>
        <Play className="h-4 w-4" aria-hidden="true" /> Testar a partir daqui
      </button>
      {open && (
        <form
          id={popId}
          role="group"
          aria-label="Valores para o teste"
          className="absolute right-0 z-30 mt-1 w-72 space-y-3 rounded-lg border border-line-strong bg-surface p-3 text-sm shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            // a prévia lê o rascunho salvo: grava antes de abrir (auditoria P2)
            void (draftStatus === 'dirty' || draftStatus === 'saving' ? saveNow().catch(() => undefined) : Promise.resolve()).then(() => router.push(previewHref(courseId, lessonId, { nodeId, variables: values })));
          }}
          data-testid="test-from-here-picker"
        >
          <p className="text-fg-muted">Esta aula muda conforme estas escolhas de outras aulas. Teste com:</p>
          {vars.map((v) => (
            <VariableInput key={v.name} variable={v} value={values[v.name] ?? v.initial} onChange={(x) => setValues((cur) => ({ ...cur, [v.name]: x }))} />
          ))}
          <button type="submit" className={cn(buttonVariants({ size: 'sm' }), 'w-full')} data-testid="test-from-here-go">
            <Play className="h-4 w-4" aria-hidden="true" /> Testar
          </button>
        </form>
      )}
    </div>
  );
}

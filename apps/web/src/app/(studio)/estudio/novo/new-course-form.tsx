'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WIZARD_STEPS } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { BriefFields, EMPTY_BRIEF, missingBriefFields, type Brief } from '@/components/studio/wizard/brief-fields';
import { StepProgressBar } from '@/components/studio/wizard/step-progress';
import { STEP_META } from '@/components/studio/wizard/wizard-state';

/**
 * Passo 1 da trilha ("Ideia e público"), fora do curso: ao criar, o rascunho já
 * nasce com este passo concluído e abre no passo 2 (Material). Não se preenche duas vezes.
 */
export function NewCourseForm() {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [brief, setBrief] = React.useState<Brief>(EMPTY_BRIEF);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // kits da biblioteca de modelos (estúdio + instrutor + voz + marca + direção); opcional
  const [kits, setKits] = React.useState<Array<{ key: string; name: string; description: string }>>([]);
  const [kit, setKit] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    api<{ templates: Array<{ key: string; name: string; description: string }> }>('/api/library?kind=kit')
      .then((r) => alive && setKits(r.templates))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const missing = missingBriefFields(title, brief);
  const canSubmit = missing.length === 0 && !busy;
  const next = STEP_META[WIZARD_STEPS[1]!];

  return (
    <form
      className="space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        setBusy(true);
        try {
          const { id } = await api<{ id: string; slug: string }>('/api/courses', { json: { title: title.trim(), brief, ...(kit ? { kit } : {}) } });
          router.push(`/estudio/cursos/${id}/montar`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Não foi possível criar o curso. Confira a conexão e tente de novo.');
          setBusy(false);
        }
      }}
    >
      <section aria-labelledby="novo-passo-1" className="panel rise p-6 sm:p-10">
        <div className="mb-8 space-y-4">
          <StepProgressBar current={1} total={WIZARD_STEPS.length} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="novo-passo-1" className="text-2xl sm:text-3xl">{STEP_META.tema.label}</h2>
            <span className="text-sm text-fg-faint">Passo 1 de {WIZARD_STEPS.length}</span>
          </div>
          <p className="text-sm text-fg-muted">Só título e ideia são obrigatórios. O resto ajuda a IA a acertar de primeira e pode ser ajustado depois no assistente.</p>
        </div>
        <BriefFields title={title} brief={brief} onTitle={setTitle} onBrief={(k, v) => setBrief((b) => ({ ...b, [k]: v }))} idPrefix="novo" />
        {kits.length > 0 && (
          <div className="mt-8 border-t border-line pt-8">
            <Field label="Kit pronto (estúdio, instrutor, voz e marca)" htmlFor="novo-kit" hint="Opcional. O curso já nasce com as peças aprovadas da biblioteca; nada é gerado nem cobrado agora.">
              <Select id="novo-kit" aria-describedby="novo-kit-hint" value={kit} onChange={(e) => setKit(e.target.value)} data-testid="novo-kit">
                <option value="">Sem kit (escolher depois, no passo Apresentação)</option>
                {kits.map((k) => (
                  <option key={k.key} value={k.key}>{k.name}</option>
                ))}
              </Select>
            </Field>
            {kit && <p className="mt-2 text-sm text-fg-muted">{kits.find((k) => k.key === kit)?.description}</p>}
            <p className="mt-2 text-sm"><Link href="/estudio/modelos" className="inline-flex min-h-11 items-center text-accent hover:underline">Ver a biblioteca de modelos</Link></p>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/estudio" className={cn(buttonVariants({ variant: 'ghost' }))}>Cancelar</Link>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button type="submit" size="lg" disabled={!canSubmit} aria-describedby={missing.length > 0 ? 'novo-missing' : undefined} data-testid="wizard-next">
            {busy ? 'Criando…' : `Criar curso e ir para ${next.short}`}
          </Button>
          {/* explica por que o botão está desabilitado (anunciado quando muda) */}
          <p id="novo-missing" aria-live="polite" className={cn('text-sm text-fg-muted sm:text-right', missing.length === 0 && 'sr-only')} data-testid="novo-missing">
            {missing.length > 0 ? `Para continuar, preencha ${joinPt(missing)}.` : 'Tudo pronto para criar o curso.'}
          </p>
        </div>
      </div>
    </form>
  );
}

/** "a", "a e b", "a, b e c" */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

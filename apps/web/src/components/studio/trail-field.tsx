'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, fieldHintId } from '@/components/ui/input';

/**
 * Trilha temática do curso na vitrine do aluno ("Primeiro emprego", "Convivência"…). Fica no curso,
 * fora do rascunho: vale na hora, sem republicar. Sugere as trilhas já usadas no workspace.
 */
export function TrailField({ courseId }: { courseId: string }) {
  const [value, setValue] = React.useState('');
  const [saved, setSaved] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<string[]>([]);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/courses/${courseId}/trail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { trail: string | null; options: string[] } | null) => {
        if (!alive || !j) return;
        setValue(j.trail ?? '');
        setSaved(j.trail);
        setOptions(j.options);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [courseId]);

  const save = async () => {
    setState('saving');
    const r = await fetch(`/api/courses/${courseId}/trail`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trail: value.trim() || null }) });
    if (!r.ok) return setState('error');
    const j = (await r.json()) as { trail: string | null };
    setSaved(j.trail);
    setValue(j.trail ?? '');
    if (j.trail && !options.includes(j.trail)) setOptions((o) => [...o, j.trail!].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    setState('saved');
  };

  const dirty = (value.trim() || null) !== saved;
  return (
    <Field label="Trilha na vitrine" htmlFor="course-trail" hint="Agrupa cursos do mesmo tema numa fileira da área do aluno. Vale na hora, sem republicar.">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id="course-trail"
          list="course-trail-options"
          maxLength={60}
          value={value}
          placeholder="Ex.: Primeiro emprego"
          aria-describedby={fieldHintId('course-trail')}
          className="max-w-sm"
          onChange={(e) => {
            setValue(e.target.value);
            setState('idle');
          }}
        />
        <datalist id="course-trail-options">
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <Button type="button" variant="secondary" size="sm" onClick={save} disabled={!dirty || state === 'saving'}>
          {state === 'saving' ? 'Salvando…' : 'Salvar trilha'}
        </Button>
        <span role="status" className="text-sm text-fg-muted">
          {state === 'saved' ? (saved ? `Na trilha "${saved}".` : 'Sem trilha.') : state === 'error' ? 'Não foi possível salvar. Tente de novo.' : ''}
        </span>
      </div>
    </Field>
  );
}

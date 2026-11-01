'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { assembleScaffold, scaffoldGroupLabel, scaffoldIssues, scaffoldPlaceholders, SCAFFOLD_MAX_OPTIONS, type ReflectionScaffold, type ScaffoldSlot } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Textarea } from '@/components/ui/input';

const NEW_SCAFFOLD: ReflectionScaffold = {
  template: 'Estou {momento}. {experiencia}.',
  slots: [
    { id: 'momento', label: 'seu momento', options: ['terminando o ensino médio', 'fazendo um curso técnico'], allowCustom: true, customMaxLength: 60 },
    { id: 'experiencia', label: 'algo que você fez', options: ['Organizei um trabalho em grupo', 'Fiz trabalho voluntário'], allowCustom: true, customMaxLength: 60 },
  ],
};

/**
 * Edição simples da atividade "Na prática" (reflexão com molde): molde com `{lacuna}`, e para cada
 * lacuna o nome, a pergunta do grupo (opcional; o aluno lê acima das opções), as opções (uma por
 * linha, de 2 a 5) e se aceita "Prefiro escrever". Mostra a frase de exemplo e os problemas que
 * bloqueiam a publicação (o compilador repete a mesma verificação).
 */
export function ScaffoldFields({
  idPrefix,
  scaffold,
  onChange,
}: {
  idPrefix: string;
  scaffold: ReflectionScaffold | undefined;
  onChange: (next: ReflectionScaffold | undefined, coalesce?: string) => void;
}) {
  if (!scaffold) {
    return (
      <div className="rounded-xl border border-dashed border-line p-3 text-sm text-fg-muted">
        <p>Para público tímido: em vez de escrever, a pessoa monta a frase tocando em blocos prontos.</p>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => onChange(structuredClone(NEW_SCAFFOLD))} data-testid="scaffold-add">
          <Plus className="size-4" aria-hidden="true" /> Montar frase com blocos
        </Button>
      </div>
    );
  }
  const setSlot = (idx: number, p: Partial<ScaffoldSlot>, coalesce?: string) =>
    onChange({ ...scaffold, slots: scaffold.slots.map((s, i) => (i === idx ? { ...s, ...p } : s)) }, coalesce);
  const issues = scaffoldIssues(scaffold);
  const placeholders = [...new Set(scaffoldPlaceholders(scaffold.template))];
  const example = assembleScaffold(scaffold, Object.fromEntries(scaffold.slots.map((s) => [s.id, s.options[0]])));
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-3" data-testid="scaffold-fields">
      <legend className="px-1 text-xs font-medium text-fg-muted">Frase para montar (blocos)</legend>
      <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted" htmlFor={`${idPrefix}-template`}>
        Molde da frase (use {'{lacuna}'} para cada parte)
        <Textarea
          id={`${idPrefix}-template`}
          rows={2}
          maxLength={600}
          className="text-sm"
          value={scaffold.template}
          onChange={(e) => onChange({ ...scaffold, template: e.target.value }, `scaffold.template.${idPrefix}`)}
        />
      </label>
      <p className="text-xs text-fg-muted">
        Lacunas no molde: {placeholders.length ? placeholders.map((p) => `{${p}}`).join(', ') : 'nenhuma'} · Exemplo: “{example}”
      </p>
      <ol className="space-y-2" aria-label="Lacunas">
        {scaffold.slots.map((slot, idx) => (
          <li key={idx} className="space-y-2 rounded-lg bg-surface-2 p-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex w-36 flex-col gap-0.5 text-xs font-medium text-fg-muted">
                Id (no molde)
                <Input className="min-h-10 text-sm" maxLength={40} value={slot.id} onChange={(e) => setSlot(idx, { id: e.target.value.replace(/\s+/g, '_') }, `scaffold.id.${idPrefix}.${idx}`)} />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-xs font-medium text-fg-muted">
                Nome da lacuna (o que a pessoa vê)
                <Input className="min-h-10 text-sm" maxLength={60} value={slot.label} onChange={(e) => setSlot(idx, { label: e.target.value }, `scaffold.label.${idPrefix}.${idx}`)} />
              </label>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remover a lacuna ${slot.label || slot.id}`} onClick={() => onChange({ ...scaffold, slots: scaffold.slots.filter((_, i) => i !== idx) })}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
              Pergunta do grupo (opcional, o que a pessoa lê acima das opções)
              <Input
                className="min-h-10 text-sm"
                maxLength={100}
                value={slot.question ?? ''}
                placeholder={`Sem pergunta: “${scaffoldGroupLabel({ ...slot, question: undefined }, idx + 1)}”`}
                onChange={(e) => {
                  const q = e.target.value;
                  const { question: _drop, ...rest } = slot;
                  onChange({ ...scaffold, slots: scaffold.slots.map((s, i) => (i === idx ? (q.trim() ? { ...rest, question: q } : rest) : s)) }, `scaffold.question.${idPrefix}.${idx}`);
                }}
                data-testid={`scaffold-question-${idx}`}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
              Opções (uma por linha, de 2 a {SCAFFOLD_MAX_OPTIONS})
              <Textarea
                rows={Math.min(SCAFFOLD_MAX_OPTIONS, Math.max(2, slot.options.length))}
                className="text-sm"
                value={slot.options.join('\n')}
                onChange={(e) => setSlot(idx, { options: e.target.value.split('\n').slice(0, SCAFFOLD_MAX_OPTIONS) }, `scaffold.opts.${idPrefix}.${idx}`)}
              />
            </label>
            <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg">
              <Checkbox checked={slot.allowCustom} onChange={(e) => setSlot(idx, { allowCustom: e.target.checked })} />
              Permitir “Prefiro escrever” (a pessoa escreve uma parte curta)
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={scaffold.slots.length >= 8}
          onClick={() => onChange({ ...scaffold, slots: [...scaffold.slots, { id: `parte_${scaffold.slots.length + 1}`, label: '', options: ['', ''], allowCustom: true, customMaxLength: 60 }] })}
        >
          <Plus className="size-4" aria-hidden="true" /> Adicionar lacuna
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          Voltar a resposta escrita
        </Button>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-0.5 text-xs" aria-label="Problemas da frase para montar">
          {issues.map((i, k) => (
            <li key={k} className={i.level === 'error' ? 'text-danger' : 'text-fg-muted'}>
              {i.level === 'error' ? 'Bloqueia a publicação: ' : 'Aviso: '}
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

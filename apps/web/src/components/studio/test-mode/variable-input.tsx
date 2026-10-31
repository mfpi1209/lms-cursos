'use client';

import * as React from 'react';
import type { Scalar } from '@lms/course-schema';
import { fieldClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TestVariable } from './test-model';

/** Campo de uma variável de teste: lista (texto com valores conhecidos / sim-não), número ou texto livre. */
export function VariableInput({ variable: v, value, onChange, live }: { variable: TestVariable; value: Scalar; onChange(v: Scalar): void; live?: Scalar }) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commitNumber = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-medium text-fg">
        <span>
          {v.label}
          {v.scope === 'course' && <span className="ml-1 font-normal text-fg-faint">(do curso)</span>}
        </span>
        {live !== undefined && live !== value && <span className="font-normal text-fg-faint">agora: {String(live)}</span>}
      </label>
      {v.type === 'boolean' ? (
        <select id={id} className={cn(fieldClassName, 'min-h-10 py-1.5')} value={String(value)} onChange={(e) => onChange(e.target.value === 'true')} data-testid={`test-var-${v.name}`}>
          <option value="true">sim</option>
          <option value="false">não</option>
        </select>
      ) : v.type === 'string' && v.options.length > 0 ? (
        <select id={id} className={cn(fieldClassName, 'min-h-10 py-1.5')} value={String(value)} onChange={(e) => onChange(e.target.value)} data-testid={`test-var-${v.name}`}>
          {(v.options.includes(value) ? v.options : [value, ...v.options]).map((o) => (
            <option key={String(o)} value={String(o)}>{String(o)}</option>
          ))}
        </select>
      ) : v.type === 'number' ? (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={cn(fieldClassName, 'min-h-10 py-1.5')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitNumber}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNumber();
            }
          }}
          data-testid={`test-var-${v.name}`}
        />
      ) : (
        <input
          id={id}
          className={cn(fieldClassName, 'min-h-10 py-1.5')}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onChange(draft)}
          data-testid={`test-var-${v.name}`}
        />
      )}
    </div>
  );
}

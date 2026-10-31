'use client';

import { useDraft } from '@/components/studio/draft-provider';
import { BriefFields, type BriefPatch } from './brief-fields';

/** Passo "Ideia e público": o único briefing do curso (o mesmo formulário de /estudio/novo, completo). */
export function StepTema() {
  const { document: doc, update } = useDraft();
  const onBrief: BriefPatch = (key, value) => update((d) => ({ ...d, brief: { ...d.brief, [key]: value } }), { coalesce: `brief.${key}` });
  return (
    <BriefFields
      title={doc.title}
      brief={doc.brief}
      onTitle={(v) => update((d) => ({ ...d, title: v }), { coalesce: 'course.title' })}
      onBrief={onBrief}
      extended
    />
  );
}

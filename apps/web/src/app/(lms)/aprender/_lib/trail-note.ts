/**
 * O que falta para o Selo DNA Work da trilha, em uma frase (página do curso, da trilha e fim do último curso).
 * `unit`: o que a trilha conta ("curso" na maioria; "parte" nas trilhas em série).
 */
export interface TrailNoteInput {
  trail: string;
  courses: ReadonlyArray<{ done: boolean }>;
  badge: unknown;
  checkPassed: boolean;
  eligibility: { activitiesMissing: readonly unknown[] };
}

export function trailSealNote(st: TrailNoteInput, unit: 'curso' | 'parte' = 'curso'): string {
  const left = st.courses.filter((c) => !c.done).length;
  const noun = unit === 'parte' ? (left === 1 ? 'parte' : 'partes') : left === 1 ? 'curso' : 'cursos';
  if (st.badge) return 'Você já tem o Selo desta trilha.';
  if (left > 0) return `Falta${left === 1 ? '' : 'm'} ${left} ${noun}, as atividades “Na prática” e a checagem final para o Selo DNA Work · ${st.trail}.`;
  if (st.eligibility.activitiesMissing.length > 0) return 'Faltam atividades “Na prática” para salvar e a checagem final.';
  return st.checkPassed ? 'Tudo pronto: abra a trilha para ver seu selo.' : 'Falta só a checagem final da trilha.';
}

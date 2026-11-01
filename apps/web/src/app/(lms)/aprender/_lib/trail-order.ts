/**
 * Ordem dos cursos dentro de uma trilha, a mesma na vitrine e em "Minhas trilhas". O banco não guarda uma ordem de
 * currículo (docs/novos-cursos/importacao.md), então: em andamento primeiro, depois os que ainda não começou e, por fim,
 * os concluídos (que continuam na trilha); em cada grupo, por título (ordem estável). A ordem das trilhas fica em
 * `TRAIL_ORDER` (@lms/course-schema).
 */
export function orderInTrail<T>(items: readonly T[], pick: (item: T) => { done: boolean; started: boolean; title: string }): T[] {
  const rank = (t: T) => {
    const p = pick(t);
    return p.done ? 2 : p.started ? 0 : 1;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || pick(a).title.localeCompare(pick(b).title, 'pt-BR'));
}

/** Progresso real da trilha: "1 de 3 concluídos" ("1 de 1 concluído" quando a trilha tem um só curso). Em série: "1 de 3 partes concluídas". */
export function trailProgressCopy(done: number, total: number, unit?: 'partes'): string {
  if (unit === 'partes') return `${done} de ${total} ${total === 1 ? 'parte concluída' : 'partes concluídas'}`;
  return `${done} de ${total} ${total === 1 ? 'concluído' : 'concluídos'}`;
}

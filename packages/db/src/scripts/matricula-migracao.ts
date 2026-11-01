/**
 * Regras puras da migração de matrícula para uma versão nova (usadas por publicar-e-matricular.ts).
 * Sem banco: testável em isolamento.
 */
type Doc = { modules: Array<{ id?: string; lessons: Array<{ id: string; graph: { nodes: Array<{ id: string }> } }> }> };

export const nodeKeys = (doc: unknown): Set<string> => new Set((doc as Doc).modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes.map((n) => `${l.id}/${n.id}`))));
const lessonIds = (doc: unknown) => JSON.stringify((doc as Doc).modules.map((m) => m.lessons.map((l) => l.id)));
/** aulas e cenas idênticas (só textos/vídeos mudaram) */
export const sameShape = (a: unknown, b: unknown): boolean =>
  JSON.stringify((a as Doc).modules.map((m) => m.lessons.map((l) => [l.id, l.graph.nodes.map((n) => n.id)]))) === JSON.stringify((b as Doc).modules.map((m) => m.lessons.map((l) => [l.id, l.graph.nodes.map((n) => n.id)])));

/** mesmas aulas, e as cenas da versão nova são um subconjunto das da antiga (nada novo, só remoções) */
export function onlyRemovals(oldDoc: unknown, newDoc: unknown): boolean {
  if (lessonIds(oldDoc) !== lessonIds(newDoc)) return false;
  const o = nodeKeys(oldDoc);
  return [...nodeKeys(newDoc)].every((k) => o.has(k));
}

/**
 * Só acrescentou aulas: todas as aulas antigas continuam, na mesma ordem e no mesmo módulo, e cada uma tem as
 * mesmas cenas ou só perdeu cenas (nenhuma cena nova em aula antiga); a versão nova acrescenta pelo menos uma
 * aula DEPOIS das existentes: no fim do último módulo antigo ou em módulos novos no fim.
 * Fora da regra: aula inserida no meio, reordenada, movida de módulo, removida, ou cena nova em aula antiga.
 * (Sem aula acrescentada, é `sameShape`/`onlyRemovals`.)
 */
export function onlyAppendedLessons(oldDoc: unknown, newDoc: unknown): boolean {
  const o = (oldDoc as Doc).modules;
  const n = (newDoc as Doc).modules;
  if (n.length < o.length) return false;
  let appended = 0;
  for (let i = 0; i < n.length; i++) {
    const nm = n[i]!;
    const om = o[i];
    if (!om) {
      // módulo novo no fim: só aulas novas (nenhuma aula antiga pode ter sido movida para cá)
      appended += nm.lessons.length;
      continue;
    }
    if (om.id !== undefined && nm.id !== undefined && om.id !== nm.id) return false;
    if (nm.lessons.length < om.lessons.length) return false;
    for (let j = 0; j < om.lessons.length; j++) {
      const ol = om.lessons[j]!;
      const nl = nm.lessons[j]!;
      if (ol.id !== nl.id) return false;
      const had = new Set(ol.graph.nodes.map((x) => x.id));
      if (nl.graph.nodes.some((x) => !had.has(x.id))) return false; // cena nova em aula antiga
    }
    const extra = nm.lessons.length - om.lessons.length;
    if (extra > 0 && i !== o.length - 1) return false; // aula nova no meio (módulo antigo que não é o último)
    appended += extra;
  }
  if (appended === 0) return false;
  // nenhuma aula "nova" pode ser, na verdade, uma aula antiga repetida/movida
  const oldIds = new Set(o.flatMap((m) => m.lessons.map((l) => l.id)));
  const ids = n.flatMap((m) => m.lessons.map((l) => l.id));
  if (new Set(ids).size !== ids.length) return false;
  const newOnes = n.flatMap((m, i) => m.lessons.slice(o[i]?.lessons.length ?? 0).map((l) => l.id));
  return newOnes.every((id) => !oldIds.has(id));
}

/** chaves `aula/cena` que existiam na versão antiga e não existem na nova */
export function removedNodes(oldDoc: unknown, newDoc: unknown): Set<string> {
  const n = nodeKeys(newDoc);
  return new Set([...nodeKeys(oldDoc)].filter((k) => !n.has(k)));
}

export type OpenAttempt = { id: string; lessonId: string; state: unknown };

/**
 * Tentativas em andamento que precisam ser encerradas: só as cujo `currentNodeId` (a cena onde o aluno ESTÁ)
 * saiu da versão nova. Quem apenas PASSOU por uma cena removida (está em `path`) continua de onde parou.
 */
export function attemptsToClose<T extends OpenAttempt>(open: T[], gone: Set<string>): T[] {
  return open.filter((a) => {
    const cur = (a.state as { currentNodeId?: string } | null)?.currentNodeId;
    return !!cur && gone.has(`${a.lessonId}/${cur}`);
  });
}

/** ids das aulas que a versão nova acrescenta (não existiam na antiga), na ordem do curso */
export function appendedLessonIds(oldDoc: unknown, newDoc: unknown): string[] {
  const had = new Set((oldDoc as Doc).modules.flatMap((m) => m.lessons.map((l) => l.id)));
  return (newDoc as Doc).modules.flatMap((m) => m.lessons.map((l) => l.id)).filter((id) => !had.has(id));
}

export interface AppendPlan {
  /** a matrícula continua concluída (status, data, % e selos intactos) */
  keepCompleted: boolean;
  /** `enrollments.optionalLessonIds` depois da migração */
  optionalLessonIds: string[];
  /** aulas novas que passam a ser obrigatórias para esta matrícula (em andamento) */
  required: string[];
}

/**
 * O que fazer com UMA matrícula quando a versão nova só acrescentou aulas no fim (`onlyAppendedLessons`):
 *  - concluída: continua concluída; as aulas novas viram "conteúdo novo" (opcionais), acumuladas às já opcionais;
 *  - em andamento: as aulas novas entram no caminho como obrigatórias (nada muda em `optionalLessonIds`);
 *  - cancelada: nada muda.
 * Nunca reabre um curso concluído.
 */
export function planAppend(input: { status: 'active' | 'completed' | 'canceled'; oldDoc: unknown; newDoc: unknown; doneLessonIds?: Iterable<string>; optionalLessonIds?: string[] }): AppendPlan {
  const appended = appendedLessonIds(input.oldDoc, input.newDoc);
  const current = input.optionalLessonIds ?? [];
  if (input.status === 'completed') {
    const done = new Set(input.doneLessonIds ?? []);
    const optional = [...new Set([...current, ...appended.filter((id) => !done.has(id))])];
    return { keepCompleted: true, optionalLessonIds: optional, required: [] };
  }
  return { keepCompleted: false, optionalLessonIds: current, required: input.status === 'active' ? appended : [] };
}

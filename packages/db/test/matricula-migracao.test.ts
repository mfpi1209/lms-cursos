import { describe, expect, it } from 'vitest';
import { appendedLessonIds, attemptsToClose, onlyAppendedLessons, onlyRemovals, planAppend, removedNodes, sameShape } from '../src/scripts/matricula-migracao';

const doc = (lessons: Record<string, string[]>) => ({ modules: [{ lessons: Object.entries(lessons).map(([id, nodes]) => ({ id, graph: { nodes: nodes.map((n) => ({ id: n })) } })) }] });
const oldDoc = doc({ l1: ['a', 'aval', 'b', 'c'], l2: ['x', 'y'] });
const newDoc = doc({ l1: ['a', 'b', 'c'], l2: ['x', 'y'] });

describe('migração de matrícula (regras puras)', () => {
  it('só remoções: identifica as cenas removidas', () => {
    expect(onlyRemovals(oldDoc, newDoc)).toBe(true);
    expect(sameShape(oldDoc, newDoc)).toBe(false);
    expect([...removedNodes(oldDoc, newDoc)]).toEqual(['l1/aval']);
  });
  it('cena nova ou aula diferente não é só remoção', () => {
    expect(onlyRemovals(newDoc, oldDoc)).toBe(false);
    expect(onlyRemovals(oldDoc, doc({ l1: ['a', 'b'] }))).toBe(false);
  });
  it('encerra só quem ESTÁ na cena removida; quem apenas passou por ela continua', () => {
    const gone = removedNodes(oldDoc, newDoc);
    const parado = { id: 'att1', lessonId: 'l1', state: { currentNodeId: 'aval', path: [{ nodeId: 'a' }, { nodeId: 'aval' }] } };
    const passou = { id: 'att2', lessonId: 'l1', state: { currentNodeId: 'c', path: [{ nodeId: 'a' }, { nodeId: 'aval' }, { nodeId: 'b' }, { nodeId: 'c' }] } };
    const outraAula = { id: 'att3', lessonId: 'l2', state: { currentNodeId: 'aval', path: [] } }; // 'aval' não saiu de l2
    const semEstado = { id: 'att4', lessonId: 'l1', state: null };
    expect(attemptsToClose([parado, passou, outraAula, semEstado], gone).map((a) => a.id)).toEqual(['att1']);
  });
  it('mesma estrutura', () => {
    expect(sameShape(oldDoc, doc({ l1: ['a', 'aval', 'b', 'c'], l2: ['x', 'y'] }))).toBe(true);
  });
});

/** documento com vários módulos: cada módulo é um mapa aula -> cenas (ids de módulo m1, m2, ...) */
const docM = (...mods: Array<Record<string, string[]>>) => ({
  modules: mods.map((lessons, i) => ({ id: `m${i + 1}`, lessons: Object.entries(lessons).map(([id, nodes]) => ({ id, graph: { nodes: nodes.map((n) => ({ id: n })) } })) })),
});

describe('migração de matrícula: aulas acrescentadas no fim', () => {
  const antigo = docM({ aula_01: ['a', 'b'], aula_02: ['x', 'y'] });

  it('aula anexada no fim do último módulo migra', () => {
    const novo = docM({ aula_01: ['a', 'b'], aula_02: ['x', 'y'], aula_03: ['p', 'q'] });
    expect(onlyAppendedLessons(antigo, novo)).toBe(true);
    expect(sameShape(antigo, novo)).toBe(false);
    expect(onlyRemovals(antigo, novo)).toBe(false);
    expect(removedNodes(antigo, novo).size).toBe(0);
  });
  it('aula anexada em módulo novo no fim migra', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a', 'b'], aula_02: ['x', 'y'] }, { aula_03: ['p'] }))).toBe(true);
  });
  it('sem aula nova não entra nesta regra (é sameShape / onlyRemovals)', () => {
    expect(onlyAppendedLessons(antigo, antigo)).toBe(false);
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a'], aula_02: ['x', 'y'] }))).toBe(false);
  });
  it('aula inserida no meio não migra', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a', 'b'], aula_nova: ['p'], aula_02: ['x', 'y'] }))).toBe(false);
  });
  it('aula acrescentada em módulo antigo que não é o último não migra', () => {
    const dois = docM({ aula_01: ['a'] }, { aula_02: ['x'] });
    expect(onlyAppendedLessons(dois, docM({ aula_01: ['a'], aula_nova: ['p'] }, { aula_02: ['x'] }))).toBe(false);
  });
  it('aula antiga movida para outro módulo não migra', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a', 'b'] }, { aula_02: ['x', 'y'], aula_03: ['p'] }))).toBe(false);
  });
  it('aulas reordenadas não migram, mesmo com aula nova no fim', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_02: ['x', 'y'], aula_01: ['a', 'b'], aula_03: ['p'] }))).toBe(false);
  });
  it('aula antiga removida não migra', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a', 'b'], aula_03: ['p'] }))).toBe(false);
  });
  it('aula anexada junto com cena removida de aula antiga migra, e a cena removida é reportada', () => {
    const novo = docM({ aula_01: ['a'], aula_02: ['x', 'y'], aula_03: ['p'] });
    expect(onlyAppendedLessons(antigo, novo)).toBe(true);
    expect([...removedNodes(antigo, novo)]).toEqual(['aula_01/b']);
  });
  it('cena nova em aula antiga não migra, mesmo com aula anexada', () => {
    expect(onlyAppendedLessons(antigo, docM({ aula_01: ['a', 'b', 'c'], aula_02: ['x', 'y'], aula_03: ['p'] }))).toBe(false);
  });
  it('tentativa parada em cena removida é encerrada; a de aula intacta segue', () => {
    const novo = docM({ aula_01: ['a'], aula_02: ['x', 'y'], aula_03: ['p'] });
    const gone = removedNodes(antigo, novo);
    const parado = { id: 'att1', lessonId: 'aula_01', state: { currentNodeId: 'b' } };
    const seguindo = { id: 'att2', lessonId: 'aula_02', state: { currentNodeId: 'y' } };
    expect(attemptsToClose([parado, seguindo], gone).map((a) => a.id)).toEqual(['att1']);
  });
});

describe('migração de matrícula: aula acrescentada não reabre curso concluído', () => {
  const antigo = docM({ aula_01: ['a'], aula_02: ['x'] });
  const novo = docM({ aula_01: ['a'], aula_02: ['x'], aula_03: ['p'] }, { aula_04: ['q'] });

  it('lista só as aulas que a versão nova acrescenta, na ordem do curso', () => {
    expect(appendedLessonIds(antigo, novo)).toEqual(['aula_03', 'aula_04']);
    expect(appendedLessonIds(antigo, antigo)).toEqual([]);
  });
  it('concluída: continua concluída e a aula nova vira conteúdo novo (opcional), acumulando', () => {
    const p = planAppend({ status: 'completed', oldDoc: antigo, newDoc: novo, doneLessonIds: ['aula_01', 'aula_02'], optionalLessonIds: ['aula_00'] });
    expect(p).toEqual({ keepCompleted: true, optionalLessonIds: ['aula_00', 'aula_03', 'aula_04'], required: [] });
  });
  it('concluída: aula nova já feita não fica como "novo"; sem duplicar', () => {
    const p = planAppend({ status: 'completed', oldDoc: antigo, newDoc: novo, doneLessonIds: ['aula_03'], optionalLessonIds: ['aula_04'] });
    expect(p.optionalLessonIds).toEqual(['aula_04']);
  });
  it('em andamento: aula nova é obrigatória (nada opcional)', () => {
    const p = planAppend({ status: 'active', oldDoc: antigo, newDoc: novo, optionalLessonIds: [] });
    expect(p).toEqual({ keepCompleted: false, optionalLessonIds: [], required: ['aula_03', 'aula_04'] });
  });
  it('cancelada: nada muda', () => {
    expect(planAppend({ status: 'canceled', oldDoc: antigo, newDoc: novo })).toEqual({ keepCompleted: false, optionalLessonIds: [], required: [] });
  });
});

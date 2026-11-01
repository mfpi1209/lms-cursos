import { describe, expect, it } from 'vitest';
import { compileLesson } from '../src/compile';
import { richTextFromPlain as p } from '../src/richtext';
import { assembleScaffold, isScaffoldComplete, parseScaffoldTemplate, scaffoldIssues, ReflectionScaffoldSchema, type ReflectionScaffold } from '../src/scaffold';
import type { AnyNode } from '../src/nodes';
import type { LessonGraph } from '../src/graph';

const scaffold = (over: Partial<ReflectionScaffold> = {}): ReflectionScaffold =>
  ReflectionScaffoldSchema.parse({
    template: 'Estou {momento}. {experiencia}.',
    slots: [
      { id: 'momento', label: 'seu momento', options: ['terminando o ensino médio', 'fazendo um curso técnico'] },
      { id: 'experiencia', label: 'algo que você fez', options: ['Organizei um trabalho em grupo', 'Fiz trabalho voluntário'] },
    ],
    ...over,
  });

function lesson(sc: ReflectionScaffold): LessonGraph {
  const nodes: AnyNode[] = [
    { id: 'monte', type: 'reflection', title: 'Monte sua frase', prompt: p('Toque nas partes.'), objectiveIds: [], required: true, minLength: 0, maxLength: 300, scaffold: sc },
    { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true },
  ];
  return { schemaVersion: 1, startNodeId: 'monte', variables: [], nodes, edges: [{ id: 'e1', from: 'monte', to: 'fim' }], layout: { positions: {} } };
}
const codes = (sc: ReflectionScaffold) => compileLesson(lesson(sc)).errors.map((e) => e.code);

describe('scaffold: molde da composição guiada', () => {
  it('padrões: allowCustom true e customMaxLength 60', () => {
    const s = scaffold();
    expect(s.slots[0]).toMatchObject({ allowCustom: true, customMaxLength: 60 });
  });

  it('quebra o molde em texto e lacunas', () => {
    expect(parseScaffoldTemplate('Estou {momento}. {experiencia}.')).toEqual([
      { kind: 'text', text: 'Estou ' },
      { kind: 'slot', slotId: 'momento' },
      { kind: 'text', text: '. ' },
      { kind: 'slot', slotId: 'experiencia' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('monta a frase: lacuna vazia vira "…", pontuação final da parte some e a frase começa com maiúscula', () => {
    const s = scaffold();
    expect(assembleScaffold(s, {})).toBe('Estou …. ….');
    expect(isScaffoldComplete(s, { momento: 'terminando o ensino médio' })).toBe(false);
    const values = { momento: 'terminando o ensino médio', experiencia: 'fiz trabalho voluntário.' };
    expect(isScaffoldComplete(s, values)).toBe(true);
    expect(assembleScaffold(s, values)).toBe('Estou terminando o ensino médio. Fiz trabalho voluntário.');
    expect(assembleScaffold({ template: '{situacao}, eu {acao}.' }, { situacao: 'num trabalho em grupo', acao: '  dividi  as tarefas ' })).toBe('Num trabalho em grupo, eu dividi as tarefas.');
  });

  it('a pontuação da frase vem do MOLDE: a parte perde só a pontuação final e o molde mantém "?" e "." (a missão copia esta mesma frase)', () => {
    expect(assembleScaffold({ template: 'Oi, tudo bem? {pedido}?' }, { pedido: 'Pode me dar um retorno rápido?' })).toBe('Oi, tudo bem? Pode me dar um retorno rápido?');
    expect(assembleScaffold({ template: 'Oi, tudo bem? Pode me dar {pedido}?' }, { pedido: 'um retorno rápido' })).toBe('Oi, tudo bem? Pode me dar um retorno rápido?');
    // molde sem pontuação (dado de teste mal montado): nada é inventado, a frase sai sem pontuação
    expect(assembleScaffold({ template: 'Oi, tudo {a} {b}' }, { a: 'bem?', b: 'Pode me dar um retorno rápido.' })).toBe('Oi, tudo bem Pode me dar um retorno rápido');
  });

  it('compila sem erros um molde válido', () => {
    expect(codes(scaffold())).toEqual([]);
    expect(scaffoldIssues(scaffold())).toEqual([]);
  });

  it('erro: lacuna do molde sem bloco correspondente', () => {
    expect(codes(scaffold({ template: 'Estou {momento}. {area}.' }))).toContain('SCAFFOLD_UNKNOWN_SLOT');
  });

  it('erro: ids de bloco repetidos', () => {
    const s = scaffold();
    expect(codes({ ...s, slots: [...s.slots, { ...s.slots[0]! }] })).toContain('SCAFFOLD_DUPLICATE_SLOT');
  });

  it('erro: bloco com menos de 2 opções ou opção vazia; molde sem lacunas', () => {
    const s = scaffold();
    expect(codes({ ...s, slots: [{ ...s.slots[0]!, options: ['só uma'] }, s.slots[1]!] })).toContain('SCAFFOLD_SLOT_OPTIONS');
    expect(codes({ ...s, slots: [{ ...s.slots[0]!, options: ['uma', '  '] }, s.slots[1]!] })).toContain('SCAFFOLD_SLOT_OPTIONS');
    expect(codes({ ...s, template: 'Sem lacunas.' })).toContain('SCAFFOLD_EMPTY_TEMPLATE');
  });

  it('aviso (não erro): bloco que o molde não usa', () => {
    const s = scaffold({ template: 'Estou {momento}.' });
    const r = compileLesson(lesson(s));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('SCAFFOLD_UNUSED_SLOT');
  });
});

describe('revisão de respostas e frase composta no roteiro (compilador)', () => {
  const base = (extra: Partial<Extract<AnyNode, { type: 'content' }>>, recapExtra: Record<string, unknown> = {}): LessonGraph => ({
    schemaVersion: 1,
    startNodeId: 'q',
    variables: [],
    nodes: [
      { id: 'q', type: 'choice', title: 'Pergunta', prompt: p('?'), objectiveIds: [], required: true, options: [{ id: 'a', label: 'A', quality: 'strong' }, { id: 'b', label: 'B', quality: 'weak' }] },
      { id: 'res', type: 'content', title: 'Resultado', body: p('Veja'), objectiveIds: [], required: true, ...extra },
      { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true, recap: [{ id: 'r', label: 'Frase', kind: 'choice', nodeId: 'q', emptyText: 'x', ...recapExtra }] },
    ],
    edges: [
      { id: 'e1', from: 'q', to: 'res', optionId: 'a' },
      { id: 'e2', from: 'q', to: 'res', optionId: 'b' },
      { id: 'e3', from: 'res', to: 'fim' },
    ],
    layout: { positions: {} },
  });

  it('reviewNodeIds: precisa apontar para decisões desta aula', () => {
    expect(compileLesson(base({ reviewNodeIds: ['q'] })).errors).toEqual([]);
    expect(compileLesson(base({ reviewNodeIds: ['res'] })).errors.map((e) => e.code)).toContain('REVIEW_SOURCE_MISSING');
    expect(compileLesson(base({ reviewNodeIds: ['nao_existe'] })).errors.map((e) => e.code)).toContain('REVIEW_SOURCE_MISSING');
  });

  it('composedNodeIds: precisa apontar para reflexões', () => {
    expect(compileLesson(base({}, { composedNodeIds: ['q'] })).errors.map((e) => e.code)).toContain('RECAP_SOURCE_MISSING');
  });
});

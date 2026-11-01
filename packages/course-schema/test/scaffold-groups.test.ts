import { describe, expect, it } from 'vitest';
import {
  assembleScaffold,
  restoreScaffoldPicks,
  scaffoldGroupLabel,
  scaffoldGroups,
  scaffoldMissingCount,
  scaffoldSegments,
  ReflectionScaffoldSchema,
  type ReflectionScaffold,
  type ScaffoldSegment,
} from '../src/scaffold';

const sc = (template: string, slots: Array<Partial<ReflectionScaffold['slots'][number]> & { id: string }>): ReflectionScaffold =>
  ReflectionScaffoldSchema.parse({ template, slots: slots.map((s) => ({ label: '', options: ['a', 'b'], ...s })) });

const joined = (segs: ScaffoldSegment[]) => segs.map((s) => (s.kind === 'missing' ? '' : s.text)).join('');

const chegada = sc('Para meu primeiro dia, posso confirmar {informacao}? Também gostaria de saber {apoio}.', [
  { id: 'informacao', label: 'informação', options: ['o horário e a entrada', 'o endereço completo'] },
  { id: 'apoio', label: 'apoio', options: ['quem devo procurar na chegada', 'qual canal usar se houver um imprevisto'] },
]);

describe('scaffold "tudo visível": grupos e rótulos', () => {
  it('grupos na ordem do molde, uma vez cada, só lacunas existentes', () => {
    const s = sc('{b} e {a}, depois {b} de novo e {fantasma}.', [{ id: 'a' }, { id: 'b' }]);
    expect(scaffoldGroups(s).map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('rótulo: pergunta do grupo > nome legível > "Escolha a parte N" (nunca o id técnico)', () => {
    expect(scaffoldGroupLabel({ id: 'acao', label: 'ação', question: 'Como você quer começar?' }, 1)).toBe('Como você quer começar?');
    expect(scaffoldGroupLabel({ id: 'informacao', label: 'informação' }, 1)).toBe('Informação');
    expect(scaffoldGroupLabel({ id: 'o_motivo', label: 'o motivo' }, 2)).toBe('O motivo');
    expect(scaffoldGroupLabel({ id: 'revisao', label: 'revisao' }, 2)).toBe('Escolha a parte 2');
    expect(scaffoldGroupLabel({ id: 'experiencia', label: '' }, 3)).toBe('Escolha a parte 3');
    expect(scaffoldGroupLabel({ id: 'x', label: 'x', question: '   ' }, 1)).toBe('Escolha a parte 1');
  });

  it('a pergunta do grupo é opcional no schema (cursos antigos continuam válidos)', () => {
    expect(chegada.slots[0]!.question).toBeUndefined();
    expect(ReflectionScaffoldSchema.parse({ template: '{a}', slots: [{ id: 'a', question: 'O quê?', options: ['x', 'y'] }] }).slots[0]!.question).toBe('O quê?');
  });
});

describe('scaffold "tudo visível": prévia em trechos', () => {
  it('completa: os trechos juntos são exatamente a frase enviada', () => {
    const v = { informacao: 'o horário e a entrada', apoio: 'quem devo procurar na chegada' };
    const segs = scaffoldSegments(chegada, v);
    expect(joined(segs)).toBe(assembleScaffold(chegada, v));
    expect(segs.filter((s) => s.kind === 'value').map((s) => (s as { text: string }).text)).toEqual(['o horário e a entrada', 'quem devo procurar na chegada']);
  });

  it('respeita pontuação do molde, tira a pontuação final da parte e põe maiúscula no começo da frase', () => {
    const s = sc('{inicio}. Depois, {fim}!', [{ id: 'inicio' }, { id: 'fim' }]);
    const v = { inicio: 'gostaria de entender.', fim: 'confirmo com você  ' };
    const segs = scaffoldSegments(s, v);
    expect(joined(segs)).toBe('Gostaria de entender. Depois, confirmo com você!');
    expect(joined(segs)).toBe(assembleScaffold(s, v));
    expect(segs[0]).toEqual({ kind: 'value', slotId: 'inicio', text: 'Gostaria de entender' });
  });

  it('lacuna repetida aparece em todos os lugares com o mesmo valor', () => {
    const s = sc('{nome}, oi! Aqui é {nome} de novo.', [{ id: 'nome' }]);
    const segs = scaffoldSegments(s, { nome: 'a Bia' });
    expect(joined(segs)).toBe('A Bia, oi! Aqui é a Bia de novo.');
    expect(segs.filter((x) => x.kind === 'value')).toHaveLength(2);
    expect(scaffoldGroups(s)).toHaveLength(1);
  });

  it('parcial: a parte que falta vira um trecho "missing" (sem texto inventado) e a contagem acompanha', () => {
    const segs = scaffoldSegments(chegada, { informacao: 'o endereço completo' });
    expect(segs.map((x) => x.kind)).toEqual(['text', 'value', 'text', 'missing', 'text']);
    expect(joined(segs)).toBe('Para meu primeiro dia, posso confirmar o endereço completo? Também gostaria de saber .');
    expect(scaffoldMissingCount(chegada, { informacao: 'o endereço completo' })).toBe(1);
    expect(scaffoldMissingCount(chegada, {})).toBe(2);
    expect(scaffoldMissingCount(chegada, { informacao: '   ', apoio: 'x' })).toBe(1);
  });

  it('quebras e espaços do molde: espaço duplo vira um; quebra de linha vira espaço como na frase enviada', () => {
    const s = sc('Oi,  {a}.\n{b}.', [{ id: 'a' }, { id: 'b' }]);
    const v = { a: 'tudo bem', b: 'até logo' };
    expect(joined(scaffoldSegments(s, v))).toBe(assembleScaffold(s, v));
  });
});

describe('scaffold "tudo visível": restaurar escolhas de uma frase salva', () => {
  it('casa opções (sem diferenciar maiúscula) e devolve null para frase que não casa', () => {
    const text = assembleScaffold(chegada, { informacao: 'o horário e a entrada', apoio: 'qual canal usar se houver um imprevisto' });
    expect(restoreScaffoldPicks(chegada, text)).toEqual({
      informacao: { kind: 'option', value: 'o horário e a entrada' },
      apoio: { kind: 'option', value: 'qual canal usar se houver um imprevisto' },
    });
    expect(restoreScaffoldPicks(chegada, 'Outra frase qualquer.')).toBeNull();
    expect(restoreScaffoldPicks(chegada, '')).toBeNull();
  });

  it('parte escrita pelo aluno volta como "Prefiro escrever"; sem permissão, não restaura', () => {
    const text = assembleScaffold(chegada, { informacao: 'a portaria certa', apoio: 'quem devo procurar na chegada' });
    expect(restoreScaffoldPicks(chegada, text)?.informacao).toEqual({ kind: 'custom', text: 'a portaria certa' });
    const strict = sc(chegada.template, chegada.slots.map((s) => ({ ...s, allowCustom: false })));
    expect(restoreScaffoldPicks(strict, text)).toBeNull();
  });
});

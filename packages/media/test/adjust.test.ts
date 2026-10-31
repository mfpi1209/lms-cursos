import { describe, expect, it } from 'vitest';
import { adjustOptions, deriveAdjustState, isAdjustJobInput, keptText, keptWordRange, mergeAdjust, reactionOpener, sentenceSpans, validateAdjust, type AdjustUnit } from '../src/adjust';

const w = (t: string) => t.split(' ').map((text, i) => ({ text, start: i, end: i + 0.5 }));
const s2 = w('Eu sou a Marina, sua orientadora. Você escolhe, vê o que acontece.');
const s3 = w('Não precisa gravar sua voz. Vamos acompanhar a Luana.');
const base = [
  { id: 's1', line: 'Nesta aula, você vai confirmar o que precisa.' },
  { id: 's2', line: 'Eu sou a Marina, sua orientadora. Você escolhe, vê o que acontece.' },
  { id: 's3', line: 'Não precisa gravar sua voz. Vamos acompanhar a Luana.' },
  { id: 's4', line: 'Junto com o s5.' },
  { id: 's5', line: 'Fala do s5.' },
];
const units: AdjustUnit[] = [
  { id: 's1', kind: 'clip', shotIds: ['s1'] },
  { id: 's2', kind: 'clip', shotIds: ['s2'] },
  { id: 's3', kind: 'clip', shotIds: ['s3'] },
  { id: 'u45', kind: 'clip', shotIds: ['s4', 's5'] },
];
const words = new Map([['s1', w('Nesta aula, você vai confirmar o que precisa.')], ['s2', s2], ['s3', s3]]);

describe('ajuste fino: frases e cortes', () => {
  it('frases pela pontuação e faixa que sobra', () => {
    expect(sentenceSpans(s2)).toEqual([[0, 5], [6, 11]]);
    expect(keptText(s2, { first: 0, last: 1 })).toBe('Eu sou a Marina, sua orientadora.');
    expect(keptText(s3, { first: 1, last: 0 })).toBe('Vamos acompanhar a Luana.');
    expect(keptWordRange(s2, 1, 1)).toBeNull();
  });

  it('acumula pedidos: tira, corta duas vezes, cartão novo e cartão removido', () => {
    let st = mergeAdjust({ drop: [], cut: {} }, { drop: ['s1'], cut: [{ shotId: 's2', side: 'last' }], teaser: ' Dois campos faltam. Como entrega? ' });
    expect(st).toEqual({ drop: ['s1'], cut: { s2: { first: 0, last: 1 } }, teaser: 'Dois campos faltam. Como entrega?' });
    st = mergeAdjust(st, { cut: [{ shotId: 's2', side: 'last' }] });
    expect(st.cut.s2).toEqual({ first: 0, last: 2 });
    expect(st.teaser).toBe('Dois campos faltam. Como entrega?');
    expect(mergeAdjust(st, { teaser: null }).teaser).toBeNull();
  });

  it('reconstrói o estado de ajustes feitos por script a partir do rascunho', () => {
    const draft = [base[0]!, { id: 's2', line: 'Eu sou a Marina, sua orientadora.' }, { id: 's3', line: 'Vamos acompanhar a Luana.' }, base[3]!, base[4]!].filter((s) => s.id !== 's1');
    expect(deriveAdjustState(base, draft, words)).toEqual({ drop: ['s1'], cut: { s2: { first: 0, last: 1 }, s3: { first: 1, last: 0 } } });
  });

  it('opções por plano: plano que divide clipe não sai nem corta; frase única não corta', () => {
    const o = new Map(adjustOptions(base, units, words, { drop: [], cut: {} }).map((x) => [x.id, x]));
    expect(o.get('s1')).toMatchObject({ canDrop: true, canCutFirst: false, canCutLast: false });
    expect(o.get('s2')).toMatchObject({ canDrop: true, canCutFirst: true, canCutLast: true });
    expect(o.get('s4')).toMatchObject({ canDrop: false, canCutFirst: false });
    const after = new Map(adjustOptions(base, units, words, { drop: [], cut: { s2: { first: 0, last: 1 } } }).map((x) => [x.id, x]));
    expect(after.get('s2')).toMatchObject({ line: 'Eu sou a Marina, sua orientadora.', canCutLast: false });
  });

  it('valida o pedido com mensagens para o autor', () => {
    const st = { drop: [], cut: {} };
    expect(validateAdjust(base, units, words, st, {})).toMatch(/Nada a ajustar/);
    expect(validateAdjust(base, units, words, st, { drop: ['s4'] })).toMatch(/não pode sair/);
    expect(validateAdjust(base, units, words, st, { cut: [{ shotId: 's1', side: 'first' }] })).toMatch(/primeira frase/);
    expect(validateAdjust(base, units, words, st, { teaser: Array.from({ length: 23 }, () => 'x').join(' ') })).toMatch(/22 palavras/);
    expect(validateAdjust(base, units, words, st, { drop: ['s1'], cut: [{ shotId: 's2', side: 'last' }], teaser: 'Como entrega?' })).toBeNull();
  });

  it('reação: interjeição de abertura só quando há conteúdo depois; tipo do job', () => {
    expect(reactionOpener('Boa escolha! Você avisa a pendência.')).toBe('Boa escolha!');
    expect(reactionOpener('Boa escolha!')).toBeNull();
    expect(reactionOpener('Faz sentido, mas confirme antes.')).toBeNull();
    expect(isAdjustJobInput({ kind: 'adjust', target: 'reaction', choiceId: 'q01', optionId: 'a' })).toBe(true);
    expect(isAdjustJobInput({ kind: 'bumper', spec: {} })).toBe(false);
  });
});

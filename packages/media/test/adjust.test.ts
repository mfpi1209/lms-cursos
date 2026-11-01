import { describe, expect, it } from 'vitest';
import { adjustOptions, carryAdjust, deriveAdjustState, fillSkipText, isAdjustJobInput, keptSegments, keptText, keptWordRange, keptWords, mergeAdjust, reactionOpener, segmentTimes, sentenceSpans, skipTextOf, soloShotWords, validateAdjust, verifySkips, type AdjustUnit } from '../src/adjust';

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

describe('trimLead: apara a oração de abertura', () => {
  const w = (t: string) => t.split(' ').map((text) => ({ text }));
  it('tira as primeiras palavras da 1ª frase e mantém o resto', () => {
    const words = w('Seja qual for a sua escolha, o caminho é parecido: confira antes. Depois avise.');
    const r = keptWordRange(words, 0, 0, 6)!;
    expect(words.slice(r[0], r[1] + 1).map((x) => x.text).join(' ')).toBe('o caminho é parecido: confira antes. Depois avise.');
  });
  it('não deixa o plano sem fala', () => {
    expect(keptWordRange(w('Seja qual for.'), 0, 0, 5)).toBeNull();
  });
});

describe('carryAdjust: ajuste fino depois de regravar', () => {
  const old = { s1: 'Oi! Eu sou a Marina.', s2: 'Seja qual for a sua escolha, o caminho é parecido. Confira o endereço.', s3: 'Vamos acompanhar a Luana. Ela recebeu a mensagem.', chamada: 'Agora é com você: o que falta?' };
  const prev = { drop: ['s1'], cut: { s2: { first: 0, last: 1, lead: 6 }, s3: { first: 1, last: 0 } }, teaser: 'O que a Luana ainda precisa confirmar?' };

  it('reaplica cortes nos planos cuja fala não mudou, e o cartão sempre', () => {
    const shots = [{ id: 's1', line: old.s1 }, { id: 's2', line: old.s2 }, { id: 's3', line: 'Vamos acompanhar a Luana agora. Ela recebeu a mensagem.' }, { id: 'chamada', line: 'Fato. Agora, responda: o que falta?' }];
    const { request, skipped } = carryAdjust(prev, old, shots);
    expect(request).toEqual({ drop: ['s1'], cut: [{ shotId: 's2', side: 'last' }], trimLead: [{ shotId: 's2', words: 6 }], teaser: prev.teaser });
    expect(skipped).toEqual(['cortar s3: fala mudou']);
  });

  it('cena com planos novos (abertura reescrita): só o cartão; plano de chamada novo não conta', () => {
    const shots = [{ id: 's1', line: old.s1 }, { id: 'boasvindas', line: 'Ao final do curso…' }, { id: 's2', line: old.s2 }, { id: 'chamada', line: old.chamada }];
    const { request, skipped } = carryAdjust(prev, old, shots);
    expect(request).toEqual({ teaser: prev.teaser });
    expect(skipped.every((x) => x.endsWith('abertura reescrita'))).toBe(true);
    const withCall2 = [...Object.entries(old).map(([id, line]) => ({ id, line })), { id: 'chamada_2', line: 'x' }];
    expect(carryAdjust(prev, old, withCall2).request?.drop).toEqual(['s1']);
  });

  it('sem as falas antigas: só o cartão; usa baseLines guardadas no ajuste quando houver', () => {
    const shots = Object.entries(old).map(([id, line]) => ({ id, line }));
    expect(carryAdjust(prev, null, shots).request).toEqual({ teaser: prev.teaser });
    expect(carryAdjust({ ...prev, baseLines: old }, null, shots).request?.cut).toEqual([{ shotId: 's2', side: 'last' }, { shotId: 's3', side: 'first' }]);
  });

  it('sem cartão (null) também volta; nada a reaplicar = null', () => {
    expect(carryAdjust({ drop: [], cut: {}, teaser: null }, old, []).request).toEqual({ teaser: null });
    expect(carryAdjust({ drop: [], cut: {} }, old, []).request).toBeNull();
  });

  it('não tira todos os planos que sobraram', () => {
    const { request, skipped } = carryAdjust({ drop: ['s1'], cut: {} }, { s1: 'A.' }, [{ id: 's1', line: 'A.' }]);
    expect(request).toBeNull();
    expect(skipped[0]).toContain('vazio');
  });
});

describe('skip: trecho tirado do meio do plano', () => {
  const s = w('Fuja de duas respostas: não tenho e perfeccionista. As duas soam falsas. Escolha algo real e mostre.');
  it('trechos que sobram e texto acertado', () => {
    // "As duas soam falsas." = índices 8..11
    expect(keptSegments(s, { first: 0, last: 0, skip: [[8, 11]] })).toEqual([[0, 7], [12, 16]]);
    expect(keptText(s, { first: 0, last: 0, skip: [[8, 11]] })).toBe('Fuja de duas respostas: não tenho e perfeccionista. Escolha algo real e mostre.');
  });
  it('corte que termina a frase passa o ponto para a palavra antes; corte que começa frase deixa maiúscula', () => {
    const t = w('Peça apoio à escola ou ao agente do contrato. Se precisar, procure outra pessoa.');
    // tira "ou ao agente do contrato." (4..8): "escola" herda o ponto
    expect(keptText(t, { first: 0, last: 0, skip: [[4, 8]] })).toBe('Peça apoio à escola. Se precisar, procure outra pessoa.');
    const u = w('Use o nome. Talvez a pessoa prefira outro, e tudo bem.');
    expect(keptWords(u, { first: 0, last: 0, lead: 0, skip: [[3, 3]] }).map((x) => x.text).join(' ')).toBe('Use o nome. A pessoa prefira outro, e tudo bem.');
  });
  it('corte no fim do que sobra também passa o ponto final', () => {
    const t = w('Peça apoio à escola ou ao agente do contrato.');
    expect(keptText(t, { first: 0, last: 0, skip: [[4, 8]] })).toBe('Peça apoio à escola.');
  });
  it('soma com frases do começo/fim e acumula no estado; valida limites', () => {
    const st = mergeAdjust({ drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 4, to: 5 }], cut: [{ shotId: 's2', side: 'last' }] });
    expect(st.cut.s2).toEqual({ first: 0, last: 1, skip: [[4, 5]] });
    expect(mergeAdjust(st, { skip: [{ shotId: 's2', from: 4, to: 5 }] }).cut.s2!.skip).toEqual([[4, 5]]);
    expect(validateAdjust(base, units, words, { drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 4, to: 5 }] })).toBeNull();
    expect(validateAdjust(base, units, words, { drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 0, to: 99 }] })).toMatch(/fora do plano/);
    expect(validateAdjust(base, units, words, { drop: [], cut: {} }, { skip: [{ shotId: 's4', from: 0, to: 1 }] })).toMatch(/clipe sozinho/);
  });
  it('vai junto na regravação quando a fala do plano não mudou', () => {
    const prev = { drop: [], cut: { s2: { first: 0, last: 0, skip: [[4, 5]] as Array<[number, number]> } } };
    const r = carryAdjust(prev, Object.fromEntries(base.map((b) => [b.id, b.line])), base);
    expect(r.request?.skip).toEqual([{ shotId: 's2', from: 4, to: 5 }]);
  });
});

describe('segmentTimes: margens de corte não invadem a palavra vizinha (A3)', () => {
  const tw = (list: Array<[string, number, number]>) => list.map(([text, start, end]) => ({ text, start, end }));
  const EPS = 1e-9;

  it('com pausa larga: respira até 0,3 s depois e até 0,2 s antes', () => {
    // a b [c d] e f : mantém 0-1 e 4-5, tira 2-3; pausas de 1 s
    const ws = tw([['a', 0, 1], ['b', 2, 3], ['c', 4, 5], ['d', 6, 7], ['e', 8, 9], ['f', 10, 11]]);
    const [s1, s2] = segmentTimes(ws, [[0, 1], [4, 5]], 11.5);
    expect(s1![0]).toBe(0);
    expect(s1![1]).toBeCloseTo(3.3, 6); // fim de b + 0,3
    expect(s2![0]).toBeCloseTo(7.8, 6); // começo de e − 0,2 (≥ fim de d + 0,01)
    expect(s2![1]).toBe(11.5);
  });

  it('pausa curta (50 ms): fim ≤ início da próxima − 0,01 e começo ≥ fim da anterior + 0,01', () => {
    const ws = tw([['a', 0, 1], ['b', 1.05, 2], ['c', 2.05, 3], ['d', 3.05, 4]]);
    const [s1, s2] = segmentTimes(ws, [[0, 0], [3, 3]], 4.5);
    expect(s1![1]).toBeLessThanOrEqual(1.05 - 0.01 + EPS);
    expect(s1![1]).toBeGreaterThanOrEqual(1);
    expect(s2![0]).toBeGreaterThanOrEqual(3 + 0.01 - EPS);
    expect(s2![0]).toBeLessThanOrEqual(3.05);
  });

  it('alinhamento CONTÍGUO (intervalo 0): corta no ponto médio, nunca entra na palavra tirada', () => {
    const ws = tw([['a', 0, 1], ['b', 1, 2], ['c', 2, 3], ['d', 3, 4]]);
    // tira b e c (1..2): trechos [0,0] e [3,3]
    const [s1, s2] = segmentTimes(ws, [[0, 0], [3, 3]], 4);
    expect(s1![1]).toBe(1);
    expect(s2![0]).toBe(3);
    // regressão: a conta antiga (fim + 0,06) entrava 60 ms em "b"
    expect(s1![1]).toBeLessThan(1 + 0.06);
  });

  it('intervalo menor que 20 ms: ponto médio do intervalo', () => {
    const ws = tw([['a', 0, 1], ['b', 1.01, 2], ['c', 2.01, 3], ['d', 3.01, 4]]);
    const [s1, s2] = segmentTimes(ws, [[0, 0], [3, 3]], 4);
    expect(s1![1]).toBeCloseTo(1.005, 9);
    expect(s2![0]).toBeCloseTo(3.005, 9);
  });

  it('começo de trecho depois de palavra contígua não corta a 1ª palavra que fica', () => {
    // tira o começo ("a") e mantém "b c": o alinhamento é contíguo e 0,12 s antes seria dentro de "a"
    const ws = tw([['a', 0, 1], ['b', 1, 2], ['c', 2, 3]]);
    const [s] = segmentTimes(ws, [[1, 2]], 3.2);
    expect(s![0]).toBeLessThanOrEqual(1); // ≤ início de "b"
    expect(s![0]).toBeGreaterThanOrEqual(1 - 0.0001);
    expect(s![1]).toBe(3.2);
  });

  it('as palavras que ficam nunca são cortadas, mesmo com alinhamento sobreposto', () => {
    const ws = tw([['a', 0, 1.02], ['b', 1, 2], ['c', 2, 3]]);
    const [s1, s2] = segmentTimes(ws, [[0, 0], [2, 2]], 3);
    expect(s1![1]).toBeGreaterThanOrEqual(1.02);
    expect(s2![0]).toBeLessThanOrEqual(2);
  });

  it('plano inteiro: começa em 0 e termina na duração', () => {
    const ws = tw([['a', 0.1, 1], ['b', 1.2, 2]]);
    expect(segmentTimes(ws, [[0, 1]], 2.4)).toEqual([[0, 2.4]]);
  });

  it('propriedade: nenhum trecho invade palavra tirada (alinhamentos aleatórios)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      let t = 0;
      const ws = Array.from({ length: 8 }, (_, i) => {
        const start = t + (rnd() < 0.4 ? 0 : rnd() * 0.15);
        const end = start + 0.1 + rnd() * 0.5;
        t = end;
        return { text: `w${i}`, start, end };
      });
      const kept = [[0, 2], [5, 7]] as const;
      const segs = segmentTimes(ws, kept, t + 0.2);
      // fim do 1º trecho não passa do início da 1ª palavra tirada (3); começo do 2º não antes do fim da última tirada (4)
      expect(segs[0]![1]).toBeLessThanOrEqual(Math.max(ws[3]!.start, ws[2]!.end) + EPS);
      expect(segs[1]![0]).toBeGreaterThanOrEqual(Math.min(ws[4]!.end, ws[5]!.start) - EPS);
      expect(segs[0]![1]).toBeGreaterThanOrEqual(ws[2]!.end - EPS);
      expect(segs[1]![0]).toBeLessThanOrEqual(ws[5]!.start + EPS);
    }
  });
});

describe('skip conferido pelo texto (A4)', () => {
  const rec = (texts: string) => texts.split(' ').map((text, i) => ({ text, start: i, end: i + 0.5 }));
  const old = rec('Fuja de duas respostas: não tenho e perfeccionista. Escolha algo real e mostre.');
  const shotWords = new Map([['s2', old]]);

  it('skipTextOf normaliza e recusa intervalo fora', () => {
    expect(skipTextOf(old, 8, 11)).toBe('escolha algo real e');
    expect(skipTextOf(rec('Água, d\'água.'), 0, 1)).toBe('agua d agua');
    expect(skipTextOf(old, 5, 99)).toBeNull();
    expect(skipTextOf(old, 3.5, 4)).toBeNull();
  });

  it('o pedido guarda o texto e o estado acumula skipText alinhado a skip', () => {
    const text = skipTextOf(old, 5, 7)!;
    const st = mergeAdjust({ drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 5, to: 7, text }] });
    expect(st.cut.s2).toEqual({ first: 0, last: 0, skip: [[5, 7]], skipText: [text] });
    // segundo trecho sem texto: alinhado com ''
    const st2 = mergeAdjust(st, { skip: [{ shotId: 's2', from: 9, to: 9 }] });
    expect(st2.cut.s2!.skip).toEqual([[5, 7], [9, 9]]);
    expect(st2.cut.s2!.skipText).toEqual([text, '']);
    // mesmo trecho de novo não duplica nem apaga o texto
    expect(mergeAdjust(st2, { skip: [{ shotId: 's2', from: 5, to: 7 }] }).cut.s2!.skipText).toEqual([text, '']);
  });

  it('compatibilidade: estado antigo (sem skipText) e pedido sem texto continuam iguais', () => {
    const st = mergeAdjust({ drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 4, to: 5 }] });
    expect(st.cut.s2).toEqual({ first: 0, last: 0, skip: [[4, 5]] });
    const prev = { drop: [], cut: { s2: { first: 0, last: 0, skip: [[4, 5]] as Array<[number, number]> } } };
    const r = carryAdjust(prev, Object.fromEntries(base.map((b) => [b.id, b.line])), base);
    expect(r.request?.skip).toEqual([{ shotId: 's2', from: 4, to: 5 }]);
    // sem texto, nada a conferir: passa
    expect(verifySkips(r.request!, shotWords)).toEqual({ request: r.request, warnings: [] });
  });

  it('carryAdjust leva o texto; verifySkips aplica quando bate', () => {
    const text = skipTextOf(old, 8, 11)!;
    const prev = { drop: [], cut: { s2: { first: 0, last: 0, skip: [[8, 11]] as Array<[number, number]>, skipText: [text] } } };
    const r = carryAdjust(prev, Object.fromEntries(base.map((b) => [b.id, b.line])), base);
    expect(r.request?.skip).toEqual([{ shotId: 's2', from: 8, to: 11, text }]);
    const v = verifySkips(r.request!, shotWords);
    expect(v.warnings).toEqual([]);
    expect(v.request.skip).toHaveLength(1);
  });

  it('NÃO aplica e avisa quando a tokenização da gravação nova deslocou os índices', () => {
    const text = skipTextOf(old, 8, 11)!;
    // gravação nova: "perfeccionista." virou duas palavras ("perfeccionista" "."), índices deslocados
    const shifted = rec('Fuja de duas respostas: não tenho e muito perfeccionista. Escolha algo real e mostre.');
    const req = { skip: [{ shotId: 's2', from: 8, to: 11, text }, { shotId: 's2', from: 0, to: 1 }], teaser: 'x' };
    const v = verifySkips(req, new Map([['s2', shifted]]));
    expect(v.request.skip).toEqual([{ shotId: 's2', from: 0, to: 1 }]);
    expect(v.request.teaser).toBe('x');
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/não batem/);
    // plano sem palavras: também não aplica
    expect(verifySkips({ skip: [{ shotId: 's9', from: 0, to: 1, text: 'a b' }] }, shotWords).request.skip).toBeUndefined();
  });

  it('fillSkipText guarda o texto de skip antigo sem sobrescrever o que já existe', () => {
    const st = { drop: [], cut: { s2: { first: 0, last: 0, skip: [[8, 9], [10, 11]] as Array<[number, number]>, skipText: ['', 'manual'] } } };
    const filled = fillSkipText(st, shotWords);
    expect(filled.cut.s2!.skipText).toEqual([skipTextOf(old, 8, 9), 'manual']);
    // nada a preencher: mesma referência
    expect(fillSkipText(filled, shotWords)).toBe(filled);
    // sem palavras do plano: inalterado
    expect(fillSkipText(st, new Map())).toBe(st);
  });

  it('soloShotWords só mapeia clipes de um plano', () => {
    const m = soloShotWords(units, words);
    expect([...m.keys()].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('validateAdjust recusa índices não inteiros', () => {
    expect(validateAdjust(base, units, words, { drop: [], cut: {} }, { skip: [{ shotId: 's2', from: 1.5, to: 3 }] })).toMatch(/fora do plano/);
    expect(validateAdjust(base, units, words, { drop: [], cut: {} }, { skip: [{ shotId: 's2', from: Number.NaN, to: 3 }] })).toMatch(/fora do plano/);
  });
});

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFrameSvg } from '../src/compose/screen-mock-draw';
import { matchStepCues, renderScreenMock, scheduleFromStarts, scheduleSteps, scheduleStepsWithCues, splitMockDurations, startsFromCues } from '../src/compose';

/** Fala real da V07 do C1 (docs/roteiros/c1-ia-na-pratica.md). */
const V07 =
  'E onde ela tropeça? Em fatos muito recentes, que ela pode não conhecer. Em contas mais longas. E principalmente em citações e fontes: nome de livro, autor, artigo, lei, data. É aí que mora o perigo. Vamos testar ao vivo. Eu peço: me indique três livros sobre gestão do tempo, com autor e ano de publicação. Olha a resposta: três títulos, autor, ano, até um resumo de cada. Tudo muito seguro, muito bem escrito. Agora eu confiro cada um numa busca comum. O primeiro existe. O segundo existe, mas o ano está errado. E o terceiro? Não existe. A IA inventou um livro, com autor e tudo.';

/** alinhamento sintético: 2,5 palavras por segundo */
const words = (text: string) => text.split(/\s+/).filter(Boolean).map((t, i) => ({ text: t, start: i / 2.5, end: (i + 0.9) / 2.5 }));
const W = words(V07);
const timeOf = (needle: string) => W.find((w) => w.text.toLowerCase().startsWith(needle))!.start;
const TOTAL = W[W.length - 1]!.end + 0.35;

const pedido = [
  { kind: 'highlight', text: 'Fatos recentes, contas longas, citações e fontes: aqui a IA tropeça' },
  { kind: 'type', text: 'me indique três livros sobre gestão do tempo, com autor e ano de publicação', weight: 3 },
  { kind: 'message', from: 'user', text: 'me indique três livros sobre gestão do tempo, com autor e ano de publicação' },
  { kind: 'message', from: 'ai', text: 'Claro! Separei três títulos sobre gestão do tempo. Já vou listar com autor e ano.', weight: 2 },
];
const resposta = [
  { kind: 'message', from: 'ai', text: 'Aqui estão três livros sobre gestão do tempo, com autor e ano de publicação.' },
  { kind: 'show', title: '1. Tempo de Sobra', lines: ['Helena Duarte, 2016', 'Como organizar a rotina'], weight: 2 },
  { kind: 'highlight', text: 'Tudo muito seguro e bem escrito, com autor, ano e resumo' },
];

describe('scheduleStepsWithCues (V07 do C1)', () => {
  it('o passo que digita o pedido dos livros não começa antes de "Eu peço"', () => {
    const starts = scheduleStepsWithCues(pedido, W, TOTAL);
    expect(starts).toHaveLength(4);
    expect(starts[1]!).toBeGreaterThanOrEqual(timeOf('peço:'));
    expect(starts[1]!).toBeCloseTo(timeOf('indique'), 6);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThanOrEqual(starts[i - 1]!);
  });

  it('passo sem correspondência é interpolado entre o anterior e o próximo achados (pesos)', () => {
    const starts = startsFromCues([2, undefined, undefined, 10], [1, 1, 3, 1], 20);
    expect(starts[0]).toBe(2);
    expect(starts[3]).toBe(10);
    // passos 0..2 com pesos 1,1,3 sobre [2,10]
    expect(starts[1]!).toBeCloseTo(3.6, 6);
    expect(starts[2]!).toBeCloseTo(5.2, 6);
  });

  it('o texto do usuário (já digitado) não casa de novo e fica depois da digitação', () => {
    const m = matchStepCues(pedido, W);
    expect(m.times[0]).toBeDefined();
    expect(m.times[1]).toBeCloseTo(timeOf('indique'), 6);
    expect(m.times[2]).toBeUndefined();
    const starts = scheduleStepsWithCues(pedido, W, TOTAL);
    expect(starts[2]!).toBeGreaterThan(starts[1]!);
  });

  it('antes do primeiro passo achado a tela fica no estado inicial', () => {
    const starts = startsFromCues([undefined, 8, undefined], [1, 1, 1], 20);
    expect(starts[0]!).toBeGreaterThan(7);
    expect(starts[0]!).toBeLessThanOrEqual(8);
    expect(scheduleFromStarts(starts, [1, 1, 1], 20).leadSec).toBeGreaterThan(7);
  });

  it('`cue` explícito vence a busca automática', () => {
    const [t] = scheduleStepsWithCues([{ kind: 'type', text: 'me indique três livros sobre gestão do tempo', cue: 'Olha a resposta' }], W, TOTAL);
    expect(t!).toBeCloseTo(timeOf('olha'), 6);
    const auto = scheduleStepsWithCues([{ kind: 'type', text: 'me indique três livros sobre gestão do tempo' }], W, TOTAL);
    expect(auto[0]!).toBeCloseTo(timeOf('indique'), 6);
  });

  it('nunca volta no tempo mesmo com `cue` que aparece antes', () => {
    const steps = [
      { kind: 'tap', label: 'Existe', cue: 'O terceiro' },
      { kind: 'tap', label: 'Outro', cue: 'Vamos testar ao vivo' },
    ];
    const starts = scheduleStepsWithCues(steps, W, TOTAL);
    expect(starts[1]!).toBeGreaterThanOrEqual(starts[0]!);
  });

  it('sem alinhamento = proporcional como hoje', () => {
    const steps = [
      { kind: 'type', text: 'a' },
      { kind: 'tap', label: 'b', weight: 2 },
      { kind: 'tap', label: 'c' },
    ];
    const prop = scheduleSteps([undefined, 2, undefined], 12).windows.map((w) => w.start);
    expect(scheduleStepsWithCues(steps, undefined, 12)).toEqual(prop);
    expect(scheduleStepsWithCues(steps, [], 12)).toEqual(prop);
    expect(scheduleStepsWithCues(steps, W, 12)).toEqual(prop); // nenhum achado
  });

  it('várias gravações: cada tela começa no seu primeiro passo achado na fala', () => {
    const a = matchStepCues(pedido, W);
    const b = matchStepCues(resposta, W, a.nextIndex);
    const cueA = a.times.find((t) => t !== undefined);
    const cueB = b.times.find((t) => t !== undefined);
    expect(cueB!).toBeGreaterThan(a.times[1]!);
    const d = splitMockDurations([{ mockWeight: 8, cueSec: cueA }, { mockWeight: 5, cueSec: cueB }], TOTAL);
    expect(d[0]!).toBeCloseTo(cueB!, 6);
    expect(d[0]! + d[1]!).toBeCloseTo(TOTAL, 6);
    // sem cueSec em alguma: proporcional ao peso, como antes
    const p = splitMockDurations([{ mockWeight: 8, cueSec: cueA }, { mockWeight: 5 }], 26);
    expect(p[0]!).toBeCloseTo(16, 6);
    expect(p[1]!).toBeCloseTo(10, 6);
  });

  it('com gravação enviada no meio, o tempo dela é descontado', () => {
    expect(splitMockDurations([{ mockWeight: 1, cueSec: 3 }, { uploadSec: 4 }, { mockWeight: 1, cueSec: 20 }], 30)).toEqual([16, 4, 10]);
  });
});

describe('renderScreenMock com stepStarts', () => {
  it('a tela fica vazia até o primeiro passo e renderiza com os inícios dados', async () => {
    const mock = { model: 'chat' as const, app: 'Assistente de IA', steps: [{ kind: 'type' as const, text: 'me indique três livros sobre gestão do tempo' }, { kind: 'message' as const, from: 'ai' as const, text: 'Claro, aqui vão três livros.' }] };
    const sch = scheduleFromStarts([4, 6], [undefined, undefined], 8);
    const before = buildFrameSvg(mock, sch, 3.9);
    expect(before).not.toContain('gest');
    expect(buildFrameSvg(mock, sch, 5.5)).toContain('gest');
    const dir = mkdtempSync(path.join(tmpdir(), 'cues-'));
    try {
      const out = path.join(dir, 'a.mp4');
      const r = await renderScreenMock(mock, { outPath: out, durationSec: 8, stepStarts: [4, 6] });
      expect(r.durationSec).toBeCloseTo(8, 1);
      expect(statSync(out).size).toBeGreaterThan(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { captionBetween, layoutStoryboard, matchStepCues, parseWebVtt, planSceneScreens, renderScreenMock, scheduleFromStarts, scheduleSteps, splitMockDurations, storyboardTiles, toWebVtt, wordsFromCues, type MockInput } from '../src/compose';
import { buildFrameSvg, duplicateUserMessages, evalCell, sameMessageText, sideSchedule } from '../src/compose/screen-mock-draw';
import { SCREEN_MOCK_SAMPLES } from './fixtures/screen-mock-samples';

const words = (text: string, perSec = 2.5) => text.split(/\s+/).filter(Boolean).map((t, i) => ({ text: t, start: i / perSec, end: (i + 0.9) / perSec }));

describe('comparação: duas telas lado a lado', () => {
  const { durationSec: _d, ...mock } = SCREEN_MOCK_SAMPLES.compare;
  void _d;
  const dir = mkdtempSync(path.join(tmpdir(), 'screen-compare-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('cada lado segue a linha do tempo única: o passo vai até o próximo passo do MESMO lado', () => {
    const sch = scheduleFromStarts([1, 2, 5, 8, 10, 11], mock.steps.map((s) => s.weight), 14);
    const left = sideSchedule(mock.steps, sch, 'left');
    const right = sideSchedule(mock.steps, sch, 'right');
    expect(left.indexes).toEqual([0, 1, 4]);
    expect(right.indexes).toEqual([2, 3, 5]);
    expect(left.sch.windows.map((w) => [w.start, w.end])).toEqual([[1, 2], [2, 10], [10, sch.windows[5]!.end]]);
    expect(right.sch.windows.map((w) => w.start)).toEqual([5, 8, 11]);
  });

  it('o quadro tem os dois rótulos, as duas telas e nenhum id repetido', () => {
    const sch = scheduleSteps(mock.steps.map((s) => s.weight), 14);
    const svg = buildFrameSvg(mock, sch, 13.5);
    expect(svg).toContain('Pedido vago');
    expect(svg).toContain('Pedido com contexto');
    expect(svg.match(/scale\(0\.9\)/g)).toHaveLength(2);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    // antes do primeiro passo da direita, só a esquerda tem conteúdo; os dois aparelhos já estão na tela
    const early = buildFrameSvg(mock, scheduleFromStarts([1, 2, 5, 8, 10, 11], [], 14), 3);
    expect(early).toContain('me explica');
    expect(early).not.toContain('Aja como');
  });

  it('sem rótulos as telas ficam em escala cheia; no computador a janela é a metade', () => {
    const plain: MockInput = { ...mock, sides: { left: { model: 'chat' }, right: { model: 'notes', app: 'Bloco de notas' } } };
    const svg = buildFrameSvg(plain, scheduleSteps(plain.steps.map((s) => s.weight), 14), 13);
    expect(svg).toContain('scale(1)');
    expect(svg).toContain('Bloco de notas');
    const desk = buildFrameSvg({ ...mock, device: 'desktop' }, scheduleSteps(mock.steps.map((s) => s.weight), 14), 13);
    expect(desk).toContain('width="904"');
  });

  it('renderiza em 1920x1080 (celular e computador)', async () => {
    for (const device of ['phone', 'desktop'] as const) {
      const r = await renderScreenMock({ ...mock, device }, { outPath: path.join(dir, `${device}.mp4`), durationSec: 3, workDir: path.join(dir, `w-${device}`) });
      expect(r).toEqual({ durationSec: 3, width: 1920, height: 1080 });
    }
  }, 120_000);
});

describe('balão do usuário quase igual ao digitado não vira segundo balão', () => {
  it('mesma mensagem: igual, um contém o outro, ou ≥ 80% das palavras em comum', () => {
    expect(sameMessageText('me explica marketing', 'Me explica marketing.')).toBe(true);
    expect(sameMessageText('me explica marketing', 'me explica marketing, por favor')).toBe(true);
    expect(sameMessageText('crie dez flashcards sobre juros compostos em tabela', 'crie dez flashcards sobre juros compostos, numa tabela')).toBe(true);
    expect(sameMessageText('me explica marketing', 'o que é marketing')).toBe(false);
    expect(sameMessageText('ok', 'ok, pode mandar o resumo')).toBe(false);
    expect(sameMessageText('', 'x')).toBe(false);
  });

  it('duplicateUserMessages usa a regra e cada `digita` casa com um `usuário` só', () => {
    const steps = [
      { kind: 'type', text: 'me explica marketing' },
      { kind: 'message', from: 'user', text: 'me explica marketing, por favor' },
      { kind: 'message', from: 'user', text: 'me explica marketing' },
      { kind: 'type', text: 'o que é marketing' },
      { kind: 'message', from: 'user', text: 'e o que são os quatro Ps?' },
    ] as MockInput['steps'];
    expect([...duplicateUserMessages(steps)]).toEqual([1]);
    // o idêntico tem preferência sobre o parecido
    const two = [
      { kind: 'type', text: 'me explica marketing agora' },
      { kind: 'type', text: 'me explica marketing' },
      { kind: 'message', from: 'user', text: 'me explica marketing' },
      { kind: 'message', from: 'user', text: 'me explica marketing agora' },
    ] as MockInput['steps'];
    expect([...duplicateUserMessages(two)]).toEqual([2, 3]);
  });
});

describe('digitação no ritmo da fala', () => {
  const fala = 'Agora o pedido: organize estas anotações de reunião em três partes: decisões tomadas, quem faz o quê, e prazos. Use tópicos curtos. Pronto: virou uma lista.';
  const W = words(fala);
  const steps = [
    { kind: 'type', text: 'organize estas anotações de reunião em três partes: decisões tomadas, quem faz o quê, e prazos. Use tópicos curtos.' },
    { kind: 'show', title: 'Resumo da reunião', lines: ['Decisões'], cue: 'Pronto' },
  ];

  it('acha onde a fala termina de ditar o texto digitado', () => {
    const m = matchStepCues(steps, W);
    const first = W.findIndex((w) => w.text === 'organize');
    const last = W.findIndex((w) => w.text === 'curtos.');
    expect(m.times[0]).toBeCloseTo(W[first]!.start, 5);
    expect(m.typeEnds[0]).toBeCloseTo(W[last]!.end, 5);
    expect(m.typeEnds[1]).toBeUndefined();
    // texto que a fala NÃO dita (só o `cue` casa): sem fim de digitação
    expect(matchStepCues([{ kind: 'type', text: 'Tempo de Sobra Helena Duarte', cue: 'Agora o pedido' }], W).typeEnds[0]).toBeUndefined();
  });

  it('planSceneScreens devolve a duração da digitação e a agenda a carrega', () => {
    const total = W[W.length - 1]!.end + 0.4;
    const plan = planSceneScreens([{ steps }], W, total, splitMockDurations);
    expect(plan.durations).toEqual([total]);
    const sec = plan.typeSecs[0]![0]!;
    expect(sec).toBeGreaterThan(5);
    expect(plan.typeSecs[0]![1]).toBeUndefined();
    const sch = scheduleFromStarts(plan.stepStarts[0]!, [], total, plan.typeSecs[0]);
    expect(sch.windows[0]!.typeSec).toBeCloseTo(sec, 5);
    // no meio da fala o campo mostra só parte do texto; no fim, o balão já foi enviado
    const mock: MockInput = { model: 'chat', app: 'Assistente de IA', steps: steps as MockInput['steps'] };
    const mid = buildFrameSvg(mock, sch, plan.stepStarts[0]![0]! + sec / 2);
    expect(mid).toContain('organize');
    expect(mid).not.toContain('curtos');
  });

  it('sem fala achada segue proporcional (sem typeSecs)', () => {
    const plan = planSceneScreens([{ steps: [{ kind: 'type', text: 'xyz abc' }] }, { uploadSec: 4 }], words('nada a ver com isso aqui'), 10, splitMockDurations);
    expect(plan.stepStarts).toEqual([undefined, undefined]);
    expect(plan.durations[1]).toBe(4);
  });
});

describe('planilha: SE simples', () => {
  it('calcula =SE(B2>5000; "bateu"; "não bateu")', () => {
    const cells = new Map([['B2', '6000'], ['B3', '5000']]);
    expect(evalCell('=SE(B2>5000; "bateu"; "não bateu")', cells)).toBe('bateu');
    expect(evalCell('=SE(B3>5000; "bateu"; "não bateu")', cells)).toBe('não bateu');
    expect(evalCell('=SE(B9>5000; "bateu"; "não bateu")', cells)).toBe('=SE(B9>5000; "bateu"; "não bateu")');
  });
});

describe('legenda → palavras e storyboard', () => {
  it('parseWebVtt lê o que toWebVtt escreve e wordsFromCues reparte o tempo pelas palavras', () => {
    const vtt = toWebVtt([{ start: 0, end: 2, text: 'Olha a resposta' }, { start: 2.5, end: 4.5, text: 'três títulos, autor e ano' }]);
    const cues = parseWebVtt(vtt);
    expect(cues).toEqual([{ start: 0, end: 2, text: 'Olha a resposta' }, { start: 2.5, end: 4.5, text: 'três títulos, autor e ano' }]);
    const ws = wordsFromCues(cues);
    expect(ws.map((w) => w.text)).toEqual(['Olha', 'a', 'resposta', 'três', 'títulos,', 'autor', 'e', 'ano']);
    expect(ws[0]!.start).toBe(0);
    expect(ws[2]!.end).toBeCloseTo(2, 5);
    expect(ws[3]!.start).toBeCloseTo(2.5, 5);
    for (let i = 1; i < ws.length; i++) expect(ws[i]!.start).toBeGreaterThanOrEqual(ws[i - 1]!.start);
    expect(parseWebVtt('WEBVTT\n\nNOTE x\n\n00:01.000 --> 00:02.500 align:start\n<v Ana>oi</v>\n')).toEqual([{ start: 1, end: 2.5, text: 'oi' }]);
  });

  it('um quadro por intervalo, com a fala do intervalo e o tipo do trecho', () => {
    const ws = [{ text: 'um', start: 0.2, end: 0.5 }, { text: 'dois', start: 1.1, end: 1.5 }, { text: 'três', start: 2.6, end: 3 }];
    expect(captionBetween(ws, 1, 3)).toBe('dois três');
    const tiles = storyboardTiles([{ file: 'a.mp4', fileStartSec: 0, sceneStartSec: 0, durationSec: 2, kind: 'phone' }, { file: 'a.mp4', fileStartSec: 2, sceneStartSec: 2, durationSec: 2.1, kind: 'pair' }], ws, 1);
    expect(tiles.map((t) => [t.fromSec, t.kind, t.first, t.caption])).toEqual([[0, 'phone', true, 'um'], [1, 'phone', false, 'dois'], [2, 'pair', true, 'três'], [3, 'pair', false, '']]);
    expect(tiles[0]!.atSec).toBe(0.5);
    // linhas por tipo (6 celulares, 3 pares) e páginas de 2 linhas de celular
    const many = [...Array.from({ length: 14 }, () => ({ kind: 'phone' as const })), ...Array.from({ length: 4 }, () => ({ kind: 'pair' as const }))];
    const pages = layoutStoryboard(many, 2);
    expect(pages.map((p) => p.map((r) => `${r.kind}:${r.tiles.length}`))).toEqual([['phone:6', 'phone:6'], ['phone:2', 'pair:3'], ['pair:1']]);
  });
});

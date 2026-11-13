import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScreenMocksMarkdown } from '@lms/course-schema';
import { readFileSync } from 'node:fs';
import { buildQaIndexHtml, parseQaArgs, sceneSources, stepLine } from '../src/scripts/qa-telas';
import { parseArgs, planPreview } from '../src/scripts/gerar-telas-previa';

const ROOT = path.resolve(__dirname, '../../..');

describe('qa-telas: funções puras', () => {
  it('flags', () => {
    expect(parseQaArgs(['--course', 'crs_1', '--out', 'x'])).toEqual({ course: 'crs_1', cenas: [], out: 'x', stepSec: 1, rows: 2, copyVideo: true });
    expect(parseQaArgs(['--course', 'c', '--cenas', 'v07, v12', '--out', 'x', '--passo', '0,5', '--linhas', '3', '--storage', '/s', '--sem-video'])).toEqual({ course: 'c', cenas: ['v07', 'v12'], out: 'x', stepSec: 0.5, rows: 3, storage: '/s', copyVideo: false });
    expect(() => parseQaArgs(['--out', 'x'])).toThrow();
    expect(() => parseQaArgs(['--course', 'c', '--out', 'x', '--passo', '0'])).toThrow();
    expect(() => parseQaArgs(['--course', 'c', '--out', 'x', '--nada'])).toThrow();
  });

  it('trechos do vídeo final pelas durações de cada gravação (a última vai até o fim)', () => {
    const s = sceneSources('/v.mp4', 40, [{ fileName: 'a.mp4', durationSec: 26, kind: 'phone' }, { fileName: 'b.mp4', durationSec: 5, kind: 'pair' }, { fileName: 'c.mp4', durationSec: 8.6, kind: 'wide' }]);
    expect(s.map((x) => [x.sceneStartSec, x.durationSec, x.kind, x.label])).toEqual([[0, 26, 'phone', 'a'], [26, 5, 'pair', 'b'], [31, 9, 'wide', 'c']]);
    expect(s.every((x) => x.fileStartSec === x.sceneStartSec && x.file === '/v.mp4')).toBe(true);
    // sem duração gravada: reparte por igual
    expect(sceneSources('/v.mp4', 10, [{ fileName: 'a.mp4', kind: 'phone' }, { fileName: 'b.mp4', kind: 'phone' }]).map((x) => x.durationSec)).toEqual([5, 5]);
  });

  it('passo na sintaxe do arquivo de telas e index com fala, passos e storyboard', () => {
    expect(stepLine({ kind: 'type', text: 'oi', side: 'right', cue: 'eu escrevo', weight: 2 })).toBe('[dir] digita: oi (peso 2) (na fala: "eu escrevo")');
    expect(stepLine({ kind: 'show', title: 'T', lines: ['a', 'b'] })).toBe('mostra: T | a | b');
    expect(stepLine({ kind: 'toggle', label: 'Wi-Fi', on: false })).toBe('desliga: Wi-Fi');
    const html = buildQaIndexHtml('QA', [{ scene: 'v07', title: 'Onde <tropeça>', lesson: 'Aula 2', spoken: 'E onde ela tropeça?', durationSec: 39.9, recordings: [{ fileName: 'g.mp4', model: 'chat/phone', startSec: 0, steps: ['digita: oi'] }], pages: ['v07-01.png'], video: 'videos/v07.mp4' }]);
    expect(html).toContain('Onde &lt;tropeça&gt;');
    expect(html).toContain('<img loading="lazy" src="v07-01.png"');
    expect(html).toContain('src="videos/v07.mp4"');
    expect(html).toContain('<li>digita: oi</li>');
  });
});

describe('prévia com o tempo real da fala', () => {
  it('flags novas e a restrição de um roteiro só', () => {
    expect(parseArgs(['--file', 'a.md', '--course', 'crs_1', '--cenas', 'v12,v16', '--out', 'x', '--passo', '2'])).toMatchObject({ course: 'crs_1', cenas: ['v12', 'v16'], stepSec: 2 });
    expect(() => parseArgs(['--todos', '--course', 'crs_1', '--out', 'x'])).toThrow();
  });

  it('com as palavras da legenda, a duração das telas e o início dos passos vêm da fala (V16 do C1: comparação)', () => {
    const roteiro = path.join(ROOT, 'docs/roteiros/c1-ia-na-pratica.md');
    const fala = 'Agora eu refaço o pedido com os quatro P juntos. Aja como um professor de marketing para iniciantes. Sou caloura de Administração e trabalho numa loja de roupa. Explique os quatro Ps do marketing com exemplos da minha loja. Responda em até dez linhas, com um exemplo por item. Olha as duas respostas lado a lado. À esquerda, o texto genérico. À direita, cada P do marketing vem com um exemplo de loja, como a coleção nova, a promoção e a vitrine. Curto, claro, e eu entendo na hora.';
    const words = fala.split(/\s+/).map((t, i) => ({ text: t, start: i / 3, end: (i + 0.9) / 3 }));
    const at = (w: string) => words.find((x) => x.text.startsWith(w))!.start;
    const narrationSec = words[words.length - 1]!.end + 0.4;
    const plan = planPreview(roteiro, new Map([['v16', { words, narrationSec }]]), ['V16']);
    expect(plan.issues).toEqual([]);
    expect(plan.jobs).toHaveLength(1);
    const j = plan.jobs[0]!;
    expect(j.mock.model).toBe('compare');
    expect(j.entry.durationSec).toBeCloseTo(narrationSec, 5);
    const tl = j.entry.timeline!;
    const start = (prefix: string) => tl.find((t) => t.step.startsWith(prefix))!;
    expect(start('[dir] digita').atSec).toBeCloseTo(at('Aja'), 1);
    expect(start('[dir] digita').typeSec).toBeGreaterThan(8);
    expect(start('[dir] mostra').atSec).toBeCloseTo(at('Olha'), 1);
    expect(start('[esq] destaca').atSec).toBeCloseTo(at('À'), 1);
    expect(start('[dir] destaca: À direita').atSec).toBeGreaterThan(start('[esq] destaca').atSec);
  });

  it('a spec do C1 não tem `usuário:` repetindo o `digita:` e todas as seções passam', () => {
    const parsed = parseScreenMocksMarkdown(readFileSync(path.join(ROOT, 'docs/roteiros/telas/c1-ia-na-pratica.telas.md'), 'utf8'));
    expect(parsed.issues).toEqual([]);
    expect(parsed.mocks.size).toBe(30);
    for (const [key, m] of parsed.mocks) {
      const typed = m.steps.filter((s) => s.kind === 'type').map((s) => (s as { text: string }).text);
      const dup = m.steps.filter((s) => s.kind === 'message' && s.from === 'user' && typed.includes(s.text));
      expect(dup, key).toEqual([]);
    }
  });
});

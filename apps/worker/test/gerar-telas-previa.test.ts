import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffprobe } from '@lms/media/compose';
import { buildIndexHtml, estimateMockDurations, generatePreview, parseArgs, planPreview, siblingScreensPath } from '../src/scripts/gerar-telas-previa';

const tmp = mkdtempSync(path.join(tmpdir(), 'lms-previa-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const FALA = 'Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem é a lista e o que ela precisa. Agora olhe a tela.';
const ROTEIRO = `# Curso previa

Ideia: Testar prévia.
Público: alunos.
Objetivo final: Ao final, a pessoa assiste.
Duração-alvo: 1 aula de 3 a 5 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Tela

Objetivo: Ao final, você vê a tela.

### V01 — Passo
Vídeo próprio: gravacao_a.mp4

**Fala para gravação**

"${FALA}"

Texto na tela: Passo a passo

### FIM — O que você levou

- Primeiro tópico curto
- Segundo tópico curto
`;
const TELAS = `# Telas

## gravacao_a
Modelo: chat
App: Assistente
- digita: oi
- ia: Olá, tudo bem?
`;

describe('prévia local das telas', () => {
  it('flags e localização do arquivo de telas', () => {
    expect(parseArgs(['--todos', '--out', 'x'])).toEqual({ files: [], todos: true, out: 'x', parallel: 4 });
    expect(parseArgs(['--file', 'a.md', '--file', 'b.md', '--out', 'x', '--paralelo', '2'])).toMatchObject({ files: ['a.md', 'b.md'], parallel: 2 });
    expect(() => parseArgs(['--todos'])).toThrow();
    expect(() => parseArgs(['--out', 'x'])).toThrow();
    expect(siblingScreensPath('/r/docs/roteiros/c1-x.md')).toBe('/r/docs/roteiros/telas/c1-x.telas.md');
  });

  it('estimativa: palavras ÷ 2,5 por segundo, dividida pelo peso dos passos', () => {
    const fala = Array(50).fill('palavra').join(' '); // 20 s
    expect(estimateMockDurations(fala, [{ steps: [{}] }])).toEqual([20]);
    expect(estimateMockDurations(fala, [{ steps: [{ weight: 1 }] }, { steps: [{ weight: 3 }] }])).toEqual([5, 15]);
  });

  it('index.html com cena, arquivo, modelo, fala e <video controls> relativo; escapa HTML', () => {
    const html = buildIndexHtml([{ course: 'c', scene: 'v01', sceneTitle: 'T', file: 'a b.mp4', model: 'chat', spoken: 'x <b>', durationSec: 3, video: 'c/v01-a b.mp4', poster: 'c/v01-a b.png' }]);
    expect(html).toContain('<video controls');
    expect(html).toContain('src="c/v01-a%20b.mp4"');
    expect(html).toContain('x &lt;b&gt;');
  });

  it('gera 1 tela pequena de verdade: mp4 + png + index.html', async () => {
    const dir = path.join(tmp, 'roteiros');
    mkdirSync(path.join(dir, 'telas'), { recursive: true });
    const roteiro = path.join(dir, 'cx-teste.md');
    writeFileSync(roteiro, ROTEIRO);
    writeFileSync(path.join(dir, 'telas', 'cx-teste.telas.md'), TELAS);
    const plan = planPreview(roteiro);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.entry.durationSec).toBeGreaterThan(2);
    const out = path.join(tmp, 'saida');
    const r = await generatePreview({ files: [roteiro], todos: false, out, parallel: 2 }, tmp, () => {});
    expect(r.failed).toBe(0);
    const e = r.entries[0]!;
    expect(existsSync(path.join(out, e.video))).toBe(true);
    expect(existsSync(path.join(out, e.poster))).toBe(true);
    const p = await ffprobe(path.join(out, e.video));
    expect(p).toMatchObject({ width: 1920, height: 1080 });
    expect(Math.abs(p.durationSeconds - e.durationSec)).toBeLessThan(0.2);
    const html = readFileSync(r.indexPath, 'utf8');
    expect(html).toContain('gravacao_a.mp4');
    expect(html).toContain('chat');
    expect(html).toContain('Vou mostrar na tela');
  }, 120_000);
});

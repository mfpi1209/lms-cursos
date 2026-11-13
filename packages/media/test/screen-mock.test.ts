import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffprobeJson, renderScreenMock, scheduleSteps, SCREEN_MOCK_LEAD_SEC } from '../src/compose';
import { buildFrameSvg, evalCell, parseDay, parseTime } from '../src/compose/screen-mock-draw';
import { textWidth, wrapText } from '../src/compose/screen-mock-text';
import { SCREEN_MOCK_SAMPLES } from './fixtures/screen-mock-samples';

describe('scheduleSteps: agendamento dos passos', () => {
  it('distribui o tempo proporcional ao peso, com folga inicial e final segurado', () => {
    const sch = scheduleSteps([1, 2, undefined, 1], 10);
    expect(sch.leadSec).toBeCloseTo(SCREEN_MOCK_LEAD_SEC, 6);
    expect(sch.holdSec).toBeGreaterThanOrEqual(0.5);
    const w = sch.windows;
    expect(w[0]!.start).toBeCloseTo(0.4, 6);
    // contíguos
    for (let i = 1; i < w.length; i++) expect(w[i]!.start).toBeCloseTo(w[i - 1]!.end, 6);
    // último passo termina antes do fim: o estado final é segurado
    expect(w[3]!.end).toBeCloseTo(10 - sch.holdSec, 6);
    expect(10 - w[3]!.end).toBeGreaterThan(0.4);
    // proporção 1 : 2 : 1 : 1 (peso ausente = 1)
    const d = w.map((x) => x.end - x.start);
    expect(d[1]! / d[0]!).toBeCloseTo(2, 6);
    expect(d[2]! / d[0]!).toBeCloseTo(1, 6);
    expect(d[3]! / d[0]!).toBeCloseTo(1, 6);
  });

  it('em vídeos curtos reduz as folgas e nunca estoura a duração', () => {
    const sch = scheduleSteps([1, 1], 3);
    expect(sch.windows[1]!.end).toBeLessThan(3);
    expect(sch.windows[0]!.start).toBeGreaterThan(0);
    expect(() => scheduleSteps([1], 0)).toThrow();
  });

  it('peso inválido (zero, negativo, NaN) vale 1', () => {
    const sch = scheduleSteps([0, -3, Number.NaN], 9);
    const d = sch.windows.map((x) => x.end - x.start);
    expect(d[0]).toBeCloseTo(d[1]!, 6);
    expect(d[1]).toBeCloseTo(d[2]!, 6);
  });
});

describe('texto: quebra por largura sem estourar', () => {
  const LONG = 'Internacionalização e responsabilidade socioambiental corporativa, planejamento estratégico de comunicação integrada para pequenas e médias empresas do interior, com acentuação: ação, coração, órgão, você, também.';
  it.each([260, 360, 700])('nenhuma linha passa de %d px', (w) => {
    const lines = wrapText(LONG, w, 34);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(l.width).toBeLessThanOrEqual(w);
      expect(textWidth(l.text, 34)).toBeLessThanOrEqual(w);
    }
    // nada se perde (palavras maiores que a linha podem ser cortadas por caractere)
    expect(lines.map((l) => l.text).join('').replace(/\s+/g, '')).toBe(LONG.replace(/\s+/g, ''));
  });

  it('palavra gigante (URL) é cortada por caractere e respeita \\n', () => {
    const url = 'https://exemplo.com.br/' + 'a'.repeat(120);
    const lines = wrapText(`${url}\nfim`, 300, 34);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(300);
    expect(lines[lines.length - 1]!.text).toBe('fim');
  });

  it('o balão longo de chat mantém todo o texto dentro da tela do celular', () => {
    const svg = buildFrameSvg(
      { model: 'chat', device: 'phone', app: 'IA', steps: [{ kind: 'message', from: 'user', text: LONG + ' ' + LONG }] },
      scheduleSteps([1], 5),
      4,
    );
    const xs = [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="start"[^>]*>/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(5);
    expect(Math.max(...xs)).toBeLessThan(1188);
  });
});

describe('interpretação de dados da agenda e da planilha', () => {
  it('dia e hora', () => {
    expect(parseDay('seg')).toBe(0);
    expect(parseDay('Terça-feira')).toBe(1);
    expect(parseDay('sábado')).toBe(5);
    expect(parseTime('19:00')).toEqual({ start: 19, end: 20 });
    expect(parseTime('19h30')).toEqual({ start: 19.5, end: 20.5 });
    expect(parseTime('9:00 - 10:30')).toEqual({ start: 9, end: 10.5 });
  });
  it('fórmula SOMA e valores em reais', () => {
    const cells = new Map([['B2', 'R$ 1.200,00'], ['B3', 'R$ 640,50'], ['B4', 'R$ 180,00']]);
    expect(evalCell('=SOMA(B2:B4)', cells)).toBe('R$ 2.020,50');
    expect(evalCell('texto', cells)).toBe('texto');
    expect(evalCell('=FUNCAO_DESCONHECIDA(1)', cells)).toBe('=FUNCAO_DESCONHECIDA(1)');
  });
});

describe('renderScreenMock: um MP4 por modelo', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'screen-mock-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const model of Object.keys(SCREEN_MOCK_SAMPLES) as Array<keyof typeof SCREEN_MOCK_SAMPLES>) {
    it(`${model}: 1920x1080, 30 fps, sem áudio, duração exata`, async () => {
      const { durationSec: _d, ...mock } = SCREEN_MOCK_SAMPLES[model];
      void _d;
      const out = path.join(dir, `${model}.mp4`);
      const r = await renderScreenMock(mock, { outPath: out, durationSec: 3, workDir: path.join(dir, `w-${model}`) });
      expect(r).toEqual({ durationSec: 3, width: 1920, height: 1080 });
      const probe = await ffprobeJson<{ streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }>; format: { duration: string } }>(out, ['-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames:format=duration']);
      expect(probe.streams.filter((s) => s.codec_type === 'audio')).toHaveLength(0);
      const v = probe.streams.find((s) => s.codec_type === 'video')!;
      expect(v.codec_name).toBe('h264');
      expect(v.width).toBe(1920);
      expect(v.height).toBe(1080);
      expect(v.r_frame_rate).toBe('30/1');
      expect(Math.abs(Number(probe.format.duration) - 3)).toBeLessThanOrEqual(0.05);
    }, 120_000);
  }

  it('versão desktop também sai em 1920x1080', async () => {
    const { durationSec: _d, ...mock } = SCREEN_MOCK_SAMPLES.chat;
    void _d;
    const out = path.join(dir, 'desktop.mp4');
    await renderScreenMock({ ...mock, device: 'desktop' }, { outPath: out, durationSec: 2, workDir: path.join(dir, 'w-desktop') });
    const probe = await ffprobeJson<{ streams: Array<{ width: number; height: number }> }>(out, ['-show_entries', 'stream=width,height']);
    expect([probe.streams[0]!.width, probe.streams[0]!.height]).toEqual([1920, 1080]);
  }, 120_000);
});

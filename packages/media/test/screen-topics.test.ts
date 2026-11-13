import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCREEN_TOPICS, buildComposeCommand, composeScene, ffprobe, layoutTopics, planTopicsSegments, renderScreenTopicsPlan, runFfmpeg, scheduleScreenTopics, topicEnterFrames, topicsFrame, visibleTopics,
  type ComposePlan, type ScreenTopicsPlan,
} from '../src/compose';

const FPS = 25;
const win = { from: 0.6, to: 20 };

/** palavras da fala, uma a cada 0,4 s a partir de 1 s */
const speech = (text: string, start = 1, step = 0.4) => text.split(' ').map((w, i) => ({ text: w, start: Number((start + i * step).toFixed(3)) }));
const FALA = 'Hoje vamos ver onde a inteligência artificial costuma errar. Ela erra com fatos muito recentes porque o treino acaba numa data. Ela erra com contas mais longas porque não calcula de verdade. E erra com fontes inventadas que parecem reais.';

describe('agendamento dos tópicos pela fala', () => {
  const topics = [{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Contas longas', cue: 'contas mais longas' }, { text: 'Fontes inventadas' }];

  it('acha o cue na fala: cada tópico entra um instante (0,1 s) antes da palavra, em ordem', () => {
    const words = speech(FALA);
    const at = (w: string, from = 0) => words.filter((x) => x.text.toLowerCase().startsWith(w)).map((x) => x.start).find((t) => t >= from)!;
    const starts = scheduleScreenTopics(topics, words, win, FPS);
    expect(starts).toHaveLength(3);
    expect(starts[0]!).toBeCloseTo(at('fatos') - SCREEN_TOPICS.lead, 1);
    expect(starts[1]!).toBeCloseTo(at('contas') - SCREEN_TOPICS.lead, 1);
    expect(starts[2]!).toBeCloseTo(at('fontes') - SCREEN_TOPICS.lead, 1);
    expect(starts[0]!).toBeLessThan(starts[1]!);
    expect(starts[1]!).toBeLessThan(starts[2]!);
  });

  it('tópico sem correspondência na fala é interpolado entre os vizinhos; tópicos na grade de quadros', () => {
    const t4 = [{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Assunto que ninguém disse', cue: 'jamais pronunciado xyz' }, { text: 'Fontes inventadas' }];
    const words = speech(FALA);
    const starts = scheduleScreenTopics(t4, words, win, FPS);
    expect(starts[0]!).toBeLessThan(starts[1]!);
    expect(starts[1]!).toBeLessThan(starts[2]!);
    const fontes = words.find((w) => w.text === 'fontes')!.start;
    expect(starts[2]!).toBeCloseTo(fontes - 0.1, 1);
    for (const t of starts) expect(Math.abs(t * FPS - Math.round(t * FPS))).toBeLessThan(1e-6);
  });

  it('sem cue vale o próprio texto do tópico', () => {
    const starts = scheduleScreenTopics([{ text: 'Fatos muito recentes' }, { text: 'Contas mais longas' }], speech(FALA), win, FPS);
    const words = speech(FALA);
    expect(starts[1]!).toBeCloseTo(words.find((w) => w.text === 'contas')!.start - 0.1, 1);
  });

  it('sem alinhamento (ou sem nenhum achado): distribui igualmente pela janela', () => {
    for (const words of [undefined, [], speech('nada a ver com isso aqui')]) {
      const starts = scheduleScreenTopics(topics, words, win, FPS);
      const d = starts.map((t, i) => (i ? t - starts[i - 1]! : 0)).slice(1);
      expect(starts[0]!).toBeGreaterThanOrEqual(win.from);
      expect(starts[2]!).toBeLessThanOrEqual(win.to - SCREEN_TOPICS.tailRoom + 1e-6);
      expect(Math.abs(d[0]! - d[1]!)).toBeLessThan(0.1);
      expect(d[0]!).toBeGreaterThan(1);
    }
  });

  it('intervalo mínimo entre tópicos e último com folga; janela curta deixa só os que cabem', () => {
    const same = [{ text: 'A coisa', cue: 'fatos muito recentes' }, { text: 'B coisa', cue: 'fatos muito recentes' }, { text: 'C coisa', cue: 'fatos muito recentes' }];
    const s = scheduleScreenTopics(same, speech(FALA), win, FPS);
    for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeGreaterThanOrEqual(topicEnterFrames(FPS) / FPS);
    const short = scheduleScreenTopics(Array.from({ length: 8 }, (_, i) => ({ text: `Tópico ${i}` })), undefined, { from: 0.6, to: 3 }, FPS);
    expect(short.length).toBeLessThan(8);
    expect(short.length).toBeGreaterThanOrEqual(1);
    expect(scheduleScreenTopics([], undefined, win, FPS)).toEqual([]);
  });
});

describe('estado visual do painel', () => {
  const H = [60, 60, 100, 60, 60, 60];
  const opts = { gap: 10, slide: 24 };

  it('no máximo 3 visíveis; os mais antigos saem', () => {
    expect(visibleTopics(-1)).toEqual([]);
    expect(visibleTopics(0)).toEqual([0]);
    expect(visibleTopics(2)).toEqual([0, 1, 2]);
    expect(visibleTopics(5)).toEqual([3, 4, 5]);
    for (let c = 0; c < H.length; c++) expect(topicsFrame(H, c, 1, opts).rows.length).toBeLessThanOrEqual(3);
    for (const p of [0.1, 0.4, 0.8]) for (let c = 0; c < H.length; c++) expect(topicsFrame(H, c, p, opts).rows.length).toBeLessThanOrEqual(4);
  });

  it('o tópico atual fica em destaque (1) e os anteriores esmaecidos (0), assentado', () => {
    const f = topicsFrame(H, 3, 1, opts);
    expect(f.rows.map((r) => [r.index, r.emphasis, r.opacity, r.dx])).toEqual([[1, 0, 1, 0], [2, 0, 1, 0], [3, 1, 1, 0]]);
    expect(f.rows.map((r) => r.y)).toEqual([0, 70, 180]);
    expect(f.areaHeight).toBe(60 + 10 + 100 + 10 + 60);
  });

  it('entrada: o novo desliza e aparece, o anterior perde o destaque, o 4º faz o mais antigo subir e sumir', () => {
    const mid = topicsFrame(H, 3, 0.4, opts);
    const by = (i: number) => mid.rows.find((r) => r.index === i)!;
    expect(by(3).dx).toBeGreaterThan(0);
    expect(by(3).opacity).toBeGreaterThan(0);
    expect(by(3).opacity).toBeLessThan(1);
    expect(by(2).emphasis).toBeGreaterThan(0);
    expect(by(2).emphasis).toBeLessThan(1);
    expect(by(3).emphasis).toBeGreaterThan(0);
    // o índice 0 estava visível antes (0,1,2) e sai por cima
    expect(by(0)).toBeDefined();
    expect(by(0).y).toBeLessThan(0);
    expect(by(0).opacity).toBeLessThan(1);
    // no começo da entrada o novo ainda não se vê e o antigo ainda está inteiro
    const start = topicsFrame(H, 3, 0, opts);
    expect(start.rows.find((r) => r.index === 3)!.opacity).toBe(0);
    expect(start.rows.find((r) => r.index === 0)!.opacity).toBe(1);
    // entrada do 2º tópico (ainda cabem 3): ninguém sai
    expect(topicsFrame(H, 1, 0.5, opts).rows.map((r) => r.index)).toEqual([0, 1]);
  });

  it('o cartão só entra com fade quando pedido (sem título que o segure)', () => {
    expect(topicsFrame(H, 0, 0.3, { ...opts, fadeCard: true }).cardOpacity).toBeLessThan(1);
    expect(topicsFrame(H, 0, 0.3, opts).cardOpacity).toBe(1);
    expect(topicsFrame(H, 0, 1, { ...opts, fadeCard: true }).cardOpacity).toBe(1);
  });
});

describe('segmentos e desenho', () => {
  it('título sozinho primeiro (intro) quando o 1º tópico demora; depois entrada + parada de cada tópico até o fim', () => {
    const segs = planTopicsSegments([4, 8, 12], { from: 0.6, to: 20 }, FPS, true);
    expect(segs[0]).toEqual({ from: 0.6, to: 4, still: { state: -1 }, intro: true });
    expect(segs.filter((s) => s.seq).map((s) => s.seq!.transition)).toEqual([0, 1, 2]);
    const stills = segs.filter((s) => s.still && !s.intro);
    expect(stills.map((s) => s.still!.state)).toEqual([0, 1, 2]);
    expect(stills[2]!.to).toBe(20);
    // contíguos
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toBeCloseTo(segs[i - 1]!.to, 2);
    // 1º tópico logo no início, ou sem título: sem imagem só do título
    expect(planTopicsSegments([0.6, 4], { from: 0.6, to: 9 }, FPS, true)[0]!.seq).toBeDefined();
    expect(planTopicsSegments([3], { from: 0.6, to: 9 }, FPS, false)[0]!.seq).toBeDefined();
  });

  it('layout: tamanho único em que todos cabem em 2 linhas; texto longo é cortado', () => {
    const short = layoutTopics(['Fatos recentes', 'Contas longas'], 540, 1);
    expect(short.size).toBe(38);
    expect(short.lines).toEqual([1, 1]);
    const long = layoutTopics(['Fatos recentes', 'Fontes que parecem reais mas foram inventadas pela IA agora'], 540, 1);
    expect(long.size).toBeLessThan(38);
    expect(Math.max(...long.lines)).toBeLessThanOrEqual(2);
    expect(long.heights[1]!).toBeGreaterThan(long.heights[0]!);
    const huge = layoutTopics(['palavra '.repeat(30).trim()], 540, 1);
    expect(huge.lines[0]).toBe(2);
    expect(huge.texts[0]!.endsWith('…')).toBe(true);
  });

  it('desenha os estados e as sequências (todos do mesmo tamanho), com 4 tópicos', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-topics-'));
    const starts = [3, 6, 9, 12];
    const plan = await renderScreenTopicsPlan(dir, { title: 'Onde ela erra', topics: ['Fatos recentes', 'Contas longas', 'Fontes inventadas', 'Citações falsas'] }, starts, { from: 0.6, to: 16 }, { zone: 'left' });
    expect(plan.side).toBe('right');
    expect(plan.panelFrom).toBe(0.6);
    expect(plan.x).toBeGreaterThan(960);
    const files = readdirSync(dir);
    expect(files).toContain('topics-title.png');
    expect(files.filter((f) => f.startsWith('topics-t3-f')).length).toBe(topicEnterFrames(25));
    for (const sg of plan.segments) {
      if (sg.still) expect(existsSync(sg.still)).toBe(true);
    }
    expect(plan.segments.filter((s) => s.seq)).toHaveLength(4);
  }, 60_000);
});

describe('montagem: filtergraph do painel dinâmico', () => {
  const plan = (extra: Partial<ComposePlan>): ComposePlan => ({
    width: 1920, height: 1080, fps: 25, background: '#000000',
    shots: [{ id: 's0', layout: 'presenter', framing: 'medium', nativeFraming: 'medium', move: 'static', transition: 'cut', duration: 20, clip: { path: '/c.mp4', width: 1920, height: 1080, hasAudio: true } }],
    ...extra,
  });
  const tp: ScreenTopicsPlan = {
    x: 1100, y: 100, w: 829, h: 500, side: 'right', panelFrom: 0.6,
    segments: [
      { from: 0.6, to: 4, still: '/title.png', intro: true },
      { from: 4, to: 4.32, seq: { pattern: '/t0-f%02d.png', frames: 8 } },
      { from: 4.32, to: 20, still: '/t0-f07.png' },
    ],
  };

  it('um overlay por segmento, com janela de tempo; o primeiro entra com fade e deslize; some antes da pergunta', () => {
    const cmd = buildComposeCommand(plan({ screenTopics: tp }));
    expect(cmd.overlays.screenText).toEqual({ from: 0.6, to: 20 });
    expect(cmd.filterComplex).toContain('fade=t=in:st=0:d=0.350:alpha=1');
    expect(cmd.filterComplex).toContain("overlay=x='1100+40*pow(");
    expect(cmd.filterComplex).toContain('overlay=x=1100:y=100:format=auto:eof_action=pass');
    expect(cmd.filterComplex).toContain("enable='between(t,4.000,4.320)'");
    expect(cmd.inputArgs.join(' ')).toContain('-start_number 0 -i /t0-f%02d.png');
    const withTeaser = buildComposeCommand(plan({ screenTopics: tp, teaser: { path: '/tz.png', x: 1, y: 1, w: 1, h: 1 } }));
    expect(withTeaser.overlays.screenText!.to).toBeCloseTo(16.9, 2);
    expect(withTeaser.filterComplex).toContain('fade=t=out');
    // sem o plano, nada
    expect(buildComposeCommand(plan({})).overlays.screenText).toBeUndefined();
  });
});

describe('montagem real curta: vídeo sintético com 4 tópicos', () => {
  it('compõe, aparece cada tópico no tempo e (com PAINEL_PNG_DIR) salva 4 quadros logo após cada entrada', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-topics-real-'));
    const clip = path.join(dir, 'presenter.mp4');
    // parede bege com a "apresentadora" (bloco escuro) à esquerda; 14 s com tom
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xE9E0D2:s=1920x1080:r=25:d=14', '-f', 'lavfi', '-i', 'sine=f=220:d=14', '-vf', 'drawbox=x=180:y=160:w=520:h=920:color=0x3A3A4A:t=fill,drawbox=x=330:y=90:w=220:h=250:color=0xC9A27F:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
    const words = speech('Hoje vamos ver onde a inteligência artificial costuma errar. Ela erra com fatos muito recentes porque o treino acaba numa data. Ela erra com contas mais longas porque não calcula de verdade. E erra com fontes inventadas que parecem reais. Também inventa citações falsas de pessoas.', 0.8, 0.28);
    const topics = [{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Contas longas', cue: 'contas mais longas' }, { text: 'Fontes inventadas', cue: 'fontes inventadas' }, { text: 'Citações falsas', cue: 'citações falsas' }];
    const out = path.join(dir, 'cena.mp4');
    const r = await composeScene({
      shots: [{ id: 's0', line: 'x', layout: 'presenter', framing: 'wide', cameraMove: 'static', transitionIn: 'cut' } as never],
      clips: new Map([['s0', { videoPath: clip, zone: 'left' as const }]]),
      output: out, preset: 'ultrafast', loudnorm: false, joins: false,
      screenText: 'Onde ela erra', screenTopics: { topics, words: new Map([['s0', words]]) },
    });
    expect(r.overlays.screenText?.from).toBe(0.6);
    expect(existsSync(path.join(dir, 'screen-topics'))).toBe(true);
    const probe = await ffprobe(out);
    expect(probe.durationSeconds).toBeGreaterThan(13);

    // início de cada tópico (o mesmo cálculo da montagem)
    const win = r.overlays.screenText!;
    const starts = scheduleScreenTopics(topics, words, win, 25);
    expect(starts).toHaveLength(4);
    const shots = path.join(dir, 'frames');
    mkdirSync(shots);
    const saved: string[] = [];
    for (const [i, t] of starts.entries()) {
      const f = path.join(shots, `topico-${i + 1}.png`);
      await runFfmpeg(['-ss', String(t + SCREEN_TOPICS.enter + 0.2), '-i', out, '-frames:v', '1', f]);
      saved.push(f);
      expect(existsSync(f)).toBe(true);
    }
    const target = process.env.PAINEL_PNG_DIR;
    if (target) {
      mkdirSync(target, { recursive: true });
      for (const [i, f] of saved.entries()) copyFileSync(f, path.join(target, `painel-dinamico-${i + 1}.png`));
    }
  }, 180_000);
});

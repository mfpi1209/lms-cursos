import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOIN, audioEnvelope, buildComposeCommand, cleanTransitions, composeScene, envelopeFromPcm, framingPunchPlan, ffprobe, joinPause, presenterFreeze, punchFits, quietestIn, runFfmpeg, speechEdges, tightenBounds, type ComposePlan } from '../src/compose';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'lms-join-'));

/** PCM s16le 16 kHz: silêncio com um bloco de "fala" (tom) entre `from` e `to` (s) */
function pcm(total: number, bursts: Array<[number, number]>, amp = 8000): Buffer {
  const n = Math.round(total * 16000);
  const b = Buffer.alloc(n * 2);
  for (const [f, t] of bursts) for (let i = Math.round(f * 16000); i < Math.min(n, Math.round(t * 16000)); i++) b.writeInt16LE(Math.round(Math.sin(i / 3) * amp), i * 2);
  return b;
}

describe('envelope e bordas da fala (funções puras)', () => {
  it('acha o primeiro e o último instante com fala e ignora o silêncio', () => {
    const env = envelopeFromPcm(pcm(3, [[0.4, 2.1]]));
    const e = speechEdges(env)!;
    expect(e.first).toBeCloseTo(0.4, 1);
    expect(e.last).toBeCloseTo(2.1, 1);
    expect(speechEdges(envelopeFromPcm(pcm(1, [])))).toBeNull();
  });

  it('ponto mais silencioso: cai dentro do buraco entre duas falas', () => {
    const env = envelopeFromPcm(pcm(2, [[0, 0.9], [1.1, 2]]));
    const q = quietestIn(env, 0, 0.8, 1.2, 1);
    expect(q).toBeGreaterThan(0.89);
    expect(q).toBeLessThan(1.11);
  });
});

describe('aperto das bordas do plano (tightenBounds)', () => {
  const base = { from: 0, to: 3, head: true, tail: true, lead: 0.06, tailPad: 0.1, fps: 25 };
  const env = envelopeFromPcm(pcm(3, [[0.4, 2.1]]));

  it('começa um instante antes da primeira palavra e termina logo depois da última, nos quadros', () => {
    const r = tightenBounds({ ...base, env });
    expect(r.source).toBe('audio');
    // começo: ~0,34 s (0,06 antes da fala); fim: ~2,2 s (0,1 depois); tudo em múltiplos de 40 ms
    expect(r.start).toBeGreaterThan(0.28);
    expect(r.start).toBeLessThan(0.4 - 0.02);
    expect(r.end).toBeGreaterThan(2.1 + 0.04);
    expect(r.end).toBeLessThan(2.1 + 0.2);
    expect(Math.abs(r.start / 0.04 - Math.round(r.start / 0.04))).toBeLessThan(1e-6);
    expect(Math.abs(r.end / 0.04 - Math.round(r.end / 0.04))).toBeLessThan(1e-6);
    expect(r.headTrim).toBeCloseTo(r.start, 6);
    expect(r.tailTrim).toBeCloseTo(3 - r.end, 6);
  });

  it('só mexe nas bordas do clipe (plano no meio de um clipe compartilhado fica como está)', () => {
    const mid = tightenBounds({ ...base, head: false, tail: false, env });
    expect(mid).toMatchObject({ start: 0, end: 3, headTrim: 0, tailTrim: 0 });
    const onlyTail = tightenBounds({ ...base, head: false, env });
    expect(onlyTail.start).toBe(0);
    expect(onlyTail.end).toBeLessThan(2.4);
  });

  it('o fim da última palavra do alinhamento (que costuma passar ~0,25 s do som) não estende o plano; a palavra mais cedo vale no começo', () => {
    const r = tightenBounds({ ...base, env, lastWord: 2.4, firstWord: 0.3 });
    expect(r.end).toBeLessThan(2.1 + 0.2); // não vai até 2,4
    expect(r.end).toBeGreaterThan(2.1 + 0.03);
    expect(r.start).toBeLessThan(0.3 - 0.02); // a palavra começa antes do som medido: respiro conta a partir dela
  });

  it('som e palavra discordando muito: vale a palavra (ruído ao fim não vira fala)', () => {
    const noisy = envelopeFromPcm(pcm(3, [[0.4, 2.1], [2.7, 2.9]]));
    const r = tightenBounds({ ...base, env: noisy, lastWord: 2.1 });
    expect(r.source).toBe('words');
    expect(r.end).toBeLessThan(2.4);
  });

  it('clipe mudo ou resultado curto demais: não mexe', () => {
    expect(tightenBounds({ ...base, env: envelopeFromPcm(pcm(3, [])) }).source).toBe('none');
    expect(tightenBounds({ ...base, to: 0.5, env: envelopeFromPcm(pcm(0.5, [[0.1, 0.2]])) })).toMatchObject({ headTrim: 0, tailTrim: 0 });
  });

  it('pausa natural: maior depois de fim de frase; a soma cai entre 0,15 e 0,25 s', () => {
    expect(joinPause('Isso é tudo.')).toBeGreaterThan(joinPause('Isso é tudo, e'));
    for (const l of ['Pronto!', 'Será?', 'e mais', undefined]) {
      expect(joinPause(l)).toBeGreaterThanOrEqual(0.15);
      expect(joinPause(l)).toBeLessThanOrEqual(0.25);
    }
  });
});

describe('enquadramento alternado (framingPunchPlan)', () => {
  const sh = (id: string, o: Record<string, unknown> = {}) => ({ id, layout: 'presenter' as const, framing: 'medium' as const, cameraMove: 'static' as const, ...o });

  it('mesma câmera: base, punch-in, base, punch-in…; câmera nova volta ao base', () => {
    const plan = framingPunchPlan([sh('a', { cameraId: 'c1' }), sh('b', { cameraId: 'c1' }), sh('c', { cameraId: 'c1' }), sh('d', { cameraId: 'c1' }), sh('e', { cameraId: 'c2' }), sh('f', { cameraId: 'c2' })]);
    expect([...plan.keys()]).toEqual(['b', 'd', 'f']);
    expect(plan.get('b')).toBeGreaterThanOrEqual(1.12);
    expect(plan.get('b')).toBeLessThanOrEqual(1.15);
  });

  it('câmera principal (sem cameraId) conta como uma só; enquadramento diferente já é troca visível', () => {
    expect([...framingPunchPlan([sh('a'), sh('b'), sh('c')]).keys()]).toEqual(['b']);
    expect([...framingPunchPlan([sh('a'), sh('b', { framing: 'close' }), sh('c', { framing: 'close' })]).keys()]).toEqual(['c']);
  });

  it('só onde cabe sem cortar nada: tela dividida, PiP, painel, slide, movimento de câmera e pílulas no centro ficam no base', () => {
    for (const layout of ['presenter_slide_right', 'presenter_slide_left', 'slide_with_pip', 'presenter_panel', 'slide', 'card', 'cinematic'] as const) {
      expect(framingPunchPlan([sh('a'), sh('b', { layout })]).size).toBe(0);
    }
    expect(framingPunchPlan([sh('a'), sh('b', { cameraMove: 'push_in' })]).size).toBe(0);
    expect(punchFits(sh('x', { layout: 'presenter_chips', zone: 'center' }))).toBe(false);
    expect(punchFits(sh('x', { layout: 'presenter_chips' }))).toBe(false);
    expect(punchFits(sh('x', { layout: 'presenter_chips', zone: 'left' }))).toBe(true);
    expect(punchFits(sh('x', { layout: 'lower_third' }))).toBe(true);
    // um plano sem apresentador no meio quebra a sequência
    expect([...framingPunchPlan([sh('a'), sh('b', { layout: 'card' }), sh('c')]).keys()]).toEqual([]);
  });
});

describe('transições sobre quadro real (cleanTransitions)', () => {
  it('a fusão sobre o quadro congelado do apresentador que SAI vira corte; cartão que sai e corte seco ficam', () => {
    const r = cleanTransitions([
      { layout: 'presenter', transition: 'cut', hasVideo: true },
      { layout: 'presenter', transition: 'crossfade', hasVideo: true },
      { layout: 'presenter', transition: 'whip', hasVideo: true },
      { layout: 'card', transition: 'crossfade', hasVideo: false },
      { layout: 'presenter', transition: 'crossfade', hasVideo: true },
      { layout: 'presenter', transition: 'cut', hasVideo: true },
    ]);
    expect(r).toEqual([undefined, 0, 0, 0, undefined, undefined]);
  });
});

describe('filtergraph das emendas (função pura)', () => {
  const plan = (n: number, over: Partial<ComposePlan['shots'][number]>[] = []): ComposePlan => ({
    width: 1920, height: 1080, fps: 25, background: '#F7F8FA',
    shots: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, layout: 'presenter' as const, framing: 'medium' as const, nativeFraming: 'medium' as const, move: 'static' as const, transition: 'cut' as const, duration: 3, clip: { path: `/c${i}.mp4`, width: 1920, height: 1080, hasAudio: true, start: 0.1, videoSeconds: 3.04 }, ...over[i] })),
  });

  it('sem quadro congelado longo: o tpad do apresentador é de 1 quadro quando o vídeo cobre o plano', () => {
    expect(presenterFreeze(3.04, 3, 25)).toBeCloseTo(0.04, 6);
    expect(presenterFreeze(2.96, 3, 25)).toBeCloseTo(0.08, 6);
    expect(presenterFreeze(undefined, 3, 25)).toBe(2);
    const g = buildComposeCommand(plan(3)).filterComplex;
    const tpads = [...g.matchAll(/tpad=stop_mode=clone:stop_duration=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(tpads.length).toBe(3);
    for (const t of tpads) expect(t).toBeLessThanOrEqual(0.04 + 1e-9);
  });

  it('duração da cena = soma dos planos; corte seco entre eles (concat, sem xfade)', () => {
    const cmd = buildComposeCommand(plan(3, [{ duration: 2.4 }, { duration: 3.2 }, { duration: 1.6 }]));
    expect(cmd.totalDuration).toBeCloseTo(7.2, 6);
    expect(cmd.transitions).toEqual([0, 0, 0]);
    expect(cmd.filterComplex).not.toContain('xfade');
    expect(cmd.timeline.map((t) => t.start)).toEqual([0, 2.4, 5.6]);
  });

  it('punch-in: recorte menor, centrado no lado da pessoa e com o topo quase intacto (cabeça nunca cortada); o plano base não recorta', () => {
    const cmd = buildComposeCommand(plan(2, [{}, { punch: 1.14, clip: { path: '/c1.mp4', width: 1920, height: 1080, hasAudio: true, start: 0.1, videoSeconds: 3.04, focusX: 0.27 } }]));
    const chains = cmd.filterComplex.split(';');
    const base = chains.find((c) => c.startsWith('[0:v]'))!;
    const punched = chains.find((c) => c.startsWith('[1:v]'))!;
    expect(base).not.toMatch(/crop=\d+:\d+:\d+:\d+,scale=1920:1080:flags=lanczos/);
    const m = /crop=(\d+):(\d+):(\d+):(\d+),scale=1920:1080:flags=lanczos/.exec(punched)!;
    const [cw, ch, x, y] = m.slice(1).map(Number) as [number, number, number, number];
    expect(cw / 1920).toBeCloseTo(1 / 1.14, 2);
    expect(ch / 1080).toBeCloseTo(1 / 1.14, 2);
    expect(x).toBe(0); // pessoa à esquerda: o recorte encosta nela
    expect(y).toBeLessThanOrEqual(Math.round(JOIN.punchTopCut * 1080));
  });

  it('punch-in nos layouts onde não cabe é ignorado', () => {
    const cmd = buildComposeCommand(plan(1, [{ punch: 1.14, layout: 'presenter_panel', panelStates: [{ path: '/p.png', from: 0 }] }]));
    expect(cmd.layouts).toEqual(['presenter_panel']);
    expect(cmd.filterComplex).not.toContain('crop=1684');
  });
});

/* ------------------------------------------------------------------ */
/* ffmpeg real: 3 clipes sintéticos com cauda de silêncio e imagem parada */
/* ------------------------------------------------------------------ */

const HEAD = 0.36; // respiro antes da fala (imagem parada)
const SPEECH = 1.6;
const TAIL = 0.62; // cauda: avatar parado de boca fechada

/** clipe "de avatar": tom durante a fala e imagem que mexe só durante ela (parada antes e depois) */
async function avatarClip(file: string, hue: number) {
  const total = HEAD + SPEECH + TAIL;
  await runFfmpeg([
    '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=25:duration=${SPEECH}`,
    '-f', 'lavfi', '-i', `sine=frequency=${300 + hue * 90}:sample_rate=48000:duration=${SPEECH}`,
    '-filter_complex', `[0:v]hue=h=${hue * 60},tpad=start_mode=clone:start_duration=${HEAD}:stop_mode=clone:stop_duration=${TAIL}[v];[1:a]volume=0.35,adelay=${Math.round(HEAD * 1000)}:all=1,apad=pad_dur=${TAIL}[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(total), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', file,
  ]);
}

/** trechos de imagem parada (freezedetect) com a duração mínima dada */
async function stillRuns(file: string, minSeconds: number): Promise<Array<{ start: number; dur: number }>> {
  const { stderr } = await runFfmpeg(['-i', file, '-vf', `freezedetect=n=-60dB:d=${minSeconds}`, '-an', '-f', 'null', '-'], { loglevel: 'info' });
  const starts = [...stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const durs = [...stderr.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((start, i) => ({ start, dur: durs[i] ?? 0 }));
}

describe('emendas com ffmpeg real (clipes sintéticos com cauda de silêncio)', () => {
  it('sem imagem parada > 0,25 s na junção, sem palavra cortada, imagem e som da mesma duração; antes (joins: false) a parada passava de 0,5 s', async () => {
    const dir = tmp();
    const files = ['a', 'b', 'c'].map((n) => path.join(dir, `${n}.mp4`));
    for (const [i, f] of files.entries()) await avatarClip(f, i);
    const shots = [
      { id: 'a', transitionIn: 'cut' as const, cameraId: 'cam', line: 'Primeira frase.' },
      { id: 'b', transitionIn: 'crossfade' as const, cameraId: 'cam', line: 'Segunda frase.' },
      { id: 'c', transitionIn: 'cut' as const, cameraId: 'cam', line: 'Terceira frase.' },
    ];
    const clips = new Map(shots.map((s, i) => [s.id, { videoPath: files[i]!, words: [{ start: HEAD + 0.05, end: HEAD + SPEECH - 0.02 }] }]));
    const common = { shots, clips, width: 640, height: 360, preset: 'ultrafast', loudnorm: false };

    const before = await composeScene({ ...common, output: path.join(dir, 'antes.mp4'), joins: false });
    const stillBefore = (await stillRuns(before.output, 0.25)).filter((r) => r.dur >= 0.5);
    expect(stillBefore.length).toBeGreaterThanOrEqual(2); // o defeito existe: cauda + respiro parados

    const after = await composeScene({ ...common, output: path.join(dir, 'depois.mp4') });
    expect(after.transitions).toEqual([0, 0, 0]);
    // a junção nunca fica com imagem parada acima de 0,25 s
    expect(await stillRuns(after.output, 0.25)).toEqual([]);
    // duração = soma dos planos apertados, e bem menor que a de antes
    const sum = after.timeline.reduce((a, t) => a + t.duration, 0);
    expect(after.expectedDurationSeconds).toBeCloseTo(sum, 3);
    expect(after.durationSeconds).toBeLessThan(before.durationSeconds - 0.8);
    // imagem e som com a mesma duração (< 0,3 s)
    const p = await ffprobe(after.output);
    expect(Math.abs((p.videoDurationSeconds ?? 0) - (p.audioDurationSeconds ?? 0))).toBeLessThan(0.1);
    expect(Math.abs(p.durationSeconds - after.expectedDurationSeconds)).toBeLessThan(0.15);
    // enquadramento alternado: o 2º plano com punch-in, o 1º e o 3º no base
    expect(after.joins.map((j) => j.punch)).toEqual([1, JOIN.punch, 1]);
    // sem palavra cortada: toda a fala está lá (≥ 97% do tempo com som) e cada pausa entre frases fica entre 0,1 e 0,3 s
    const env = await audioEnvelope(after.output, 0, p.durationSeconds);
    const loud = env.filter((db) => db > -50).length * 0.01;
    expect(loud).toBeGreaterThan(3 * SPEECH * 0.97);
    expect(loud).toBeLessThan(3 * SPEECH * 1.03);
    const gaps: number[] = [];
    let run = 0;
    let seenSpeech = false;
    for (const db of env) {
      if (db > -50) { if (seenSpeech && run > 0) gaps.push(run * 0.01); run = 0; seenSpeech = true; } else run++;
    }
    expect(gaps.length).toBe(2);
    for (const g of gaps) {
      expect(g).toBeGreaterThan(0.1);
      expect(g).toBeLessThan(0.3);
    }
    // o começo e o fim da cena também perdem a gordura (respiro de cena preservado)
    expect(after.joins[0]!.headTrim).toBeGreaterThan(0.15);
    expect(after.joins[2]!.tailTrim).toBeGreaterThan(0.2);
    // as legendas seguem o começo real de cada plano no clipe (o respiro que saiu não desloca as palavras)
    for (const [i, t] of after.timeline.entries()) expect(t.clipStart).toBeCloseTo(after.joins[i]!.headTrim, 6);
  }, 240_000);

  it('com marca d\'água, a imagem não perde quadro por plano (antes: ~1 quadro a menos em cada plano, imagem mais curta que o som)', async () => {
    const dir = tmp();
    const files = ['a', 'b', 'c', 'd'].map((n) => path.join(dir, `${n}.mp4`));
    for (const [i, f] of files.entries()) await avatarClip(f, i);
    const shots = files.map((_, i) => ({ id: `s${i}`, transitionIn: 'cut' as const }));
    const clips = new Map(shots.map((s, i) => [s.id, { videoPath: files[i]! }]));
    const r = await composeScene({ shots, clips, output: path.join(dir, 'o.mp4'), width: 640, height: 360, preset: 'ultrafast', loudnorm: false, watermark: { brand: 'DNA Work', position: 'bottom-right', opacity: 0.8 } });
    const p = await ffprobe(r.output);
    expect(Math.abs((p.videoDurationSeconds ?? 0) - r.expectedDurationSeconds)).toBeLessThan(0.05);
    expect(Math.abs((p.videoDurationSeconds ?? 0) - (p.audioDurationSeconds ?? 0))).toBeLessThan(0.1);
  }, 120_000);

  it('plano no meio de um clipe compartilhado não é apertado (a emenda é contínua)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'x.mp4');
    await avatarClip(f, 0);
    const shots = [{ id: 'a', transitionIn: 'cut' as const }, { id: 'b', transitionIn: 'cut' as const }];
    const clips = new Map([
      ['a', { videoPath: f, startSeconds: 0, durationSeconds: 1.2 }],
      ['b', { videoPath: f, startSeconds: 1.2 }],
    ]);
    const r = await composeScene({ shots, clips, output: path.join(dir, 'o.mp4'), width: 640, height: 360, preset: 'ultrafast', loudnorm: false });
    expect(r.joins[0]!.tailTrim).toBe(0); // a borda do meio (1,2 s) não mexe
    expect(r.joins[1]!.headTrim).toBe(0);
    expect(r.joins[0]!.headTrim).toBeGreaterThan(0.1); // começo do clipe, sim
    expect(r.joins[1]!.tailTrim).toBeGreaterThan(0.2); // fim do clipe, sim
  }, 120_000);
});

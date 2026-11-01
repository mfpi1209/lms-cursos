import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ElevenLabsAdapter } from '../src';
import {
  ShotLineNotFoundError, buildComposeCommand, crossfadeForPose, poseDifference, POSE_SAME_MAX, POSE_FAR_MIN, SHORT_CROSSFADE, slideSizeForLayout, cinematicShotTiming, cinematicSlowdown, composeScene, extractScenePlate, generateStandInClip, runFfmpeg, cutAudioSegments, ffprobe, framingCropRatio, generateMotionStandInClip, generateTestClip, generateToneMp3, renderCornerTagToFile,
  mapShotTimings, normalizeForMatch, pngSize, renderBrandCardPng, renderCaptionPng, renderShotGraphics, renderSlidePng, syntheticAlignment, cardBoldSegments, brandCardTokens, layoutHidesPresenter, type CharAlignment, type ComposePlan,
} from '../src/compose';

/** duração de uma faixa (v = imagem, a = som) */
async function ffprobeStream(file: string, kind: 'v' | 'a'): Promise<number> {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', `${kind}:0`, '-show_entries', 'stream=duration', '-of', 'csv=p=0', file]).toString().trim());
}

const tmp = () => mkdtempSync(path.join(tmpdir(), 'lms-compose-'));

/** alinhamento "perfeito": cada caractere dura 50 ms, na ordem do texto */
function alignmentOf(text: string, dt = 0.05): CharAlignment {
  const characters = Array.from(text);
  return { characters, startTimes: characters.map((_, i) => i * dt), endTimes: characters.map((_, i) => (i + 1) * dt) };
}

describe('slides (satori + resvg)', () => {
  it('renderiza os 4 estilos em 1920×1080 e meia largura 960×1080, com glifos pt-BR', async () => {
    for (const style of ['clean', 'bold', 'quote', 'checklist'] as const) {
      const png = await renderSlidePng({ title: 'Negociação: ação e atenção', bullets: ['Avise cedo — “sem surpresas”', 'Mostre fatos', 'Proponha alternativa…'], highlight: 'Você não está pedindo um favor', style }, { accent: '#1a66d1' });
      expect(pngSize(png)).toEqual({ width: 1920, height: 1080 });
      expect(png.byteLength).toBeGreaterThan(5000);
      const half = await renderSlidePng({ title: 'Três passos', bullets: ['Ouvir', 'Confirmar', 'Registrar'], style }, { width: 960, height: 1080, accent: '#e4572e' });
      expect(pngSize(half)).toEqual({ width: 960, height: 1080 });
    }
  });

  it('textos acima do limite são truncados (não quebram o render) e o letreiro é transparente', async () => {
    const png = await renderSlidePng({ title: 'x'.repeat(200), bullets: Array(8).fill('palavra '.repeat(30)), style: 'clean' });
    expect(pngSize(png).width).toBe(1920);
    const cap = await renderCaptionPng('Marina Alves, gerente de operações');
    expect(pngSize(cap)).toEqual({ width: 1920, height: 1080 });
    // PNG RGBA (color type 6) — necessário para sobrepor o letreiro
    expect(cap[25]).toBe(6);
  });
});

describe('mapeamento fala -> tempo', () => {
  const narration = 'Olá! Hoje vamos falar de prazos. Primeiro: avise cedo. Depois, mostre os fatos.';
  const al = alignmentOf(narration);

  it('casa trechos exatos e corta no meio do silêncio entre planos', () => {
    const t = mapShotTimings(al, [
      { id: 'a', line: 'Olá! Hoje vamos falar de prazos.' },
      { id: 'b', line: 'Primeiro: avise cedo.' },
      { id: 'c', line: 'Depois, mostre os fatos.' },
    ], { totalDuration: narration.length * 0.05 + 0.4 });
    expect(t.map((x) => x.shotId)).toEqual(['a', 'b', 'c']);
    expect(t[0]!.start).toBe(0);
    expect(narration.slice(t[1]!.charStart, t[1]!.charEnd + 1)).toBe('Primeiro: avise cedo');
    // contíguos e cobrindo tudo
    expect(t[0]!.end).toBeCloseTo(t[1]!.start, 6);
    expect(t[1]!.end).toBeCloseTo(t[2]!.start, 6);
    expect(t[2]!.end).toBeCloseTo(narration.length * 0.05 + 0.4, 6);
    // corte cai entre o fim de "prazos." e o início de "Primeiro"
    expect(t[0]!.end).toBeGreaterThanOrEqual(t[0]!.speechEnd);
    expect(t[0]!.end).toBeLessThanOrEqual(t[1]!.speechStart);
  });

  it('tolera espaços, aspas curvas, maiúsculas e pontuação diferentes', () => {
    const text = 'Ele disse: “não   desista”.\nE   você — respondeu: sim!';
    const t = mapShotTimings(alignmentOf(text), [
      { id: 'a', line: 'ele disse "não desista"' },
      { id: 'b', line: 'E você, respondeu: sim' },
    ]);
    expect(t).toHaveLength(2);
    expect(text.slice(t[1]!.charStart, t[1]!.charEnd + 1)).toBe('E   você — respondeu: sim');
    expect(normalizeForMatch('  “Olá,”   MUNDO!! ').norm).toBe('olá mundo');
  });

  it('não casa dentro de palavras e falha alto quando a fala não existe ou está fora de ordem', () => {
    expect(() => mapShotTimings(al, [{ id: 'x', line: 'avise tarde' }])).toThrow(ShotLineNotFoundError);
    expect(() => mapShotTimings(al, [{ id: 'x', line: 'praz' }])).toThrow(/não foi encontrada/);
    expect(() => mapShotTimings(al, [{ id: 'b', line: 'Primeiro: avise cedo.' }, { id: 'a', line: 'Olá!' }])).toThrow(/fora de ordem/);
  });

  it('corta o MP3 em segmentos por plano com durações somando o total', async () => {
    const dir = tmp();
    const text = 'Primeira ideia curta. Segunda ideia, um pouco maior que a primeira. Terceira.';
    const total = 6;
    const mp3 = await generateToneMp3(path.join(dir, 'n.mp3'), total);
    const timings = mapShotTimings(syntheticAlignment(text, total), [
      { id: 's1', line: 'Primeira ideia curta.' }, { id: 's2', line: 'Segunda ideia, um pouco maior que a primeira.' }, { id: 's3', line: 'Terceira.' },
    ], { totalDuration: total });
    const segs = await cutAudioSegments({ input: mp3, timings, outDir: dir });
    expect(segs).toHaveLength(3);
    const sum = segs.reduce((a, s) => a + s.durationSeconds, 0);
    expect(Math.abs(sum - total)).toBeLessThan(0.25);
    expect(segs[1]!.durationSeconds).toBeGreaterThan(segs[0]!.durationSeconds);
  });
});

describe('ElevenLabs com timestamps (fetch falso)', () => {
  it('chama /with-timestamps e decodifica audio_base64 + alignment', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({
        audio_base64: Buffer.from('ID3fake').toString('base64'),
        alignment: { characters: ['O', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] },
        normalized_alignment: { characters: ['O', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] },
      }), { status: 200, headers: { 'content-type': 'application/json', 'character-cost': '2' } });
    }) as unknown as typeof fetch;
    const el = new ElevenLabsAdapter('k', 'https://el.test', fake);
    const r = await el.synthesizeWithTimestamps({ text: 'Oi', voiceId: 'v 1', modelId: 'eleven_v4', stability: 0.3 });
    expect(calls[0]!.url).toBe('https://el.test/v1/text-to-speech/v%201/with-timestamps?output_format=mp3_44100_128');
    expect(calls[0]!.body).toMatchObject({ text: 'Oi', model_id: 'eleven_v4', voice_settings: { stability: 0.3 } });
    expect(Buffer.from(r.audio).toString()).toBe('ID3fake');
    expect(r.alignment).toEqual({ characters: ['O', 'i'], startTimes: [0, 0.1], endTimes: [0.1, 0.2] });
    expect(r.characterCost).toBe(2);
  });

  it('erro HTTP vira ElevenLabsError', async () => {
    const fake = (async () => new Response('quota', { status: 401 })) as unknown as typeof fetch;
    await expect(new ElevenLabsAdapter('k', 'https://el.test', fake).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' })).rejects.toMatchObject({ status: 401 });
  });
});

describe('filtergraph (função pura)', () => {
  const base = (over: Partial<ComposePlan['shots'][number]>[]): ComposePlan => ({
    width: 1920, height: 1080, fps: 25, background: '#F7F8FA',
    shots: over.map((o, i) => ({ id: `s${i}`, layout: 'presenter', framing: 'medium', nativeFraming: 'medium', move: 'static', transition: 'cut', duration: 4, clip: { path: `/c${i}.mp4`, width: 1920, height: 1072, hasAudio: true }, ...o })),
  });

  it('fusão adaptada à pose: duração própria (curta) ou corte seco (0) no lugar da padrão', () => {
    const cmd = buildComposeCommand(base([{}, { transition: 'crossfade', transitionSeconds: 0.12 }, { transition: 'crossfade', transitionSeconds: 0 }]));
    const g = cmd.filterComplex;
    expect(g).toContain('[hv1][cn1]xfade=transition=fade:duration=0.120:offset=4.000,settb=AVTB,setpts=N/(25*TB)[xv1]');
    expect(g).toContain('[cv2][cn2]concat=n=2:v=1:a=0,settb=AVTB,setpts=N/(25*TB)[xv2]');
    expect(cmd.transitions).toEqual([0, 0.12, 0]);
  });

  it('fusão seguida de corte seco: a imagem vai até o fim (antes o xfade descartava o resto e a imagem congelava)', async () => {
    const dir = tmp();
    const clips = [0, 1, 2].map((i) => path.join(dir, `c${i}.mp4`));
    for (const [i, c] of clips.entries())
      await runFfmpeg(['-f', 'lavfi', '-i', `testsrc=size=320x180:rate=25:duration=2`, '-f', 'lavfi', '-i', `sine=f=${300 + i * 100}:d=2`, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', c]);
    const plan: ComposePlan = {
      width: 320, height: 180, fps: 25, background: '#000000',
      shots: clips.map((c, i) => ({ id: `s${i}`, layout: 'presenter' as const, framing: 'medium' as const, nativeFraming: 'medium' as const, move: 'static' as const, transition: i === 1 ? ('crossfade' as const) : ('cut' as const), ...(i === 1 ? { transitionSeconds: 0.12 } : {}), duration: 2, clip: { path: c, width: 320, height: 180, hasAudio: true } })),
    };
    const cmd = buildComposeCommand(plan);
    const out = path.join(dir, 'out.mp4');
    await runFfmpeg([...cmd.inputArgs, '-filter_complex', cmd.filterComplex, '-map', cmd.videoLabel, '-map', cmd.audioLabel, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-t', String(cmd.totalDuration), out]);
    const v = await ffprobeStream(out, 'v');
    const a = await ffprobeStream(out, 'a');
    expect(v).toBeGreaterThan(a - 0.3);
  }, 60_000);

  it('regra da pose: mesma pose mantém a fusão; pose próxima, fusão curta; pose muito diferente, corte seco', () => {
    expect(crossfadeForPose(null)).toBeNull();
    expect(crossfadeForPose(POSE_SAME_MAX - 1)).toBeNull();
    expect(crossfadeForPose((POSE_SAME_MAX + POSE_FAR_MIN) / 2)).toBe(SHORT_CROSSFADE);
    expect(crossfadeForPose(POSE_FAR_MIN + 5)).toBe(0);
  });

  it('diferença de pose medida: mesmo quadro ≈ 0; quadros diferentes, alta', async () => {
    const dir = tmp();
    const a = path.join(dir, 'a.mp4');
    const b = path.join(dir, 'b.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x202020:s=320x180:r=25:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', a]);
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xe0e0e0:s=320x180:r=25:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', b]);
    expect(await poseDifference(a, 0.2, a, 0.6)).toBeLessThan(2);
    expect(await poseDifference(a, 0.2, b, 0.2)).toBeGreaterThan(POSE_FAR_MIN);
  }, 30_000);

  it('enquadramento relativo à câmera nativa (nunca abre além do nativo)', () => {
    expect(framingCropRatio('medium', 'medium')).toBe(1);
    expect(framingCropRatio('close', 'medium')).toBeCloseTo(0.75);
    expect(framingCropRatio('extreme_close', 'wide')).toBeCloseTo(0.45);
    expect(framingCropRatio('wide', 'medium')).toBe(1);
  });

  it('corte seco usa concat; crossfade/whip/dip: xfade sobre o quadro congelado do plano que sai; áudio sempre concatenado (a fala nunca é encoberta)', () => {
    const cmd = buildComposeCommand(base([{}, { transition: 'crossfade' }, { transition: 'whip' }, { transition: 'dip_to_color' }, { transition: 'cut' }]));
    const g = cmd.filterComplex;
    // o plano que sai ganha T segundos de quadro congelado; a transição começa no FIM real dele
    expect(g).toContain('[v0]settb=AVTB,setpts=N/(25*TB),tpad=stop_mode=clone:stop_duration=0.400[hv1]');
    expect(g).toContain('[hv1][cn1]xfade=transition=fade:duration=0.400:offset=4.000,settb=AVTB,setpts=N/(25*TB)[xv1]');
    expect(g).toContain('[xv1]settb=AVTB,setpts=N/(25*TB),tpad=stop_mode=clone:stop_duration=0.240[hv2]');
    expect(g).toContain('[hv2][cn2]xfade=transition=slideleft:duration=0.240:offset=8.000,settb=AVTB,setpts=N/(25*TB)[xv2]');
    expect(g).toContain('[hv3][cn3]xfade=transition=fadeblack:duration=0.480:offset=12.000,settb=AVTB,setpts=N/(25*TB)[xv3]');
    expect(g).toContain('[cv4][cn4]concat=n=2:v=1:a=0,settb=AVTB,setpts=N/(25*TB)[xv4]');
    expect(g).not.toContain('acrossfade');
    for (let i = 1; i <= 4; i++) expect(g).toContain(`[a${i}]concat=n=2:v=0:a=1[xa${i}]`);
    expect(cmd.overlaps).toEqual([0, 0, 0, 0, 0]);
    expect(cmd.transitions).toEqual([0, 0.4, 0.24, 0.48, 0]);
    expect(cmd.totalDuration).toBeCloseTo(20, 3);
    expect(cmd.timeline.map((t) => t.start)).toEqual([0, 4, 8, 12, 16]);
    // clipe 1920×1072 do HeyGen preenche o quadro (sem tarjas)
    expect(g).toContain('[0:v]fps=25,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    expect(cmd.inputArgs.filter((a) => a === '-i')).toHaveLength(5);
  });

  it('enquadramento estático vira crop focado no terço superior; movimentos usam zoompan', () => {
    const cmd = buildComposeCommand(base([{ framing: 'close' }, { framing: 'medium', move: 'push_in' }, { move: 'pan_left', nativeFraming: 'wide', framing: 'wide' }]));
    expect(cmd.filterComplex).toMatch(/\[0:v\][^;]*crop=1440:810:240:\d+,scale=1920:1080/);
    expect(cmd.filterComplex).toMatch(/\[1:v\][^;]*scale=3840:2160:flags=bicubic,zoompan=z='1\*\(1\+0\.12\*/);
    expect(cmd.filterComplex).toMatch(/\[2:v\][^;]*zoompan=z='1\.12'/);
  });

  it('cartão de marca (layout card): PNG 16:9 nas duas variantes, tokens da marca, **negrito** nos tópicos; sem apresentador na montagem', async () => {
    const light = await renderBrandCardPng({ title: 'O dia da entrevista', bullets: ['Chegue **dez minutos antes**', 'Leve **currículo e documento**', '**Desligue** o celular'], variant: 'light' });
    const navy = await renderBrandCardPng({ title: 'O dia da entrevista', bullets: ['Chegue **dez minutos antes**', 'Leve **currículo e documento**'] }, { variant: 'navy', brand: 'dnawork' });
    expect(pngSize(light)).toEqual({ width: 1920, height: 1080 });
    expect(pngSize(navy)).toEqual({ width: 1920, height: 1080 });
    expect(light.byteLength).toBeGreaterThan(5000);
    expect(Buffer.compare(Buffer.from(light), Buffer.from(navy))).not.toBe(0);
    expect(brandCardTokens('dnawork', 'light')).toMatchObject({ bg: '#F4F7FA', fg: '#1D1E4C', accent: '#FF7A08' });
    expect(brandCardTokens('dnawork', 'navy')).toMatchObject({ bg: '#1D1E4C', fg: '#FFFFFF', accent: '#FF7A08' });
    expect(brandCardTokens(undefined, 'navy').bg).toBe('#1D1E4C');
    expect(cardBoldSegments('Chegue **dez minutos antes** sempre')).toEqual([{ text: 'Chegue ', bold: false }, { text: 'dez minutos antes', bold: true }, { text: ' sempre', bold: false }]);
    expect(layoutHidesPresenter('card')).toBe(true);
    expect(layoutHidesPresenter('presenter')).toBe(false);
    // na montagem, card é como slide: tela cheia, só o áudio do trecho, sem clipe
    const cmd = buildComposeCommand(base([{}, { layout: 'card', slidePath: '/card.png', clip: { path: '/seg1.wav', hasAudio: true, hasVideo: false } }]));
    expect(cmd.layouts).toEqual(['presenter', 'card']);
    expect(slideSizeForLayout('card')).toEqual({ width: 1920, height: 1080 });
  });

  it('layouts: tela dividida, PiP arredondado, slide, letreiro; sem slide cai para apresentador', () => {
    const cmd = buildComposeCommand(base([
      { layout: 'presenter_slide_right', slidePath: '/s0.png' },
      { layout: 'presenter_slide_left', slidePath: '/s1.png' },
      { layout: 'slide_with_pip', slidePath: '/s2.png' },
      { layout: 'slide', slidePath: '/s3.png' },
      { layout: 'lower_third', captionPath: '/c4.png' },
      { layout: 'slide' },
    ]));
    const g = cmd.filterComplex;
    expect(cmd.layouts).toEqual(['presenter_slide_right', 'presenter_slide_left', 'slide_with_pip', 'slide', 'lower_third', 'presenter']);
    expect(g).toMatch(/\[ph0\]\[s0\]hstack=inputs=2/);
    expect(g).toMatch(/\[s1\]\[ph1\]hstack=inputs=2/);
    expect(g).toContain('crop=960:1080:480:0');
    expect(g).toMatch(/\[p2\]scale=538:302,format=yuva444p,geq=/);
    expect(g).toContain('overlay=x=1324:y=720');
    // slide puro: vídeo do apresentador não é usado, só o áudio
    expect(g).not.toMatch(/\[p3\]/);
    expect(g).toMatch(/fade=t=in:st=0.25:d=0.35:alpha=1/);
    expect(cmd.inputArgs).toContain('/s3.png');
    expect(cmd.inputArgs).not.toContain('/s5.png');
  });

  it('plano "slide" só com áudio (sem clipe pago) usa o slide + o áudio do trecho; sem slide é erro', () => {
    const cmd = buildComposeCommand(base([{}, { layout: 'slide', slidePath: '/s1.png', clip: { path: '/seg1.wav', hasAudio: true, hasVideo: false } }]));
    expect(cmd.layouts).toEqual(['presenter', 'slide']);
    expect(cmd.filterComplex).toContain('[1:a]aresample=48000');
    expect(cmd.filterComplex).not.toContain('[1:v]');
    expect(() => buildComposeCommand(base([{ layout: 'slide', clip: { path: '/seg.wav', hasAudio: true, hasVideo: false } }]))).toThrow(/só o layout "slide"/);
  });

  it('cena em movimento: vídeo em tela cheia sem zoom/movimento, áudio do clipe descartado (narração separada), desacelera até 10% e congela o resto', () => {
    const cmd = buildComposeCommand(base([{}, { layout: 'cinematic', framing: 'close', move: 'push_in', duration: 6, clip: { path: '/cine.mp4', width: 1920, height: 1080, hasAudio: true, audioPath: '/seg.wav', videoSeconds: 5 } }]));
    expect(cmd.layouts).toEqual(['presenter', 'cinematic']);
    // entradas: c0, cine, seg (o áudio do plano 2 vem do -i seg, não do clipe)
    expect(cmd.inputArgs).toEqual(['-i', '/c0.mp4', '-i', '/cine.mp4', '-i', '/seg.wav']);
    expect(cmd.filterComplex).toContain('[2:a]aresample=48000');
    expect(cmd.filterComplex).not.toContain('[1:a]');
    const chain = cmd.filterComplex.split(';').find((c) => c.startsWith('[1:v]'))!;
    expect(chain).toContain('setpts=1.1000*PTS');
    expect(chain).toContain('tpad=stop_mode=clone:stop_duration=6');
    expect(chain).not.toContain('zoompan');
    expect(chain).not.toContain('crop=1440:810');
    expect(cinematicSlowdown(5.8, 6)).toBeCloseTo(6 / 5.8, 4);
    expect(cinematicSlowdown(8, 6)).toBe(1);
    expect(cinematicSlowdown(undefined, 6)).toBe(1);
    // letreiro opcional por cima
    const withCaption = buildComposeCommand(base([{ layout: 'cinematic', captionPath: '/cap.png', clip: { path: '/cine.mp4', hasAudio: false, audioPath: '/seg.wav', videoSeconds: 8 } }]));
    expect(withCaption.filterComplex).toContain('overlay=0:0');
    expect(withCaption.filterComplex).not.toContain('setpts=1.');
  });

  it('cena em movimento mais longa que a fala: plano dura o clipe, narração com respiro (adelay), sem desaceleração; offsets do xfade e duração total contam o clipe', () => {
    expect(cinematicShotTiming(2.5, 7)).toEqual({ duration: 7, leadIn: 1.2 });
    expect(cinematicShotTiming(5.4, 6)).toEqual({ duration: 6, leadIn: expect.closeTo(0.3, 5) });
    expect(cinematicShotTiming(6.5, 6)).toEqual({ duration: 6.5, leadIn: 0 });
    expect(cinematicShotTiming(3, undefined)).toEqual({ duration: 3, leadIn: 0 });
    const cmd = buildComposeCommand(base([
      { layout: 'cinematic', duration: 7, clip: { path: '/cine.mp4', width: 1920, height: 1080, hasAudio: false, audioPath: '/seg.wav', videoSeconds: 7, audioDelay: 1.2 } },
      { transition: 'crossfade', duration: 3 },
    ]));
    const g = cmd.filterComplex;
    // narração começa 1,2 s depois; silêncio completa até o fim do plano (7 s)
    expect(g).toContain('[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=delays=1200:all=1,apad,atrim=duration=7.000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012,afade=t=out:st=6.975:d=0.025');
    const chain = g.split(';').find((c) => c.startsWith('[0:v]'))!;
    expect(chain).not.toContain('setpts=1.');
    expect(chain).toContain('trim=duration=7.000');
    // o crossfade parte do fim do clipe (7 s), sobre o quadro congelado; a fala do plano seguinte entra inteira
    expect(g).toContain('xfade=transition=fade:duration=0.400:offset=7.000');
    expect(cmd.totalDuration).toBeCloseTo(7 + 3, 3);
    expect(cmd.timeline).toEqual([{ id: 's0', start: 0, duration: 7, audioDelay: 1.2 }, { id: 's1', start: 7, duration: 3, audioDelay: 0 }]);
    // sem atraso: nenhum adelay
    expect(buildComposeCommand(base([{ layout: 'cinematic', clip: { path: '/c.mp4', hasAudio: false, audioPath: '/s.wav', videoSeconds: 4 } }])).filterComplex).not.toContain('adelay');
  });

  it('clipe sem áudio recebe silêncio; trecho de clipe compartilhado usa trim/atrim com início', () => {
    const cmd = buildComposeCommand(base([{ clip: { path: '/x.mp4', hasAudio: false } }, { clip: { path: '/y.mp4', hasAudio: true, start: 2.5 } }]));
    expect(cmd.inputArgs.join(' ')).toContain('-f lavfi -t 4.000 -i anullsrc=r=48000:cl=stereo');
    expect(cmd.filterComplex).toContain('trim=start=2.500,setpts=PTS-STARTPTS,fps=25');
    expect(cmd.filterComplex).toContain('atrim=start=2.500,asetpts=PTS-STARTPTS,aresample=48000');
  });
});

function sampleClip(): string | undefined {
  const root = path.resolve(__dirname, '../../../.data/storage');
  try {
    for (const ws of readdirSync(root)) {
      const vdir = path.join(root, ws, 'video');
      for (const sub of readdirSync(vdir)) {
        for (const f of readdirSync(path.join(vdir, sub))) if (f.endsWith('.mp4') && statSync(path.join(vdir, sub, f)).size > 0) return path.join(vdir, sub, f);
      }
    }
  } catch { /* sem amostras locais */ }
  return undefined;
}

describe('composição real (ffmpeg)', () => {
  it('cena em movimento: substituto simulado (pan + etiqueta, sem áudio) + narração por cima; duração = narração', async () => {
    const dir = tmp();
    const tag = await renderCornerTagToFile(path.join(dir, 'tag.png'), 'cena em movimento (simulada)');
    const cine = await generateMotionStandInClip({ output: path.join(dir, 'cine.mp4'), seconds: 4, tagPath: tag });
    const pc = await ffprobe(cine);
    expect(pc).toMatchObject({ width: 1920, height: 1080, hasVideo: true, hasAudio: false });
    const narration = await generateToneMp3(path.join(dir, 'seg.mp3'), 4.3);
    const presenter = await generateTestClip({ output: path.join(dir, 'p.mp4'), seconds: 2, width: 1920, height: 1080 });
    const shots = [
      { id: 'a', layout: 'cinematic' as const, framing: 'medium' as const, cameraMove: 'static' as const, transitionIn: 'cut' as const, caption: 'Terça, dez horas' },
      { id: 'b', layout: 'presenter' as const, framing: 'close' as const, cameraMove: 'static' as const, transitionIn: 'cut' as const },
    ];
    const gfx = await renderShotGraphics({ shots, outDir: dir });
    expect(gfx.captions.has('a')).toBe(true);
    const clips = new Map([['a', { videoPath: cine, audioPath: narration }], ['b', { videoPath: presenter }]]);
    const r = await composeScene({ shots, clips, captions: gfx.captions, output: path.join(dir, 'out.mp4'), preset: 'ultrafast' });
    expect(r.layouts).toEqual(['cinematic', 'presenter']);
    // a cena em movimento dura o trecho de narração (4,3 s), não o clipe (4 s): desacelerou
    expect(r.expectedDurationSeconds).toBeCloseTo(4.3 + 2, 1);
    expect(Math.abs(r.durationSeconds - r.expectedDurationSeconds)).toBeLessThan(0.2);
  }, 120_000);

  it('cena em movimento mais longa que a fala: duração = clipe + próximo plano; silêncio antes da narração (respiro) e depois', async () => {
    const dir = tmp();
    const cine = await generateMotionStandInClip({ output: path.join(dir, 'cine.mp4'), seconds: 7 });
    // narração com tom alto para medir o silêncio do respiro
    const narration = path.join(dir, 'seg.wav');
    await runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2.5', '-af', 'volume=0.5', narration]);
    const presenter = await generateTestClip({ output: path.join(dir, 'p.mp4'), seconds: 2, width: 1920, height: 1080 });
    const shots = [
      { id: 'a', layout: 'cinematic' as const, transitionIn: 'cut' as const },
      { id: 'b', layout: 'presenter' as const, transitionIn: 'crossfade' as const },
    ];
    const clips = new Map([['a', { videoPath: cine, audioPath: narration }], ['b', { videoPath: presenter }]]);
    const out = path.join(dir, 'out.mp4');
    const r = await composeScene({ shots, clips, output: out, preset: 'ultrafast' });
    expect(r.expectedDurationSeconds).toBeCloseTo(7 + 2, 1);
    expect(Math.abs(r.durationSeconds - r.expectedDurationSeconds)).toBeLessThan(0.2);
    // pico do áudio: 0–1,0 s em silêncio (respiro de 1,2 s), 1,5–3,5 s com a narração, 4,0–6,4 s em silêncio
    const peak = async (from: number, to: number) => {
      const raw = path.join(dir, `pcm-${from}.raw`);
      await runFfmpeg(['-ss', String(from), '-t', String(to - from), '-i', out, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', raw]);
      const b = readFileSync(raw);
      let max = 0;
      for (let i = 0; i + 1 < b.length; i += 2) max = Math.max(max, Math.abs(b.readInt16LE(i)));
      return max / 32768;
    };
    expect(await peak(0, 1.0)).toBeLessThan(0.002);
    expect(await peak(1.5, 3.5)).toBeGreaterThan(0.03); // o sine do lavfi tem amplitude 1/8
    expect(await peak(4.0, 6.4)).toBeLessThan(0.002);
  }, 120_000);

  it('transição não encobre a fala: o fim do plano que sai toca inteiro e a duração é a soma (ffprobe)', async () => {
    const dir = tmp();
    const silence = path.join(dir, 'silence.wav');
    await runFfmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2', silence]);
    const speaking = await generateTestClip({ output: path.join(dir, 'a.mp4'), seconds: 4, width: 1920, height: 1080 });
    const quiet = await generateTestClip({ output: path.join(dir, 'b.mp4'), seconds: 2, width: 1920, height: 1080, audioPath: silence });
    const out = path.join(dir, 'out.mp4');
    const shots = [{ id: 'a', transitionIn: 'cut' as const }, { id: 'b', transitionIn: 'crossfade' as const }];
    const r = await composeScene({ shots, clips: new Map([['a', { videoPath: speaking }], ['b', { videoPath: quiet }]]), output: out, preset: 'ultrafast', joins: false });
    expect(r.transitions).toEqual([0, 0.4]);
    expect(r.expectedDurationSeconds).toBeCloseTo(6, 2);
    expect(Math.abs((await ffprobe(out)).durationSeconds - 6)).toBeLessThan(0.15);
    const peak = async (from: number, to: number) => {
      const raw = path.join(dir, `pcm-${from}.raw`);
      await runFfmpeg(['-ss', String(from), '-t', String(to - from), '-i', out, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', raw]);
      const b = readFileSync(raw);
      let max = 0;
      for (let i = 0; i + 1 < b.length; i += 2) max = Math.max(max, Math.abs(b.readInt16LE(i)));
      return max / 32768;
    };
    const ref = await peak(1, 2);
    expect(ref).toBeGreaterThan(0.01);
    // com acrossfade (antes) o fim da fala caía para < 40% do volume; agora toca inteiro até 4,0 s
    expect(await peak(3.85, 3.97)).toBeGreaterThan(ref * 0.8);
    expect(await peak(4.1, 5.9)).toBeLessThan(0.002);
  }, 120_000);

  it('fundo de continuidade: extrai o quadro de 0,3 s em JPEG 1920×1080 desfocado; clipe curto cai no quadro 0; substituto por cima do fundo', async () => {
    const dir = tmp();
    const cine = await generateTestClip({ output: path.join(dir, 'c.mp4'), seconds: 2, width: 1280, height: 720 });
    const r = await extractScenePlate({ input: cine, output: path.join(dir, 'plate.jpg') });
    expect(r.atSeconds).toBeCloseTo(0.3, 5);
    const bytes = readFileSync(r.output);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]); // JPEG
    expect(await ffprobe(r.output)).toMatchObject({ width: 1920, height: 1080, hasVideo: true });
    // pedido além do fim do clipe: usa o primeiro quadro
    const r2 = await extractScenePlate({ input: cine, output: path.join(dir, 'plate2.jpg'), atSeconds: 30 });
    expect(r2.atSeconds).toBe(0);
    expect(await ffprobe(r2.output)).toMatchObject({ width: 1920, height: 1080 });
    // substituto do apresentador (simulação) por cima do fundo da cena
    const seg = await generateToneMp3(path.join(dir, 'seg.mp3'), 1.5);
    const st = await generateStandInClip({ output: path.join(dir, 'st.mp4'), seconds: 1.5, sourceVideo: cine, audioPath: seg, backgroundImage: r.output });
    const p = await ffprobe(st);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    expect(Math.abs(p.durationSeconds - 1.5)).toBeLessThan(0.2);
  }, 120_000);

  it('monta 3 planos (split + PiP + letreiro, push-in, crossfade/whip) com duração = soma dos planos', async () => {
    const dir = tmp();
    const sample = sampleClip();
    const clipPath = path.join(dir, 'presenter.mp4');
    if (sample && (await ffprobe(sample)).durationSeconds >= 9) copyFileSync(sample, clipPath);
    else await generateTestClip({ output: clipPath, seconds: 9, width: 1920, height: 1072 });
    const shots = [
      { id: 'a', layout: 'presenter_slide_right' as const, framing: 'medium' as const, cameraMove: 'push_in' as const, transitionIn: 'cut' as const, slide: { title: 'Três passos', bullets: ['Avise cedo', 'Mostre fatos'], style: 'checklist' as const } },
      { id: 'b', layout: 'slide_with_pip' as const, framing: 'close' as const, cameraMove: 'static' as const, transitionIn: 'crossfade' as const, slide: { title: 'Atenção', highlight: 'Não espere o prazo vencer', style: 'bold' as const } },
      { id: 'c', layout: 'lower_third' as const, framing: 'close' as const, cameraMove: 'drift' as const, transitionIn: 'whip' as const, caption: 'Marina Alves · Operações' },
    ];
    // um único clipe compartilhado pelos três planos (trechos 0–3, 3–6, 6–9 s)
    const clips = new Map(shots.map((s, i) => [s.id, { videoPath: clipPath, cameraNativeFraming: 'medium' as const, startSeconds: i * 3, durationSeconds: 3 }]));
    const gfx = await renderShotGraphics({ shots, outDir: dir, accent: '#1a66d1' });
    expect(gfx.slides.size).toBe(2);
    expect(gfx.captions.size).toBe(1);
    const r = await composeScene({ shots, clips, slides: gfx.slides, captions: gfx.captions, output: path.join(dir, 'out.mp4'), background: '#F7F8FA', preset: 'ultrafast' });
    expect(r.expectedDurationSeconds).toBeCloseTo(9, 2);
    expect(Math.abs(r.durationSeconds - r.expectedDurationSeconds)).toBeLessThan(0.15);
    const p = await ffprobe(r.output);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true, hasVideo: true });
  }, 180_000);
});

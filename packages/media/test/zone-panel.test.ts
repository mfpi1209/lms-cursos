import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ICON_SHAPES, PANEL_SHADE_WIDTH, ZONE_PANEL, buildComposeCommand, composeScene, emphasizeTopic, ffprobe, panelCanvas, renderZonePanelPlan, runFfmpeg, sceneWords, scheduleZonePanel, zonePanelDrift, zonePanelPage,
  type ComposePlan, type ZonePanelPlan,
} from '../src/compose';

const FPS = 25;

/** alinhamento real da cena v05 do C1 (trechos): [palavra, início] */
const V05: Array<[string, number]> = [
  ['Agora,', 0], ['presta', 0.72], ['atenção', 0.96], ['nesta', 1.44], ['frase,', 1.92], ['porque', 2.4], ['ela', 2.64], ['é', 2.747], ['a', 2.8], ['mais', 3.04], ['importante', 3.28], ['do', 3.8], ['módulo:', 3.92],
  ['provável', 4.88], ['não', 5.68], ['é', 5.92], ['o', 6.04], ['mesmo', 6.16], ['que', 6.48], ['verdadeiro.', 6.64], ['A', 7.68], ['IA', 7.84], ['não', 8.32], ['consulta', 8.48], ['a', 9], ['verdade.', 9.12],
  ['Ela', 9.84], ['escreve', 10.08], ['o', 10.44], ['que', 10.52], ['soa', 10.72], ['certo.', 11.12], ['Quase', 11.92], ['sempre', 12.32], ['o', 12.68], ['que', 12.76], ['soa', 12.88], ['certo', 13.28], ['está', 13.68], ['certo.', 14.08],
  ['Quase', 14.8], ['sempre.', 15.2], ['ChatGPT,', 16.08], ['Gemini,', 17.2], ['Claude,', 18.04], ['Copilot:', 18.56], ['os', 19.6], ['nomes', 19.76], ['mudam,', 20], ['a', 20.52], ['empresa', 20.76], ['muda,', 21],
  ['mas', 21.6], ['o', 21.8], ['jeito', 21.92], ['de', 22.2], ['funcionar', 22.32], ['é', 22.84], ['esse.', 22.96], ['Tudo', 23.68], ['o', 23.867], ['que', 23.92], ['você', 24.04], ['aprender', 24.32], ['aqui', 24.68],
  ['vale', 25.04], ['para', 25.36], ['qualquer', 25.52], ['uma', 26], ['delas,', 26.16], ['e', 26.76], ['todas', 26.96], ['têm', 27.32], ['versão', 27.52], ['gratuita.', 27.76],
];
const words = V05.map(([text, start]) => ({ text, start }));
const TOPICS = [
  { text: 'Frase mais importante', cue: 'a mais importante do módulo' }, { text: 'Provável não é verdadeiro', cue: 'provável não é o mesmo' }, { text: 'Não consulta a verdade', cue: 'não consulta a verdade' },
  { text: 'Soa certo, quase sempre acerta', cue: 'Quase sempre o que soa' }, { text: 'Mesmos princípios em todas', cue: 'os nomes mudam' }, { text: 'Versão gratuita em todas', cue: 'todas têm versão gratuita' },
];
const win = { from: 0.6, to: 28.36 };

describe('painel da cena: destaque do tópico', () => {
  it('põe em negrito a palavra de conteúdo mais longa; respeita o negrito do autor; tópico curto fica sem', () => {
    expect(emphasizeTopic('Frase mais importante')).toBe('Frase mais **importante**');
    expect(emphasizeTopic('Provável não é verdadeiro')).toBe('Provável não é **verdadeiro**');
    expect(emphasizeTopic('Soa certo, quase sempre acerta')).toBe('Soa certo, quase sempre **acerta**');
    expect(emphasizeTopic('Mesmos princípios em todas')).toBe('Mesmos **princípios** em todas');
    expect(emphasizeTopic('Regra de ouro: conferir')).toBe('Regra de ouro: **conferir**');
    expect(emphasizeTopic('Onde a **IA** erra')).toBe('Onde a **IA** erra');
    expect(emphasizeTopic('Tutor paciente')).toBe('Tutor paciente');
    expect(emphasizeTopic('Só o que já é')).toBe('Só o que já é');
  });
});

describe('painel da cena: passos no tempo da fala', () => {
  const steps = scheduleZonePanel(TOPICS, words, win, FPS);

  it('cada tópico fica meio aceso a no máximo 0,15 s da palavra do cue (cena real v05, 6 tópicos)', () => {
    const drift = zonePanelDrift(steps);
    expect(drift.map((d) => d.topic)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const d of drift) expect(Math.abs(d.drift)).toBeLessThanOrEqual(0.15);
    const lit = steps.filter((s) => s.topic !== undefined);
    expect(lit.map((s) => s.wordAt)).toEqual([2.8, 4.88, 8.32, 11.92, 19.6, 26.96]);
    // a fusão começa antes da palavra (nunca depois) e termina logo depois dela
    for (const s of lit) {
      expect(s.at).toBeLessThanOrEqual(s.wordAt!);
      expect(s.at + s.fade).toBeGreaterThanOrEqual(s.wordAt!);
    }
  });

  it('páginas de 3: estado inicial, 3 tópicos, troca de página antes do 4º, mais 3', () => {
    expect(steps.map((s) => `${s.page}:${s.lit}`)).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1', '1:2', '1:3']);
    const swap = steps[4]!;
    expect(swap.topic).toBeUndefined();
    expect(swap.fade).toBe(ZONE_PANEL.pageFade);
    // o 3º tópico fica aceso um tempo antes da troca, e a troca acaba antes de o 4º acender
    expect(swap.at).toBeGreaterThanOrEqual(steps[3]!.at + ZONE_PANEL.light + ZONE_PANEL.pageHold);
    expect(swap.at + swap.fade).toBeLessThan(steps[5]!.at);
  });

  it('fusões nunca se sobrepõem e caem na grade de quadros', () => {
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.at).toBeGreaterThan(steps[i - 1]!.at + steps[i - 1]!.fade);
      expect(Math.abs(steps[i]!.at * FPS - Math.round(steps[i]!.at * FPS))).toBeLessThan(1e-6);
    }
    expect(steps[1]!.at).toBeGreaterThanOrEqual(win.from + ZONE_PANEL.fadeIn);
  });

  it('cues colados: o seguinte espera a fusão anterior (ordem mantida)', () => {
    const tight = scheduleZonePanel([{ text: 'A', cue: 'provável não é' }, { text: 'B', cue: 'não é o mesmo' }, { text: 'C', cue: 'mesmo que verdadeiro' }], words, win, FPS);
    const lit = tight.filter((s) => s.topic !== undefined);
    expect(lit).toHaveLength(3);
    expect(lit[1]!.at).toBeGreaterThan(lit[0]!.at + ZONE_PANEL.light);
    expect(lit[2]!.at).toBeGreaterThan(lit[1]!.at + ZONE_PANEL.light);
  });

  it('sem alinhamento: tópicos espalhados pela janela; sem achado: entre os vizinhos', () => {
    const even = scheduleZonePanel(TOPICS.slice(0, 3), undefined, { from: 0.6, to: 12.6 }, FPS).filter((s) => s.topic !== undefined);
    expect(even).toHaveLength(3);
    expect(even.every((s) => s.wordAt === undefined)).toBe(true);
    expect(even[0]!.at).toBeGreaterThan(2);
    expect(even[2]!.at).toBeLessThan(11);
    const mixed = scheduleZonePanel([TOPICS[0]!, { text: 'Zebra xilofone' }, TOPICS[2]!], words, win, FPS).filter((s) => s.topic !== undefined);
    expect(mixed[1]!.wordAt).toBeUndefined();
    expect(mixed[1]!.at).toBeGreaterThan(mixed[0]!.at);
    expect(mixed[1]!.at).toBeLessThan(mixed[2]!.at);
  });

  it('sem tópicos: só o estado inicial; mais de 6: os 6 primeiros; janela curta: os que cabem', () => {
    expect(scheduleZonePanel([], words, win, FPS)).toEqual([{ page: 0, lit: 0, at: 0.6, fade: 0 }]);
    const many = scheduleZonePanel(Array.from({ length: 9 }, (_, i) => ({ text: `Tópico ${i}` })), undefined, { from: 0.6, to: 40 }, FPS);
    expect(many.filter((s) => s.topic !== undefined)).toHaveLength(ZONE_PANEL.maxTopics);
    const short = scheduleZonePanel(TOPICS, undefined, { from: 0.6, to: 2.4 }, FPS).filter((s) => s.topic !== undefined);
    expect(short.length).toBeLessThan(6);
    expect(short.every((s) => s.at <= 2.4 - ZONE_PANEL.tailRoom + 1e-6)).toBe(true);
  });
});

describe('palavras da cena a partir das palavras por plano', () => {
  it('planos fundidos num clipe só: cada palavra entra uma vez (o cue volta a ser contíguo)', () => {
    // dois planos do mesmo clipe: o 1º recebe TODAS as palavras, o 2º as dele (como o worker entrega)
    const all = [{ text: 'e', start: 3.2 }, { text: 'todas', start: 3.4 }, { text: 'têm', start: 4.1 }, { text: 'versão', start: 4.3 }, { text: 'gratuita.', start: 4.6 }];
    const per = new Map([['s1', all], ['s2', all.map((w) => ({ text: w.text, start: Number((w.start - 4).toFixed(3)) })).filter((w) => w.start >= -0.05)]]);
    const timeline = [{ id: 's1', start: 0, duration: 4, audioDelay: 0 }, { id: 's2', start: 4, duration: 2, audioDelay: 0 }];
    const scene = sceneWords(timeline, per);
    expect(scene.map((w) => w.text)).toEqual(['e', 'todas', 'têm', 'versão', 'gratuita.']);
    expect(scene.map((w) => w.start)).toEqual([3.2, 3.4, 4.1, 4.3, 4.6]);
    const lit = scheduleZonePanel([{ text: 'Versão gratuita em todas', cue: 'todas têm versão gratuita' }], scene, { from: 0.6, to: 6 }, FPS)[1]!;
    expect(lit.wordAt).toBe(3.4);
  });

  it('desconta o aperto do começo do plano e soma o início dele na cena', () => {
    const scene = sceneWords([{ id: 'a', start: 0, duration: 3, audioDelay: 0 }, { id: 'b', start: 3, duration: 3, audioDelay: 0.2 }], new Map([['a', [{ text: 'um', start: 1 }]], ['b', [{ text: 'dois', start: 0.5 }]]]), new Map([['b', 0.3]]));
    expect(scene).toEqual([{ text: 'um', start: 1 }, { text: 'dois', start: 3.4 }]);
  });
});

describe('painel da cena: desenho (o painel aprovado, no lado livre)', () => {
  it('a camada é só a faixa da sombra, encostada no lado do painel', () => {
    expect(PANEL_SHADE_WIDTH).toBe(0.48);
    expect(panelCanvas({ width: 1920, height: 1080, side: 'left', clip: true })).toEqual({ x: 0, y: 0, w: 922, h: 1080 });
    expect(panelCanvas({ width: 1920, height: 1080, side: 'right', clip: true })).toEqual({ x: 998, y: 0, w: 922, h: 1080 });
    expect(panelCanvas({ width: 1920, height: 1080 })).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('página = até 3 tópicos com negrito de destaque e ícone (padrão `check`); todo ícone tem desenho', () => {
    const spec = { eyebrow: 'Aula 2 · Como a IA funciona', title: 'Provável não é o mesmo que verdadeiro.', topics: TOPICS.map((t, i) => ({ ...t, ...(i === 5 ? { icon: 'gift' } : {}) })) };
    expect(zonePanelPage(spec, 0).bullets).toEqual(['Frase mais **importante**', 'Provável não é **verdadeiro**', 'Não **consulta** a verdade']);
    const p2 = zonePanelPage(spec, 1);
    expect(p2.bullets).toHaveLength(3);
    expect(p2.icons).toEqual(['check', 'check', 'gift']);
    expect(p2.eyebrow).toBe('Aula 2 · Como a IA funciona');
    expect(zonePanelPage(spec, 1, 4).bullets).toHaveLength(1);
    for (const name of ['sparkles', 'alert', 'shield', 'lightbulb', 'pencil', 'gift', 'help', 'list', 'eye', 'zap', 'target', 'repeat', 'check']) expect(ICON_SHAPES[name]?.length).toBeGreaterThan(0);
  });

  it('desenha um PNG por estado (espelhado à direita), reaproveitando estados iguais', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-zone-panel-'));
    const steps = scheduleZonePanel(TOPICS, words, win, FPS);
    const plan = await renderZonePanelPlan(dir, { eyebrow: 'Aula 2 · Como a IA funciona', title: 'Provável não é o mesmo que verdadeiro.', topics: TOPICS }, steps, { width: 960, height: 540, side: 'right' });
    expect(plan).toMatchObject({ x: 498, y: 0, w: 462, h: 540, side: 'right' });
    expect(plan.states).toHaveLength(8);
    expect(new Set(plan.states.map((s) => s.path)).size).toBe(8);
    for (const s of plan.states) {
      const png = readFileSync(s.path);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([462, 540]);
    }
    expect(plan.states.map((s) => s.at)).toEqual(steps.map((s) => s.at));
  }, 60_000);
});

describe('montagem: filtergraph do painel da cena', () => {
  const plan = (extra: Partial<ComposePlan>): ComposePlan => ({
    width: 1920, height: 1080, fps: 25, background: '#000000',
    shots: [{ id: 's0', layout: 'presenter', framing: 'medium', nativeFraming: 'medium', move: 'static', transition: 'cut', duration: 20, clip: { path: '/c.mp4', width: 1920, height: 1080, hasAudio: true } }],
    ...extra,
  });
  const zp: ZonePanelPlan = { x: 998, y: 0, w: 922, h: 1080, side: 'right', states: [{ path: '/p0.png', at: 0.6, fade: 0 }, { path: '/p1.png', at: 4, fade: 0.2 }, { path: '/p2.png', at: 9, fade: 0.35 }] };

  it('estados encadeados com fusões numa camada só, sobreposta na faixa do painel; entra com fade', () => {
    const cmd = buildComposeCommand(plan({ zonePanel: zp }));
    expect(cmd.overlays.screenText).toEqual({ from: 0.6, to: 20 });
    expect(cmd.filterComplex).toContain('xfade=transition=fade:duration=0.200:offset=3.400');
    expect(cmd.filterComplex).toContain('xfade=transition=fade:duration=0.350:offset=8.400');
    expect(cmd.filterComplex.match(/xfade=transition=fade/g)).toHaveLength(2);
    expect(cmd.filterComplex).toContain('fade=t=in:st=0:d=0.350:alpha=1');
    expect(cmd.filterComplex).toContain("overlay=x=998:y=0:format=auto:eof_action=pass:enable='between(t,0.600,20.000)'");
    // cada estado só dura até o fim da fusão seguinte (não a cena inteira)
    const args = cmd.inputArgs.join(' ');
    expect(args).toContain('-t 3.680 -i /p0.png');
    expect(args).toContain('-t 5.430 -i /p1.png');
    expect(args).toContain('-t 11.080 -i /p2.png');
    expect(cmd.filterComplex).not.toContain('[zpm]');
  });

  it('some antes da pergunta a seguir; repõe a marca d\'água por cima da sombra quando pedida; sem plano, nada', () => {
    const withTeaser = buildComposeCommand(plan({ zonePanel: { ...zp, watermarkPath: '/wm.png' }, teaser: { path: '/tz.png', x: 1, y: 1, w: 1, h: 1 } }));
    expect(withTeaser.overlays.screenText!.to).toBeCloseTo(16.9, 2);
    expect(withTeaser.filterComplex).toContain('fade=t=out');
    expect(withTeaser.filterComplex).toContain('[zpm]overlay=0:0');
    expect(withTeaser.inputArgs.join(' ')).toContain('-i /wm.png');
    expect(buildComposeCommand(plan({})).overlays.screenText).toBeUndefined();
  });
});

describe('montagem real curta: painel da cena num vídeo sintético', () => {
  /** luminância média da faixa dos tópicos no instante `t` */
  const luma = async (video: string, t: number, crop: string) => {
    const { stderr } = await runFfmpeg(['-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-vf', `${crop},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-f', 'null', '-'], { loglevel: 'info' });
    return Number(/YAVG=([\d.]+)/.exec(stderr)?.[1]);
  };

  it('painel espelhado à direita (apresentador à esquerda): escurece a parede livre e cada tópico acende na sua hora', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-zone-panel-real-'));
    const clip = path.join(dir, 'presenter.mp4');
    // parede bege com o "apresentador" (bloco escuro) à esquerda; 12 s com tom
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xE9E0D2:s=960x540:r=25:d=12', '-f', 'lavfi', '-i', 'sine=f=220:d=12', '-vf', 'drawbox=x=90:y=80:w=260:h=460:color=0x3A3A4A:t=fill', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
    const speech = 'Hoje vamos ver onde ela erra. Erra com fatos muito recentes do mundo. Erra com contas mais longas também. Erra com fontes inventadas que parecem reais. E inventa citações falsas de pessoas.'.split(' ').map((w, i) => ({ text: w, start: Number((0.8 + i * 0.3).toFixed(3)) }));
    const topics = [{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Contas longas', cue: 'contas mais longas' }, { text: 'Fontes inventadas', cue: 'fontes inventadas' }, { text: 'Citações falsas', cue: 'citações falsas' }];
    const out = path.join(dir, 'cena.mp4');
    const r = await composeScene({
      shots: [{ id: 's0', line: 'x', layout: 'presenter', framing: 'wide', cameraMove: 'static', transitionIn: 'cut' } as never],
      clips: new Map([['s0', { videoPath: clip, zone: 'left' as const }]]),
      output: out, width: 960, height: 540, preset: 'ultrafast', loudnorm: false, joins: false,
      screenText: 'Onde ela erra', screenEyebrow: 'Aula 3 · Caça-alucinação', screenTopics: { topics, words: new Map([['s0', speech]]) },
    });
    expect(r.overlays.screenText?.from).toBe(0.6);
    expect(existsSync(path.join(dir, 'zone-panel', 'zone-panel-1-1.png'))).toBe(true);
    expect((await ffprobe(out)).durationSeconds).toBeGreaterThan(11);
    const steps = r.zonePanel!;
    expect(steps.map((s) => `${s.page}:${s.lit}`)).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1']);
    for (const d of zonePanelDrift(steps)) expect(Math.abs(d.drift)).toBeLessThanOrEqual(0.15);
    // a parede livre (direita) escurece com a sombra; o lado do apresentador fica intacto
    const right = 'crop=120:300:820:200';
    expect(await luma(out, 0.2, right)).toBeGreaterThan(180);
    expect(await luma(out, 1.6, right)).toBeLessThan(60);
    expect(await luma(out, 1.6, 'crop=60:60:10:10')).toBeGreaterThan(180);
    // cada tópico da 1ª página: a faixa da lista fica mais clara depois de aceso
    const list = 'crop=330:300:590:160';
    for (const s of steps.filter((x) => x.topic !== undefined && x.page === 0)) {
      const before = await luma(out, s.at - 0.08, list);
      const after = await luma(out, s.at + s.fade + 0.08, list);
      expect(after).toBeGreaterThan(before + 0.3);
    }
  }, 120_000);
});

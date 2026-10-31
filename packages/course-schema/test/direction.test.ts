import { describe, expect, it } from 'vitest';
import { BrandingSchema, clampFullFrameShots, clampShotToNativeFraming, DirectionStyleSchema, isCardLayout, LAYOUTS, panelIconFor, SceneDirectionSchema, ShotSchema, shotIsCinematic } from '../src';

describe('direção: cena em movimento (layout cinematic)', () => {
  it('dados antigos continuam válidos (sem cinematic, estilo sem maxCinematicPerLesson)', () => {
    const old = { version: 1, intent: 'x', source: 'ai', shots: [{ id: 's1', line: 'Olá.', framing: 'close', layout: 'lower_third', caption: 'Ana', cameraMove: 'drift', transitionIn: 'crossfade' }, { id: 's2', line: 'Tchau.' }] };
    const d = SceneDirectionSchema.parse(old);
    expect(d.shots[0]).not.toHaveProperty('cinematic');
    expect(d.shots[1]).toMatchObject({ layout: 'presenter', framing: 'medium' });
    // novos campos (câmera única, cartões, gestos) nascem com padrão: dados antigos continuam válidos
    expect(DirectionStyleSchema.parse({ pace: 'calm', useSlides: false, slideAccent: '#112233' })).toEqual({ pace: 'calm', useSlides: false, slideAccent: '#112233', maxCinematicPerLesson: 2, matchCinematicSetting: true, cameraMode: 'single', cardsPerMinute: 2, gestures: 'natural' });
    expect(DirectionStyleSchema.parse({ matchCinematicSetting: false }).matchCinematicSetting).toBe(false);
    expect(DirectionStyleSchema.parse({}).maxCinematicPerLesson).toBe(2);
  });

  it('aceita o layout cinematic com pedido e rótulo; limites de tamanho e do estilo', () => {
    expect(LAYOUTS).toContain('cinematic');
    const s = ShotSchema.parse({ id: 's1', line: 'Terça, dez horas, você chega ao prédio.', layout: 'cinematic', cinematic: { prompt: 'Walks to the building; tracking shot.', setting: 'Chegando ao prédio' } });
    expect(shotIsCinematic(s)).toBe(true);
    // rascunho em edição: pedido vazio é aceito, mas não conta como cena em movimento pronta
    const empty = ShotSchema.parse({ id: 's2', line: 'x', layout: 'cinematic', cinematic: {} });
    expect(empty.cinematic).toEqual({ prompt: '' });
    expect(shotIsCinematic(empty)).toBe(false);
    expect(shotIsCinematic({ layout: 'presenter', cinematic: { prompt: 'x' } })).toBe(false);
    expect(ShotSchema.safeParse({ id: 's', line: 'x', layout: 'cinematic', cinematic: { prompt: 'a'.repeat(601) } }).success).toBe(false);
    expect(ShotSchema.safeParse({ id: 's', line: 'x', layout: 'cinematic', cinematic: { prompt: 'a', setting: 'b'.repeat(201) } }).success).toBe(false);
    expect(DirectionStyleSchema.safeParse({ maxCinematicPerLesson: 7 }).success).toBe(false);
    expect(DirectionStyleSchema.safeParse({ maxCinematicPerLesson: 0 }).success).toBe(true);
  });
});

import { buildCinematicPrompt, CINEMATIC_ACTIONS, CINEMATIC_MIN_SECONDS_BY_ACTION, CINEMATIC_PROMPT_VERSION, cinematicClipSeconds, cinematicSteps, gestureKey, isHandSignGesture, presenterWords, SAFE_GESTURES, sameWords, spokenWords } from '../src/direction';
import { MediaRefSchema, PresentationSchema } from '../src';

describe('buildCinematicPrompt', () => {
  it('monta um pedido assertivo: ação primeiro, ≈ passos, início/fim, câmera e ritmo da ação', () => {
    const p = buildCinematicPrompt({ action: 'walk_toward_camera', details: 'a bright office corridor; morning light.', durationSeconds: 6 });
    expect(p.startsWith('MAIN ACTION (the whole 6 seconds): the presenter WALKS STRAIGHT TOWARD THE CAMERA.')).toBe(true);
    // 1 s vazio: 5 s caminhando × 1,6 = 8 passos
    expect(p).toMatch(/Walking: about 8 steps in about 5 seconds, calm, steady walking pace/);
    expect(p).toMatch(/Start: .*End: /);
    expect(p).toMatch(/Setting: a bright office corridor; morning light\./);
    expect(p).toMatch(/Camera: static camera at eye level, locked off, no camera movement; she grows larger in the frame while approaching/);
    expect(p).not.toMatch(/meters|dolly|at least \d+ steps/);
    expect(p).not.toMatch(/looks briefly into the lens|takes a breath/);
    expect(p).toMatch(/glances at the lens, lips closed/);
  });
  it('sem ação usa "atravessa o quadro" e limita a duração a 4–15 s', () => {
    expect(buildCinematicPrompt({ details: '', durationSeconds: 40 })).toMatch(/the whole 15 seconds\): the presenter WALKS ACROSS THE FRAME/);
    expect(buildCinematicPrompt({ details: '', durationSeconds: 1 })).toMatch(/the whole 4 seconds/);
    // passos limitados (no máximo 20)
    expect(buildCinematicPrompt({ details: '', durationSeconds: 15 })).toMatch(/about 20 steps in about 14 seconds/);
  });
  it('toda ação abre no lugar VAZIO no primeiro segundo e tem câmera própria', () => {
    const cams: Record<string, RegExp> = {
      walk_toward_camera: /static camera at eye level/,
      walk_across: /static wide camera at eye level, locked off, showing her whole path/,
      walk_away: /static camera at shoulder height[^;]*; she gets smaller/,
      walk_in_and_sit: /static medium-wide camera at eye level, locked off, with the desk and the chair fully visible/,
      walk_and_look_around: /slow lateral tracking shot alongside her/,
    };
    for (const action of CINEMATIC_ACTIONS) {
      const p = buildCinematicPrompt({ action, details: 'a tidy home office', durationSeconds: 8 });
      expect(p).toMatch(/Start: The shot opens on the EMPTY setting for the first second \(no person anywhere in frame\); then she steps/);
      expect(p).toMatch(cams[action]!);
      // nenhuma linha compartilhada contradiz a câmera (sem "medium-wide full-body framing" genérico nem ritmo "confident")
      expect(p).not.toMatch(/full-body framing from head to feet|steady confident pace|dolly|steadicam/);
    }
    expect(buildCinematicPrompt({ action: 'walk_away', details: '', durationSeconds: 6 })).toMatch(/then she steps in from behind the camera, back to the lens/);
    expect(buildCinematicPrompt({ action: 'walk_toward_camera', details: '', durationSeconds: 6 })).toMatch(/then she steps into view at the far end/);
    // entrar e sentar: cadeira já puxada, senta e fica parada no último segundo; metade do tempo caminhando
    const sit = buildCinematicPrompt({ action: 'walk_in_and_sit', details: '', durationSeconds: 8 });
    expect(sit).toMatch(/the chair is already pulled out/);
    expect(sit).toMatch(/sits down on the chair at the desk/);
    expect(sit).toMatch(/stays seated, still, lips closed for the last second/);
    expect(sit).toMatch(/about 6 steps in about 4 seconds/);
    expect(buildCinematicPrompt({ action: 'walk_and_look_around', details: '', durationSeconds: 6 })).toMatch(/pauses, relaxed, lips closed/);
  });
  it('pronome do apresentador: she / he / they (neutro)', () => {
    const he = buildCinematicPrompt({ action: 'walk_away', details: '', durationSeconds: 6, pronoun: 'he' });
    expect(he).toMatch(/then he steps in from behind the camera/);
    expect(he).toMatch(/puts his hand on the handle/);
    expect(he).not.toMatch(/\b(she|her)\b/);
    const they = buildCinematicPrompt({ action: 'walk_across', details: '', durationSeconds: 6, pronoun: 'they' });
    expect(they).toMatch(/then the presenter steps into view/);
    expect(they).toMatch(/showing their whole path/);
    expect(they).not.toMatch(/\b(she|her|he|his)\b/);
    expect(presenterWords('they').poss).toBe('their');
    expect(CINEMATIC_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(PresentationSchema.parse({}).presenterPronoun).toBe('she');
    expect(PresentationSchema.parse({ presenterPronoun: 'he' }).presenterPronoun).toBe('he');
    expect(PresentationSchema.safeParse({ presenterPronoun: 'it' }).success).toBe(false);
  });
});

describe('duração da cena em movimento por ação', () => {
  it('mínimos por ação (≤ 15 s) e a fala pode ser mais curta que a imagem', () => {
    expect(CINEMATIC_MIN_SECONDS_BY_ACTION).toEqual({ walk_in_and_sit: 8, walk_toward_camera: 6, walk_away: 6, walk_across: 5, walk_and_look_around: 5 });
    for (const a of CINEMATIC_ACTIONS) expect(CINEMATIC_MIN_SECONDS_BY_ACTION[a]).toBeLessThanOrEqual(15);
    // fala curta: vale o mínimo da ação
    expect(cinematicClipSeconds('walk_in_and_sit', 2.1)).toBe(8);
    expect(cinematicClipSeconds('walk_toward_camera', 1.5)).toBe(6);
    expect(cinematicClipSeconds('walk_across', 0)).toBe(5);
    expect(cinematicClipSeconds(undefined, 1)).toBe(5); // sem ação = walk_across
    // fala longa: trecho + 0,5 s, para cima, até 15 s
    expect(cinematicClipSeconds('walk_in_and_sit', 7.6)).toBe(9);
    expect(cinematicClipSeconds('walk_across', 9.2)).toBe(10);
    expect(cinematicClipSeconds('walk_away', 40)).toBe(15);
    expect(cinematicClipSeconds('walk_away', Number.NaN)).toBe(6);
    expect(cinematicSteps(0.5)).toBe(3);
    expect(cinematicSteps(100)).toBe(20);
  });
});

describe('ids de plano', () => {
  it('normaliza ids antigos (caracteres, vazios e repetidos) em vez de rejeitar', () => {
    const d = SceneDirectionSchema.parse({ shots: [{ id: 'plano 1', line: 'a' }, { id: 's1', line: 'b' }, { id: 's1', line: 'c' }, { id: '', line: 'd' }] });
    expect(d.shots.map((s) => s.id)).toEqual(['plano_1', 's1', 's1_2', 's4']);
    const ok = { version: 1, intent: '', source: 'ai', shots: [{ id: 's1', line: 'a' }, { id: 's2', line: 'b' }] };
    expect(SceneDirectionSchema.parse(ok).shots.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(ShotSchema.safeParse({ id: 'com espaço', line: 'x' }).success).toBe(false);
  });
});

describe('falas por palavras e gestos', () => {
  it('sameWords ignora pontuação, aspas e caixa', () => {
    expect(spokenWords('Ela disse: “Sim!”… Ok?')).toEqual(['ela', 'disse', 'sim', 'ok']);
    expect(sameWords('Terça, dez horas.', 'terça dez horas')).toBe(true);
    expect(sameWords('Terça, dez horas.', 'Terça, às dez horas.')).toBe(false);
  });
  it('gestos com dedos/sinais são detectados; o vocabulário seguro não tem nenhum', () => {
    for (const g of ['counts on fingers, focused', 'points at the camera', 'gives a thumbs up', 'waves hello', 'raises one hand, excited', 'makes a v-sign']) expect(isHandSignGesture(g)).toBe(true);
    expect(isHandSignGesture('nods slowly, warm')).toBe(false);
    expect(SAFE_GESTURES.length).toBeGreaterThanOrEqual(15);
    for (const g of SAFE_GESTURES) expect(isHandSignGesture(g.prompt)).toBe(false);
    expect(new Set(SAFE_GESTURES.map((g) => gestureKey(g.prompt))).size).toBe(SAFE_GESTURES.length);
  });
  it('mídia aceita legendas WebVTT opcionais (compatível com dados antigos)', () => {
    expect(MediaRefSchema.parse({ assetId: 'a', kind: 'video' })).not.toHaveProperty('captions');
    expect(MediaRefSchema.parse({ assetId: 'a', kind: 'video', captions: { assetId: 'vtt1' } }).captions).toEqual({ assetId: 'vtt1', lang: 'pt-BR', format: 'vtt' });
    expect(MediaRefSchema.safeParse({ assetId: 'a', kind: 'video', captions: { assetId: 'v', format: 'srt' } }).success).toBe(false);
    expect(MediaRefSchema.parse({ assetId: 'a', kind: 'video', captions: { assetId: 'v', approx: true } }).captions?.approx).toBe(true);
  });
});

describe('câmera em tela cheia: sem zoom digital', () => {
  const pres = { presenterPlacement: 'right' };
  const ff = { placement: 'full_frame' as const, nativeFraming: 'medium' as const };
  const right = { placement: 'inherit' as const, nativeFraming: 'medium' as const };
  it('enquadramento mais fechado vira o nativo e movimento vira static; o resto fica intacto (mesmo objeto)', () => {
    const a = { id: 's1', framing: 'close' as const, cameraMove: 'push_in' as const, layout: 'presenter' as const };
    const b = { id: 's2', framing: 'medium' as const, cameraMove: 'static' as const, layout: 'presenter' as const };
    const c = { id: 's3', framing: 'wide' as const, cameraMove: 'static' as const, layout: 'presenter' as const };
    expect(clampShotToNativeFraming(a, 'medium')).toEqual({ ...a, framing: 'medium', cameraMove: 'static' });
    expect(clampShotToNativeFraming(b, 'medium')).toBe(b);
    expect(clampShotToNativeFraming(c, 'medium')).toBe(c);
    const card = { id: 's4', framing: 'close' as const, cameraMove: 'drift' as const, layout: 'card' as const };
    expect(clampShotToNativeFraming(card, 'medium')).toBe(card);
  });
  it('clampFullFrameShots só mexe nos planos numa câmera full_frame', () => {
    const shots = [
      { id: 's1', cameraId: 'ff', framing: 'close' as const, cameraMove: 'static' as const, layout: 'presenter' as const },
      { id: 's2', cameraId: 'rt', framing: 'close' as const, cameraMove: 'push_in' as const, layout: 'presenter' as const },
      { id: 's3', cameraId: 'ff', framing: 'medium' as const, cameraMove: 'pan_left' as const, layout: 'lower_third' as const },
    ];
    const r = clampFullFrameShots(shots, pres, (s) => (s.cameraId === 'ff' ? ff : right));
    expect(r.adjusted).toEqual(['s1', 's3']);
    expect(r.shots[0]).toMatchObject({ framing: 'medium', cameraMove: 'static' });
    expect(r.shots[1]).toBe(shots[1]);
    expect(r.shots[2]).toMatchObject({ framing: 'medium', cameraMove: 'static' });
  });
  it('ícones do painel por palavra-chave (pt-BR), explícito e padrão', () => {
    expect(panelIconFor('Ajudar no **negócio da família**')).toBe('house');
    expect(panelIconFor('Organizar **eventos** e trabalhos da escola')).toBe('calendar');
    expect(panelIconFor('**Voluntariado**, esporte e **cursos online**')).toBe('heart');
    expect(panelIconFor('Atualize o **currículo**')).toBe('file');
    expect(panelIconFor('Chegue **dez minutos antes**')).toBe('clock');
    expect(panelIconFor('Algo sem relação')).toBe('check');
    expect(panelIconFor('Algo sem relação', 'star')).toBe('star');
  });
  it('isCardLayout: card e presenter_panel; branding.watermark aditivo', () => {
    expect(isCardLayout('card') && isCardLayout('presenter_panel') && !isCardLayout('presenter')).toBe(true);
    expect(BrandingSchema.parse({}).watermark).toBeUndefined();
    expect(BrandingSchema.parse({ watermark: { enabled: false } }).watermark).toEqual({ enabled: false, position: 'bottom-right' });
  });
});

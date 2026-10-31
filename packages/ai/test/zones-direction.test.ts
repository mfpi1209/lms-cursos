import { describe, expect, it } from 'vitest';
import { CameraSchema, SceneDirectionSchema, zoneCamerasOf } from '@lms/course-schema';
import {
  CHIPS_ON_CENTER_CAMERA, CHIPS_SIDE_REPEAT, CUT_MID_SENTENCE, DIRECTOR_PROMPT_VERSION, VIDEO_CAPABILITIES_VERSION, applyZoneRules, buildDirectionInput, cameraStyleLines, createTemplateFakeAdapter, directScenes, directionPatternLine,
  lastChipsZoneOf, validateDirectionScene, videoCapabilitiesText, type DirectScenesArgs, type DirectionShotProposal, type DirectionTarget,
} from '../src';
import { TASK_DIRECTION } from '../src/prompts';

const cam = (id: string, zone?: 'left' | 'right' | 'center') => CameraSchema.parse({ id, name: id, lookId: `look_${id}`, placement: 'full_frame', nativeFraming: 'medium', ...(zone ? { zone } : {}) });
const cameras = [cam('cam_estudio_34', 'center'), cam('cam_estudio_esq', 'left'), cam('cam_estudio_dir', 'right')];
const zones = zoneCamerasOf(cameras)!;

const shot = (over: Partial<DirectionShotProposal> = {}): DirectionShotProposal => ({
  id: 's1', line: 'Olá.', cameraId: null, framing: 'medium', layout: 'presenter', cameraMove: 'static', motionPrompt: 'nods slowly, warm', slide: null, caption: null, transitionIn: 'cut', cinematic: null, ...over,
});
const chipsSlide = { title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos da escola**'], highlight: null, style: 'checklist' as const, variant: null };
const shotSlide = { title: chipsSlide.title, bullets: chipsSlide.bullets, style: 'checklist' as const };
const LIST = 'Ajudar no negócio da família, organizar eventos da escola e cuidar do time do bairro contam muito.';
const target: DirectionTarget = { nodeId: 'v1', type: 'content', title: 'Experiência', narration: `Muita gente acha que não tem experiência nenhuma. ${LIST} Pense nisso hoje.`, screenText: '', hasNarration: true };

describe('estúdio com zonas: validação', () => {
  it('câmeras de zona valem em câmera única; pílulas exigem zonas (senão CHIPS_WITHOUT_ZONES); até 4 pílulas', () => {
    const scene = {
      nodeId: 'v1', intent: 'x', shots: [
        shot({ id: 's1', line: 'Muita gente acha que não tem experiência nenhuma.', cameraId: 'cam_estudio_34' }),
        shot({ id: 's2', line: LIST, cameraId: 'cam_estudio_esq', layout: 'presenter_chips', slide: { ...chipsSlide, bullets: [...chipsSlide.bullets, '**Time** do bairro', '**Cursos** online'] }, motionPrompt: 'opens both palms, honest' }),
        shot({ id: 's3', line: 'Pense nisso hoje.', cameraId: 'cam_estudio_34' }),
      ],
    };
    expect(validateDirectionScene(scene, target, cameras, { cameraMode: 'single', zones })).toEqual([]);
    const off = validateDirectionScene(scene, target, cameras, { cameraMode: 'single' });
    expect(off.some((p) => p.startsWith('CHIPS_WITHOUT_ZONES'))).toBe(true);
    expect(off.some((p) => p.startsWith('CAMERA_SWITCH_IN_SINGLE_MODE'))).toBe(true);
    const five = { ...scene, shots: scene.shots.map((s) => (s.id === 's2' ? { ...s, slide: { ...chipsSlide, bullets: ['**a** um', '**b** dois', '**c** três', '**d** quatro', '**e** cinco'] } } : s)) };
    expect(validateDirectionScene(five, target, cameras, { cameraMode: 'single', zones }).some((p) => p.startsWith('CARD_TOO_MANY_BULLETS'))).toBe(true);
  });

  it('applyZoneRules: pílulas na 3/4 vão para a lateral; mesmo lado das anteriores troca; corte no meio da frase avisa', () => {
    const d = SceneDirectionSchema.parse({ version: 1, shots: [
      { id: 's1', line: 'Primeira parte da frase,', cameraId: 'cam_estudio_34', layout: 'presenter' },
      { id: 's2', line: 'continua na lateral com a lista.', cameraId: 'cam_estudio_esq', layout: 'presenter_chips', slide: shotSlide },
      { id: 's3', line: 'Agora outra lista com muitos itens.', cameraId: 'cam_estudio_esq', layout: 'presenter_chips', slide: shotSlide },
      { id: 's4', line: 'E uma terceira.', cameraId: 'cam_estudio_34', layout: 'presenter_chips', slide: shotSlide },
    ] });
    const r = applyZoneRules(d, cameras, zones, 'right');
    expect(r.direction.shots.map((s) => s.cameraId)).toEqual(['cam_estudio_34', 'cam_estudio_esq', 'cam_estudio_dir', 'cam_estudio_esq']);
    const codes = r.warnings.map((w) => `${w.shotId}:${w.message.split(':')[0]}`);
    expect(codes).toContain(`s3:${CHIPS_SIDE_REPEAT}`);
    expect(codes).toContain(`s4:${CHIPS_ON_CENTER_CAMERA}`);
    expect(codes).toContain(`s2:${CUT_MID_SENTENCE}`);
    expect(r.lastChipsZone).toBe('left');
    // a cena anterior terminou com pílulas à esquerda: as primeiras desta cena do mesmo lado trocam
    expect(applyZoneRules(SceneDirectionSchema.parse({ version: 1, shots: [{ id: 'a', line: 'Lista.', cameraId: 'cam_estudio_esq', layout: 'presenter_chips', slide: shotSlide }] }), cameras, zones, 'left').direction.shots[0]!.cameraId).toBe('cam_estudio_dir');
    // sem nada a corrigir: o mesmo objeto (hash estável)
    const ok = SceneDirectionSchema.parse({ version: 1, shots: [{ id: 'a', line: 'Lista.', cameraId: 'cam_estudio_dir', layout: 'presenter_chips', slide: shotSlide }] });
    expect(applyZoneRules(ok, cameras, zones, 'left').direction).toBe(ok);
    expect(lastChipsZoneOf(r.direction.shots, cameras)).toBe('left');
  });
});

describe('estúdio com zonas: diretor e modelo de demonstração', () => {
  it('prompt: regra 19, versão nova; <cameras> com zona; <estilo> diz "estúdio com zonas"; capacidades com pílulas só com zonas', () => {
    expect(DIRECTOR_PROMPT_VERSION).toBe('2026-10-29.3');
    expect(VIDEO_CAPABILITIES_VERSION).toBe('2026-10-29.3');
    expect(TASK_DIRECTION).toMatch(/19\. Estúdio com zonas/);
    expect(TASK_DIRECTION).toMatch(/CHIPS_SIDE_REPEAT/);
    expect(cameraStyleLines({ cameraMode: 'single', useSlides: true }, true)).toMatch(/câmera: estúdio com zonas/);
    expect(cameraStyleLines({ cameraMode: 'single', useSlides: true })).toMatch(/câmera: única/);
    expect(videoCapabilitiesText({ cameraCount: 3, zones: true })).toMatch(/presenter_chips/);
    expect(videoCapabilitiesText({ cameraCount: 3 })).not.toMatch(/presenter_chips/);
    const input = buildDirectionInput({ course: { title: 'C' }, lesson: { id: 'l', title: 'L' }, scenes: [target], cameras, style: { pace: 'balanced', useSlides: true }, capabilities: 'x' });
    expect(input).toMatch(/id: cam_estudio_esq .*\| zona left \(apresentadora à esquerda\)/);
    expect(directionPatternLine({ nodeId: 'a', direction: { shots: [{ id: 's', line: 'x', cameraId: 'cam_estudio_dir', layout: 'presenter_chips', framing: 'medium', cameraMove: 'static', transitionIn: 'cut' }] } }, cameras)).toMatch(/últimas pílulas: zona right/);
  });

  it('directScenes com o modelo de demonstração: fala na câmera da cena, pílulas alternando o lado entre as cenas, sem avisos de correção', async () => {
    const scenes: DirectionTarget[] = [0, 1, 2].map((i) => ({
      nodeId: `v${i}`, type: 'content', title: `Cena ${i}`, position: i,
      narration: `Hoje a gente fala de um ponto importante. Você já fez mais do que imagina na vida. ${LIST} Isso mostra responsabilidade de verdade.`, screenText: '', hasNarration: true,
    }));
    const args: DirectScenesArgs = { course: { title: 'C' }, lesson: { id: 'l', title: 'L' }, scenes, cameras, style: { pace: 'balanced', useSlides: true, cameraMode: 'single', gestures: 'natural' }, capabilities: videoCapabilitiesText({ cameraCount: 3, zones: true }) };
    const r = await directScenes({ primary: createTemplateFakeAdapter() }, args);
    expect(r.errors).toEqual([]);
    const chips = r.scenes.map((s) => s.direction.shots.find((x) => x.layout === 'presenter_chips'));
    expect(chips.map((c) => c?.cameraId)).toEqual(['cam_estudio_esq', 'cam_estudio_dir', 'cam_estudio_esq']);
    expect(chips[0]!.slide!.bullets.every((b) => /\*\*/.test(b))).toBe(true);
    // fala: 3/4 na cena 0 e 2, lateral esquerda na cena 1
    const talk = r.scenes.map((s) => [...new Set(s.direction.shots.filter((x) => x.layout === 'presenter').map((x) => x.cameraId))]);
    expect(talk).toEqual([['cam_estudio_34'], ['cam_estudio_esq'], ['cam_estudio_34']]);
    expect(r.warnings.filter((w) => /CHIPS_|CUT_MID_SENTENCE/.test(w.message))).toEqual([]);
    // sem zonas no kit: painel como antes
    const plain = await directScenes({ primary: createTemplateFakeAdapter() }, { ...args, cameras: [cam('cam_principal')], capabilities: videoCapabilitiesText({ cameraCount: 1 }) });
    expect(plain.scenes.flatMap((s) => s.direction.shots).some((x) => x.layout === 'presenter_chips')).toBe(false);
    expect(plain.scenes.flatMap((s) => s.direction.shots).some((x) => x.layout === 'presenter_panel')).toBe(true);
  });
});

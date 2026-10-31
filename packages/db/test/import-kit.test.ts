import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING, DEFAULT_KITS, DEFAULT_STUDIOS, DEFAULT_VOICES, DIRECTION_ZONES, emptyCourseDocument, PresenterTemplateDataSchema, type ResolvedKit } from '@lms/course-schema';
import { optionsFromKit, parseArgs } from '../src/scripts/import-markdown-course';
import { presenterFromDocument, PRESENTER_SOURCES } from '../src/scripts/biblioteca-modelos';

/* Importador com --kit e extração de instrutor: puros, sem banco. */

const studio7 = DEFAULT_STUDIOS.find((s) => s.key === 'estudio-jovem-7')!;
const marina = {
  key: 'instrutor-marina',
  name: 'Marina',
  data: PresenterTemplateDataSchema.parse({
    name: 'Marina',
    role: 'Sua orientadora',
    pronoun: 'she',
    voice: { provider: 'elevenlabs', voiceId: 'MZxV5lN3cv7hi1376O0m', voiceName: 'Ana Dias' },
    cameraKits: [
      {
        studioKey: 'estudio-jovem-7',
        cameras: [
          { id: 'cam_j7_esq', name: 'Esq', lookId: 'l_esq', placement: 'full_frame', zone: 'left' },
          { id: 'cam_j7_dir', name: 'Dir', lookId: 'l_dir', placement: 'full_frame', zone: 'right' },
          { id: 'cam_j7_34', name: '3/4', lookId: 'l_34', placement: 'full_frame', zone: 'center' },
        ],
      },
    ],
  }),
};
const resolved: ResolvedKit = {
  kit: { key: 'estudio7-marina', name: 'Estúdio 7 · Marina', data: DEFAULT_KITS[0]!.data },
  studio: { key: studio7.key, name: studio7.name, data: studio7.data },
  presenter: marina,
  voice: { key: DEFAULT_VOICES[0]!.key, name: DEFAULT_VOICES[0]!.name, data: DEFAULT_VOICES[0]!.data },
  branding: { key: DEFAULT_BRANDING.key, name: DEFAULT_BRANDING.name, data: DEFAULT_BRANDING.data },
  direction: { key: DIRECTION_ZONES.key, name: DIRECTION_ZONES.name, data: DIRECTION_ZONES.data },
  knowledge: [],
  learners: [],
};

describe('importador: --kit', () => {
  it('lê a flag e recusa combinar com câmeras/curso de origem', () => {
    expect(parseArgs(['--file', 'x.md', '--kit', 'estudio7-marina']).kit).toBe('estudio7-marina');
    expect(parseArgs(['--file', 'x.md', '--kit', 'k1', '--workspace', 'wsp_1']).workspace).toBe('wsp_1');
    expect(() => parseArgs(['--file', 'x.md', '--kit', 'k1', '--zone-cameras', 'a,b'])).toThrow(/não combine/);
    expect(() => parseArgs(['--file', 'x.md', '--kit', 'k1', '--source-course', 'crs_x'])).toThrow(/não combine/);
  });

  it('opções: estúdio com zonas, 3/4 principal, voz, letreiro e marca do kit', () => {
    const o = optionsFromKit(parseArgs(['--file', 'x.md', '--kit', 'estudio7-marina', '--wordmark', 'Primeira Vaga']), resolved);
    expect(o.presentation?.cameras?.map((c) => c.id)).toEqual(['cam_j7_34', 'cam_j7_esq', 'cam_j7_dir']);
    expect(o.presentation?.avatarId).toBe('l_34');
    expect(o.presentation?.voiceId).toBe('MZxV5lN3cv7hi1376O0m');
    expect(o.presenter).toMatchObject({ name: 'Marina', role: 'Sua orientadora' });
    expect(o.branding?.watermark).toEqual({ enabled: true, position: 'bottom-right', opacity: 0.7 });
    expect(o.branding?.wordmark).toBe('Primeira Vaga');
    expect(o.branding?.tagline).toBeUndefined();
  });

  it('flags de voz/nome valem por cima do kit', () => {
    const o = optionsFromKit(parseArgs(['--file', 'x.md', '--kit', 'k', '--voice', 'v_outra', '--presenter', 'Marina S.']), resolved);
    expect(o.presentation?.voiceId).toBe('v_outra');
    expect(o.presentation?.voiceName).toBeUndefined();
    expect(o.presenter?.name).toBe('Marina S.');
  });

  it('kit sem câmeras prontas: erro claro, nada pago', () => {
    const gen = structuredClone(resolved);
    gen.presenter.data.cameraKits[0]!.cameras[2] = { ...gen.presenter.data.cameraKits[0]!.cameras[2]!, status: 'generating' };
    expect(() => optionsFromKit(parseArgs(['--file', 'x.md', '--kit', 'estudio7-marina']), gen)).toThrow(/kit estudio7-marina: .*não estão prontas/);
  });
});

describe('biblioteca: extrair instrutor do rascunho', () => {
  it('pega só as câmeras do kit, sem a prévia assinada, com voz e look base', () => {
    const doc = emptyCourseDocument('Pode entrar');
    doc.presentation.voiceProvider = 'elevenlabs';
    doc.presentation.voiceId = 'MZxV5lN3cv7hi1376O0m';
    doc.presentation.voiceName = 'Ana Dias';
    doc.presentation.cameras = [
      { id: 'cam_principal', name: 'Principal', lookId: 'look_base', nativeFraming: 'medium', angle: 'front', status: 'ready', previewUrl: 'https://files/x?Signature=abc' },
      { id: 'cam_cenario_34', name: '3/4', lookId: 'l_c34', nativeFraming: 'medium', angle: 'left', status: 'ready', placement: 'full_frame' },
      { id: 'cam_j7_esq', name: 'Esq', lookId: 'l_esq', nativeFraming: 'medium', angle: 'front', status: 'ready', placement: 'full_frame', zone: 'left', sourceLookId: 'look_base' },
      { id: 'cam_j7_dir', name: 'Dir', lookId: 'l_dir', nativeFraming: 'medium', angle: 'front', status: 'ready', placement: 'full_frame', zone: 'right' },
      { id: 'cam_j7_34', name: '3/4', lookId: 'l_34', nativeFraming: 'medium', angle: 'left', status: 'ready', placement: 'full_frame', zone: 'center' },
      { id: 'cam_j6_esq', name: 'Esq 6', lookId: 'l_6', nativeFraming: 'medium', angle: 'front', status: 'ready' },
    ];
    const src = PRESENTER_SOURCES[0];
    const p = presenterFromDocument(doc, src);
    expect(p).toMatchObject({ name: 'Marina', role: 'Sua orientadora', pronoun: 'she', baseLookId: 'look_base', voiceKey: 'voz-ana-dias' });
    expect(p.voice).toEqual({ provider: 'elevenlabs', voiceId: 'MZxV5lN3cv7hi1376O0m', voiceName: 'Ana Dias' });
    expect(p.cameraKits.map((k) => [k.studioKey, k.cameras.map((c) => c.id)])).toEqual([
      ['estudio-jovem-7', ['cam_j7_esq', 'cam_j7_dir', 'cam_j7_34']],
      ['recepcao-dnawork', ['cam_principal', 'cam_cenario_34']],
    ]);
    expect(p.cameraKits[1]!.cameras[0]!.previewUrl).toBeUndefined();
    // câmera faltando = erro claro
    doc.presentation.cameras = doc.presentation.cameras.filter((c) => c.id !== 'cam_j7_dir');
    expect(() => presenterFromDocument(doc, src)).toThrow(/cam_j7_dir não existem/);
  });

  it('Rafael: pronome "ele", look base pela origem das câmeras e descrição só em texto', () => {
    const doc = emptyCourseDocument('Comece bem');
    doc.presentation.voiceProvider = 'elevenlabs';
    doc.presentation.voiceId = 'lvkgCBi6spByiTZMPJEK';
    doc.presentation.cameras = ['esq', 'dir', '34'].map((z) => ({ id: `cam_r7_${z}`, name: z, lookId: `l_${z}`, nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: z === 'esq' ? ('left' as const) : z === 'dir' ? ('right' as const) : ('center' as const), sourceLookId: 'look_rafael_base' }));
    const p = presenterFromDocument(doc, PRESENTER_SOURCES[1]);
    expect(p.pronoun).toBe('he');
    expect(p.baseLookId).toBe('look_rafael_base');
    expect(p.baseLookPrompt).toMatch(/fictional young Brazilian man/);
  });
});

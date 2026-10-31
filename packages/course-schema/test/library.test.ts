import { describe, expect, it } from 'vitest';
import {
  applyKitToDocument,
  applyPieceToDocument,
  defaultLibraryTemplates,
  DEFAULT_BRANDING,
  DEFAULT_KITS,
  DEFAULT_STUDIOS,
  DEFAULT_VOICES,
  DIRECTION_ZONES,
  emptyCourseDocument,
  ENGINE_KNOWLEDGE,
  kitCameras,
  KitError,
  kitSummary,
  knowledgeText,
  LibraryTemplateInputSchema,
  PresenterTemplateDataSchema,
  presentationFromKit,
  RECEPTION_STUDIO,
  zoneCamerasOf,
  type ResolvedKit,
} from '../src';

const studio7 = DEFAULT_STUDIOS.find((s) => s.key === 'estudio-jovem-7')!;

const rafael = {
  key: 'instrutor-rafael',
  name: 'Rafael',
  data: PresenterTemplateDataSchema.parse({
    name: 'Rafael',
    role: 'Seu orientador',
    pronoun: 'he',
    baseLookId: 'look_base',
    voice: { provider: 'elevenlabs', voiceId: 'lvkgCBi6spByiTZMPJEK', voiceName: 'Gabriel (ElevenLabs)' },
    cameraKits: [
      {
        studioKey: 'estudio-jovem-7',
        cameras: [
          { id: 'cam_r7_esq', name: 'Esq', lookId: 'look_esq', placement: 'full_frame', zone: 'left' },
          { id: 'cam_r7_dir', name: 'Dir', lookId: 'look_dir', placement: 'full_frame', zone: 'right' },
          { id: 'cam_r7_34', name: '3/4', lookId: 'look_34', placement: 'full_frame', zone: 'center', previewUrl: 'https://x/34.webp' },
        ],
      },
      { studioKey: 'recepcao-dnawork', cameras: [{ id: 'cam_principal', name: 'Principal', lookId: 'look_base' }] },
    ],
  }),
};

const resolved = (over: Partial<ResolvedKit> = {}): ResolvedKit => ({
  kit: { key: 'estudio7-rafael', name: 'Estúdio 7 · Rafael', data: DEFAULT_KITS[1]!.data },
  studio: { key: studio7.key, name: studio7.name, data: studio7.data },
  presenter: rafael,
  voice: { key: DEFAULT_VOICES[1]!.key, name: DEFAULT_VOICES[1]!.name, data: DEFAULT_VOICES[1]!.data },
  branding: { key: DEFAULT_BRANDING.key, name: DEFAULT_BRANDING.name, data: DEFAULT_BRANDING.data },
  direction: { key: DIRECTION_ZONES.key, name: DIRECTION_ZONES.name, data: DIRECTION_ZONES.data },
  knowledge: [],
  learners: [],
  ...over,
});

describe('biblioteca: peças padrão', () => {
  it('todas as peças padrão validam no esquema', () => {
    const all = defaultLibraryTemplates();
    for (const t of all) expect(() => LibraryTemplateInputSchema.parse(t), t.key).not.toThrow();
    expect(new Set(all.map((t) => t.key)).size).toBe(all.length);
    // os kits apontam para peças que existem (instrutores vêm do script de extração)
    const keys = new Set(all.map((t) => t.key));
    for (const k of DEFAULT_KITS) {
      expect(keys.has(k.data.studioKey)).toBe(true);
      for (const kk of k.data.knowledgeKeys) expect(keys.has(kk)).toBe(true);
      if (k.data.voiceKey) expect(keys.has(k.data.voiceKey)).toBe(true);
    }
  });

  it('estúdio 7 com a descrição do gerar-estudios.sh e as três zonas', () => {
    expect(studio7.data.sceneryPrompt).toBe('studio: clean wall, wooden arch with LED left, orange curved wall with DW logo right');
    expect(studio7.data.zones).toEqual(['left', 'right', 'center']);
    expect(studio7.data.mode).toBe('zones');
  });

  it('marca: logo no rodapé direito a 0,7 e nenhum slogan', () => {
    expect(DEFAULT_BRANDING.data.watermark).toEqual({ enabled: true, position: 'bottom-right', opacity: 0.7 });
    expect(JSON.stringify(DEFAULT_BRANDING.data)).not.toMatch(/tagline/);
  });

  it('chave inválida e dados do tipo errado são recusados', () => {
    expect(() => LibraryTemplateInputSchema.parse({ ...DEFAULT_VOICES[0], key: 'Voz Ana' })).toThrow();
    expect(() => LibraryTemplateInputSchema.parse({ ...DEFAULT_VOICES[0], kind: 'studio' })).toThrow();
  });

  it('base de conhecimento cobre as áreas e vira texto', () => {
    expect(Object.keys(ENGINE_KNOWLEDGE).length).toBeGreaterThanOrEqual(8);
    const txt = knowledgeText([{ name: 'Marca', data: { area: 'marca', rules: ENGINE_KNOWLEDGE.marca.rules } }]);
    expect(txt).toMatch(/^## Marca/);
    expect(txt).toMatch(/Nunca inventar slogan/);
  });
});

describe('biblioteca: aplicar kit', () => {
  it('câmeras do estúdio: prontas, 3/4 primeiro, zonas ativas', () => {
    const cams = kitCameras(rafael, resolved().studio);
    expect(cams.map((c) => [c.id, c.zone])).toEqual([['cam_r7_34', 'center'], ['cam_r7_esq', 'left'], ['cam_r7_dir', 'right']]);
    expect(zoneCamerasOf(cams)).toEqual({ center: 'cam_r7_34', left: 'cam_r7_esq', right: 'cam_r7_dir' });
  });

  it('apresentação: avatar = 3/4, pronome, voz do kit, câmera única', () => {
    const base = emptyCourseDocument('X').presentation;
    const p = presentationFromKit(resolved(), base);
    expect(p.avatarId).toBe('look_34');
    expect(p.avatarName).toBe('Rafael');
    expect(p.avatarPreviewUrl).toBe('https://x/34.webp');
    expect(p.presenterPronoun).toBe('he');
    expect([p.voiceProvider, p.voiceId, p.voiceName]).toEqual(['elevenlabs', 'lvkgCBi6spByiTZMPJEK', 'Gabriel (ElevenLabs)']);
    expect(p.directionStyle.cameraMode).toBe('single');
    expect(p.cameras).toHaveLength(3);
    // a peça de origem não muda
    expect(rafael.data.cameraKits[0]!.cameras[0]!.id).toBe('cam_r7_esq');
  });

  it('documento: marca, letreiro e elenco; frase de rodapé e marca em texto intocadas', () => {
    const doc = emptyCourseDocument('Comece bem');
    doc.branding.tagline = 'frase do curso';
    doc.branding.wordmark = 'Comece bem';
    doc.branding.presenterName = 'Marina';
    doc.branding.presenterRole = 'Sua orientadora';
    doc.cast = [{ name: 'Marina', role: 'Sua orientadora', details: 'antiga' }, { name: 'Luana', role: 'Personagem', details: '' }];
    const { document, changes } = applyKitToDocument(doc, resolved());
    expect(document.branding.presenterName).toBe('Rafael');
    expect(document.branding.presenterRole).toBe('Seu orientador');
    expect(document.branding.watermark).toEqual({ enabled: true, position: 'bottom-right', opacity: 0.7 });
    expect(document.branding.bumper).toEqual({ playOn: ['course_end'], skippable: true });
    expect(document.branding.tagline).toBe('frase do curso');
    expect(document.branding.wordmark).toBe('Comece bem');
    expect(document.cast.map((c) => c.name)).toEqual(['Rafael', 'Luana']);
    expect(changes.join('\n')).toMatch(/instrutor: .* → Rafael/);
    expect(changes.join('\n')).toMatch(/pronome: she → he/);
    // aplicar de novo não muda nada
    const again = applyKitToDocument(document, resolved());
    expect(again.document).toEqual(document);
    expect(again.changes).toEqual([]);
  });

  it('troca de instrutor: os planos da direção passam para as câmeras do kit na mesma zona', () => {
    const doc = emptyCourseDocument('Curso') as any;
    doc.presentation.cameras = [
      { id: 'cam_j7_esq', name: 'Esq', lookId: 'l1', zone: 'left' },
      { id: 'cam_j7_dir', name: 'Dir', lookId: 'l2' },
      { id: 'cam_j7_34', name: '3/4', lookId: 'l3', zone: 'center' },
    ];
    doc.modules = [{ id: 'm1', title: 'M', description: '', lessons: [{ id: 'a1', title: 'A', graph: { nodes: [
      { id: 'v1', type: 'content', direction: { shots: [{ id: 's1', cameraId: 'cam_j7_esq' }, { id: 's2', cameraId: 'cam_j7_dir' }, { id: 's3', cameraId: 'cam_j7_34' }, { id: 's4', cameraId: 'cam_sumiu' }, { id: 's5' }] } },
    ], edges: [] } }] }];
    const { document, changes } = applyKitToDocument(doc, resolved());
    const shots = (document as any).modules[0].lessons[0].graph.nodes[0].direction.shots.map((x: { cameraId?: string }) => x.cameraId);
    expect(shots).toEqual(['cam_r7_esq', 'cam_r7_dir', 'cam_r7_34', 'cam_r7_34', undefined]);
    expect(changes.join('\n')).toMatch(/4 planos passaram para as câmeras de Rafael/);
    // aplicar de novo não mexe mais na direção
    expect(applyKitToDocument(document, resolved()).changes.join('\n')).not.toMatch(/planos/);
  });

  it('sem a voz do kit, usa a voz do instrutor', () => {
    const p = presentationFromKit(resolved({ voice: undefined }));
    expect(p.voiceId).toBe('lvkgCBi6spByiTZMPJEK');
  });

  it('recusa sem câmeras no estúdio, câmera gerando ou sem lateral (nunca gera nada)', () => {
    const studio8 = DEFAULT_STUDIOS.find((s) => s.key === 'estudio-jovem-8')!;
    expect(() => presentationFromKit(resolved({ studio: { key: studio8.key, name: studio8.name, data: studio8.data } }))).toThrow(KitError);
    expect(() => presentationFromKit(resolved({ studio: { key: studio8.key, name: studio8.name, data: studio8.data } }))).toThrow(/pago/);
    const gen = structuredClone(rafael);
    gen.data.cameraKits[0]!.cameras[0] = { ...gen.data.cameraKits[0]!.cameras[0]!, status: 'generating' };
    expect(() => presentationFromKit(resolved({ presenter: gen }))).toThrow(/não estão prontas/);
    const onlyCenter = structuredClone(rafael);
    onlyCenter.data.cameraKits[0]!.cameras = onlyCenter.data.cameraKits[0]!.cameras.filter((c) => c.zone === 'center');
    expect(() => presentationFromKit(resolved({ presenter: onlyCenter }))).toThrow(/lateral/);
  });

  it('cenário composto: fundo e posição da recepção', () => {
    const studio = { key: RECEPTION_STUDIO.key, name: RECEPTION_STUDIO.name, data: { ...RECEPTION_STUDIO.data, background: { assetId: 'ast_recepcao', name: 'Recepção', foregroundFrom: 0.85, blur: false } } };
    const p = presentationFromKit(resolved({ studio }));
    expect(p.background).toEqual({ type: 'image', assetId: 'ast_recepcao', name: 'Recepção', foregroundFrom: 0.85, blur: false });
    expect([p.presenterPlacement, p.presenterScale, p.presenterX, p.presenterBottom]).toEqual(['right', 0.82, 0.375, 0.85]);
    expect(p.cameras.map((c) => c.id)).toEqual(['cam_principal']);
  });

  it('resumo legível do kit', () => {
    const lines = kitSummary(resolved());
    expect(lines[0]).toBe('Estúdio: Estúdio jovem 7 (com zonas)');
    expect(lines.join('\n')).toMatch(/cam_r7_esq \(esquerda\)/);
  });
});

describe('biblioteca: peças avulsas', () => {
  it('voz, marca e direção sem tocar no resto', () => {
    const doc = emptyCourseDocument('X');
    const v = applyPieceToDocument(doc, { kind: 'voice', key: 'voz-ana-dias', name: 'Ana', data: DEFAULT_VOICES[0]!.data });
    expect(v.document.presentation.voiceId).toBe('MZxV5lN3cv7hi1376O0m');
    expect(v.document.presentation.cameras).toEqual([]);
    const b = applyPieceToDocument(doc, { kind: 'branding', key: 'marca-dnawork', name: 'Marca', data: DEFAULT_BRANDING.data });
    expect(b.document.branding.watermark?.opacity).toBe(0.7);
    const d = applyPieceToDocument(doc, { kind: 'direction', key: 'd', name: 'Zonas', data: DIRECTION_ZONES.data });
    expect(d.document.presentation.directionStyle.cameraMode).toBe('single');
    expect(d.document.presentation.directionStyle.cardsPerMinute).toBe(2);
  });
});

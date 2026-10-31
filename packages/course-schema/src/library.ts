import { z } from 'zod';
import {
  BrandingSchema,
  BumperBrandingSchema,
  FOREGROUND_FROM_MIN,
  PRESENTER_BOTTOM_MIN,
  PRESENTER_GRADES,
  PRESENTER_HEADROOM_MAX,
  PRESENTER_HEADROOM_MIN,
  PRESENTER_X_MAX,
  PRESENTER_X_MIN,
  PresentationSchema,
  PresenterPlacementSchema,
  WatermarkBrandingSchema,
  BackdropFrameSchema,
  type Branding,
  type CourseDocument,
  type Presentation,
} from './course';
import { LearnerProfileDataSchema } from './learner-sim';
import { CAMERA_ZONES, CameraSchema, DirectionStyleSchema, PresenterPronounSchema, type Camera, type CameraZone } from './direction';

/**
 * Biblioteca de modelos do workspace: peças prontas (estúdio, instrutor, voz,
 * marca, direção visual, base de conhecimento, alunos de teste) e KITS que juntam essas peças.
 * Um curso novo é montado escolhendo um kit em vez de copiar de outro curso.
 *
 * Regra de ouro: APLICAR um modelo só copia dados para o rascunho. Nada aqui
 * chama provedor ou cria pedido de vídeo/voz; um kit cujo instrutor ainda não
 * tem as câmeras PRONTAS no estúdio é recusado com mensagem clara (gerar as
 * câmeras é um passo pago à parte, sempre com aprovação do autor).
 *
 * Puro (sem Node): vale no navegador, no servidor, no worker e nos scripts.
 */

export const TEMPLATE_KINDS = ['kit', 'studio', 'presenter', 'voice', 'branding', 'direction', 'knowledge', 'learner'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const TemplateKindSchema = z.enum(TEMPLATE_KINDS);
export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  kit: 'Kits prontos',
  studio: 'Estúdios e cenários',
  presenter: 'Instrutores',
  voice: 'Vozes',
  branding: "Marca d'água e vinheta",
  direction: 'Direção visual',
  knowledge: 'Base de conhecimento',
  learner: 'Alunos de teste',
};
/** Rótulo de um item (singular), para botões e mensagens. */
export const TEMPLATE_KIND_SINGULAR: Record<TemplateKind, string> = {
  kit: 'kit',
  studio: 'estúdio',
  presenter: 'instrutor',
  voice: 'voz',
  branding: 'marca',
  direction: 'direção visual',
  knowledge: 'regras',
  learner: 'aluno de teste',
};

/** Chave legível e estável do modelo no workspace (ex.: `estudio7-marina`). */
export const TEMPLATE_KEY_RE = /^[a-z0-9][a-z0-9-]{1,59}$/;
export const TemplateKeySchema = z.string().regex(TEMPLATE_KEY_RE, 'use letras minúsculas, números e hífen (ex.: estudio7-marina)');

/* ------------------------------------------------------------------ */
/* Peças                                                                */
/* ------------------------------------------------------------------ */

/** Posição da apresentadora sugerida pelo cenário (montagem nossa, direita/esquerda). */
export const StudioPlacementSchema = z.object({
  presenterPlacement: PresenterPlacementSchema.optional(),
  presenterScale: z.number().min(0.5).max(1.2).optional(),
  presenterX: z.number().min(PRESENTER_X_MIN).max(PRESENTER_X_MAX).optional(),
  presenterBottom: z.number().min(PRESENTER_BOTTOM_MIN).max(1).optional(),
  presenterHeadroom: z.number().min(PRESENTER_HEADROOM_MIN).max(PRESENTER_HEADROOM_MAX).optional(),
  presenterGrade: z.enum(PRESENTER_GRADES).optional(),
});

/**
 * Estúdio/cenário. `zones` = estúdio com zonas: a apresentadora já nasce DENTRO
 * do cenário em cada câmera (full_frame), e as pílulas vão na parede livre.
 * `composite` = imagem de fundo atrás da apresentadora recortada (montagem nossa).
 */
export const StudioTemplateDataSchema = z.object({
  mode: z.enum(['zones', 'composite']),
  /** descrição curta do cenário, em inglês, usada nos pedidos de câmera (o `DESC` de gerar-estudios.sh) */
  sceneryPrompt: z.string().min(1).max(400),
  /** imagem do cenário no workspace (prévia e referência dos pedidos de câmera) */
  imageAssetId: z.string().max(64).optional(),
  /** arquivo de referência no repositório (ex.: docs/brand/cenario/estudio-jovem-7.png) */
  imagePath: z.string().max(300).optional(),
  /** zonas previstas no estúdio (onde a apresentadora fica em cada câmera) */
  zones: z.array(z.enum(CAMERA_ZONES)).max(3).default([]),
  /** enquadramento: notas para quem gera câmeras novas (plano, lado da parede livre…) */
  framingNotes: z.string().max(600).default(''),
  /** só `composite`: fundo da apresentação (imagem do workspace com balcão/enquadramento) */
  background: z
    .object({
      assetId: z.string().max(64),
      name: z.string().max(60).optional(),
      foregroundFrom: z.number().min(FOREGROUND_FROM_MIN).max(1).optional(),
      frame: BackdropFrameSchema.optional(),
      blur: z.boolean().optional(),
    })
    .optional(),
  /** só `composite`: posição da apresentadora */
  placement: StudioPlacementSchema.optional(),
});
export type StudioTemplateData = z.infer<typeof StudioTemplateDataSchema>;

export const VOICE_PROVIDERS = ['elevenlabs', 'heygen'] as const;
export const VoiceTemplateDataSchema = z.object({
  provider: z.enum(VOICE_PROVIDERS),
  voiceId: z.string().min(1).max(120),
  voiceName: z.string().max(120).default(''),
  language: z.string().max(20).default('pt-BR'),
  /** para qual pronome de apresentador a voz foi escolhida */
  pronoun: PresenterPronounSchema.optional(),
  /** amostra: áudio do workspace (um trecho de narração já produzida — nada é gerado para isso) */
  sampleAssetId: z.string().max(64).optional(),
  /** amostra pública do provedor (prévia gratuita do catálogo), quando houver */
  sampleUrl: z.string().max(1000).optional(),
  /** texto da amostra (o que se ouve) */
  sampleText: z.string().max(600).optional(),
  /** voz da biblioteca pública do ElevenLabs: dono, para adicionar à conta (grátis) */
  libraryOwnerId: z.string().max(120).optional(),
  notes: z.string().max(600).default(''),
});
export type VoiceTemplateData = z.infer<typeof VoiceTemplateDataSchema>;

/** Câmeras de UM instrutor em UM estúdio (os looks já gerados e prontos). */
export const PresenterCameraKitSchema = z.object({
  studioKey: TemplateKeySchema,
  cameras: z.array(CameraSchema).min(1).max(8),
});
export type PresenterCameraKit = z.infer<typeof PresenterCameraKitSchema>;

export const PRESENTER_CREATION_STATUSES = ['generating', 'failed', 'ready'] as const;
export const PresenterCreationSchema = z.object({
  status: z.enum(PRESENTER_CREATION_STATUSES),
  /** estúdio onde as 3 câmeras são geradas */
  studioKey: TemplateKeySchema,
  /** descrição do autor (o prompt completo fica em `baseLookPrompt`) */
  description: z.string().max(600),
  /** personagem base (o visual de onde as câmeras derivam), com generationId gravado */
  base: CameraSchema.optional(),
  /** kit criado ao terminar */
  kitKey: TemplateKeySchema.optional(),
  /** aprovação da ação paga (quem e quando) */
  approvedBy: z.string().max(64),
  approvedAt: z.string().max(40),
  simulated: z.boolean().default(false),
  error: z.string().max(500).optional(),
  notes: z.array(z.string().max(300)).max(10).default([]),
});
export type PresenterCreation = z.infer<typeof PresenterCreationSchema>;

export const PresenterTemplateDataSchema = z.object({
  /** nome mostrado no letreiro e no estúdio (ex.: "Marina") */
  name: z.string().min(1).max(40),
  /** papel no letreiro (ex.: "Sua orientadora") */
  role: z.string().min(1).max(60),
  pronoun: PresenterPronounSchema,
  /** look base no HeyGen (de onde as câmeras de estúdio foram geradas) */
  baseLookId: z.string().max(120).optional(),
  /** descrição só em texto do personagem fictício (quando foi criado por texto) */
  baseLookPrompt: z.string().max(1500).optional(),
  avatarType: z.string().max(40).optional(),
  /** voz do instrutor (o kit pode trocar por outra voz da biblioteca) */
  voice: z.object({ provider: z.enum(VOICE_PROVIDERS), voiceId: z.string().min(1).max(120), voiceName: z.string().max(120).optional() }),
  /** chave do modelo de voz correspondente (catálogo), quando houver */
  voiceKey: TemplateKeySchema.optional(),
  /** kit de câmeras por estúdio */
  cameraKits: z.array(PresenterCameraKitSchema).max(12).default([]),
  /** ficha do elenco (como o instrutor conduz as falas) */
  castDetails: z.string().max(600).default('Conduz todas as falas dos vídeos, em conversa com o aluno; nunca julga.'),
  /** prévia (pode expirar quando é link assinado do provedor) */
  previewUrl: z.string().max(1000).optional(),
  /**
   * instrutor criado pela tela "Novo instrutor": estado da geração (personagem + 3 câmeras).
   * Enquanto `status` não é `ready`, as câmeras do kit estão gerando e o kit ainda não existe.
   */
  creation: PresenterCreationSchema.optional(),
});
export type PresenterTemplateData = z.infer<typeof PresenterTemplateDataSchema>;

/**
 * Marca d'água + vinheta. Não há campo de slogan/frase de propósito: a marca
 * nunca inventa slogan (a vinheta aprovada é só a assinatura, sem frase).
 */
export const BrandingTemplateDataSchema = z.object({
  watermark: WatermarkBrandingSchema,
  bumper: BumperBrandingSchema.optional(),
  theme: BrandingSchema.shape.theme.optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notes: z.string().max(600).default(''),
});
export type BrandingTemplateData = z.infer<typeof BrandingTemplateDataSchema>;

export const CARD_LAYOUT_DEFAULTS = ['presenter_chips', 'presenter_panel', 'card'] as const;
export const DirectionTemplateDataSchema = z.object({
  /** estilo de direção aplicado à apresentação (câmera única, cartões por minuto, gestos…) */
  directionStyle: DirectionStyleSchema.partial().default({}),
  /** cartão padrão: pílulas no estúdio com zonas, painel em câmera única, ou cartão em tela cheia */
  cardLayout: z.enum(CARD_LAYOUT_DEFAULTS).default('presenter_chips'),
  /** letreiro com o nome na primeira cena narrada da aula */
  lowerThird: z.boolean().default(true),
  /** cartão "A seguir" com a pergunta antes de uma decisão */
  nextQuestion: z.boolean().default(true),
  /** regras de câmera e de cartão, em linguagem simples (orientação para quem monta) */
  rules: z.array(z.string().max(300)).max(20).default([]),
});
export type DirectionTemplateData = z.infer<typeof DirectionTemplateDataSchema>;

export const KNOWLEDGE_AREAS = ['roteiro', 'fala', 'video', 'camera', 'cartoes', 'marca', 'custo', 'produto'] as const;
export type KnowledgeArea = (typeof KNOWLEDGE_AREAS)[number];
export const KNOWLEDGE_AREA_LABELS: Record<KnowledgeArea, string> = {
  roteiro: 'Roteiro e aulas',
  fala: 'Fala da instrutora',
  video: 'Linguagem de vídeo',
  camera: 'Câmeras e estúdio',
  cartoes: 'Cartões e pílulas',
  marca: 'Marca',
  custo: 'Custo e aprovação',
  produto: 'Produto e público',
};
export const KnowledgeRuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,60}$/),
  title: z.string().min(1).max(120),
  text: z.string().min(1).max(800),
  /** de onde veio a regra (documento do projeto) */
  source: z.string().max(200).optional(),
});
export type KnowledgeRule = z.infer<typeof KnowledgeRuleSchema>;
export const KnowledgeTemplateDataSchema = z.object({
  area: z.enum(KNOWLEDGE_AREAS),
  rules: z.array(KnowledgeRuleSchema).min(1).max(40),
});
export type KnowledgeTemplateData = z.infer<typeof KnowledgeTemplateDataSchema>;

/** Kit: combinação pronta de peças, por chave. */
export const KitTemplateDataSchema = z.object({
  studioKey: TemplateKeySchema,
  presenterKey: TemplateKeySchema,
  /** ausente = a voz do próprio instrutor */
  voiceKey: TemplateKeySchema.optional(),
  brandingKey: TemplateKeySchema.optional(),
  directionKey: TemplateKeySchema.optional(),
  knowledgeKeys: z.array(TemplateKeySchema).max(20).default([]),
  /** alunos de teste que opinam sobre o curso montado com o kit */
  learnerKeys: z.array(TemplateKeySchema).max(20).default([]),
});
export type KitTemplateData = z.infer<typeof KitTemplateDataSchema>;

export const TEMPLATE_DATA_SCHEMAS = {
  kit: KitTemplateDataSchema,
  studio: StudioTemplateDataSchema,
  presenter: PresenterTemplateDataSchema,
  voice: VoiceTemplateDataSchema,
  branding: BrandingTemplateDataSchema,
  direction: DirectionTemplateDataSchema,
  knowledge: KnowledgeTemplateDataSchema,
  learner: LearnerProfileDataSchema,
} as const;
export type TemplateDataByKind = { [K in TemplateKind]: z.infer<(typeof TEMPLATE_DATA_SCHEMAS)[K]> };

const envelope = <K extends TemplateKind>(kind: K) =>
  z.object({
    kind: z.literal(kind),
    key: TemplateKeySchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(600).default(''),
    data: TEMPLATE_DATA_SCHEMAS[kind],
  });

/** Modelo a gravar (sem id): o tipo decide o formato de `data`. */
export const LibraryTemplateInputSchema = z.discriminatedUnion('kind', [
  envelope('kit'),
  envelope('studio'),
  envelope('presenter'),
  envelope('voice'),
  envelope('branding'),
  envelope('direction'),
  envelope('knowledge'),
  envelope('learner'),
]);
export type LibraryTemplateInput = z.infer<typeof LibraryTemplateInputSchema>;

/** Modelo como sai do banco/API. */
export type LibraryTemplate<K extends TemplateKind = TemplateKind> = {
  [P in K]: { id: string; kind: P; key: string; name: string; description: string; data: TemplateDataByKind[P]; previewUrl?: string | null; updatedAt?: string | Date };
}[K];

/** Valida o `data` de um tipo (lança ZodError). */
export function parseTemplateData<K extends TemplateKind>(kind: K, data: unknown): TemplateDataByKind[K] {
  return TEMPLATE_DATA_SCHEMAS[kind].parse(data) as TemplateDataByKind[K];
}

/* ------------------------------------------------------------------ */
/* Kit resolvido e aplicação                                            */
/* ------------------------------------------------------------------ */

type Piece<K extends TemplateKind> = { key: string; name: string; data: TemplateDataByKind[K] };

/** Kit com as peças já buscadas (o repositório resolve as chaves). */
export interface ResolvedKit {
  kit: Piece<'kit'>;
  studio: Piece<'studio'>;
  presenter: Piece<'presenter'>;
  voice?: Piece<'voice'>;
  branding?: Piece<'branding'>;
  direction?: Piece<'direction'>;
  knowledge: Array<Piece<'knowledge'>>;
  learners: Array<Piece<'learner'>>;
}

/** Erro de aplicação de kit (mensagem em pt-BR, pronta para o autor). */
export class KitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KitError';
  }
}

const ZONE_ORDER: Record<CameraZone, number> = { center: 0, left: 1, right: 2 };

/**
 * Câmeras do instrutor no estúdio do kit, prontas para a apresentação: todas
 * PRONTAS e com look (senão erro: gerar é pago e fica fora daqui). Estúdio com
 * zonas: cada câmera precisa de `zone`, ao menos uma lateral, e a 3/4 (centro)
 * vira a principal (ordem centro, esquerda, direita).
 */
export function kitCameras(presenter: Piece<'presenter'>, studio: Piece<'studio'>): Camera[] {
  const kit = presenter.data.cameraKits.find((k) => k.studioKey === studio.key);
  if (!kit) {
    const has = presenter.data.cameraKits.map((k) => k.studioKey);
    throw new KitError(`${presenter.data.name} ainda não tem câmeras no estúdio "${studio.name}"${has.length ? ` (tem em: ${has.join(', ')})` : ''}. Gerar câmeras novas é pago: peça a aprovação antes.`);
  }
  const cams = kit.cameras.map((c) => structuredClone(c));
  const notReady = cams.filter((c) => (c.status ?? 'ready') !== 'ready' || !c.lookId);
  if (notReady.length) throw new KitError(`câmera(s) ${notReady.map((c) => c.id).join(', ')} de ${presenter.data.name} ainda não estão prontas; espere a geração terminar.`);
  if (studio.data.mode === 'zones') {
    const noZone = cams.filter((c) => !c.zone);
    if (noZone.length) throw new KitError(`câmera(s) ${noZone.map((c) => c.id).join(', ')} sem zona no estúdio "${studio.name}".`);
    if (!cams.some((c) => c.zone === 'left' || c.zone === 'right')) throw new KitError(`o estúdio com zonas precisa de ao menos uma câmera lateral de ${presenter.data.name}.`);
    cams.sort((a, b) => ZONE_ORDER[a.zone!] - ZONE_ORDER[b.zone!]);
  }
  return cams;
}

/**
 * Apresentação do curso montada a partir do kit (pura). Parte de `base` (a
 * apresentação atual do rascunho) e troca: instrutor (avatar = look da câmera
 * principal, nome, pronome), voz, câmeras do estúdio, fundo/posição (cenário
 * composto) e o estilo de direção. Mantém formato, expressividade etc.
 */
export function presentationFromKit(resolved: ResolvedKit, base?: Presentation): Presentation {
  const pres: Presentation = structuredClone(base ?? PresentationSchema.parse({}));
  const { presenter, studio } = resolved;
  const cameras = kitCameras(presenter, studio);
  const main = cameras[0]!;
  pres.cameras = cameras;
  pres.avatarId = main.lookId;
  pres.avatarName = presenter.data.name;
  if (main.previewUrl) pres.avatarPreviewUrl = main.previewUrl;
  else delete pres.avatarPreviewUrl;
  if (presenter.data.avatarType) pres.avatarType = presenter.data.avatarType;
  pres.presenterPronoun = presenter.data.pronoun;

  const voice = resolved.voice?.data ?? presenter.data.voice;
  pres.voiceProvider = voice.provider;
  pres.voiceId = voice.voiceId;
  const voiceName = 'voiceName' in voice ? voice.voiceName : undefined;
  if (voiceName) pres.voiceName = voiceName;
  else delete pres.voiceName;

  if (studio.data.mode === 'composite') {
    const bg = studio.data.background;
    if (bg) pres.background = { type: 'image', ...structuredClone(bg) };
    const pl = studio.data.placement ?? {};
    for (const k of ['presenterPlacement', 'presenterScale', 'presenterX', 'presenterBottom', 'presenterHeadroom', 'presenterGrade'] as const) {
      if (pl[k] !== undefined) (pres as Record<string, unknown>)[k] = pl[k];
      else if (k !== 'presenterPlacement' && k !== 'presenterScale') delete (pres as Record<string, unknown>)[k];
    }
  }

  const style = resolved.direction?.data.directionStyle ?? {};
  pres.directionStyle = DirectionStyleSchema.parse({ ...pres.directionStyle, ...style, cameraMode: style.cameraMode ?? 'single' });
  return PresentationSchema.parse(pres);
}

/**
 * Marca do player a partir do kit (pura): letreiro (nome e papel do
 * instrutor), marca d'água e vinheta. NUNCA mexe em frase de rodapé, marca em
 * texto ou subtítulo do curso (cada curso tem os seus; slogan não se inventa).
 */
export function brandingFromKit(resolved: ResolvedKit, base?: Branding): Branding {
  const b: Branding = structuredClone(base ?? BrandingSchema.parse({}));
  b.presenterName = resolved.presenter.data.name;
  b.presenterRole = resolved.presenter.data.role;
  const brand = resolved.branding?.data;
  if (brand) {
    b.watermark = structuredClone(brand.watermark);
    if (brand.bumper) b.bumper = structuredClone(brand.bumper);
    if (brand.theme) b.theme = brand.theme;
    if (brand.accent) b.accent = brand.accent;
  }
  return BrandingSchema.parse(b);
}

/** Kit aplicado ao rascunho: apresentação, marca e elenco. Só dados, sem custo. */
export function applyKitToDocument(doc: CourseDocument, resolved: ResolvedKit): { document: CourseDocument; changes: string[] } {
  const next: CourseDocument = structuredClone(doc);
  const changes: string[] = [];
  const before = { pres: doc.presentation, brand: doc.branding };
  next.presentation = presentationFromKit(resolved, doc.presentation);
  next.branding = brandingFromKit(resolved, doc.branding);

  // elenco: o instrutor anterior (pelo letreiro) dá lugar ao do kit; senão o do kit entra primeiro
  const p = resolved.presenter.data;
  const member = { name: p.name, role: p.role, details: p.castDetails };
  const oldName = before.brand.presenterName?.trim();
  const oldIdx = oldName ? next.cast.findIndex((c) => c.name === oldName && (!before.brand.presenterRole || c.role === before.brand.presenterRole)) : -1;
  const sameIdx = next.cast.findIndex((c) => c.name === p.name && c.role === p.role);
  if (sameIdx >= 0) next.cast[sameIdx] = { ...next.cast[sameIdx]!, ...member, details: next.cast[sameIdx]!.details || member.details };
  else if (oldIdx >= 0) {
    next.cast[oldIdx] = member;
    changes.push(`elenco: ${oldName} → ${p.name}`);
  } else if (next.cast.length < 12) {
    next.cast = [member, ...next.cast];
    changes.push(`elenco: ${p.name} entra como ${p.role}`);
  }

  const a = before.pres;
  const n = next.presentation;
  if (a.avatarName !== n.avatarName || a.avatarId !== n.avatarId) changes.push(`instrutor: ${a.avatarName ?? a.avatarId ?? '—'} → ${n.avatarName} (${n.cameras[0]?.id})`);
  if (a.voiceId !== n.voiceId) changes.push(`voz: ${a.voiceName ?? a.voiceId ?? '—'} → ${n.voiceName ?? n.voiceId}`);
  if (a.presenterPronoun !== n.presenterPronoun) changes.push(`pronome: ${a.presenterPronoun} → ${n.presenterPronoun}`);
  const camIds = (x: Presentation) => x.cameras.map((c) => `${c.id}${c.zone ? `(${c.zone})` : ''}`).join(', ');
  if (camIds(a) !== camIds(n)) changes.push(`câmeras: ${camIds(a) || 'nenhuma'} → ${camIds(n)}`);
  if (JSON.stringify(a.background) !== JSON.stringify(n.background)) changes.push(`fundo: ${n.background.type === 'image' ? n.background.name ?? n.background.assetId : n.background.value}`);
  if (JSON.stringify(a.directionStyle) !== JSON.stringify(n.directionStyle)) changes.push('estilo de direção atualizado');
  // direção: planos que apontavam para câmeras que saíram (do instrutor anterior) passam para a câmera do kit
  // na MESMA zona (esquerda→esquerda, direita→direita, 3/4→3/4); sem par, a 3/4 (ou a primeira) do kit
  const newIds = new Set(n.cameras.map((c) => c.id));
  const zoneOf = (c: { id: string; name?: string; zone?: string | null }): string | undefined => {
    if (c.zone) return c.zone;
    const t = `${c.id} ${c.name ?? ''}`.toLowerCase();
    if (/(^|[_\s-])(esq|esquerda|left)\b/.test(t)) return 'left';
    if (/(^|[_\s-])(dir|direita|right)\b/.test(t)) return 'right';
    if (/(^|[_\s-])(34|3\/4|centro|center)\b/.test(t)) return 'center';
    return undefined;
  };
  const byZone = new Map<string, string>();
  for (const c of n.cameras) {
    const z = zoneOf(c);
    if (z && !byZone.has(z)) byZone.set(z, c.id);
  }
  const fallback = byZone.get('center') ?? n.cameras[0]?.id;
  const oldCams = new Map(a.cameras.map((c) => [c.id, c]));
  let remapped = 0;
  for (const m of next.modules) {
    for (const l of m.lessons) {
      for (const node of l.graph.nodes) {
        const shots = (node as { direction?: { shots?: Array<{ cameraId?: string }> } }).direction?.shots;
        if (!shots) continue;
        for (const shot of shots) {
          if (!shot.cameraId || newIds.has(shot.cameraId)) continue;
          const old = oldCams.get(shot.cameraId);
          const z = old ? zoneOf(old) : zoneOf({ id: shot.cameraId });
          const target = (z && byZone.get(z)) || fallback;
          if (target) {
            shot.cameraId = target;
            remapped++;
          }
        }
      }
    }
  }
  if (remapped) changes.push(`direção: ${remapped} ${remapped === 1 ? 'plano passou' : 'planos passaram'} para as câmeras de ${p.name} (mesma zona)`);

  const nb = next.branding;
  if (before.brand.presenterName !== nb.presenterName || before.brand.presenterRole !== nb.presenterRole) changes.push(`letreiro: ${nb.presenterName} · ${nb.presenterRole}`);
  if (JSON.stringify(before.brand.watermark ?? null) !== JSON.stringify(nb.watermark ?? null)) changes.push(`marca d'água: ${nb.watermark?.enabled === false ? 'desligada' : `${nb.watermark?.position ?? 'bottom-right'}, ${nb.watermark?.opacity ?? 0.7}`}`);
  if (JSON.stringify(before.brand.bumper ?? null) !== JSON.stringify(nb.bumper ?? null)) changes.push('vinheta atualizada');
  return { document: next, changes };
}

/**
 * Aplica UMA peça avulsa ao rascunho (voz, marca ou direção visual). Instrutor
 * e estúdio só entram juntos, por um kit (as câmeras dependem do par).
 */
export function applyPieceToDocument(doc: CourseDocument, piece: { kind: 'voice' | 'branding' | 'direction'; key: string; name: string; data: unknown }): { document: CourseDocument; changes: string[] } {
  const next: CourseDocument = structuredClone(doc);
  const changes: string[] = [];
  if (piece.kind === 'voice') {
    const v = VoiceTemplateDataSchema.parse(piece.data);
    next.presentation.voiceProvider = v.provider;
    next.presentation.voiceId = v.voiceId;
    if (v.voiceName) next.presentation.voiceName = v.voiceName;
    else delete next.presentation.voiceName;
    if (doc.presentation.voiceId !== v.voiceId) changes.push(`voz: ${doc.presentation.voiceName ?? doc.presentation.voiceId ?? '—'} → ${v.voiceName || v.voiceId}`);
  } else if (piece.kind === 'branding') {
    const b = BrandingTemplateDataSchema.parse(piece.data);
    next.branding.watermark = structuredClone(b.watermark);
    if (b.bumper) next.branding.bumper = structuredClone(b.bumper);
    if (b.theme) next.branding.theme = b.theme;
    if (b.accent) next.branding.accent = b.accent;
    if (JSON.stringify(doc.branding) !== JSON.stringify(next.branding)) changes.push(`marca: ${piece.name}`);
  } else {
    const d = DirectionTemplateDataSchema.parse(piece.data);
    next.presentation.directionStyle = DirectionStyleSchema.parse({ ...next.presentation.directionStyle, ...d.directionStyle });
    if (JSON.stringify(doc.presentation.directionStyle) !== JSON.stringify(next.presentation.directionStyle)) changes.push(`direção visual: ${piece.name}`);
  }
  return { document: next, changes };
}

/** Linhas curtas do kit para a tela e os scripts. */
export function kitSummary(resolved: ResolvedKit): string[] {
  const p = resolved.presenter.data;
  const voice = resolved.voice?.data ?? p.voice;
  const voiceName = ('voiceName' in voice && voice.voiceName) || voice.voiceId;
  const kit = p.cameraKits.find((k) => k.studioKey === resolved.studio.key);
  const lines = [
    `Estúdio: ${resolved.studio.name}${resolved.studio.data.mode === 'zones' ? ' (com zonas)' : ''}`,
    `Instrutor: ${p.name} · ${p.role}`,
    `Voz: ${voiceName}${new RegExp(voice.provider, 'i').test(String(voiceName)) ? '' : ` (${voice.provider === 'elevenlabs' ? 'ElevenLabs' : 'HeyGen'})`}`,
    `Câmeras: ${kit ? kit.cameras.map((c) => `${c.id}${c.zone ? ` (${c.zone === 'left' ? 'esquerda' : c.zone === 'right' ? 'direita' : '3/4'})` : ''}`).join(', ') : 'nenhuma neste estúdio'}`,
  ];
  if (resolved.branding) lines.push(`Marca: ${resolved.branding.name}`);
  if (resolved.direction) lines.push(`Direção: ${resolved.direction.name}`);
  if (resolved.knowledge.length) lines.push(`Regras: ${resolved.knowledge.map((k) => k.name).join(', ')}`);
  if (resolved.learners.length) lines.push(`Alunos de teste: ${resolved.learners.map((k) => k.data.name).join(', ')}`);
  return lines;
}

/** Base de conhecimento em texto corrido (para documentação, exportação ou instrução de IA). */
export function knowledgeText(pieces: ReadonlyArray<{ name: string; data: KnowledgeTemplateData }>): string {
  return pieces
    .map((p) => [`## ${p.name}`, ...p.data.rules.map((r) => `- ${r.title}: ${r.text}`)].join('\n'))
    .join('\n\n');
}

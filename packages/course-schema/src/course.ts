import { z } from 'zod';
import { NodeIdSchema } from './nodes';
import { ExperienceFamilySchema, LessonGraphSchema, ObjectiveSchema, SCHEMA_VERSION } from './graph';
import { CameraSchema, DirectionStyleSchema, PresenterPronounSchema } from './direction';

export const LessonSchema = z.object({
  id: NodeIdSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).default(''),
  /** orientação editável, não regra de aprovação */
  estimatedMinutes: z.number().int().min(1).max(600).default(15),
  family: ExperienceFamilySchema.default('decision_consequence'),
  objectiveIds: z.array(NodeIdSchema).default([]),
  /**
   * O aluno pode voltar cenas ("Cena anterior" / mapa da aula) e mudar a
   * resposta. Ausente = sim. `false` para avaliações estritas.
   */
  allowBack: z.boolean().optional(),
  /** cenas previstas na estrutura aprovada (a IA escreve a aula a partir delas) */
  keyScenes: z.array(z.string().max(200)).max(8).optional(),
  /** por que esta dinâmica serve ao objetivo (vem da proposta de estrutura) */
  rationale: z.string().max(400).optional(),
  graph: LessonGraphSchema,
});
export type Lesson = z.infer<typeof LessonSchema>;

export const ModuleSchema = z.object({
  id: NodeIdSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).default(''),
  lessons: z.array(LessonSchema).max(50).default([]),
});
export type Module = z.infer<typeof ModuleSchema>;

/** Duração total padrão de um curso (minutos); rascunhos antigos com 45 continuam válidos. */
export const DEFAULT_TARGET_MINUTES = 15;

export const AUDIENCE_PROFILES = ['first_job', 'experienced', 'career_change', 'other'] as const;
export type AudienceProfile = (typeof AUDIENCE_PROFILES)[number];
export const AUDIENCE_PROFILE_LABELS: Record<AudienceProfile, string> = {
  first_job: 'Primeiro emprego ou estágio',
  experienced: 'Já trabalhou',
  career_change: 'Mudança de área',
  other: 'Outro',
};
export const AUDIENCE_LEVELS = ['beginner', 'intermediate'] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];
export const AUDIENCE_LEVEL_LABELS: Record<AudienceLevel, string> = { beginner: 'Iniciante', intermediate: 'Intermediário' };
export const AUDIENCE_TRAITS = ['shy', 'low_time', 'low_reading', 'accessibility'] as const;
export type AudienceTrait = (typeof AUDIENCE_TRAITS)[number];
export const AUDIENCE_TRAIT_LABELS: Record<AudienceTrait, string> = {
  shy: 'Tímido ou introvertido',
  low_time: 'Pouco tempo',
  low_reading: 'Lê pouco',
  accessibility: 'Precisa de acessibilidade',
};

/** Briefing estruturado: o que todo curso precisa declarar. */
export const CourseBriefSchema = z.object({
  /** tema em uma frase (o que o curso é sobre) */
  topic: z.string().max(500).default(''),
  audience: z.string().max(500).default(''),
  context: z.string().max(1000).default(''),
  prerequisites: z.string().max(500).default(''),
  finalSkill: z.string().max(500).default(''),
  /** tom de voz desejado (ex.: direto e próximo, sem gírias) */
  tone: z.string().max(200).default(''),
  /**
   * Ponto de vista da narrativa:
   * - second_person: o aluno é o protagonista ("Você recebe o convite…") — padrão, mais pessoal
   * - presenter: o apresentador fala com o aluno em primeira pessoa e comenta casos ("Vou te mostrar…")
   * - third_person: o aluno observa personagens ("Rafael recebe o convite…")
   */
  narrativeVoice: z.enum(['second_person', 'presenter', 'third_person']).default('second_person'),
  /**
   * duração total alvo em minutos (orientação editável). Cursos curtos funcionam
   * melhor: ~3 min por aula, uma decisão real por aula e dicas práticas.
   */
  targetMinutes: z.number().int().min(5).max(600).default(DEFAULT_TARGET_MINUTES),
  sourcesNote: z.string().max(2000).default(''),
  /* ---- campos guiados do briefing (aditivos; viram texto para a IA via `briefProfileText`) ---- */
  /** momento de carreira do público (chips do briefing) */
  audienceProfile: z.enum(AUDIENCE_PROFILES).optional(),
  /** nível de partida */
  level: z.enum(AUDIENCE_LEVELS).optional(),
  /** traços do público que mudam a forma das aulas */
  traits: z.array(z.enum(AUDIENCE_TRAITS)).default([]),
  /** formato de interação das cenas */
  interaction: z
    .object({
      /** decisões por escolha guiada (sem resposta livre) */
      guidedChoices: z.boolean().default(true),
      /** treino de voz opcional (nunca obrigatório) */
      voiceTraining: z.boolean().default(true),
      /** nada de escrita obrigatória */
      noWriting: z.boolean().default(true),
    })
    .prefault({}),
});

/**
 * Texto do perfil do público para a IA, montado a partir dos campos guiados
 * (os prompts recebem o briefing como pares `chave: texto`; as palavras aqui
 * acionam as regras de público iniciante do pacote de IA). Vazio quando nada foi marcado.
 */
export function briefProfileText(brief: { audienceProfile?: AudienceProfile; level?: AudienceLevel; traits?: readonly AudienceTrait[]; interaction?: { guidedChoices?: boolean; voiceTraining?: boolean; noWriting?: boolean } }): string {
  const parts: string[] = [];
  if (brief.audienceProfile === 'first_job') parts.push('primeiro emprego ou estágio (jovem candidato, sem experiência formal)');
  else if (brief.audienceProfile === 'experienced') parts.push('já trabalhou na área');
  else if (brief.audienceProfile === 'career_change') parts.push('mudança de área (experiência em outra função)');
  if (brief.level === 'beginner') parts.push('nível iniciante');
  else if (brief.level === 'intermediate') parts.push('nível intermediário');
  const traits = brief.traits ?? [];
  if (traits.includes('shy')) parts.push('público tímido/introvertido: decisões por escolha, voz opcional, nada de escrita obrigatória');
  if (traits.includes('low_time')) parts.push('pouco tempo: cenas curtas e diretas');
  if (traits.includes('low_reading')) parts.push('lê pouco: frases curtas, texto mínimo na tela, fala clara');
  if (traits.includes('accessibility')) parts.push('precisa de acessibilidade: linguagem simples, sem depender só de cor ou de áudio');
  const i = brief.interaction;
  if (i) {
    const fmt: string[] = [];
    if (i.guidedChoices) fmt.push('escolhas guiadas');
    if (i.voiceTraining) fmt.push('treino de voz opcional');
    if (i.noWriting) fmt.push('sem escrita obrigatória');
    if (fmt.length) parts.push(`formato de interação: ${fmt.join(', ')}`);
  }
  return parts.join('; ');
}

/** Apresentação padrão do curso: apresentador (avatar), voz e ambiente. Ajustável por cena. */
/** Elenco fixo do curso: evita nomes e fatos contraditórios entre aulas. */
export const CastMemberSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.string().max(120).default(''),
  /** ficha: empresa, vaga, formação, formato e data da entrevista, etc. */
  details: z.string().max(600).default(''),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

export const PRESENTER_PLACEMENTS = ['center', 'right', 'left'] as const;
export const PresenterPlacementSchema = z.enum(PRESENTER_PLACEMENTS);
export type PresenterPlacement = z.infer<typeof PresenterPlacementSchema>;
export const PRESENTER_PLACEMENT_LABELS: Record<PresenterPlacement, string> = { center: 'Centro', right: 'Direita', left: 'Esquerda' };
/** Limites da posição livre da apresentadora (fração do quadro). */
export const PRESENTER_X_MIN = 0.15;
export const PRESENTER_X_MAX = 0.85;
export const PRESENTER_BOTTOM_MIN = 0.5;
/** Faixa do balcão/mesa: fração da altura a partir da qual a imagem cobre a apresentadora. */
export const FOREGROUND_FROM_MIN = 0.5;
export const PRESENTER_HEADROOM_MIN = 0.05;
export const PRESENTER_HEADROOM_MAX = 0.08;
export const PRESENTER_GRADES = ['none', 'warm', 'cool'] as const;
export type PresenterGrade = (typeof PRESENTER_GRADES)[number];
export const PRESENTER_GRADE_LABELS: Record<PresenterGrade, string> = { none: 'Sem ajuste', warm: 'Mais quente', cool: 'Mais fria' };

/** Janela de enquadramento do cenário (frações da imagem). */
export const BackdropFrameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.1).max(1),
  h: z.number().min(0.1).max(1),
});
export type BackdropFrame = z.infer<typeof BackdropFrameSchema>;

export const PresentationSchema = z.object({
  avatarId: z.string().max(120).optional(),
  avatarName: z.string().max(120).optional(),
  avatarPreviewUrl: z.string().max(1000).optional(),
  /** gênero do apresentador: pronome dos pedidos de cena em movimento e das instruções da IA */
  presenterPronoun: PresenterPronounSchema.default('she'),
  voiceProvider: z.enum(['heygen', 'elevenlabs']).optional(),
  voiceId: z.string().max(120).optional(),
  voiceName: z.string().max(120).optional(),
  background: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('color'), value: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().max(60).optional() }),
      z.object({
        type: z.literal('image'),
        assetId: z.string().max(64),
        name: z.string().max(60).optional(),
        /**
         * cenário com balcão/mesa: fração da altura a partir da qual a faixa da
         * própria imagem é montada POR CIMA da apresentadora (ela aparece atrás
         * do balcão). Só vale com a apresentadora montada por nós (direita/esquerda).
         */
        foregroundFrom: z.number().min(FOREGROUND_FROM_MIN).max(1).optional(),
        /**
         * enquadramento do cenário: janela de recorte (frações da imagem, 16:9 na
         * montagem — a largura manda e a altura sai da proporção). Ausente =
         * imagem inteira (cobertura centralizada).
         */
        frame: BackdropFrameSchema.optional(),
        /** false = cenário já tratado (sem o desfoque leve de profundidade da montagem); ausente = desfoque leve, como antes */
        blur: z.boolean().optional(),
      }),
    ])
    .default({ type: 'color', value: '#F7F8FA' }),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  /** tipo do visual no HeyGen (photo_avatar | studio_avatar | digital_twin) — define quais controles de movimento valem */
  avatarType: z.string().max(40).optional(),
  /** expressividade facial (HeyGen Avatar IV, apenas photo_avatar) */
  expressiveness: z.enum(['low', 'medium', 'high']).default('high'),
  /** recorta o fundo da foto para aplicar o ambiente escolhido */
  removeBackground: z.boolean().default(true),
  /**
   * onde a apresentadora aparece no quadro. `center` = vídeo do HeyGen como sai
   * (avatar centralizado, fundo aplicado pelo HeyGen). `right`/`left` = vídeo com
   * fundo transparente montado por nós sobre o fundo escolhido, ao lado do quadro
   * (como alguém sentado à direita numa chamada de vídeo).
   */
  presenterPlacement: PresenterPlacementSchema.default('center'),
  /** altura da apresentadora em relação à altura do quadro (só com posição direita/esquerda) */
  presenterScale: z.number().min(0.5).max(1.2).default(0.92),
  /** centro horizontal da apresentadora (fração da largura); presente, sobrepõe o predefinido direita/esquerda */
  presenterX: z.number().min(PRESENTER_X_MIN).max(PRESENTER_X_MAX).optional(),
  /** onde fica a base do recorte (fração da altura); ausente = 1 (base do quadro). Com balcão, a linha do tampo. */
  presenterBottom: z.number().min(PRESENTER_BOTTOM_MIN).max(1).optional(),
  /** folga acima da cabeça (fração da altura): presente, o tamanho é derivado para o topo da cabeça cair nessa linha */
  presenterHeadroom: z.number().min(PRESENTER_HEADROOM_MIN).max(PRESENTER_HEADROOM_MAX).optional(),
  /** harmonização de cor suave só da camada da apresentadora (montagem nossa) */
  presenterGrade: z.enum(PRESENTER_GRADES).optional(),
  /** kit de câmeras (looks do mesmo apresentador); a primeira é a principal */
  cameras: z.array(CameraSchema).max(16).default([]),
  directionStyle: DirectionStyleSchema.prefault({}),
});
export type Presentation = z.infer<typeof PresentationSchema>;

export const NARRATIVE_VOICE_LABELS = {
  second_person: 'Você no centro: o aluno vive a situação',
  presenter: 'Apresentador conversa com você e comenta casos',
  third_person: 'O aluno acompanha personagens',
} as const;

/**
 * Trilha de montagem (versão 2): ideia e público → material → estrutura → aulas →
 * apresentação → prévia (testar) → produção (vídeos) → revisão (publicar).
 */
export const WIZARD_STEPS = ['tema', 'conteudo', 'estrutura', 'aulas', 'apresentacao', 'previa', 'producao', 'revisao'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
/** Versão atual da trilha; rascunhos sem `trailVersion` vieram da trilha 1 (6 passos) e passam por `migrateWizardState`. */
export const WIZARD_TRAIL_VERSION = 2;

const WizardStateObjectSchema = z.object({
  step: z.enum(WIZARD_STEPS).default('tema'),
  completedSteps: z.array(z.enum(WIZARD_STEPS)).default([]),
  contentMode: z.enum(['none', 'paste', 'upload', 'generate']).default('none'),
  /** true quando o autor concluiu o assistente (a página do curso deixa de redirecionar) */
  finished: z.boolean().default(false),
  /** versão da trilha em que o rascunho foi gravado (ver `migrateWizardState`) */
  trailVersion: z.number().int().min(1).default(WIZARD_TRAIL_VERSION),
});
export type WizardState = z.infer<typeof WizardStateObjectSchema>;

const isStep = (x: unknown): x is WizardStep => typeof x === 'string' && (WIZARD_STEPS as readonly string[]).includes(x);

/**
 * Migração pura da trilha 1 (tema → conteúdo → estrutura → apresentação → aulas →
 * revisão, onde "revisão" juntava vídeos e publicação) para a trilha 2.
 * - passos desconhecidos são descartados; passo atual inválido volta para `tema`;
 * - rascunho já publicado (`finished`) ganha os passos novos como concluídos;
 * - rascunho parado na antiga "revisão" (vídeos + publicar) passa a `previa`: o
 *   próximo ato é testar o curso antes de produzir e publicar.
 * Documentos já na trilha 2 só são saneados.
 */
export function migrateWizardState(input: unknown): WizardState {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const legacy = raw.trailVersion === undefined;
  let step: WizardStep = isStep(raw.step) ? raw.step : 'tema';
  const completed = new Set<WizardStep>(Array.isArray(raw.completedSteps) ? raw.completedSteps.filter(isStep) : []);
  const finished = raw.finished === true;
  if (legacy) {
    if (finished) for (const s of WIZARD_STEPS) completed.add(s);
    else if (step === 'revisao') {
      step = 'previa';
      completed.delete('revisao');
    }
  }
  const contentMode = raw.contentMode === 'paste' || raw.contentMode === 'upload' || raw.contentMode === 'generate' ? raw.contentMode : 'none';
  return { step, completedSteps: WIZARD_STEPS.filter((s) => completed.has(s)), contentMode, finished, trailVersion: WIZARD_TRAIL_VERSION };
}

/** Progresso do assistente de montagem; não afeta execução. Rascunhos antigos são migrados ao analisar. */
export const WizardStateSchema = z.preprocess(migrateWizardState, WizardStateObjectSchema);

export const BUMPER_PLAY_ON = ['lesson_end', 'course_end'] as const;
export type BumperPlayOn = (typeof BUMPER_PLAY_ON)[number];
export const BUMPER_PLAY_ON_LABELS: Record<BumperPlayOn, string> = { lesson_end: 'No fim de cada aula', course_end: 'No fim do curso' };

/** Vinheta da marca no player: qual asset (16:9 e, opcional, 9:16), quando tocar e se pode pular. */
export const BumperBrandingSchema = z.object({
  /** vídeo 16:9 (asset do workspace); ausente = vinheta padrão do workspace */
  assetId: z.string().max(64).optional(),
  /** vídeo 9:16 para telas em pé (opcional) */
  assetIdVertical: z.string().max(64).optional(),
  playOn: z.array(z.enum(BUMPER_PLAY_ON)).default(['course_end']),
  skippable: z.boolean().default(true),
});
export type BumperBranding = z.infer<typeof BumperBrandingSchema>;

export const WATERMARK_POSITIONS = ['bottom-right', 'bottom-left'] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];
/** Limites da opacidade da marca d'água (padrão 0,7). */
export const WATERMARK_OPACITY = { min: 0.3, max: 1, default: 0.7 } as const;

/** Marca d'água do logo nos vídeos montados. */
export const WatermarkBrandingSchema = z.object({
  /** ausente = padrão da plataforma (ligada quando a marca tem logo) */
  enabled: z.boolean().optional(),
  position: z.enum(WATERMARK_POSITIONS).default('bottom-right'),
  /** opacidade nos planos do apresentador (0,3–1; padrão 0,7) */
  opacity: z.number().min(WATERMARK_OPACITY.min).max(WATERMARK_OPACITY.max).optional(),
});
export type WatermarkBranding = z.infer<typeof WatermarkBrandingSchema>;

/**
 * Identidade visual do player do aluno. `immersive` (padrão da plataforma) = palco escuro com o vídeo ocupando a tela e a interação sobre ele;
 * `classic` = player antigo de cartões claros (só como alternativa).
 */
export const BrandingSchema = z.object({
  theme: z.enum(['classic', 'immersive']).default('immersive'),
  /** marca curta do curso (ex.: "pode entrar"); o cabeçalho do player não a usa: mostra o logo da plataforma e o nome curto do catálogo */
  wordmark: z.string().max(40).optional(),
  /** texto da ficha do curso (ex.: "Sua próxima entrevista"); não aparece no cabeçalho do player */
  subtitle: z.string().max(60).optional(),
  /** frase do rodapé (ex.: "Uma conversa. Vários caminhos. No seu ritmo.") */
  tagline: z.string().max(120).optional(),
  /** cor de destaque (#rrggbb) */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** legenda de quem aparece no vídeo (ex.: "Marina" / "Sua entrevistadora") */
  presenterName: z.string().max(40).optional(),
  presenterRole: z.string().max(60).optional(),
  /**
   * Vinheta da marca (assinatura animada + sonora) no fim da aula/curso.
   * `assetId` ausente = a vinheta padrão do workspace (asset com
   * `metadata.bumper.default`). Aditivo: documentos sem o campo tocam só no
   * fim do curso quando houver vinheta padrão.
   */
  bumper: BumperBrandingSchema.optional(),
  /**
   * Marca d'água com o logo da plataforma sobre os vídeos MONTADOS (dirigidos):
   * pequena, no rodapé. Ausente = padrão da plataforma (ligada quando o preset
   * `PLATFORM_BRAND` tem logo). Aditivo: só entra no hash da cena quando se aplica.
   */
  watermark: WatermarkBrandingSchema.optional(),
  /**
   * Cores dos gráficos montados no vídeo (véu das pílulas, cartão "pergunta a
   * seguir", letreiro): `base` = fundo, `accent` = destaque (ícones, barras).
   * Ausente = marinho + laranja da marca. O texto escolhe branco ou marinho
   * pelo contraste com a base. Aditivo: só entra no hash da cena quando definido.
   */
  videoPalette: z
    .object({ base: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
    .optional(),
});
export type Branding = z.infer<typeof BrandingSchema>;

export const CourseDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().min(1).max(160),
  /** descrição para a equipe (briefing, catálogo interno); não aparece para o aluno quando há `learnerSummary` */
  description: z.string().max(2000).default(''),
  /**
   * Resumo para o ALUNO (segunda pessoa, uma ou duas frases): página do curso.
   * Sem ele, a página do aluno usa `description`.
   */
  learnerSummary: z.string().max(400).optional(),
  brief: CourseBriefSchema.prefault({}),
  objectives: z.array(ObjectiveSchema).max(50).default([]),
  modules: z.array(ModuleSchema).max(30).default([]),
  /** critério de conclusão do curso: todas as aulas obrigatórias concluídas */
  completion: z.object({
    requiredLessonIds: z.array(NodeIdSchema).default([]),
  }).prefault({}),
  /** template de origem, se criado a partir de um modelo */
  templateRef: z.object({ templateId: z.string(), version: z.number().int() }).optional(),
  presentation: PresentationSchema.prefault({}),
  /** identidade visual do player do aluno (marca, tema, frases) */
  branding: BrandingSchema.prefault({}),
  cast: z.array(CastMemberSchema).max(12).default([]),
  wizard: WizardStateSchema.prefault({}),
  /** fontes vinculadas (source_documents) */
  sourceIds: z.array(z.string().max(64)).default([]),
});
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;

export function emptyCourseDocument(title: string): CourseDocument {
  return CourseDocumentSchema.parse({ schemaVersion: SCHEMA_VERSION, title });
}

export function findLesson(doc: CourseDocument, lessonId: string): { module: Module; lesson: Lesson } | undefined {
  for (const module of doc.modules) {
    const lesson = module.lessons.find((l) => l.id === lessonId);
    if (lesson) return { module, lesson };
  }
  return undefined;
}

export function allLessons(doc: CourseDocument): Lesson[] {
  return doc.modules.flatMap((m) => m.lessons);
}

/**
 * Aulas OBRIGATÓRIAS para concluir o curso nesta matrícula: as de `completion.requiredLessonIds` (ou todas, se vazio),
 * menos as `optionalLessonIds` da matrícula (aulas acrescentadas depois de a pessoa concluir: conteúdo novo, opcional).
 */
export function requiredLessonIdsFor(doc: CourseDocument, optionalLessonIds: Iterable<string> = []): string[] {
  const optional = new Set(optionalLessonIds);
  const base = doc.completion.requiredLessonIds.length > 0 ? doc.completion.requiredLessonIds : allLessons(doc).map((l) => l.id);
  return base.filter((id) => !optional.has(id));
}

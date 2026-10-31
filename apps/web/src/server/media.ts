import { createHash } from 'node:crypto';
import { DomainError, media } from '@lms/db';
import { mediaSceneOf, CINEMATIC_MAX_SECONDS, cameraPlacementHashPart, clampFullFrameShots, directionNarration, findLesson, firstNarratedNodeId, nextDecisionQuestion, presentationFingerprint, resolveCameraPlacement, richTextToPlain, shotIsCinematic, singleShotPlacementParams, zoneCamerasOf, type BackdropFrame, type CourseDocument, type LessonGraph, type Presentation, type PresenterGrade, type SceneDirection } from '@lms/course-schema';
import { COMPOSE_PIPELINE_VERSION, ELEVENLABS_ADAPTER_VERSION, ElevenLabsAdapter, HEYGEN_ADAPTER_VERSION, HeyGenAdapter, describeMediaMode, directionLinesMatchSpoken, estimateMediaCostUsd, estimateNarrationSeconds, mediaConfigFromEnv, platformBrandName, resolveWatermark, sceneHashSync, singleShotAlphaKey, type MediaProviderConfig } from '@lms/media';

let modeLogged = false;
/** Loga o modo resolvido (demo/real) uma vez por processo, só nomes (nunca chaves). */
export function logMediaModeOnce(cfg: MediaProviderConfig) {
  if (modeLogged) return;
  modeLogged = true;
  console.log(`[web] ${describeMediaMode(cfg)}`);
}

export function getMediaConfig() {
  const cfg = mediaConfigFromEnv();
  logMediaModeOnce(cfg);
  return cfg;
}

export function getHeyGen(): HeyGenAdapter | null {
  const cfg = getMediaConfig();
  return cfg.heygenApiKey && !cfg.simulation ? new HeyGenAdapter(cfg.heygenApiKey) : null;
}

export function getElevenLabs(): ElevenLabsAdapter | null {
  const cfg = getMediaConfig();
  return cfg.elevenLabsApiKey && !cfg.simulation ? new ElevenLabsAdapter(cfg.elevenLabsApiKey) : null;
}

/** Catálogo simulado, explicitamente identificado, para o modo de demonstração. */
export const SIMULATED_AVATARS = [
  { id: 'sim_avatar_ana', name: 'Ana (simulado)', avatarType: 'simulated', previewImageUrl: undefined, previewVideoUrl: undefined, gender: 'female', defaultVoiceId: 'sim_voice_ana' },
  { id: 'sim_avatar_joao', name: 'João (simulado)', avatarType: 'simulated', previewImageUrl: undefined, previewVideoUrl: undefined, gender: 'male', defaultVoiceId: 'sim_voice_joao' },
];
export const SIMULATED_VOICES = [
  { id: 'sim_voice_ana', name: 'Ana pt-BR (simulada)', language: 'pt-BR', previewUrl: undefined },
  { id: 'sim_voice_joao', name: 'João pt-BR (simulada)', language: 'pt-BR', previewUrl: undefined },
];

/** Impressão do rascunho cotado: o lote recusa quando o documento mudou (mesmo que a revisão coincida por acaso). */
export function draftFingerprint(doc: CourseDocument): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

export const SCRIPT_MAX_CHARS = 5000;
export const MEDIA_NODE_TYPES = new Set(['scenario', 'content', 'choice', 'consequence']);

/** Texto falado de um nó (narração própria, senão o texto do bloco). */
export function spokenTextOfNode(node: Record<string, unknown> & { type: string }): string {
  const n = node as { type: string; body?: unknown; prompt?: unknown; narration?: unknown };
  const nodeText = n.type === 'scenario' || n.type === 'content' || n.type === 'consequence' ? richTextToPlain(n.body as never) : n.type === 'choice' ? richTextToPlain(n.prompt as never) : '';
  return typeof n.narration === 'string' && n.narration.trim() ? n.narration : nodeText;
}

export interface SceneProductionRequest {
  lessonId: string;
  nodeId: string;
  avatarId: string;
  voiceProvider: 'heygen' | 'elevenlabs';
  voiceId: string | null;
  /** roteiro; se omitido, usa o texto do bloco (ignorado quando há direção) */
  script?: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  backgroundColor: string;
  backgroundAssetId?: string;
  /** cenário com balcão: faixa da imagem por cima da apresentadora (fração da altura); só com imagem */
  foregroundFrom?: number;
  /** enquadramento do cenário (janela, frações da imagem); só com imagem */
  backgroundFrame?: BackdropFrame;
  /** false = cenário já tratado, sem o desfoque leve da montagem */
  backgroundBlur?: boolean;
  /** harmonização de cor da apresentadora (montagem nossa) */
  presenterGrade?: PresenterGrade;
}

/**
 * Extras do fundo/cor que valem na montagem NOSSA (apresentadora à direita/esquerda).
 * Do pedido; quando o pedido omite e a imagem é a da apresentação do curso, os
 * da apresentação (clientes antigos continuam coerentes com o estúdio). Só
 * entram em `params` quando definidos — cenas sem eles mantêm o hash de antes.
 */
export function backgroundExtras(pres: Presentation, body: Pick<SceneProductionRequest, 'backgroundAssetId' | 'foregroundFrom' | 'backgroundFrame' | 'backgroundBlur' | 'presenterGrade'>): { foregroundFrom?: number; backgroundFrame?: BackdropFrame; backgroundBlur?: false; presenterGrade?: Exclude<PresenterGrade, 'none'> } {
  const bg = pres.background;
  const same = !!body.backgroundAssetId && bg.type === 'image' && bg.assetId === body.backgroundAssetId;
  const out: ReturnType<typeof backgroundExtras> = {};
  if (body.backgroundAssetId) {
    const fg = body.foregroundFrom ?? (same ? bg.foregroundFrom : undefined);
    const fr = body.backgroundFrame ?? (same ? bg.frame : undefined);
    const blur = body.backgroundBlur ?? (same ? bg.blur : undefined);
    if (fg !== undefined) out.foregroundFrom = fg;
    if (fr) out.backgroundFrame = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
    if (blur === false) out.backgroundBlur = false;
  }
  const grade = body.presenterGrade ?? pres.presenterGrade;
  if (grade && grade !== 'none') out.presenterGrade = grade;
  return out;
}

export interface SceneEstimate {
  characters: number;
  narrationSeconds: number;
  elevenLabsCredits: number;
  /** custo ESTIMADO em USD pela tabela (MEDIA_PRICES_JSON); null só quando não há como estimar */
  estimatedUsd: number;
  cinematicShots: number;
  cinematicSeconds: number;
  matchCinematicSetting?: boolean;
  presenterPronoun?: string;
  note: string;
}

export interface ResolvedScene {
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  title: string;
  script: string;
  sceneHash: string;
  adapterVersion: string;
  estimate: SceneEstimate;
  /** entrada completa do job (o que `media.createJob` grava em `input`) */
  jobInput: Record<string, unknown>;
}

/**
 * Reaproveitamento PARCIAL de uma cena dirigida (orçamento): o worker guarda cada
 * plano pago com uma chave (fala, câmera, gesto, voz, visual) e, ao refazer a
 * cena, copia os planos idênticos de graça — só os planos novos são gravados
 * (ex.: a chamada para a pergunta acrescentada como plano final; ver
 * `bridge.ts`). Compara os planos do vídeo já pago (`prev`, entrada do job) com
 * os da cena atual. Conservador: devolve null (custo cheio) quando a voz, o
 * adaptador ou a apresentação mudaram, quando um plano novo é cena em movimento
 * ou curto demais (o worker o fundiria a um vizinho já pago) ou quando nada
 * seria reaproveitado.
 */
export interface PartialReuse {
  fromJobId: string;
  reusedShots: number;
  newShots: number;
  chars: number;
  seconds: number;
  estimatedUsd: number;
}

type ShotLike = { line: string; cameraId?: string | null; motionPrompt?: string | null; layout?: string | null };
const shotReuseKey = (s: ShotLike) => JSON.stringify([s.line.replace(/\s+/g, ' ').trim(), s.cameraId ?? '', s.motionPrompt?.trim() ?? '', s.layout ?? 'presenter']);
/** Menos palavras que isto e o worker funde o plano ao vizinho (MIN_UNIT_SECONDS 1,2 s a 2,5 palavras/s), mudando a chave do item pago. */
const MIN_FRESH_SHOT_WORDS = 4;

export function directedPartialReuse(
  prev: { jobId: string; input: Record<string, unknown>; adapterVersion: string; simulated: boolean },
  next: Pick<ResolvedScene, 'jobInput' | 'adapterVersion'>,
  simulated: boolean,
  /**
   * impressão da apresentação ATUAL restrita às câmeras dos planos já pagos: um plano novo numa câmera
   * que o vídeo não usava muda a impressão da cena, mas não as chaves dos planos antigos
   */
  fingerprintForPrevCameras?: string,
): PartialReuse | null {
  const nextDir = next.jobInput.direction as { shots?: ShotLike[] } | undefined;
  const prevDir = prev.input.direction as { shots?: ShotLike[] } | undefined;
  if (!nextDir?.shots?.length || !prevDir?.shots?.length) return null;
  if (prev.adapterVersion !== next.adapterVersion || prev.simulated !== simulated) return null;
  if ((prev.input.voiceId ?? null) !== (next.jobInput.voiceId ?? null) || prev.input.voiceProvider !== next.jobInput.voiceProvider || prev.input.avatarId !== next.jobInput.avatarId) return null;
  const fp = fingerprintForPrevCameras ?? next.jobInput.presentationFingerprint;
  if (!fp || prev.input.presentationFingerprint !== fp) return null;
  const pool = new Map<string, number>();
  for (const s of prevDir.shots) pool.set(shotReuseKey(s), (pool.get(shotReuseKey(s)) ?? 0) + 1);
  const fresh: ShotLike[] = [];
  for (const s of nextDir.shots) {
    const k = shotReuseKey(s);
    const left = pool.get(k) ?? 0;
    if (left > 0) pool.set(k, left - 1);
    else fresh.push(s);
  }
  const reusedShots = nextDir.shots.length - fresh.length;
  if (reusedShots === 0) return null;
  if (fresh.some((s) => s.layout === 'cinematic' || s.line.trim().split(/\s+/).filter(Boolean).length < MIN_FRESH_SHOT_WORDS)) return null;
  const text = fresh.map((s) => s.line.trim()).join(' ');
  const seconds = fresh.length ? estimateNarrationSeconds(text) : 0;
  const chars = text.length;
  const estimatedUsd = fresh.length ? estimateMediaCostUsd({ elevenLabsChars: next.jobInput.voiceProvider === 'elevenlabs' ? chars : 0, heygenSeconds: seconds }) : 0;
  return { fromJobId: prev.jobId, reusedShots, newShots: fresh.length, chars, seconds, estimatedUsd };
}

/**
 * Camadas da cena do ESTÚDIO COM ZONAS (vídeo dirigido num curso com câmeras
 * de zona): a pergunta da decisão seguinte (cartão "A seguir" no fim) e o
 * letreiro com o nome na primeira cena narrada da aula ("Marina · Sua
 * orientadora · DNA Work"). Fora do modo de zonas, nada (o hash das cenas de
 * antes não muda). Cada campo só existe quando se aplica.
 */
export function studioSceneOverlays(doc: Pick<CourseDocument, 'presentation' | 'branding'>, graph: Pick<LessonGraph, 'nodes' | 'edges' | 'startNodeId'>, nodeId: string, directed: boolean, env: NodeJS.ProcessEnv = process.env): { nextQuestion?: string; lowerThird?: { name: string; role?: string; brand?: string } } {
  if (!directed || !zoneCamerasOf(doc.presentation.cameras)) return {};
  const nextQuestion = nextDecisionQuestion(graph, nodeId);
  const name = doc.branding?.presenterName?.trim();
  const role = doc.branding?.presenterRole?.trim();
  const brand = platformBrandName(env.PLATFORM_BRAND, env);
  const lowerThird = name && firstNarratedNodeId(graph) === nodeId ? { name, ...(role ? { role } : {}), ...(brand ? { brand } : {}) } : undefined;
  return { ...(nextQuestion ? { nextQuestion } : {}), ...(lowerThird ? { lowerThird } : {}) };
}

/**
 * Resolve UMA cena para produção: fala atual, direção (validada contra a fala),
 * parâmetros, hash de cena, estimativa de custo e a entrada do job. A mesma
 * regra vale para o pedido avulso, o orçamento e o lote. Lança VALIDATION
 * quando a cena não pode ser produzida. Não consulta o banco.
 */
export function resolveSceneProduction(doc: CourseDocument, body: SceneProductionRequest, cfg: MediaProviderConfig, env: NodeJS.ProcessEnv = process.env): ResolvedScene {
  const found = findLesson(doc, body.lessonId);
  // nó do grafo ou a reação da instrutora a uma resposta (alvo "decisão~opção": cena sintética de plano único; reaction.ts)
  const node = found ? mediaSceneOf(found.lesson.graph, body.nodeId) : null;
  if (!found || !node) throw new DomainError('NOT_FOUND', 'Bloco não encontrado');
  if (!MEDIA_NODE_TYPES.has(node.type)) throw new DomainError('VALIDATION', 'Este tipo de bloco não aceita vídeo');
  const spoken = spokenTextOfNode(node as never);
  const motionPrompt = 'motionPrompt' in node && typeof node.motionPrompt === 'string' ? node.motionPrompt.trim() : '';
  const direction: SceneDirection | undefined = 'direction' in node && node.direction?.shots.length ? node.direction : undefined;
  if (direction) {
    // a direção precisa reproduzir a fala ATUAL da cena (mesmas palavras, na ordem); senão o vídeo sairia com a fala antiga
    const check = directionLinesMatchSpoken(direction.shots.map((s) => s.line), spoken);
    if (!check.ok && check.reason === 'empty_line') throw new DomainError('VALIDATION', `O plano "${direction.shots[check.index!]!.id}" não tem fala (nenhuma palavra). Reconcilie no painel Direção.`);
    if (!check.ok) throw new DomainError('VALIDATION', 'A direção está desatualizada: as falas dos planos não batem com a fala da cena. Reconcilie no painel Direção.');
  }
  // com direção, a fala é a soma dos planos (o áudio é cortado nesses trechos); o roteiro enviado é ignorado
  const script = (direction ? directionNarration(direction) : (body.script ?? spoken)).trim();
  const pres = doc.presentation;
  const isPhoto = (pres.avatarType ?? 'photo_avatar') === 'photo_avatar';
  if (!script) throw new DomainError('VALIDATION', 'O bloco não tem texto para narrar');
  if (script.length > SCRIPT_MAX_CHARS) throw new DomainError('VALIDATION', `Roteiro acima de ${SCRIPT_MAX_CHARS.toLocaleString('pt-BR')} caracteres (limite do HeyGen); divida a cena`);

  const placement = pres.presenterPlacement ?? 'center';
  // câmera principal = a do look do apresentador (mesma regra do worker)
  const mainCamera = pres.cameras.find((c) => c.lookId === body.avatarId);
  const extras = backgroundExtras(pres, body);
  // a montagem nossa (direita/esquerda) acontece no plano único pela câmera principal ou, com direção, em qualquer câmera transparente
  const ownComposition = direction
    ? resolveCameraPlacement(pres, null).transparent || pres.cameras.some((c) => resolveCameraPlacement(pres, c).transparent)
    : resolveCameraPlacement(pres, mainCamera ?? null).transparent;
  const adapterVersion = body.voiceProvider === 'elevenlabs' ? `${HEYGEN_ADAPTER_VERSION}+${ELEVENLABS_ADAPTER_VERSION}` : HEYGEN_ADAPTER_VERSION;
  // cenas em movimento (HeyGen cinematic_avatar): mudas, a narração própria toca por cima — validar antes de cobrar
  const cinematicShots = direction?.shots.filter((s) => s.layout === 'cinematic') ?? [];
  let cinematicSeconds = 0;
  for (const s of cinematicShots) {
    if (!shotIsCinematic(s)) throw new DomainError('VALIDATION', `O plano "${s.id}" é uma cena em movimento sem pedido de câmera; preencha o pedido ou troque o layout`);
    const seconds = s.line.trim().split(/\s+/).filter(Boolean).length / 2.6;
    if (seconds > CINEMATIC_MAX_SECONDS) throw new DomainError('VALIDATION', `A fala do plano "${s.id}" (cena em movimento) passa de ${CINEMATIC_MAX_SECONDS} s; divida a fala em dois planos`);
    cinematicSeconds += seconds;
  }
  if (cinematicShots.length && body.voiceProvider !== 'elevenlabs') throw new DomainError('VALIDATION', 'Cenas em movimento exigem a narração do ElevenLabs (a voz do HeyGen não toca por cima do vídeo); troque a voz ou o layout desses planos');
  const params = {
    aspectRatio: body.aspectRatio,
    backgroundColor: body.backgroundColor,
    backgroundAssetId: body.backgroundAssetId,
    resolution: '1080p',
    engine: 'avatar_iv' as const,
    expressiveness: isPhoto ? pres.expressiveness : undefined,
    motionPrompt: motionPrompt || undefined,
    removeBackground: pres.removeBackground,
    elevenLabsModelId: body.voiceProvider === 'elevenlabs' ? cfg.elevenLabsModelId : undefined,
    elevenLabsStability: body.voiceProvider === 'elevenlabs' ? cfg.elevenLabsStability : undefined,
    // só presente com cena em movimento (não muda o hash das cenas sem ela)
    ...(cinematicShots.length ? { cinematicResolution: (env.MEDIA_CINEMATIC_RESOLUTION === '1080p' ? '1080p' : '720p') as '720p' | '1080p' } : {}),
    // apresentadora à direita/esquerda: vídeo transparente montado sobre o fundo (backgroundAssetId/backgroundColor acima).
    // Só presente fora do centro: as cenas centralizadas mantêm o hash de antes (nada é refeito).
    // Direção: a posição do CURSO (o worker resolve cada plano pela câmera dele). Plano único: a da câmera principal
    // (igual à do curso quando ela é `inherit`, então o hash não muda).
    ...(direction
      ? (placement !== 'center' ? { presenterPlacement: placement, presenterScale: pres.presenterScale ?? 0.92, ...courseFreePlacement(pres) } : {})
      : singleShotPlacementParams(pres, mainCamera)),
    // cenário (faixa do balcão, enquadramento, desfoque) e cor da apresentadora: só na montagem nossa e só quando definidos
    ...(ownComposition ? extras : {}),
  };
  // estilo no hash: só o que muda a SAÍDA (cor dos slides; continuidade só com cena em movimento).
  const matchCinematicSetting = pres.directionStyle.matchCinematicSetting !== false;
  const hashStyle = { slideAccent: pres.directionStyle.slideAccent, ...(cinematicShots.length ? { matchCinematicSetting } : {}) };
  // direção (planos), câmeras usadas e estilo entram no hash: direção diferente = vídeo novo; idêntica = reaproveita
  const directionInput = direction
    ? { direction, cameras: pres.cameras, directionStyle: { ...pres.directionStyle, matchCinematicSetting }, presenterPronoun: pres.presenterPronoun }
    : null;
  // cameraId nulo = câmera principal (o apresentador da apresentação)
  const usedCameraIds = new Set(direction?.shots.map((s) => s.cameraId).filter((x): x is string => Boolean(x)));
  for (const id of usedCameraIds) {
    const cam = pres.cameras.find((c) => c.id === id);
    if (!cam) throw new DomainError('VALIDATION', `A direção usa a câmera "${id}", que não existe mais no kit de câmeras`);
    if ((cam.status ?? 'ready') !== 'ready' || !cam.lookId) throw new DomainError('VALIDATION', `A câmera "${cam.name || id}" ainda não está pronta; espere a geração terminar ou troque a câmera dos planos`);
  }
  // câmera em tela cheia: a montagem nunca dá zoom/movimento digital (enquadramento nativo, estático; mesma regra do
  // worker) — o hash usa os planos EFETIVOS: muda só quando um plano numa câmera full_frame pedia zoom/movimento
  const effectiveShots = direction
    ? clampFullFrameShots(direction.shots, pres, (s) => (s.cameraId ? pres.cameras.find((c) => c.id === s.cameraId) : mainCamera)).shots
    : [];
  // marca d'água do logo: vídeo dirigido (montado por nós) e plano único (o worker grava o logo no clipe pronto);
  // só entra no hash/entrada quando se aplica
  const watermark = resolveWatermark(doc.branding?.watermark, env.PLATFORM_BRAND);
  // estúdio com zonas: pergunta a seguir (próximo nó é decisão) e letreiro com o nome (primeira cena da aula); só quando se aplicam
  const studio = studioSceneOverlays(doc, found.lesson.graph, body.nodeId, !!direction, env);
  // cores dos gráficos montados (véu, pergunta a seguir, letreiro): só no vídeo dirigido e só quando o curso define
  const videoPalette = direction && doc.branding?.videoPalette ? { videoPalette: doc.branding.videoPalette } : {};
  const hashParams = direction
    ? {
        ...params,
        direction: { version: direction.version, shots: effectiveShots },
        ...(watermark ? { watermark } : {}),
        ...studio,
        ...videoPalette,
        // posição por câmera só entra quando difere da do curso (câmeras `inherit` mantêm o hash de antes); zona só quando definida
        cameras: pres.cameras.filter((c) => usedCameraIds.has(c.id)).map((c) => {
          const pl = cameraPlacementHashPart(pres, c);
          return { id: c.id, lookId: c.lookId, nativeFraming: c.nativeFraming, ...(pl ? { placement: pl } : {}), ...(c.zone ? { zone: c.zone } : {}) };
        }),
        // planos na câmera principal: o enquadramento nativo dela muda o recorte da montagem (mesma regra do worker)
        ...(direction.shots.some((s) => !s.cameraId) ? { mainCameraNativeFraming: mainCamera?.nativeFraming ?? 'medium' } : {}),
        ...(direction.shots.some((s) => !s.cameraId) && cameraPlacementHashPart(pres, mainCamera) ? { mainCameraPlacement: cameraPlacementHashPart(pres, mainCamera) } : {}),
        ...(direction.shots.some((s) => !s.cameraId) && mainCamera?.zone ? { mainCameraZone: mainCamera.zone } : {}),
        directionStyle: hashStyle,
        composePipeline: COMPOSE_PIPELINE_VERSION,
      }
    : watermark ? { ...params, watermark } : params;
  const sceneHash = sceneHashSync({ script, avatarId: body.avatarId, voiceProvider: cfg.simulation ? 'simulated' : body.voiceProvider, voiceId: body.voiceId, params: hashParams, adapterVersion });
  const narrationSeconds = estimateNarrationSeconds(script);
  const estimatedUsd = estimateMediaCostUsd({ elevenLabsChars: body.voiceProvider === 'elevenlabs' ? script.length : 0, heygenSeconds: narrationSeconds, cinematicSeconds: Math.round(cinematicSeconds) }, undefined);
  const estimate: SceneEstimate = {
    characters: script.length,
    narrationSeconds,
    elevenLabsCredits: body.voiceProvider === 'elevenlabs' ? script.length : 0,
    estimatedUsd,
    /** cenas em movimento (cinematic_avatar): cobradas à parte e mais caras que um clipe do apresentador */
    cinematicShots: cinematicShots.length,
    cinematicSeconds: Math.round(cinematicSeconds),
    /** com cena em movimento: os outros planos usam o lugar dela como fundo (e esperam por ela) */
    ...(cinematicShots.length ? { matchCinematicSetting, presenterPronoun: pres.presenterPronoun } : {}),
    note: `Custo ESTIMADO pela tabela de preços (MEDIA_PRICES_JSON); os provedores não publicam tabela por vídeo na API — confira a fatura.${cinematicShots.length ? ' Cenas em movimento são cobradas à parte e custam mais.' : ''}`,
  };
  return {
    lessonId: body.lessonId,
    lessonTitle: found.lesson.title,
    nodeId: body.nodeId,
    title: node.title ?? node.id,
    script,
    sceneHash,
    adapterVersion,
    estimate,
    jobInput: { script, avatarId: body.avatarId, voiceProvider: body.voiceProvider, voiceId: body.voiceId, params, estimate, presentationFingerprint: scenePresentationFingerprint(pres, body, extras, usedCameraIds), ...(directionInput ?? {}), ...(watermark ? { watermark } : {}), ...studio, ...videoPalette },
  };
}

/**
 * Impressão da apresentação EFETIVA do pedido (auditoria P1-1): a do curso com o
 * que o pedido sobrepõe (apresentador, voz, fundo, cor). Quando o pedido vem de
 * `sceneRequestFromPresentation`, é idêntica à da apresentação do curso, então
 * o estúdio compara `presentationFingerprint(doc.presentation)` com a gravada
 * na mídia. O worker copia este valor para `media.generatedFrom` ao anexar.
 */
export function scenePresentationFingerprint(pres: Presentation, body: SceneProductionRequest, extras: ReturnType<typeof backgroundExtras>, usedCameraIds: Iterable<string>): string {
  const background: Presentation['background'] = body.backgroundAssetId
    ? { type: 'image', assetId: body.backgroundAssetId, ...(extras.foregroundFrom !== undefined ? { foregroundFrom: extras.foregroundFrom } : {}), ...(extras.backgroundFrame ? { frame: extras.backgroundFrame } : {}), ...(extras.backgroundBlur === false ? { blur: false } : {}) }
    : { type: 'color', value: body.backgroundColor };
  const effective: Presentation = {
    ...pres,
    avatarId: body.avatarId,
    voiceProvider: body.voiceProvider,
    voiceId: body.voiceId ?? undefined,
    aspectRatio: body.aspectRatio,
    background,
    // `backgroundExtras` já resolveu a cor (pedido, senão a do curso; 'none' vira ausente)
    presenterGrade: extras.presenterGrade,
  };
  return presentationFingerprint(effective, { cameraIds: usedCameraIds });
}

/** Posição livre, base e folga do CURSO (direção: cada plano resolve pela câmera dele no worker), só quando definidas. */
function courseFreePlacement(pres: Presentation): { presenterX?: number; presenterBottom?: number; presenterHeadroom?: number } {
  const r = resolveCameraPlacement(pres, null);
  return { ...(r.x !== undefined ? { presenterX: r.x } : {}), ...(r.bottom !== undefined ? { presenterBottom: r.bottom } : {}), ...(r.headroom !== undefined ? { presenterHeadroom: r.headroom } : {}) };
}

/**
 * A cena pode ser REMONTADA sem custo? Só plano único (sem direção) com a
 * apresentadora montada por nós (direita/esquerda): o vídeo transparente já
 * pago com a mesma `alphaKey` serve a qualquer fundo/posição. Devolve a chave.
 */
export function recomposeAlphaKey(scene: Pick<ResolvedScene, 'jobInput' | 'adapterVersion'>): string | null {
  const input = scene.jobInput as { direction?: unknown; params?: Record<string, unknown> };
  const p = input.params?.presenterPlacement;
  if (input.direction || (p !== 'right' && p !== 'left')) return null;
  return singleShotAlphaKey({ adapterVersion: scene.adapterVersion, simulated: 0 }, scene.jobInput as never);
}

/**
 * Entrada do job de remontagem: a cena resolvida (novo fundo/posição, novo hash)
 * + o vídeo transparente, a narração, o alinhamento e as legendas do job de
 * origem. `reusedRawFrom` = nada deste job foi pago; `recomposeOf` = o worker
 * só monta (ffmpeg local), sem provedor, mesmo em modo de demonstração.
 */
export function recomposeJobInput(scene: Pick<ResolvedScene, 'jobInput'>, source: media.MediaJobRow, alphaKey: string): Record<string, unknown> {
  const src = source.input as { rawVideoAssetId: string; rawVideoKind?: string; voiceAssetId?: string; alignment?: unknown; captions?: unknown; presenterKind?: string };
  return {
    ...scene.jobInput,
    recomposeOf: source.id,
    reusedRawFrom: source.id,
    rawVideoAssetId: src.rawVideoAssetId,
    rawVideoKind: src.rawVideoKind ?? (src.presenterKind === 'chroma' ? 'chroma' : 'alpha'),
    alphaKey,
    ...(src.voiceAssetId ? { voiceAssetId: src.voiceAssetId } : {}),
    ...(src.alignment ? { alignment: src.alignment } : {}),
    ...(src.captions ? { captions: src.captions } : {}),
  };
}

/** Pedido de produção de uma cena a partir da apresentação do curso (o que o wizard enviava cena a cena). */
export function sceneRequestFromPresentation(doc: CourseDocument, lessonId: string, nodeId: string): SceneProductionRequest {
  const p = doc.presentation;
  if (!p.avatarId) throw new DomainError('VALIDATION', 'Escolha um apresentador no passo "Apresentação" antes de gerar vídeos');
  return {
    lessonId,
    nodeId,
    avatarId: p.avatarId,
    voiceProvider: p.voiceProvider ?? 'heygen',
    voiceId: p.voiceId ?? null,
    aspectRatio: p.aspectRatio,
    backgroundColor: p.background.type === 'color' ? p.background.value : '#ffffff',
    ...(p.background.type !== 'color' && p.background.assetId ? { backgroundAssetId: p.background.assetId } : {}),
    // cenário e cor: `backgroundExtras` completa a partir da apresentação quando a imagem é a dela
  };
}

/** Legendas gravadas pelo worker no job (`input.captions`), para reaproveitar junto com o vídeo. */
export function reusableCaptions(input: unknown): { assetId: string; lang: string; format: 'vtt'; approx?: boolean } | undefined {
  const c = (input as { captions?: { assetId?: unknown; lang?: unknown; approx?: unknown } } | null)?.captions;
  if (!c || typeof c.assetId !== 'string') return undefined;
  return { assetId: c.assetId, lang: typeof c.lang === 'string' ? c.lang : 'pt-BR', format: 'vtt', ...(c.approx === true ? { approx: true } : {}) };
}

/** Mídia reaproveitada de um job bem-sucedido com o mesmo hash (o que `setNodeMedia` grava no nó). */
export function reusedMediaFor(job: media.MediaJobRow, sceneHash: string, script: string) {
  // o job reaproveitado tem o mesmo hash de cena (mesmo apresentador, voz, fundo e posição): a impressão dele vale para a cena
  const fp = (job.input as { presentationFingerprint?: unknown } | null)?.presentationFingerprint;
  return {
    assetId: job.outputAssetId!, kind: 'video', transcript: script, stale: false,
    generatedFrom: { jobId: job.id, sceneHash, provider: 'heygen', simulated: job.simulated === 1, ...(typeof fp === 'string' && fp ? { presentationFingerprint: fp } : {}) },
    ...(reusableCaptions(job.input) ? { captions: reusableCaptions(job.input) } : {}),
  };
}

export function publicJob(j: media.MediaJobRow) {
  const input = j.input as { avatarId?: unknown; voiceProvider?: unknown; voiceId?: unknown; script?: unknown; estimate?: unknown; recomposeOf?: unknown };
  return {
    id: j.id,
    lessonId: j.lessonId,
    nodeId: j.nodeId,
    kind: j.kind,
    provider: j.provider,
    status: j.status,
    simulated: j.simulated === 1,
    sceneHash: j.sceneHash,
    externalId: j.externalId,
    outputAssetId: j.outputAssetId,
    outputUrl: j.outputAssetId ? `/api/assets/${j.outputAssetId}` : null,
    attempts: j.attempts,
    lastError: j.lastError,
    costEstimatedUsd: j.costEstimatedUsd,
    costActualUsd: j.costActualUsd,
    quoteId: j.quoteId,
    approvedBy: j.approvedBy,
    approvedAt: j.approvedAt,
    input: { avatarId: input.avatarId, voiceProvider: input.voiceProvider, voiceId: input.voiceId, scriptChars: String(input.script ?? '').length, estimate: input.estimate, ...(typeof input.recomposeOf === 'string' ? { recomposeOf: input.recomposeOf } : {}) },
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

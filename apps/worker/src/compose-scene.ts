import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { authoring, getDb, media, schema, newId } from '@lms/db';
import { SceneDirectionSchema, allLessons, chipLabel, panelIconFor, buildCinematicPrompt, cinematicClipSeconds, directionNarration, type Camera, type CameraZone, type PresenterPronoun, type SceneDirection } from '@lms/course-schema';
import { ELEVENLABS_ADAPTER_VERSION, ElevenLabsError, HEYGEN_ADAPTER_VERSION, type WatermarkSpec, HeyGenAdapter, HeyGenError, isTransparentUnsupportedError, mediaConfigFromEnv, type HeyGenCreateInput, type MediaProviderConfig } from '@lms/media';
import {
  CHROMA_KEY_COLOR, ShotLineNotFoundError, appendBumperToVideo, approxWords, composeScene, cutAudioSegments, mapWordsToTimeline, wordsFromAlignment, extractScenePlate, ffprobe, generateMotionStandInClip, generateStandInClip, generateTestClip, generateToneMp3, mapShotTimings, renderCornerTagToFile, renderShotGraphics, syntheticAlignment,
  type CaptionWord, type CharAlignment, type ChipsGraphics, type LoudnessResult, type ShotClip, type ShotTiming, type TimelineShotWords,
} from '@lms/media/compose';
import { attachToNode, downloadVideo, fail, readAsset, simWorkerRealJobMessage, storeGeneratedAsset } from './media';
import { previousSceneAdjust, reapplyAdjustAfterRecording } from './adjust';
import { backgroundKeyTag, gradeFromParams, imageBackground, placeStoredClip, presentationBackground, type PlacementParams } from './placement';
import { JobNotRunningError, PaidButNotStoredError, packWords, storeCaptions, storeWithRetry, synthesizeOnce, unpackWords, type CaptionsRef, type PackedWords } from './narration';
import { CameraNotReadyError, cinematicKey, composeShotsFor, cinematicPlanProblems, estimateLineSeconds, itemKey, placementKeyTag, planRenderUnits, resolveCamera, resolveUnitPlacement, shotRanges, unitOffsets, type RenderUnit, type ShotState, type UnitPlacement } from './compose-plan';

/**
 * Vídeo DIRIGIDO (plano a plano). Um único passo idempotente (`step`) serve ao
 * início, aos retries e à reconciliação; cada etapa grava seu resultado antes da
 * próxima, então qualquer interrupção retoma sem pagar de novo:
 *  1. plano: valida câmeras, agrupa os planos em itens (`clip` = vídeo de avatar;
 *     `audio` = plano `slide`, sem clipe pago) e calcula a chave de cada item;
 *  2. reaproveitamento (grátis): item com a mesma chave já produzido por qualquer
 *     job do workspace (mesmo bloco primeiro) é copiado — editar um plano só refaz ele;
 *  3. narração: UMA síntese com timestamps (ElevenLabs) cobrindo só os itens que
 *     faltam; `voiceAssetId` + `alignment` gravados antes de qualquer outro passo;
 *  4. cortes: áudio por item; `clip` -> upload ao HeyGen; `audio` -> nosso storage;
 *  5. HeyGen: no máximo MAX_SHOTS_IN_FLIGHT clipes em produção por job; a
 *     reconciliação baixa cada clipe pronto e reenvia só o que falhou;
 *  6. `composing`: slides + letreiros + ffmpeg -> asset final -> anexo ao nó.
 * Cena em movimento (`cinematic`): o trecho de áudio fica no nosso storage
 * (como `audio`); depois do corte calcula-se a duração (trecho + 0,5 s, 4–15 s)
 * e a chave do clipe (`videoKey`, sem o áudio), reaproveita-se um clipe igual ou
 * envia-se ao HeyGen `cinematic_avatar` na MESMA janela/idempotência dos clipes.
 * Sem callback (a API rejeita): o polling acompanha. Simulação: substituto local.
 * Continuidade (`directionStyle.matchCinematicSetting`, padrão ligado): com cena
 * em movimento E planos do apresentador no mesmo job, os clipes do apresentador
 * ESPERAM o clipe da cena em movimento; dele sai um quadro desfocado (o "plate",
 * nosso asset de imagem, enviado UMA vez ao HeyGen e gravado em `input.scenePlate`
 * antes de qualquer clipe) que vira o fundo desses clipes (remove_background).
 * A chave desses clipes usa `plate:<videoKey da cena em movimento>`.
 * Apresentadora à direita/esquerda (`params.presenterPlacement`): os clipes do
 * apresentador são pedidos com FUNDO TRANSPARENTE (WebM com alfa; plano B: verde),
 * sem fundo nem espera pelo fundo de continuidade; baixados como `alphaClipAssetId`
 * (chave `alphaKey`, reaproveitável entre posições/fundos) e montados por nós
 * sobre o fundo (continuidade ou apresentação) -> `clipAssetId` com a chave final
 * (inclui posição, tamanho e fundo). Enquadramentos e movimentos da montagem
 * seguem a pessoa (`focusX`). Simulação: substituto opaco recortado ao lado.
 * Posição POR CÂMERA (`camera.placement`, resolvida por item em unitPlacement):
 * câmera sem posição própria (`inherit`) segue o curso, com as mesmas chaves de
 * antes; `center` = vídeo opaco com o fundo da apresentação; `full_frame` = o
 * look em tela cheia com o PRÓPRIO fundo (sem transparência, sem fundo do curso,
 * sem fundo de continuidade; envio com `keepLookBackground` e chave `:ff`).
 * Estado por item em `input.shots[itemId]`, escrito com jsonb atômico e
 * protegido por um lease (`input.leaseUntil`) contra webhook + polling simultâneos.
 */
const MAX_SHOTS_IN_FLIGHT = Number(process.env.MEDIA_MAX_SHOTS_IN_FLIGHT ?? 3);
const LEASE_MS = 20 * 60 * 1000;
const MAX_UNIT_FAILURES = 2;
const MAX_COMPOSE_FAILURES = 3;
const DIRECTED_MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** modelo da cena em movimento (seedance_2 aceita 1080p e 4–15 s) */
const CINEMATIC_MODEL = 'seedance_2' as const;
const W = 1920;
const H = 1080;

export interface DirectedInput {
  script: string;
  avatarId: string;
  voiceProvider: 'heygen' | 'elevenlabs';
  voiceId: string | null;
  params: Record<string, any>;
  direction: SceneDirection;
  cameras?: Camera[];
  directionStyle?: { slideAccent?: string; pace?: string; useSlides?: boolean; matchCinematicSetting?: boolean };
  /** gênero da pessoa apresentadora (entra no pedido da cena em movimento) */
  presenterPronoun?: PresenterPronoun;
  /**
   * Vinheta da marca concatenada ao FIM do vídeo montado (só quando a cena é a
   * última cena narrada da aula). `outroAssetId` = vinheta 16:9 do workspace;
   * ausente = a padrão (`metadata.bumper.default`). Desligado por padrão.
   */
  appendOutro?: boolean;
  outroAssetId?: string;
  /**
   * marca d'água do logo (resolvida no pedido: `branding.watermark` + preset da
   * plataforma; entra no hash da cena). Ausente = sem marca d'água (jobs antigos).
   */
  watermark?: WatermarkSpec;
  /** cores dos gráficos do vídeo (`branding.videoPalette` do curso no pedido; entra no hash só quando definida) */
  videoPalette?: { base: string; accent: string };
  /**
   * estúdio com zonas: pergunta da decisão que vem logo depois desta cena (≤ 12
   * palavras; cartão "A seguir" nos últimos ≈ 3 s). Resolvida no pedido a partir
   * do grafo; entra no hash da cena só quando presente.
   */
  nextQuestion?: string;
  /**
   * estúdio com zonas: letreiro com o nome na primeira cena narrada da aula
   * (0,6–4,5 s): `branding.presenterName/presenterRole` + nome da marca.
   * Entra no hash da cena só quando presente.
   */
  lowerThird?: { name: string; role?: string; brand?: string };
  // ---- estado persistido ----
  units?: RenderUnit[];
  mergedShots?: string[];
  shots?: Record<string, ShotState>;
  /** narração paga deste job: texto, itens cobertos, asset e alinhamento */
  narration?: string;
  narrationKey?: string;
  ttsItems?: string[];
  voiceAssetId?: string;
  voiceSha256?: string;
  alignment?: CharAlignment;
  narrationSeconds?: number;
  elevenLabsCharacterCost?: number;
  heygenBackgroundAssetId?: string;
  /** continuidade: item da cena em movimento cujo lugar vira o fundo dos clipes do apresentador (fixado no plano) */
  scenePlateSource?: string;
  /** fundo de continuidade: nosso asset (imagem), asset no HeyGen (enviado uma vez) e a videoKey de origem */
  scenePlate?: ScenePlate;
  composeFailures?: number;
  /** extração/envio do fundo de continuidade que falharam (3 = desiste e usa o fundo da apresentação) */
  scenePlateFailures?: number;
  /** legendas WebVTT da cena montada */
  captions?: CaptionsRef;
  /** o HeyGen recusou o vídeo transparente para o avatar: clipes pedidos com fundo verde (plano B) */
  presenterKind?: 'chroma';
  /** colheita após estado final: até quando ainda baixar clipes já enviados ao HeyGen */
  harvestUntil?: string;
  harvestDone?: boolean;
  leaseUntil?: string;
  /** dono do lease (token por aquisição): só ele renova ou libera */
  leaseHolder?: string;
}

export interface ScenePlate {
  /** vazio quando a extração falhou antes de existir o quadro (rejected) */
  assetId: string;
  heygenAssetId?: string;
  fromKey: string;
  /** o HeyGen recusou o fundo (4xx): os clipes que faltam usam o fundo da apresentação (sem nova tentativa) */
  rejected?: boolean;
  rejectedReason?: string;
}

export function isDirectedJob(job: { input: unknown }): boolean {
  const d = (job.input as { direction?: { shots?: unknown } } | null)?.direction;
  return !!d && Array.isArray(d.shots) && d.shots.length > 0;
}

export class InvalidDirectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDirectionError';
  }
}

// ---------------- persistência atômica ----------------

const inProcess = new Set<string>();
/** token do lease que ESTE processo detém, por job */
const leaseTokens = new Map<string, string>();

/** Lease do job (webhook + polling + outro worker nunca processam o mesmo job ao mesmo tempo). */
async function acquireLease(jobId: string, statuses: Array<'running' | 'failed' | 'canceled' | 'reconciliation_required'> = ['running']): Promise<boolean> {
  if (inProcess.has(jobId)) return false;
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const token = randomUUID();
  const t = schema.mediaJobs;
  const rows = await getDb()
    .update(t)
    .set({ input: sql`${t.input} || jsonb_build_object('leaseUntil', ${until}::text, 'leaseHolder', ${token}::text)`, updatedAt: new Date() })
    .where(and(eq(t.id, jobId), inArray(t.status, statuses), sql`(${t.input}->>'leaseUntil' is null or (${t.input}->>'leaseUntil')::timestamptz < now())`))
    .returning({ id: t.id });
  if (rows.length === 0) return false;
  inProcess.add(jobId);
  leaseTokens.set(jobId, token);
  return true;
}

/** Renova o lease durante etapas longas (downloads, fundo, montagem) — só se este processo ainda o detém. */
async function renewLease(jobId: string) {
  const token = leaseTokens.get(jobId);
  if (!token) return;
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const t = schema.mediaJobs;
  await getDb()
    .update(t)
    .set({ input: sql`jsonb_set(${t.input}, '{leaseUntil}', to_jsonb(${until}::text))` })
    .where(and(eq(t.id, jobId), sql`${t.input}->>'leaseHolder' = ${token}`));
}

/** Libera o lease só se este processo for o dono (um lease expirado e retomado por outro não é apagado). */
async function releaseLease(jobId: string) {
  inProcess.delete(jobId);
  const token = leaseTokens.get(jobId);
  leaseTokens.delete(jobId);
  if (!token) return;
  const t = schema.mediaJobs;
  await getDb().update(t).set({ input: sql`${t.input} - 'leaseUntil' - 'leaseHolder'` }).where(and(eq(t.id, jobId), sql`${t.input}->>'leaseHolder' = ${token}`));
}

async function patchInput(jobId: string, patch: Record<string, unknown>) {
  const t = schema.mediaJobs;
  await getDb().update(t).set({ input: sql`${t.input} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() }).where(eq(t.id, jobId));
}

async function patchShot(jobId: string, itemId: string, patch: Partial<ShotState>, remove: Array<keyof ShotState> = []) {
  const t = schema.mediaJobs;
  const base = sql`(case when jsonb_typeof(${t.input}->'shots') = 'object' then ${t.input} else ${t.input} || '{"shots":{}}'::jsonb end)`;
  // chaves removidas (lista fixa de campos do ShotState, nunca dado externo)
  const drop = remove.map((k) => sql.raw(` - '${String(k).replace(/[^A-Za-z]/g, '')}'`));
  await getDb()
    .update(t)
    .set({ input: sql`jsonb_set(${base}, array['shots', ${itemId}::text], (coalesce(${t.input}->'shots'->${itemId}::text, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)${sql.join(drop, sql``)})`, updatedAt: new Date() })
    .where(eq(t.id, jobId));
}

async function load(jobId: string) {
  const job = await media.getJob(getDb(), jobId);
  if (!job) throw new Error(`job ${jobId} não encontrado`);
  return { job, input: job.input as unknown as DirectedInput };
}

async function stillRunning(jobId: string) {
  return (await media.getJob(getDb(), jobId))?.status === 'running';
}

function parseDirection(input: DirectedInput): SceneDirection {
  const r = SceneDirectionSchema.safeParse(input.direction);
  if (!r.success) throw new InvalidDirectionError(`direção da cena inválida: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 400)}`);
  return r.data;
}

/**
 * Item já produzido com a mesma chave por qualquer job do workspace; prefere o
 * mesmo bloco e o mais recente. Só conta item concluído (clipe ou segmento no storage).
 */
async function findReusable(job: media.MediaJobRow, field: 'key' | 'videoKey' | 'alphaKey', key: string, need: 'clipAssetId' | 'segmentAssetId' | 'alphaClipAssetId'): Promise<(ShotState & { jobId: string }) | undefined> {
  const rows = await getDb().execute(sql`
    select j.id as job_id, s.value as state
    from media_jobs j, jsonb_each(case when jsonb_typeof(j.input->'shots') = 'object' then j.input->'shots' else '{}'::jsonb end) s
    where j.workspace_id = ${job.workspaceId} and j.id <> ${job.id} and j.simulated = ${job.simulated}
      and s.value->>${field}::text = ${key} and s.value ? ${need}::text
    order by (j.course_id = ${job.courseId} and j.lesson_id = ${job.lessonId} and j.node_id = ${job.nodeId}) desc, j.created_at desc
    limit 1`);
  const r = (rows as unknown as Array<{ job_id: string; state: ShotState }>)[0];
  return r ? { ...r.state, jobId: r.job_id } : undefined;
}

/** Fundo de continuidade já extraído (e de preferência já enviado ao HeyGen) por outro job, a partir do mesmo clipe. */
async function findPlate(job: media.MediaJobRow, fromKey: string): Promise<ScenePlate | undefined> {
  const rows = await getDb().execute(sql`
    select j.input->'scenePlate' as plate
    from media_jobs j
    where j.workspace_id = ${job.workspaceId} and j.id <> ${job.id} and j.simulated = ${job.simulated}
      and j.input->'scenePlate'->>'fromKey' = ${fromKey} and j.input->'scenePlate' ? 'assetId'
      and coalesce((j.input->'scenePlate'->>'rejected')::boolean, false) = false
    order by (j.input->'scenePlate' ? 'heygenAssetId') desc, j.created_at desc
    limit 1`);
  const r = (rows as unknown as Array<{ plate: ScenePlate }>)[0];
  return r?.plate?.assetId ? r.plate : undefined;
}

/** Narração idêntica (mesmo texto + voz) já paga por outro job do workspace. */
async function findPaidNarration(job: media.MediaJobRow, narrationKey: string): Promise<DirectedInput | undefined> {
  const rows = await getDb()
    .select({ input: schema.mediaJobs.input })
    .from(schema.mediaJobs)
    .where(and(eq(schema.mediaJobs.workspaceId, job.workspaceId), eq(schema.mediaJobs.simulated, job.simulated), sql`${schema.mediaJobs.input}->>'narrationKey' = ${narrationKey}`, sql`${schema.mediaJobs.input} ? 'alignment'`, sql`${schema.mediaJobs.id} <> ${job.id}`))
    .limit(1);
  const i = rows[0]?.input as unknown as DirectedInput | undefined;
  return i?.voiceAssetId && i.alignment ? i : undefined;
}

// ---------------- contexto ----------------

interface Ctx {
  cfg: MediaProviderConfig;
  sim: boolean;
  /** há áudio de narração próprio (ElevenLabs ou simulado) para cortar */
  ownAudio: boolean;
  direction: SceneDirection;
  voice: { provider: string; voiceId: string | null; modelId?: string; stability?: number };
  adapterVersion: string;
}

function context(job: media.MediaJobRow, input: DirectedInput, cfg: MediaProviderConfig): Ctx {
  const sim = job.simulated === 1 || cfg.simulation;
  const elevenlabs = input.voiceProvider === 'elevenlabs';
  const p = input.params ?? {};
  return {
    cfg,
    sim,
    ownAudio: sim || elevenlabs,
    direction: parseDirection(input),
    voice: elevenlabs || sim
      ? { provider: sim ? 'simulated' : 'elevenlabs', voiceId: input.voiceId, modelId: p.elevenLabsModelId ?? cfg.elevenLabsModelId, stability: p.elevenLabsStability ?? cfg.elevenLabsStability }
      : { provider: 'heygen', voiceId: input.voiceId },
    adapterVersion: elevenlabs ? `${HEYGEN_ADAPTER_VERSION}+${ELEVENLABS_ADAPTER_VERSION}` : HEYGEN_ADAPTER_VERSION,
  };
}

function unitCamera(input: DirectedInput, u: RenderUnit) {
  return resolveCamera(input.cameras, u.cameraId, input.avatarId);
}

/** Zona da câmera do item (estúdio com zonas): a da câmera dele, ou a da principal; ausente = câmera comum. */
export function unitZone(input: Pick<DirectedInput, 'cameras' | 'avatarId'>, u: Pick<RenderUnit, 'cameraId'>): CameraZone | undefined {
  const list = input.cameras ?? [];
  const cam = u.cameraId ? list.find((c) => c.id === u.cameraId) : list.find((c) => c.lookId === input.avatarId);
  return cam?.zone;
}

/** Posição resolvida do item: a da câmera dele (`inherit` = a do curso em `params`). */
function unitPlacement(input: DirectedInput, u: Pick<RenderUnit, 'cameraId'>): UnitPlacement {
  return resolveUnitPlacement(input.cameras, u.cameraId, input.avatarId, input.params);
}

/** Item de apresentador com vídeo transparente montado por nós (direita/esquerda); null = vídeo opaco do HeyGen. */
function placedFor(input: DirectedInput, u: Pick<RenderUnit, 'cameraId' | 'kind'>): PlacementParams | null {
  if (u.kind !== 'clip') return null;
  const p = unitPlacement(input, u);
  if (!p.transparent) return null;
  const grade = gradeFromParams(input.params);
  return { placement: p.placement as 'right' | 'left', scale: p.scale, ...(p.x !== undefined ? { x: p.x } : {}), ...(p.bottom !== undefined ? { bottom: p.bottom } : {}), ...(p.headroom !== undefined ? { headroom: p.headroom } : {}), ...(grade ? { grade } : {}) };
}

/** Item em tela cheia com o fundo do próprio look (nada de fundo do curso nem de continuidade). */
function fullFrameFor(input: DirectedInput, u: Pick<RenderUnit, 'cameraId' | 'kind'>): boolean {
  return u.kind === 'clip' && unitPlacement(input, u).placement === 'full_frame';
}

/** Os clipes do apresentador deste job usam (ou esperam) o fundo de continuidade. */
function usesPlate(input: Pick<DirectedInput, 'scenePlateSource' | 'scenePlate'>): boolean {
  return !!input.scenePlateSource && !input.scenePlate?.rejected;
}

/** Este item usa (ou espera) o fundo de continuidade: tela cheia nunca (tem o fundo do próprio look). */
function unitUsesPlate(input: DirectedInput, u: Pick<RenderUnit, 'cameraId' | 'kind'>): boolean {
  return usesPlate(input) && !fullFrameFor(input, u);
}

/** videoKey da cena em movimento que dá o fundo (ausente até o corte do áudio dela). */
function plateSourceKey(input: DirectedInput): string | undefined {
  return input.scenePlateSource ? input.shots?.[input.scenePlateSource]?.videoKey : undefined;
}

/**
 * Chave do item. Clipe com fundo de continuidade: `plate:<videoKey>` (sem a
 * videoKey ainda, devolve undefined — a chave é atribuída assim que ela existe).
 */
function keyFor(ctx: Ctx, input: DirectedInput, u: RenderUnit): string | undefined {
  const p = input.params ?? {};
  // cena em movimento: `key` é a do trecho de áudio (o clipe tem `videoKey`, calculada após o corte)
  if (u.kind === 'audio' || u.kind === 'cinematic') return itemKey({ kind: 'audio', text: u.script, voice: ctx.voice, adapterVersion: ctx.adapterVersion, simulated: ctx.sim });
  const pl = unitPlacement(input, u);
  // faixa do balcão e enquadramento só entram na chave quando definidos (chaves antigas inalteradas)
  let background = backgroundKeyTag(p);
  let removeBackground: boolean | undefined = p.removeBackground;
  if (pl.placement === 'full_frame') {
    // fundo do próprio look: nem o da apresentação nem o de continuidade
    background = 'look';
    removeBackground = false;
  } else if (usesPlate(input)) {
    const k = plateSourceKey(input);
    if (!k) return undefined;
    background = `plate:${k}`;
    removeBackground = true;
  }
  return itemKey({
    kind: 'clip', text: u.script, voice: ctx.voice, lookId: unitCamera(input, u).lookId,
    motionPrompt: u.motionPrompt?.trim() || p.motionPrompt, expressiveness: p.expressiveness, removeBackground,
    background,
    engine: p.engine, resolution: '1080p', aspectRatio: '16:9', adapterVersion: ctx.sim ? `${ctx.adapterVersion}+sim-standin-2` : ctx.adapterVersion, simulated: ctx.sim,
    // posição resolvida do item: direita/esquerda (+ tamanho; o fundo já está em `background`) ou tela cheia; centro sem rótulo
    ...(placementKeyTag(pl) ? { placement: placementKeyTag(pl) } : {}),
    // harmonização de cor (só na montagem nossa, direita/esquerda)
    ...(pl.transparent && gradeFromParams(p) ? { grade: gradeFromParams(p) } : {}),
  });
}

/** Chave do vídeo TRANSPARENTE do item (sem fundo nem posição): o mesmo vídeo pago serve a qualquer posição/fundo. */
function alphaKeyFor(ctx: Ctx, input: DirectedInput, u: RenderUnit): string {
  const p = input.params ?? {};
  return itemKey({
    kind: 'clip', text: u.script, voice: ctx.voice, lookId: unitCamera(input, u).lookId,
    motionPrompt: u.motionPrompt?.trim() || p.motionPrompt, expressiveness: p.expressiveness, background: 'transparent',
    engine: p.engine, resolution: '1080p', aspectRatio: '16:9', adapterVersion: ctx.sim ? `${ctx.adapterVersion}+sim-standin-2` : ctx.adapterVersion, simulated: ctx.sim,
  });
}

function cinematicResolution(input: DirectedInput): '1080p' | '720p' {
  return input.params?.cinematicResolution === '720p' ? '720p' : '1080p';
}

/** Item pronto para a montagem (cena em movimento precisa do clipe E do trecho de áudio). */
const done = (u: Pick<RenderUnit, 'kind'>, s: ShotState | undefined) =>
  u.kind === 'cinematic' ? !!(s?.clipAssetId && s?.segmentAssetId) : u.kind === 'clip' ? !!s?.clipAssetId : !!s?.segmentAssetId;

// ---------------- etapas ----------------

/** 1+2: plano de itens (uma vez), chaves e reaproveitamento sem custo. */
async function planAndReuse(jobId: string, ctx: Ctx) {
  const { input } = await load(jobId);
  if (!input.units) {
    // cenas em movimento: pedido de câmera, narração própria e fala de até 15 s — ANTES de qualquer cobrança
    const problems = cinematicPlanProblems(ctx.direction.shots, { hasNarrationAudio: ctx.ownAudio });
    if (problems.length) throw new InvalidDirectionError(problems.join(' '));
    const { units, merged } = planRenderUnits(ctx.direction.shots, { hasNarrationAudio: ctx.ownAudio });
    // valida as câmeras ANTES de qualquer cobrança
    for (const u of units) if (u.kind !== 'audio') unitCamera(input, u);
    if (merged.length) console.warn(`[media] job ${jobId}: planos curtos fundidos ao vizinho para o HeyGen: ${merged.join(', ')}`);
    // continuidade: o lugar da (primeira) cena em movimento vira o fundo dos clipes do apresentador do job
    // (clipes em tela cheia têm o fundo do próprio look: não contam)
    const scenePlateSource = input.directionStyle?.matchCinematicSetting !== false && units.some((u) => u.kind === 'clip' && !fullFrameFor(input, u)) ? units.find((u) => u.kind === 'cinematic')?.id : undefined;
    const planned: DirectedInput = { ...input, units, scenePlateSource };
    const shots: Record<string, ShotState> = {};
    for (const u of units) {
      const key = keyFor(ctx, planned, u);
      const alphaKey = placedFor(planned, u) ? alphaKeyFor(ctx, planned, u) : undefined;
      shots[u.id] = { kind: u.kind, ...(key ? { key } : {}), ...(alphaKey ? { alphaKey } : {}), submitSeq: 0, failures: 0, ...(input.shots?.[u.id] ?? {}) };
    }
    await patchInput(jobId, { units, mergedShots: merged, shots, ...(scenePlateSource ? { scenePlateSource } : {}) });
    if (scenePlateSource) console.log(`[media] job ${jobId}: fundo dos planos = lugar da cena em movimento ${scenePlateSource} (os clipes esperam por ela)`);
  }
  await reuseCinematicSegments(jobId);
  // com o trecho reaproveitado, a chave do clipe da cena em movimento (e as chaves `plate:` dos clipes) já existem
  await ensureCinematicKeys(jobId, ctx);
  await assignKeysAndReuse(jobId, ctx);
}

/** Trecho de áudio da cena em movimento já produzido por outro job (o clipe depende da duração; ver prepareCinematic). */
async function reuseCinematicSegments(jobId: string) {
  const { job, input } = await load(jobId);
  for (const u of input.units ?? []) {
    if (u.kind !== 'cinematic') continue;
    const s = input.shots?.[u.id];
    if (!s?.key || s.segmentAssetId) continue;
    const r = await findReusable(job, 'key', s.key, 'segmentAssetId');
    if (!r) continue;
    await patchShot(jobId, u.id, { segmentAssetId: r.segmentAssetId, segmentSeconds: r.segmentSeconds, ...(r.words ? { words: r.words } : {}) });
    console.log(`[media] job ${jobId}: áudio da cena em movimento ${u.id} reaproveitado de ${r.jobId}`);
  }
}

/** Cena em movimento com o trecho cortado: duração (mínimo da ação ou trecho + 0,5 s), pedido final e chave do clipe. */
async function ensureCinematicKeys(jobId: string, ctx: Ctx) {
  const { input } = await load(jobId);
  for (const u of input.units ?? []) {
    if (u.kind !== 'cinematic') continue;
    const s = input.shots?.[u.id];
    if (!s || s.videoKey || s.segmentSeconds === undefined) continue;
    const cam = unitCamera(input, u);
    const seconds = cinematicClipSeconds(u.cinematicAction, s.segmentSeconds);
    // pedido assertivo: ação + início/fim + passos + corpo inteiro + câmera, montado com a duração real
    const finalPrompt = buildCinematicPrompt({ action: u.cinematicAction, details: u.cinematicPrompt ?? '', durationSeconds: seconds, pronoun: input.presenterPronoun });
    const videoKey = cinematicKey({ prompt: finalPrompt, lookId: cam.lookId, durationSeconds: seconds, model: CINEMATIC_MODEL, resolution: cinematicResolution(input), adapterVersion: HEYGEN_ADAPTER_VERSION, simulated: ctx.sim });
    await patchShot(jobId, u.id, { videoKey, cinematicSeconds: seconds, cinematicFinalPrompt: finalPrompt });
  }
}

/**
 * Chaves que faltam (clipes com fundo de continuidade só ganham chave quando a
 * videoKey da cena em movimento existe) e reaproveitamento grátis de clipes e
 * trechos de slide. Idempotente: roda no plano e de novo depois do corte.
 */
async function assignKeysAndReuse(jobId: string, ctx: Ctx) {
  const { job, input } = await load(jobId);
  for (const u of input.units ?? []) {
    if (u.kind === 'cinematic') continue;
    const s = input.shots?.[u.id];
    if (!s || done(u, s) || s.heygenVideoId) continue;
    if (placedFor(input, u)) {
      await reusePlacedClip(jobId, ctx, job, input, u, s);
      continue;
    }
    const key = s.key ?? keyFor(ctx, input, u);
    if (!key) continue;
    if (!s.key) await patchShot(jobId, u.id, { key });
    // sem fundo de continuidade, como antes: o item já em envio (áudio no HeyGen) segue o envio
    if (s.audioAssetId && !unitUsesPlate(input, u)) continue;
    const need = u.kind === 'audio' ? 'segmentAssetId' : 'clipAssetId';
    const r = await findReusable(job, 'key', key, need);
    if (!r) continue;
    const patch: Partial<ShotState> = u.kind === 'audio'
      ? { segmentAssetId: r.segmentAssetId, segmentSeconds: r.segmentSeconds, reusedFrom: r.jobId, ...(r.words ? { words: r.words } : {}) }
      : { clipAssetId: r.clipAssetId, clipSeconds: r.clipSeconds, offsets: r.offsets, reusedFrom: r.jobId, ...(r.plateBackground ? { plateBackground: true } : {}), ...(r.words ? { words: r.words } : {}) };
    await patchShot(jobId, u.id, patch);
    console.log(`[media] job ${jobId}: item ${u.id} reaproveitado de ${r.jobId} (sem nova cobrança)`);
  }
}

/**
 * Apresentadora posicionada: reaproveita o clipe FINAL igual (mesma fala, visual,
 * posição, tamanho e fundo) ou, sem ele, o vídeo TRANSPARENTE igual (só a
 * montagem é refeita). Nenhum dos dois cobra nada.
 */
async function reusePlacedClip(jobId: string, ctx: Ctx, job: media.MediaJobRow, input: DirectedInput, u: RenderUnit, s: ShotState) {
  const key = s.key ?? keyFor(ctx, input, u);
  if (key && !s.key) await patchShot(jobId, u.id, { key });
  if (key) {
    const r = await findReusable(job, 'key', key, 'clipAssetId');
    if (r) {
      await patchShot(jobId, u.id, { clipAssetId: r.clipAssetId, clipSeconds: r.clipSeconds, offsets: r.offsets, reusedFrom: r.jobId, ...(r.focusX !== undefined ? { focusX: r.focusX } : {}), ...(r.plateBackground ? { plateBackground: true } : {}), ...(r.words ? { words: r.words } : {}) });
      console.log(`[media] job ${jobId}: item ${u.id} (posicionado) reaproveitado de ${r.jobId} (sem nova cobrança)`);
      return;
    }
  }
  if (s.alphaClipAssetId) return; // já baixado: placeClips monta
  const alphaKey = s.alphaKey ?? alphaKeyFor(ctx, input, u);
  if (!s.alphaKey) await patchShot(jobId, u.id, { alphaKey });
  const a = await findReusable(job, 'alphaKey', alphaKey, 'alphaClipAssetId');
  if (!a) return;
  await patchShot(jobId, u.id, { alphaClipAssetId: a.alphaClipAssetId, alphaClipSeconds: a.alphaClipSeconds, alphaKind: a.alphaKind, offsets: a.offsets, reusedAlphaFrom: a.jobId, ...(a.words ? { words: a.words } : {}) });
  console.log(`[media] job ${jobId}: vídeo transparente do item ${u.id} reaproveitado de ${a.jobId} (sem nova cobrança; só a montagem é refeita)`);
}

/** Falhas seguidas da montagem de um clipe sobre o fundo antes de falhar o job (o vídeo pago fica guardado). */
const MAX_PLACE_FAILURES = 3;

/**
 * Apresentadora posicionada: cada vídeo transparente baixado (ou substituto da
 * simulação) é montado sobre o fundo — o de continuidade (espera por ele) ou o da
 * apresentação — e vira o clipe do item, com a chave final. Só ffmpeg local.
 */
async function placeClips(jobId: string, ctx: Ctx): Promise<boolean> {
  const { job, input } = await load(jobId);
  for (const u of input.units ?? []) {
    const placement = placedFor(input, u);
    if (!placement) continue;
    const s = input.shots?.[u.id];
    if (!s?.alphaClipAssetId || s.clipAssetId) continue;
    const onPlate = usesPlate(input);
    // continuidade: espera o quadro da cena em movimento (extraído, sem envio ao HeyGen)
    if (onPlate && !(input.scenePlate?.assetId && input.scenePlate.fromKey === plateSourceKey(input))) continue;
    const key = keyFor(ctx, input, u);
    if (!key) continue;
    const r = await findReusable(job, 'key', key, 'clipAssetId');
    if (r) {
      await patchShot(jobId, u.id, { key, clipAssetId: r.clipAssetId, clipSeconds: r.clipSeconds, reusedFrom: r.jobId, ...(r.focusX !== undefined ? { focusX: r.focusX } : {}), ...(onPlate ? { plateBackground: true } : {}) });
      continue;
    }
    await renewLease(jobId);
    try {
      const placed = await placeStoredClip({
        job, clipAssetId: s.alphaClipAssetId, kind: s.alphaKind ?? 'alpha', placement, transcript: u.script,
        background: (dir) => (onPlate ? imageBackground(input.scenePlate!.assetId, dir) : presentationBackground(input.params, dir, job.workspaceId)),
      });
      await patchShot(jobId, u.id, { key, clipAssetId: placed.assetId, clipSeconds: placed.durationSeconds, focusX: placed.focusX, ...(onPlate ? { plateBackground: true } : input.scenePlateSource ? { plateFallback: true } : {}) });
      console.log(`[media] job ${jobId}: plano ${u.id} montado à ${placement.placement === 'right' ? 'direita' : 'esquerda'} sobre ${onPlate ? 'o fundo da cena em movimento' : 'o fundo da apresentação'}`);
    } catch (e) {
      const msg = `plano ${u.id}: montagem sobre o fundo falhou: ${String(e instanceof Error ? e.message : e)}`.slice(0, 400);
      const n = (s.placeFailures ?? 0) + 1;
      await patchShot(jobId, u.id, { placeFailures: n, lastFailure: msg });
      if (n >= MAX_PLACE_FAILURES) {
        await fail((await load(jobId)).job, msg, false);
        return false;
      }
      await media.updateJob(getDb(), jobId, { lastError: `${msg} (${n}/${MAX_PLACE_FAILURES})` });
    }
  }
  return true;
}

/**
 * Cena em movimento, depois do corte do áudio: duração (mínimo da ação ou
 * trecho + 0,5 s, 4–15 s), chave do clipe, reaproveitamento grátis de um clipe
 * igual e, na simulação, substituto local (vídeo real do apresentador com pan
 * lento + etiqueta, ou testsrc).
 */
async function prepareCinematic(jobId: string, ctx: Ctx) {
  await ensureCinematicKeys(jobId, ctx);
  const { job, input } = await load(jobId);
  const cines = (input.units ?? []).filter((u) => u.kind === 'cinematic');
  if (!cines.length) return;
  let dir: string | null = null;
  let standIn: string | null | undefined;
  let tag: string | undefined;
  try {
    for (const u of cines) {
      const s = input.shots?.[u.id] ?? {};
      if (!s.segmentAssetId || s.segmentSeconds === undefined || !s.videoKey || s.clipAssetId || s.heygenVideoId) continue;
      const r = await findReusable(job, 'videoKey', s.videoKey, 'clipAssetId');
      if (r) {
        await patchShot(jobId, u.id, { clipAssetId: r.clipAssetId, clipSeconds: r.clipSeconds, reusedFrom: r.jobId });
        console.log(`[media] job ${jobId}: cena em movimento ${u.id} reaproveitada de ${r.jobId} (sem nova cobrança)`);
        continue;
      }
      if (!ctx.sim) continue; // vai ao HeyGen em submitWindow
      dir ??= await mkdtemp(path.join(tmpdir(), 'lms-sim-cine-'));
      if (standIn === undefined) standIn = await loadStandInVideo(job, dir);
      tag ??= await renderCornerTagToFile(path.join(dir, 'tag.png'), 'cena em movimento (simulada)');
      const clip = path.join(dir, `cine-${u.id.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`);
      const seconds = s.cinematicSeconds ?? cinematicClipSeconds(u.cinematicAction, s.segmentSeconds ?? 0);
      await generateMotionStandInClip({ output: clip, seconds, sourceVideo: standIn, tagPath: tag });
      const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(clip)), durationSeconds: seconds, transcript: u.script, createdBy: job.createdBy });
      await patchShot(jobId, u.id, { clipAssetId: a.id, clipSeconds: seconds });
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/** Desiste do fundo de continuidade: os clipes que faltam usam o fundo da apresentação. */
const MAX_PLATE_FAILURES = 3;

/**
 * Marca o fundo de continuidade como recusado (definitivo neste job) e refaz a
 * chave dos clipes do apresentador AINDA NÃO enviados: passam a descrever o fundo
 * da apresentação (`plateFallback`, sem `plateBackground`). Clipes já em produção
 * sobre o fundo seguem com a chave `plate:`.
 */
async function rejectPlate(jobId: string, ctx: Ctx, reason: string) {
  const { input } = await load(jobId);
  const plate: ScenePlate = { ...(input.scenePlate ?? { assetId: '', fromKey: plateSourceKey(input) ?? '' }), rejected: true, rejectedReason: reason.slice(0, 300) };
  await patchInput(jobId, { scenePlate: plate });
  const next: DirectedInput = { ...input, scenePlate: plate };
  for (const x of next.units ?? []) {
    const st = next.shots?.[x.id] ?? {};
    // tela cheia não usa fundo de continuidade: a chave dela não muda
    if (x.kind !== 'clip' || st.clipAssetId || st.heygenVideoId || fullFrameFor(next, x)) continue;
    const key = keyFor(ctx, next, x);
    await patchShot(jobId, x.id, { ...(key ? { key } : {}), plateFallback: true }, ['plateBackground']);
  }
}

/** Falha ao extrair/enviar o fundo: registra; na 3ª (ou recusa 4xx no upload) cai no fundo da apresentação. Nunca falha o job. */
async function plateFailure(jobId: string, ctx: Ctx, e: unknown, stage: string) {
  const { input } = await load(jobId);
  const n = (input.scenePlateFailures ?? 0) + 1;
  const msg = `${stage}: ${String(e instanceof Error ? e.message : e)}`.slice(0, 300);
  await patchInput(jobId, { scenePlateFailures: n });
  if (n >= MAX_PLATE_FAILURES || rejectedByHeyGen(e)) {
    console.warn(`[media] job ${jobId}: fundo de continuidade abandonado (${msg}); clipes seguem com o fundo da apresentação`);
    await rejectPlate(jobId, ctx, msg);
    return;
  }
  console.warn(`[media] job ${jobId}: fundo de continuidade falhou (${n}/${MAX_PLATE_FAILURES}): ${msg}`);
  await media.updateJob(getDb(), jobId, { lastError: `fundo de continuidade (${n}/${MAX_PLATE_FAILURES}): ${msg}` });
}

/**
 * Fundo de continuidade: assim que o clipe da cena em movimento está no nosso
 * storage e há clipes do apresentador esperando, extrai o quadro (0,3 s,
 * desfocado, 1920×1080, JPEG), guarda como asset e envia ao HeyGen UMA vez.
 * Cada etapa é gravada antes da próxima (retries reaproveitam; outro job com o
 * mesmo clipe de origem também). Simulação: só o asset (nenhum provedor).
 * Falhas de extração/envio nunca derrubam o job (o clipe pago da cena em
 * movimento continua valendo): depois de 3, os clipes usam o fundo da apresentação.
 */
async function ensureScenePlate(jobId: string, ctx: Ctx, heygen: HeyGenAdapter | null) {
  const { job, input } = await load(jobId);
  if (!usesPlate(input)) return;
  // posicionada: o fundo entra na NOSSA montagem — clipes em produção também esperam por ele; tela cheia nunca espera
  const waiting = (input.units ?? []).filter((u) => u.kind === 'clip' && unitUsesPlate(input, u) && !done(u, input.shots?.[u.id]) && (placedFor(input, u) ? true : !input.shots?.[u.id]?.heygenVideoId));
  if (!waiting.length) return;
  const src = input.shots?.[input.scenePlateSource!];
  if (!src?.clipAssetId || !src.videoKey) return; // a cena em movimento ainda não ficou pronta: os clipes esperam
  let plate: ScenePlate | undefined = input.scenePlate?.fromKey === src.videoKey && input.scenePlate.assetId ? input.scenePlate : undefined;
  if (!plate) {
    await renewLease(jobId);
    const other = await findPlate(job, src.videoKey);
    if (other) {
      plate = { assetId: other.assetId, fromKey: src.videoKey, ...(!ctx.sim && other.heygenAssetId ? { heygenAssetId: other.heygenAssetId } : {}) };
      console.log(`[media] job ${jobId}: fundo de continuidade reaproveitado (${other.assetId})`);
    } else {
      try {
        const clip = await media.getAsset(getDb(), src.clipAssetId);
        if (!clip) throw new Error(`clipe da cena em movimento ${input.scenePlateSource} não encontrado (${src.clipAssetId})`);
        const dir = await mkdtemp(path.join(tmpdir(), 'lms-plate-'));
        try {
          const vf = path.join(dir, 'cine.mp4');
          await writeFile(vf, await readAsset(clip.storageKey));
          const out = await extractScenePlate({ input: vf, output: path.join(dir, 'plate.jpg'), atSeconds: 0.3 });
          const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'image', mime: 'image/jpeg', bytes: new Uint8Array(await readFile(out.output)), createdBy: job.createdBy });
          plate = { assetId: a.id, fromKey: src.videoKey };
          console.log(`[media] job ${jobId}: fundo de continuidade extraído da cena em movimento (${out.atSeconds} s) -> ${a.id}`);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      } catch (e) {
        await plateFailure(jobId, ctx, e, 'extração do fundo');
        return;
      }
    }
    // grava ANTES do upload: um retry nunca extrai de novo
    await patchInput(jobId, { scenePlate: plate });
  }
  // posicionada: o HeyGen nunca recebe o fundo (vídeo transparente); só sobe se algum clipe opaco (centro) vai usá-lo
  if (!heygen || plate.heygenAssetId || !waiting.some((u) => !placedFor(input, u))) return;
  if (!(await stillRunning(jobId))) return; // cancelamento concorrente prevalece
  try {
    await renewLease(jobId);
    const a = await media.getAsset(getDb(), plate.assetId);
    if (!a) throw new Error(`fundo de continuidade ${plate.assetId} não encontrado no storage`);
    const up = await heygen.uploadAsset(await readAsset(a.storageKey), 'image/jpeg');
    // grava ANTES de qualquer clipe: o fundo nunca é enviado duas vezes
    await patchInput(jobId, { scenePlate: { ...plate, heygenAssetId: up.assetId } });
    console.log(`[media] job ${jobId}: fundo de continuidade enviado ao HeyGen (${up.assetId})`);
  } catch (e) {
    await plateFailure(jobId, ctx, e, 'envio do fundo ao HeyGen');
  }
}

/**
 * Simulação com fundo de continuidade: o substituto do apresentador é gerado
 * depois do fundo (por cima dele), a partir do trecho de áudio já guardado.
 */
async function simulatePlateClips(jobId: string) {
  const { job, input } = await load(jobId);
  const onPlate = usesPlate(input) && !!input.scenePlate?.assetId;
  // fundo abandonado: os substitutos que esperavam por ele saem sobre o fundo da apresentação
  const fallback = !!input.scenePlateSource && !!input.scenePlate?.rejected;
  if (!onPlate && !fallback) return;
  // posicionados: o substituto já foi gerado (alfa falso) e é montado em placeClips; tela cheia: gerado direto (sem fundo)
  const todo = (input.units ?? []).filter((u) => u.kind === 'clip' && !placedFor(input, u) && !fullFrameFor(input, u) && !done(u, input.shots?.[u.id]) && input.shots?.[u.id]?.segmentAssetId);
  if (!todo.length) return;
  const db = getDb();
  const plateAsset = onPlate ? await media.getAsset(db, input.scenePlate!.assetId) : null;
  if (onPlate && !plateAsset) throw new Error(`fundo de continuidade ${input.scenePlate!.assetId} não encontrado no storage`);
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-sim-plate-'));
  try {
    const plate = path.join(dir, 'plate.jpg');
    if (plateAsset) await writeFile(plate, await readAsset(plateAsset.storageKey));
    let standIn = await loadStandInVideo(job, dir);
    if (!standIn) standIn = await generateTestClip({ output: path.join(dir, 'testsrc.mp4'), seconds: 6, width: 1280, height: 720, fps: 25 });
    for (const u of todo) {
      const s = input.shots![u.id]!;
      const seg = await media.getAsset(db, s.segmentAssetId!);
      if (!seg) throw new Error(`trecho de áudio do plano ${u.id} não encontrado (${s.segmentAssetId})`);
      const safe = u.id.replace(/[^A-Za-z0-9_-]/g, '_');
      const audio = path.join(dir, `seg-${safe}.${seg.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`);
      await writeFile(audio, await readAsset(seg.storageKey));
      const seconds = s.segmentSeconds ?? (await ffprobe(audio)).durationSeconds;
      const clip = path.join(dir, `sim-${safe}.mp4`);
      // o substituto já tem o fundo do vídeo antigo gravado; sobrepor ao quadro do lugar só confunde a prévia.
      // O caminho do quadro (extração/armazenamento) roda igual; o uso real do fundo só é visível no HeyGen.
      void plate;
      await generateStandInClip({ output: clip, seconds, sourceVideo: standIn, audioPath: audio, startAt: s.simStartAt ?? 0 });
      const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(clip)), durationSeconds: seconds, transcript: u.script, createdBy: job.createdBy });
      await patchShot(jobId, u.id, { clipAssetId: a.id, clipSeconds: seconds, ...(onPlate ? { plateBackground: true } : { plateFallback: true }) });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 3+4: narração única para os itens que faltam; cortes; upload (clip) ou storage (audio). */
async function narrateAndCut(jobId: string, ctx: Ctx, heygen: HeyGenAdapter | null) {
  if (!ctx.ownAudio) return;
  const db = getDb();
  let { job, input } = await load(jobId);
  const units = input.units!;
  const needsAudio = (u: RenderUnit) => {
    const s = input.shots?.[u.id];
    // `audio` e `cinematic`: trecho no nosso storage; `clip`: trecho enviado ao HeyGen
    if (u.kind !== 'clip') return !s?.segmentAssetId;
    // (simulação com fundo de continuidade: o trecho fica no storage até o fundo existir)
    return !done(u, s) && !s?.heygenVideoId && !s?.audioAssetId && !s?.segmentAssetId && !s?.alphaClipAssetId;
  };
  if (!units.some(needsAudio)) return;

  if (!input.voiceAssetId || !input.alignment || !input.ttsItems) {
    let items = units.filter(needsAudio);
    const keyOf = (text: string) => createHash('sha256').update(JSON.stringify({ narration: text, voice: ctx.voice, sim: ctx.sim })).digest('hex');
    let narration = items.map((u) => u.script).join(' ');
    let narrationKey = keyOf(narration);
    await media.updateJob(db, jobId, { phase: 'narrating' });
    let paid = await findPaidNarration(job, narrationKey);
    if (!paid && items.length < units.length) {
      // só parte dos itens precisa de áudio (ex.: slides reaproveitados ao mudar a posição da apresentadora), mas a fala
      // da cena inteira é a mesma de uma narração já paga: reaproveita essa narração completa (os cortes usam só o que falta)
      const full = units.map((u) => u.script).join(' ');
      const whole = await findPaidNarration(job, keyOf(full));
      if (whole) {
        paid = whole;
        items = units;
        narration = full;
        narrationKey = keyOf(full);
      }
    }
    if (paid) {
      await patchInput(jobId, { narration, narrationKey, ttsItems: items.map((u) => u.id), voiceAssetId: paid.voiceAssetId, voiceSha256: paid.voiceSha256, alignment: paid.alignment, narrationSeconds: paid.narrationSeconds });
    } else {
      let audio: Uint8Array;
      let alignment: CharAlignment;
      let characterCost: number | undefined;
      if (ctx.sim) {
        const speech = Math.max(1, items.reduce((a, u) => a + estimateLineSeconds(u.script), 0));
        const dir = await mkdtemp(path.join(tmpdir(), 'lms-sim-tts-'));
        try {
          audio = new Uint8Array(await readFile(await generateToneMp3(path.join(dir, 'n.mp3'), speech + 0.35)));
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        alignment = syntheticAlignment(narration, speech);
      } else {
        if (!ctx.cfg.elevenLabsApiKey) throw new Error('ELEVENLABS_API_KEY ausente');
        if (!input.voiceId) throw new Error('voiceId do ElevenLabs ausente');
        // cancelamento concorrente prevalece: nenhuma narração paga depois dele (synthesizeOnce confere de novo)
        if (!(await stillRunning(jobId))) return;
        await renewLease(jobId);
        // paga no máximo uma vez: o corpo bruto é guardado antes de ser interpretado; retry relê do storage
        const r = await synthesizeOnce(jobId, { text: narration, voiceId: input.voiceId, modelId: ctx.voice.modelId, stability: ctx.voice.stability }, ctx.cfg.elevenLabsApiKey);
        audio = r.audio;
        alignment = r.alignment;
        characterCost = r.characterCost;
      }
      const narrationSeconds = await probeBytes(audio, 'mp3').catch(() => undefined);
      // a resposta paga já está guardada: repetir aqui só repete o storage, nunca a síntese
      const asset = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'audio', mime: 'audio/mpeg', bytes: audio, durationSeconds: narrationSeconds, transcript: narration, createdBy: job.createdBy });
      // grava ANTES de qualquer outro passo: um retry nunca paga a narração de novo
      await patchInput(jobId, { narration, narrationKey, ttsItems: items.map((u) => u.id), voiceAssetId: asset.id, voiceSha256: asset.sha256, alignment, narrationSeconds, elevenLabsCharacterCost: characterCost });
    }
    ({ job, input } = await load(jobId));
  }

  // tempos por PLANO dentro da narração paga (itens cobertos, na ordem)
  const covered = units.filter((u) => input.ttsItems!.includes(u.id));
  const byShot = new Map(ctx.direction.shots.map((s) => [s.id, s]));
  const shotLines = covered.flatMap((u) => u.shotIds.map((id) => ({ id, line: byShot.get(id)!.line })));
  const shotTimings = new Map(mapShotTimings(input.alignment!, shotLines, { totalDuration: input.narrationSeconds }).map((t) => [t.shotId, t]));
  const uncovered = units.filter(needsAudio).filter((u) => !input.ttsItems!.includes(u.id));
  if (uncovered.length) throw new Error(`planos sem áudio na narração paga deste job: ${uncovered.map((u) => u.id).join(', ')}`);
  const todo = covered.filter(needsAudio);
  if (todo.length === 0) return;
  await media.updateJob(db, jobId, { phase: 'uploading' });
  const voice = await media.getAsset(db, input.voiceAssetId!);
  if (!voice) throw new Error(`narração ${input.voiceAssetId} não encontrada no storage`);
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-seg-'));
  try {
    const src = path.join(dir, 'narration.mp3');
    await writeFile(src, await readAsset(voice.storageKey));
    const itemTimings: ShotTiming[] = todo.map((u) => {
      const a = shotTimings.get(u.shotIds[0]!)!;
      const b = shotTimings.get(u.shotIds[u.shotIds.length - 1]!)!;
      return { shotId: u.id, charStart: a.charStart, charEnd: b.charEnd, speechStart: a.speechStart, speechEnd: b.speechEnd, start: a.start, end: b.end, duration: b.end - a.start };
    });
    const segs = await cutAudioSegments({ input: src, timings: itemTimings, outDir: dir, format: ctx.sim ? 'wav' : 'mp3' });
    const allWords = wordsFromAlignment(input.alignment!);
    let standIn: string | null | undefined;
    for (const seg of segs) {
      const u = todo.find((x) => x.id === seg.shotId)!;
      const offsets = unitOffsets(u, shotTimings);
      // palavras do item (tempo relativo ao trecho cortado) para as legendas
      const words = packWords(allWords.filter((w) => w.start >= seg.start - 1e-6 && w.start < seg.end), seg.start);
      await renewLease(jobId);
      const bytes = new Uint8Array(await readFile(seg.path));
      if (u.kind === 'audio' || u.kind === 'cinematic') {
        // plano de slide / cena em movimento: só o áudio, no nosso storage (nunca enviado ao HeyGen)
        const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'audio', mime: ctx.sim ? 'audio/wav' : 'audio/mpeg', bytes, durationSeconds: seg.durationSeconds, transcript: u.script, createdBy: job.createdBy });
        await patchShot(jobId, u.id, { segmentAssetId: a.id, segmentSeconds: seg.durationSeconds, words });
      } else if (ctx.sim && !placedFor(input, u) && unitUsesPlate(input, u)) {
        // simulação com fundo de continuidade: o substituto é gerado depois do fundo (simulatePlateClips)
        const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'audio', mime: 'audio/wav', bytes, durationSeconds: seg.durationSeconds, transcript: u.script, createdBy: job.createdBy });
        await patchShot(jobId, u.id, { segmentAssetId: a.id, segmentSeconds: seg.durationSeconds, offsets, simStartAt: shotTimings.get(u.shotIds[0]!)?.start ?? 0, words });
      } else if (ctx.sim) {
        // apresentador sintético (testsrc2 + o próprio trecho de áudio)
        const clip = path.join(dir, `sim-${u.id.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`);
        if (standIn === undefined) standIn = await loadStandInVideo(job, dir);
        if (standIn) await generateStandInClip({ output: clip, seconds: seg.durationSeconds, sourceVideo: standIn, audioPath: seg.path, startAt: shotTimings.get(u.shotIds[0]!)?.start ?? 0 });
        else await generateTestClip({ output: clip, seconds: seg.durationSeconds, width: 1280, height: 720, fps: 25, audioPath: seg.path });
        const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(clip)), durationSeconds: seg.durationSeconds, transcript: u.script, createdBy: job.createdBy });
        // posicionada: o substituto é o "vídeo transparente" (alfa falso: recorte central) montado depois sobre o fundo;
        // centro e tela cheia: o substituto já é o clipe (opaco, sem alfa)
        if (placedFor(input, u)) await patchShot(jobId, u.id, { alphaClipAssetId: a.id, alphaClipSeconds: seg.durationSeconds, alphaKind: 'opaque', offsets, words });
        else await patchShot(jobId, u.id, { clipAssetId: a.id, clipSeconds: seg.durationSeconds, offsets, words });
      } else {
        const up = await heygen!.uploadAsset(bytes, 'audio/mpeg');
        await patchShot(jobId, u.id, { audioAssetId: up.assetId, offsets, words });
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Modo simulação: procura um vídeo REAL (não simulado) já pago deste
 * apresentador no workspace — de preferência da mesma cena — para servir de
 * substituto visual. Nenhum provedor é chamado. Sem vídeo real, usa testsrc.
 */
export async function loadStandInVideo(job: media.MediaJobRow, dir: string): Promise<string | null> {
  const db = getDb();
  const avatarId = typeof (job.input as { avatarId?: unknown }).avatarId === 'string' ? (job.input as { avatarId: string }).avatarId : null;
  const rows = await db
    .select({ storageKey: schema.assets.storageKey, nodeId: schema.mediaJobs.nodeId })
    .from(schema.mediaJobs)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.mediaJobs.outputAssetId))
    .where(and(
      eq(schema.mediaJobs.workspaceId, job.workspaceId),
      eq(schema.mediaJobs.status, 'succeeded'),
      eq(schema.mediaJobs.simulated, 0),
      eq(schema.assets.kind, 'video'),
      // só vídeos de plano único (sem direção): um vídeo dirigido já montado traria cortes, slides e cenas em movimento
      sql`${schema.mediaJobs.input}->'direction' is null`,
      // e só com o avatar centralizado (um vídeo já montado ao lado sairia recortado errado no substituto)
      sql`${schema.mediaJobs.input}->'params'->>'presenterPlacement' is null`,
      avatarId ? sql`${schema.mediaJobs.input}->>'avatarId' = ${avatarId}` : sql`true`,
    ))
    .orderBy(sql`(${schema.mediaJobs.nodeId} = ${job.nodeId}) desc`, sql`${schema.mediaJobs.createdAt} desc`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    const file = path.join(dir, 'stand-in.mp4');
    await writeFile(file, await readAsset(row.storageKey));
    return file;
  } catch {
    return null;
  }
}

/** 5a: acompanha clipes em produção no HeyGen. Devolve false se o job falhou. */
async function pollInFlight(jobId: string, heygen: HeyGenAdapter): Promise<boolean> {
  const { job, input } = await load(jobId);
  for (const u of input.units ?? []) {
    const s = input.shots?.[u.id] ?? {};
    if (!s.heygenVideoId || done(u, s) || s.clipAssetId || s.alphaClipAssetId) continue;
    const v = await heygen.getVideo(s.heygenVideoId);
    if (v.status === 'completed' && v.videoUrl) {
      await media.updateJob(getDb(), jobId, { phase: 'downloading' });
      await renewLease(jobId);
      const asset = await downloadClip(job, v.videoUrl, v.durationSeconds, u.script);
      // vídeo transparente (ou verde): guardado antes da montagem sobre o fundo (placeClips)
      if (s.placementRequest) await patchShot(jobId, u.id, { alphaClipAssetId: asset.id, alphaClipSeconds: v.durationSeconds, alphaKind: s.placementRequest });
      else await patchShot(jobId, u.id, { clipAssetId: asset.id, clipSeconds: v.durationSeconds });
    } else if (v.status === 'failed') {
      const failures = (s.failures ?? 0) + 1;
      const msg = `plano ${u.id}: ${v.failureCode ?? 'failed'}: ${v.failureMessage ?? 'sem detalhes'}`;
      if (failures >= MAX_UNIT_FAILURES) {
        await patchShot(jobId, u.id, { failures, lastFailure: msg });
        await fail(job, msg, false);
        return false;
      }
      // reenvia só este item (nova Idempotency-Key); os demais seguem
      await patchShot(jobId, u.id, { failures, lastFailure: msg, heygenVideoId: null, submitSeq: (s.submitSeq ?? 0) + 1 });
      await media.updateJob(getDb(), jobId, { lastError: `${msg} — reenviando` });
    }
  }
  return true;
}

/** Idempotency-Key de um envio, derivada só do estado gravado (estável entre passos, retries e processos). */
export function submitKey(requestId: string, itemId: string, s: Pick<ShotState, 'submitSeq' | 'plateFallback'>): string {
  return `${requestId}:${itemId}:${s.submitSeq ?? 0}${s.plateFallback ? ':bg' : ''}`.replace(/[^A-Za-z0-9_:.-]/g, '-').slice(0, 255);
}

/** HeyGen recusou o pedido por causa do conteúdo (4xx que não é concorrência/limite): candidato a cair no fundo da apresentação. */
function rejectedByHeyGen(e: unknown): e is HeyGenError {
  return e instanceof HeyGenError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429;
}

/** 5b: envia itens pendentes respeitando a janela. */
async function submitWindow(jobId: string, ctx: Ctx, heygen: HeyGenAdapter) {
  const { job, input } = await load(jobId);
  const units = input.units!;
  const st = (u: RenderUnit) => input.shots?.[u.id] ?? {};
  let inFlight = units.filter((u) => st(u).heygenVideoId && !st(u).clipAssetId).length;
  const p = input.params ?? {};
  const elevenlabs = input.voiceProvider === 'elevenlabs';
  const pending = units.filter((u) => (u.kind === 'clip' || (u.kind === 'cinematic' && st(u).videoKey)) && !st(u).clipAssetId && !st(u).heygenVideoId && !st(u).alphaClipAssetId);
  /** fundo da apresentação no HeyGen (enviado só quando um clipe vai usá-lo) */
  const presentationBackground = async () => {
    if (p.backgroundAssetId && !input.heygenBackgroundAssetId) {
      const bg = await media.getAsset(getDb(), String(p.backgroundAssetId));
      if (bg && bg.kind === 'image') {
        const up = await heygen.uploadAsset(await readAsset(bg.storageKey), bg.mimeType as 'image/png' | 'image/jpeg' | 'image/webp');
        input.heygenBackgroundAssetId = up.assetId;
        await patchInput(jobId, { heygenBackgroundAssetId: up.assetId });
      }
    }
    return input.heygenBackgroundAssetId;
  };
  for (const u of pending) {
    if (inFlight >= MAX_SHOTS_IN_FLIGHT) break;
    const s = st(u);
    if (u.kind === 'clip' && elevenlabs && !s.audioAssetId) continue;
    // continuidade: o clipe do apresentador espera o fundo (cena em movimento pronta + fundo enviado);
    // posicionada: vídeo transparente, nada a esperar (o fundo entra na montagem); tela cheia: fundo do próprio look
    const placed = placedFor(input, u);
    const fullFrame = fullFrameFor(input, u);
    const onPlate = u.kind === 'clip' && !placed && unitUsesPlate(input, u);
    const plate = onPlate ? input.scenePlate : undefined;
    if (onPlate && !(plate?.heygenAssetId && plate.fromKey === plateSourceKey(input))) continue;
    if (u.kind === 'clip' && !placed) {
      // a chave descreve o que VAI ser enviado agora (fundo de continuidade ou da apresentação);
      // um clipe reenviado depois de o fundo ser recusado ganha a chave do fundo da apresentação
      const key = keyFor(ctx, input, u);
      if (!key) continue;
      const fallback = !fullFrame && !!input.scenePlateSource && !!input.scenePlate?.rejected;
      if (key !== s.key || (fallback && !s.plateFallback) || (!plate && s.plateBackground)) {
        await patchShot(jobId, u.id, { key, ...(fallback ? { plateFallback: true } : {}) }, plate ? [] : ['plateBackground']);
        s.key = key;
        if (fallback) s.plateFallback = true;
        delete s.plateBackground;
      }
    }
    if (!(await stillRunning(jobId))) return; // cancelamento concorrente prevalece
    const cam = unitCamera(input, u);
    // mesma chave em retries do MESMO envio (24h), derivada SÓ do estado gravado; nova chave só após falha do HeyGen
    // (submitSeq) ou com o fundo da apresentação após recusa do fundo de continuidade (`:bg`, plateFallback gravado antes)
    const idempotencyKey = submitKey(job.requestId, u.id, s);
    if (u.kind === 'cinematic') {
      const seconds = s.cinematicSeconds ?? cinematicClipSeconds(u.cinematicAction, s.segmentSeconds ?? 0);
      const created = await heygen.createCinematicVideo({
        title: `${job.courseId}/${job.lessonId}/${job.nodeId}#${u.id} (movimento)`,
        lookIds: [cam.lookId],
        prompt: s.cinematicFinalPrompt ?? buildCinematicPrompt({ action: u.cinematicAction, details: u.cinematicPrompt ?? '', durationSeconds: seconds, pronoun: input.presenterPronoun }),
        durationSeconds: seconds,
        resolution: cinematicResolution(input),
        model: CINEMATIC_MODEL,
        pronoun: input.presenterPronoun,
        idempotencyKey,
      });
      await patchShot(jobId, u.id, { heygenVideoId: created.videoId });
      await media.updateJob(getDb(), jobId, { externalId: created.videoId, phase: 'rendering' });
      console.log(`[media] job ${jobId}: cena em movimento ${u.id} enviada ao HeyGen (${created.videoId}, ${seconds} s)`);
      inFlight++;
      continue;
    }
    const create = (background: { assetId?: string; removeBackground?: boolean }, key: string): HeyGenCreateInput => ({
      title: `${job.courseId}/${job.lessonId}/${job.nodeId}#${u.id}`,
      avatarId: cam.lookId,
      audioAssetId: elevenlabs ? s.audioAssetId : undefined,
      script: elevenlabs ? undefined : u.script,
      voiceId: elevenlabs ? undefined : (input.voiceId ?? undefined),
      aspectRatio: '16:9',
      resolution: '1080p',
      backgroundColor: p.backgroundColor,
      backgroundAssetId: background.assetId,
      engine: p.engine,
      expressiveness: p.expressiveness,
      motionPrompt: u.motionPrompt?.trim() || p.motionPrompt,
      removeBackground: background.removeBackground,
      callbackUrl: ctx.cfg.heygenCallbackUrl,
      callbackId: job.id,
      idempotencyKey: key,
    });
    let created: { videoId: string };
    if (fullFrame) {
      // tela cheia: o look como foi gerado (fundo próprio, MP4 opaco), sem fundo nem recorte; chave própria `:ff`
      created = await heygen.createAvatarVideo({ ...create({}, `${idempotencyKey}:ff`), keepLookBackground: true });
      await patchShot(jobId, u.id, { heygenVideoId: created.videoId });
      await media.updateJob(getDb(), jobId, { externalId: created.videoId, phase: 'rendering' });
      console.log(`[media] job ${jobId}: plano ${u.id} enviado ao HeyGen (${created.videoId}, tela cheia com o fundo do visual)`);
      inFlight++;
      continue;
    }
    if (placed) {
      // vídeo transparente (sem fundo); plano B gravado (`presenterKind`) = fundo verde com chave própria `:ck`
      const chroma = (key: string): HeyGenCreateInput => ({ ...create({ removeBackground: true }, `${key}:ck`), backgroundColor: CHROMA_KEY_COLOR });
      let kind: 'alpha' | 'chroma' = input.presenterKind === 'chroma' ? 'chroma' : 'alpha';
      if (kind === 'chroma') created = await heygen.createAvatarVideo(chroma(idempotencyKey));
      else {
        try {
          created = await heygen.createAvatarVideo({ ...create({}, idempotencyKey), transparent: true });
        } catch (e) {
          if (!isTransparentUnsupportedError(e)) throw e;
          console.warn(`[media] job ${jobId}: HeyGen recusou o vídeo transparente (${e.message}); clipes com fundo verde para recorte`);
          // grava ANTES do novo pedido: retries e os próximos planos usam o plano B com a mesma chave
          await patchInput(jobId, { presenterKind: 'chroma' });
          input.presenterKind = 'chroma';
          if (!(await stillRunning(jobId))) return;
          kind = 'chroma';
          created = await heygen.createAvatarVideo(chroma(idempotencyKey));
        }
      }
      await patchShot(jobId, u.id, { heygenVideoId: created.videoId, placementRequest: kind });
      await media.updateJob(getDb(), jobId, { externalId: created.videoId, phase: 'rendering' });
      console.log(`[media] job ${jobId}: plano ${u.id} enviado ao HeyGen (${created.videoId}, ${kind === 'alpha' ? 'fundo transparente' : 'fundo verde'})`);
      inFlight++;
      continue;
    }
    if (plate?.heygenAssetId) {
      try {
        created = await heygen.createAvatarVideo(create({ assetId: plate.heygenAssetId, removeBackground: true }, idempotencyKey));
        await patchShot(jobId, u.id, { plateBackground: true });
      } catch (e) {
        if (!rejectedByHeyGen(e)) throw e;
        // fundo recusado: UMA queda para o fundo da apresentação (nunca tenta o fundo de novo neste job)
        const reason = `${e.status} ${e.code}: ${e.message}`.slice(0, 300);
        console.warn(`[media] job ${jobId}: HeyGen recusou o fundo de continuidade (${reason}); clipes seguem com o fundo da apresentação`);
        // grava o fundo recusado + chaves/plateFallback dos clipes que faltam ANTES de reenviar: a chave `:bg` vem do estado salvo
        await rejectPlate(jobId, ctx, reason);
        const fresh = (await load(jobId)).input;
        input.scenePlate = fresh.scenePlate;
        if (input.shots) for (const x of units) if (fresh.shots?.[x.id]) input.shots[x.id] = fresh.shots[x.id]!;
        const s2 = fresh.shots?.[u.id] ?? s;
        if (!(await stillRunning(jobId))) return;
        created = await heygen.createAvatarVideo(create({ assetId: await presentationBackground(), removeBackground: p.removeBackground }, submitKey(job.requestId, u.id, s2)));
      }
    } else {
      created = await heygen.createAvatarVideo(create({ assetId: await presentationBackground(), removeBackground: p.removeBackground }, idempotencyKey));
    }
    await patchShot(jobId, u.id, { heygenVideoId: created.videoId });
    await media.updateJob(getDb(), jobId, { externalId: created.videoId, phase: 'rendering' });
    console.log(`[media] job ${jobId}: plano ${u.id} enviado ao HeyGen (${created.videoId})${plate?.heygenAssetId && !input.scenePlate?.rejected ? ' sobre o fundo da cena em movimento' : ''}`);
    inFlight++;
  }
}

/** Baixa um clipe pronto (MP4, ou WebM com alfa no vídeo transparente) para o nosso storage. */
async function downloadClip(job: media.MediaJobRow, url: string, durationSeconds?: number, transcript?: string) {
  const { bytes, mime } = await downloadVideo(url);
  return storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime, bytes, durationSeconds, transcript, createdBy: job.createdBy });
}

async function probeBytes(bytes: Uint8Array, ext: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-probe-'));
  try {
    const f = path.join(dir, `a.${ext}`);
    await writeFile(f, bytes);
    return (await ffprobe(f)).durationSeconds;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Montagem do vídeo dirigido a partir das mídias JÁ guardadas (clipes, trechos
 * de áudio, cenas em movimento): nenhum provedor é chamado. Serve à montagem
 * final do job e à remontagem sem custo (script `recompose-directed`).
 * Regras da montagem: câmera `full_frame` sem zoom/movimento digital
 * (`composeShotsFor`), marca d'água do logo (`input.watermark`, ausente = sem;
 * com ela o cartão não desenha o próprio logo), painel com tópicos que acendem
 * quando ditos (`presenter_panel`).
 */
export async function renderDirectedScene(
  job: Pick<media.MediaJobRow, 'id' | 'workspaceId' | 'courseId' | 'lessonId'>,
  input: DirectedInput,
  direction: SceneDirection,
  dir: string,
  opts: {
    renew?: () => Promise<unknown>;
    /** marca d'água; ausente = a do job (`input.watermark`); null = sem */
    watermark?: WatermarkSpec | null;
    /** prévia local (script): arquivo de vídeo a usar no lugar do clipe guardado de um item `clip` (nunca pago) */
    clipFiles?: Map<string, string>;
  } = {},
): Promise<{ output: string; durationSeconds: number; timeline: Array<{ id: string; start: number; duration: number; audioDelay: number }>; wordSources: Map<string, { words?: CaptionWord[]; sourceStart: number }>; adjustedShots: string[]; loudness?: LoudnessResult; joins: Array<{ id: string; headTrim: number; tailTrim: number; source: string; punch: number }> }> {
  const db = getDb();
  const renew = opts.renew ?? (async () => undefined);
  const clips = new Map<string, ShotClip>();
  /** legendas: palavras de cada plano no tempo do trecho do item + início do trecho usado pelo plano */
  const wordSources = new Map<string, { words?: CaptionWord[]; sourceStart: number }>();
  for (const u of input.units!) {
    const s = input.shots![u.id]!;
    const itemWords = unpackWords(s.words as PackedWords | undefined);
    await renew();
    if (u.kind === 'cinematic') {
      // clipe mudo + trecho da narração por cima (a montagem ajusta o vídeo à duração do trecho)
      const v = s.clipAssetId ? await media.getAsset(db, s.clipAssetId) : null;
      const a = s.segmentAssetId ? await media.getAsset(db, s.segmentAssetId) : null;
      if (!v || !a) throw new Error(`mídia da cena em movimento ${u.id} não encontrada (${s.clipAssetId ?? 'sem clipe'} / ${s.segmentAssetId ?? 'sem áudio'})`);
      const safe = u.id.replace(/[^A-Za-z0-9_-]/g, '_');
      const vf = path.join(dir, `cine-${safe}.mp4`);
      const af = path.join(dir, `cine-${safe}.${a.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`);
      await writeFile(vf, await readAsset(v.storageKey));
      await writeFile(af, await readAsset(a.storageKey));
      clips.set(u.shotIds[0]!, { videoPath: vf, audioPath: af });
      wordSources.set(u.shotIds[0]!, { words: itemWords, sourceStart: 0 });
      continue;
    }
    let file = u.kind === 'clip' ? opts.clipFiles?.get(u.id) : undefined;
    if (!file) {
      const assetId = u.kind === 'audio' ? s.segmentAssetId : s.clipAssetId;
      const asset = assetId ? await media.getAsset(db, assetId) : null;
      if (!asset) throw new Error(`mídia do plano ${u.id} não encontrada (${assetId ?? 'sem asset'})`);
      const ext = asset.mimeType === 'audio/wav' ? 'wav' : asset.mimeType === 'audio/mpeg' ? 'mp3' : asset.mimeType === 'video/webm' ? 'webm' : 'mp4';
      file = path.join(dir, `${u.kind}-${u.id.replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`);
      await writeFile(file, await readAsset(asset.storageKey));
    }
    if (u.kind === 'audio') {
      clips.set(u.shotIds[0]!, { audioPath: file });
      wordSources.set(u.shotIds[0]!, { words: itemWords, sourceStart: 0 });
      continue;
    }
    const clipSeconds = (await ffprobe(file)).durationSeconds;
    const { nativeFraming } = unitCamera(input, u);
    const zone = unitZone(input, u);
    for (const [shotId, r] of shotRanges(u, direction.shots, s.offsets, clipSeconds)) {
      // posicionada: enquadramentos e tela dividida seguem a pessoa (centro dela no quadro montado)
      clips.set(shotId, { videoPath: file, cameraNativeFraming: nativeFraming, ...r, ...(s.focusX !== undefined ? { focusX: s.focusX } : {}), ...(zone ? { zone } : {}), ...(itemWords?.length ? { words: itemWords.map((w) => ({ start: w.start, end: w.end })) } : {}) });
      wordSources.set(shotId, { words: itemWords, sourceStart: r.startSeconds });
    }
  }
  // câmera em tela cheia: nada de zoom/movimento digital além do enquadramento nativo (a composição do look É o plano)
  const { shots, adjusted } = composeShotsFor(direction.shots, input.units!, (u) => (fullFrameFor(input, u as RenderUnit) ? unitCamera(input, u as RenderUnit).nativeFraming : null));
  const watermark = opts.watermark === undefined ? (input.watermark ?? null) : opts.watermark;
  const gfx = await renderShotGraphics({
    shots,
    outDir: dir,
    accent: input.directionStyle?.slideAccent ?? '#1a66d1',
    // cartões de marca (layout card): preset da plataforma (mesma variável do app web; padrão DNA Work)
    brand: watermark?.brand ?? process.env.PLATFORM_BRAND,
    loadImage: async (assetId) => {
      const a = await media.getAsset(db, assetId);
      if (!a || a.kind !== 'image' || a.workspaceId !== job.workspaceId) return undefined;
      return `data:${a.mimeType};base64,${Buffer.from(await readAsset(a.storageKey)).toString('base64')}`;
    },
    // a marca d'água global cobre o cartão (mesma geometria): o cartão não desenha o próprio logo
    ...(watermark ? { cardWatermark: false as const } : {}),
    ...(shots.some((x) => x.layout === 'presenter_panel' || x.layout === 'presenter_chips') ? { panelEyebrow: await lessonEyebrow(job) } : {}),
    panelIconFor,
    // pílulas (estúdio com zonas): rótulo = o negrito do tópico; a coluna vai na parede livre da câmera do plano
    chipLabelFor: chipLabel,
    zones: new Map([...clips].filter(([, c]) => c.zone).map(([id, c]) => [id, c.zone!])),
    ...(input.videoPalette ? { palette: input.videoPalette } : {}),
  });
  // painel: palavras ditas no plano, relativas ao início dele (cada tópico acende quando é dito)
  const panels = new Map<string, { states: string[]; words?: Array<{ text: string; start: number }> }>();
  for (const [id, states] of gfx.panels) {
    const src = wordSources.get(id);
    const words = src?.words?.length ? src.words.map((w) => ({ text: w.text, start: w.start - src.sourceStart })).filter((w) => w.start >= -0.05) : undefined;
    panels.set(id, { states, ...(words ? { words } : {}) });
  }
  // pílulas: as mesmas palavras relativas ao plano (cada pílula surge quando a palavra-chave é dita)
  const chips = new Map<string, { graphics: ChipsGraphics; words?: Array<{ text: string; start: number }> }>();
  for (const [id, graphics] of gfx.chips) {
    const src = wordSources.get(id);
    const words = src?.words?.length ? src.words.map((w) => ({ text: w.text, start: w.start - src.sourceStart })).filter((w) => w.start >= -0.05) : undefined;
    chips.set(id, { graphics, ...(words ? { words } : {}) });
  }
  const output = path.join(dir, 'scene.mp4');
  await renew();
  const result = await composeScene({
    shots, clips, slides: gfx.slides, captions: gfx.captions, output, width: W, height: H, background: input.params?.backgroundColor ?? '#000000',
    ...(panels.size ? { panels } : {}),
    ...(chips.size ? { chips } : {}),
    // estúdio com zonas: pergunta da decisão seguinte no fim e letreiro com o nome na abertura da aula
    ...(input.nextQuestion?.trim() ? { teaser: { question: input.nextQuestion } } : {}),
    ...(input.lowerThird?.name?.trim() ? { lowerThird: input.lowerThird } : {}),
    ...(input.videoPalette ? { palette: input.videoPalette } : {}),
    ...(watermark ? { watermark: { brand: watermark.brand, position: watermark.position, opacity: watermark.opacity, accent: input.directionStyle?.slideAccent ?? '#1a66d1' } } : {}),
  });
  await renew();
  // emendas apertadas: o plano começa no clipe um pouco depois do 0 (o respiro antes da fala saiu); as legendas seguem esse começo
  for (const t of result.timeline) {
    const src = wordSources.get(t.id);
    if (src && t.clipStart !== undefined) src.sourceStart = t.clipStart;
  }
  if (result.loudness?.low) console.warn(`[media] voz baixa mesmo depois de normalizar (${result.loudness.outputI} LUFS)`);
  return { output, durationSeconds: result.durationSeconds, timeline: result.timeline, wordSources, adjustedShots: adjusted, loudness: result.loudness, joins: result.joins };
}

/** "Aula N · título" da aula do job no rascunho (linha de cima do painel); vazio quando não acha. */
async function lessonEyebrow(job: Pick<media.MediaJobRow, 'courseId' | 'lessonId'>): Promise<string | undefined> {
  try {
    const draft = await authoring.getDraft(getDb(), job.courseId);
    const lessons = draft ? allLessons(draft.document) : [];
    const i = lessons.findIndex((l) => l.id === job.lessonId);
    return i >= 0 ? `Aula ${i + 1} · ${lessons[i]!.title}` : undefined;
  } catch {
    return undefined;
  }
}

/** 6: montagem final, anexo ao nó e sucesso. */
async function composeAndFinish(jobId: string, ctx: Ctx) {
  const db = getDb();
  await renewLease(jobId);
  await media.updateJob(db, jobId, { phase: 'composing' });
  const { job, input } = await load(jobId);
  const direction = ctx.direction;
  const narration = directionNarration(direction);
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-compose-'));
  try {
    const scene = await renderDirectedScene(job, input, direction, dir, { renew: () => renewLease(jobId) });
    if (scene.adjustedShots.length) console.log(`[media] job ${jobId}: câmera em tela cheia sem zoom digital nos planos ${scene.adjustedShots.join(', ')} (enquadramento nativo, estático)`);
    let output = scene.output;
    let durationSeconds = scene.durationSeconds;
    // vinheta no fim (appendOutro): só na última cena narrada da aula; falha aqui nunca derruba o vídeo montado
    if (input.appendOutro) {
      try {
        const bumper = await outroBumperFile(job, input.outroAssetId, dir);
        if (!bumper) console.warn(`[media] job ${jobId}: appendOutro pedido, mas sem vinheta 16:9 no workspace`);
        else if (!(await isLastNarratedScene(job))) console.log(`[media] job ${jobId}: appendOutro ignorado (a cena não é a última narrada da aula)`);
        else {
          const withOutro = await appendBumperToVideo({ video: output, bumper, output: path.join(dir, 'scene-outro.mp4'), width: W, height: H });
          output = withOutro.output;
          durationSeconds = withOutro.durationSeconds;
        }
      } catch (e) {
        console.warn(`[media] job ${jobId}: vinheta no fim não concatenada: ${String(e instanceof Error ? e.message : e)}`);
      }
    }
    const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(output)), durationSeconds, transcript: narration, createdBy: job.createdBy, ...(scene.loudness ? { metadata: { loudness: scene.loudness } } : {}) });
    // legendas (melhor esforço: falha aqui nunca derruba o vídeo pronto)
    try {
      const captions = await sceneCaptions(job, direction, scene.timeline, scene.wordSources);
      if (captions) await patchInput(jobId, { captions });
    } catch (e) {
      console.warn(`[media] job ${jobId}: legendas não geradas: ${String(e instanceof Error ? e.message : e)}`);
    }
    await media.updateJob(db, jobId, { outputAssetId: asset.id, phase: 'attaching' });
    await finish(jobId, asset.id, ctx.sim);
  } catch (e) {
    const n = (input.composeFailures ?? 0) + 1;
    await patchInput(jobId, { composeFailures: n });
    if (n >= MAX_COMPOSE_FAILURES) {
      await fail((await load(jobId)).job, `montagem falhou: ${String(e instanceof Error ? e.message : e)}`, false);
      return;
    }
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Arquivo local da vinheta 16:9 (a pedida ou a padrão do workspace), ou null. */
async function outroBumperFile(job: media.MediaJobRow, assetId: string | undefined, dir: string): Promise<string | null> {
  const db = getDb();
  const asset = assetId ? await media.getAsset(db, assetId) : await media.findDefaultBumper(db, job.workspaceId, '16:9');
  if (!asset || asset.workspaceId !== job.workspaceId || asset.kind !== 'video' || !asset.metadata?.bumper) return null;
  const file = path.join(dir, 'outro-bumper.mp4');
  await writeFile(file, await readAsset(asset.storageKey));
  return file;
}

/** A cena do job é a última cena com fala (scenario/content/choice/consequence) da aula no rascunho atual? */
async function isLastNarratedScene(job: Pick<media.MediaJobRow, 'courseId' | 'lessonId' | 'nodeId'>): Promise<boolean> {
  const draft = await authoring.getDraft(getDb(), job.courseId);
  const lesson = draft ? allLessons(draft.document).find((l) => l.id === job.lessonId) : undefined;
  if (!lesson) return false;
  const narrated = lesson.graph.nodes.filter((n) => n.type === 'scenario' || n.type === 'content' || n.type === 'choice' || n.type === 'consequence');
  return narrated.length > 0 && narrated[narrated.length - 1]!.id === job.nodeId;
}

/**
 * Legendas da cena montada, na linha do tempo FINAL (a mesma conta da montagem:
 * início do plano + respiro da cena em movimento; transições não sobrepõem a
 * fala). Planos sem palavras gravadas (voz do HeyGen, itens antigos): tempos
 * aproximados pela fala do plano (`approx`).
 */
export async function sceneCaptions(
  job: media.MediaJobRow,
  direction: SceneDirection,
  timeline: Array<{ id: string; start: number; duration: number; audioDelay: number }>,
  sources: Map<string, { words?: CaptionWord[]; sourceStart: number }>,
): Promise<CaptionsRef | undefined> {
  const lines = new Map(direction.shots.map((x) => [x.id, x.line]));
  const exact: TimelineShotWords[] = [];
  const approx: CaptionWord[] = [];
  for (const t of timeline) {
    const src = sources.get(t.id);
    if (src?.words?.length) exact.push({ words: src.words, sourceStart: src.sourceStart, timelineStart: t.start, duration: t.duration, audioDelay: t.audioDelay });
    else approx.push(...approxWords(lines.get(t.id) ?? '', t.start + t.audioDelay, Math.max(0.2, t.duration - t.audioDelay)));
  }
  const words = [...mapWordsToTimeline(exact), ...approx].sort((a, b) => a.start - b.start);
  return storeCaptions(job, words, approx.length > 0);
}

async function finish(jobId: string, assetId: string, simulated: boolean) {
  const db = getDb();
  const { job, input } = await load(jobId);
  // ajuste fino da gravação anterior (lido ANTES de trocar o vídeo): volta depois do sucesso (F2)
  const prevAdjust = await previousSceneAdjust(job.courseId, job.lessonId, job.nodeId);
  try {
    await attachToNode(job, assetId, simulated, directionNarration(parseDirection(input)));
  } catch (e) {
    await media.updateJob(db, jobId, { lastError: `vídeo pronto (${assetId}) mas não anexado: ${String(e instanceof Error ? e.message : e)}` });
    return;
  }
  const note = simulated ? 'SIMULADO: montagem dirigida com apresentador sintético (nenhum provedor chamado)' : null;
  const [ok] = await db
    .update(schema.mediaJobs)
    .set({ status: 'succeeded', phase: 'done', finishedAt: new Date(), lastError: note, updatedAt: new Date() })
    .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'running')))
    .returning({ id: schema.mediaJobs.id });
  if (!ok) return;
  await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.succeeded', version: 1, payload: { jobId, assetId, directed: true, simulated } });
  console.log(`[media] job ${jobId} (dirigido) concluído: asset ${assetId}${simulated ? ' [SIMULADO]' : ''}`);
  await reapplyAdjustAfterRecording(job, prevAdjust);
}

/** Passo idempotente completo (início, retry e reconciliação). */
async function step(jobId: string) {
  const cfg = mediaConfigFromEnv();
  let { job, input } = await load(jobId);
  // worker em simulação NUNCA simula um job real (o resultado seria guardado como se fosse pago)
  if (job.simulated === 0 && (cfg.simulation || !cfg.heygenApiKey)) {
    await fail(job, simWorkerRealJobMessage(job), false);
    return;
  }
  if (job.outputAssetId) return finish(jobId, job.outputAssetId, job.simulated === 1);
  const ctx = context(job, input, cfg);
  const heygen = ctx.sim ? null : new HeyGenAdapter(cfg.heygenApiKey!);
  if (heygen && input.units && !(await pollInFlight(jobId, heygen))) return;
  await planAndReuse(jobId, ctx);
  await narrateAndCut(jobId, ctx, heygen);
  await prepareCinematic(jobId, ctx);
  // a videoKey da cena em movimento já existe: chaves `plate:` dos clipes e reaproveitamento
  await assignKeysAndReuse(jobId, ctx);
  // continuidade: fundo extraído da cena em movimento pronta (os clipes do apresentador esperam por ele)
  await ensureScenePlate(jobId, ctx, heygen);
  if (ctx.sim) await simulatePlateClips(jobId);
  if (heygen) await submitWindow(jobId, ctx, heygen);
  // posicionada: vídeos transparentes prontos -> montados sobre o fundo (antes da montagem da cena)
  if (!(await placeClips(jobId, ctx))) return;
  ({ job, input } = await load(jobId));
  if (job.status !== 'running') return;
  if (input.units!.every((u) => done(u, input.shots?.[u.id]))) return composeAndFinish(jobId, ctx);
  await media.updateJob(getDb(), jobId, { phase: 'rendering' });
  if (job.startedAt && Date.now() - job.startedAt.getTime() > DIRECTED_MAX_AGE_MS) {
    await getDb()
      .update(schema.mediaJobs)
      .set({ status: 'reconciliation_required', lastError: `cena dirigida sem conclusão após ${DIRECTED_MAX_AGE_MS / 60000} min`, updatedAt: new Date() })
      .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'running')));
  }
}

// ---------------- colheita após estado final ----------------

/** Por quanto tempo, depois do estado final, ainda baixamos clipes já enviados ao HeyGen. */
export const HARVEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const TERMINAL: Array<'failed' | 'canceled' | 'reconciliation_required'> = ['failed', 'canceled', 'reconciliation_required'];

/**
 * Job dirigido encerrado (falha, cancelamento, reconciliação manual) com clipes
 * JÁ ENVIADOS ao HeyGen (pagos) e ainda não baixados: baixa cada clipe pronto
 * para o nosso storage com a chave do item — um novo envio da mesma direção
 * reaproveita sem pagar de novo. Para quando o HeyGen diz `failed` (por clipe)
 * ou depois de 24 h. Nenhum envio novo é feito aqui. Devolve quantos clipes baixou.
 */
export async function harvestDirectedJob(jobId: string): Promise<number> {
  const cfg = mediaConfigFromEnv();
  if (!cfg.heygenApiKey) return 0;
  if (!(await acquireLease(jobId, TERMINAL))) return 0;
  let harvested = 0;
  try {
    const { job, input } = await load(jobId);
    if (job.simulated === 1 || !TERMINAL.includes(job.status as (typeof TERMINAL)[number]) || input.harvestDone) return 0;
    const until = input.harvestUntil ? Date.parse(input.harvestUntil) : Date.now() + HARVEST_WINDOW_MS;
    if (!input.harvestUntil) await patchInput(jobId, { harvestUntil: new Date(until).toISOString() });
    const pending = (input.units ?? []).filter((u) => {
      const st = input.shots?.[u.id];
      return !!st?.heygenVideoId && !st.clipAssetId && !st.alphaClipAssetId && !st.harvestFailed;
    });
    if (!pending.length || Date.now() > until) {
      await patchInput(jobId, { harvestDone: true });
      if (pending.length) console.warn(`[media] job ${jobId}: colheita encerrada após 24 h; ${pending.length} clipe(s) não baixado(s)`);
      return 0;
    }
    const heygen = new HeyGenAdapter(cfg.heygenApiKey);
    let open = 0;
    for (const u of pending) {
      const st = input.shots![u.id]!;
      const v = await heygen.getVideo(st.heygenVideoId!);
      if (v.status === 'completed' && v.videoUrl) {
        await renewLease(jobId);
        const asset = await downloadClip(job, v.videoUrl, v.durationSeconds, u.script);
        // vídeo transparente colhido: reaproveitável por qualquer posição/fundo (alphaKey)
        if (st.placementRequest) await patchShot(jobId, u.id, { alphaClipAssetId: asset.id, alphaClipSeconds: v.durationSeconds, alphaKind: st.placementRequest });
        else await patchShot(jobId, u.id, { clipAssetId: asset.id, clipSeconds: v.durationSeconds });
        harvested++;
        console.log(`[media] job ${jobId} (${job.status}): clipe ${u.id} já pago colhido para reaproveitamento (${asset.id})`);
      } else if (v.status === 'failed') {
        await patchShot(jobId, u.id, { harvestFailed: true, lastFailure: `${v.failureCode ?? 'failed'}: ${v.failureMessage ?? 'sem detalhes'}` });
      } else open++;
    }
    if (open === 0) await patchInput(jobId, { harvestDone: true });
  } finally {
    await releaseLease(jobId);
  }
  return harvested;
}

/** Varredura: jobs dirigidos encerrados com clipes enviados e não baixados. */
export async function harvestTerminalDirectedJobs(limit = 10): Promise<number> {
  if (!mediaConfigFromEnv().heygenApiKey) return 0;
  const rows = await getDb().execute(sql`
    select j.id
    from media_jobs j
    where j.status in ('failed', 'canceled', 'reconciliation_required') and j.simulated = 0
      and jsonb_typeof(j.input->'direction'->'shots') = 'array'
      and not coalesce((j.input->>'harvestDone')::boolean, false)
      and exists (
        select 1 from jsonb_each(case when jsonb_typeof(j.input->'shots') = 'object' then j.input->'shots' else '{}'::jsonb end) s
        where coalesce(s.value->>'heygenVideoId', '') <> '' and not (s.value ? 'clipAssetId') and not (s.value ? 'alphaClipAssetId') and not coalesce((s.value->>'harvestFailed')::boolean, false)
      )
    order by j.updated_at
    limit ${limit}`);
  let n = 0;
  for (const r of rows as unknown as Array<{ id: string }>) {
    try {
      n += await harvestDirectedJob(r.id);
    } catch (e) {
      console.warn(`[media] colheita do job ${r.id} falhou (tenta no próximo ciclo): ${String(e instanceof Error ? e.message : e)}`);
    }
  }
  return n;
}

// ---------------- entradas ----------------

function isPermanent(e: unknown) {
  if (e instanceof ShotLineNotFoundError || e instanceof InvalidDirectionError || e instanceof CameraNotReadyError || e instanceof PaidButNotStoredError) return true;
  if (e instanceof HeyGenError) return e.status < 500 && e.status !== 429;
  if (e instanceof ElevenLabsError) return !e.retryable;
  return false;
}

async function handleError(jobId: string, e: unknown, phase: 'start' | 'reconcile') {
  if (e instanceof JobNotRunningError) return;
  const msg = String(e instanceof Error ? e.message : e);
  console.warn(`[media] job dirigido ${jobId} (${phase}): ${msg}`);
  const { job } = await load(jobId);
  if (job.status !== 'running') return;
  if (e instanceof HeyGenError && e.status === 409) {
    await media.updateJob(getDb(), jobId, { lastError: 'HeyGen: pedido anterior ainda em processamento (409); aguardando reconciliação' });
    return;
  }
  // na reconciliação, erros transitórios só ficam registrados (o próximo ciclo tenta de novo)
  if (phase === 'reconcile' && !isPermanent(e)) {
    await media.updateJob(getDb(), jobId, { lastError: `reconciliação: ${msg}` });
    return;
  }
  await fail(job, msg, !isPermanent(e));
}

/** Início (ou retomada após retry) de um job dirigido já reivindicado como `running`. */
export async function startDirectedJob(jobId: string) {
  if (!(await acquireLease(jobId))) return;
  try {
    await step(jobId);
  } catch (e) {
    await handleError(jobId, e, 'start');
  } finally {
    await releaseLease(jobId);
  }
}

/** Reconciliação (polling/webhook): acompanha clipes, envia os próximos da janela e monta no fim. */
export async function reconcileDirectedJob(jobId: string) {
  if (!(await acquireLease(jobId))) return;
  try {
    await step(jobId);
  } catch (e) {
    await handleError(jobId, e, 'reconcile');
  } finally {
    await releaseLease(jobId);
  }
}

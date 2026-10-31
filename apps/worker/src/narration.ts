import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, media, schema } from '@lms/db';
import { ElevenLabsAdapter, parseTimestampsResponse, type ElevenLabsAlignment } from '@lms/media';
import { buildCaptionCues, toWebVtt, type CaptionWord } from '@lms/media/compose';
import { readAsset, storeGeneratedAsset } from './media';

/**
 * Peças compartilhadas pelo vídeo de plano único e pelo dirigido:
 * - síntese ElevenLabs paga NO MÁXIMO UMA VEZ por job+pedido: o corpo bruto da
 *   resposta é gravado no storage ANTES de ser interpretado; uma nova tentativa
 *   relê esse corpo (nunca chama o provedor de novo);
 * - armazenamento com novas tentativas (só o storage é repetido, nunca a síntese);
 * - legendas WebVTT.
 */

/** Síntese paga, mas a resposta não pôde ser guardada: NÃO repetível (repetir pagaria de novo). */
export class PaidButNotStoredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaidButNotStoredError';
  }
}

/** O job saiu de `running` (cancelado) antes de uma chamada paga: nada é cobrado. */
export class JobNotRunningError extends Error {
  constructor(jobId: string) {
    super(`job ${jobId} não está mais em execução; chamada paga não feita`);
    this.name = 'JobNotRunningError';
  }
}

/** Merge atômico (jsonb ||) no `input` do job. */
export async function patchJobInput(jobId: string, patch: Record<string, unknown>) {
  const t = schema.mediaJobs;
  await getDb().update(t).set({ input: sql`${t.input} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() }).where(eq(t.id, jobId));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Grava no storage com até 3 tentativas (0,3 s e 1,5 s entre elas). */
export async function storeWithRetry(input: Parameters<typeof storeGeneratedAsset>[0], attempts = 3) {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await storeGeneratedAsset(input);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(i === 0 ? 300 : 1500);
    }
  }
  throw last;
}

export interface ElevenLabsRawRef {
  /** sha256 do pedido (texto + voz + modelo + estabilidade) */
  reqKey: string;
  /** corpo bruto da resposta (JSON com audio_base64 + alinhamento), asset `document` */
  assetId: string;
  characterCost?: number;
}

export interface NarrationRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
}

export function narrationRequestKey(r: NarrationRequest) {
  return createHash('sha256').update(JSON.stringify({ t: r.text, v: r.voiceId, m: r.modelId ?? null, s: r.stability ?? null })).digest('hex');
}

/**
 * Narração com marcação de tempo, paga no máximo uma vez para este job e este
 * pedido. Erros depois do 200 (corpo ilegível etc.) são permanentes.
 */
export async function synthesizeOnce(jobId: string, req: NarrationRequest, apiKey: string): Promise<{ audio: Uint8Array; alignment: ElevenLabsAlignment; characterCost?: number; fromStoredResponse: boolean }> {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job) throw new Error(`job ${jobId} não encontrado`);
  const reqKey = narrationRequestKey(req);
  const saved = (job.input as { elevenLabsRaw?: ElevenLabsRawRef }).elevenLabsRaw;
  let raw: Uint8Array | undefined;
  let characterCost: number | undefined;
  let fromStoredResponse = false;
  if (saved?.reqKey === reqKey && saved.assetId) {
    const a = await media.getAsset(db, saved.assetId);
    if (a) {
      raw = await readAsset(a.storageKey);
      characterCost = saved.characterCost;
      fromStoredResponse = true;
    }
  }
  if (!raw) {
    // cancelamento concorrente prevalece: nenhuma síntese paga depois dele
    if (job.status !== 'running') throw new JobNotRunningError(jobId);
    const el = new ElevenLabsAdapter(apiKey);
    const r = await el.synthesizeWithTimestampsRaw({ text: req.text, voiceId: req.voiceId, modelId: req.modelId, stability: req.stability, languageCode: 'pt' });
    let stored;
    try {
      stored = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'document', mime: 'application/json', bytes: r.raw, createdBy: job.createdBy });
    } catch (e) {
      throw new PaidButNotStoredError(`narração paga, mas a resposta do ElevenLabs não pôde ser guardada (${String(e instanceof Error ? e.message : e)}); a síntese não é repetida automaticamente`);
    }
    // grava ANTES de interpretar: um erro de leitura do corpo nunca leva a pagar de novo
    await patchJobInput(jobId, { elevenLabsRaw: { reqKey, assetId: stored.id, ...(r.characterCost !== undefined ? { characterCost: r.characterCost } : {}) } satisfies ElevenLabsRawRef });
    raw = r.raw;
    characterCost = r.characterCost;
  }
  const parsed = parseTimestampsResponse(raw);
  return { audio: parsed.audio, alignment: parsed.alignment, characterCost, fromStoredResponse };
}

// ---------------- legendas ----------------

export interface CaptionsRef {
  assetId: string;
  lang: 'pt-BR';
  format: 'vtt';
  /** tempos aproximados (sem alinhamento da narração: voz do HeyGen ou item antigo) */
  approx?: boolean;
}

/** Palavras compactas guardadas por item: [texto, início, fim] (s, relativo ao trecho do item). */
export type PackedWords = Array<[string, number, number]>;

export const packWords = (ws: CaptionWord[], shift = 0): PackedWords => ws.map((w) => [w.text, round3(w.start - shift), round3(w.end - shift)]);
export const unpackWords = (p: PackedWords | undefined): CaptionWord[] | undefined => (Array.isArray(p) ? p.map(([text, start, end]) => ({ text, start, end })) : undefined);

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Monta as legendas, grava o WebVTT (asset `captions`, text/vtt) e devolve a referência. */
export async function storeCaptions(job: Pick<media.MediaJobRow, 'workspaceId' | 'createdBy'>, words: CaptionWord[], approx: boolean): Promise<CaptionsRef | undefined> {
  const cues = buildCaptionCues(words);
  if (!cues.length) return undefined;
  const vtt = toWebVtt(cues);
  const a = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'captions', mime: 'text/vtt', bytes: new TextEncoder().encode(vtt), createdBy: job.createdBy });
  return { assetId: a.id, lang: 'pt-BR', format: 'vtt', ...(approx ? { approx: true } : {}) };
}

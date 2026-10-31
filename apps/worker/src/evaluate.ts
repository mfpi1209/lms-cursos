import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { richTextToPlain, type AnyNode, type CourseDocument, type Lesson, type SceneDirection } from '@lms/course-schema';
import { ffprobe, runFfmpeg, sec } from '@lms/media/compose';
import {
  DEFAULT_FRAMES_PER_VIDEO, MAX_VIDEOS_PER_RUN, buildScorecard, evaluateLessonText, evaluateVideo, framePlan, graphToScript, pacingMetrics, parseVtt, wordCount, assessmentAllowed,
  type AdapterSet, type PacingMetrics, type QualityScorecard, type TextEvaluationResult, type VideoEvaluationResult, type VideoFrame,
} from '@lms/ai';
import { allLessons } from '@lms/course-schema';
import { getDb, media } from '@lms/db';
import { readAsset } from './media';

/*
 * Avaliação de qualidade de uma aula no worker: texto (uma chamada) + vídeos
 * produzidos (quadros extraídos com ffmpeg + métricas das legendas WebVTT; uma
 * chamada de visão por vídeo, no máximo MAX_VIDEOS_PER_RUN por execução). Em
 * modo de demonstração nada é enviado a um provedor: notas pelos validadores e
 * análise de quadros simulada.
 */

/** Largura máxima dos quadros enviados ao modelo (JPEG). */
export const FRAME_MAX_WIDTH = 512;

type VideoNode = Extract<AnyNode, { type: 'scenario' | 'content' | 'choice' | 'consequence' }>;

function isVideoNode(n: AnyNode): n is VideoNode {
  return n.type === 'scenario' || n.type === 'content' || n.type === 'choice' || n.type === 'consequence';
}

/** Texto falado de um nó: a fala ou, sem fala, o texto da tela. */
export function spokenTextOf(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

/** Extrai um quadro JPEG (≤ 512 px de largura) no instante pedido. */
export async function extractFrame(input: string, output: string, atSeconds: number): Promise<boolean> {
  await rm(output, { force: true });
  try {
    await runFfmpeg(['-ss', sec(atSeconds), '-i', input, '-frames:v', '1', '-an', '-vf', `scale='min(${FRAME_MAX_WIDTH},iw)':-2`, '-c:v', 'mjpeg', '-q:v', '5', '-f', 'image2', output], { timeoutMs: 60_000 });
    return ((await stat(output).catch(() => null))?.size ?? 0) > 0;
  } catch {
    return false;
  }
}

export interface VideoFramesResult {
  frames: VideoFrame[];
  videoSeconds: number;
}

/** Quadros de um vídeo local (10/35/60/85% + um por cena em movimento), em base64. */
export async function extractFrames(videoPath: string, direction: Pick<SceneDirection, 'shots'> | null | undefined, spoken: string, workDir: string): Promise<VideoFramesResult> {
  const probe = await ffprobe(videoPath);
  const videoSeconds = probe.durationSeconds || 1;
  const plan = framePlan(videoSeconds, direction, spoken);
  const frames: VideoFrame[] = [];
  for (const [i, p] of plan.entries()) {
    const out = path.join(workDir, `frame-${i}.jpg`);
    // nunca além do fim real do vídeo
    const at = Math.min(p.atSeconds, Math.max(0, videoSeconds - 0.1));
    if (!(await extractFrame(videoPath, out, at))) continue;
    const bytes = await readFile(out);
    frames.push({ mime: 'image/jpeg', base64: bytes.toString('base64'), atSeconds: at, position: p.position, ...(p.shotId ? { shotId: p.shotId } : {}), ...(p.cinematic ? { cinematic: true } : {}) });
  }
  return { frames, videoSeconds };
}

/** Métricas de ritmo a partir das legendas (asset WebVTT) do vídeo da cena. */
export async function metricsFromCaptions(captionsAssetId: string | undefined, videoSeconds: number, spoken: string, approx: boolean | undefined): Promise<PacingMetrics | null> {
  if (!captionsAssetId) return null;
  const asset = await media.getAsset(getDb(), captionsAssetId);
  if (!asset) return null;
  const vtt = Buffer.from(await readAsset(asset.storageKey)).toString('utf8');
  const cues = parseVtt(vtt);
  if (!cues.length) return null;
  return pacingMetrics(cues, { videoSeconds, expectedWords: wordCount(spoken), approx });
}

/** Voz usada no vídeo (entrada do job que o gerou; senão, a apresentação do curso e o ambiente). */
async function voiceOf(doc: CourseDocument, jobId: string | undefined): Promise<{ provider: string | null; model: string | null; stability: number | null }> {
  const input = jobId ? ((await media.getJob(getDb(), jobId))?.input as { voiceProvider?: string; params?: { elevenLabsModelId?: string; stability?: number; modelId?: string } } | undefined) : undefined;
  const provider = input?.voiceProvider ?? doc.presentation.voiceProvider ?? null;
  const model = input?.params?.elevenLabsModelId ?? input?.params?.modelId ?? (provider === 'elevenlabs' ? process.env.ELEVENLABS_MODEL_ID ?? null : null);
  const stabilityEnv = Number(process.env.ELEVENLABS_STABILITY);
  const stability = typeof input?.params?.stability === 'number' ? input.params.stability : provider === 'elevenlabs' && Number.isFinite(stabilityEnv) ? stabilityEnv : null;
  return { provider, model, stability };
}

export interface EvaluateLessonInWorkerArgs {
  set: AdapterSet;
  courseId: string;
  doc: CourseDocument;
  lesson: Lesson;
  draftRevision: number;
  includeVideo: boolean;
  log?: (m: string) => void;
}

export interface EvaluateLessonInWorkerResult {
  scorecard: QualityScorecard;
  text: TextEvaluationResult;
  videos: VideoEvaluationResult[];
  skipped: Array<{ nodeId: string; reason: string }>;
}

/** Avalia o texto e, se pedido, os vídeos produzidos da aula; devolve o cartão fundido. */
export async function evaluateLessonInWorker(args: EvaluateLessonInWorkerArgs): Promise<EvaluateLessonInWorkerResult> {
  const { set, doc, lesson, log } = args;
  const script = graphToScript(lesson.graph);
  const videoNodes = lesson.graph.nodes.filter(isVideoNode);
  const isLast = allLessons(doc).at(-1)?.id === lesson.id;
  const text = await evaluateLessonText(set, {
    courseId: args.courseId,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonDescription: lesson.description,
    script,
    cast: doc.cast,
    brief: { tema: doc.brief.topic, publico: doc.brief.audience, contexto: doc.brief.context, habilidade_final: doc.brief.finalSkill, tom: doc.brief.tone },
    narrativeVoice: doc.brief.narrativeVoice,
    family: lesson.family,
    allowAssessment: assessmentAllowed({ isLastLesson: isLast }),
    scenesWithoutNarration: videoNodes.filter((n) => !(typeof n.narration === 'string' && n.narration.trim())).map((n) => n.id),
  }, { log });
  log?.(`[agent] avaliação de texto "${lesson.title}": ${Object.entries(text.scores).map(([k, v]) => `${k} ${v}`).join(', ')}`);

  const videos: VideoEvaluationResult[] = [];
  const skipped: Array<{ nodeId: string; reason: string }> = [];
  if (args.includeVideo) {
    const withVideo = videoNodes.filter((n) => n.media?.kind === 'video' && n.media.assetId);
    const chosen = withVideo.slice(0, MAX_VIDEOS_PER_RUN);
    for (const n of withVideo.slice(MAX_VIDEOS_PER_RUN)) skipped.push({ nodeId: n.id, reason: `fora do limite de ${MAX_VIDEOS_PER_RUN} vídeos por execução` });
    const workDir = await mkdtemp(path.join(tmpdir(), 'lms-eval-'));
    try {
      for (const n of chosen) {
        const m = n.media!;
        try {
          const asset = await media.getAsset(getDb(), m.assetId);
          if (!asset) {
            skipped.push({ nodeId: n.id, reason: 'vídeo não encontrado no storage' });
            continue;
          }
          const videoPath = path.join(workDir, `${n.id}.mp4`);
          await writeFile(videoPath, await readAsset(asset.storageKey));
          const spoken = spokenTextOf(n);
          const direction = n.direction ?? null;
          const { frames, videoSeconds } = await extractFrames(videoPath, direction, spoken, workDir);
          const metrics = await metricsFromCaptions(m.captions?.assetId, videoSeconds, spoken, m.captions?.approx).catch((e) => {
            log?.(`[agent] legendas da cena "${n.id}" não lidas: ${String(e instanceof Error ? e.message : e)}`);
            return null;
          });
          const voice = await voiceOf(doc, m.generatedFrom?.jobId);
          const r = await evaluateVideo(set, {
            courseId: args.courseId, lessonId: lesson.id, nodeId: n.id, title: n.title ?? n.id, type: n.type, narration: spoken, direction, frames, metrics, voice,
            presenter: { pronoun: doc.presentation.presenterPronoun, avatarType: doc.presentation.avatarType ?? null }, videoSeconds,
          }, { log });
          videos.push(r);
          log?.(`[agent] vídeo "${n.id}": ${frames.length} quadros, ${Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(', ')}${r.meta.simulated ? ' [demonstração]' : ''}`);
        } catch (e) {
          const reason = String(e instanceof Error ? e.message : e).slice(0, 300);
          skipped.push({ nodeId: n.id, reason });
          log?.(`[agent] vídeo "${n.id}" não avaliado: ${reason}`);
        }
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const scorecard = buildScorecard({ lessonId: lesson.id, revision: args.draftRevision, text, videos, skippedVideo: skipped, framesPerVideo: videos.length ? Math.max(...videos.map((v) => v.frames)) : DEFAULT_FRAMES_PER_VIDEO, videoDisabled: !args.includeVideo });
  return { scorecard, text, videos, skipped };
}

import { inArray } from 'drizzle-orm';
import { allLessons, type CourseDocument } from '@lms/course-schema';
import { authoring, getDb, media, schema } from '@lms/db';
import { getStorage } from '@lms/media';
import { parseWebVtt, type CaptionCue } from '@lms/media/timing';
import { nodeVideo, sceneContextFromNode } from '@/lib/video-review/context';
import { resolveMark, type MarkResolution, type SceneReviewContext } from '@/lib/video-review/resolve';

/**
 * Dados da revisão "Assistir e marcar": as aulas com vídeo do RASCUNHO e, de uma aula, o retrato de cada cena com vídeo
 * (asset, duração, legenda lida do storage, planos, telas, tópicos) para resolver as marcas. Só lê.
 */

export interface ReviewLessonSummary {
  id: string;
  title: string;
  /** cenas com vídeo */
  videos: number;
}

export function reviewLessons(doc: CourseDocument): ReviewLessonSummary[] {
  return allLessons(doc)
    .map((l) => ({ id: l.id, title: l.title, videos: l.graph.nodes.filter((n) => nodeVideo(n)).length }))
    .filter((l) => l.videos > 0);
}

async function readText(storageKey: string): Promise<string> {
  const storage = await getStorage();
  const chunks: Buffer[] = [];
  for await (const c of storage.getStream(storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

/** Legenda WebVTT de um asset do workspace (vazio se não houver ou não der para ler). */
export async function readCaptionCues(workspaceId: string, assetId: string | null): Promise<CaptionCue[]> {
  if (!assetId) return [];
  const a = await media.getAsset(getDb(), assetId);
  if (!a || a.workspaceId !== workspaceId) return [];
  try {
    return parseWebVtt(await readText(a.storageKey));
  } catch (e) {
    console.warn(`[revisão] legenda ${assetId} ilegível: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/** Retrato das cenas com vídeo de uma aula do documento, na ordem da aula. */
export async function lessonSceneContexts(workspaceId: string, doc: CourseDocument, lessonId: string): Promise<SceneReviewContext[]> {
  const lesson = allLessons(doc).find((l) => l.id === lessonId);
  if (!lesson) return [];
  const nodes = lesson.graph.nodes.filter((n) => nodeVideo(n));
  const ids = nodes.map((n) => nodeVideo(n)!.assetId);
  const rows = ids.length
    ? await getDb().select({ id: schema.assets.id, d: schema.assets.durationSeconds, ws: schema.assets.workspaceId }).from(schema.assets).where(inArray(schema.assets.id, ids))
    : [];
  const dur = new Map(rows.filter((r) => r.ws === workspaceId).map((r) => [r.id, r.d != null ? Number(r.d) : null]));
  const out: SceneReviewContext[] = [];
  for (const n of nodes) {
    const v = nodeVideo(n)!;
    if (!dur.has(v.assetId)) continue; // asset de outro workspace ou apagado
    const cues = await readCaptionCues(workspaceId, v.captionsAssetId);
    const ctx = sceneContextFromNode(doc, lesson, n, { durationSec: dur.get(v.assetId) ?? null, cues });
    if (ctx) out.push(ctx);
  }
  return out;
}

export async function draftLessonContexts(workspaceId: string, courseId: string, lessonId: string): Promise<{ revision: number; scenes: SceneReviewContext[] } | null> {
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) return null;
  return { revision: draft.revision, scenes: await lessonSceneContexts(workspaceId, draft.document, lessonId) };
}

/**
 * Resolução de uma marca salva: recalculada sobre o rascunho atual quando a cena ainda tem o MESMO vídeo assistido;
 * se o vídeo mudou (cena refeita), fica o retrato salvo na hora da marca (`stale`).
 */
export function resolveSaved(mark: { nodeId: string; sceneTimeSec: number; sceneAssetId: string; resolution: Record<string, unknown> | null }, scenes: SceneReviewContext[]): { resolution: MarkResolution | null; stale: boolean } {
  const ctx = scenes.find((s) => s.nodeId === mark.nodeId);
  if (ctx && ctx.assetId === mark.sceneAssetId) return { resolution: resolveMark(ctx, mark.sceneTimeSec), stale: false };
  return { resolution: (mark.resolution as MarkResolution | null) ?? null, stale: true };
}

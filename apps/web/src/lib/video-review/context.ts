import type { CourseDocument, ScreenMock } from '@lms/course-schema';
import type { CaptionCue } from '@lms/media/timing';
import type { ReviewShot, SceneReviewContext } from './resolve';

type AnyNode = CourseDocument['modules'][number]['lessons'][number]['graph']['nodes'][number];

interface NodeLike {
  id: string;
  title?: string;
  media?: {
    kind?: string;
    assetId?: string;
    captions?: { assetId?: string; approx?: boolean };
    generatedFrom?: { sceneHash?: string };
    adjust?: { drop?: string[]; teaser?: string | null };
  } | null;
  direction?: { shots?: ReviewShot[]; retake?: Record<string, number> };
  topics?: Array<{ text: string; cue?: string }>;
  screenRecordings?: Array<{ fileName: string; durationSec?: number; source?: 'upload' | 'mock'; mock?: ScreenMock }>;
}

/** A cena tem vídeo gerado/anexado (é o que a revisão toca). */
export function nodeVideo(node: AnyNode): { assetId: string; captionsAssetId: string | null } | null {
  const m = (node as unknown as NodeLike).media;
  if (m?.kind !== 'video' || !m.assetId) return null;
  return { assetId: m.assetId, captionsAssetId: m.captions?.assetId ?? null };
}

/** Retrato da cena para resolver marcas (puro: o servidor passa a duração do asset e a legenda já lida). */
export function sceneContextFromNode(
  doc: Pick<CourseDocument, 'presentation'>,
  lesson: { id: string; title: string },
  node: AnyNode,
  extra: { durationSec: number | null; cues: CaptionCue[] },
): SceneReviewContext | null {
  const n = node as unknown as NodeLike;
  const video = nodeVideo(node);
  if (!video) return null;
  const pres = doc.presentation as { voiceProvider?: string; cameras?: Array<{ id: string; zone?: string }> };
  const shots = n.direction?.shots?.length
    ? n.direction.shots.map((s) => ({
        id: s.id,
        line: s.line,
        ...(s.cameraId ? { cameraId: s.cameraId } : {}),
        framing: s.framing ?? 'medium',
        layout: s.layout ?? 'presenter',
        ...(s.slide ? { slide: { title: s.slide.title ?? '', bullets: s.slide.bullets ?? [] } } : {}),
      }))
    : null;
  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    nodeId: n.id,
    title: n.title ?? n.id,
    assetId: video.assetId,
    sceneHash: n.media?.generatedFrom?.sceneHash ?? null,
    captionsAssetId: video.captionsAssetId,
    durationSec: extra.durationSec,
    cues: extra.cues,
    captionsApprox: !!n.media?.captions?.approx,
    hasNarrationAudio: (pres.voiceProvider ?? 'heygen') === 'elevenlabs',
    shots: shots as ReviewShot[] | null,
    dropped: n.media?.adjust?.drop ?? [],
    retake: n.direction?.retake ?? {},
    cameras: (pres.cameras ?? []).map((c) => ({ id: c.id, ...(c.zone ? { zone: c.zone } : {}) })),
    topics: n.topics?.length ? n.topics.map((t) => ({ text: t.text, ...(t.cue ? { cue: t.cue } : {}) })) : null,
    teaser: !!n.media?.adjust?.teaser,
    screens: n.screenRecordings?.length
      ? n.screenRecordings.map((r) => ({ fileName: r.fileName, ...(r.durationSec ? { durationSec: r.durationSec } : {}), ...(r.source ? { source: r.source } : {}), ...(r.mock ? { mock: r.mock } : {}) }))
      : null,
  };
}

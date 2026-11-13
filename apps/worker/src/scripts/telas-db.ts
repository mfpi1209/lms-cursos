/**
 * Leitura (SÓ LEITURA) das cenas de tela de um curso no banco: o rascunho, o vídeo final de cada cena
 * (`node.media.assetId`) e a legenda (`node.media.captions.assetId`). Nada é escrito no banco nem no storage.
 * Usado pela conferência (`qa-telas.ts`) e pela prévia com o tempo real da fala (`gerar-telas-previa.ts --course`).
 */
import { authoring, getDb, media } from '@lms/db';
import { allLessons, richTextToPlain, type CourseDocument, type ScreenMock } from '@lms/course-schema';
import { getStorage } from '@lms/media';
import { parseWebVtt, wordsFromCues, type CaptionWord, type StoryboardKind } from '@lms/media/compose';

export interface DbScreenRecording {
  fileName: string;
  durationSec?: number;
  source?: 'upload' | 'mock';
  mock?: ScreenMock;
}

export interface DbScreenScene {
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  title: string;
  /** a fala da cena (transcrição do vídeo; sem vídeo, o texto do roteiro) */
  spoken: string;
  recordings: DbScreenRecording[];
  videoAssetId?: string;
  videoStorageKey?: string;
  videoDurationSec?: number;
  /** palavras da narração com tempo, tiradas da legenda (interpoladas dentro de cada legenda); vazio = sem legenda */
  words: CaptionWord[];
  captionsApprox?: boolean;
}

/** Tipo de quadro do storyboard para uma gravação: celular, duas telas lado a lado ou o quadro inteiro. */
export function storyboardKindOf(mock: Pick<ScreenMock, 'model' | 'device'> | undefined): StoryboardKind {
  if (!mock || mock.device === 'desktop') return 'wide';
  return mock.model === 'compare' ? 'pair' : 'phone';
}

export async function readStorage(storageKey: string): Promise<Uint8Array> {
  const storage = await getStorage();
  const chunks: Buffer[] = [];
  for await (const c of storage.getStream(storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return new Uint8Array(Buffer.concat(chunks));
}

/** Cenas do rascunho com `screenRecordings`, na ordem do curso. `only` = ids das cenas (sem caixa); vazio = todas. */
export async function loadScreenScenes(courseId: string, only: string[] = []): Promise<DbScreenScene[]> {
  const db = getDb();
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) throw new Error(`curso ${courseId} sem rascunho`);
  const doc = draft.document as CourseDocument;
  const want = new Set(only.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const out: DbScreenScene[] = [];
  for (const lesson of allLessons(doc)) {
    for (const n0 of lesson.graph.nodes) {
      const n = n0 as unknown as { id: string; title?: string; narration?: string; body?: unknown; screenRecordings?: DbScreenRecording[]; media?: { assetId?: string; kind?: string; transcript?: string; captions?: { assetId?: string; approx?: boolean } } | null };
      if (!n.screenRecordings?.length) continue;
      if (want.size && !want.has(n.id.toLowerCase())) continue;
      const scene: DbScreenScene = {
        lessonId: lesson.id,
        lessonTitle: (lesson as { title?: string }).title ?? lesson.id,
        nodeId: n.id,
        title: n.title ?? n.id,
        spoken: (n.media?.transcript?.trim() || n.narration?.trim() || richTextToPlain(n.body as never)).trim(),
        recordings: n.screenRecordings.map((r) => ({ fileName: r.fileName, ...(r.durationSec ? { durationSec: r.durationSec } : {}), ...(r.source ? { source: r.source } : {}), ...(r.mock ? { mock: r.mock } : {}) })),
        words: [],
      };
      if (n.media?.kind === 'video' && n.media.assetId) {
        const a = await media.getAsset(db, n.media.assetId);
        if (a) {
          scene.videoAssetId = a.id;
          scene.videoStorageKey = a.storageKey;
          if (a.durationSeconds) scene.videoDurationSec = Number(a.durationSeconds);
        }
      }
      if (n.media?.captions?.assetId) {
        const c = await media.getAsset(db, n.media.captions.assetId);
        if (c) {
          scene.words = wordsFromCues(parseWebVtt(Buffer.from(await readStorage(c.storageKey)).toString('utf8')));
          if (n.media.captions.approx) scene.captionsApprox = true;
        }
      }
      out.push(scene);
    }
  }
  return out;
}

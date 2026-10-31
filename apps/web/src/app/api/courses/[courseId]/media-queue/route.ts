import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getDb, authoring, media, schema } from '@lms/db';
import { allLessons, type CourseDocument } from '@lms/course-schema';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { getMediaConfig } from '@/server/media';

const PER_COURSE = Number(process.env.MEDIA_MAX_RUNNING_PER_COURSE ?? process.env.MEDIA_MAX_OPEN_PER_COURSE ?? 3);
const GLOBAL = Number(process.env.MEDIA_MAX_RUNNING ?? 5);

function phaseOf(j: { status: string; phase: string }) {
  if (j.status === 'queued') return 'waiting';
  if (j.status === 'succeeded') return 'done';
  if (j.status === 'failed' || j.status === 'reconciliation_required') return 'failed';
  if (j.status === 'canceled') return 'canceled';
  return j.phase || 'rendering';
}

function titles(doc: CourseDocument) {
  const lessons = new Map<string, string>();
  const scenes = new Map<string, string>();
  for (const l of allLessons(doc)) {
    lessons.set(l.id, l.title);
    for (const n of l.graph.nodes) scenes.set(`${l.id}:${n.id}`, n.title ?? n.id);
  }
  return { lessons, scenes };
}

/**
 * Fila de produção de vídeos do curso: o que está sendo gerado, o que espera
 * a vez (com posição) e estimativas baseadas na duração real dos vídeos já
 * concluídos. O HeyGen não informa porcentagem; mostramos etapas e tempo.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const db = getDb();
    const [allJobs, draft] = await Promise.all([media.listJobsForCourse(db, courseId), authoring.getDraft(db, courseId)]);
    // uma linha por cena: o pedido mais recente vale (pedidos antigos repetidos não inflam a contagem)
    const latest = new Map<string, (typeof allJobs)[number]>();
    for (const j of allJobs) {
      const k = `${j.lessonId}:${j.nodeId}`;
      const cur = latest.get(k);
      if (!cur || j.createdAt > cur.createdAt) latest.set(k, j);
    }
    const jobs = [...latest.values()];
    const t = draft ? titles(draft.document) : { lessons: new Map<string, string>(), scenes: new Map<string, string>() };

    // duração média real (início → fim) dos últimos vídeos concluídos de verdade no workspace
    const done = await db
      .select({ startedAt: schema.mediaJobs.startedAt, finishedAt: schema.mediaJobs.finishedAt })
      .from(schema.mediaJobs)
      .where(and(eq(schema.mediaJobs.workspaceId, viewer.workspace.id), eq(schema.mediaJobs.status, 'succeeded'), eq(schema.mediaJobs.simulated, 0), isNotNull(schema.mediaJobs.startedAt), isNotNull(schema.mediaJobs.finishedAt)))
      .orderBy(desc(schema.mediaJobs.finishedAt))
      .limit(30);
    const durations = done.map((d) => (d.finishedAt!.getTime() - d.startedAt!.getTime()) / 1000).filter((x) => x > 0);
    const avgSeconds = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const avg = avgSeconds ?? 240;
    const now = Date.now();

    // jobs abertos mais antigos sem fase coerente (pausados) contam como na fila
    const active = jobs.filter((j) => j.status === 'running').sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
    const waiting = jobs.filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const remainingActive = active.map((j) => Math.max(15, avg - (now - (j.startedAt?.getTime() ?? now)) / 1000));
    const freeSlots = Math.max(0, PER_COURSE - active.length);
    // tempo até abrir a k-ésima vaga (k começa em 0)
    const slotOpensAt = (k: number) => {
      if (k < freeSlots) return 0;
      const sorted = [...remainingActive].sort((a, b) => a - b);
      const idx = k - freeSlots;
      const round = Math.floor(idx / Math.max(1, PER_COURSE));
      const base = sorted[idx % Math.max(1, sorted.length)] ?? 0;
      return base + round * avg;
    };

    const items = [
      ...active.map((j, i) => ({ j, position: null as number | null, eta: Math.round(remainingActive[i]!) })),
      ...waiting.map((j, i) => ({ j, position: i + 1, eta: Math.round(slotOpensAt(i) + avg) })),
      ...jobs.filter((j) => j.status === 'succeeded').sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0)).slice(0, 30).map((j) => ({ j, position: null, eta: null as number | null })),
      ...jobs.filter((j) => j.status === 'failed' || j.status === 'reconciliation_required').slice(0, 30).map((j) => ({ j, position: null, eta: null as number | null })),
    ].map(({ j, position, eta }) => ({
      jobId: j.id,
      lessonId: j.lessonId,
      lessonTitle: t.lessons.get(j.lessonId) ?? j.lessonId,
      nodeId: j.nodeId,
      sceneTitle: t.scenes.get(`${j.lessonId}:${j.nodeId}`) ?? j.nodeId,
      status: j.status,
      phase: phaseOf(j),
      position,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      etaSeconds: eta,
      error: j.status === 'failed' || j.status === 'reconciliation_required' ? j.lastError : null,
      outputUrl: j.outputAssetId ? `/api/assets/${j.outputAssetId}` : null,
      simulated: j.simulated === 1,
    }));

    const count = (s: string) => jobs.filter((j) => j.status === s).length;
    const etaSeconds = waiting.length ? items.filter((i) => i.position !== null).reduce((m, i) => Math.max(m, i.etaSeconds ?? 0), 0) : active.length ? Math.round(Math.max(...remainingActive)) : null;
    return {
      simulation: getMediaConfig().simulation,
      limits: { perCourse: PER_COURSE, global: GLOBAL },
      summary: { waiting: waiting.length, active: active.length, succeeded: count('succeeded'), failed: count('failed') + count('reconciliation_required'), canceled: count('canceled'), total: jobs.length },
      avgSeconds,
      etaSeconds,
      items,
    };
  });
}

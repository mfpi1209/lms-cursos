import { desc, eq } from 'drizzle-orm';
import { compileCourse, migrateCourseDocument, type CompileIssue, type CourseCompileResult } from '@lms/course-schema';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';

/** Jobs de vídeo abertos do curso (fila/produção) → `MEDIA_IN_PROGRESS` no compilador, que é puro. */
async function openMediaJobs(db: DbOrTx, courseId: string): Promise<Array<{ lessonId: string; nodeId: string }>> {
  const rows = await db
    .select({ lessonId: s.mediaJobs.lessonId, nodeId: s.mediaJobs.nodeId, status: s.mediaJobs.status })
    .from(s.mediaJobs)
    .where(eq(s.mediaJobs.courseId, courseId));
  return rows.filter((r) => r.status === 'queued' || r.status === 'running').map((r) => ({ lessonId: r.lessonId, nodeId: r.nodeId }));
}

/** Contagem do estado da mídia nos avisos (o que a confirmação de publicação mostra). */
export interface MediaWarningCounts {
  stale: number;
  simulated: number;
  missing: number;
  inProgress: number;
}

export function mediaWarningCounts(warnings: readonly CompileIssue[]): MediaWarningCounts {
  const count = (code: string) => warnings.filter((w) => w.code === code).length;
  return { stale: count('MEDIA_STALE'), simulated: count('MEDIA_SIMULATED'), missing: count('MEDIA_MISSING'), inProgress: count('MEDIA_IN_PROGRESS') };
}

export async function validateDraft(db: DbOrTx, courseId: string): Promise<CourseCompileResult & { revision: number; media: MediaWarningCounts }> {
  const [draft] = await db.select().from(s.courseDrafts).where(eq(s.courseDrafts.courseId, courseId)).limit(1);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  const doc = migrateCourseDocument(draft.document);
  const result = compileCourse(doc, { openMediaJobs: await openMediaJobs(db, courseId) });
  return { ...result, revision: draft.revision, media: mediaWarningCounts(result.warnings) };
}

export interface PublishInput {
  courseId: string;
  userId: string;
  /** revisão do rascunho que foi validada; a rota exige, o seed e scripts internos podem omitir */
  expectedRevision?: number;
  /**
   * Aceitar vídeo SIMULADO na versão publicada. Fora do modo de demonstração a
   * rota só passa `true` quando o autor marcou "Publicar mesmo assim"; em modo
   * de demonstração passa `true` sempre (é o esperado do ambiente).
   */
  allowSimulatedMedia?: boolean;
}

/**
 * Publica um snapshot imutável do rascunho. Erros de compilação bloqueiam.
 * Avisos são registrados na versão. Vídeo simulado bloqueia a publicação, a
 * não ser que `allowSimulatedMedia` seja true (modo de demonstração ou aceite
 * explícito do autor). Matrículas existentes NÃO mudam de versão.
 */
export async function publishCourse(db: Database, input: PublishInput) {
  return db.transaction(async (tx) => {
    const [course] = await tx.select().from(s.courses).where(eq(s.courses.id, input.courseId)).for('update').limit(1);
    if (!course) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
    const [draft] = await tx.select().from(s.courseDrafts).where(eq(s.courseDrafts.courseId, input.courseId)).limit(1);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    if (input.expectedRevision !== undefined && draft.revision !== input.expectedRevision)
      throw new DomainError('CONFLICT', 'O rascunho mudou desde a última validação. Revalide antes de publicar.', { currentRevision: draft.revision });
    const document = migrateCourseDocument(draft.document);
    const result = compileCourse(document, { openMediaJobs: await openMediaJobs(tx, input.courseId) });
    if (!result.ok) throw new DomainError('PUBLISH_BLOCKED', `Publicação bloqueada por ${result.errors.length} erro(s)`, result);
    const media = mediaWarningCounts(result.warnings);
    if (media.simulated > 0 && !input.allowSimulatedMedia) {
      throw new DomainError(
        'PUBLISH_BLOCKED',
        `${media.simulated} ${media.simulated === 1 ? 'cena tem vídeo simulado' : 'cenas têm vídeo simulado'} (modo de demonstração). Gere os vídeos reais ou marque "Publicar mesmo assim".`,
        { ...result, media, reason: 'simulated_media' },
      );
    }
    const versionNumber = course.latestVersionNumber + 1;
    const versionId = newId('ver');
    const now = new Date();
    await tx.insert(s.courseVersions).values({ id: versionId, courseId: course.id, versionNumber, document, sourceRevision: draft.revision, warnings: result.warnings, publishedBy: input.userId, publishedAt: now });
    await tx.update(s.courses).set({ status: 'published', latestVersionNumber: versionNumber, updatedAt: now }).where(eq(s.courses.id, course.id));
    await tx.insert(s.auditLogs).values({
      id: newId('aud'), workspaceId: course.workspaceId, actorId: input.userId, action: 'course.publish', entityType: 'course', entityId: course.id,
      data: { versionNumber, sourceRevision: draft.revision, warnings: result.warnings.length, media, ...(media.simulated > 0 ? { simulatedMediaAccepted: true } : {}) },
    });
    await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'course.published', version: 1, payload: { courseId: course.id, versionId, versionNumber, publishedBy: input.userId } });
    return { versionId, versionNumber, warnings: result.warnings, media };
  });
}

export async function listVersions(db: DbOrTx, courseId: string) {
  return db
    .select({ id: s.courseVersions.id, versionNumber: s.courseVersions.versionNumber, sourceRevision: s.courseVersions.sourceRevision, publishedAt: s.courseVersions.publishedAt, publishedByName: s.user.name, warnings: s.courseVersions.warnings })
    .from(s.courseVersions)
    .innerJoin(s.user, eq(s.user.id, s.courseVersions.publishedBy))
    .where(eq(s.courseVersions.courseId, courseId))
    .orderBy(desc(s.courseVersions.versionNumber));
}

export async function getLatestVersion(db: DbOrTx, courseId: string) {
  const [row] = await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, courseId)).orderBy(desc(s.courseVersions.versionNumber)).limit(1);
  return row ?? null;
}

export async function getVersion(db: DbOrTx, versionId: string) {
  const [row] = await db.select().from(s.courseVersions).where(eq(s.courseVersions.id, versionId)).limit(1);
  if (!row) return null;
  return { ...row, document: migrateCourseDocument(row.document) };
}

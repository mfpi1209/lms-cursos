import { and, desc, eq } from 'drizzle-orm';
import { CourseDocumentSchema, emptyCourseDocument, migrateCourseDocument, parseReactionTarget, withReactionMedia, type CourseDocument, type MediaRef } from '@lms/course-schema';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';

export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'curso';
}

export async function listCourses(db: DbOrTx, workspaceId: string) {
  const rows = await db
    .select({
      id: s.courses.id,
      slug: s.courses.slug,
      title: s.courses.title,
      status: s.courses.status,
      latestVersionNumber: s.courses.latestVersionNumber,
      createdBy: s.courses.createdBy,
      createdByName: s.user.name,
      updatedAt: s.courses.updatedAt,
      draftRevision: s.courseDrafts.revision,
      draftUpdatedAt: s.courseDrafts.updatedAt,
      publishedSourceRevision: s.courseVersions.sourceRevision,
    })
    .from(s.courses)
    .innerJoin(s.user, eq(s.user.id, s.courses.createdBy))
    .leftJoin(s.courseDrafts, eq(s.courseDrafts.courseId, s.courses.id))
    .leftJoin(s.courseVersions, and(eq(s.courseVersions.courseId, s.courses.id), eq(s.courseVersions.versionNumber, s.courses.latestVersionNumber)))
    .where(eq(s.courses.workspaceId, workspaceId))
    .orderBy(desc(s.courses.updatedAt));
  return rows.map((r) => ({ ...r, hasUnpublishedChanges: r.publishedSourceRevision !== null && r.draftRevision !== null && r.draftRevision > r.publishedSourceRevision }));
}

export async function createCourse(
  db: Database,
  input: { workspaceId: string; title: string; createdBy: string; document?: CourseDocument; slug?: string },
) {
  const document = input.document ? CourseDocumentSchema.parse(input.document) : emptyCourseDocument(input.title);
  const id = newId('crs');
  const baseSlug = input.slug ?? slugify(input.title);
  return db.transaction(async (tx) => {
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const exists = await tx.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, input.workspaceId), eq(s.courses.slug, slug))).limit(1);
      if (exists.length === 0) break;
      slug = `${baseSlug}-${i}`;
    }
    await tx.insert(s.courses).values({ id, workspaceId: input.workspaceId, slug, title: document.title, createdBy: input.createdBy });
    await tx.insert(s.courseDrafts).values({ courseId: id, document, revision: 1, updatedBy: input.createdBy });
    await tx.insert(s.draftRevisions).values({ id: newId('rev'), courseId: id, revision: 1, document, authorId: input.createdBy, origin: 'create' });
    return { id, slug };
  });
}

export async function getCourse(db: DbOrTx, courseId: string) {
  const [row] = await db.select().from(s.courses).where(eq(s.courses.id, courseId)).limit(1);
  return row ?? null;
}

export async function getDraft(db: DbOrTx, courseId: string) {
  const [row] = await db.select().from(s.courseDrafts).where(eq(s.courseDrafts.courseId, courseId)).limit(1);
  if (!row) return null;
  return { ...row, document: migrateCourseDocument(row.document) };
}

/**
 * Grava o rascunho com controle otimista: `expectedRevision` precisa bater com
 * a revisão atual, senão CONFLICT (o cliente recarrega e revisa). Cada gravação
 * cria uma entrada em draft_revisions.
 */
export async function saveDraft(
  db: DbOrTx,
  input: { courseId: string; document: unknown; expectedRevision: number; userId: string; origin?: string; note?: string },
) {
  const parsed = CourseDocumentSchema.safeParse(input.document);
  if (!parsed.success) throw new DomainError('VALIDATION', 'Documento do curso inválido', parsed.error.issues);
  const document = parsed.data;
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(s.courseDrafts).where(eq(s.courseDrafts.courseId, input.courseId)).for('update').limit(1);
    if (!current) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    if (current.revision !== input.expectedRevision) {
      throw new DomainError('CONFLICT', `O rascunho foi alterado por outra pessoa (revisão ${current.revision}, você tinha ${input.expectedRevision}). Recarregue para revisar.`, {
        currentRevision: current.revision,
      });
    }
    const revision = current.revision + 1;
    const now = new Date();
    await tx.update(s.courseDrafts).set({ document, revision, updatedBy: input.userId, updatedAt: now }).where(eq(s.courseDrafts.courseId, input.courseId));
    await tx.update(s.courses).set({ title: document.title, updatedAt: now }).where(eq(s.courses.id, input.courseId));
    await tx.insert(s.draftRevisions).values({ id: newId('rev'), courseId: input.courseId, revision, document, authorId: input.userId, origin: input.origin ?? 'manual', note: input.note ?? null });
    return { revision, updatedAt: now };
  });
}

export async function listDraftRevisions(db: DbOrTx, courseId: string, limit = 50) {
  return db
    .select({ id: s.draftRevisions.id, revision: s.draftRevisions.revision, origin: s.draftRevisions.origin, note: s.draftRevisions.note, authorName: s.user.name, createdAt: s.draftRevisions.createdAt })
    .from(s.draftRevisions)
    .innerJoin(s.user, eq(s.user.id, s.draftRevisions.authorId))
    .where(eq(s.draftRevisions.courseId, courseId))
    .orderBy(desc(s.draftRevisions.revision))
    .limit(limit);
}

/** Restaura uma revisão anterior como nova revisão (nunca reescreve histórico). */
export async function restoreDraftRevision(db: DbOrTx, input: { courseId: string; revision: number; expectedRevision: number; userId: string }) {
  const [target] = await db
    .select()
    .from(s.draftRevisions)
    .where(and(eq(s.draftRevisions.courseId, input.courseId), eq(s.draftRevisions.revision, input.revision)))
    .limit(1);
  if (!target) throw new DomainError('NOT_FOUND', 'Revisão não encontrada');
  return saveDraft(db, { courseId: input.courseId, document: target.document, expectedRevision: input.expectedRevision, userId: input.userId, origin: 'restore', note: `Restaurada a revisão ${input.revision}` });
}

export async function duplicateCourse(db: Database, input: { courseId: string; userId: string; workspaceId: string }) {
  const draft = await getDraft(db, input.courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  const document = { ...draft.document, title: `${draft.document.title} (cópia)`, sourceIds: [], wizard: { ...draft.document.wizard, finished: draft.document.wizard.finished } };
  return createCourse(db, { workspaceId: input.workspaceId, title: document.title, createdBy: input.userId, document });
}

/**
 * Anexa/atualiza a mídia de um nó no rascunho como nova revisão (origem
 * "media"), com leitura-modificação-escrita e nova tentativa em conflito.
 * Nunca altera o texto do nó.
 */
export async function setNodeMedia(
  db: Database,
  input: { courseId: string; lessonId: string; nodeId: string; media: Record<string, unknown> | null; userId: string; note?: string },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const draft = await getDraft(db, input.courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const doc = structuredClone(draft.document);
    let touched = false;
    for (const m of doc.modules) {
      const lesson = m.lessons.find((l) => l.id === input.lessonId);
      if (!lesson) continue;
      const node = lesson.graph.nodes.find((n) => n.id === input.nodeId) as (Record<string, unknown> & { type: string }) | undefined;
      if (!node) {
        // reação da instrutora a uma resposta (alvo "decisão~opção"; ver reaction.ts): a mídia vai para a opção
        const target = parseReactionTarget(input.nodeId);
        const choice = target ? lesson.graph.nodes.find((n) => n.id === target.choiceId) : undefined;
        if (!target || !choice || choice.type !== 'choice') break;
        const next = withReactionMedia(choice, target.optionId, (input.media as MediaRef | null) ?? null);
        if (!next) throw new DomainError('NOT_FOUND', 'Reação não encontrada (a opção não tem texto de reação)');
        lesson.graph.nodes = lesson.graph.nodes.map((n) => (n.id === choice.id ? next : n));
        touched = true;
        break;
      }
      if (!['scenario', 'content', 'consequence', 'choice'].includes(node.type)) throw new DomainError('VALIDATION', 'Este tipo de bloco não aceita mídia');
      if (input.media) node.media = input.media;
      else delete node.media;
      touched = true;
    }
    if (!touched) throw new DomainError('NOT_FOUND', 'Aula ou bloco não encontrado no rascunho');
    try {
      return await saveDraft(db, { courseId: input.courseId, document: doc, expectedRevision: draft.revision, userId: input.userId, origin: 'media', note: input.note });
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT' && attempt < 4) continue;
      throw e;
    }
  }
  throw new DomainError('CONFLICT', 'Não foi possível anexar a mídia: rascunho em edição intensa');
}

/** Nome da trilha da vitrine: espaços normalizados, até 60 caracteres; vazio = sem trilha. */
export function normalizeTrail(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t || null;
}

/** Trilha temática do curso na vitrine do aluno (fora do conteúdo versionado: vale na hora, sem republicar). */
export async function setCourseTrail(db: DbOrTx, courseId: string, trail: string | null) {
  const value = normalizeTrail(trail);
  await db.update(s.courses).set({ trail: value, updatedAt: new Date() }).where(eq(s.courses.id, courseId));
  return value;
}

/** Trilhas já usadas no workspace (para sugerir no estúdio), em ordem alfabética. */
export async function listWorkspaceTrails(db: DbOrTx, workspaceId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ trail: s.courses.trail }).from(s.courses).where(eq(s.courses.workspaceId, workspaceId));
  return rows.map((r) => r.trail).filter((t): t is string => !!t).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

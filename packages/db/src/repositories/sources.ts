import { asc, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';

export type SourceRow = typeof s.sourceDocuments.$inferSelect;

export async function createSource(db: DbOrTx, input: Omit<typeof s.sourceDocuments.$inferInsert, 'id' | 'createdAt'>) {
  const id = newId('src');
  const [row] = await db.insert(s.sourceDocuments).values({ id, ...input }).returning();
  if (row!.status === 'processing') await db.insert(s.outboxEvents).values({ id: newId('obx'), type: 'source.ingest', version: 1, payload: { sourceId: id } });
  return row!;
}

export async function getSource(db: DbOrTx, sourceId: string) {
  const [row] = await db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, sourceId)).limit(1);
  return row ?? null;
}

export async function listSourcesForCourse(db: DbOrTx, courseId: string) {
  return db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.courseId, courseId)).orderBy(desc(s.sourceDocuments.createdAt));
}

export async function updateSource(db: DbOrTx, sourceId: string, patch: Partial<typeof s.sourceDocuments.$inferInsert>) {
  const [row] = await db.update(s.sourceDocuments).set(patch).where(eq(s.sourceDocuments.id, sourceId)).returning();
  return row ?? null;
}

/**
 * Reenfileira a leitura de uma fonte de arquivo (PDF) que falhou: volta a
 * `processing`, limpa o erro e emite `source.ingest` para o worker.
 */
export async function requeueSourceIngest(db: DbOrTx, sourceId: string) {
  const src = await getSource(db, sourceId);
  if (!src) throw new DomainError('NOT_FOUND', 'Fonte não encontrada');
  if (src.kind !== 'pdf' || !src.assetId) throw new DomainError('VALIDATION', 'Só fontes de arquivo podem ser lidas de novo; para texto colado, cole de novo.');
  if (src.status === 'processing') return src;
  const [row] = await db.update(s.sourceDocuments).set({ status: 'processing', error: null, processedAt: null }).where(eq(s.sourceDocuments.id, sourceId)).returning();
  await db.insert(s.outboxEvents).values({ id: newId('obx'), type: 'source.ingest', version: 1, payload: { sourceId } });
  return row!;
}

export async function deleteSource(db: DbOrTx, sourceId: string) {
  await db.delete(s.sourceDocuments).where(eq(s.sourceDocuments.id, sourceId));
}

/** Trechos com referência de página/seção quando disponível. */
export function chunkText(text: string, size = 1500): Array<{ index: number; text: string }> {
  const out: Array<{ index: number; text: string }> = [];
  const paragraphs = text.split(/\n\s*\n/);
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\n\n' + p).length > size && buf) {
      out.push({ index: out.length, text: buf.trim() });
      buf = p;
    } else buf = buf ? `${buf}\n\n${p}` : p;
  }
  if (buf.trim()) out.push({ index: out.length, text: buf.trim() });
  return out;
}

export async function replaceChunks(db: DbOrTx, sourceId: string, chunks: Array<{ index: number; text: string; page?: number }>) {
  await db.delete(s.sourceChunks).where(eq(s.sourceChunks.sourceId, sourceId));
  if (chunks.length) await db.insert(s.sourceChunks).values(chunks.map((c) => ({ id: newId('chk'), sourceId, index: c.index, page: c.page ?? null, text: c.text })));
}

export async function listChunks(db: DbOrTx, sourceId: string) {
  return db.select().from(s.sourceChunks).where(eq(s.sourceChunks.sourceId, sourceId)).orderBy(asc(s.sourceChunks.index));
}

export function publicSource(r: SourceRow) {
  return { id: r.id, title: r.title, kind: r.kind, status: r.status, chars: r.chars, pages: r.pages, excerpt: r.excerpt, error: r.error, originalName: r.originalName, createdAt: r.createdAt };
}

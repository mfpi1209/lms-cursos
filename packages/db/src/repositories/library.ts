import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  applyKitToDocument,
  applyPieceToDocument,
  KitError,
  kitSummary,
  LibraryTemplateInputSchema,
  parseTemplateData,
  type CourseDocument,
  type LibraryTemplateInput,
  type ResolvedKit,
  type TemplateDataByKind,
  type TemplateKind,
  simulateLearner,
  summarizeOpinions,
} from '@lms/course-schema';
import type { DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { getCourse, getDraft, saveDraft } from './authoring';

/**
 * Biblioteca de modelos do workspace. Aplicar um modelo grava uma revisão nova
 * do rascunho (origem `template`) e NADA mais: nenhum pedido de mídia, nenhuma
 * chamada a provedor.
 */

export type LibraryTemplateRow = typeof s.libraryTemplates.$inferSelect;

export function publicTemplate(r: LibraryTemplateRow) {
  return {
    id: r.id,
    kind: r.kind,
    key: r.key,
    name: r.name,
    description: r.description,
    data: r.data,
    previewAssetId: r.previewAssetId,
    previewUrl: r.previewAssetId ? `/api/assets/${r.previewAssetId}` : null,
    updatedAt: r.updatedAt,
    archived: !!r.archivedAt,
  };
}
export type PublicTemplate = ReturnType<typeof publicTemplate>;

export async function listTemplates(db: DbOrTx, workspaceId: string, opts: { kind?: TemplateKind; includeArchived?: boolean } = {}) {
  const where = [eq(s.libraryTemplates.workspaceId, workspaceId)];
  if (opts.kind) where.push(eq(s.libraryTemplates.kind, opts.kind));
  if (!opts.includeArchived) where.push(isNull(s.libraryTemplates.archivedAt));
  return db.select().from(s.libraryTemplates).where(and(...where)).orderBy(asc(s.libraryTemplates.kind), asc(s.libraryTemplates.name));
}

/** Modelo pelo id (`tpl_…`) ou pela chave (`estudio7-marina`) dentro do workspace. */
export async function getTemplate(db: DbOrTx, workspaceId: string, idOrKey: string) {
  const col = idOrKey.startsWith('tpl_') ? s.libraryTemplates.id : s.libraryTemplates.key;
  const [row] = await db.select().from(s.libraryTemplates).where(and(eq(s.libraryTemplates.workspaceId, workspaceId), eq(col, idOrKey))).limit(1);
  return row ?? null;
}

/**
 * Grava pela chave (cria ou atualiza; reativa se estava arquivado). Valida o
 * `data` do tipo. Mudar o tipo de uma chave existente é recusado.
 */
export async function upsertTemplate(db: DbOrTx, input: { workspaceId: string; template: LibraryTemplateInput | unknown; createdBy: string; previewAssetId?: string | null }) {
  const parsed = LibraryTemplateInputSchema.safeParse(input.template);
  if (!parsed.success) throw new DomainError('VALIDATION', 'Modelo inválido', parsed.error.issues);
  const t = parsed.data;
  const existing = await getTemplate(db, input.workspaceId, t.key);
  if (existing && existing.kind !== t.kind) throw new DomainError('CONFLICT', `A chave "${t.key}" já é de outro tipo de modelo (${existing.kind}).`);
  const values = { name: t.name, description: t.description, data: t.data as Record<string, unknown>, ...(input.previewAssetId !== undefined ? { previewAssetId: input.previewAssetId } : {}) };
  if (existing) {
    const same =
      existing.name === values.name &&
      existing.description === values.description &&
      stableJson(existing.data) === stableJson(values.data) &&
      (input.previewAssetId === undefined || existing.previewAssetId === input.previewAssetId) &&
      !existing.archivedAt;
    if (same) return { row: existing, created: false, changed: false };
    const [row] = await db.update(s.libraryTemplates).set({ ...values, archivedAt: null, updatedAt: new Date() }).where(eq(s.libraryTemplates.id, existing.id)).returning();
    return { row: row!, created: false, changed: true };
  }
  const [row] = await db
    .insert(s.libraryTemplates)
    .values({ id: newId('tpl'), workspaceId: input.workspaceId, kind: t.kind, key: t.key, createdBy: input.createdBy, ...values })
    .returning();
  return { row: row!, created: true, changed: true };
}

/** Arquiva (some da lista e dos kits novos; nada é apagado). */
export async function archiveTemplate(db: DbOrTx, workspaceId: string, idOrKey: string) {
  const row = await getTemplate(db, workspaceId, idOrKey);
  if (!row) throw new DomainError('NOT_FOUND', 'Modelo não encontrado');
  const [out] = await db.update(s.libraryTemplates).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(s.libraryTemplates.id, row.id)).returning();
  return out!;
}

function piece<K extends TemplateKind>(row: LibraryTemplateRow, kind: K): { key: string; name: string; data: TemplateDataByKind[K] } {
  return { key: row.key, name: row.name, data: parseTemplateData(kind, row.data) };
}

/** Kit com as peças buscadas pela chave (todas ativas e do tipo certo). */
export async function resolveKit(db: DbOrTx, workspaceId: string, kitIdOrKey: string): Promise<ResolvedKit> {
  const kitRow = await getTemplate(db, workspaceId, kitIdOrKey);
  if (!kitRow || kitRow.archivedAt) throw new DomainError('NOT_FOUND', `Kit "${kitIdOrKey}" não encontrado na biblioteca`);
  if (kitRow.kind !== 'kit') throw new DomainError('VALIDATION', `"${kitRow.key}" não é um kit (é ${kitRow.kind})`);
  const kit = piece(kitRow, 'kit');
  const keys = [kit.data.studioKey, kit.data.presenterKey, kit.data.voiceKey, kit.data.brandingKey, kit.data.directionKey, ...kit.data.knowledgeKeys, ...kit.data.learnerKeys].filter((k): k is string => !!k);
  const rows = await db.select().from(s.libraryTemplates).where(and(eq(s.libraryTemplates.workspaceId, workspaceId), inArray(s.libraryTemplates.key, keys), isNull(s.libraryTemplates.archivedAt)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const need = <K extends TemplateKind>(key: string, kind: K, label: string) => {
    const r = byKey.get(key);
    if (!r) throw new DomainError('VALIDATION', `O kit "${kit.key}" usa ${label} "${key}", que não está na biblioteca`);
    if (r.kind !== kind) throw new DomainError('VALIDATION', `"${key}" não é ${label} (é ${r.kind})`);
    return piece(r, kind);
  };
  return {
    kit,
    studio: need(kit.data.studioKey, 'studio', 'o estúdio'),
    presenter: need(kit.data.presenterKey, 'presenter', 'o instrutor'),
    ...(kit.data.voiceKey ? { voice: need(kit.data.voiceKey, 'voice', 'a voz') } : {}),
    ...(kit.data.brandingKey ? { branding: need(kit.data.brandingKey, 'branding', 'a marca') } : {}),
    ...(kit.data.directionKey ? { direction: need(kit.data.directionKey, 'direction', 'a direção visual') } : {}),
    knowledge: kit.data.knowledgeKeys.map((k) => need(k, 'knowledge', 'a base de conhecimento')),
    learners: kit.data.learnerKeys.map((k) => need(k, 'learner', 'o aluno de teste')),
  };
}

/** Documento com o modelo aplicado (kit inteiro ou voz/marca/direção avulsa). Puro depois de buscar. */
export async function documentWithTemplate(db: DbOrTx, workspaceId: string, doc: CourseDocument, templateIdOrKey: string) {
  const row = await getTemplate(db, workspaceId, templateIdOrKey);
  if (!row || row.archivedAt) throw new DomainError('NOT_FOUND', `Modelo "${templateIdOrKey}" não encontrado na biblioteca`);
  try {
    if (row.kind === 'kit') {
      const resolved = await resolveKit(db, workspaceId, row.id);
      return { template: row, summary: kitSummary(resolved), ...applyKitToDocument(doc, resolved) };
    }
    if (row.kind === 'voice' || row.kind === 'branding' || row.kind === 'direction') return { template: row, summary: [] as string[], ...applyPieceToDocument(doc, { kind: row.kind, key: row.key, name: row.name, data: row.data }) };
  } catch (e) {
    if (e instanceof KitError) throw new DomainError('VALIDATION', e.message);
    throw e;
  }
  throw new DomainError('VALIDATION', 'Instrutor e estúdio entram juntos por um kit; base de conhecimento e alunos de teste são só consulta.');
}

/**
 * "Usar neste curso": aplica o modelo ao rascunho (nova revisão, origem
 * `template`). Sem mudanças = nada gravado. Nunca cria pedido de mídia.
 */
export async function applyTemplateToCourse(db: DbOrTx, input: { workspaceId: string; courseId: string; templateIdOrKey: string; userId: string; expectedRevision?: number }) {
  const course = await getCourse(db, input.courseId);
  if (!course || course.workspaceId !== input.workspaceId) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  const draft = await getDraft(db, input.courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  if (input.expectedRevision !== undefined && input.expectedRevision !== draft.revision) {
    throw new DomainError('CONFLICT', `O rascunho mudou (revisão ${draft.revision}, você tinha ${input.expectedRevision}). Recarregue e tente de novo.`, { currentRevision: draft.revision });
  }
  const r = await documentWithTemplate(db, input.workspaceId, draft.document, input.templateIdOrKey);
  if (!r.changes.length && stableJson(r.document) === stableJson(draft.document)) return { revision: draft.revision, changed: false, changes: [] as string[], summary: r.summary, template: publicTemplate(r.template) };
  const saved = await saveDraft(db, { courseId: input.courseId, document: r.document, expectedRevision: draft.revision, userId: input.userId, origin: 'template', note: `Modelo "${r.template.name}" (${r.template.key}) aplicado` });
  return { revision: saved.revision, changed: true, changes: r.changes, summary: r.summary, template: publicTemplate(r.template) };
}

/** JSON com chaves ordenadas (o jsonb do Postgres reordena chaves). */
export function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => (Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])])) : x);
  return JSON.stringify(sort(v ?? null));
}

/**
 * Alunos de teste opinam sobre o RASCUNHO do curso (simulação por regras, sem
 * IA e sem custo). Sem `learnerKeys`, usa todos os perfis ativos do workspace.
 */
export async function simulateCourseLearners(db: DbOrTx, input: { workspaceId: string; courseId: string; learnerKeys?: string[] }) {
  const course = await getCourse(db, input.courseId);
  if (!course || course.workspaceId !== input.workspaceId) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  const draft = await getDraft(db, input.courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  let rows = await listTemplates(db, input.workspaceId, { kind: 'learner' });
  if (input.learnerKeys?.length) {
    const want = new Set(input.learnerKeys);
    rows = rows.filter((r) => want.has(r.key) || want.has(r.id));
  }
  const opinions = rows.map((r) => simulateLearner(draft.document, r.key, parseTemplateData('learner', r.data)));
  return { courseId: input.courseId, revision: draft.revision, title: draft.document.title, opinions, summary: summarizeOpinions(opinions) };
}

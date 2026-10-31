import { CourseDocumentSchema, type CourseDocument } from './course';
import { SCHEMA_VERSION } from './graph';

/**
 * Política de versão do contrato: documentos trazem `schemaVersion`.
 * Migrações são funções puras encadeadas (vN -> vN+1). Snapshots publicados
 * nunca são migrados in-place; alunos permanecem na versão fixada.
 */
const migrations: Record<number, (doc: unknown) => unknown> = {
  // 1 -> 2: adicionar aqui quando existir
};

export function migrateCourseDocument(input: unknown): CourseDocument {
  let doc = input as { schemaVersion?: number };
  let v = typeof doc?.schemaVersion === 'number' ? doc.schemaVersion : 1;
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) throw new Error(`Sem migração do schema ${v} para ${v + 1}`);
    doc = step(doc) as { schemaVersion?: number };
    v++;
  }
  if (v > SCHEMA_VERSION) throw new Error(`Documento usa schema ${v}, mais novo que o suportado (${SCHEMA_VERSION})`);
  return CourseDocumentSchema.parse(doc);
}

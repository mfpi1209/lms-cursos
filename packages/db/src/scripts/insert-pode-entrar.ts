/**
 * Insere o curso "Pode entrar: sua próxima entrevista começa aqui" como um curso
 * NOVO no workspace do curso de referência (crs_xqkyc0g025q85as8), copiando a
 * apresentação (apresentadora, voz, fundo) desse curso. Idempotente: se já houver
 * um curso com o mesmo título no workspace, só imprime o id existente.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/insert-pode-entrar.ts
 */
import { and, eq } from 'drizzle-orm';
import { CourseDocumentSchema, PresentationSchema, podeEntrar, PODE_ENTRAR_TITLE, compileCourse } from '@lms/course-schema';
import { createDb } from '../client';
import * as s from '../schema';
import { createCourse } from '../repositories/authoring';

const REFERENCE_COURSE_ID = process.env.REFERENCE_COURSE_ID ?? 'crs_xqkyc0g025q85as8';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    const [ref] = await db.select({ id: s.courses.id, workspaceId: s.courses.workspaceId, createdBy: s.courses.createdBy }).from(s.courses).where(eq(s.courses.id, REFERENCE_COURSE_ID)).limit(1);
    if (!ref) throw new Error(`Curso de referência ${REFERENCE_COURSE_ID} não encontrado`);

    const [existing] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, ref.workspaceId), eq(s.courses.title, PODE_ENTRAR_TITLE))).limit(1);
    if (existing) {
      console.log(`[pode-entrar] já existe: ${existing.id} (workspace ${ref.workspaceId})`);
      return;
    }

    // Apresentação do curso de referência (inclui prévia do avatar); cai na do exemplo se o rascunho não existir.
    const [draft] = await db.select({ document: s.courseDrafts.document }).from(s.courseDrafts).where(eq(s.courseDrafts.courseId, REFERENCE_COURSE_ID)).limit(1);
    const refPresentation = draft ? PresentationSchema.safeParse((draft.document as { presentation?: unknown }).presentation) : undefined;
    const presentation = refPresentation?.success ? refPresentation.data : podeEntrar.presentation;

    const document = CourseDocumentSchema.parse({ ...podeEntrar, presentation });
    const compiled = compileCourse(document);
    if (!compiled.ok) {
      for (const e of compiled.errors) console.error(`[pode-entrar] erro ${e.code}: ${e.message}`);
      throw new Error('documento não compila');
    }

    const created = await createCourse(db, { workspaceId: ref.workspaceId, title: document.title, createdBy: ref.createdBy, document });
    const lessons = document.modules.flatMap((m) => m.lessons);
    console.log(`[pode-entrar] curso criado: ${created.id} (slug ${created.slug}, workspace ${ref.workspaceId}, autor ${ref.createdBy})`);
    console.log(`[pode-entrar] ${lessons.length} aulas, ${lessons.reduce((a, l) => a + l.graph.nodes.length, 0)} nós, ${compiled.warnings.length} avisos`);
    for (const w of compiled.warnings) console.log(`[pode-entrar] aviso ${w.code}${w.lessonId ? ` (${w.lessonId})` : ''}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

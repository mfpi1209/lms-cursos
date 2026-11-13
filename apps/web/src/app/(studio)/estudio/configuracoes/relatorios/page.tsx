import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { ExportForm } from './export-form';

export const metadata = { title: 'Exportar progresso' };
export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const courses = await db
    .select({ slug: s.courses.slug, title: s.courses.title, enrollments: sql<number>`(select count(*)::int from ${s.enrollments} e where e.course_id = ${s.courses.id})` })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, viewer.workspace.id), eq(s.courses.status, 'published'), isNull(s.courses.archivedAt)))
    .orderBy(s.courses.title);
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <h1>Exportar progresso</h1>
        <p className="text-lg text-fg-muted">
          Uma planilha com uma linha por aluno e curso: matrícula, primeiro e último acesso, aulas concluídas, resultado de cada avaliação, situação da tarefa e conclusão do curso.
        </p>
        <p className="text-sm text-fg-muted">
          O arquivo tem dados pessoais (nome, e-mail e RGM). Guarde-o em local seguro e apague quando não precisar mais. Cada exportação fica registrada na auditoria, com a data, quem exportou e quantas linhas. Para um sistema ler o progresso sozinho, use o token com escopo <code>progress:read</code> (aba Integrações).
        </p>
      </section>
      <ExportForm courses={courses} />
    </div>
  );
}

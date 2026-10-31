import Link from 'next/link';
import { getDb, authoring, identity, library } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { LibraryView, type LibraryCourse } from '@/components/studio/library/library-view';

export const metadata = { title: 'Modelos' };
export const dynamic = 'force-dynamic';

/**
 * Biblioteca de modelos do workspace: kits prontos, instrutores (com as câmeras
 * por estúdio), estúdios, vozes, marca, direção visual, alunos de teste e a
 * base de conhecimento do motor. "Usar neste curso" só copia dados.
 */
export default async function ModelosPage() {
  const viewer = await requireStaff();
  const db = getDb();
  const [rows, courses] = await Promise.all([library.listTemplates(db, viewer.workspace.id), authoring.listCourses(db, viewer.workspace.id)]);
  const templates = rows.map(library.publicTemplate).map((t) => ({ ...t, updatedAt: t.updatedAt.toISOString() }));
  const courseList: LibraryCourse[] = courses.filter((c) => c.status !== 'archived').map((c) => ({ id: c.id, title: c.title }));
  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-4">
        <nav aria-label="Trilha de navegação" className="text-sm text-fg-faint">
          <Link href="/estudio" className="inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline">Cursos</Link>
          <span aria-hidden="true"> / </span>
          <span className="text-fg-muted" aria-current="page">Modelos</span>
        </nav>
        <p className="eyebrow">Biblioteca do workspace</p>
        <h1>Modelos prontos</h1>
        <p className="text-lg text-fg-muted">
          Monte o próximo curso escolhendo peças já aprovadas: um kit junta estúdio, instrutor, voz, marca e direção. Usar um modelo só copia os dados para o rascunho; nenhum vídeo é gerado e nada é cobrado.
        </p>
      </section>
      <LibraryView templates={templates} courses={courseList} canEdit={identity.canEdit(viewer.role)} />
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { NewCourseForm } from './new-course-form';

export const metadata = { title: 'Novo curso' };
export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const viewer = await requireStaff();
  if (!identity.canEdit(viewer.role)) redirect('/estudio');
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <div className="space-y-4">
        <nav aria-label="Trilha de navegação" className="text-sm text-fg-faint">
          <Link href="/estudio" className="inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline">Cursos</Link>
          <span aria-hidden="true"> / </span>
          <span className="text-fg-muted" aria-current="page">Novo curso</span>
        </nav>
        <h1 className="max-w-2xl">Vamos montar um curso</h1>
        <p className="max-w-prose text-lg text-fg-muted">
          Comece pela ideia e pelo público. Depois a trilha leva você pelo resto: material, estrutura, aulas, apresentação, prévia, vídeos e publicação. Você sempre vê o que a IA vai fazer e aprova antes de aplicar.
        </p>
        <p className="text-sm text-fg-muted">Campos marcados com “(obrigatório)” precisam ser preenchidos; o resto pode ficar para depois.</p>
      </div>
      <NewCourseForm />
    </div>
  );
}

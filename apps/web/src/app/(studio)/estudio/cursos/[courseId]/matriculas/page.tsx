import Link from 'next/link';
import { getDb, learning, identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { Card, Badge } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { EnrollForm } from './enroll-form';

export const metadata = { title: 'Matrículas' };
export const dynamic = 'force-dynamic';

export default async function EnrollmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  const course = await requireCourseInWorkspace(viewer, courseId);
  const db = getDb();
  const [enrollments, students] = await Promise.all([learning.listEnrollmentsForCourse(db, courseId), identity.listWorkspaceUsers(db, viewer.workspace.id, 'student')]);
  const enrolledIds = new Set(enrollments.map((e) => e.userId));
  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl">Matrículas</h2>
          <p className="max-w-prose text-fg-muted">A matrícula fixa a versão publicada mais recente no momento da inscrição.</p>
        </div>
        {identity.canEnroll(viewer.role) && course.latestVersionNumber > 0 && <EnrollForm courseId={courseId} students={students.filter((s) => !enrolledIds.has(s.id))} />}
        {course.latestVersionNumber === 0 && <p className="rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid">Publique o curso antes de matricular alunos.</p>}
      </div>
      {enrollments.length === 0 ? (
        <Card className="px-6 py-10 text-center text-fg-muted">Nenhum aluno matriculado.</Card>
      ) : (
        <ul className="space-y-3" data-testid="enrollment-list">
          {enrollments.map((e) => (
            <li key={e.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-base font-bold text-accent-strong" aria-hidden="true">{(e.userName.trim()[0] ?? '?').toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{e.userName} <span className="font-normal text-fg-faint">· {e.userEmail}</span></p>
                  <p className="text-sm text-fg-muted">v{e.versionNumber} · matriculado em {formatDate(e.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={e.status === 'completed' ? 'success' : e.status === 'active' ? 'brand' : 'neutral'}>
                  {e.status === 'completed' ? 'Concluído' : e.status === 'active' ? 'Em andamento' : 'Cancelado'}
                </Badge>
                <Link href={`/estudio/cursos/${courseId}/matriculas/${e.id}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Relatório</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

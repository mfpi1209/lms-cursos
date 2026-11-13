import Link from 'next/link';
import { getDb, submissions } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { SubmissionList, SubmissionStatusTabs, parseSubmissionStatus } from '@/components/studio/submissions/submission-list';

export const metadata = { title: 'Entregas' };
export const dynamic = 'force-dynamic';

/** Entregas de tarefa DESTE curso: a fila para corrigir, as devolvidas e as aprovadas. Só a equipe do workspace do curso. */
export default async function CourseSubmissionsPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ situacao?: string | string[] }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  const status = parseSubmissionStatus((await searchParams).situacao);
  const db = getDb();
  const [items, counts] = await Promise.all([submissions.listSubmissions(db, { workspaceId: viewer.workspace.id, courseId, status }), submissions.pendingSubmissionCounts(db, viewer.workspace.id)]);
  const pending = counts.byCourse[courseId] ?? 0;
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-2xl sm:text-3xl">Entregas</h2>
        <p className="max-w-prose text-fg-muted" data-testid="submissions-summary">
          {pending === 0 ? 'Nenhuma entrega deste curso esperando correção.' : `${pending} ${pending === 1 ? 'entrega deste curso espera' : 'entregas deste curso esperam'} correção. A mais antiga aparece primeiro.`}
        </p>
      </div>
      <SubmissionStatusTabs basePath={`/estudio/cursos/${courseId}/entregas`} current={status} pending={pending} />
      <SubmissionList items={items} status={status} />
      {counts.total > pending && (
        <p className="text-sm text-fg-muted">
          Há entregas de outros cursos esperando correção.{' '}
          <Link href="/estudio/entregas" className="font-medium text-fg underline underline-offset-4 hover:no-underline">
            Ver a fila de todos os cursos
          </Link>
        </p>
      )}
    </div>
  );
}

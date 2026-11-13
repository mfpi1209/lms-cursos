import Link from 'next/link';
import { getDb, submissions } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { SubmissionList, SubmissionStatusTabs, parseSubmissionStatus } from '@/components/studio/submissions/submission-list';

export const metadata = { title: 'Entregas' };
export const dynamic = 'force-dynamic';

/**
 * Fila de correção do workspace: as entregas de tarefa de todos os cursos, as mais antigas primeiro. Só a equipe
 * (admin, autoria, revisão). A fila de um curso só fica em "Entregas" dentro do curso.
 */
export default async function SubmissionsQueuePage({ searchParams }: { searchParams: Promise<{ situacao?: string | string[] }> }) {
  const viewer = await requireStaff();
  const status = parseSubmissionStatus((await searchParams).situacao);
  const db = getDb();
  const [items, counts] = await Promise.all([submissions.listSubmissions(db, { workspaceId: viewer.workspace.id, status }), submissions.pendingSubmissionCounts(db, viewer.workspace.id)]);
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl">Entregas</h1>
        <p className="max-w-prose text-fg-muted" data-testid="submissions-summary">
          {counts.total === 0 ? 'Nenhuma entrega esperando correção.' : `${counts.total} ${counts.total === 1 ? 'entrega espera' : 'entregas esperam'} correção. A mais antiga aparece primeiro.`}
        </p>
      </div>
      <SubmissionStatusTabs basePath="/estudio/entregas" current={status} pending={counts.total} />
      <SubmissionList items={items} status={status} showCourse />
      <p className="text-sm text-fg-faint">
        Cada entrega aberta e cada decisão ficam registradas na auditoria. <Link href="/estudio" className="underline underline-offset-4 hover:text-fg">Voltar aos cursos</Link>
      </p>
    </div>
  );
}

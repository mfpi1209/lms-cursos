import { getDb, publishing, identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { ReviewPanel } from './review-panel';
import { AssistantScope } from '@/components/studio/assistant/use-assistant';

export const metadata = { title: 'Revisão e publicação' };
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  const db = getDb();
  const [validation, versions] = await Promise.all([publishing.validateDraft(db, courseId), publishing.listVersions(db, courseId)]);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <AssistantScope context={{ screen: 'review' }} />
      <ReviewPanel courseId={courseId} initial={validation} canPublish={identity.canPublish(viewer.role)} />
      <section aria-labelledby="versions-title" className="space-y-4">
        <h2 id="versions-title" className="text-2xl">Versões publicadas</h2>
        {versions.length === 0 ? (
          <Card className="text-sm text-fg-muted">Nenhuma versão publicada ainda.</Card>
        ) : (
          <ul className="space-y-3" data-testid="version-list">
            {versions.map((v) => (
              <li key={v.id}>
                <Card className="space-y-1 p-5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold">v{v.versionNumber}</span>
                    <span className="text-fg-faint">rev. {v.sourceRevision}</span>
                  </div>
                  <p className="text-fg-muted">{v.publishedByName} · {formatDate(v.publishedAt)}</p>
                  {v.warnings.length > 0 && <p className="text-paid">{v.warnings.length === 1 ? '1 aviso aceito' : `${v.warnings.length} avisos aceitos`} na publicação</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-fg-faint">Cada publicação cria um snapshot imutável. Alunos já matriculados permanecem na versão fixada em sua matrícula.</p>
      </section>
    </div>
  );
}

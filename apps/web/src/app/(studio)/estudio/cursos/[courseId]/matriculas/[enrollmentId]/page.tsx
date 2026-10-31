import { notFound } from 'next/navigation';
import { getDb, learning } from '@lms/db';
import { NODE_TYPE_LABELS, type NodeType } from '@lms/course-schema';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { Card, Badge } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Relatório da matrícula' };
export const dynamic = 'force-dynamic';

const objectiveLabel = { demonstrated: ['Demonstrado', 'success'], attempted: ['Tentado', 'brand'], not_demonstrated: ['Não demonstrado', 'danger'], not_reached: ['Não alcançado', 'neutral'] } as const;

export default async function EnrollmentReportPage({ params }: { params: Promise<{ courseId: string; enrollmentId: string }> }) {
  const viewer = await requireStaff();
  const { courseId, enrollmentId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  const report = await learning.getEnrollmentReport(getDb(), enrollmentId).catch(() => null);
  if (!report || report.course.id !== courseId) notFound();
  const studentName = report.student?.name ?? 'Aluno';
  return (
    <div className="space-y-12" data-testid="enrollment-report">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-xl font-bold text-accent-strong" aria-hidden="true">{(studentName.trim()[0] ?? '?').toUpperCase()}</span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl sm:text-3xl">{studentName}</h2>
          <p className="text-sm text-fg-muted">
            {report.student?.email} · {report.course.title} v{report.course.versionNumber} · matrícula {report.enrollment.status === 'completed' ? `concluída em ${formatDate(report.enrollment.completedAt)}` : 'em andamento'}
          </p>
        </div>
      </div>

      <section aria-labelledby="objectives-title" className="space-y-4">
        <div>
          <h3 id="objectives-title" className="font-display text-xl font-bold">Resultado por objetivo</h3>
          <p className="mt-1 text-sm text-fg-muted">Escolhas e reflexões contam como prática (tentado); apenas avaliações determinísticas aprovadas marcam um objetivo como demonstrado.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {report.objectives.map((o) => {
            const [label, tone] = objectiveLabel[o.status];
            return (
              <li key={o.objectiveId}>
                <Card className="flex items-start justify-between gap-3 p-5 text-sm">
                  <div>
                    <p className="font-medium text-fg">{o.title}</p>
                    <p className="text-fg-muted">{o.evidenceCount} evidência(s){o.required ? '' : ' · opcional'}</p>
                  </div>
                  <Badge tone={tone} data-testid={`objective-${o.objectiveId}`}>{label}</Badge>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="lessons-title" className="space-y-4">
        <h3 id="lessons-title" className="font-display text-xl font-bold">Aulas, caminhos e respostas</h3>
        {report.lessons.map((l) => (
          <Card key={l.lessonId} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-display text-lg font-bold">{l.title}</h4>
              {l.attempts.length === 0 && <Badge>Não iniciada</Badge>}
            </div>
            {l.attempts.map((a) => (
              <div key={a.id} className="rounded-2xl bg-bg-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">Tentativa {a.attemptNumber}</span>
                  <Badge tone={a.status === 'completed' ? 'success' : 'brand'}>{a.status === 'completed' ? 'Concluída' : `Em andamento · ${a.progress.percent}%`}</Badge>
                  <span className="text-fg-faint">início {formatDate(a.startedAt)}{a.completedAt ? ` · fim ${formatDate(a.completedAt)}` : ''}</span>
                </div>
                <p className="mt-2 text-fg-muted"><span className="font-medium text-fg">Caminho:</span> {a.path.map((p) => p.title).join(' › ')}</p>
                {a.answers.length > 0 && (
                  <ul className="mt-2 space-y-1 text-fg">
                    {a.answers.map((ans) => (
                      <li key={ans.nodeId}>
                        <span className="font-medium">{NODE_TYPE_LABELS[ans.type as NodeType] ?? ans.type} · {ans.title}:</span>{' '}
                        {ans.optionLabels.length > 0 && <span>{ans.optionLabels.join('; ')}</span>}
                        {ans.text && <span className="italic text-fg-muted">“{ans.text}”</span>}
                        {ans.passed !== undefined && <Badge tone={ans.passed ? 'success' : 'danger'} className="ml-1">{ans.passed ? 'aprovado' : 'reprovado'}{ans.attempts ? ` · ${ans.attempts} tentativa(s)` : ''}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Card>
        ))}
      </section>
    </div>
  );
}

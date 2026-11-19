import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, FileText } from 'lucide-react';
import { getDb, submissions } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { Badge, Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { SUBMISSION_STATUS } from '@/components/studio/submissions/submission-list';
import { ReviewForm } from './review-form';

export const metadata = { title: 'Corrigir entrega' };
export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = { submitted: 'Entrega enviada', resubmitted: 'Entrega reenviada', approved: 'Aprovada', returned: 'Devolvida' };

function formatSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Uma entrega para corrigir: a tarefa, o que o aluno enviou (o link abre em outra aba, sem repassar a origem; o arquivo
 * é servido pela plataforma só para a equipe e para o próprio aluno), os critérios e a decisão. Só a equipe do workspace
 * da entrega; abrir a entrega fica registrado na auditoria (`task.view`).
 */
export default async function SubmissionReviewPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const viewer = await requireStaff();
  const { submissionId } = await params;
  const db = getDb();
  const data = await submissions.getSubmissionForReview(db, { submissionId, workspaceId: viewer.workspace.id });
  if (!data) notFound();
  await submissions.auditSubmissionView(db, { submission: data.submission, actorId: viewer.user.id });
  const { submission: sub, task, student, course, file, events } = data;
  const status = SUBMISSION_STATUS[sub.status];
  // o link foi conferido no envio (https); conferido de novo aqui antes de virar um endereço clicável
  const safeLink = /^https:\/\//i.test(sub.link) ? sub.link : null;
  const own = sub.userId === viewer.user.id;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <nav aria-label="Trilha de navegação" className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
        <Link href="/estudio/entregas" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline">
          Entregas
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/estudio/cursos/${course.id}/entregas`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline">
          {course.title}
        </Link>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={status.tone} data-testid="submission-status">
            {status.label}
          </Badge>
          {task && !sub.reviewerId && sub.status === 'approved' && <Badge tone="neutral">Aprovação automática</Badge>}
        </div>
        <h1 className="text-3xl sm:text-4xl">{task?.title ?? 'Tarefa'}</h1>
        <p className="text-fg-muted">
          {student.name} <span className="text-fg-faint">· {student.email}</span>
        </p>
        <p className="text-sm text-fg-faint">
          {task ? `${task.lessonTitle} · ` : ''}enviada em {formatDate(sub.submittedAt)}
          {sub.reviewedAt ? ` · corrigida em ${formatDate(sub.reviewedAt)}` : ''}
        </p>
      </header>

      {task && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Instrução da tarefa</h2>
          <p className="whitespace-pre-line leading-relaxed text-fg">{task.instruction}</p>
        </Card>
      )}

      <Card className="space-y-4" data-testid="submission-delivery">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">O que o aluno enviou</h2>
        <div>
          <p className="text-sm font-medium text-fg-muted">Link</p>
          {safeLink ? (
            <a href={safeLink} target="_blank" rel="noopener noreferrer" data-testid="submission-link" className="inline-flex min-h-11 max-w-full items-center gap-1.5 break-all font-medium text-fg underline underline-offset-4 hover:no-underline">
              {safeLink}
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">(abre em outra aba, fora da plataforma)</span>
            </a>
          ) : (
            <p className="break-all text-fg">{sub.link}</p>
          )}
          <p className="text-sm text-fg-faint">O link leva a um site de fora, escolhido pelo aluno. Não digite senhas nele.</p>
        </div>
        <div>
          <p className="text-sm font-medium text-fg-muted">Arquivo</p>
          {file ? (
            <a href={`/api/assets/${file.assetId}`} target="_blank" rel="noopener noreferrer" data-testid="submission-file" className="inline-flex min-h-11 max-w-full items-center gap-1.5 break-all font-medium text-fg underline underline-offset-4 hover:no-underline">
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              {file.name ?? 'arquivo'} ({file.mimeType === 'application/pdf' ? 'PDF' : 'imagem'}, {formatSize(file.sizeBytes)})
            </a>
          ) : (
            <p className="text-fg-muted">{task?.deliverable === 'link_file' ? 'O aluno não anexou arquivo (é opcional).' : 'Esta tarefa recebe só o link.'}</p>
          )}
          {file && <p className="text-sm text-fg-faint">Arquivo enviado pelo aluno. O tipo foi conferido, mas não passou por antivírus: {file.mimeType === 'application/pdf' ? 'o PDF é baixado, não aberto na plataforma.' : 'abra só se for esperado.'}</p>}
        </div>
      </Card>

      {task ? (
        sub.status === 'submitted' ? (
          own ? (
            <Card className="text-fg-muted">Esta entrega é sua. Outra pessoa da equipe precisa corrigir.</Card>
          ) : (
            <ReviewForm submissionId={sub.id} revision={sub.revision} criteria={task.criteria} backHref={`/estudio/cursos/${course.id}/entregas`} />
          )
        ) : (
          <Card className="space-y-3" data-testid="submission-result">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Correção</h2>
            {sub.criteriaResults.length > 0 ? (
              <ul className="space-y-1.5">
                {sub.criteriaResults.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-fg">
                    <span aria-hidden="true" className={c.met ? 'text-success' : 'text-danger'}>
                      {c.met ? '✓' : '✕'}
                    </span>
                    <span>
                      <span className="sr-only">{c.met ? 'Atendido: ' : 'Não atendido: '}</span>
                      {c.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">Aprovada ao enviar: os critérios não foram conferidos por um avaliador.</p>
            )}
            {sub.reviewerComment && (
              <div>
                <p className="text-sm font-medium text-fg-muted">Comentário para o aluno</p>
                <p className="whitespace-pre-line break-words text-fg">{sub.reviewerComment}</p>
              </div>
            )}
            {sub.status === 'returned' && <p className="text-sm text-fg-muted">Quando o aluno reenviar, a entrega volta para a fila “Para corrigir”.</p>}
          </Card>
        )
      ) : (
        <Card className="text-fg-muted">A tarefa desta entrega não existe mais na versão do curso. Não é possível corrigir.</Card>
      )}

      <section aria-labelledby="historico" className="space-y-3">
        <h2 id="historico" className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Histórico
        </h2>
        <ol className="space-y-2" data-testid="submission-history">
          {events.map((e) => (
            <li key={e.id} className="panel p-4 text-sm">
              <p className="font-medium text-fg">
                {EVENT_LABEL[e.type] ?? e.type}
                <span className="font-normal text-fg-faint">
                  {' '}
                  · {formatDate(e.at)} · {e.byStudent ? 'aluno' : (e.actorName ?? 'automático')}
                </span>
              </p>
              {e.comment && <p className="mt-1 whitespace-pre-line break-words text-fg-muted">{e.comment}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

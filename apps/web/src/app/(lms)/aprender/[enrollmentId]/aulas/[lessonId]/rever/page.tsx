import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { DomainError, getDb, learning } from '@lms/db';
import { findLesson, type AnyNode } from '@lms/course-schema';
import { RichText } from '@/components/rich-text';
import { requireViewer, HttpError } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';
import { learnerTabTitle } from '@/server/learner-metadata';
import { sceneKind, sceneName } from '@/components/player/navigation/scene-icon';
import { ctaOutline, ctaPrimary, StatusPill } from '../../../../_components/learner-ui';
import { RedoLessonButton } from './redo-button';
import { cn, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ enrollmentId: string; lessonId: string }> }) {
  const { enrollmentId, lessonId } = await params;
  return learnerTabTitle(enrollmentId, { lessonId, prefix: 'Rever', fallback: 'Rever aula' });
}

type Answer = { optionIds?: string[]; text?: string; passed?: boolean; attempts?: number } | undefined;

/** O que o aluno respondeu numa cena e o retorno que recebeu (nada é recalculado). */
function AnswerBlock({ node, answer }: { node: AnyNode; answer: Answer }) {
  if (!answer) return null;
  if (node.type === 'choice') {
    const opt = node.options.find((o) => o.id === answer.optionIds?.[0]);
    if (!opt) return null;
    return (
      <div className="mt-3 rounded-[14px] border border-line bg-surface-2 p-4" data-testid={`review-answer-${node.id}`}>
        <p className="text-sm text-fg-muted">Sua escolha</p>
        <p className="mt-1 font-medium text-fg">{opt.label}</p>
        {opt.feedback && <RichText doc={opt.feedback} className="mt-2 text-base leading-relaxed text-fg/85" />}
      </div>
    );
  }
  if (node.type === 'assessment') {
    const labels = (answer.optionIds ?? []).map((id) => node.options.find((o) => o.id === id)?.label ?? id);
    const fb = answer.passed ? node.feedbackPassed : node.feedbackFailed;
    return (
      <div className="mt-3 rounded-[14px] border border-line bg-surface-2 p-4" data-testid={`review-answer-${node.id}`}>
        <p className="text-sm text-fg-muted">Suas respostas{answer.attempts && answer.attempts > 1 ? ` (em ${answer.attempts} tentativas)` : ''}</p>
        <ul className="mt-1 list-disc pl-5 text-fg">{labels.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <p className={cn('mt-2 font-semibold', answer.passed ? 'text-success' : 'text-fg')}>{answer.passed ? 'Correto' : 'Não foi dessa vez'}</p>
        {fb && <RichText doc={fb} className="mt-2 text-base leading-relaxed text-fg/85" />}
      </div>
    );
  }
  if (node.type === 'reflection') {
    const text = answer.text?.trim();
    return (
      <div className="mt-3 rounded-[14px] border border-line bg-surface-2 p-4" data-testid={`review-answer-${node.id}`}>
        <p className="text-sm text-fg-muted">{node.scaffold ? 'A frase que você montou' : 'O que você escreveu'}</p>
        <p className="mt-1 whitespace-pre-wrap text-fg">{text || (node.scaffold ? 'Você pulou esta etapa.' : 'Você pulou esta anotação.')}</p>
      </div>
    );
  }
  return null;
}

/**
 * "Rever": a última tentativa concluída, só leitura — o caminho que o aluno
 * fez, as respostas e os retornos. "Refazer aula" abre uma tentativa nova.
 */
export default async function ReviewLessonPage({ params }: { params: Promise<{ enrollmentId: string; lessonId: string }> }) {
  const viewer = await requireViewer();
  const { enrollmentId, lessonId } = await params;
  let enr: Awaited<ReturnType<typeof requireOwnEnrollment>>;
  try {
    enr = await requireOwnEnrollment(viewer, enrollmentId);
  } catch (e) {
    if ((e instanceof DomainError && e.code === 'NOT_FOUND') || (e instanceof HttpError && e.status === 404)) notFound();
    throw e;
  }
  const found = findLesson(enr.document, lessonId);
  if (!found) notFound();
  const attempts = (await learning.listAttemptsForEnrollment(getDb(), enrollmentId)).filter((a) => a.lessonId === lessonId);
  const done = attempts.filter((a) => a.status === 'completed').sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  // sem tentativa concluída: não há o que rever, segue para a aula
  if (!done) redirect(`/aprender/${enrollmentId}/aulas/${lessonId}`);
  const openNow = attempts.some((a) => a.status === 'in_progress');
  const timesDone = attempts.filter((a) => a.status === 'completed').length;
  const lesson = found.lesson;
  const nodes = new Map(lesson.graph.nodes.map((n) => [n.id, n]));
  const courseHref = `/aprender/${enrollmentId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8" data-testid="lesson-review">
      <nav aria-label="Navegação" className="-mt-2 text-sm">
        <Link href={courseHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-fg-muted hover:text-fg">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Lista de aulas
        </Link>
      </nav>
      <header className="space-y-4">
        <StatusPill label="Rever · só leitura" tone="done" />
        <h1 className="text-fg">{lesson.title}</h1>
        <p className="text-base text-fg-muted">
          {done.completedAt ? `Concluída em ${formatDate(done.completedAt)}. ` : ''}
          {timesDone > 1 ? `Você já fez esta aula ${timesDone} vezes. ` : ''}
          Aqui você vê o caminho que fez, suas respostas e os retornos. Nada muda nesta tela.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          {openNow ? (
            <Link href={`/aprender/${enrollmentId}/aulas/${lessonId}`} className={ctaPrimary}>Continuar a tentativa aberta</Link>
          ) : (
            <RedoLessonButton enrollmentId={enrollmentId} lessonId={lessonId} className={ctaPrimary} />
          )}
          <Link href={courseHref} className={ctaOutline}>Voltar ao curso</Link>
        </div>
      </header>

      <ol className="space-y-3" aria-label="Cenas que você fez" data-testid="review-scenes">
        {done.state.path.map((step, i) => {
          const node = nodes.get(step.nodeId);
          if (!node) return null;
          const { Icon, label } = sceneKind(node);
          return (
            <li key={`${step.nodeId}-${i}`} className="rounded-[18px] border border-line bg-surface p-5" data-testid={`review-scene-${step.nodeId}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fg/8 text-fg-muted" aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg-muted">Cena {i + 1} · {label}</p>
                  <h2 className="mt-0.5 text-lg! font-semibold! leading-snug! text-fg">{sceneName(node)}</h2>
                  <AnswerBlock node={node} answer={done.state.answers[node.id]} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

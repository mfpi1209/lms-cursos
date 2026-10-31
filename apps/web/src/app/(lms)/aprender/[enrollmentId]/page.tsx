import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Play } from 'lucide-react';
import { getDb, learning, DomainError } from '@lms/db';
import { allLessons, type Lesson } from '@lms/course-schema';
import { computeProgress } from '@lms/course-engine';
import { requireViewer, HttpError } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';
import { learnerTabTitle } from '@/server/learner-metadata';
import { Badge } from '@/components/ui/card';
import { buildPlatformContext } from '@/components/player/platform-context';
import { ChapterCard, CourseArt, ctaPrimary, lessonThumbUrl, Segments } from '../_components/learner-ui';
import { CourseMenu } from '../_components/course-menu';
import { cn, formatDate } from '@/lib/utils';

export async function generateMetadata({ params }: { params: Promise<{ enrollmentId: string }> }) {
  return learnerTabTitle((await params).enrollmentId, { fallback: 'Curso' });
}
export const dynamic = 'force-dynamic';

type AttemptRow = Awaited<ReturnType<typeof learning.listAttemptsForEnrollment>>[number];

type LessonStatus =
  | { kind: 'not_started' }
  | { kind: 'in_progress'; percent: number; scene: number }
  | { kind: 'completed' };

function lessonStatus(lesson: Lesson, attempts: AttemptRow[]): LessonStatus {
  const mine = attempts.filter((a) => a.lessonId === lesson.id);
  if (mine.length === 0) return { kind: 'not_started' };
  const latest = mine.reduce((acc, a) => (a.attemptNumber > acc.attemptNumber ? a : acc), mine[0]!);
  if (latest.status === 'in_progress') {
    return { kind: 'in_progress', percent: computeProgress(lesson.graph, latest.state).percent, scene: Math.max(1, latest.state.path.length) };
  }
  if (latest.status === 'completed' || mine.some((a) => a.status === 'completed')) return { kind: 'completed' };
  return { kind: 'not_started' };
}

const objectiveLabel = {
  demonstrated: 'Demonstrado',
  attempted: 'Tentado',
  not_demonstrated: 'Não demonstrado',
  not_reached: 'Não alcançado',
} as const;
const objectiveTone = { demonstrated: 'success', attempted: 'brand', not_demonstrated: 'warning', not_reached: 'neutral' } as const;

function railPercent(st: LessonStatus): number {
  return st.kind === 'completed' ? 100 : st.kind === 'in_progress' ? Math.max(0, Math.min(100, Math.round(st.percent))) : 0;
}

export default async function CourseOverviewPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const viewer = await requireViewer();
  const { enrollmentId } = await params;
  const db = getDb();

  let enr: Awaited<ReturnType<typeof requireOwnEnrollment>>;
  try {
    enr = await requireOwnEnrollment(viewer, enrollmentId);
  } catch (e) {
    if ((e instanceof DomainError && e.code === 'NOT_FOUND') || (e instanceof HttpError && e.status === 404)) notFound();
    throw e;
  }
  const { enrollment, version, course, document } = enr;
  const attempts = await learning.listAttemptsForEnrollment(db, enrollmentId);
  const lessons = allLessons(document);
  const statuses = lessons.map((l) => lessonStatus(l, attempts));
  const totalMinutes = lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0);
  const completedCount = statuses.filter((s) => s.kind === 'completed').length;

  // Próxima aula recomendada: a que está em andamento; senão, a primeira não iniciada.
  const inProgressIdx = statuses.findIndex((s) => s.kind === 'in_progress');
  const nextIdx = inProgressIdx >= 0 ? inProgressIdx : statuses.findIndex((s) => s.kind === 'not_started');
  const isCompleted = enrollment.status === 'completed';
  const report = isCompleted ? await learning.getEnrollmentReport(db, enrollmentId) : null;
  const coursePercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  const nextLesson = nextIdx >= 0 ? lessons[nextIdx] : undefined;
  const nextStatus = nextIdx >= 0 ? statuses[nextIdx] : undefined;
  const recap = lessons[0] ? buildPlatformContext({ document, lessonId: lessons[0].id, hrefFor: (id) => `/aprender/${enrollmentId}/aulas/${id}` }).recap : undefined;
  const wordmark = document.branding.subtitle?.trim();
  // botões da capa: Começar/Continuar (a aula certa) e Reiniciar (a mesma aula do zero; curso concluído: do início)
  const firstLesson = lessons[0];
  const primaryHref = nextLesson ? `/aprender/${enrollmentId}/aulas/${nextLesson.id}` : firstLesson ? `/aprender/${enrollmentId}/aulas/${firstLesson.id}/rever` : undefined;
  const primaryLabel = isCompleted || !nextLesson ? 'Rever o curso' : nextStatus?.kind === 'in_progress' ? `Continuar aula ${nextIdx + 1}` : completedCount === 0 ? 'Começar' : `Começar aula ${nextIdx + 1}`;
  const heroThumb = (nextLesson && lessonThumbUrl(nextLesson, 0.15)) || (firstLesson && lessonThumbUrl(firstLesson, 0.15));
  // só o que é para o aluno: o resumo em segunda pessoa (a descrição e o briefing são da equipe)
  const summary = document.learnerSummary?.trim() || document.description;

  return (
    <div className="space-y-12">
      <nav aria-label="Navegação" className="-mt-2 text-sm">
        <Link href="/aprender" className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-fg-muted hover:text-fg">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Meus cursos
        </Link>
      </nav>

      {/* Capa estilo serviço de vídeo: um quadro da próxima aula ocupando a capa, título e os dois botões que importam. */}
      <header className="relative isolate overflow-hidden rounded-[22px] border border-line bg-[#0f1030] text-white" data-testid="course-hero">
        {heroThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroThumb} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[50%_30%] sm:w-[68%]" />
        ) : (
          <CourseArt src={document.presentation.avatarPreviewUrl} title={course.title} fade="none" className="absolute inset-0 -z-10" />
        )}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0f1030] from-35% via-[#0f1030]/70 via-55% to-transparent" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0f1030] via-transparent to-transparent" />
        <div className="flex min-h-[440px] max-w-[680px] flex-col justify-end gap-5 p-6 sm:min-h-[520px] sm:p-10 lg:p-14">
          {wordmark && <p className="text-sm font-semibold text-[#FFB070]">{wordmark}</p>}
          <h1 className="text-[36px] leading-[1.04] text-white sm:text-[52px]">{course.title}</h1>
          {summary && <p className="line-clamp-3 max-w-prose text-lg leading-relaxed text-white/85" data-testid="course-summary">{summary}</p>}
          <p className="text-sm text-white/75">
            {lessons.length} {lessons.length === 1 ? 'aula' : 'aulas'} · cerca de {totalMinutes} min · {completedCount} de {lessons.length} concluídas
          </p>
          <div
            role="progressbar"
            aria-label="Progresso no curso"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={isCompleted ? 100 : coursePercent}
            aria-valuetext={`${completedCount} de ${lessons.length} aulas concluídas`}
            className="max-w-md"
          >
            <Segments total={lessons.length} done={statuses.map((st) => isCompleted || st.kind === 'completed')} current={isCompleted ? undefined : nextIdx} />
          </div>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center" data-testid={nextLesson ? 'next-lesson' : undefined}>
            {primaryHref && (
              <Link href={primaryHref} className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')} data-testid="course-start">
                <Play className="size-5 fill-current" aria-hidden="true" />
                {primaryLabel}
              </Link>
            )}
            <CourseMenu
              restartLesson={nextStatus?.kind === 'in_progress' && nextLesson ? { label: `Reiniciar aula ${nextIdx + 1}`, href: `/aprender/${enrollmentId}/aulas/${nextLesson.id}?reiniciar=1` } : undefined}
              restartFromStart={firstLesson && (completedCount > 0 || attempts.length > 0) && !(nextStatus?.kind === 'in_progress' && nextIdx === 0) ? `/aprender/${enrollmentId}/aulas/${firstLesson.id}?reiniciar=1` : undefined}
              chaptersHref="#capitulos"
              recap={recap}
              enrollmentId={enrollmentId}
            />
          </div>
          {nextLesson && !isCompleted && (
            <p className="text-sm text-white/75">
              {nextStatus?.kind === 'in_progress' ? 'Você parou em' : 'Próxima aula'}: <span className="font-semibold text-white">Aula {nextIdx + 1} · {nextLesson.title}</span>
            </p>
          )}
        </div>
      </header>

      {/* Capítulos: um trilho por módulo, com a miniatura de cada aula. */}
      <section id="capitulos" aria-labelledby="lessons-heading" className="scroll-mt-6 space-y-8" data-testid="lesson-list">
        <h2 id="lessons-heading" className="text-[32px] leading-tight text-fg">Capítulos</h2>
        {document.modules.filter((m) => m.lessons.length > 0).map((m, mi) => (
          <div key={m.id} className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-fg">{document.modules.length > 1 ? `Módulo ${mi + 1} · ${m.title}` : m.title}</h3>
              {m.description && <p className="mt-1 max-w-prose text-base text-fg-muted">{m.description}</p>}
            </div>
            <ol className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:-mx-8 sm:scroll-px-8 sm:px-8 xl:-mx-14 xl:scroll-px-14 xl:gap-5 xl:px-14">
              {m.lessons.map((lesson) => {
                const i = lessons.findIndex((l) => l.id === lesson.id);
                const st = statuses[i]!;
                const href = st.kind === 'completed' ? `/aprender/${enrollmentId}/aulas/${lesson.id}/rever` : `/aprender/${enrollmentId}/aulas/${lesson.id}`;
                return (
                  <li key={lesson.id} data-testid={`lesson-${lesson.id}`}>
                    <ChapterCard
                      href={href}
                      index={i + 1}
                      title={lesson.title}
                      minutes={lesson.estimatedMinutes}
                      thumb={lessonThumbUrl(lesson)}
                      status={st.kind}
                      percent={railPercent(st)}
                      isNext={i === nextIdx && !isCompleted}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      {report && (
        <section aria-labelledby="objectives-heading" className="space-y-4">
          <div>
            <h2 id="objectives-heading" className="text-[32px] leading-tight text-fg">Resultado por objetivo</h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              Escolhas e reflexões contam como prática (Tentado); só avaliações aprovadas demonstram o objetivo (Demonstrado).
            </p>
          </div>
          {report.objectives.length === 0 ? (
            <div className="panel p-5 text-sm text-fg-muted">Este curso não declara objetivos.</div>
          ) : (
            <ul className="space-y-2" data-testid="objective-list">
              {report.objectives.map((o) => (
                <li key={o.objectiveId}>
                  <div className="panel flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-medium text-fg">{o.title}</p>
                      <p className="mt-0.5 text-xs text-fg-faint">
                        {o.required ? 'Obrigatório' : 'Opcional'}
                        {o.evidenceCount > 0 && ` · ${o.evidenceCount} ${o.evidenceCount === 1 ? 'registro' : 'registros'}`}
                        {o.assessmentsPassed + o.assessmentsFailed > 0 && ` · avaliações: ${o.assessmentsPassed} aprovada(s), ${o.assessmentsFailed} reprovada(s)`}
                      </p>
                    </div>
                    <Badge tone={objectiveTone[o.status]} className="shrink-0">{objectiveLabel[o.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isCompleted && (
        <section aria-labelledby="declaration-heading" data-testid="course-completed" className="panel p-6 sm:p-8">
          <p className="text-sm font-medium text-fg-muted">Declaração de conclusão</p>
          <h2 id="declaration-heading" className="mt-1 text-[32px] leading-tight text-fg">{course.title}</h2>
          <p className="mt-3 text-lg leading-relaxed text-fg">
            {viewer.user.name} concluiu as aulas obrigatórias da versão {version.versionNumber} deste curso
            {enrollment.completedAt ? ` em ${formatDate(enrollment.completedAt)}` : ''}.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Esta declaração registra que você concluiu as aulas obrigatórias desta versão do curso. Não tem validade acadêmica, não equivale a horas complementares nem a reconhecimento externo.
          </p>
        </section>
      )}
    </div>
  );
}

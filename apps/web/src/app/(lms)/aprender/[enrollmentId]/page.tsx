import Link from 'next/link';
import { versionRuntime } from '@/server/lesson-runtime';
import { LESSON_RANGE_MIN_DIFF_S, formatCourseVideo, formatLessonVideo, seriesPartOf, spokenClock } from '@lms/course-schema';
import { notFound } from 'next/navigation';
import { ChevronLeft, Play, RotateCcw, Sparkles } from 'lucide-react';
import { getDb, learning, recognition, DomainError } from '@lms/db';
import { allLessons, ownImageUrl, type Lesson } from '@lms/course-schema';
import { computeProgress } from '@lms/course-engine';
import { requireViewer, HttpError } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';
import { learnerTabTitle } from '@/server/learner-metadata';
import { Badge } from '@/components/ui/card';
import { buildPlatformContext } from '@/components/player/platform-context';
import { ChapterCard, CourseArt, ctaOutline, ctaPrimary, lessonThumbUrl, Segments } from '../_components/learner-ui';
import { CourseMenu } from '../_components/course-menu';
import { CourseTrailCard } from '../_components/course-trail-card';
import { PendingMissions } from '../_components/pending-missions';
import { shortTitleFor } from '../_lib/short-titles';
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
  // tempo de VÍDEO do percurso publicado desta matrícula (faixa pelos ramos), não a estimativa fixa do roteiro
  const runtime = await versionRuntime(version.id, lessons);
  const courseVideo = runtime.course.missing.length ? 'duração de vídeo indisponível' : formatCourseVideo(runtime.course) ? `${formatCourseVideo(runtime.course)} de vídeo` : null;
  const isCompleted = enrollment.status === 'completed';
  // Conteúdo novo: aulas acrescentadas DEPOIS de a pessoa concluir o curso. Não são pendência (o curso segue concluído,
  // com a mesma %, data e declaração); aparecem como "Novo", tocam normalmente e a conclusão delas é registrada.
  const newLesson = (i: number) => isCompleted && enrollment.optionalLessonIds.includes(lessons[i]!.id);
  const countedIdx = lessons.map((_, i) => i).filter((i) => !newLesson(i));
  const completedCount = countedIdx.filter((i) => statuses[i]!.kind === 'completed').length;
  const totalCount = countedIdx.length;
  const newIdx = lessons.findIndex((_, i) => newLesson(i) && statuses[i]!.kind !== 'completed');

  // Próxima aula recomendada: a que está em andamento; senão, a primeira não iniciada. Curso concluído: nenhuma.
  const inProgressIdx = statuses.findIndex((s) => s.kind === 'in_progress');
  const nextIdx = isCompleted ? -1 : inProgressIdx >= 0 ? inProgressIdx : statuses.findIndex((s) => s.kind === 'not_started');
  const report = isCompleted ? await learning.getEnrollmentReport(db, enrollmentId) : null;
  const coursePercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

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
  // trilha do curso: conquista deste curso e o caminho até o Selo DNA Work da trilha
  const pendingMissions = await learning.pendingMissions(db, { enrollmentId });
  const seriesPart = seriesPartOf(course.slug, course.trail);
  const trailStatus = course.trail ? await recognition.trailStatus(db, { workspaceId: course.workspaceId, userId: viewer.user.id, trail: course.trail }) : null;

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
          <CourseArt src={ownImageUrl(document.presentation.avatarPreviewUrl)} title={course.title} fade="none" className="absolute inset-0 -z-10" />
        )}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0f1030] from-35% via-[#0f1030]/70 via-55% to-transparent" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0f1030] via-transparent to-transparent" />
        <div className="flex min-h-[440px] max-w-[680px] flex-col justify-end gap-5 p-6 sm:min-h-[520px] sm:p-10 lg:p-14">
          {wordmark && <p className="text-sm font-semibold text-[#FFB070]">{wordmark}</p>}
          <h1 className="text-[36px] leading-[1.04] text-white sm:text-[52px]">{course.title}</h1>
          {summary && <p className="line-clamp-3 max-w-prose text-lg leading-relaxed text-white/85" data-testid="course-summary">{summary}</p>}
          <p className="text-sm text-white/75">
            {lessons.length} {lessons.length === 1 ? 'aula' : 'aulas'}{courseVideo ? ` · ${courseVideo}` : ''} · {completedCount} de {totalCount} concluídas
          </p>
          <div
            role="progressbar"
            aria-label="Progresso no curso"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={isCompleted ? 100 : coursePercent}
            aria-valuetext={`${completedCount} de ${totalCount} aulas concluídas`}
            className="max-w-md"
          >
            <Segments total={lessons.length} done={statuses.map((st, i) => st.kind === 'completed' || (isCompleted && !newLesson(i)))} current={isCompleted ? undefined : nextIdx} />
          </div>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center" data-testid={nextLesson ? 'next-lesson' : undefined}>
            {primaryHref && (
              <Link href={primaryHref} className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')} data-testid="course-start">
                <Play className="size-5 fill-current" aria-hidden="true" />
                {primaryLabel}
              </Link>
            )}
            {/* recomeçar do início (boas-vindas da aula 1, tentativa nova) à vista, não só no menu */}
            {firstLesson && (completedCount > 0 || attempts.length > 0) && !(nextStatus?.kind === 'in_progress' && nextIdx === 0) && (
              <Link href={`/aprender/${enrollmentId}/aulas/${firstLesson.id}?reiniciar=1`} className={cn(ctaOutline, 'min-h-14 px-6')} data-testid="course-restart">
                <RotateCcw className="size-5" aria-hidden="true" />
                Recomeçar do início
              </Link>
            )}
            {newIdx >= 0 && (
              <Link href={`/aprender/${enrollmentId}/aulas/${lessons[newIdx]!.id}`} className={cn(ctaOutline, 'min-h-14 px-6')} data-testid="course-new-content">
                <Sparkles className="size-5" aria-hidden="true" />
                Ver conteúdo novo
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
          {newIdx >= 0 && (
            <p className="text-sm text-white/75" data-testid="course-new-note">
              Conteúdo novo disponível: <span className="font-semibold text-white">Aula {newIdx + 1} · {lessons[newIdx]!.title}</span>. É opcional: o seu curso segue concluído.
            </p>
          )}
          {nextLesson && !isCompleted && (
            <p className="text-sm text-white/75">
              {nextStatus?.kind === 'in_progress' ? 'Você parou em' : 'Próxima aula'}: <span className="font-semibold text-white">Aula {nextIdx + 1} · {nextLesson.title}</span>
            </p>
          )}
        </div>
      </header>

      {pendingMissions.length > 0 && <PendingMissions enrollmentId={enrollmentId} items={pendingMissions} />}

      {trailStatus && <CourseTrailCard status={trailStatus} courseDone={isCompleted} courseLabel={shortTitleFor(course.id, course.title)} {...(seriesPart ? { part: { n: seriesPart.part, total: seriesPart.total } } : {})} />}

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
                      video={lessonVideoOf(runtime.lessons.get(lesson.id))}
                      thumb={lessonThumbUrl(lesson)}
                      status={st.kind}
                      percent={railPercent(st)}
                      isNext={i === nextIdx && !isCompleted}
                      isNew={newLesson(i)}
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
            {viewer.user.name} concluiu as aulas obrigatórias da versão {enrollment.completedVersionNumber ?? version.versionNumber} deste curso
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

/** Duração de vídeo de uma aula para a lista: "3:20" (ou faixa) e a leitura acessível; indisponível sem duração. */
function lessonVideoOf(r: { minS: number; maxS: number; missing: string[] } | undefined): { text: string; spoken: string } | null {
  if (!r) return null;
  if (r.missing.length) return { text: '—', spoken: 'duração de vídeo indisponível' };
  const text = formatLessonVideo(r);
  if (!text) return null;
  const spoken = r.maxS - r.minS < LESSON_RANGE_MIN_DIFF_S ? `${spokenClock(r.maxS)} de vídeo` : `de ${spokenClock(r.minS)} a ${spokenClock(r.maxS)} de vídeo`;
  return { text, spoken };
}

import Link from 'next/link';
import { ListVideo, Play } from 'lucide-react';
import { getDb, learning, publishing } from '@lms/db';
import { allLessons } from '@lms/course-schema';
import { requireViewer } from '@/server/viewer';
import { cn, formatDate } from '@/lib/utils';
import { CourseCard, ctaPrimary, lessonThumbUrl, Segments, StatusPill } from './_components/learner-ui';
import { CourseRail } from './_components/course-rail';

export const metadata = { title: 'Meus cursos' };
export const dynamic = 'force-dynamic';


type CourseModel = {
  enr: Awaited<ReturnType<typeof learning.listEnrollmentsForUser>>[number];
  lessons: ReturnType<typeof allLessons>;
  done: boolean[];
  current?: number;
  completedLessons: number;
  totalLessons: number;
  started: boolean;
  isDone: boolean;
  startHref: string;
  cta: string;
  rail: number;
  lessonsCopy: string | null;
  tagline?: string;
  backdrop?: string;
  thumb?: string;
  presenter?: string;
  lastActivity: number;
};

export default async function MyCoursesPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const enrollments = await learning.listEnrollmentsForUser(db, viewer.user.id);
  const attemptsByEnrollment = await Promise.all(enrollments.map((e) => learning.listAttemptsForEnrollment(db, e.id)));
  // Versão publicada em que a pessoa está matriculada: dá o rosto do apresentador e a lista de aulas para o progresso.
  const versions = await Promise.all(enrollments.map((e) => publishing.getVersion(db, e.versionId)));
  const firstName = viewer.user.name?.trim().split(/\s+/)[0];

  const courses: CourseModel[] = enrollments.map((enr, i) => {
    const attempts = attemptsByEnrollment[i] ?? [];
    const doc = versions[i]?.document;
    const presenterImg = doc?.presentation.avatarPreviewUrl;
    // Progresso = aulas concluídas (ao menos uma tentativa concluída, sem contar repetições) / aulas da versão matriculada.
    const lessons = doc ? allLessons(doc) : [];
    const lessonIds = new Set(lessons.map((l) => l.id));
    const totalLessons = lessonIds.size;
    const completedSet = new Set(attempts.filter((a) => a.status === 'completed' && lessonIds.has(a.lessonId)).map((a) => a.lessonId));
    const completedLessons = completedSet.size;
    const done = lessons.map((l) => completedSet.has(l.id));
    const isDone = enr.status === 'completed';
    const current = isDone ? undefined : done.findIndex((d) => !d);
    const started = attempts.length > 0;
    // "Começar"/"Continuar" vai direto para a aula certa (a em andamento ou a próxima); concluído: a página do curso
    const inProgress = lessons.find((l) => attempts.some((a) => a.lessonId === l.id && a.status === 'in_progress'));
    const nextLesson = isDone ? undefined : (inProgress ?? lessons.find((l) => !completedSet.has(l.id)));
    const nextIndex = nextLesson ? lessons.findIndex((l) => l.id === nextLesson.id) : -1;
    const startHref = nextLesson ? `/aprender/${enr.id}/aulas/${nextLesson.id}` : `/aprender/${enr.id}`;
    const cta = isDone ? 'Ver o curso' : inProgress ? `Continuar aula ${nextIndex + 1}` : started ? `Começar aula ${nextIndex + 1}` : 'Começar';
    const rail = isDone ? 100 : totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const lessonsCopy = totalLessons > 0 ? `${totalLessons} ${totalLessons === 1 ? 'aula' : 'aulas'} · ${completedLessons} ${completedLessons === 1 ? 'concluída' : 'concluídas'}` : null;
    const tagline = doc?.learnerSummary?.trim() || doc?.branding.tagline?.trim() || doc?.description?.trim();
    const backdrop = (nextLesson && lessonThumbUrl(nextLesson, 0.15)) || (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const thumb = (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const presenter = doc?.branding.presenterName?.trim() || doc?.presentation.avatarName?.trim() || undefined;
    const lastActivity = Math.max(0, ...attempts.map((a) => new Date(a.startedAt).getTime()));
    return { enr, lessons, done, current: current === -1 ? undefined : current, completedLessons, totalLessons, started, isDone, startHref, cta, rail, lessonsCopy, tagline: tagline || undefined, backdrop, thumb, presenter, lastActivity };
  });

  // Destaque: o curso em andamento mais recente; sem nenhum, o primeiro ainda não começado; senão, o primeiro da lista
  const byRecent = [...courses].sort((a, b) => b.lastActivity - a.lastActivity);
  const featured = byRecent.find((c) => c.started && !c.isDone) ?? courses.find((c) => !c.started) ?? courses[0];
  const rest = courses.filter((c) => c !== featured);
  const rows: Array<{ title: string; testId: string; items: CourseModel[] }> = [
    { title: 'Continue de onde parou', testId: 'rail-in-progress', items: rest.filter((c) => c.started && !c.isDone).sort((a, b) => b.lastActivity - a.lastActivity) },
    { title: 'Para começar', testId: 'rail-new', items: rest.filter((c) => !c.started && !c.isDone) },
    { title: 'Concluídos', testId: 'rail-done', items: rest.filter((c) => c.isDone) },
  ].filter((r) => r.items.length > 0);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="eyebrow">Meus cursos</p>
        <h1 className="max-w-3xl text-fg">{firstName ? `${firstName}, continue de onde parou.` : 'Continue de onde parou.'}</h1>
        <p className="max-w-prose text-lg leading-relaxed text-fg-muted">Aulas curtas, com decisões e consequências. Retome quando quiser.</p>
      </div>

      {!featured ? (
        <div className="panel p-6 sm:p-8" data-testid="enrollment-empty">
          <p className="text-lg font-medium text-fg">Você ainda não está matriculado em nenhum curso.</p>
          <p className="mt-1 text-base text-fg-muted">Quando a equipe liberar um curso para você, ele aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-10" data-testid="enrollment-list">
          <FeaturedCourse c={featured} />
          {rows.map((r) => (
            <CourseRail key={r.testId} title={r.title} count={r.items.length} testId={r.testId}>
              {r.items.map((c) => (
                <CourseCard
                  key={c.enr.id}
                  href={c.startHref}
                  title={c.enr.courseTitle}
                  thumb={c.thumb}
                  presenter={c.presenter}
                  lessons={c.totalLessons}
                  completed={c.completedLessons}
                  status={c.isDone ? 'completed' : c.started ? 'in_progress' : 'new'}
                  cta={c.cta}
                  testId={`enrollment-${c.enr.id}`}
                />
              ))}
            </CourseRail>
          ))}
        </div>
      )}
    </div>
  );
}

/** Destaque do topo (modelo serviço de vídeo): a instrutora no estúdio ao fundo, título, progresso e "Continuar". */
function FeaturedCourse({ c }: { c: CourseModel }) {
  const { enr } = c;
  return (
    <article
      className="relative isolate overflow-hidden rounded-[22px] border border-line bg-[#0f1030] text-white"
      data-testid={`enrollment-${enr.id}`}
      aria-labelledby={`course-${enr.id}`}
    >
      {c.backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.backdrop} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[50%_30%] sm:w-[68%]" />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0f1030] from-35% via-[#0f1030]/70 via-55% to-transparent" />
      <div className="flex min-h-[340px] max-w-[640px] flex-col justify-end gap-4 p-6 sm:min-h-[400px] sm:p-10">
        <StatusPill label={c.isDone ? 'Concluído' : c.started ? 'Em andamento' : 'Novo'} tone={c.isDone ? 'done' : 'accent'} />
        <h2 id={`course-${enr.id}`} className="text-[30px] leading-[1.06] text-white sm:text-[44px]">
          {enr.courseTitle}
        </h2>
        {c.tagline && <p className="line-clamp-2 max-w-prose text-base leading-relaxed text-white/85">{c.tagline}</p>}
        <div className="space-y-2">
          <div role="progressbar" aria-label={`Progresso em ${enr.courseTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.rail} aria-valuetext={c.lessonsCopy ?? `${c.rail}%`} className="max-w-md">
            <Segments total={c.totalLessons} done={c.isDone ? c.lessons.map(() => true) : c.done} current={c.current} />
          </div>
          <p className="text-sm text-white/75" data-testid="enrollment-progress">
            {c.lessonsCopy ?? 'Pronto para começar'}
            {enr.completedAt && ` · concluído em ${formatDate(enr.completedAt)}`}
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
          <Link href={c.startHref} className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')} data-testid="enrollment-start">
            <Play className="size-5 fill-current" aria-hidden="true" />
            {c.cta}
          </Link>
          <Link href={`/aprender/${enr.id}`} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[12px] border border-white/40 bg-white/10 px-6 text-[17px] font-semibold text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ListVideo className="size-5" aria-hidden="true" />
            Capítulos
          </Link>
        </div>
      </div>
    </article>
  );
}

import Link from 'next/link';
import { ListVideo, Play } from 'lucide-react';
import { getDb, learning, publishing } from '@lms/db';
import { allLessons } from '@lms/course-schema';
import { requireViewer } from '@/server/viewer';
import { cn, formatDate } from '@/lib/utils';
import { ctaPrimary, lessonThumbUrl, Segments, StatusPill } from './_components/learner-ui';

export const metadata = { title: 'Meus cursos' };
export const dynamic = 'force-dynamic';


export default async function MyCoursesPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const enrollments = await learning.listEnrollmentsForUser(db, viewer.user.id);
  const attemptsByEnrollment = await Promise.all(enrollments.map((e) => learning.listAttemptsForEnrollment(db, e.id)));
  // Versão publicada em que a pessoa está matriculada: dá o rosto do apresentador e a lista de aulas para o progresso.
  const versions = await Promise.all(enrollments.map((e) => publishing.getVersion(db, e.versionId)));
  const firstName = viewer.user.name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="eyebrow">Meus cursos</p>
        <h1 className="max-w-3xl text-fg">{firstName ? `${firstName}, continue de onde parou.` : 'Continue de onde parou.'}</h1>
        <p className="max-w-prose text-lg leading-relaxed text-fg-muted">Aulas curtas, com decisões e consequências. Retome quando quiser.</p>
      </div>

      {enrollments.length === 0 ? (
        <div className="panel p-6 sm:p-8" data-testid="enrollment-empty">
          <p className="text-lg font-medium text-fg">Você ainda não está matriculado em nenhum curso.</p>
          <p className="mt-1 text-base text-fg-muted">Quando a equipe liberar um curso para você, ele aparece aqui.</p>
        </div>
      ) : (
        <ul className="space-y-6" data-testid="enrollment-list">
          {enrollments.map((enr, i) => {
            const attempts = attemptsByEnrollment[i] ?? [];
            const version = versions[i];
            const doc = version?.document;
            const presenter = doc?.presentation.avatarPreviewUrl;
            // Progresso = aulas concluídas (ao menos uma tentativa concluída, sem contar repetições) / aulas da versão matriculada.
            const lessons = doc ? allLessons(doc) : [];
            const lessonIds = new Set(lessons.map((l) => l.id));
            const totalLessons = lessonIds.size;
            const completedSet = new Set(attempts.filter((a) => a.status === 'completed' && lessonIds.has(a.lessonId)).map((a) => a.lessonId));
            const completedLessons = completedSet.size;
            const done = lessons.map((l) => completedSet.has(l.id));
            const current = enr.status === 'completed' ? undefined : done.findIndex((d) => !d);
            const started = attempts.length > 0;
            const isDone = enr.status === 'completed';
            // "Começar"/"Continuar" vai direto para a aula certa (a em andamento ou a próxima); concluído: a página do curso
            const inProgress = lessons.find((l) => attempts.some((a) => a.lessonId === l.id && a.status === 'in_progress'));
            const nextLesson = isDone ? undefined : (inProgress ?? lessons.find((l) => !completedSet.has(l.id)));
            const nextIndex = nextLesson ? lessons.findIndex((l) => l.id === nextLesson.id) : -1;
            const startHref = nextLesson ? `/aprender/${enr.id}/aulas/${nextLesson.id}` : `/aprender/${enr.id}`;
            const cta = isDone ? 'Ver o curso' : inProgress ? `Continuar aula ${nextIndex + 1}` : started ? `Começar aula ${nextIndex + 1}` : 'Começar';
            const rail = isDone ? 100 : totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
            const lessonsCopy = totalLessons > 0 ? `${totalLessons} ${totalLessons === 1 ? 'aula' : 'aulas'} · ${completedLessons} ${completedLessons === 1 ? 'concluída' : 'concluídas'}` : null;
            const tagline = doc?.learnerSummary?.trim() || doc?.branding.tagline?.trim() || doc?.description?.trim();
            const backdrop = (nextLesson && lessonThumbUrl(nextLesson, 0.15)) || (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenter;
            return (
              <li key={enr.id}>
                <article
                  className="relative isolate overflow-hidden rounded-[22px] border border-line bg-[#0f1030] text-white"
                  data-testid={`enrollment-${enr.id}`}
                  aria-labelledby={`course-${enr.id}`}
                >
                  {backdrop && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={backdrop} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[50%_30%] sm:w-[68%]" />
                  )}
                  <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0f1030] from-35% via-[#0f1030]/70 via-55% to-transparent" />
                  <div className="flex min-h-[340px] max-w-[640px] flex-col justify-end gap-4 p-6 sm:min-h-[380px] sm:p-10">
                    <StatusPill label={isDone ? 'Concluído' : started ? 'Em andamento' : 'Novo'} tone={isDone ? 'done' : 'accent'} />
                    <h2 id={`course-${enr.id}`} className="text-[30px] leading-[1.06] text-white sm:text-[42px]">
                      {enr.courseTitle}
                    </h2>
                    {tagline && <p className="line-clamp-2 max-w-prose text-base leading-relaxed text-white/85">{tagline}</p>}
                    <div className="space-y-2">
                      <div role="progressbar" aria-label={`Progresso em ${enr.courseTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rail} aria-valuetext={lessonsCopy ?? `${rail}%`} className="max-w-md">
                        <Segments total={totalLessons} done={isDone ? lessons.map(() => true) : done} current={current} />
                      </div>
                      <p className="text-sm text-white/75" data-testid="enrollment-progress">
                        {lessonsCopy ?? 'Pronto para começar'}
                        {enr.completedAt && ` · concluído em ${formatDate(enr.completedAt)}`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                      <Link href={startHref} className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')} data-testid="enrollment-start">
                        <Play className="size-5 fill-current" aria-hidden="true" />
                        {cta}
                      </Link>
                      <Link href={`/aprender/${enr.id}`} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[12px] border border-white/40 bg-white/10 px-6 text-[17px] font-semibold text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
                        <ListVideo className="size-5" aria-hidden="true" />
                        Capítulos
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

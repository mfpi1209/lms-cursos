import Link from 'next/link';
import { Award, BookOpen, Check, Clock3, Layers, ListVideo, Play } from 'lucide-react';
import { formatWorkload, spokenWorkload } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { CourseRail } from './course-rail';
import { CoverImage } from './course-tile';
import { FreeEnrollButton } from './free-enroll-button';
import { ctaOutline, ctaPrimary } from './learner-ui';
import type { FreeCourseCardData } from '../_lib/free-course';
import { trailProgressCopy } from '../_lib/trail-order';

/** Título da seção e da página `/aprender/cursos-livres`. */
export const FREE_SECTION_TITLE = 'Cursos livres';
export const FREE_COURSES_HREF = '/aprender/cursos-livres';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "8 h · 7 módulos · 21 aulas" com ícones; a carga por extenso fica para o leitor de tela. */
export function FreeCourseFacts({ workloadMinutes, modules, lessons, className, tone = 'light' }: { workloadMinutes: number; modules: number; lessons: number; className?: string; tone?: 'light' | 'dark' }) {
  const workload = formatWorkload(workloadMinutes);
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] leading-5 tabular-nums', tone === 'dark' ? 'text-white/85' : 'text-fg-muted', className)} data-testid="free-facts">
      {workload && (
        <li className="inline-flex items-center gap-1.5">
          <Clock3 className="size-4 shrink-0" aria-hidden="true" />
          <span aria-hidden="true">{workload}</span>
          <span className="sr-only">{spokenWorkload(workloadMinutes)} de carga horária</span>
        </li>
      )}
      <li className="inline-flex items-center gap-1.5">
        <Layers className="size-4 shrink-0" aria-hidden="true" />
        {count(modules, 'módulo', 'módulos')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <BookOpen className="size-4 shrink-0" aria-hidden="true" />
        {count(lessons, 'aula', 'aulas')}
      </li>
    </ul>
  );
}

/** Selos do curso livre: "Curso livre" sempre; "Com certificado" só quando o curso tem certificado ligado. */
export function FreeCourseBadges({ certificate, className }: { certificate: boolean; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="dna-card__badge" data-testid="free-badge">
        Curso livre
      </span>
      {certificate && (
        <span className="dna-card__badge" data-testid="free-certificate">
          <Award className="size-3.5 text-[#ffb070]" aria-hidden="true" />
          Com certificado
        </span>
      )}
    </span>
  );
}

/**
 * Recorte da foto no quadro do cartão. As capas dos cursos livres são largas (16:9) com a apresentadora no terço
 * esquerdo (rosto entre 22% e 29% da largura; a direita é a parede do estúdio). O quadro do cartão no computador
 * (48% do cartão) mostra cerca de metade da largura da foto: centralizar cortava a pessoa e deixava a parede. 10%
 * põe a pessoa inteira no quadro, com um pouco do estúdio ao lado; no celular o quadro é 16:9 e a foto aparece inteira.
 */
export const FREE_CARD_FOCUS = '10% 30%';

/** Imagens do cartão em ordem: a capa própria do curso (se tiver), a foto do instrutor e o quadro do vídeo. */
export const freeCardImages = (c: Pick<FreeCourseCardData, 'poster' | 'photo' | 'fallback'>): string[] => [c.poster, c.photo, c.fallback].filter((s): s is string => !!s);

/**
 * Curso livre na vitrine: cartão maior que o das pílulas, com a foto do instrutor num quadro marinho e, ao lado (embaixo
 * no celular), título, instrutor, carga horária, módulos e aulas, o andamento real e as duas ações: a principal leva à
 * aula certa ("Começar" / "Continuar módulo N") e "Ver módulos" abre a página do curso. O título também abre a página do
 * curso. Nada interativo fica dentro de outro link.
 */
export function FreeCourseCard({ c, testId, priority = false }: { c: FreeCourseCardData; testId?: string; priority?: boolean }) {
  const done = c.status === 'completed';
  const progressText = done ? 'Curso concluído' : c.status === 'in_progress' ? `${c.completed} de ${c.required} ${c.required === 1 ? 'aula concluída' : 'aulas concluídas'}` : 'Você ainda não começou';
  const open = !!c.enrollCourseId;
  const headingId = `free-${c.id}`;
  return (
    <li className="dna-li" data-status={c.status} data-testid={testId}>
      <article aria-labelledby={headingId} className="dna-free border border-line bg-surface">
        <div className="dna-free__media">
          <CoverImage fallbacks={freeCardImages(c)} format="wide" title={c.title} priority={priority} fallbackPosition={FREE_CARD_FOCUS} />
          <span aria-hidden="true" className="dna-card__scrim dna-card__scrim--soft" />
          <FreeCourseBadges certificate={c.certificate} className="absolute left-3 top-3 right-3" />
        </div>
        <div className="dna-free__body">
          <div className="min-w-0 space-y-1.5">
            <h3 id={headingId} className="text-[20px]! font-bold! leading-[26px]! tracking-[-0.01em]! text-fg [overflow-wrap:anywhere] [text-wrap:balance] md:text-[24px]! md:leading-[30px]!">
              {open ? (
                c.title
              ) : (
                <Link href={c.href} className="rounded-[6px] underline-offset-4 hover:underline" data-testid="free-open">
                  {c.title}
                </Link>
              )}
            </h3>
            {c.presenter && <p className="text-[15px] leading-[22px] text-fg-muted">com {c.presenter}</p>}
            {c.summary && <p className="line-clamp-2 max-w-prose text-[15px] leading-[22px] text-fg/85">{c.summary}</p>}
          </div>
          <FreeCourseFacts workloadMinutes={c.workloadMinutes} modules={c.modules} lessons={c.lessons} />
          <div className="space-y-1.5">
            <span role="progressbar" aria-label="Aulas concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent} aria-valuetext={progressText} className="block h-2 w-full overflow-hidden rounded-full bg-fg/10">
              <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${c.percent}%` }} />
            </span>
            <p className="inline-flex items-center gap-1.5 text-[14px] leading-5 tabular-nums text-fg-muted" data-testid="free-progress">
              {done && <Check className="size-4 text-success" strokeWidth={3} aria-hidden="true" />}
              {progressText}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-1 min-[420px]:flex-row min-[420px]:flex-wrap">
            {c.enrollCourseId ? (
              <FreeEnrollButton courseId={c.enrollCourseId} label={c.cta} title={c.title} />
            ) : (
              <Link href={c.startHref} className={cn(ctaPrimary, 'px-5')} data-testid="free-start">
                {!done && <Play className="size-4 fill-current" aria-hidden="true" />}
                {c.cta}
                <span className="sr-only">: {c.title}</span>
              </Link>
            )}
            {!done && !open && (
              <Link href={c.href} className={cn(ctaOutline, 'px-5')} data-testid="free-modules">
                <ListVideo className="size-4" aria-hidden="true" />
                Ver módulos
                <span className="sr-only">: {c.title}</span>
              </Link>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

/**
 * Seção "Cursos livres" (vitrine e página própria): os cartões em coluna, dois lado a lado no computador quando há mais
 * de um. `href` liga a seção da vitrine à página `/aprender/cursos-livres`.
 */
export function FreeCoursesSection({ courses, href, title = FREE_SECTION_TITLE, className }: { courses: FreeCourseCardData[]; href?: string; title?: string; className?: string }) {
  if (courses.length === 0) return null;
  return (
    <CourseRail
      title={title}
      count={courses.length}
      countLabel={count(courses.length, 'curso livre', 'cursos livres')}
      testId="free-courses"
      progress={`Cursos completos, com módulos e avaliações · ${trailProgressCopy(courses.filter((c) => c.status === 'completed').length, courses.length)}`}
      layout="free"
      {...(href ? { href, hrefLabel: 'Ver todos' } : {})}
      {...(className ? { className } : {})}
    >
      {courses.map((c, i) => (
        <FreeCourseCard key={c.id} c={c} testId={`free-course-${c.id}`} priority={i === 0} />
      ))}
    </CourseRail>
  );
}

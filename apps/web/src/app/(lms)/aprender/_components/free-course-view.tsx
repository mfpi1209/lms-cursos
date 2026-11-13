import Link from 'next/link';
import { BookOpen, Check, ChevronDown, ChevronRight, ClipboardCheck, Footprints, Play } from 'lucide-react';
import { formatWorkload, spokenWorkload } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { FreeCourseBadges, FreeCourseFacts } from './free-course-card';
import { ctaPrimary } from './learner-ui';
import { remainingCopy, type FreeCourseOutline, type FreeLessonRow, type FreeModuleRow } from '../_lib/free-course';

/*
 * Página do curso livre (EaD): cabeçalho com carga horária, módulos e progresso; o que falta para concluir; e a lista de
 * MÓDULOS (acordeão nativo, sem JavaScript) com as aulas e o estado real de cada uma. Componentes de servidor, sem estado:
 * recebem o roteiro pronto (`buildFreeCourseOutline`). Pílulas continuam com a página de capítulos.
 */

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cabeçalho do curso livre: selos, título, instrutor, carga · módulos · aulas, progresso e a ação principal. */
export function FreeCourseHeader({
  title,
  summary,
  presenter,
  photo,
  workloadMinutes,
  certificate,
  outline,
  primary,
  children,
}: {
  title: string;
  summary?: string;
  presenter?: string;
  /** foto do instrutor (nosso domínio) ou quadro da próxima aula */
  photo?: string;
  workloadMinutes: number;
  certificate: boolean;
  outline: FreeCourseOutline;
  /** ação principal: a aula certa */
  primary?: { href: string; label: string };
  /** ações secundárias (recomeçar, menu do curso) */
  children?: React.ReactNode;
}) {
  const { next } = outline;
  const progressText = `${outline.requiredDone} de ${outline.requiredTotal} ${outline.requiredTotal === 1 ? 'aula concluída' : 'aulas concluídas'}`;
  return (
    <header className="relative isolate overflow-hidden rounded-[22px] border border-line bg-[#0f1030] text-white" data-testid="course-hero" data-free="true">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="absolute inset-y-0 right-0 -z-10 hidden h-full w-[52%] object-cover object-[50%_18%] md:block" />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#0f1030] from-48% via-[#0f1030]/75 via-62% to-transparent md:block" />
      <div className="flex max-w-[720px] flex-col gap-4 p-5 sm:p-8 lg:gap-5 lg:p-12">
        <FreeCourseBadges certificate={certificate} />
        <h1 className="text-[30px] leading-[1.08] text-white [text-wrap:balance] sm:text-[44px]">{title}</h1>
        {presenter && <p className="text-base text-white/85">com {presenter}</p>}
        {summary && (
          <p className="max-w-prose text-[16px] leading-relaxed text-white/85 sm:text-lg" data-testid="course-summary">
            {summary}
          </p>
        )}
        <FreeCourseFacts workloadMinutes={workloadMinutes} modules={outline.modules.length} lessons={outline.lessonsTotal} tone="dark" className="text-[15px]" />
        <div className="max-w-md space-y-2">
          <div role="progressbar" aria-label="Progresso no curso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={outline.percent} aria-valuetext={progressText} className="h-2 overflow-hidden rounded-full bg-white/20">
            <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${outline.percent}%` }} />
          </div>
          <p className="text-sm tabular-nums text-white/85" data-testid="free-course-progress">
            {outline.completed ? 'Curso concluído' : `${progressText} · ${outline.percent}%`}
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center" data-testid={next ? 'next-lesson' : undefined}>
          {primary && (
            <Link href={primary.href} className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')} data-testid="course-start">
              <Play className="size-5 fill-current" aria-hidden="true" />
              {primary.label}
            </Link>
          )}
          {children}
        </div>
        {next && (
          <p className="text-sm text-white/85">
            {next.inProgress ? 'Você parou em' : 'Próxima aula'}:{' '}
            <span className="font-semibold text-white">
              Módulo {next.moduleIndex} · Aula {next.lessonIndex} · {next.title}
            </span>
          </p>
        )}
      </div>
    </header>
  );
}

function RemainingItem({ icon, label, done, total, unit, note, testId }: { icon: React.ReactNode; label: string; done: number; total: number; unit: string; note?: string; testId: string }) {
  const complete = done >= total;
  return (
    <li className="flex items-start gap-3 rounded-[14px] border border-line bg-bg/60 p-3.5 sm:p-4" data-testid={testId} data-complete={complete || undefined}>
      <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-full', complete ? 'bg-accent-fill text-accent-fill-fg' : 'border border-line-strong text-fg-muted')}>
        {complete ? <Check className="size-5" strokeWidth={3} /> : icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[15px] font-semibold leading-5 text-fg">{label}</p>
        <p className="text-sm tabular-nums text-fg-muted">
          {done} de {total} {unit}
        </p>
        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-fg/10">
          <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0}%` }} />
        </span>
        {note && <p className="text-[13px] leading-[18px] text-fg-muted">{note}</p>}
      </div>
    </li>
  );
}

/** "O que falta para concluir": aulas obrigatórias, avaliações e missões (estas não travam o curso). */
export function FreeCourseRemaining({ outline }: { outline: FreeCourseOutline }) {
  return (
    <section aria-labelledby="remaining-heading" className="rounded-[22px] border border-line bg-surface p-5 sm:p-6" data-testid="free-course-remaining">
      <h2 id="remaining-heading" className="text-[22px]! font-semibold! leading-snug text-fg">
        {outline.completed ? 'Curso concluído' : 'O que falta para concluir'}
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-fg-muted" data-testid="free-course-remaining-copy">
        {remainingCopy(outline)}
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <RemainingItem icon={<BookOpen className="size-5" />} label="Aulas obrigatórias" done={outline.requiredDone} total={outline.requiredTotal} unit={outline.requiredTotal === 1 ? 'concluída' : 'concluídas'} testId="remaining-lessons" />
        {outline.assessments.total > 0 && (
          <RemainingItem
            icon={<ClipboardCheck className="size-5" />}
            label="Avaliações"
            done={outline.assessments.done}
            total={outline.assessments.total}
            unit={outline.assessments.total === 1 ? 'questão aprovada' : 'questões aprovadas'}
            note="Ficam dentro das aulas de prática de cada módulo."
            testId="remaining-assessments"
          />
        )}
        {outline.missions.total > 0 && (
          <RemainingItem
            icon={<Footprints className="size-5" />}
            label="Missões"
            done={outline.missions.done}
            total={outline.missions.total}
            unit={outline.missions.total === 1 ? 'feita' : 'feitas'}
            note="Para levar à vida real. Não travam o curso."
            testId="remaining-missions"
          />
        )}
      </ul>
    </section>
  );
}

const lessonStateText = (l: FreeLessonRow) => (l.state === 'completed' ? 'Concluída' : l.state === 'in_progress' ? `Em andamento, ${l.percent}%` : l.state === 'next' ? 'Próxima aula' : l.isNew ? 'Conteúdo novo, opcional' : 'Não iniciada');
const lessonAction = (l: FreeLessonRow) => (l.state === 'completed' ? 'Rever' : l.state === 'in_progress' ? 'Continuar' : 'Começar');

function LessonRow({ l, enrollmentId }: { l: FreeLessonRow; enrollmentId: string }) {
  const href = l.state === 'completed' ? `/aprender/${enrollmentId}/aulas/${l.id}/rever` : `/aprender/${enrollmentId}/aulas/${l.id}`;
  const active = l.state === 'in_progress' || l.state === 'next';
  const minutes = l.minutes > 0 ? `${l.minutes} min` : null;
  const assessment = l.assessments.total > 0 ? `Avaliação: ${l.assessments.done} de ${count(l.assessments.total, 'questão aprovada', 'questões aprovadas')}` : null;
  const mission = l.missions.total > 0 ? (l.missions.done >= l.missions.total ? 'Missão feita' : 'Missão para a vida real') : null;
  return (
    <li data-testid={`lesson-${l.id}`} data-state={l.state}>
      <Link
        href={href}
        {...(active ? { 'aria-current': 'step' as const } : {})}
        aria-label={`Aula ${l.index}: ${l.title}. ${lessonStateText(l)}.${minutes ? ` Cerca de ${count(l.minutes, 'minuto', 'minutos')}.` : ''}${assessment ? ` ${assessment}.` : ''} ${lessonAction(l)}.`}
        className={cn(
          'group/row flex min-h-16 items-center gap-3 rounded-[14px] border px-3 py-3 transition-colors hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4 sm:px-4',
          active ? 'border-[var(--im-accent-line)] bg-[color-mix(in_oklab,var(--im-accent)_8%,transparent)]' : 'border-transparent',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
            l.state === 'completed' ? 'bg-accent-fill text-accent-fill-fg' : active ? 'border-2 border-[var(--im-accent)] text-fg' : 'border border-line-strong text-fg-muted',
          )}
        >
          {l.state === 'completed' ? <Check className="size-4" strokeWidth={3} /> : l.state === 'in_progress' ? <Play className="ml-0.5 size-4 fill-current" /> : l.index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-[18px] text-fg-muted">
            Aula {l.index} ·{' '}
            <span className={cn(l.state === 'completed' && 'text-success', active && 'font-semibold text-accent')}>{l.state === 'in_progress' ? `Em andamento · ${l.percent}%` : l.state === 'next' ? 'Próxima' : lessonStateText(l)}</span>
          </span>
          <span className="mt-0.5 block text-[16px] font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{l.title}</span>
          {(assessment || mission) && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] leading-[18px] text-fg-muted">
              {assessment && (
                <span className="inline-flex items-center gap-1" data-testid="lesson-assessment">
                  <ClipboardCheck className="size-3.5 shrink-0" />
                  {assessment}
                </span>
              )}
              {mission && (
                <span className="inline-flex items-center gap-1">
                  <Footprints className="size-3.5 shrink-0" />
                  {mission}
                </span>
              )}
            </span>
          )}
        </span>
        {minutes && <span className="shrink-0 text-[13px] tabular-nums text-fg-muted">{minutes}</span>}
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted transition-transform group-hover/row:translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </li>
  );
}

function ModuleBlock({ m, enrollmentId, open }: { m: FreeModuleRow; enrollmentId: string; open: boolean }) {
  const done = m.state === 'completed';
  const workload = formatWorkload(m.minutes);
  return (
    <li>
      <details open={open} className="group/mod overflow-hidden rounded-[18px] border border-line bg-surface open:shadow-[0_6px_20px_rgba(29,30,76,0.06)]" data-testid={`module-${m.id}`} data-state={m.state} data-current={m.current || undefined}>
        <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-fg/[0.03] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-accent sm:gap-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className={cn('grid size-11 shrink-0 place-items-center rounded-full text-base font-bold tabular-nums', done ? 'bg-accent-fill text-accent-fill-fg' : m.current ? 'bg-[#1d1e4c] text-white' : 'border border-line-strong text-fg-muted')}>
            {done ? <Check className="size-5" strokeWidth={3} /> : m.index}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-semibold uppercase leading-[18px] tracking-[0.06em] text-fg-muted">
              Módulo {m.index}
              {m.current && <span className="rounded-full bg-[#1d1e4c] px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-white">Você está aqui</span>}
            </span>
            <h3 className="mt-0.5 text-[17px]! font-semibold! leading-snug! text-fg [overflow-wrap:anywhere] sm:text-[19px]!">{m.title}</h3>
            <span className="mt-1 block text-[13px] leading-[18px] tabular-nums text-fg-muted sm:text-sm">
              {m.done} de {count(m.total, 'aula concluída', 'aulas concluídas')}
              {workload && (
                <>
                  {' · '}
                  <span aria-hidden="true">{workload}</span>
                  <span className="sr-only">{spokenWorkload(m.minutes)}</span>
                </>
              )}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-fg-muted transition-transform group-open/mod:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="border-t border-line px-2 pb-3 pt-3 sm:px-3">
          {m.description && <p className="max-w-prose px-2 pb-2 text-[15px] leading-relaxed text-fg-muted">{m.description}</p>}
          <ol className="space-y-1">
            {m.lessons.map((l) => (
              <LessonRow key={l.id} l={l} enrollmentId={enrollmentId} />
            ))}
          </ol>
          {m.assessments.total > 0 && (
            <p className="mx-2 mt-2 flex items-center gap-2 rounded-[12px] bg-fg/5 px-3 py-2.5 text-sm text-fg" data-testid="module-assessment">
              <ClipboardCheck className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>
                <span className="font-semibold">Avaliação do módulo:</span> {m.assessments.done} de {count(m.assessments.total, 'questão aprovada', 'questões aprovadas')}
                {m.assessments.answered === 0 && ' (ainda não feita)'}
              </span>
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

/** Módulos do curso livre em acordeão: abre no módulo da próxima aula (ou no primeiro, com o curso concluído). */
export function FreeCourseModules({ outline, enrollmentId }: { outline: FreeCourseOutline; enrollmentId: string }) {
  const hasCurrent = outline.modules.some((m) => m.current);
  return (
    <section id="capitulos" aria-labelledby="lessons-heading" className="scroll-mt-6 space-y-4" data-testid="lesson-list">
      <div>
        <h2 id="lessons-heading" className="text-[28px] leading-tight text-fg sm:text-[32px]">
          Módulos
        </h2>
        <p className="mt-1 text-[15px] text-fg-muted">
          {count(outline.modules.length, 'módulo', 'módulos')} · {count(outline.lessonsTotal, 'aula', 'aulas')}. Toque num módulo para ver as aulas.
        </p>
      </div>
      <ol className="space-y-3">
        {outline.modules.map((m, i) => (
          <ModuleBlock key={m.id} m={m} enrollmentId={enrollmentId} open={hasCurrent ? m.current : i === 0} />
        ))}
      </ol>
    </section>
  );
}

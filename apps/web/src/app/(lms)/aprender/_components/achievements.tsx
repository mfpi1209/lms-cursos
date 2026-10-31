import { Award, Briefcase, CalendarClock, Check, Shirt, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícone do selo de cada trilha (nomes atuais; trilha nova usa a medalha). */
const TRAIL_ICONS: Record<string, LucideIcon> = {
  'primeiro emprego': Briefcase,
  'rotina e combinados': CalendarClock,
  convivência: Users,
  'imagem e postura': Shirt,
};
const iconFor = (trail: string) => TRAIL_ICONS[trail.toLocaleLowerCase('pt-BR')] ?? Award;

export interface TrailProgress {
  trail: string;
  done: number;
  total: number;
}

/** Os últimos 7 dias (hoje por último), em AAAA-MM-DD no fuso de São Paulo, com a inicial do dia. */
function lastWeek(): Array<{ day: string; label: string; name: string }> {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const wd = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const name = wd.format(d);
    return { day: fmt.format(d), label: name.charAt(0).toUpperCase(), name };
  });
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-fg/10" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-[var(--im-accent)]" strokeDasharray={`${c * pct} ${c}`} />
    </svg>
  );
}

/**
 * Faixa de conquistas do aluno: cursos concluídos (anel), aulas, decisões tomadas, dias com prática
 * na semana e um selo por trilha (aceso quando a trilha inteira foi concluída).
 */
export function Achievements({ coursesDone, coursesTotal, lessonsDone, choices, activeDays, trails }: { coursesDone: number; coursesTotal: number; lessonsDone: number; choices: number; activeDays: string[]; trails: TrailProgress[] }) {
  const week = lastWeek();
  const active = new Set(activeDays);
  const practiced = week.filter((d) => active.has(d.day)).length;
  return (
    <section aria-labelledby="achievements-title" className="rounded-[22px] border border-line bg-surface p-5 sm:p-6" data-testid="achievements">
      <h2 id="achievements-title" className="sr-only">Seu progresso</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:flex lg:flex-wrap lg:items-center lg:gap-x-14">
        <div className="col-span-2 flex items-center gap-4 lg:col-span-1">
          <div className="relative">
            <Ring value={coursesDone} total={coursesTotal} />
            <span className="absolute inset-0 grid place-items-center text-[15px] font-semibold tabular-nums text-fg">{coursesDone}</span>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Cursos concluídos</dt>
            <dd className="text-[22px] font-semibold leading-tight text-fg">
              {coursesDone} <span className="text-base font-normal text-fg-muted">de {coursesTotal}</span>
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">Aulas concluídas</dt>
          <dd className="text-[22px] font-semibold tabular-nums leading-tight text-fg">{lessonsDone}</dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">Decisões tomadas</dt>
          <dd className="text-[22px] font-semibold tabular-nums leading-tight text-fg">{choices}</dd>
        </div>
        <div className="col-span-2 lg:ml-auto">
          <dt className="text-sm text-fg-muted">Nesta semana</dt>
          <dd className="mt-1.5">
            <span className="sr-only">Você praticou em {practiced} dos últimos 7 dias.</span>
            <ol className="flex gap-1.5" aria-hidden="true">
              {week.map((d) => (
                <li key={d.day} title={d.name} className={cn('grid size-8 place-items-center rounded-full text-xs font-semibold', active.has(d.day) ? 'bg-accent-fill text-accent-fill-fg' : 'border border-line text-fg-muted')}>
                  {d.label}
                </li>
              ))}
            </ol>
          </dd>
        </div>
      </dl>
      {trails.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-medium text-fg-muted">Selos das trilhas</h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-4">
            {trails.map((t) => {
              const Icon = iconFor(t.trail);
              const earned = t.total > 0 && t.done >= t.total;
              return (
                <li key={t.trail} className="flex items-center gap-3">
                  <span className={cn('relative grid size-11 shrink-0 place-items-center rounded-full', earned ? 'bg-accent-fill text-accent-fill-fg shadow-[0_8px_20px_-10px_var(--im-accent)]' : 'border border-dashed border-line-strong text-fg-muted')}>
                    <Icon className="size-5" aria-hidden="true" />
                    {earned && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-success text-white">
                        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-snug text-fg">{t.trail}</span>
                    <span className="block text-sm text-fg-muted">{earned ? 'Selo conquistado' : `${t.done} de ${t.total} cursos`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

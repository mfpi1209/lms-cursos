import Link from 'next/link';
import { Award, Check, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seriesLessonsCopy, seriesMetaCopy, type SeriesCardData } from '../_lib/series';

/** Cartão-resumo de uma trilha em série (as cores e o formato do cartão deitado dos cursos). */
export function seriesBadgeCue(s: Pick<SeriesCardData, 'badge' | 'hasBadge' | 'trail'>): string | null {
  if (!s.hasBadge) return null;
  return s.badge ? `Selo DNA Work conquistado` : `Selo DNA Work · ${s.trail}`;
}

/** Texto para leitor de tela: o cartão inteiro numa frase. */
export function seriesSpoken(s: SeriesCardData): string {
  const state = s.status === 'completed' ? 'Concluída' : s.status === 'in_progress' ? seriesLessonsCopy(s.completed, s.lessons) : 'Ainda não começou';
  return `${s.trail}. ${seriesMetaCopy(s.total, s.instructor)}. ${state}.`;
}

/**
 * Uma trilha em série na fileira: um só cartão no lugar de um por curso. O título abre a página da trilha (o cartão
 * inteiro é o link); o botão (Começar / Continuar parte N / Ver selo) é um segundo link, por cima, que vai direto à aula
 * certa da matrícula que já existe (como o cartão de um curso). Sem estado: serve na vitrine e em "Minhas trilhas".
 */
export function SeriesTile({ s, testId }: { s: SeriesCardData; testId?: string }) {
  const done = s.status === 'completed';
  const cue = seriesBadgeCue(s);
  return (
    <li className="flex w-[85vw] max-w-[440px] shrink-0 snap-start sm:w-[380px] xl:w-[420px]" data-testid={testId}>
      <div className="group/sc relative isolate flex h-full min-h-[252px] w-full overflow-hidden rounded-[16px] bg-[#1d1e4c] text-white shadow-[0_22px_45px_-30px_rgba(29,30,76,0.6)] ring-1 ring-inset ring-white/10 transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        {s.portrait && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.portrait} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-y-0 right-0 -z-[2] h-full w-[62%] object-cover object-[50%_18%]" />
        )}
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-gradient-to-r from-[#1d1e4c] from-40% via-[#1d1e4c]/90 via-58% to-[#1d1e4c]/10" />
        <div className="relative flex w-full max-w-[330px] flex-col justify-center gap-2.5 px-5 py-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#ffb070]">Trilha em {s.total} partes</p>
          <h3 className="text-[24px]! font-extrabold! leading-[1.08]! text-white! [text-wrap:balance]">
            <Link
              href={s.href}
              data-testid="series-open"
              aria-label={seriesSpoken(s)}
              className="rounded-md after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {s.trail}
            </Link>
          </h3>
          <p className="text-[14px] leading-tight text-[#d9d8f5]" data-testid="series-meta">
            {seriesMetaCopy(s.total, s.instructor)}
          </p>
          <div aria-hidden="true" className="flex gap-1.5">
            {s.parts.map((p) => {
              const pct = p.status === 'completed' ? 100 : p.lessons > 0 ? Math.round((p.completed / p.lessons) * 100) : 0;
              return (
                <span key={p.n} className={cn('min-w-0 flex-1', !p.available && 'opacity-40')}>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-white/25">
                    <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${pct === 0 ? 0 : Math.max(8, pct)}%` }} />
                  </span>
                  <span className="mt-1 block truncate text-[11px] leading-none text-white/80">Parte {p.n}</span>
                </span>
              );
            })}
          </div>
          <p className="text-[13px] tabular-nums text-white/90" data-testid="series-progress">
            {s.status === 'new' ? `${s.lessons} ${s.lessons === 1 ? 'aula' : 'aulas'} no total` : seriesLessonsCopy(s.completed, s.lessons)}
          </p>
          {cue && (
            <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white" data-testid="series-badge-cue">
              <Award className="size-4 shrink-0 text-[#FF7A08]" aria-hidden="true" />
              {cue}
            </p>
          )}
          <div className="relative z-10 mt-1 flex flex-wrap items-center gap-2.5">
            {done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FF7A08] py-1 pl-2 pr-3 text-xs font-bold text-[#1d1e4c]" data-testid="series-done">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                Concluído
              </span>
            )}
            <Link
              href={s.cta.href}
              data-testid="series-cta"
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white',
                done ? 'border-2 border-white/85 text-white hover:bg-white/10' : 'bg-[#FF7A08] text-[#1d1e4c] shadow-[0_10px_24px_-12px_#FF7A08] hover:brightness-105',
              )}
            >
              {!done && <Play className="size-3.5 fill-current" aria-hidden="true" />}
              {s.cta.label}
              {s.status !== 'new' && !done && <span className="sr-only">: {s.trail}</span>}
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Award, Check, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seriesLessonsCopy, seriesMetaCopy, type SeriesCardData } from '../_lib/series';
import { trailArtFor } from '../_lib/course-art';

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
 * O botão do cartão pelo estado real da série: não começou → "Explorar trilha" (abre a página da trilha); em andamento →
 * "Continuar parte N" (direto na aula certa, como antes); concluída → "Rever trilha". "Ver selo" é à parte (só com selo conquistado).
 */
export function seriesCardCta(s: Pick<SeriesCardData, 'status' | 'cta' | 'href'>): { label: string; href: string } {
  if (s.status === 'completed') return { label: 'Rever trilha', href: s.href };
  if (s.status === 'in_progress') return s.cta;
  return { label: 'Explorar trilha', href: s.href };
}

/** Imagem de fundo do cartão da trilha: a arte da trilha (pessoa à direita, roxo à esquerda) ou, sem arte, o retrato antigo. */
function TrailImage({ s, priority }: { s: SeriesCardData; priority: boolean }) {
  const art = trailArtFor(s.key);
  const [failed, setFailed] = React.useState(false);
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  if (art && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={ref} src={art.src} alt="" width={art.width} height={art.height} loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className="dna-trail__img" style={{ objectPosition: art.position }} />
    );
  }
  if (s.portrait) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={s.portrait} alt="" loading="lazy" referrerPolicy="no-referrer" className="dna-trail__img dna-trail__img--portrait" />
    );
  }
  return null;
}

/**
 * Uma trilha em série: um só cartão no lugar de um por curso. O título abre a página da trilha (o cartão inteiro é o
 * link); o botão é um segundo link, por cima, que leva à aula certa (Continuar parte N) ou à página da trilha (Explorar
 * / Rever trilha). Tudo é dado real da série (partes, aulas, andamento); o benefício é o texto fixo da trilha.
 * `banner` = a trilha escolhida no filtro: ocupa a linha inteira, acima dos três cursos.
 */
export function SeriesTile({ s, testId, banner = false, priority = false }: { s: SeriesCardData; testId?: string; banner?: boolean; priority?: boolean }) {
  const done = s.status === 'completed';
  const cue = seriesBadgeCue(s);
  const art = trailArtFor(s.key);
  const cta = seriesCardCta(s);
  return (
    <li className="dna-li" data-testid={testId}>
      <div className={cn('dna-trail group/sc', banner && 'dna-trail--banner')}>
        <TrailImage s={s} priority={priority} />
        {!art && <div aria-hidden="true" className="dna-trail__fade" />}
        <div className="dna-trail__body">
          <p className="dna-trail__eyebrow">Trilha em {s.total} partes</p>
          <h3 className="dna-trail__title">
            <Link href={s.href} data-testid="series-open" aria-label={seriesSpoken(s)} className="dna-trail__link">
              {s.trail}
            </Link>
          </h3>
          {art && <p className="dna-trail__benefit">{art.benefit}</p>}
          <p className="dna-trail__meta" data-testid="series-meta">
            {seriesMetaCopy(s.total, s.instructor)}
            {s.status !== 'in_progress' && ` · ${s.lessonsTotal} ${s.lessonsTotal === 1 ? 'aula' : 'aulas'}`}
          </p>
          {s.status === 'in_progress' && (
            <>
              <div aria-hidden="true" className="dna-trail__parts">
                {s.parts.map((p) => {
                  const pct = p.status === 'completed' ? 100 : p.lessons > 0 ? Math.round((p.completed / p.lessons) * 100) : 0;
                  return (
                    <span key={p.n} className={cn('min-w-0 flex-1', !p.available && 'opacity-40')}>
                      <span className="block h-[3px] overflow-hidden rounded-full bg-white/25">
                        <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  );
                })}
              </div>
              <p className="dna-trail__meta tabular-nums" data-testid="series-progress">
                {seriesLessonsCopy(s.completed, s.lessons)}
              </p>
            </>
          )}
          {s.badge && cue && (
            <p className="dna-trail__meta inline-flex items-center gap-1.5 font-medium text-white" data-testid="series-badge-cue">
              <Award className="size-4 shrink-0 text-[#FF7A08]" aria-hidden="true" />
              {cue}
            </p>
          )}
          <div className="dna-trail__actions">
            {done && (
              <span className="dna-card__badge" data-testid="series-done">
                <span className="grid size-4 place-items-center rounded-full bg-[#FF7A08] text-[#1d1e4c]">
                  <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
                </span>
                Concluído
              </span>
            )}
            <Link href={cta.href} data-testid="series-cta" className={cn('dna-trail__cta', done && 'dna-trail__cta--ghost')}>
              {!done && s.status === 'in_progress' && <Play className="size-3.5 fill-current" aria-hidden="true" />}
              {cta.label}
              <span className="sr-only">: {s.trail}</span>
            </Link>
            {s.badge && (
              <Link href={s.href} data-testid="series-seal" className="dna-trail__cta dna-trail__cta--ghost">
                Ver selo
                <span className="sr-only">: {s.trail}</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

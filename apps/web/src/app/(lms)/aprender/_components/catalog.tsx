'use client';

import * as React from 'react';
import { CourseRail } from './course-rail';
import { CourseTile, type CourseTileData } from './course-tile';
import { SeriesTile } from './series-tile';
import type { SeriesCardData } from '../_lib/series';
import { orderInTrail, trailProgressCopy } from '../_lib/trail-order';

export interface CatalogItem {
  tile: CourseTileData;
  trail?: string;
  done: boolean;
  started: boolean;
}

const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface CatalogTrail {
  name: string;
  slug: string;
}

/**
 * Vitrine por trilha (editorial claro): fichas ("Todos" + uma por trilha, na ordem de aprendizado), busca vinda do
 * cabeçalho (?q=) e uma fileira por trilha (cartões em pé) com o progresso real e o link da trilha; curso sem trilha
 * vai para "Mais cursos". Escolher uma ficha mostra só a fileira daquela trilha; fileira sem resultado some.
 * Trilha em série (`series[nome]`): a fileira tem UM cartão que abre as partes, em vez de um cartão por curso.
 */
export function Catalog({ items, trails, series = {}, query }: { items: CatalogItem[]; trails: CatalogTrail[]; /** cartão da série, por nome de trilha */ series?: Record<string, SeriesCardData>; query?: string }) {
  const [trail, setTrail] = React.useState<string | null>(null);
  const q = norm(query?.trim() ?? '');
  const matches = (i: CatalogItem) => !q || norm(`${i.tile.title} ${i.tile.fullTitle} ${i.tile.presenter ?? ''} ${i.trail ?? ''}`).includes(q);
  const seriesMatches = (s: SeriesCardData) => !q || norm(`${s.trail} ${s.instructor ?? ''} ${s.parts.map((p) => p.title).join(' ')}`).includes(q);
  const visible = items.filter((i) => (!trail || i.trail === trail) && (i.trail && series[i.trail] ? seriesMatches(series[i.trail]!) : matches(i)));
  const hasLoose = items.some((i) => !i.trail);
  const groups = [
    ...trails.map((t) => ({ key: t.slug, name: t.name, href: `/aprender/trilhas/${t.slug}` as string | undefined, all: items.filter((i) => i.trail === t.name) })),
    ...(hasLoose && !trail ? [{ key: 'mais-cursos', name: 'Mais cursos', href: undefined, all: items.filter((i) => !i.trail) }] : []),
  ]
    .filter((g) => !trail || g.name === trail)
    .map((g) => {
      const card = series[g.name];
      return { ...g, series: card && seriesMatches(card) ? card : undefined, items: card ? [] : orderInTrail(g.all.filter(matches), (i) => ({ done: i.done, started: i.started, title: i.tile.title })) };
    })
    .filter((g) => g.items.length > 0 || g.series);
  // Sem ficha escolhida, as trilhas em série dividem UMA fileira ("Trilhas em 3 partes"), no lugar da primeira delas,
  // em vez de uma seção com um cartão só para cada. Com a ficha de uma trilha em série, ela aparece sozinha, como antes.
  const seriesGroups = trail ? [] : groups.filter((g) => g.series);
  type Row = (typeof groups)[number] | { key: 'trilhas-em-partes'; seriesCards: SeriesCardData[] };
  const rows: Row[] =
    seriesGroups.length > 1
      ? groups.flatMap<Row>((g) => (!g.series ? [g] : g === seriesGroups[0] ? [{ key: 'trilhas-em-partes', seriesCards: seriesGroups.map((s) => s.series!) }] : []))
      : groups;
  const seriesParts = seriesGroups[0]?.series?.total ?? 3;
  const chip = (active: boolean) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'bg-accent-fill text-accent-fill-fg shadow-[0_8px_18px_-10px_var(--im-accent)]' : 'border border-line bg-surface text-fg hover:border-fg/30'}`;

  return (
    <div id="cursos" tabIndex={-1} aria-label="Catálogo de cursos" role="region" className="scroll-mt-24 space-y-9 outline-none">
      <div role="group" aria-label="Filtrar por trilha" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        <button type="button" aria-pressed={!trail} onClick={() => setTrail(null)} className={`${chip(!trail)} shrink-0`}>
          Todos
        </button>
        {trails.map((t) => (
          <button key={t.slug} type="button" aria-pressed={trail === t.name} onClick={() => setTrail(trail === t.name ? null : t.name)} className={`${chip(trail === t.name)} shrink-0`}>
            {t.name}
          </button>
        ))}
      </div>
      {q && (
        <p className="text-fg-muted" role="status">
          {visible.length ? `${visible.length} ${visible.length === 1 ? 'curso encontrado' : 'cursos encontrados'} para “${query}”.` : `Nenhum curso encontrado para “${query}”. Tente outra palavra ou veja todos.`}
        </p>
      )}
      {rows.map((g) =>
        'seriesCards' in g ? (
          <CourseRail
            key={g.key}
            title={`Trilhas em ${seriesParts} partes`}
            count={g.seriesCards.length}
            countLabel={`${g.seriesCards.length} ${g.seriesCards.length === 1 ? 'trilha' : 'trilhas'}`}
            testId="trail-trilhas-em-partes"
            progress={`${g.seriesCards.filter((s) => s.partsDone >= s.total).length} de ${g.seriesCards.length} ${g.seriesCards.length === 1 ? 'trilha concluída' : 'trilhas concluídas'}`}
            href="/aprender/trilhas"
            hrefLabel="Minhas trilhas"
          >
            {g.seriesCards.map((s) => (
              <SeriesTile key={s.key} s={s} testId={`series-${s.key}`} />
            ))}
          </CourseRail>
        ) : (
        <CourseRail
          key={g.key}
          title={g.name}
          count={g.series ? g.series.total : g.items.length}
          {...(g.series ? { countLabel: `trilha em ${g.series.total} partes` } : {})}
          testId={`trail-${g.key}`}
          progress={g.series ? trailProgressCopy(g.series.partsDone, g.series.total, 'partes') : trailProgressCopy(g.all.filter((i) => i.done).length, g.all.length)}
          {...(g.href ? { href: g.href } : {})}
        >
          {g.series ? <SeriesTile s={g.series} testId={`series-${g.key}`} /> : g.items.map((i) => <CourseTile key={i.tile.id} c={i.tile} variant="poster" testId={`enrollment-${i.tile.id}`} />)}
        </CourseRail>
        ),
      )}
      {!q && visible.length === 0 && <p className="text-fg-muted">Nenhum curso nesta trilha ainda.</p>}
    </div>
  );
}

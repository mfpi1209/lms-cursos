'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { seriesForTrail, sortBySeriesOrder } from '@lms/course-schema';
import { CourseRail, type RailLayout } from './course-rail';
import { CourseTile, type CourseTileData } from './course-tile';
import { SeriesTile } from './series-tile';
import type { SeriesCardData } from '../_lib/series';
import { orderInTrail, trailProgressCopy } from '../_lib/trail-order';

export interface CatalogItem {
  tile: CourseTileData;
  /** `courses.slug` (ordem das partes numa trilha em série) */
  slug?: string;
  trail?: string;
  done: boolean;
  started: boolean;
  /** publicado e ainda sem matrícula: o cartão inscreve a pessoa */
  open?: boolean;
}

const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface CatalogTrail {
  name: string;
  slug: string;
}

/** Título da fileira que reúne as trilhas em série. */
export const SERIES_ROW_TITLE = 'Aprofunde suas habilidades';

/**
 * Vitrine por trilha: filtros ("Todos", as trilhas de base e "Mais temas", que dá acesso às trilhas em série), busca vinda
 * do cabeçalho (?q=) e uma seção por trilha com o andamento real e o link da trilha. Curso sem trilha vai para "Mais cursos".
 *
 * - Seção de até 3 cursos: três cartões 4:3 que preenchem a linha; com 4 ou mais: cartões em pé (cinco por linha).
 * - Trilhas em série: sem filtro nem busca, UM cartão por trilha numa só fileira ("Aprofunde suas habilidades"). Com a
 *   trilha escolhida (ou achada na busca) a seção mostra o cartão da trilha e os cursos das suas partes; na busca,
 *   cada curso que combina aparece com o seu cartão, e o cartão da trilha só quando é a própria trilha que combina.
 * - Escolher um filtro mostra só a seção daquela trilha; seção sem resultado some.
 */
export function Catalog({ items, trails, series = {}, query }: { items: CatalogItem[]; trails: CatalogTrail[]; /** cartão da série, por nome de trilha */ series?: Record<string, SeriesCardData>; query?: string }) {
  const [trail, setTrail] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const q = norm(query?.trim() ?? '');
  const matches = (i: CatalogItem) => !q || norm(`${i.tile.title} ${i.tile.fullTitle} ${i.tile.presenter ?? ''} ${i.trail ?? ''}`).includes(q);
  // a própria trilha combina (nome ou instrutor): aí o cartão dela aparece junto dos cursos que combinam
  const trailMatches = (s: SeriesCardData) => !q || norm(`${s.trail} ${s.instructor ?? ''}`).includes(q);
  const visibleItems = items.filter((i) => (!trail || i.trail === trail) && matches(i));
  const visibleSeriesCards = Object.values(series).filter((s) => (!trail || s.trail === trail) && !!q && trailMatches(s));
  const found = new Set([...visibleItems.map((i) => i.tile.id), ...visibleSeriesCards.map((s) => `s:${s.key}`)]).size;

  const hasLoose = items.some((i) => !i.trail);
  const baseTrails = trails.filter((t) => !series[t.name]);
  const moreTrails = trails.filter((t) => !!series[t.name]);
  const moreActive = !!trail && moreTrails.some((t) => t.name === trail);

  type Group = { key: string; name: string; href: string | undefined; all: CatalogItem[]; card?: SeriesCardData; courses: CatalogItem[] };
  const groups: Group[] = [
    ...trails.map((t) => ({ key: t.slug, name: t.name, href: `/aprender/trilhas/${t.slug}` as string | undefined, all: items.filter((i) => i.trail === t.name) })),
    ...(hasLoose && !trail ? [{ key: 'mais-cursos', name: 'Mais cursos', href: undefined, all: items.filter((i) => !i.trail) }] : []),
  ]
    .filter((g) => !trail || g.name === trail)
    .map((g): Group => {
      const card = series[g.name];
      const serie = seriesForTrail(g.name);
      const matched = g.all.filter(matches);
      const courses = serie ? sortBySeriesOrder(serie, matched, (i) => i.slug) : orderInTrail(matched, (i) => ({ done: i.done, started: i.started, title: i.tile.title }));
      return { ...g, ...(card ? { card } : {}), courses };
    });

  // trilhas em série sem filtro nem busca: uma fileira só, com um cartão por trilha, no lugar da primeira delas
  const collapse = !trail && !q;
  const seriesGroups = collapse ? groups.filter((g) => g.card) : [];
  type Row = { type: 'group'; g: Group } | { type: 'series'; cards: SeriesCardData[] };
  const rows: Row[] = groups.flatMap<Row>((g) => {
    if (collapse && g.card) {
      const head: Row[] = g === seriesGroups[0] ? [{ type: 'series', cards: seriesGroups.map((x) => x.card!) }] : [];
      const openCourses = g.courses.filter((c) => c.open);
      if (openCourses.length === 0) return head;
      return [...head, { type: 'group', g: { ...g, card: undefined, href: undefined, courses: openCourses, all: openCourses } }];
    }
    if (g.card) return g.courses.length > 0 || (g.card && trailMatches(g.card) && !!q) ? [{ type: 'group', g }] : [];
    return g.courses.length > 0 ? [{ type: 'group', g }] : [];
  });

  const chip = (active: boolean) =>
    `relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium leading-5 transition-colors lg:min-h-10 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--dna-focus)] ${active ? 'bg-accent-fill text-accent-fill-fg shadow-[0_8px_18px_-10px_var(--im-accent)]' : 'border border-line bg-surface text-fg hover:border-fg/30'}`;
  const pick = (name: string | null) => setTrail(name === null || trail === name ? null : name);

  return (
    <div id="cursos" tabIndex={-1} aria-label="Catálogo de cursos" role="region" className="scroll-mt-24 outline-none" data-testid="catalog">
      <div className="mt-6">
        <div role="group" aria-label="Filtrar por trilha" className="dna-filters">
          <button type="button" aria-pressed={!trail} onClick={() => setTrail(null)} className={chip(!trail)}>
            Todos
          </button>
          {baseTrails.map((t) => (
            <button key={t.slug} type="button" aria-pressed={trail === t.name} onClick={() => pick(t.name)} className={chip(trail === t.name)}>
              {t.name}
            </button>
          ))}
          {moreTrails.length > 0 && (
            <button
              ref={moreRef}
              type="button"
              aria-expanded={more}
              aria-controls="mais-temas"
              onClick={() => setMore((o) => !o)}
              onKeyDown={(e) => e.key === 'Escape' && more && setMore(false)}
              className={chip(moreActive)}
              data-active={moreActive || undefined}
              data-testid="filter-more"
            >
              Mais temas
              <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
              {moreActive && <span className="sr-only">: {trail} selecionada</span>}
            </button>
          )}
        </div>
        {more && moreTrails.length > 0 && (
          <div
            id="mais-temas"
            role="group"
            aria-label="Mais temas"
            className="mt-2 flex flex-wrap gap-2"
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              setMore(false);
              moreRef.current?.focus();
            }}
          >
            {moreTrails.map((t) => (
              <button key={t.slug} type="button" aria-pressed={trail === t.name} onClick={() => pick(t.name)} className={chip(trail === t.name)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {q && (
        <p className="mt-6 text-fg-muted" role="status">
          {found ? `${found} ${found === 1 ? 'resultado encontrado' : 'resultados encontrados'} para “${query}”.` : `Nenhum curso encontrado para “${query}”. Tente outra palavra ou veja todos.`}
        </p>
      )}
      {rows.map((row) => {
        if (row.type === 'series') {
          return (
            <CourseRail
              key="trilhas-em-partes"
              title={SERIES_ROW_TITLE}
              count={row.cards.length}
              countLabel={`${row.cards.length} ${row.cards.length === 1 ? 'trilha' : 'trilhas'}`}
              testId="trail-trilhas-em-partes"
              progress={`${row.cards.filter((s) => s.partsDone >= s.total).length} de ${row.cards.length} ${row.cards.length === 1 ? 'trilha concluída' : 'trilhas concluídas'}`}
              href="/aprender/trilhas"
              hrefLabel="Minhas trilhas"
              layout="trails"
            >
              {row.cards.map((s) => (
                <SeriesTile key={s.key} s={s} testId={`series-${s.key}`} />
              ))}
            </CourseRail>
          );
        }
        const g = row.g;
        const onlyOpen = g.courses.length > 0 && g.courses.every((c) => c.open);
        const layout: RailLayout = g.card || g.courses.length <= 3 ? 'wide3' : 'portrait5';
        const variant = layout === 'portrait5' ? 'portrait' : 'landscape';
        const showCard = !!g.card && (!q || trailMatches(g.card));
        return (
          <CourseRail
            key={g.key}
            title={g.name}
            count={g.card ? g.card.total : g.courses.length}
            {...(g.card ? { countLabel: `trilha em ${g.card.total} partes` } : {})}
            testId={`trail-${g.key}`}
            progress={onlyOpen ? `${g.courses.length} ${g.courses.length === 1 ? 'curso disponível' : 'cursos disponíveis'}` : g.card ? trailProgressCopy(g.card.partsDone, g.card.total, 'partes') : trailProgressCopy(g.all.filter((i) => i.done).length, g.all.length)}
            {...(g.href && !onlyOpen ? { href: g.href } : {})}
            layout={layout}
            {...(showCard ? { lead: <SeriesTile s={g.card!} testId={`series-${g.key}`} banner /> } : {})}
          >
            {g.courses.map((i) => (
              <CourseTile key={i.tile.id} c={i.tile} variant={variant} testId={`enrollment-${i.tile.id}`} />
            ))}
          </CourseRail>
        );
      })}
      {rows.length === 0 && (
        <div className="dna-section" data-testid="catalog-empty">
          {!q && (
            <p className="text-fg-muted">
              Nenhum curso nesta trilha ainda.{' '}
              {trail && (
                <button type="button" onClick={() => setTrail(null)} className="font-semibold text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--dna-focus)]">
                  Ver todos
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import { CourseRail } from './course-rail';
import { CourseTile, type CourseTileData } from './course-tile';

export interface CatalogItem {
  tile: CourseTileData;
  trail?: string;
  done: boolean;
  started: boolean;
}

const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Vitrine filtrável (editorial claro): fichas por trilha ("Todos" + uma por trilha), busca vinda do
 * cabeçalho (?q=) e as fileiras "Cursos em destaque" (capas em pé), "Cursos de 10 minutos" e "Concluídos".
 */
export function Catalog({ items, trails, query }: { items: CatalogItem[]; trails: string[]; query?: string }) {
  const [trail, setTrail] = React.useState<string | null>(null);
  const q = norm(query?.trim() ?? '');
  const visible = items.filter((i) => (!trail || i.trail === trail) && (!q || norm(`${i.tile.title} ${i.tile.presenter ?? ''} ${i.trail ?? ''}`).includes(q)));
  const open = visible.filter((i) => !i.done).sort((a, b) => Number(b.started) - Number(a.started));
  const short = visible.filter((i) => !i.done && i.tile.minutes > 0 && i.tile.minutes <= 12);
  const done = visible.filter((i) => i.done);
  const chip = (active: boolean) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'bg-accent-fill text-accent-fill-fg shadow-[0_8px_18px_-10px_var(--im-accent)]' : 'border border-line bg-surface text-fg hover:border-fg/30'}`;

  return (
    <div id="cursos" className="scroll-mt-24 space-y-9">
      <div role="group" aria-label="Filtrar por trilha" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        <button type="button" aria-pressed={!trail} onClick={() => setTrail(null)} className={chip(!trail)}>
          Todos
        </button>
        {trails.map((t) => (
          <button key={t} type="button" aria-pressed={trail === t} onClick={() => setTrail(trail === t ? null : t)} className={`${chip(trail === t)} shrink-0`}>
            {t}
          </button>
        ))}
      </div>
      {q && (
        <p className="text-fg-muted" role="status">
          {visible.length ? `${visible.length} ${visible.length === 1 ? 'curso encontrado' : 'cursos encontrados'} para “${query}”.` : `Nenhum curso encontrado para “${query}”. Tente outra palavra ou veja todos.`}
        </p>
      )}
      {open.length > 0 && (
        <CourseRail title="Cursos em destaque" count={open.length} testId="rail-featured">
          {open.map((i) => (
            <CourseTile key={i.tile.id} c={i.tile} variant="poster" testId={`enrollment-${i.tile.id}`} />
          ))}
        </CourseRail>
      )}
      {short.length > 0 && (
        <CourseRail title="Cursos de 10 minutos" count={short.length} testId="rail-short">
          {short.map((i) => (
            <CourseTile key={i.tile.id} c={i.tile} variant="wide" />
          ))}
        </CourseRail>
      )}
      {done.length > 0 && (
        <CourseRail title="Concluídos" count={done.length} testId="rail-done">
          {done.map((i) => (
            <CourseTile key={i.tile.id} c={i.tile} variant="wide" testId={`enrollment-${i.tile.id}`} />
          ))}
        </CourseRail>
      )}
      {!q && visible.length === 0 && <p className="text-fg-muted">Nenhum curso nesta trilha ainda.</p>}
    </div>
  );
}

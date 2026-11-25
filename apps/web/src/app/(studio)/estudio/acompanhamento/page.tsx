import Link from 'next/link';
import { identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { loadTracking, TRACKING_MAX_ROWS } from '@/server/acompanhamento';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ACTIVE_DAYS,
  ORDENS,
  PAGE_SIZE,
  SITUACAO_META,
  SITUACOES,
  filtersHref,
  matchesSearch,
  parseFilters,
  plural,
  matchesStudent,
  sortRows,
  sortStudents,
  summarize,
  summarizeByCourse,
  summarizeByStudent,
} from '@/lib/acompanhamento';
import { CourseTable, DailyChart, LessonChart, PeopleTable, SituationStrip, StudentTable } from './parts';

export const metadata = { title: 'Acompanhamento' };
export const dynamic = 'force-dynamic';

export default async function AcompanhamentoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireStaff();
  const f = parseFilters(await searchParams);
  const data = await loadTracking({ workspaceId: viewer.workspace.id, courseSlug: f.curso || null });
  const { rows, course, now } = data;
  const filters = { ...f, curso: course?.slug ?? '' };
  const summary = summarize(rows, now);

  const byPerson = filters.visao === 'alunos';
  const keep = (r: { situacao: string; student: { name: string; email: string; rgm: string | null; id: string } }) => (!filters.situacao || r.situacao === filters.situacao) && matchesStudent(r, filters.q);
  const listed = byPerson ? sortStudents(summarizeByStudent(rows, now).filter(keep), filters.ordem) : sortRows(rows.filter(keep), filters.ordem);
  const pages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
  const page = Math.min(filters.pagina, pages);
  const from = (page - 1) * PAGE_SIZE;
  const live = summary.enrollments - summary.counts.cancelada;
  const attention = summary.counts.parado + summary.counts.nao_comecou;

  return (
    <div className="space-y-10" data-testid="acompanhamento">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <p className="eyebrow">Alunos</p>
          <h1>Acompanhamento</h1>
          <p className="text-lg text-fg-muted">
            {summary.enrollments === 0
              ? 'Quem está estudando, quem parou e quem ainda não começou, curso a curso.'
              : attention > 0
                ? `${plural(live, 'matrícula ativa', 'matrículas ativas')}${course ? ` em ${course.title}` : ''}: ${plural(attention, 'precisa', 'precisam')} de atenção (${summary.counts.parado} ${summary.counts.parado === 1 ? 'parada' : 'paradas'}, ${summary.counts.nao_comecou} sem começar).`
                : `${plural(live, 'matrícula ativa', 'matrículas ativas')}${course ? ` em ${course.title}` : ''}, nenhuma parada ou sem começar.`}
          </p>
        </div>
        {identity.canEnroll(viewer.role) && (
          <Link href="/estudio/configuracoes/relatorios" className={cn(buttonVariants({ variant: 'secondary' }), 'shrink-0')}>
            Exportar planilha
          </Link>
        )}
      </section>

      {/* key: remonta o formulário quando os filtros mudam por link (navegação no cliente não atualiza defaultValue) */}
      <form key={`${filters.visao}|${filters.curso}|${filters.situacao}|${filters.q}|${filters.ordem}`} method="get" action="/estudio/acompanhamento" className="panel grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1.4fr_1.2fr_auto] xl:items-end" role="search" aria-label="Filtrar alunos">
        {byPerson && <input type="hidden" name="visao" value="alunos" />}
        <Field label="Curso" htmlFor="trk-curso">
          <Select id="trk-curso" name="curso" defaultValue={filters.curso} data-testid="trk-curso">
            <option value="">Todos os cursos</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.title} ({c.enrollments})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Situação" htmlFor="trk-situacao">
          <Select id="trk-situacao" name="situacao" defaultValue={filters.situacao} data-testid="trk-situacao">
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {SITUACAO_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aluno" htmlFor="trk-q">
          <Input id="trk-q" name="q" type="search" defaultValue={filters.q} placeholder="Nome, e-mail ou RGM" autoComplete="off" data-testid="trk-q" />
        </Field>
        <Field label="Ordem" htmlFor="trk-ordem">
          <Select id="trk-ordem" name="ordem" defaultValue={filters.ordem}>
            {ORDENS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
          <button type="submit" className={cn(buttonVariants(), 'flex-1 xl:flex-none')} data-testid="trk-aplicar">
            Filtrar
          </button>
          {(filters.curso || filters.situacao || filters.q || filters.ordem !== 'atencao') && (
            <Link href="/estudio/acompanhamento" className={buttonVariants({ variant: 'ghost' })}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      {data.truncated && (
        <p className="rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid" role="status">
          Mais de {TRACKING_MAX_ROWS.toLocaleString('pt-BR')} matrículas: os números abaixo consideram só as primeiras. Escolha um curso para ver tudo.
        </p>
      )}

      {summary.enrollments === 0 ? (
        <Card className="px-6 py-12 text-center">
          <h2 className="text-2xl">Nenhuma matrícula {course ? 'neste curso' : 'ainda'}</h2>
          <p className="mx-auto mt-3 max-w-md text-fg-muted">Quando os alunos forem matriculados (pela integração, pelo CSV ou pela página do curso), o progresso de cada um aparece aqui.</p>
          {course && (
            <Link href={`/estudio/cursos/${course.id}/matriculas`} className={cn(buttonVariants({ variant: 'secondary' }), 'mt-6')}>
              Abrir matrículas do curso
            </Link>
          )}
        </Card>
      ) : (
        <>
          <SituationStrip summary={summary} filters={filters} />

          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="trk-kpis">
            <Kpi label="Alunos" value={summary.students.toLocaleString('pt-BR')} note={plural(summary.enrollments, 'matrícula', 'matrículas')} />
            <Kpi
              label={`Estudaram nos últimos ${ACTIVE_DAYS} dias`}
              value={summary.active7d.toLocaleString('pt-BR')}
              note={summary.students ? `${Math.round((summary.active7d / summary.students) * 100)}% dos alunos` : '—'}
            />
            <Kpi label="Progresso médio" value={`${summary.avgPercent}%`} note="das aulas obrigatórias, por matrícula" meter={summary.avgPercent} />
            <Kpi
              label="Concluíram"
              value={summary.counts.concluiu.toLocaleString('pt-BR')}
              note={`${summary.completionRate}% das matrículas · ${plural(summary.certificates, 'certificado', 'certificados')}`}
            />
          </dl>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:items-start">
            <DailyChart daily={data.daily} />
            {course && data.lessons ? <LessonChart steps={data.lessons} base={live} /> : <CourseTable courses={summarizeByCourse(rows, now)} filters={filters} />}
          </div>

          <section aria-labelledby="trk-alunos" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="trk-alunos" className="font-display text-xl font-bold sm:text-2xl">
                  {filters.situacao ? SITUACAO_META[filters.situacao].label : byPerson ? 'Todos os alunos' : 'Todas as matrículas'}
                  {filters.q && <span className="font-normal text-fg-muted"> · “{filters.q}”</span>}
                </h2>
                <p className="mt-1 text-sm text-fg-muted" data-testid="trk-count">
                  {listed.length === 0
                    ? 'Ninguém com esses filtros.'
                    : `${byPerson ? plural(listed.length, 'aluno', 'alunos') : plural(listed.length, 'matrícula', 'matrículas')}${pages > 1 ? ` · mostrando ${from + 1}–${Math.min(from + PAGE_SIZE, listed.length)}` : ''}`}
                  {byPerson && listed.length > 0 && ' · situação geral: em dia se estuda algum curso, concluiu se terminou todos'}
                </p>
              </div>
              <nav className="flex rounded-[14px] border border-line-strong p-1" aria-label="Ver por">
                {(
                  [
                    ['matriculas', 'Por matrícula'],
                    ['alunos', 'Por aluno'],
                  ] as const
                ).map(([v, label]) => (
                  <Link
                    key={v}
                    href={filtersHref(filters, { visao: v })}
                    aria-current={filters.visao === v ? 'page' : undefined}
                    className="inline-flex min-h-10 items-center rounded-[10px] px-4 text-sm font-medium text-fg-muted hover:text-fg aria-[current=page]:bg-fg/[0.07] aria-[current=page]:text-fg"
                    data-testid={`trk-visao-${v}`}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            {listed.length > 0 &&
              (byPerson ? (
                <PeopleTable rows={(listed as ReturnType<typeof summarizeByStudent>).slice(from, from + PAGE_SIZE)} now={now} filters={filters} />
              ) : (
                <StudentTable rows={(listed as ReturnType<typeof sortRows>).slice(from, from + PAGE_SIZE)} now={now} showCourse={!course} />
              ))}
            {pages > 1 && (
              <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
                {page > 1 ? (
                  <Link href={filtersHref(filters, { pagina: page - 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Anterior
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm text-fg-muted">
                  Página {page} de {pages}
                </span>
                {page < pages ? (
                  <Link href={filtersHref(filters, { pagina: page + 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })} data-testid="trk-proxima">
                    Próxima
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, note, meter }: { label: string; value: string; note: string; meter?: number }) {
  return (
    <div className="panel flex flex-col gap-1 p-5">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular-nums text-fg sm:text-4xl">{value}</dd>
      {meter !== undefined && (
        <dd className="trk-meter mt-1" aria-hidden="true">
          <span className="trk-fill" style={{ width: `${meter}%`, ['--trk-c' as string]: 'var(--trk-em_dia)' }} />
        </dd>
      )}
      <dd className="text-sm text-fg-faint">{note}</dd>
    </div>
  );
}

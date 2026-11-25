import Link from 'next/link';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  SITUACAO_META,
  TASK_LABEL,
  biggestDrop,
  filtersHref,
  plural,
  relativeDays,
  shares,
  type CourseSummary,
  type Filters,
  type LessonStep,
  type Situacao,
  type StudentRow,
  type Summary,
  type TrackRow,
} from '@/lib/acompanhamento';

/** Situações que entram na faixa (cancelada fica fora: aparece só no texto). */
const STRIP: Situacao[] = ['concluiu', 'em_dia', 'parado', 'nao_comecou'];

/** ponto do selo na mesma cor da faixa (classes literais, para o Tailwind gerar) */
const DOT: Record<Situacao, string> = {
  concluiu: 'before:bg-[var(--trk-concluiu)]',
  em_dia: 'before:bg-[var(--trk-em_dia)]',
  parado: 'before:bg-[var(--trk-parado)]',
  nao_comecou: 'before:bg-[var(--trk-nao_comecou)]',
  cancelada: 'before:bg-[var(--trk-cancelada)]',
};

const fillStyle = (s: Situacao): React.CSSProperties => ({ ['--trk-c' as string]: `var(--trk-${s})` });

function Swatch({ s, className }: { s: Situacao; className?: string }) {
  return <span className={cn('trk-fill inline-block h-3 w-3 shrink-0 rounded-[3px]', className)} data-hatch={s === 'nao_comecou'} style={fillStyle(s)} aria-hidden="true" />;
}

/** Faixa com a distribuição das matrículas por situação; cada parte filtra a lista. */
export function SituationStrip({ summary, filters }: { summary: Summary; filters: Filters }) {
  const counts = STRIP.map((s) => summary.counts[s]);
  const pct = shares(counts);
  const live = counts.reduce((n, c) => n + c, 0);
  return (
    <section className="panel space-y-5 p-5 sm:p-6" aria-labelledby="trk-situacao-title" data-testid="trk-strip">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trk-situacao-title" className="font-display text-lg font-bold">
          Situação das {plural(live, 'matrícula ativa', 'matrículas ativas')}
        </h2>
        <p className="text-sm text-fg-faint">
          {summary.counts.cancelada > 0 && `${plural(summary.counts.cancelada, 'cancelada', 'canceladas')} fora da conta · `}clique numa parte para filtrar
        </p>
      </div>
      {live > 0 && (
        <div className="trk-strip" role="list" aria-label="Distribuição por situação">
          {STRIP.map((s, i) =>
            counts[i] ? (
              <Link
                key={s}
                role="listitem"
                href={filtersHref(filters, { situacao: filters.situacao === s ? '' : s })}
                className="trk-fill"
                data-hatch={s === 'nao_comecou'}
                style={{ ...fillStyle(s), flexGrow: counts[i], flexBasis: 0 }}
                aria-current={filters.situacao === s ? 'true' : undefined}
                aria-label={`${SITUACAO_META[s].label}: ${counts[i]} (${pct[i]}%)`}
                title={`${SITUACAO_META[s].label}: ${counts[i]} (${pct[i]}%)`}
              />
            ) : null,
          )}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        {STRIP.map((s, i) => (
          <li key={s}>
            <Link href={filtersHref(filters, { situacao: filters.situacao === s ? '' : s })} className="group block rounded-lg" data-testid={`trk-sit-${s}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                <Swatch s={s} />
                {SITUACAO_META[s].label}
                {filters.situacao === s && <span className="text-xs font-normal text-fg-faint">(filtrando)</span>}
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums text-fg">{counts[i]!.toLocaleString('pt-BR')}</span>
                <span className="text-sm tabular-nums text-fg-muted">{pct[i]}%</span>
              </span>
              <span className="block text-xs text-fg-faint group-hover:text-fg-muted">{SITUACAO_META[s].hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const dayLabel = (day: string) => {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
};
const weekday = (day: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)).replace('.', '');

/** Barras: alunos diferentes que estudaram em cada um dos últimos 30 dias. */
export function DailyChart({ daily }: { daily: Array<{ day: string; students: number }> }) {
  const max = Math.max(0, ...daily.map((d) => d.students));
  const top = daily.reduce<{ day: string; students: number } | null>((b, d) => (d.students > 0 && (!b || d.students >= b.students) ? d : b), null);
  const activeDays = daily.filter((d) => d.students > 0).length;
  const scale = max || 1;
  return (
    <section className="panel flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="trk-diario" data-testid="trk-daily">
      <div>
        <h2 id="trk-diario" className="font-display text-lg font-bold">Alunos que estudaram por dia</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Últimos {daily.length} dias.{' '}
          {top ? `Pico de ${plural(top.students, 'aluno', 'alunos')} em ${dayLabel(top.day)}; atividade em ${activeDays} dos ${daily.length} dias.` : 'Ninguém estudou neste período.'}
        </p>
      </div>
      <div className="flex gap-3">
        <div className="flex h-[140px] flex-col justify-between text-right text-xs tabular-nums text-fg-faint" aria-hidden="true">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1 border-b border-line">
          <div className="trk-bars" role="list" aria-label="Alunos por dia">
            {daily.map((d) => (
              <div key={d.day} role="listitem" tabIndex={0} className="trk-bar" data-zero={d.students === 0} aria-label={`${weekday(d.day)} ${dayLabel(d.day)}: ${plural(d.students, 'aluno', 'alunos')}`}>
                <span className="trk-col" style={{ height: `${d.students ? Math.max(4, (d.students / scale) * 100) : 2}%` }} />
                <span className="trk-tip" aria-hidden="true">
                  <span className="text-fg-muted">{weekday(d.day)} {dayLabel(d.day)}</span> · <strong className="tabular-nums">{d.students}</strong> {d.students === 1 ? 'aluno' : 'alunos'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between pl-8 text-xs text-fg-faint" aria-hidden="true">
        <span>{daily[0] ? dayLabel(daily[0].day) : ''}</span>
        <span>hoje</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">Ver em tabela</summary>
        <table className="mt-3 w-full text-left tabular-nums">
          <thead>
            <tr className="text-fg-faint">
              <th scope="col" className="py-1 font-medium">Dia</th>
              <th scope="col" className="py-1 text-right font-medium">Alunos</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{weekday(d.day)} {dayLabel(d.day)}</td>
                <td className="py-1 text-right">{d.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Um curso por linha: matrículas, distribuição por situação e progresso médio. */
export function CourseTable({ courses, filters }: { courses: CourseSummary[]; filters: Filters }) {
  return (
    <section className="panel flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="trk-cursos" data-testid="trk-courses">
      <div>
        <h2 id="trk-cursos" className="font-display text-lg font-bold">Por curso</h2>
        <p className="mt-1 text-sm text-fg-muted">Escolha um curso para ver em que aula os alunos param.</p>
      </div>
      <ul className="-mr-2 max-h-[30rem] divide-y divide-line overflow-y-auto pr-2">
        {courses.map((c) => {
          const counts = STRIP.map((s) => c.counts[s]);
          const live = counts.reduce((n, x) => n + x, 0);
          return (
            <li key={c.course.id}>
              <Link href={filtersHref(filters, { curso: c.course.slug, situacao: '' })} className="group grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg group-hover:underline">{c.course.title}</span>
                  <span className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
                    {STRIP.map((s, i) => (counts[i] ? <span key={s} className="trk-fill" data-hatch={s === 'nao_comecou'} style={{ ...fillStyle(s), flexGrow: counts[i], flexBasis: 0 }} /> : null))}
                    {live === 0 && <span className="flex-1 bg-[var(--t-track)]" />}
                  </span>
                </span>
                <span className="flex gap-5 text-sm tabular-nums text-fg-muted sm:justify-end">
                  <span>
                    <strong className="font-semibold text-fg">{c.enrollments}</strong> matr.
                  </span>
                  <span>
                    <strong className="font-semibold text-fg">{c.completionRate}%</strong> concluíram
                  </span>
                  <span className={c.counts.parado + c.counts.nao_comecou > 0 ? '' : 'opacity-60'}>
                    <strong className="font-semibold text-fg">{c.counts.parado + c.counts.nao_comecou}</strong> atenção
                  </span>
                </span>
                <span className="sr-only">
                  {STRIP.map((s, i) => `${SITUACAO_META[s].label}: ${counts[i]}`).join(', ')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Onde os alunos param": quantas matrículas concluíram cada aula, na ordem do curso. */
export function LessonChart({ steps, base }: { steps: LessonStep[]; base: number }) {
  const drop = biggestDrop(steps);
  return (
    <section className="panel flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="trk-aulas" data-testid="trk-lessons">
      <div>
        <h2 id="trk-aulas" className="font-display text-lg font-bold">Onde os alunos param</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Quantas das {plural(base, 'matrícula ativa', 'matrículas ativas')} concluíram cada aula.
          {drop && ` A maior queda é na aula ${drop.index + 1}: ${plural(drop.lost, 'aluno a menos', 'alunos a menos')} que na anterior.`}
        </p>
      </div>
      {steps.length === 0 ? (
        <p className="text-sm text-fg-muted">O curso ainda não tem versão publicada.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.lessonId} className={cn('grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1', drop?.index === i && 'rounded-lg')} data-testid="trk-lesson">
              <span className="row-span-2 pt-0.5 text-sm tabular-nums text-fg-faint">{i + 1}</span>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-fg">{s.title}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  <strong className="font-semibold text-fg">{s.completed}</strong> de {base} · {s.percent}%
                </span>
              </span>
              <span className="trk-meter" aria-hidden="true" title={`${s.started} abriram, ${s.completed} concluíram`}>
                <span className="trk-fill" style={{ width: `${s.percent}%`, ...fillStyle('concluiu') }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const assessmentText = (r: TrackRow) => (r.assessmentsTotal === 0 ? '—' : `${r.assessmentsPassed} de ${r.assessmentsTotal}`);

/** Lista de matrículas: aluno, progresso, avaliações, tarefa, último estudo e situação. */
export function StudentTable({ rows, now, showCourse }: { rows: TrackRow[]; now: Date; showCourse: boolean }) {
  return (
    <div className="panel overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-left text-sm" data-testid="trk-table">
        <thead className="text-xs text-fg-faint">
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-3 font-medium">Aluno</th>
            {showCourse && <th scope="col" className="px-3 py-3 font-medium">Curso</th>}
            <th scope="col" className="px-3 py-3 font-medium">Progresso</th>
            <th scope="col" className="px-3 py-3 font-medium">Avaliações</th>
            <th scope="col" className="px-3 py-3 font-medium">Tarefa</th>
            <th scope="col" className="px-3 py-3 font-medium">Estudou</th>
            <th scope="col" className="px-3 py-3 font-medium">Situação</th>
            <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Relatório</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = SITUACAO_META[r.situacao];
            return (
              <tr key={r.enrollmentId} className="border-b border-line last:border-0 hover:bg-fg/[0.03]" data-testid="trk-row">
                <td className="max-w-[260px] px-5 py-3">
                  <span className="block truncate font-medium text-fg">{r.student.name}</span>
                  <span className="block truncate text-xs text-fg-faint">
                    {r.student.email}
                    {r.student.rgm ? ` · RGM ${r.student.rgm}` : ''}
                  </span>
                </td>
                {showCourse && <td className="max-w-[200px] truncate px-3 py-3 text-fg-muted">{r.course.title}</td>}
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="trk-meter w-20 shrink-0" aria-hidden="true">
                      <span className="trk-fill" style={{ width: `${r.percent}%`, ...fillStyle(r.situacao === 'concluiu' ? 'concluiu' : 'em_dia') }} />
                    </span>
                    <span className="tabular-nums text-fg">
                      {r.percent}%<span className="text-xs text-fg-faint"> · {r.lessonsDone}/{r.lessonsTotal} aulas</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3 tabular-nums text-fg-muted">
                  {assessmentText(r)}
                  {r.assessmentsFailed > 0 && <span className="text-xs text-fg-faint"> · {r.assessmentsFailed} reprov.</span>}
                </td>
                <td className="px-3 py-3 text-fg-muted">{r.task ? TASK_LABEL[r.task] : '—'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-fg-muted" title={r.lastStudy ? r.lastStudy.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nunca abriu uma aula deste curso'}>
                  {relativeDays(r.lastStudy, now)}
                  {r.situacao === 'nao_comecou' && <span className="block text-xs text-fg-faint">matrícula {relativeDays(r.enrolledAt, now)}</span>}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={meta.tone} title={meta.hint} className={DOT[r.situacao]}>
                    {meta.label}
                    {r.situacao === 'parado' && r.idleDays !== null ? ` · ${r.idleDays}d` : ''}
                  </Badge>
                  {r.certificate && <span className="mt-1 block text-xs text-fg-faint">com certificado</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/estudio/cursos/${r.course.id}/matriculas/${r.enrollmentId}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-fg underline-offset-4 hover:underline">
                    Relatório<span className="sr-only"> de {r.student.name} em {r.course.title}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Uma linha por aluno: cursos, distribuição por situação, progresso médio, último estudo e último acesso. */
export function PeopleTable({ rows, now, filters }: { rows: StudentRow[]; now: Date; filters: Filters }) {
  return (
    <div className="panel overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-left text-sm" data-testid="trk-people">
        <thead className="text-xs text-fg-faint">
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-3 font-medium">Aluno</th>
            <th scope="col" className="px-3 py-3 font-medium">Cursos</th>
            <th scope="col" className="px-3 py-3 font-medium">Progresso médio</th>
            <th scope="col" className="px-3 py-3 font-medium">Estudou</th>
            <th scope="col" className="px-3 py-3 font-medium">Entrou na plataforma</th>
            <th scope="col" className="px-3 py-3 font-medium">Situação geral</th>
            <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Matrículas</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = SITUACAO_META[r.situacao];
            const parts = STRIP.filter((s) => r.counts[s] > 0);
            return (
              <tr key={r.student.id} className="border-b border-line last:border-0 hover:bg-fg/[0.03]" data-testid="trk-person">
                <td className="max-w-[260px] px-5 py-3">
                  <span className="block truncate font-medium text-fg">{r.student.name}</span>
                  <span className="block truncate text-xs text-fg-faint">
                    {r.student.email}
                    {r.student.rgm ? ` · RGM ${r.student.rgm}` : ''}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="tabular-nums text-fg">{r.courses}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-faint">
                    {parts.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1">
                        <Swatch s={s} className="h-2 w-2" />
                        {r.counts[s]} {SITUACAO_META[s].label.toLowerCase()}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="trk-meter w-20 shrink-0" aria-hidden="true">
                      <span className="trk-fill" style={{ width: `${r.percent}%`, ...fillStyle(r.situacao === 'concluiu' ? 'concluiu' : 'em_dia') }} />
                    </span>
                    <span className="tabular-nums text-fg">
                      {r.percent}%<span className="text-xs text-fg-faint"> · {r.lessonsDone}/{r.lessonsTotal} aulas</span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{relativeDays(r.lastStudy, now)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-fg-muted">{relativeDays(r.lastAccess, now)}</td>
                <td className="px-3 py-3">
                  <Badge tone={meta.tone} title={meta.hint} className={DOT[r.situacao]}>
                    {meta.label}
                    {r.situacao === 'parado' && r.idleDays !== null ? ` · ${r.idleDays}d` : ''}
                  </Badge>
                  {r.certificates > 0 && <span className="mt-1 block text-xs text-fg-faint">{plural(r.certificates, 'certificado', 'certificados')}</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={filtersHref(filters, { visao: 'matriculas', q: r.student.email, situacao: '' })}
                    className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 font-medium text-fg underline-offset-4 hover:underline"
                  >
                    Ver cursos<span className="sr-only"> de {r.student.name}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

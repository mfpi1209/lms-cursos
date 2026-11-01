import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Award, Check, CircleDashed, ExternalLink, Lock } from 'lucide-react';
import { TrailSeal } from '@/components/trail-seal';
import { getDb, recognition } from '@lms/db';
import { credentialFor, cvText, formatWorkload, publicTrailCheck, seriesForTrail, trailCheckFor, trailCheckSeed, TRAIL_CHECK_PASS_RATIO } from '@lms/course-schema';
import { requireViewer } from '@/server/viewer';
import { cn } from '@/lib/utils';
import { ctaOutline, ctaPrimary } from '../../_components/learner-ui';
import { TrailCheckForm } from './trail-check-form';
import { linkedInAddUrl } from './linkedin';
import { CvCopy } from './cv-copy';
import { SeriesParts } from './series-parts';
import { loadLearnerCourses } from '../../_lib/learner-courses';
import { buildSeriesCard, seriesMetaCopy } from '../../_lib/series';
import { trailSealNote } from '../../_lib/trail-note';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ trail: string }> }) {
  const viewer = await requireViewer();
  const trail = await recognition.trailByKey(getDb(), viewer.workspace.id, (await params).trail);
  return { title: trail ? `Trilha ${trail}` : 'Trilha' };
}

/**
 * Página da trilha: o caminho até o Selo DNA Work (cursos concluídos → atividades "Na prática" salvas →
 * checagem final) e, quando emitido, o selo com competências, código, verificação pública e LinkedIn.
 */
export default async function TrailPage({ params }: { params: Promise<{ trail: string }> }) {
  const viewer = await requireViewer();
  const { trail: key } = await params;
  const db = getDb();
  const trail = await recognition.trailByKey(db, viewer.workspace.id, key);
  if (!trail) notFound();
  const st = await recognition.trailStatus(db, { workspaceId: viewer.workspace.id, userId: viewer.user.id, trail });
  const check = trailCheckFor(trail);
  // trilha em série: as partes (cursos) no topo, com o instrutor, o progresso somado e o botão de cada parte
  const seriesDef = seriesForTrail(trail);
  const seriesCard = seriesDef ? buildSeriesCard(seriesDef, (await loadLearnerCourses(viewer.user.id)).courses, { badge: !!st.badge, hasBadge: !!check }) : null;
  const doneCount = st.courses.filter((c) => c.done).length;
  const coursesOk = st.courses.length > 0 && doneCount === st.courses.length;
  const activitiesOk = st.eligibility.activitiesMissing.length === 0;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3010'}`;
  const badgeUrl = st.badge ? `${origin}/selo/${st.badge.code}` : null;
  // pacote currículo: carga horária (gravada na emissão), texto pronto para colar e resumo curado (quando há)
  const workloadMinutes = st.badge ? await recognition.badgeWorkloadMinutes(db, st.badge) : null;
  const cvLine =
    st.badge && badgeUrl
      ? cvText({
          trail,
          year: Number(new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(st.badge.issuedAt)),
          workloadMinutes,
          competencies: st.badge.competencies,
          verifyUrl: badgeUrl,
          summary: credentialFor(trail)?.cvSummary ?? null,
        })
      : null;

  return (
    <div className="lms-editorial mx-auto max-w-[920px] space-y-8">
      <div className="space-y-3">
        <Link href="/aprender/trilhas" className="inline-flex min-h-11 items-center text-[15px] text-fg-muted underline-offset-4 hover:underline">
          Minhas trilhas
        </Link>
        {seriesCard && <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Trilha em {seriesCard.total} partes</p>}
        <h1 className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)]! font-black! leading-[1.02]! tracking-[-0.03em]! text-fg">{trail}</h1>
        <p className="max-w-prose text-lg text-fg-muted">
          {seriesCard
            ? `${seriesMetaCopy(seriesCard.total, seriesCard.instructor)}. Faça as partes na ordem, salve as atividades “Na prática” e passe na checagem final para ganhar o Selo DNA Work · ${trail}. Cada parte concluída já conta como conquista.`
            : `Conclua os cursos, salve as atividades “Na prática” e passe na checagem final para ganhar o Selo DNA Work · ${trail}. Cada curso concluído já conta como conquista.`}
        </p>
      </div>

      {seriesCard && <SeriesParts s={seriesCard} sealNote={trailSealNote(st, 'parte')} />}

      {st.badge && badgeUrl ? (
        <section aria-labelledby="badge-title" data-testid="trail-badge" className="rounded-[22px] border-2 border-[var(--im-accent)] bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <TrailSeal trail={trail} size={132} tone="light" className="drop-shadow-[0_14px_18px_rgba(29,30,76,0.22)]" />
            <div className="min-w-0 flex-1 basis-[16rem]">
              <p className="text-sm font-medium text-fg-muted">Selo conquistado</p>
              <h2 id="badge-title" className="text-[24px]! font-bold! leading-tight text-fg">Selo DNA Work · {trail}</h2>
              <p className="mt-1 text-[15px] text-fg-muted">
                Emitido em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(st.badge.issuedAt)} · código <span className="font-mono text-fg">{st.badge.code}</span>
              </p>
            </div>
          </div>
          <h3 className="mt-5 text-[15px] font-semibold text-fg">O que este selo comprova</h3>
          <ul className="mt-2 space-y-1.5">
            {st.badge.competencies.map((c) => (
              <li key={c} className="flex gap-2 text-[16px] leading-snug text-fg/90">
                <Check className="mt-1 size-4 shrink-0 text-[var(--im-accent-ink)]" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={linkedInAddUrl({ trail, code: st.badge.code, issuedAt: st.badge.issuedAt, url: badgeUrl })} target="_blank" rel="noopener noreferrer" className={cn(ctaPrimary, 'min-h-12 px-6')} data-testid="badge-linkedin">
              Adicionar ao LinkedIn
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only">(abre em outra aba)</span>
            </a>
            <Link href={`/selo/${st.badge.code}`} className={cn(ctaOutline, 'min-h-12 px-6')} data-testid="badge-verify-link">
              Ver página de verificação
            </Link>
            <Link href={`/selo/${st.badge.code}/certificado`} className={cn(ctaOutline, 'min-h-12 px-6')} data-testid="badge-certificate">
              Ver certificado
            </Link>
          </div>
          {cvLine && (
            <div className="mt-6 border-t border-line pt-5" data-testid="badge-cv">
              <h3 className="text-[15px] font-semibold text-fg">Para o seu currículo</h3>
              <p className="mt-1 text-sm text-fg-muted">Cole no currículo ou no LinkedIn. O link leva quem recebe até a verificação do selo.</p>
              <CvCopy text={cvLine} />
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="proves-title" className="rounded-[22px] border border-line bg-surface p-5 sm:p-6">
          <h2 id="proves-title" className="text-[18px]! font-semibold! text-fg">O que o Selo DNA Work · {trail} comprova</h2>
          <ul className="mt-3 space-y-1.5">
            {st.competencies.map((c) => (
              <li key={c} className="flex gap-2 text-[16px] leading-snug text-fg/85">
                <Award className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-4" aria-label="Caminho até o selo">
        <Step n={1} done={coursesOk} title={seriesCard ? `Concluir as ${st.courses.length} partes (${doneCount} de ${st.courses.length})` : `Concluir os cursos (${doneCount} de ${st.courses.length})`}>
          {seriesCard ? (
            <p className="text-[15px] text-fg-muted">As partes estão no começo desta página, com a aula certa para continuar em cada uma.</p>
          ) : (
          <ul className="divide-y divide-line">
            {st.courses.map((c) => (
              <li key={c.courseId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[16px] text-fg">
                  {c.done ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
                  <span className="min-w-0">{c.title}</span>
                  <span className="sr-only">{c.done ? ': concluído' : ': não concluído'}</span>
                </span>
                {c.enrollmentId ? (
                  <Link href={`/aprender/${c.enrollmentId}`} className="inline-flex min-h-11 items-center text-[15px] font-medium text-[var(--im-accent-ink)] underline-offset-4 hover:underline">
                    {c.done ? 'Rever' : 'Continuar'}
                    <span className="sr-only"> {c.title}</span>
                  </Link>
                ) : (
                  <span className="text-sm text-fg-muted">Ainda não liberado para você</span>
                )}
              </li>
            ))}
          </ul>
          )}
        </Step>
        <Step n={2} done={activitiesOk && coursesOk} title="Salvar as atividades “Na prática”">
          {st.eligibility.activitiesMissing.length === 0 ? (
            <p className="text-[15px] text-fg-muted">{coursesOk ? 'Todas as atividades estão salvas no Meu roteiro.' : 'As atividades dos cursos concluídos estão salvas.'}</p>
          ) : (
            <ul className="space-y-2">
              {st.eligibility.activitiesMissing.map((c) => {
                const enr = st.courses.find((x) => x.courseId === c.courseId)?.enrollmentId;
                return (
                  <li key={c.courseId} className="text-[15px] text-fg">
                    <span className="font-medium">{c.title}:</span> falta salvar {c.activities.map((a) => `“${a}”`).join(', ')}.{' '}
                    {enr && (
                      <Link href={`/aprender/${enr}`} className="font-medium text-[var(--im-accent-ink)] underline underline-offset-4">
                        Ir para o curso
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Step>
        <Step n={3} done={st.checkPassed} title="Passar na checagem final">
          {!check ? (
            <p className="text-[15px] text-fg-muted">A checagem desta trilha ainda está em preparação.</p>
          ) : !coursesOk ? (
            <p className="flex items-center gap-2 text-[15px] text-fg-muted">
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              Libera quando você concluir todos os cursos da trilha. São {check.situations.length} situações novas; para passar, acerte {Math.ceil(check.situations.length * TRAIL_CHECK_PASS_RATIO)}. Pode refazer quantas vezes quiser.
            </p>
          ) : (
            <TrailCheckForm key={st.badge ? 'com-selo' : 'sem-selo'} trailKey={st.key} check={publicTrailCheck(check, trailCheckSeed({ userId: viewer.user.id, trailKey: st.key, attempt: st.checkAttempts }))} passRatio={TRAIL_CHECK_PASS_RATIO} passedBefore={st.checkPassed} hasBadge={!!st.badge} />
          )}
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-[20px] border border-line bg-surface p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-[18px]! font-semibold! text-fg">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-bold', done ? 'bg-success text-white' : 'border border-line-strong text-fg')} aria-hidden="true">
          {done ? <Check className="size-4" strokeWidth={3} /> : n}
        </span>
        <span>
          {title}
          <span className="sr-only">{done ? ' (feito)' : ' (pendente)'}</span>
        </span>
      </h2>
      <div className="mt-3 pl-11">{children}</div>
    </li>
  );
}

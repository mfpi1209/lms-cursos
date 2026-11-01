import Link from 'next/link';
import { BadgeCheck, CircleAlert, FileText } from 'lucide-react';
import { getDb, recognition } from '@lms/db';
import { describeCompetencies, formatWorkload } from '@lms/course-schema';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { BrandLogo } from '@/components/brand-logo';
import { TrailSeal } from '@/components/trail-seal';
import { getBrand } from '@/config/brand';
import { ctaOutline } from '@/app/(lms)/aprender/_components/learner-ui';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const b = await recognition.getBadgeByCode(getDb(), (await params).code);
  return {
    title: b ? `Selo DNA Work · ${b.trailName}` : 'Verificação de selo',
    // verificação por link: não entra em buscadores
    robots: { index: false, follow: false },
  };
}

/**
 * Verificação pública do Selo DNA Work (sem login): quem recebe o link confere nome, trilha, competências,
 * data e se o código é válido. Nada além disso: sem e-mail, notas ou respostas.
 */
export default async function BadgeVerificationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const b = await recognition.getBadgeByCode(db, code);
  const workload = b ? formatWorkload(await recognition.badgeWorkloadMinutes(db, b)) : null;
  const brand = getBrand(b?.workspaceId);
  const valid = !!b && !b.revokedAt;
  const date = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(d);
  return (
    <div className="theme-platform min-h-dvh bg-bg text-fg">
      <SkipLink />
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[880px] items-center px-4 sm:px-8">
          <BrandLogo brand={brand} height={24} />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-[880px] px-4 py-10 outline-none sm:px-8 sm:py-14">
        <p className="text-sm font-medium text-fg-muted">Verificação de selo</p>
        {!b ? (
          <section className="mt-4 rounded-[22px] border border-line bg-surface p-6" data-testid="badge-not-found">
            <h1 className="flex items-center gap-3 text-[26px]! font-bold! leading-tight text-fg">
              <CircleAlert className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
              Código não encontrado
            </h1>
            <p className="mt-2 text-[16px] text-fg-muted">
              Confira se o código foi digitado como no selo, no formato DNA-XXXX-XXXX. Código consultado: <span className="font-mono text-fg">{code}</span>.
            </p>
          </section>
        ) : (
          <section className="mt-4 rounded-[22px] border border-line bg-surface p-6 sm:p-8" data-testid="badge-verification">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <TrailSeal trail={b.trailName} size={136} tone="light" className="drop-shadow-[0_14px_18px_rgba(29,30,76,0.22)]" />
              <div className="min-w-0 flex-1 basis-[16rem]">
                <h1 className="text-[clamp(1.6rem,1.2rem+1.6vw,2.25rem)]! font-black! leading-tight! text-fg">Selo DNA Work · {b.trailName}</h1>
                <p className="mt-1 text-[18px] text-fg">{b.holderName}</p>
              </div>
            </div>
            <p className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold ${valid ? 'bg-success/15 text-fg' : 'bg-fg/10 text-fg'}`} data-testid="badge-validity">
              {valid ? <BadgeCheck className="size-5 text-success" aria-hidden="true" /> : <CircleAlert className="size-5 text-fg-muted" aria-hidden="true" />}
              {valid ? 'Código válido' : `Selo cancelado em ${date(b.revokedAt!)}`}
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-fg-muted">Emitido em</dt>
                <dd className="text-[17px] text-fg">{date(b.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Carga horária</dt>
                <dd className="text-[17px] text-fg" data-testid="badge-workload">{workload}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Código</dt>
                <dd className="font-mono text-[17px] text-fg">{b.code}</dd>
              </div>
            </dl>
            <h2 className="mt-7 text-[18px]! font-semibold! text-fg">Competências demonstradas</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-[16px] leading-snug text-fg/90">
              {describeCompetencies(b.trailName, b.competencies).map((c) => (
                <li key={c.name}>
                  {c.description ? <span className="font-medium text-fg">{c.name}</span> : c.name}
                  {c.description && <span className="mt-0.5 block text-fg/80">{c.description}</span>}
                </li>
              ))}
            </ul>
            <h2 className="mt-7 text-[18px]! font-semibold! text-fg">Como foi obtido</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-fg/90">
              Concluiu {b.courses.length === 1 ? 'o curso' : `os ${b.courses.length} cursos`} da trilha ({b.courses.map((c) => c.title).join('; ')}), registrou as atividades práticas de cada curso e foi aprovado na checagem final com situações de trabalho.
            </p>
            {valid && (
              <Link href={`/selo/${b.code}/certificado`} className={cn(ctaOutline, 'mt-7 px-6')} data-testid="badge-certificate-link">
                <FileText className="size-5" aria-hidden="true" />
                Ver certificado
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

import Link from 'next/link';
import { BadgeCheck, CircleAlert, FileText } from 'lucide-react';
import { certificates, getDb } from '@lms/db';
import { formatWorkload, parseCertificateIssuer } from '@lms/course-schema';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { ctaOutline } from '@/app/(lms)/aprender/_components/learner-ui';
import { cn } from '@/lib/utils';
import { formatDateLong } from '../_lib/certificate-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const c = await certificates.getByCode(getDb(), (await params).code);
  return {
    title: c ? `Certificado · ${c.courseTitle}` : 'Verificação de certificado',
    // verificação por link: não entra em buscadores
    robots: { index: false, follow: false },
  };
}

/**
 * Verificação pública do certificado de curso (sem login), aberta pelo QR da folha ou pelo código digitado. Mostra o
 * que foi gravado na emissão: titular, curso, carga horária, datas, conteúdo programático, emissor e se o código vale.
 * Nunca mostra RGM, e-mail, notas ou respostas.
 */
export default async function CertificateVerificationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await certificates.getByCode(getDb(), code);
  const brand = getBrand(c?.workspaceId);
  const valid = !!c && !c.revokedAt;
  const issuer = c ? parseCertificateIssuer(c.issuer) : null;
  const issuerName = issuer?.institution || brand.name;

  return (
    <div className="theme-platform min-h-dvh bg-bg text-fg">
      <SkipLink />
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[880px] items-center px-4 sm:px-8">
          <BrandLogo brand={brand} height={24} />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-[880px] px-4 py-10 outline-none sm:px-8 sm:py-14">
        <p className="text-sm font-medium text-fg-muted">Verificação de certificado</p>
        {!c ? (
          <section className="mt-4 rounded-[22px] border border-line bg-surface p-6" data-testid="certificate-not-found">
            <h1 className="flex items-center gap-3 text-[26px]! font-bold! leading-tight text-fg">
              <CircleAlert className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
              Código não encontrado
            </h1>
            <p className="mt-2 text-[16px] text-fg-muted">
              Confira se o código foi digitado como no certificado, no formato DNA-XXXX-XXXX. Código consultado: <span className="font-mono text-fg">{code}</span>.
            </p>
          </section>
        ) : (
          <section className="mt-4 rounded-[22px] border border-line bg-surface p-6 sm:p-8" data-testid="certificate-verification">
            <h1 className="text-[clamp(1.6rem,1.2rem+1.6vw,2.25rem)]! font-black! leading-tight! text-fg">{c.courseTitle}</h1>
            <p className="mt-1 text-[18px] text-fg" data-testid="certificate-holder">
              {c.holderName}
            </p>
            <p
              className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold ${valid ? 'bg-success/15 text-fg' : 'bg-fg/10 text-fg'}`}
              data-testid="certificate-validity"
            >
              {valid ? <BadgeCheck className="size-5 text-success" aria-hidden="true" /> : <CircleAlert className="size-5 text-fg-muted" aria-hidden="true" />}
              {valid ? 'Certificado válido' : `Certificado cancelado em ${formatDateLong(c.revokedAt!)}`}
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-fg-muted">Concluído em</dt>
                <dd className="text-[17px] text-fg">{formatDateLong(c.completedAt ?? c.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Emitido em</dt>
                <dd className="text-[17px] text-fg">{formatDateLong(c.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Carga horária</dt>
                <dd className="text-[17px] text-fg" data-testid="certificate-workload">
                  {formatWorkload(c.workloadMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Código</dt>
                <dd className="font-mono text-[17px] text-fg">{c.code}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-fg-muted">Emitido por</dt>
                <dd className="text-[17px] text-fg">
                  {issuerName}
                  {issuer?.cnpj ? <span className="text-fg-muted"> · CNPJ {issuer.cnpj}</span> : null}
                </dd>
              </div>
            </dl>
            {c.program.length > 0 && (
              <>
                <h2 className="mt-7 text-[18px]! font-semibold! text-fg">Conteúdo programático</h2>
                <ol className="mt-2 list-decimal space-y-1.5 pl-6 text-[16px] leading-snug text-fg/90">
                  {c.program.map((m) => (
                    <li key={m.title}>
                      {m.title}
                      {m.minutes > 0 && <span className="text-fg-muted"> · {formatWorkload(m.minutes)}</span>}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <h2 className="mt-7 text-[18px]! font-semibold! text-fg">Como foi obtido</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-fg/90">
              Concluiu todas as aulas obrigatórias do curso, foi aprovado nas avaliações e respondeu às atividades obrigatórias. O certificado foi emitido automaticamente pela plataforma na data acima.
            </p>
            {!valid && c.revokedReason && <p className="mt-3 text-[15px] text-fg-muted">Motivo do cancelamento: {c.revokedReason}</p>}
            {valid && (
              <Link href={`/certificado/${c.code}/imprimir`} className={cn(ctaOutline, 'mt-7 px-6')} data-testid="certificate-print-link">
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

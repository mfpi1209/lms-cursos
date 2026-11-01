import Link from 'next/link';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { CircleAlert } from 'lucide-react';
import { getDb, recognition } from '@lms/db';
import { describeCompetencies, formatWorkload } from '@lms/course-schema';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { ctaOutline } from '@/app/(lms)/aprender/_components/learner-ui';
import { cn } from '@/lib/utils';
import { CertificateSheet, CERT_CSS } from './certificate-sheet';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const b = await recognition.getBadgeByCode(getDb(), (await params).code);
  return {
    title: b ? `Certificado · ${b.trailName}` : 'Certificado',
    // certificado por link: não entra em buscadores
    robots: { index: false, follow: false },
  };
}


/**
 * Certificado do Selo DNA Work (sem login), para imprimir ou salvar em PDF: folha A4 paisagem com nome, trilha,
 * data, carga horária, competências (com a descrição), cursos, código e QR para a página de verificação. Nada além
 * do que a verificação pública já mostra. Selo cancelado ou código inexistente: sem certificado.
 * O desenho da folha e o CSS (tela, celular e impressão) ficam em `certificate-sheet.tsx`.
 */
export default async function BadgeCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const b = await recognition.getBadgeByCode(db, code);
  const brand = getBrand(b?.workspaceId);
  const valid = !!b && !b.revokedAt;
  const date = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(d);

  let sheet: React.ReactNode = null;
  if (b && valid) {
    const h = await headers();
    const host = h.get('host') ?? 'localhost:3010';
    const verifyUrl = `${h.get('x-forwarded-proto') ?? 'http'}://${host}/selo/${b.code}`;
    const qrSvg = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1D1E4C', light: '#ffffff' } });
    const workload = formatWorkload(await recognition.badgeWorkloadMinutes(db, b));
    sheet = (
      <CertificateSheet
        d={{
          brandName: brand.name,
          logoDark: brand.logoDark,
          logoRatio: brand.logoRatio,
          holderName: b.holderName,
          trailName: b.trailName,
          code: b.code,
          courseCount: b.courses.length,
          courses: b.courses.map((c) => c.title),
          competencies: describeCompetencies(b.trailName, b.competencies),
          issuedOn: date(b.issuedAt),
          workload,
          verifyUrl,
          verifyShort: `${host}/selo/${b.code}`,
          qrSvg,
        }}
      />
    );
  }

  return (
    <div className="cert-page theme-platform min-h-dvh bg-bg text-fg">
      <style>{CERT_CSS}</style>
      <div className="cert-noprint">
        <SkipLink />
      </div>
      <header className="cert-noprint border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center px-4 sm:px-8">
          <BrandLogo brand={brand} height={24} />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="cert-main mx-auto max-w-[1180px] px-4 py-8 outline-none sm:px-8 sm:py-10">
        {!b ? (
          <>
            <p className="text-sm font-medium text-fg-muted">Certificado</p>
            <section className="mt-4 max-w-[880px] rounded-[22px] border border-line bg-surface p-6" data-testid="badge-not-found">
              <h1 className="flex items-center gap-3 text-[26px]! font-bold! leading-tight text-fg">
                <CircleAlert className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
                Código não encontrado
              </h1>
              <p className="mt-2 text-[16px] text-fg-muted">
                Confira se o código foi digitado como no selo, no formato DNA-XXXX-XXXX. Código consultado: <span className="font-mono text-fg">{code}</span>.
              </p>
            </section>
          </>
        ) : !valid ? (
          <>
            <p className="text-sm font-medium text-fg-muted">Certificado</p>
            <section className="mt-4 max-w-[880px] rounded-[22px] border border-line bg-surface p-6" data-testid="certificate-unavailable">
              <h1 className="flex items-center gap-3 text-[26px]! font-bold! leading-tight text-fg">
                <CircleAlert className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
                Certificado indisponível
              </h1>
              <p className="mt-2 text-[16px] text-fg-muted">O selo {b.code} foi cancelado em {date(b.revokedAt!)}. Não há certificado para este código.</p>
              <Link href={`/selo/${b.code}`} className={cn(ctaOutline, 'mt-5 px-6')}>
                Ver página de verificação
              </Link>
            </section>
          </>
        ) : (
          <>
            <div className="cert-noprint mb-6 flex flex-wrap items-center justify-between gap-4">
              <Link href={`/selo/${b.code}`} className="inline-flex min-h-11 items-center rounded-md text-[15px] text-fg-muted underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Voltar à verificação
              </Link>
              <PrintButton />
            </div>
            {sheet}
          </>
        )}
      </main>
    </div>
  );
}

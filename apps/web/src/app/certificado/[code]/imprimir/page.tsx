import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { certificates, getDb } from '@lms/db';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { getViewer } from '@/server/viewer';
import { ctaOutline } from '@/app/(lms)/aprender/_components/learner-ui';
import { cn } from '@/lib/utils';
import { PrintButton } from '@/app/selo/[code]/certificado/print-button';
import { CourseCertificateSheet, COURSE_CERT_CSS } from '../../_components/course-certificate-sheet';
import { canSeeRgm, certificateSheetData, formatDateLong } from '../../_lib/certificate-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const c = await certificates.getByCode(getDb(), (await params).code);
  return { title: c ? `Certificado · ${c.courseTitle}` : 'Certificado', robots: { index: false, follow: false } };
}

/**
 * Folha do certificado de curso para imprimir ou salvar em PDF (A4 paisagem), aberta sem login. O RGM só aparece
 * para a própria pessoa e para a equipe do workspace. Cancelado ou inexistente: sem folha.
 */
export default async function CourseCertificatePrintPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await certificates.getByCode(getDb(), code);
  const brand = getBrand(c?.workspaceId);
  const valid = !!c && !c.revokedAt;
  const data = c && valid ? await certificateSheetData(c, { showRgm: canSeeRgm(c, await getViewer()) }) : null;

  return (
    <div className="cert-page theme-platform min-h-dvh bg-bg text-fg">
      <style>{COURSE_CERT_CSS}</style>
      <div className="cert-noprint">
        <SkipLink />
      </div>
      <header className="cert-noprint border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center px-4 sm:px-8">
          <BrandLogo brand={brand} height={24} />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="cert-main mx-auto max-w-[1180px] px-4 py-8 outline-none sm:px-8 sm:py-10">
        {!c || !valid || !data ? (
          <>
            <p className="text-sm font-medium text-fg-muted">Certificado</p>
            <section className="mt-4 max-w-[880px] rounded-[22px] border border-line bg-surface p-6" data-testid="certificate-unavailable">
              <h1 className="flex items-center gap-3 text-[26px]! font-bold! leading-tight text-fg">
                <CircleAlert className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
                {c ? 'Certificado indisponível' : 'Código não encontrado'}
              </h1>
              <p className="mt-2 text-[16px] text-fg-muted">
                {c ? `O certificado ${c.code} foi cancelado em ${formatDateLong(c.revokedAt!)}.` : `Confira o código, no formato DNA-XXXX-XXXX. Código consultado: ${code}.`}
              </p>
              {c && (
                <Link href={`/certificado/${c.code}`} className={cn(ctaOutline, 'mt-5 px-6')}>
                  Ver página de verificação
                </Link>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="cert-noprint mb-6 flex flex-wrap items-center justify-between gap-4">
              <Link
                href={`/certificado/${c.code}`}
                className="inline-flex min-h-11 items-center rounded-md text-[15px] text-fg-muted underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Página de verificação
              </Link>
              <PrintButton />
            </div>
            <CourseCertificateSheet d={data} />
          </>
        )}
      </main>
    </div>
  );
}

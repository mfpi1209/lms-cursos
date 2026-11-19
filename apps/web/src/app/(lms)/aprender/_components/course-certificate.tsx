import Link from 'next/link';
import { Award } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { ctaOutline, ctaPrimary } from './learner-ui';
import { CopyLinkButton } from './copy-link-button';
import { certificatePendingItems, certificateSheetHref, certificateVerifyHref } from '../_lib/certificate-card';
import type { CertificatePending } from '@lms/course-schema';

/**
 * "Certificado de conclusão" na página do curso: emitido (código, data, ver/verificar) ou "falta pouco" com o que
 * falta e o link para resolver cada item. Só se renderiza quando o curso oferece certificado.
 */
export function CourseCertificate({
  enrollmentId,
  issued,
  pending,
  resumeHref,
}: {
  enrollmentId: string;
  issued: { code: string; issuedAt: Date | string } | null;
  pending: readonly CertificatePending[];
  resumeHref?: string;
}) {
  if (issued) {
    return (
      <section aria-labelledby="certificate-heading" data-testid="course-certificate" className="panel space-y-4 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Award className="size-7 shrink-0 text-accent-ink" aria-hidden="true" />
          <h2 id="certificate-heading" className="text-[28px] leading-tight text-fg sm:text-[32px]">Certificado de conclusão</h2>
        </div>
        <p className="max-w-prose text-lg leading-relaxed text-fg">Parabéns! Seu certificado está pronto. Você pode imprimir, salvar em PDF ou compartilhar o link de verificação.</p>
        <p className="text-sm text-fg-muted">
          Código <span className="font-mono font-semibold text-fg" data-testid="certificate-code">{issued.code}</span> · emitido em {formatDate(issued.issuedAt)}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href={certificateSheetHref(issued.code)} className={cn(ctaPrimary, 'min-h-12 px-6')} data-testid="certificate-view">
            Ver meu certificado
          </Link>
          <Link href={certificateVerifyHref(issued.code)} className={cn(ctaOutline, 'min-h-11 px-5 text-[15px]')}>
            Link de verificação
          </Link>
          <CopyLinkButton path={certificateVerifyHref(issued.code)} label="Copiar link de verificação" />
        </div>
      </section>
    );
  }
  const items = certificatePendingItems(pending, enrollmentId, resumeHref);
  return (
    <section aria-labelledby="certificate-heading" data-testid="course-certificate-pending" className="panel space-y-4 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Award className="size-7 shrink-0 text-fg-muted" aria-hidden="true" />
        <h2 id="certificate-heading" className="text-[28px] leading-tight text-fg sm:text-[32px]">Certificado de conclusão</h2>
      </div>
      <p className="text-lg font-medium text-fg">Falta pouco para o seu certificado</p>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={`${i}-${it.label}`} className="flex flex-col gap-1 rounded-xl border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-[15px] leading-snug text-fg">{it.label}</span>
              {it.href && it.action && (
                <Link href={it.href} className="inline-flex min-h-11 shrink-0 items-center rounded-md text-[15px] font-semibold text-accent-ink underline underline-offset-2 hover:opacity-80">
                  {it.action}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-fg-muted">O certificado sai sozinho assim que tudo estiver concluído.</p>
    </section>
  );
}

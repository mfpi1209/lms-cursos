import type { CertificatePending } from '@lms/course-schema';

export interface CertificatePendingItem {
  label: string;
  /** destino para retomar; ausente quando não há aula específica */
  href?: string;
  /** texto do link ("Refazer avaliação", "Continuar a aula") */
  action?: string;
}

/**
 * Traduz as pendências da regra do certificado em itens de lista com o link certo para resolvê-las.
 * Avaliação reprovada e reflexão em branco pedem uma tentativa nova da aula (`?reiniciar=1`: a aula já está concluída);
 * tarefa abre a aula; "concluir o curso" leva à próxima aula (`resumeHref`), quando houver.
 */
export function certificatePendingItems(pending: readonly CertificatePending[], enrollmentId: string, resumeHref?: string): CertificatePendingItem[] {
  const lessonHref = (id: string) => `/aprender/${enrollmentId}/aulas/${id}`;
  return pending.map((p): CertificatePendingItem => {
    if (!p.lessonId) return resumeHref ? { label: p.label, href: resumeHref, action: 'Continuar o curso' } : { label: p.label };
    if (p.kind === 'assessment') return { label: p.label, href: `${lessonHref(p.lessonId)}?reiniciar=1`, action: 'Refazer avaliação' };
    if (p.kind === 'reflection') return { label: p.label, href: `${lessonHref(p.lessonId)}?reiniciar=1`, action: 'Responder reflexão' };
    return { label: p.label, href: lessonHref(p.lessonId), action: 'Abrir a aula' };
  });
}

export const certificateSheetHref = (code: string) => `/certificado/${code}/imprimir`;
export const certificateVerifyHref = (code: string) => `/certificado/${code}`;

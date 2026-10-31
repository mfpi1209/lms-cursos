'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDraft } from '@/components/studio/draft-provider';

/**
 * Link para a prévia que GRAVA o rascunho antes de abrir (auditoria P2:
 * "autosave antes da prévia"). A prévia lê o rascunho salvo no servidor; sem
 * isto, abrir logo depois de editar mostrava a revisão anterior. Com o rascunho
 * já salvo o link se comporta como um `<Link>` comum. Em conflito/erro de
 * gravação, abre mesmo assim (a barra de estado já avisa o autor).
 */
export function PreviewLink({ href, target, onClick, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const { status, saveNow } = useDraft();
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const needsSave = status === 'dirty' || status === 'saving';
    // modificadores (nova aba pelo teclado) e links já salvos seguem o fluxo normal do navegador
    if (!needsSave || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setSaving(true);
    try {
      await saveNow();
    } catch {
      /* a barra de estado mostra o erro; abrir a prévia continua útil */
    } finally {
      setSaving(false);
    }
    if (target === '_blank') window.open(href, '_blank', 'noopener');
    else router.push(href);
  };
  return (
    <Link href={href} target={target} onClick={(e) => void handleClick(e)} aria-busy={saving || undefined} data-saving={saving ? 'true' : undefined} {...rest}>
      {children}
    </Link>
  );
}

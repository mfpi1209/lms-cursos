import Link from 'next/link';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { LEGAL_DOCS, LEGAL_DRAFT, LEGAL_DRAFT_LABEL, LEGAL_DRAFT_NOTE, type LegalDocId } from '@/lib/legal/documents';
import { readLegalSource } from '@/lib/legal/source';
import { LegalDocument } from './legal-document';
import { LegalLinks } from './legal-links';

/** Metadados das páginas legais: título da aba e `noindex` enquanto for rascunho. */
export function legalMetadata(id: LegalDocId) {
  const d = LEGAL_DOCS[id];
  return { title: d.title, ...(LEGAL_DRAFT ? { robots: { index: false, follow: false } } : {}) };
}

/**
 * Página pública (sem login) de um texto legal. Mesma moldura da verificação de selo: marca, tema claro/escuro, conteúdo
 * legível em coluna estreita, aviso discreto de rascunho no topo e os quatro links no rodapé.
 */
export function LegalPage({ id }: { id: LegalDocId }) {
  const doc = LEGAL_DOCS[id];
  const brand = getBrand();
  const source = readLegalSource(doc);
  return (
    <div className="theme-platform flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[820px] items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/" prefetch={false} className="inline-flex min-h-11 min-w-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={`${brand.name}: início`}>
            <BrandLogo brand={brand} height={24} alt="" />
          </Link>
          <ThemeSwitch />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-[820px] flex-1 px-4 py-8 outline-none sm:px-8 sm:py-12">
        {LEGAL_DRAFT ? (
          <p role="note" data-testid="legal-draft-notice" className="mb-8 rounded-xl border border-line bg-fg/5 px-4 py-3 text-sm leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg">{LEGAL_DRAFT_LABEL}.</strong> {LEGAL_DRAFT_NOTE}
          </p>
        ) : null}
        <LegalDocument source={source} />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[820px] px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8">
          <LegalLinks current={id} />
        </div>
      </footer>
    </div>
  );
}

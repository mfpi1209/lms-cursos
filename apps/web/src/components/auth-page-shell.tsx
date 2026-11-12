import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { LegalLinks } from '@/components/legal/legal-links';

/** Moldura das telas de acesso fora do login (esqueci a senha, nova senha): mesma marca e mesmo visual do /login. */
export function AuthPageShell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  const brand = getBrand();
  return (
    <div className="theme-platform relative min-h-dvh overflow-hidden text-fg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[image:var(--t-glow)]" />
      <SkipLink />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeSwitch />
      </div>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative grid min-h-dvh place-items-center px-4 py-16 sm:py-12">
        <div className="w-full max-w-[440px]">
          <div className="max-w-[calc(100%-56px)]">
            <BrandLogo brand={brand} height={36} />
          </div>
          <h1 className="mt-10 sm:mt-12">{title}</h1>
          {lead ? <p className="mt-4 text-lg leading-relaxed text-fg-muted">{lead}</p> : null}
          <div className="mt-8 rounded-[20px] border border-line bg-surface/80 p-5 backdrop-blur-md sm:mt-10 sm:p-8">{children}</div>
          <LegalLinks only={['cookies', 'seguranca']} align="start" className="-ml-2 mt-4" />
        </div>
      </main>
    </div>
  );
}

export const authLinkClass =
  'rounded-sm font-medium text-fg underline underline-offset-4 decoration-fg/40 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

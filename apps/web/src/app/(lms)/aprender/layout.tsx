import Link from 'next/link';
import { Suspense } from 'react';
import { LmsAvatarMenu, LmsSearch, LmsTabs } from './_components/lms-nav';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { redirect } from 'next/navigation';
import { identity } from '@lms/db';
import { getViewer } from '@/server/viewer';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { LegalLinks } from '@/components/legal/legal-links';

/**
 * Área do aluno no visual da marca do workspace (`.theme-platform` + preset de
 * config/brand.ts: logo no cabeçalho, "Oferecido por" no rodapé, cores do preset).
 * Na página da aula o player ocupa a tela toda: `.lms-chrome` some e `.lms-main`
 * perde a coluna (regras com :has em globals.css).
 */
export default async function LmsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  const brand = getBrand(viewer.workspace.id);
  return (
    <div className="theme-platform flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <header className="lms-chrome relative border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1416px] items-center justify-between gap-2 px-4 md:h-[72px] md:gap-3 md:px-8 xl:px-12">
          <div className="flex min-w-0 items-center gap-6 self-stretch lg:gap-10">
            <Link href="/aprender" className="inline-flex min-h-11 min-w-0 shrink items-center self-center rounded-md" aria-label={`${brand.name}: explorar cursos`}>
              <BrandLogo brand={brand} height={24} className="max-md:[--logo-h:22px]" />
            </Link>
            <LmsTabs />
          </div>
          <div className="flex shrink-0 items-center gap-1 text-sm text-fg-muted sm:gap-2">
            <Suspense fallback={null}>
              <LmsSearch />
            </Suspense>
            <ThemeSwitch />
            <LmsAvatarMenu name={viewer.user.name || viewer.user.email} staff={identity.isStaff(viewer.role)}>
              <SignOutButton />
            </LmsAvatarMenu>
          </div>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="lms-main mx-auto w-full max-w-[1416px] flex-1 px-4 pb-8 pt-6 md:px-8 md:pt-8 xl:px-12">{children}</main>
      <footer className="lms-chrome mt-12 border-t border-line">
        <div className="mx-auto flex max-w-[1416px] flex-col gap-3 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-sm text-fg-muted md:flex-row md:items-center md:justify-between md:px-8 md:py-6 xl:px-12">
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="brand-footer">
            <span>Oferecido por</span>
            <BrandLogo brand={brand} height={18} />
          </p>
          {brand.tagline ? <p>{brand.tagline}</p> : null}
          <LegalLinks align="start" className="-mx-2 md:mx-0 md:-mr-2" />
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { redirect } from 'next/navigation';
import { identity } from '@lms/db';
import { getViewer } from '@/server/viewer';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';

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
      <header className="lms-chrome border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:h-[72px] sm:gap-3 sm:px-6">
          <Link href="/aprender" className="inline-flex min-h-11 min-w-0 shrink items-center rounded-md" aria-label={`${brand.name}: meus cursos`}>
            <BrandLogo brand={brand} height={26} className="max-sm:[--logo-h:22px]" />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 text-sm text-fg-muted sm:gap-4">
            {identity.isStaff(viewer.role) && (
              <Link href="/estudio" className="inline-flex min-h-11 items-center rounded-full px-3 hover:bg-surface-2 hover:text-fg">
                Estúdio
              </Link>
            )}
            <span className="hidden sm:inline">{viewer.user.name}</span>
            <ThemeSwitch />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="lms-main mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="lms-chrome border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="brand-footer">
            <span>Oferecido por</span>
            <BrandLogo brand={brand} height={18} />
          </p>
          {brand.tagline ? <p>{brand.tagline}</p> : null}
        </div>
      </footer>
    </div>
  );
}

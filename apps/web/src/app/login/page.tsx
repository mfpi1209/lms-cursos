import { redirect } from 'next/navigation';
import { getViewer, homeFor } from '@/server/viewer';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';
import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar' };

/**
 * Entrada da plataforma no visual da marca do workspace (preset de config/brand.ts:
 * logo, frase e cores), claro ou escuro pela preferência. Só o visual mudou: o formulário é o mesmo.
 */
export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer) redirect(homeFor(viewer.role));
  const brand = getBrand();
  return (
    <div className="theme-platform relative min-h-dvh overflow-hidden text-fg">
      {/* brilho discreto do acento, só decoração */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[image:var(--t-glow)]"
      />
      <SkipLink />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeSwitch />
      </div>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative grid min-h-dvh place-items-center px-4 py-16 sm:py-12">
        <div className="w-full max-w-[440px]">
          {/* logo da marca (ou a marca em texto, sem logo); espaço à direita para o seletor de tema no celular */}
          <div className="max-w-[calc(100%-56px)]">
            <BrandLogo brand={brand} height={36} />
          </div>
          <h1 className="mt-10 sm:mt-12">Entre para continuar.</h1>
          <p className="mt-4 text-lg leading-relaxed text-fg-muted">Seus cursos, suas montagens e suas turmas ficam onde você deixou.</p>
          <div className="mt-8 rounded-[20px] border border-line bg-surface/80 p-5 backdrop-blur-md sm:mt-10 sm:p-8">
            <LoginForm />
          </div>
          {brand.tagline ? <p className="mt-8 text-center text-sm text-fg-muted" data-testid="brand-tagline">{brand.tagline}</p> : null}
        </div>
      </main>
    </div>
  );
}

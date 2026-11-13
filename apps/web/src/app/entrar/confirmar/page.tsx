import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MAGIC_LINK_CONFIRM_ACTION, MAGIC_LINK_ERROR_CALLBACK, safeLocalPath } from '@/lib/auth-access';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';

// a URL leva o token: sem indexação e sem enviar a página como origem (referrer) para nenhum destino
export const metadata: Metadata = { title: 'Confirmar acesso', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/**
 * Destino dos links mágicos enviados por e-mail ou devolvidos pela API. Abrir esta página (GET) NÃO consome o link:
 * filtros de e-mail corporativos abrem links antes do aluno. Só o botão "Continuar" (POST) confere o token e abre a sessão.
 */
export default async function ConfirmarAcessoPage({ searchParams }: { searchParams: Promise<{ token?: string; callbackURL?: string; errorCallbackURL?: string }> }) {
  const q = await searchParams;
  const token = typeof q.token === 'string' ? q.token : '';
  if (!token) redirect(MAGIC_LINK_ERROR_CALLBACK);
  const callbackURL = safeLocalPath(q.callbackURL, '/aprender');
  const errorCallbackURL = safeLocalPath(q.errorCallbackURL, MAGIC_LINK_ERROR_CALLBACK);
  const brand = getBrand();
  return (
    <div className="theme-platform relative min-h-dvh overflow-hidden text-fg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[image:var(--t-glow)]" />
      <SkipLink />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative grid min-h-dvh place-items-center px-4 py-16 sm:py-12">
        <div className="w-full max-w-[440px]">
          <BrandLogo brand={brand} height={36} />
          <h1 className="mt-10 sm:mt-12">Tudo certo para entrar.</h1>
          <p className="mt-4 text-lg leading-relaxed text-fg-muted">Toque em continuar para abrir seus cursos. Este link vale uma única vez.</p>
          <form method="post" action={MAGIC_LINK_CONFIRM_ACTION} className="mt-8 rounded-[20px] border border-line bg-surface/80 p-5 backdrop-blur-md sm:p-8" data-testid="confirmar-form">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="callbackURL" value={callbackURL} />
            <input type="hidden" name="errorCallbackURL" value={errorCallbackURL} />
            <button
              type="submit"
              data-testid="confirmar-continuar"
              className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] bg-accent-fill px-8 text-base font-semibold text-accent-fill-fg transition-colors hover:bg-accent-fill-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Continuar
            </button>
          </form>
          <p className="mt-5 text-sm leading-relaxed text-fg-muted">
            Não pediu este acesso? Feche esta página. Se o link já foi usado, <Link href="/login" className="font-medium text-fg underline underline-offset-4">entre pelo e-mail</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Caveat, Figtree, Instrument_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import { THEME_COOKIE, THEME_INIT_SCRIPT, parseThemePref } from '@/lib/theme';
import { getBrand } from '@/config/brand';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });
const body = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });
/** Fonte da plataforma (aluno, login e estúdio): sans geométrica. Exposta como `--font-platform`. */
const platform = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-platform', display: 'swap' });
/** Letra manuscrita dos títulos nas capas da vitrine do aluno (editorial claro). Exposta como `--font-hand`. */
const hand = Caveat({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-hand', display: 'swap' });

// Marca da plataforma (preset do workspace; ver config/brand.ts). Título da aba: "<página> · <marca>".
const brand = getBrand();

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brand.surfaceLight },
    { media: '(prefers-color-scheme: dark)', color: brand.surfaceDark },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema: o cookie já define claro/escuro no HTML do servidor; "system" é resolvido pelo script inline antes de pintar.
  const pref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
  const hasCookie = (await cookies()).has(THEME_COOKIE);
  return (
    <html
      lang="pt-BR"
      // a classe do preset liga os tokens de cor da marca (globals.css, "PRESETS DE MARCA")
      className={`${display.variable} ${body.variable} ${platform.variable} ${hand.variable} ${brand.className}`}
      style={{ ['--brand-primary' as string]: brand.accent }}
      data-brand={brand.id}
      data-theme-pref={hasCookie ? pref : undefined}
      data-theme={pref === 'system' ? undefined : pref}
      // o script inline ajusta data-theme/data-theme-pref antes da hidratação
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

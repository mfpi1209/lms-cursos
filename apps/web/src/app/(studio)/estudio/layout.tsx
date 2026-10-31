import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '@lms/db';
import { getViewer } from '@/server/viewer';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeSwitch } from '@/components/theme-switch';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/skip-link';
import { OVERLAY_ROOT_ID } from '@/components/ui/overlay-portal';
import { BrandLogo } from '@/components/brand-logo';
import { getBrand } from '@/config/brand';

const navLink =
  'relative inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-sm sm:px-3 font-medium text-fg-muted transition-colors hover:text-fg after:absolute after:inset-x-2 after:bottom-1.5 sm:after:inset-x-3 after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity hover:after:opacity-100 aria-[current=page]:text-fg aria-[current=page]:after:opacity-100';

/** Papéis do workspace (enum `workspace_role`) em pt-BR. */
const ROLE_LABEL: Record<string, string> = { admin: 'Administração', author: 'Autoria', reviewer: 'Revisão', student: 'Aluno' };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (!identity.isStaff(viewer.role)) redirect('/aprender');
  // marca do workspace (preset de config/brand.ts): logo no cabeçalho, cores do tema
  const brand = getBrand(viewer.workspace.id);
  const initial = (viewer.user.name?.trim()?.[0] ?? '?').toUpperCase();
  const role = ROLE_LABEL[viewer.role] ?? viewer.role;

  return (
    <div className="theme-studio flex min-h-dvh flex-col text-fg">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:h-[72px] sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1 sm:gap-8">
            <Link href="/estudio" aria-label={`${brand.name} Estúdio, início`} className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg pr-2 sm:pr-2">
              {/* logo da marca (ou a marca em texto, com o ponto no acento) + "Estúdio"; menor no celular para caber ao lado da navegação */}
              <BrandLogo brand={brand} height={24} className="max-[400px]:[--logo-h:19px]" alt="" />
              <span className="eyebrow hidden md:inline" aria-hidden="true">Estúdio</span>
            </Link>
            <nav className="flex items-center" aria-label="Principal">
              <Link href="/estudio" className={navLink}>
                Cursos
              </Link>
              {/* em telas muito estreitas o acesso fica na lista de cursos (ao lado de "Novo curso") */}
              <Link href="/estudio/modelos" className={`${navLink} max-[440px]:hidden`}>
                Modelos
              </Link>
              <Link href="/aprender" className={navLink}>
                <span className="sm:hidden">Como aluno</span>
                <span className="hidden sm:inline">Ver como aluno</span>
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeSwitch />
            <span className="hidden items-center gap-2 rounded-full border border-line-strong py-1 pl-1 pr-3.5 text-xs text-fg-muted md:inline-flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-fill text-xs font-bold text-accent-fill-fg" aria-hidden="true">{initial}</span>
              <span className="font-medium text-fg">{viewer.user.name}</span>
              <span className="text-fg-faint"><span className="sr-only">, papel: </span>{role}</span>
            </span>
            {/* "Sair" como botão de contorno (o componente é compartilhado com a área do aluno); no celular só o ícone (o nome acessível continua "Sair") */}
            <span className="contents [&>button]:border [&>button]:border-line-strong [&>button]:text-fg [&>button]:hover:border-fg/40 max-sm:[&>button]:min-w-11 max-sm:[&>button]:gap-0 max-sm:[&>button]:px-0 max-sm:[&>button]:text-[0px]">
              <SignOutButton />
            </span>
          </div>
        </div>
      </header>
      {/* studio-main: recebe espaço extra embaixo quando a pílula do assistente está montada e à direita quando o painel está aberto (ver globals.css) */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="studio-main mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      {/* raiz das sobreposições (diálogos, assistente): dentro do tema, fora de qualquer ancestral animado */}
      <div id={OVERLAY_ROOT_ID} />
    </div>
  );
}

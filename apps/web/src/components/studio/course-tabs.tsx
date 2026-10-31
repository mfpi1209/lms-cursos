'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findLesson } from '@lms/course-schema';
import { Badge } from '@/components/ui/card';
import { PresenterThumb } from '@/components/studio/presenter-thumb';
import { cn } from '@/lib/utils';
import { useDraft } from './draft-provider';
import { QueueIndicator } from './media-queue/queue-indicator';

const STATUS_LABEL = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' } as const;
const STATUS_TONE = { draft: 'neutral', published: 'success', archived: 'neutral' } as const;

export interface CourseChromeProps {
  courseId: string;
  status: keyof typeof STATUS_LABEL;
  latestVersionNumber: number;
}

/**
 * Cabeçalho do curso + abas. Lê o título do rascunho (contexto) para refletir
 * edições ao vivo. Fica oculto na prévia (tela inteira) e no assistente de
 * montagem (/montar), que tem a própria navegação.
 */
export function CourseChrome({ courseId, status, latestVersionNumber }: CourseChromeProps) {
  const pathname = usePathname() ?? '';
  const { document, revision } = useDraft();
  const navRef = React.useRef<HTMLElement>(null);
  const hidden = /\/previa\/?$/.test(pathname) || /\/montar(\/|$)/.test(pathname);

  // no celular as abas rolam na horizontal: mantém a aba ativa à vista
  React.useEffect(() => {
    if (hidden) return;
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    // só rola na horizontal (scrollIntoView poderia mexer na rolagem da página)
    const a = active.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    nav.scrollLeft += a.left + a.width / 2 - (n.left + n.width / 2);
  }, [pathname, hidden]);

  if (hidden) return null;

  const base = `/estudio/cursos/${courseId}`;
  // enquanto a montagem não terminou, o painel continua acessível (só a primeira visita, sem aulas, vai ao assistente)
  const assembling = !document.wizard.finished && latestVersionNumber === 0;
  const lessonId = pathname.startsWith(`${base}/aulas/`) ? pathname.slice(`${base}/aulas/`.length).split('/')[0] : undefined;
  const lessonTitle = lessonId ? (findLesson(document, decodeURIComponent(lessonId))?.lesson.title ?? 'Aula') : undefined;
  const tabs = [
    // no editor de aula nenhuma aba fica ativa: a trilha de navegação mostra onde se está
    { href: base, label: 'Painel', active: pathname === base },
    ...(assembling ? [{ href: `${base}/montar`, label: 'Montagem', active: false }] : []),
    { href: `${base}/detalhes`, label: 'Detalhes', active: pathname.startsWith(`${base}/detalhes`) },
    { href: `${base}/producao`, label: 'Produção', active: pathname.startsWith(`${base}/producao`) },
    { href: `${base}/revisao`, label: 'Revisão e publicação', active: pathname.startsWith(`${base}/revisao`) },
    { href: `${base}/matriculas`, label: 'Matrículas', active: pathname.startsWith(`${base}/matriculas`) },
  ];
  const crumb = 'inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline';

  return (
    <div className="mb-10 space-y-6">
      <nav aria-label="Trilha de navegação" className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-fg-faint">
        <Link href="/estudio" className={crumb}>Cursos</Link>
        <span aria-hidden="true">/</span>
        {lessonTitle ? (
          <>
            <Link href={base} className={cn(crumb, 'min-w-0 max-w-full break-words text-fg-muted')}>{document.title}</Link>
            <span aria-hidden="true">/</span>
            <span className="min-w-0 break-words text-fg-muted" aria-current="page">{lessonTitle}</span>
          </>
        ) : (
          <span className="min-w-0 break-words text-fg-muted" aria-current="page">{document.title}</span>
        )}
      </nav>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <PresenterThumb src={document.presentation.avatarPreviewUrl} name={document.title} size={64} className="hidden sm:grid" />
          <div className="min-w-0 space-y-2">
            <h1 className="line-clamp-3 break-words text-balance [overflow-wrap:anywhere] sm:line-clamp-2" title={document.title} data-testid="course-title">{document.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              {/* em rascunho o selo repetiria "Rascunho rev. N" logo ao lado */}
              {status !== 'draft' && <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>}
              <span>{latestVersionNumber > 0 ? `Versão publicada ${latestVersionNumber}` : 'Nunca publicado'}</span>
              <span aria-hidden="true" className="text-fg-faint">·</span>
              <span>Rascunho rev. {revision}</span>
            </div>
          </div>
        </div>
        <QueueIndicator courseId={courseId} className="self-start sm:self-auto" />
      </div>
      <nav
        ref={navRef}
        aria-label="Seções do curso"
        className="scroll-fade-x -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-1 overflow-x-auto overscroll-x-contain border-b border-line px-4 sm:mx-0 sm:snap-none sm:flex-wrap sm:px-0"
      >
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-12 shrink-0 snap-start items-center whitespace-nowrap rounded-t-lg px-4 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors',
              t.active ? 'text-fg after:bg-accent' : 'text-fg-muted after:bg-transparent hover:text-fg hover:after:bg-line-strong',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

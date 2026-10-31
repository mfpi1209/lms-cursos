'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, LayoutGrid, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Abas da área do aluno: Explorar (vitrine) e Minhas trilhas; a ativa ganha o sublinhado laranja. */
export function LmsTabs() {
  const path = usePathname();
  const tabs = [
    { href: '/aprender', label: 'Explorar', icon: LayoutGrid, active: path === '/aprender' },
    { href: '/aprender/trilhas', label: 'Minhas trilhas', icon: BookOpen, active: path.startsWith('/aprender/trilhas') },
  ];
  return (
    <nav aria-label="Área do aluno" className="hidden items-stretch gap-1 self-stretch md:flex">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={cn(
            'relative inline-flex items-center gap-2 px-3 text-[15px] font-medium transition-colors focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-accent',
            t.active ? 'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-accent-fill' : 'text-fg-muted hover:text-fg',
          )}
        >
          <t.icon className={cn('size-[18px]', t.active && 'text-[var(--im-accent)]')} aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Busca do cabeçalho: abre um campo; Enter leva à vitrine filtrada (?q=). */
export function LmsSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(!!params.get('q'));
  const [value, setValue] = React.useState(params.get('q') ?? '');
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Buscar cursos" className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <Search className="size-5" aria-hidden="true" />
      </button>
    );
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/aprender?q=${encodeURIComponent(q)}#cursos` : '/aprender');
      }}
      className="flex items-center gap-1 rounded-full border border-line bg-surface pl-3"
    >
      <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <label htmlFor="lms-search" className="sr-only">Buscar cursos</label>
      <input ref={input} id="lms-search" type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Buscar curso, tema ou instrutor" className="h-10 w-[46vw] max-w-[260px] bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted" />
      <button
        type="button"
        aria-label="Fechar busca"
        onClick={() => {
          setOpen(false);
          if (params.get('q')) router.push('/aprender');
        }}
        className="grid size-10 place-items-center rounded-full text-fg-muted hover:text-fg"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}

/** Avatar com a inicial; abre o menu com nome, estúdio (equipe) e sair. */
export function LmsAvatarMenu({ name, staff, children }: { name: string; staff: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={`Conta de ${name}`} onClick={() => setOpen((o) => !o)} className="grid size-11 place-items-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="grid size-10 place-items-center rounded-full bg-[#1d1e4c] text-[15px] font-bold text-white ring-2 ring-[var(--im-accent)] ring-offset-2 ring-offset-bg">{initial}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-[14px] border border-line bg-surface p-2 shadow-xl">
          <p className="truncate px-3 py-2 text-[15px] font-semibold text-fg">{name}</p>
          <Link href="/aprender/trilhas" className="flex min-h-11 items-center rounded-[10px] px-3 text-[15px] text-fg hover:bg-surface-2 md:hidden" onClick={() => setOpen(false)}>
            Minhas trilhas
          </Link>
          {staff && (
            <Link href="/estudio" className="flex min-h-11 items-center rounded-[10px] px-3 text-[15px] text-fg hover:bg-surface-2" onClick={() => setOpen(false)}>
              Estúdio
            </Link>
          )}
          <div className="mt-1 border-t border-line pt-1">{children}</div>
        </div>
      )}
    </div>
  );
}

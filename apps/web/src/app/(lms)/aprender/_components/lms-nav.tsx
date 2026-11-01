'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, LayoutGrid, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Abas da área do aluno: Explorar (vitrine) e Minhas trilhas; a ativa ganha o sublinhado laranja de 2 px. */
export function LmsTabs() {
  const path = usePathname();
  const tabs = [
    { href: '/aprender', label: 'Explorar', icon: LayoutGrid, active: path === '/aprender' },
    { href: '/aprender/trilhas', label: 'Minhas trilhas', icon: BookOpen, active: path.startsWith('/aprender/trilhas') },
  ];
  return (
    <nav aria-label="Área do aluno" className="hidden items-stretch gap-6 self-stretch md:flex">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={cn(
            'relative inline-flex items-center gap-2 px-1 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--dna-focus,var(--im-accent-ink))]',
            t.active ? 'text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-fill' : 'text-fg-muted hover:text-fg',
          )}
        >
          <t.icon className={cn('size-[18px]', t.active && 'text-[var(--im-accent)]')} aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Busca do cabeçalho. Computador (≥ 1024 px): campo de verdade, de 220 a 320 px. Abaixo: um botão de 44 px que abre um
 * painel com o campo logo abaixo do cabeçalho (Esc fecha e devolve o foco ao botão). Enter leva à vitrine filtrada (?q=);
 * campo vazio volta à vitrine inteira.
 */
export function LmsSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('q') ?? '';
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(current);
  const button = React.useRef<HTMLButtonElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  // a URL manda: voltar/avançar ou limpar a busca em outro lugar atualiza o campo
  React.useEffect(() => setValue(current), [current]);
  React.useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    setOpen(false);
    router.push(q ? `/aprender?q=${encodeURIComponent(q)}#cursos` : '/aprender');
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const field = 'h-11 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted';
  return (
    <>
      <form role="search" onSubmit={submit} className="hidden h-11 w-[clamp(220px,22vw,320px)] items-center gap-2 rounded-full border border-line bg-surface pl-4 pr-2 focus-within:border-[var(--dna-focus,var(--im-accent-ink))] focus-within:ring-2 focus-within:ring-[var(--dna-focus,var(--im-accent-ink))] lg:flex" data-testid="search-desktop">
        <Search className="size-[18px] shrink-0 text-fg-muted" aria-hidden="true" />
        <label htmlFor="lms-search" className="sr-only">Buscar cursos, temas ou situações</label>
        <input id="lms-search" type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Buscar cursos, temas ou situações…" className={field} />
        {value && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setValue('');
              if (current) router.push('/aprender');
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--dna-focus,var(--im-accent-ink))]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="lms-search-panel"
        aria-label="Buscar cursos"
        className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dna-focus,var(--im-accent-ink))] lg:hidden"
        data-testid="search-button"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div id="lms-search-panel" className="absolute inset-x-0 top-full z-40 border-b border-line bg-bg px-4 py-3 shadow-[0_12px_24px_-16px_rgba(29,30,76,0.35)] md:px-8 lg:hidden" onKeyDown={(e) => e.key === 'Escape' && close()}>
          <form role="search" onSubmit={submit} className="mx-auto flex h-11 max-w-[640px] items-center gap-2 rounded-full border border-line bg-surface pl-4 pr-1 focus-within:ring-2 focus-within:ring-[var(--dna-focus,var(--im-accent-ink))]">
            <Search className="size-[18px] shrink-0 text-fg-muted" aria-hidden="true" />
            <label htmlFor="lms-search-m" className="sr-only">Buscar cursos, temas ou situações</label>
            <input ref={input} id="lms-search-m" type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Buscar cursos, temas ou situações…" className={field} />
            <button type="button" aria-label="Fechar busca" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--dna-focus,var(--im-accent-ink))]">
              <X className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
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

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tab =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-[current=page]:bg-fg/5 aria-[current=page]:text-fg';

const TABS = [
  { href: '/estudio/configuracoes/alunos', label: 'Alunos › Importar CSV', testId: 'cfg-alunos' },
  { href: '/estudio/configuracoes/integracoes', label: 'Integrações › Tokens', testId: 'cfg-integracoes' },
  { href: '/estudio/configuracoes/integracoes/webhooks', label: 'Integrações › Webhooks', testId: 'cfg-webhooks' },
  { href: '/estudio/configuracoes/relatorios', label: 'Relatórios › Progresso', testId: 'cfg-relatorios' },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Configurações">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={tab} aria-current={path === t.href ? 'page' : undefined} data-testid={t.testId}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

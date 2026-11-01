import Link from 'next/link';
import { LEGAL_DOCS, LEGAL_ORDER, type LegalDocId } from '@/lib/legal/documents';
import { cn } from '@/lib/utils';

/**
 * Links para os quatro textos públicos (privacidade, termos, cookies, segurança). Usado no rodapé da área do aluno, no fim do
 * player, na tela de entrada e nas próprias páginas. `newTab`: dentro de uma aula, abre em outra aba para não tirar a pessoa dela.
 */
export function LegalLinks({ className, current, newTab = false, only, align = 'center' }: { className?: string; current?: LegalDocId; newTab?: boolean; only?: LegalDocId[]; align?: 'start' | 'center' }) {
  const ids = only ?? LEGAL_ORDER;
  return (
    <nav aria-label="Privacidade e termos" className={className} data-testid="legal-links">
      <ul className={cn('flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm', align === 'center' ? 'justify-center' : 'justify-start')}>
        {ids.map((id) => {
          const d = LEGAL_DOCS[id];
          const isCurrent = current === id;
          return (
            <li key={id}>
              <Link
                href={d.route}
                prefetch={false}
                title={d.title}
                {...(isCurrent ? { 'aria-current': 'page' as const } : {})}
                {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-2 text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent',
                  isCurrent && 'font-semibold text-fg',
                )}
              >
                {d.label}
                {newTab ? <span className="sr-only"> (abre em outra aba)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

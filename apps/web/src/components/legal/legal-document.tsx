import Link from 'next/link';
import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '@/lib/legal/markdown';
import { LEGAL_LINK_MAP } from '@/lib/legal/documents';
import { cn } from '@/lib/utils';

/**
 * Renderiza o markdown dos textos públicos com elementos React (nada de HTML cru: ver lib/legal/markdown.ts).
 * Marcadores como [A CONFIRMAR: …], [PENDENTE ATÉ ESTAR NO AR: …] e [DATA DE VIGÊNCIA] aparecem exatamente como escritos.
 */
function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return n.v;
      case 'strong':
        return <strong key={i} className="font-semibold text-fg"><Inlines nodes={n.c} /></strong>;
      case 'em':
        return <em key={i}><Inlines nodes={n.c} /></em>;
      case 'code':
        return <code key={i} className="rounded bg-fg/8 px-1.5 py-0.5 font-mono text-[0.9em] break-words">{n.v}</code>;
      case 'link': {
        const external = /^https:/i.test(n.href);
        const mail = /^mailto:/i.test(n.href);
        const cls = 'font-medium text-accent underline underline-offset-4 decoration-accent/40 hover:decoration-accent focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent break-words';
        if (external || mail) return <a key={i} href={n.href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><Inlines nodes={n.c} />{external ? <span className="sr-only"> (abre em outra aba)</span> : null}</a>;
        if (n.href.startsWith('#')) return <a key={i} href={n.href} className={cls}><Inlines nodes={n.c} /></a>;
        return <Link key={i} href={n.href} prefetch={false} className={cls}><Inlines nodes={n.c} /></Link>;
      }
    }
  });
}

const HEADING = {
  1: 'mt-0 text-[clamp(1.75rem,1.3rem+1.8vw,2.5rem)] font-bold leading-tight text-fg',
  2: 'mt-12 border-t border-line pt-8 text-[clamp(1.35rem,1.15rem+0.9vw,1.75rem)] font-bold leading-snug text-fg',
  3: 'mt-8 text-xl font-semibold leading-snug text-fg',
  4: 'mt-6 text-lg font-semibold leading-snug text-fg',
} as const;

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'heading': {
      const Tag = (`h${b.level}`) as 'h1' | 'h2' | 'h3' | 'h4';
      return <Tag id={b.id} className={cn('scroll-mt-24', HEADING[b.level])}><Inlines nodes={b.c} /></Tag>;
    }
    case 'p':
      return <p className="mt-4"><Inlines nodes={b.c} /></p>;
    case 'ul':
      return (
        <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-fg-muted">
          {b.items.map((it, i) => <li key={i} className="pl-1"><Inlines nodes={it} /></li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol className="mt-4 list-decimal space-y-2 pl-6 marker:text-fg-muted">
          {b.items.map((it, i) => <li key={i} className="pl-1"><Inlines nodes={it} /></li>)}
        </ol>
      );
    case 'quote':
      return <blockquote className="mt-4 border-l-4 border-line-strong pl-4 text-fg-muted"><Inlines nodes={b.c} /></blockquote>;
    case 'hr':
      return <hr className="my-8 border-line" />;
    case 'table':
      return (
        // a tabela rola dentro da própria caixa no celular, sem alargar a página; a caixa é focável para rolar pelo teclado
        <div role="region" aria-label="Tabela" tabIndex={0} className="mt-5 overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[15px] leading-relaxed">
            <thead className="bg-fg/5">
              <tr>
                {b.head.map((h, i) => <th key={i} scope="col" className="border-b border-line px-3 py-2.5 font-semibold text-fg"><Inlines nodes={h} /></th>)}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="align-top odd:bg-transparent even:bg-fg/[0.03]">
                  {r.map((c, ci) => <td key={ci} className="border-t border-line px-3 py-2.5"><Inlines nodes={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function LegalDocument({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source, LEGAL_LINK_MAP);
  return (
    <div className={cn('text-[17px] leading-[1.7] text-fg/90', className)} data-testid="legal-document">
      {blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </div>
  );
}

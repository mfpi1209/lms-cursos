import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegalDocument } from '@/components/legal/legal-document';
import { LEGAL_DOCS, LEGAL_LINK_MAP, LEGAL_ORDER } from './documents';
import { readLegalSource } from './source';
import { inlineToText, parseInline, parseMarkdown, safeHref } from './markdown';

const html = (md: string) => renderToStaticMarkup(createElement(LegalDocument, { source: md }));

describe('leitor de markdown dos textos legais', () => {
  it('títulos com id, listas, negrito, código e tabelas', () => {
    const b = parseMarkdown('# Título um\n\nTexto com **negrito** e `código`.\n\n## Seção\n\n- um\n- dois\n\n1. a\n2. b\n\n| A | B |\n| --- | --- |\n| 1 | `x\\|y` |\n| 2 | 3 |\n');
    expect(b.map((x) => x.t)).toEqual(['heading', 'p', 'heading', 'ul', 'ol', 'table']);
    expect(b[0]).toMatchObject({ t: 'heading', level: 1, id: 'titulo-um' });
    const t = b[5]!;
    expect(t.t === 'table' && t.rows).toHaveLength(2);
  });

  it('nunca gera HTML: marcação no texto aparece como texto', () => {
    const out = html('Olá <script>alert(1)</script> <img src=x onerror=alert(1)> e [clique](javascript:alert(1)) e [ok](https://exemplo.com).');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('clique');
    expect(out).toContain('href="https://exemplo.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('links: ./x.md vira a rota; âncora preservada; destino desconhecido vira texto', () => {
    expect(safeHref('./politica-de-privacidade.md', LEGAL_LINK_MAP)).toBe('/privacidade');
    expect(safeHref('./termos-de-uso.md#cadastro', LEGAL_LINK_MAP)).toBe('/termos#cadastro');
    expect(safeHref('./avaliacao-de-impacto.md', LEGAL_LINK_MAP)).toBeNull();
    expect(safeHref('//evil.com', LEGAL_LINK_MAP)).toBeNull();
    expect(safeHref('mailto:contato@dnawork.ai')).toBe('mailto:contato@dnawork.ai');
    expect(inlineToText(parseInline('[interno](./avaliacao-de-impacto.md)', LEGAL_LINK_MAP))).toBe('interno');
  });

  it('marcadores [A CONFIRMAR…] e [PENDENTE…] ficam visíveis como escritos', () => {
    const out = html('[PENDENTE ATÉ ESTAR NO AR: algo.] e [A CONFIRMAR: prazo] e [DATA DE VIGÊNCIA]');
    expect(out).toContain('[PENDENTE ATÉ ESTAR NO AR: algo.]');
    expect(out).toContain('[A CONFIRMAR: prazo]');
    expect(out).toContain('[DATA DE VIGÊNCIA]');
  });
});

describe('os quatro textos públicos', () => {
  for (const id of LEGAL_ORDER) {
    it(`${id}: existe, vira árvore e todos os links .md apontam para uma página pública`, () => {
      const doc = LEGAL_DOCS[id];
      const src = readLegalSource(doc);
      expect(src.length).toBeGreaterThan(500);
      const blocks = parseMarkdown(src, LEGAL_LINK_MAP);
      expect(blocks[0]).toMatchObject({ t: 'heading', level: 1 });
      // nenhum link relativo para .md ficou sem rota (seria texto morto)
      const mdLinks = [...src.matchAll(/\]\((\.\/[a-z0-9-]+\.md)(#[^)]*)?\)/g)].map((m) => m[1]!.slice(2));
      for (const f of mdLinks) expect(LEGAL_LINK_MAP[f], `${id} liga para ${f}`).toBeTruthy();
      const out = html(src);
      expect(out).not.toMatch(/\]\(\.\//);
      // o texto original dos marcadores não é perdido
      expect((out.match(/\[PENDENTE ATÉ ESTAR NO AR/g) ?? []).length).toBe((src.match(/\[PENDENTE ATÉ ESTAR NO AR/g) ?? []).length);
      expect((out.match(/\[A CONFIRMAR/g) ?? []).length).toBe((src.match(/\[A CONFIRMAR/g) ?? []).length);
    });
  }
});

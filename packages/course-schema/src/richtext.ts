import { z } from 'zod';

/**
 * Documento de texto rico compatível com o JSON do Tiptap, restrito a um
 * conjunto pequeno de nós e marcas. Qualquer outra estrutura é rejeitada na
 * validação — o conteúdo nunca é HTML arbitrário.
 */
const MarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
]);

const TextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(5000),
  marks: z.array(MarkSchema).max(2).optional(),
});

const ParagraphSchema = z.object({
  type: z.literal('paragraph'),
  content: z.array(TextNodeSchema).max(200).optional(),
});

const HeadingSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
  content: z.array(TextNodeSchema).max(50).optional(),
});

const ListItemSchema = z.object({
  type: z.literal('listItem'),
  content: z.array(ParagraphSchema).min(1).max(10),
});

const BulletListSchema = z.object({
  type: z.literal('bulletList'),
  content: z.array(ListItemSchema).min(1).max(30),
});

const OrderedListSchema = z.object({
  type: z.literal('orderedList'),
  content: z.array(ListItemSchema).min(1).max(30),
});

export const RichTextBlockSchema = z.discriminatedUnion('type', [
  ParagraphSchema,
  HeadingSchema,
  BulletListSchema,
  OrderedListSchema,
]);

export const RichTextDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(RichTextBlockSchema).max(200),
});

export type RichTextDocument = z.infer<typeof RichTextDocumentSchema>;
export type RichTextBlock = z.infer<typeof RichTextBlockSchema>;

const BULLET_RE = /^(?:[-*•–]|\d{1,2}[.)])\s+/;

/**
 * Converte texto simples em documento: parágrafos separados por linha em
 * branco; dentro de um parágrafo, linhas seguidas começando por "- ", "• ", "* "
 * (ou "1. ") viram uma lista (um item por linha), o que permite à IA escrever
 * tópicos (a cena "Dica") sem markdown.
 */
export function richTextFromPlain(text: string): RichTextDocument {
  const blocks = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const content: RichTextBlock[] = [];
  const paragraph = (lines: string[]) => {
    if (lines.length) content.push({ type: 'paragraph', content: [{ type: 'text', text: lines.join(' ') }] });
  };
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let plain: string[] = [];
    let items: string[] = [];
    let ordered = false;
    const flushList = () => {
      if (!items.length) return;
      const listItems = items.map((t) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }] }));
      content.push(ordered ? { type: 'orderedList', content: listItems } : { type: 'bulletList', content: listItems });
      items = [];
    };
    for (const line of lines) {
      const m = BULLET_RE.exec(line);
      // só vira lista quando há pelo menos duas linhas-tópico seguidas (um hífen isolado é texto)
      if (m && (items.length || lines.filter((l) => BULLET_RE.test(l)).length >= 2)) {
        if (!items.length) {
          paragraph(plain);
          plain = [];
          ordered = /^\d/.test(line);
        }
        items.push(line.slice(m[0].length).trim());
      } else {
        flushList();
        plain.push(line);
      }
    }
    flushList();
    paragraph(plain);
  }
  return { type: 'doc', content };
}

/** Extrai o texto puro de um documento (para buscas, prévias e validações). */
export function richTextToPlain(doc: RichTextDocument | undefined): string {
  if (!doc) return '';
  const out: string[] = [];
  for (const block of doc.content) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      out.push((block.content ?? []).map((t) => t.text).join(''));
    } else {
      for (const item of block.content) {
        out.push(
          item.content.map((p) => (p.content ?? []).map((t) => t.text).join('')).join(' '),
        );
      }
    }
  }
  return out.join('\n').trim();
}

export function isRichTextEmpty(doc: RichTextDocument | undefined): boolean {
  return richTextToPlain(doc).length === 0;
}

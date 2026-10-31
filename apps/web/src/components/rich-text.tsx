import type { RichTextDocument, RichTextBlock } from '@lms/course-schema';
import { cn } from '@/lib/utils';

function Inline({ content }: { content?: Array<{ text: string; marks?: Array<{ type: string }> }> }) {
  return (
    <>
      {(content ?? []).map((t, i) => {
        let el: React.ReactNode = t.text;
        for (const m of t.marks ?? []) {
          if (m.type === 'bold') el = <strong key={`b${i}`}>{el}</strong>;
          if (m.type === 'italic') el = <em key={`i${i}`}>{el}</em>;
        }
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: RichTextBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p><Inline content={block.content} /></p>;
    case 'heading':
      return block.attrs.level === 2 ? <h2><Inline content={block.content} /></h2> : <h3><Inline content={block.content} /></h3>;
    case 'bulletList':
    case 'orderedList': {
      const items = block.content.map((li, i) => (
        <li key={i}>{li.content.map((p, j) => <span key={j}><Inline content={p.content} /></span>)}</li>
      ));
      return block.type === 'bulletList' ? <ul>{items}</ul> : <ol>{items}</ol>;
    }
  }
}

/** Renderer sanitizado: só os blocos permitidos pelo schema viram elementos. */
export function RichText({ doc, className }: { doc: RichTextDocument | undefined; className?: string }) {
  if (!doc) return null;
  return (
    <div className={cn('prose-lms text-fg', className)}>
      {doc.content.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}

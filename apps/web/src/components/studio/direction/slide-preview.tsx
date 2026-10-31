import { Check } from 'lucide-react';
import type { Slide } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_ACCENT } from './direction-model';

/**
 * Prévia aproximada (HTML/CSS) de um slide da montagem. Escala com a caixa
 * onde está (unidades de container), então serve tanto na miniatura quanto no
 * animatic. A cor de destaque é a escolhida pelo autor no estilo de direção.
 */
export function SlidePreview({ slide, accent, framed = false, className }: { slide: Slide; accent?: string; framed?: boolean; className?: string }) {
  const color = /^#[0-9a-fA-F]{6}$/.test(accent ?? '') ? accent! : DEFAULT_SLIDE_ACCENT;
  const title = slide.title.trim();
  const bullets = slide.bullets.map((b) => b.trim()).filter(Boolean);
  const highlight = slide.highlight?.trim();
  const image = slide.imageAssetId ? `/api/assets/${slide.imageAssetId}` : null;
  const bold = slide.style === 'bold';

  const titleEl = (size: string) =>
    title ? (
      <p className={cn('font-display font-bold leading-tight', size)}>{title}</p>
    ) : (
      <p className={cn('font-display font-bold leading-tight opacity-50', size)}>Título do slide</p>
    );

  let body: React.ReactNode;
  if (slide.style === 'quote') {
    body = (
      <div className="flex h-full flex-col items-center justify-center px-[8cqw] text-center">
        <span className="font-display text-[16cqw] font-bold leading-[0.6]" style={{ color }} aria-hidden="true">“</span>
        <p className="mt-[2cqw] font-display text-[5.2cqw] font-semibold italic leading-snug text-fg">{highlight || title || 'Uma frase-chave para lembrar'}</p>
        {highlight && title && <p className="mt-[2cqw] text-[2.8cqw] text-fg-muted">{title}</p>}
      </div>
    );
  } else {
    body = (
      <div className={cn('flex h-full gap-[4cqw] py-[6cqw] pr-[6cqw]', bold ? 'pl-[6cqw]' : 'pl-[8cqw]')}>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2.4cqw]">
          {titleEl(bold ? 'text-[7cqw]' : 'text-[5.6cqw]')}
          {highlight && (
            <p className={cn('rounded-[1cqw] px-[2cqw] py-[1.2cqw] text-[3.6cqw] font-semibold leading-snug', bold ? 'bg-bg/15' : 'bg-surface-2')} style={bold ? undefined : { color }}>
              {highlight}
            </p>
          )}
          {bullets.length > 0 && (
            <ul className="space-y-[1.4cqw]">
              {bullets.map((b, i) => (
                <li key={i} className={cn('flex items-start gap-[1.6cqw] text-[3.2cqw] leading-snug', bold ? 'opacity-90' : 'text-fg-muted')}>
                  {slide.style === 'checklist' ? (
                    <span className="mt-[0.3cqw] grid h-[3.2cqw] w-[3.2cqw] shrink-0 place-items-center rounded-[0.6cqw] text-accent-fg" style={{ backgroundColor: color }} aria-hidden="true">
                      <Check className="h-[2.4cqw] w-[2.4cqw]" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className={cn('mt-[1.1cqw] h-[1.4cqw] w-[1.4cqw] shrink-0 rounded-full', bold && 'bg-accent-fg')} style={bold ? undefined : { backgroundColor: color }} aria-hidden="true" />
                  )}
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-[38%] shrink-0 rounded-[1.4cqw] object-cover" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('theme-video @container relative overflow-hidden', framed ? 'aspect-video w-full rounded-lg border border-line' : 'h-full w-full', bold ? 'text-accent-fg' : 'bg-surface text-fg', slide.style === 'quote' && 'bg-surface-2', className)}
      style={bold ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {!bold && slide.style !== 'quote' && <span className="absolute inset-y-[6cqw] left-[3cqw] w-[1.2cqw] rounded-full" style={{ backgroundColor: color }} />}
      {body}
    </div>
  );
}

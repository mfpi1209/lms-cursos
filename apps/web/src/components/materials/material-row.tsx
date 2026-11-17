import { Download, ExternalLink, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import { MATERIAL_CATEGORY_LABEL, formatBytes, materialHref, type CourseMaterial } from '@lms/course-schema';
import { cn } from '@/lib/utils';

const ICON = { pdf: FileText, image: ImageIcon, link: Link2 } as const;
const FORMAT = { pdf: 'PDF', image: 'Imagem', link: 'Link' } as const;

/** Uma linha de material: ícone (ou miniatura do infográfico), tipo, título, descrição, "Abrir" e "Baixar". */
export function MaterialRow({ m }: { m: CourseMaterial }) {
  const Icon = ICON[m.format];
  const meta = [MATERIAL_CATEGORY_LABEL[m.category], FORMAT[m.format], formatBytes(m.sizeBytes)].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-3 rounded-[14px] px-2 py-3 sm:gap-4 sm:px-3" data-testid={`material-${m.id}`}>
      {m.format === 'image' ? (
        // miniatura do infográfico (asset de imagem do workspace; leitura igual à das cenas)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={materialHref(m)} alt="" loading="lazy" className="size-14 shrink-0 rounded-[10px] border border-line object-cover object-top" />
      ) : (
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-strong">
          <Icon className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[18px] text-fg-muted">{meta}</p>
        <h4 className="mt-0.5 text-base font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{m.title}</h4>
        {m.description && <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-fg-muted">{m.description}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={materialHref(m)} target="_blank" rel="noreferrer" className={btn}>
            <ExternalLink className="size-4" aria-hidden="true" />
            Abrir<span className="sr-only"> {m.title}</span>
          </a>
          {m.format !== 'link' && (
            <a href={materialHref(m, { download: true })} download className={btn}>
              <Download className="size-4" aria-hidden="true" />
              Baixar<span className="sr-only"> {m.title}</span>
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

const btn = cn(
  'inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-line-strong px-3.5 text-sm font-medium text-fg',
  'hover:border-fg/40 hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
);

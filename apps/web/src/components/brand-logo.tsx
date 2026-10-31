import type { BrandPreset } from '@/config/brand';
import { cn } from '@/lib/utils';

/**
 * Logo da marca da plataforma (preset do workspace), no tema certo.
 * - Com logos no preset: as duas versões vão no HTML e o CSS mostra a clara ou a
 *   branca conforme `data-theme` em <html> (regras `.brand-logo-*` em globals.css),
 *   sem piscar na troca de tema e sem JavaScript.
 * - Sem logo (preset `lms`): a marca em texto, minúscula, com o ponto no acento.
 * Componente de servidor; sem estado.
 */
export function BrandLogo({ brand, height = 28, className, alt = brand.name }: { brand: BrandPreset; height?: number; className?: string; alt?: string }) {
  // alt vazio = decorativo (o link que envolve já tem o nome acessível)
  const a11y = alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true as const };
  if (!brand.logoLight || !brand.logoDark) {
    return (
      <span {...a11y} className={cn('whitespace-nowrap font-semibold leading-none tracking-[-0.035em] text-fg lowercase', className)} style={{ fontSize: height }}>
        {brand.wordmark}
        <span aria-hidden="true" className="text-accent">.</span>
      </span>
    );
  }
  const width = Math.round(height * (brand.logoRatio ?? 4));
  // o nome acessível fica no contêiner (uma das imagens está sempre com display:none).
  // A altura vai na variável `--logo-h` para o chamador poder reduzi-la por breakpoint (ex.: `max-sm:[--logo-h:20px]`).
  const common = { width, height, alt: '', decoding: 'async' as const, className: 'block h-full w-auto max-w-full select-none' };
  return (
    // a variável vai no contêiner externo (inline) e é lida no interno: assim uma classe do chamador no interno consegue sobrescrevê-la
    <span className="contents" style={{ ['--logo-h' as string]: `${height}px` }}>
      <span {...a11y} className={cn('inline-flex h-[var(--logo-h)] shrink-0 items-center', className)} data-testid="brand-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoLight} {...common} className={cn(common.className, 'brand-logo-light')} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoDark} {...common} className={cn(common.className, 'brand-logo-dark')} />
      </span>
    </span>
  );
}

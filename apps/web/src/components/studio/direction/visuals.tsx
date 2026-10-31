import { Blend, Circle, MoveLeft, MoveRight, Scissors, Square, Waves, Wind, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CameraMove, Framing, Layout, Transition } from './direction-model';

/**
 * Pequenos desenhos da direção, feitos só com divs e tokens: silhueta do
 * apresentador, ícone de enquadramento e mini-quadro 16:9 de cada layout.
 */

/** Silhueta (cabeça + ombros) que ocupa a caixa onde está. */
export function Silhouette({ className, tone = 'muted' }: { className?: string; tone?: 'muted' | 'faint' }) {
  const fill = tone === 'muted' ? 'bg-fg-muted/45' : 'bg-fg-faint/35';
  return (
    <span className={cn('absolute flex flex-col items-center justify-end overflow-hidden', className)} aria-hidden="true">
      <span className={cn('aspect-square w-[34%] rounded-full', fill)} />
      <span className={cn('mt-[4%] h-[38%] w-[78%] rounded-t-full', fill)} />
    </span>
  );
}

const HEAD: Record<Framing, string> = { wide: 'w-[28%]', medium: 'w-[42%]', close: 'w-[62%]', extreme_close: 'w-[88%]' };

/** Ícone do enquadramento: quanto maior a cabeça no quadro, mais fechado. */
export function FramingIcon({ framing, className }: { framing: Framing; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-3.5 w-5 shrink-0 items-end justify-center overflow-hidden rounded-[3px] border border-current', className)} aria-hidden="true">
      <span className={cn('mb-[-12%] aspect-square rounded-full bg-current opacity-70', HEAD[framing])} />
    </span>
  );
}

function SlideBlock({ className }: { className?: string }) {
  return (
    <span className={cn('absolute flex flex-col gap-[8%] rounded-[3px] border border-accent/50 bg-accent-soft p-[5%]', className)} aria-hidden="true">
      <span className="h-[14%] w-[70%] rounded-full bg-accent/70" />
      <span className="h-[9%] w-[85%] rounded-full bg-accent/35" />
      <span className="h-[9%] w-[60%] rounded-full bg-accent/35" />
    </span>
  );
}

/** Figura inteira caminhando (cabeça, corpo, pernas) com linhas de movimento e seta: cena em movimento. */
function WalkingFigure() {
  return (
    <>
      <span className="absolute left-[12%] top-[38%] flex flex-col gap-[3px]" aria-hidden="true">
        <span className="h-[2px] w-[14px] rounded-full bg-paid/70" />
        <span className="ml-[4px] h-[2px] w-[10px] rounded-full bg-paid/50" />
        <span className="h-[2px] w-[14px] rounded-full bg-paid/70" />
      </span>
      <span className="absolute bottom-[10%] left-[38%] top-[14%] flex w-[18%] flex-col items-center" aria-hidden="true">
        <span className="aspect-square w-[45%] rounded-full bg-fg-muted/55" />
        <span className="mt-[6%] h-[38%] w-[55%] rounded-t-[40%] bg-fg-muted/55" />
        <span className="relative h-[34%] w-full">
          <span className="absolute left-[30%] top-0 h-full w-[18%] origin-top rotate-[18deg] rounded-full bg-fg-muted/55" />
          <span className="absolute right-[30%] top-0 h-full w-[18%] origin-top -rotate-[18deg] rounded-full bg-fg-muted/55" />
        </span>
      </span>
      <span className="absolute right-[10%] top-[44%] h-[2px] w-[22%] bg-paid" aria-hidden="true" />
      <span className="absolute right-[8%] top-[calc(44%-3px)] h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-paid" aria-hidden="true" />
    </>
  );
}

/** Mini-quadro 16:9 do layout do plano. */
export function LayoutDiagram({ layout, className }: { layout: Layout; className?: string }) {
  return (
    <span className={cn('relative block aspect-video w-full overflow-hidden rounded-md border border-line-strong bg-surface', className)} aria-hidden="true">
      {layout === 'presenter' && <Silhouette className="inset-x-[25%] bottom-0 top-[14%]" />}
      {layout === 'lower_third' && (
        <>
          <Silhouette className="inset-x-[25%] bottom-0 top-[14%]" />
          <span className="absolute bottom-[12%] left-[6%] h-[14%] w-[48%] rounded-[2px] bg-accent" />
        </>
      )}
      {layout === 'presenter_slide_right' && (
        <>
          <Silhouette className="bottom-0 left-[2%] top-[18%] w-[42%]" />
          <SlideBlock className="bottom-[12%] right-[5%] top-[12%] w-[48%]" />
        </>
      )}
      {layout === 'presenter_slide_left' && (
        <>
          <SlideBlock className="bottom-[12%] left-[5%] top-[12%] w-[48%]" />
          <Silhouette className="bottom-0 right-[2%] top-[18%] w-[42%]" />
        </>
      )}
      {layout === 'slide_with_pip' && (
        <>
          <SlideBlock className="inset-[8%]" />
          <span className="absolute bottom-[6%] right-[5%] h-[38%] w-[26%] overflow-hidden rounded-[3px] border border-line-strong bg-surface-2">
            <Silhouette className="inset-x-[8%] bottom-0 top-[12%]" />
          </span>
        </>
      )}
      {layout === 'slide' && <SlideBlock className="inset-[8%]" />}
      {layout === 'card' && (
        <>
          <span className="absolute inset-0 rounded-[2px] bg-[#1D1E4C]" />
          <span className="absolute left-[10%] top-[22%] h-[14%] w-[55%] rounded-[2px] bg-white/90" />
          <span className="absolute left-[10%] top-[42%] h-[5%] w-[16%] rounded-[2px] bg-[#FF7A08]" />
          <span className="absolute left-[10%] top-[56%] h-[7%] w-[62%] rounded-[2px] bg-white/60" />
          <span className="absolute left-[10%] top-[70%] h-[7%] w-[48%] rounded-[2px] bg-white/60" />
        </>
      )}
      {layout === 'presenter_panel' && (
        <>
          <Silhouette className="bottom-0 right-[14%] top-[14%] w-[34%]" />
          <span className="absolute inset-y-0 left-0 w-[48%] rounded-l-[2px] bg-gradient-to-r from-[#0F1030] via-[#0F1030]/90 to-transparent" />
          <span className="absolute left-[8%] top-[16%] h-[4%] w-[20%] rounded-[2px] bg-[#FF7A08]" />
          <span className="absolute left-[8%] top-[26%] h-[11%] w-[32%] rounded-[2px] bg-white/90" />
          <span className="absolute left-[8%] top-[46%] h-[11%] w-[34%] rounded-[2px] bg-white/25" />
          <span className="absolute left-[8%] top-[62%] h-[11%] w-[34%] rounded-[2px] bg-white/25" />
        </>
      )}
      {layout === 'presenter_chips' && (
        <>
          <Silhouette className="bottom-0 left-[8%] top-[14%] w-[34%]" />
          <span className="absolute left-[50%] top-[14%] h-[66%] w-[38%] rounded-[3px] bg-[#1D1E4C]/90" />
          <span className="absolute left-[55%] top-[20%] h-[9%] w-[26%] rounded-[2px] bg-white/90" />
          <span className="absolute left-[55%] top-[38%] h-[10%] w-[24%] rounded-full bg-white" />
          <span className="absolute left-[55%] top-[52%] h-[10%] w-[20%] rounded-full bg-white ring-1 ring-[#FF7A08]" />
          <span className="absolute left-[55%] top-[66%] h-[10%] w-[22%] rounded-full bg-white/30" />
        </>
      )}
      {layout === 'cinematic' && <WalkingFigure />}
    </span>
  );
}

const MOVE_ICON: Record<CameraMove, typeof Square> = { static: Square, push_in: ZoomIn, pull_out: ZoomOut, pan_left: MoveLeft, pan_right: MoveRight, drift: Waves };

export function CameraMoveIcon({ move, className }: { move: CameraMove; className?: string }) {
  const Icon = MOVE_ICON[move];
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden="true" />;
}

const TRANSITION_ICON: Record<Transition, typeof Square> = { cut: Scissors, crossfade: Blend, whip: Wind, dip_to_color: Circle };

export function TransitionIcon({ transition, className }: { transition: Transition; className?: string }) {
  const Icon = TRANSITION_ICON[transition];
  return <Icon className={cn('h-3 w-3 shrink-0', className)} aria-hidden="true" />;
}

'use client';

import * as React from 'react';
import type { Presentation, SceneDirection } from '@lms/course-schema';
import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cameraLabel, FRAMING_LABEL, LAYOUT_LABEL, MOVE_LABEL, MOVE_SHORT, shotSeconds, TRANSITION_LABEL } from './direction-model';
import { CameraMoveIcon, FramingIcon, LayoutDiagram, TransitionIcon } from './visuals';

/** px por segundo estimado; cada cartão tem largura mínima para caber o essencial. */
const PX_PER_SECOND = 26;
const MIN_W = 148;
const MAX_W = 380;

/**
 * Linha do tempo horizontal dos planos. A largura de cada cartão é
 * proporcional à duração estimada da fala; entre os cartões, a transição.
 *
 * Cada cartão e marcador é `relative`: os textos só para leitor de tela
 * (`sr-only`, posicionados em absoluto) ficam contidos neles e não alargam a
 * página no celular.
 */
export function ShotTimeline({
  direction,
  presentation,
  selectedId,
  onSelect,
  activeId,
}: {
  direction: SceneDirection;
  presentation: Presentation;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** plano em exibição no animatic */
  activeId?: string | null;
}) {
  return (
    <ol className="relative flex items-stretch overflow-x-auto pb-2 [scrollbar-width:thin]" aria-label="Planos da cena, em ordem">
      {direction.shots.map((shot, i) => {
        const secs = shotSeconds(shot);
        const width = Math.min(MAX_W, Math.max(MIN_W, Math.round(secs * PX_PER_SECOND)));
        const selected = shot.id === selectedId;
        const playing = shot.id === activeId;
        const camera = cameraLabel(presentation, shot.cameraId);
        const move = MOVE_LABEL[shot.cameraMove];
        return (
          <li key={shot.id} className="relative flex shrink-0 items-stretch">
            {i > 0 && (
              <span
                className="relative flex w-7 shrink-0 flex-col items-center justify-center gap-1 text-fg-faint"
                title={`Transição: ${TRANSITION_LABEL[shot.transitionIn]}`}
              >
                <span className="h-full w-px bg-line-strong" aria-hidden="true" />
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-bg">
                  <TransitionIcon transition={shot.transitionIn} />
                </span>
                <span className="sr-only">Transição: {TRANSITION_LABEL[shot.transitionIn]}</span>
                <span className="h-full w-px bg-line-strong" aria-hidden="true" />
              </span>
            )}
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : shot.id)}
              data-testid={`shot-${shot.id}`}
              style={{ width }}
              className={cn(
                'relative flex scroll-mt-24 flex-col gap-1.5 rounded-xl border bg-surface p-2 text-left transition-colors',
                selected ? 'border-accent ring-2 ring-accent-soft' : 'border-line hover:border-line-strong',
                playing && 'border-accent',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-fg">
                  <span className="tabular-nums text-fg-faint">{i + 1}</span>
                  <FramingIcon framing={shot.framing} className="text-fg-muted" />
                  <span className="truncate">{FRAMING_LABEL[shot.framing]}</span>
                </span>
                <span className="shrink-0 tabular-nums text-fg-faint">≈ {Math.round(secs)} s</span>
              </span>
              {shot.layout === 'cinematic' && (
                <span className="inline-flex w-fit items-center rounded-full bg-paid-soft px-2 py-0.5 text-[11px] font-semibold text-paid" title="Cena em movimento: cobrada à parte e mais cara">
                  Em movimento
                </span>
              )}
              <span className="flex items-center gap-2">
                <LayoutDiagram layout={shot.layout} className="w-16 shrink-0" />
                <span className="min-w-0 space-y-0.5 text-xs text-fg-muted">
                  {/* câmera e movimento: ícone + rótulo curto que cabe; o nome completo fica no title e para leitores de tela */}
                  <span className="flex items-center gap-1" title={`Câmera: ${camera}`}>
                    <Video className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate" aria-hidden="true">{camera}</span>
                    <span className="sr-only">Câmera: {camera}</span>
                  </span>
                  {shot.layout === 'cinematic' ? (
                    <span className="block truncate" title={shot.cinematic?.setting || shot.cinematic?.prompt || 'Cena em movimento'}>{shot.cinematic?.setting || 'Sem fala na imagem'}</span>
                  ) : (
                    <span className="flex items-center gap-1" title={`Movimento: ${move}`}>
                      <CameraMoveIcon move={shot.cameraMove} />
                      <span className="truncate" aria-hidden="true">{MOVE_SHORT[shot.cameraMove]}</span>
                      <span className="sr-only">Movimento: {move}</span>
                    </span>
                  )}
                </span>
              </span>
              <span className="line-clamp-2 text-xs leading-snug text-fg">{shot.line}</span>
              <span className="sr-only">Layout: {LAYOUT_LABEL[shot.layout]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

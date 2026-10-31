'use client';

import { useEffect, useState } from 'react';
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clock } from './theme';
import type { SceneVideo } from './use-scene-video';

const ICON_BTN =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--im-ctrl-fg)] hover:bg-[var(--im-ctrl-hover)] focus-visible:outline-3! focus-visible:outline-offset-0! focus-visible:outline-[var(--im-accent-ink)]!';

/**
 * Barra de controles própria (os controles nativos ficam desligados no palco):
 * tocar/pausar, posição com o acento, tempo, legendas, volume e tela cheia (do
 * palco inteiro, com as respostas). No celular: só tocar, posição, tempo,
 * legendas e tela cheia.
 */
export function ControlBar({ video, fullscreenTarget, className, skip }: {
  video: SceneVideo;
  fullscreenTarget: React.RefObject<HTMLElement | null>;
  className?: string;
  /** atalho "Pular vídeo"/"Responder agora" na barra (desktop), enquanto o vídeo ocupa o palco inteiro */
  skip?: { label: string; onClick: () => void; testId: string };
}) {
  const [isFull, setIsFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  useEffect(() => {
    setCanFull(!!document.fullscreenEnabled);
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void fullscreenTarget.current?.requestFullscreen?.().catch(() => undefined);
  };

  const { phase, currentTime, duration } = video;
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playing = phase === 'playing';
  const volPct = video.muted ? 0 : Math.round(video.volume * 100);

  return (
    <div
      role="group"
      aria-label="Controles do vídeo"
      data-testid="video-controls"
      className={cn('flex min-h-14 items-center gap-1 rounded-[16px] border border-[var(--im-ctrl-line)] bg-[var(--im-ctrl-bg)] px-2 text-[var(--im-ctrl-fg)] backdrop-blur-[12px] md:min-h-16 md:gap-4 md:px-5', className)}
    >
      <button
        type="button"
        className={ICON_BTN}
        onClick={video.togglePlay}
        aria-label={playing ? 'Pausar' : phase === 'ended' ? 'Ver de novo' : 'Assistir'}
        data-testid="video-play-toggle"
      >
        {playing ? <Pause className="size-7 fill-current" strokeWidth={0} aria-hidden="true" /> : phase === 'ended' ? <RotateCcw className="size-6" strokeWidth={2.5} aria-hidden="true" /> : <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />}
      </button>
      <input
        type="range"
        aria-label="Posição do vídeo"
        aria-valuetext={`${clock(currentTime)} de ${clock(duration)}`}
        min={0}
        max={duration > 0 ? duration : 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => video.seek(Number(e.target.value))}
        className="im-range min-w-0 flex-1"
        style={{ ['--im-fill' as string]: `${pct}%` }}
      />
      <span className="shrink-0 px-1 text-[13px] tabular-nums text-[var(--im-ctrl-muted)] md:px-4 md:text-[15px]">
        {clock(currentTime)} / {clock(duration)}
      </span>
      {skip && (
        <button
          type="button"
          onClick={skip.onClick}
          data-testid={skip.testId}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[15px] font-semibold text-[var(--im-ctrl-fg)] underline decoration-[var(--im-ctrl-muted)] underline-offset-4 hover:bg-[var(--im-ctrl-hover)] focus-visible:outline-3! focus-visible:outline-offset-0! focus-visible:outline-[var(--im-accent-ink)]! max-md:hidden"
        >
          {skip.label}
        </button>
      )}
      {video.hasCaptions && (
        <button
          type="button"
          className={cn(ICON_BTN, 'md:w-auto md:gap-2 md:px-3')}
          onClick={video.toggleCaptions}
          aria-pressed={video.captionsOn}
          aria-label="Legendas"
          title={video.captionsOn ? 'Desativar legendas' : 'Ativar legendas'}
          data-testid="video-captions-toggle"
        >
          {/* "CC" em caixa: cheio = ligadas, contorno = desligadas */}
          <span
            aria-hidden="true"
            className={cn(
              'grid h-[22px] w-[30px] place-items-center rounded-[5px] border-2 text-[11px] font-bold leading-none tracking-tight',
              video.captionsOn ? 'border-[var(--im-ctrl-fg)] bg-[var(--im-ctrl-fg)] text-[var(--im-ctrl-solid)]' : 'border-[var(--im-ctrl-muted)] text-[var(--im-ctrl-fg)]',
            )}
          >
            CC
          </span>
          {/* no desktop, o nome por extenso: "Legendas" (o botão é fácil de achar) */}
          <span aria-hidden="true" className="text-[14px] font-medium max-md:hidden">Legendas</span>
        </button>
      )}
      {/* volume: o controle deslizante só aparece com o ponteiro ou o foco */}
      <div className="group/vol relative hidden items-center md:flex">
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={video.muted ? 0 : video.volume}
          onChange={(e) => video.setVolume(Number(e.target.value))}
          className="im-range w-0 opacity-0 transition-[width,opacity] duration-150 focus-visible:w-20 focus-visible:opacity-100 group-hover/vol:w-20 group-hover/vol:opacity-100 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100"
          style={{ ['--im-fill' as string]: `${volPct}%` }}
        />
        <button type="button" className={ICON_BTN} onClick={video.toggleMute} aria-pressed={video.muted} aria-label={video.muted ? 'Ativar som' : 'Silenciar'}>
          {video.muted ? <VolumeX className="size-7" strokeWidth={2} aria-hidden="true" /> : <Volume2 className="size-7" strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>
      {canFull && (
        <button type="button" className={ICON_BTN} onClick={toggleFull} aria-label={isFull ? 'Sair da tela cheia' : 'Tela cheia'}>
          {isFull ? <Minimize className="size-6" strokeWidth={2.25} aria-hidden="true" /> : <Maximize className="size-6" strokeWidth={2.25} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

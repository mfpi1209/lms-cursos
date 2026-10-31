'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlatformBumper } from './types';
import { prefersReducedMotion } from './use-player-session';

/**
 * Vinheta da marca no fim da aula: toca o MP4 gerado pelo construtor
 * (16:9; 9:16 em telas em pé quando houver). Autoplay sem som como reserva; com
 * som quando o aluno já interagiu (`gesture`) e o navegador permitir. "Pular"
 * quando `skippable`. Nunca bloqueia o encerramento nem o roteiro: o painel do
 * fim aparece junto. Com `prefers-reduced-motion`, mostra um cartão parado com
 * o logo em vez da animação.
 */
export function BrandBumper({
  bumper,
  gesture,
  onDone,
  variant = 'stage',
  className,
}: {
  bumper: PlatformBumper;
  /** o aluno já interagiu nesta sessão (autoplay com som permitido) */
  gesture: boolean;
  /** terminou ou foi pulada */
  onDone?: () => void;
  /** `stage`: preenche a área de mídia do palco; `card`: bloco 16:9 com bordas (player clássico) */
  variant?: 'stage' | 'card';
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [muted, setMuted] = useState(!gesture);
  const [status, setStatus] = useState<'playing' | 'ended' | 'skipped' | 'failed'>('playing');
  const doneRef = useRef(false);
  const finish = useCallback((how: 'ended' | 'skipped' | 'failed') => {
    setStatus(how);
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const mq = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(orientation: portrait) and (max-width: 767px)') : null;
    if (!mq) return;
    const apply = () => setPortrait(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const useVertical = portrait && !!bumper.assetIdVertical;
  const src = `/api/assets/${encodeURIComponent(useVertical ? bumper.assetIdVertical! : bumper.assetId)}`;

  // Autoplay: com som quando houve gesto; recusado pelo navegador → tenta sem som.
  useEffect(() => {
    if (reduced) {
      finish('ended');
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    const tryPlay = async () => {
      v.muted = !gesture;
      setMuted(!gesture);
      try {
        await v.play();
      } catch {
        if (cancelled) return;
        v.muted = true;
        setMuted(true);
        try {
          await v.play();
        } catch {
          if (!cancelled) finish('failed');
        }
      }
    };
    void tryPlay();
    return () => {
      cancelled = true;
    };
  }, [reduced, gesture, src, finish]);

  if (reduced) {
    // movimento reduzido: cartão parado com o logo (sem vídeo, sem som)
    const logo = bumper.logoDark ?? bumper.logoLight;
    return (
      <div data-testid="brand-bumper" data-bumper-static="true" className={cn('flex h-full w-full items-center justify-center bg-[var(--im-media-bg)]', variant === 'card' && 'aspect-video rounded-2xl border border-line', className)}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={bumper.brandName ?? 'Marca'} className="w-[42%] max-w-[420px]" />
        ) : (
          <span className="text-xl font-bold text-fg">{bumper.brandName ?? ''}</span>
        )}
      </div>
    );
  }

  const skipped = status === 'skipped';
  return (
    <div
      data-testid="brand-bumper"
      data-bumper-status={status}
      data-bumper-aspect={useVertical ? '9:16' : '16:9'}
      style={bumper.bg ? { backgroundColor: bumper.bg } : undefined}
      className={cn('relative h-full w-full overflow-hidden bg-[var(--im-media-bg)]', variant === 'card' && cn('rounded-2xl border border-line', useVertical ? 'mx-auto aspect-[9/16] max-h-[60vh]' : 'aspect-video'), className)}
    >
      {!skipped && (
        <video
          ref={videoRef}
          src={src}
          muted={muted}
          playsInline
          preload="auto"
          aria-label={`Vinheta ${bumper.brandName ?? 'da marca'}`}
          onEnded={() => finish('ended')}
          onError={() => finish('failed')}
          // palco: cabe inteira na área (o fundo da própria vinheta preenche o resto); cartão 16:9: cobre
          className={cn('h-full w-full', variant === 'stage' ? 'object-contain' : 'object-cover')}
        />
      )}
      {status === 'playing' && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-end gap-2 md:inset-x-6 md:bottom-6">
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
            aria-label={muted ? 'Ativar o som da vinheta' : 'Silenciar a vinheta'}
            aria-pressed={!muted}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full bg-[#050A14]/70 text-white backdrop-blur-sm hover:bg-[#050A14]/85"
          >
            {muted ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
          </button>
          {bumper.skippable && (
            <button
              type="button"
              data-testid="bumper-skip"
              onClick={() => {
                videoRef.current?.pause();
                finish('skipped');
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-[#050A14]/70 px-4 text-sm font-semibold text-white backdrop-blur-sm hover:bg-[#050A14]/85"
            >
              Pular
            </button>
          )}
        </div>
      )}
    </div>
  );
}

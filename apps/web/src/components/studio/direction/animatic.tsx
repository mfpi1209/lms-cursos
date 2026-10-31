'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import { chipLabel, type Presentation, type SceneDirection, type Shot } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  cameraLabel,
  cameraPreviewUrl,
  DEFAULT_SLIDE_ACCENT,
  emptySlide,
  FRAMING_LABEL,
  framingZoom,
  layoutHasSlide,
  shotCamera,
  shotSeconds,
  type CameraMove,
} from './direction-model';
import { SlidePreview } from './slide-preview';
import { Silhouette } from './visuals';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function moveFrames(move: CameraMove, z: number): Keyframe[] | null {
  const s = (k: number) => `scale(${(z * k).toFixed(3)})`;
  switch (move) {
    case 'push_in':
      return [{ transform: s(1) }, { transform: s(1.12) }];
    case 'pull_out':
      return [{ transform: s(1.12) }, { transform: s(1) }];
    case 'pan_left':
      return [{ transform: `translateX(-4%) ${s(1.08)}` }, { transform: `translateX(4%) ${s(1.08)}` }];
    case 'pan_right':
      return [{ transform: `translateX(4%) ${s(1.08)}` }, { transform: `translateX(-4%) ${s(1.08)}` }];
    case 'drift':
      return [{ transform: `translate(-1%, 0.6%) ${s(1.04)}` }, { transform: `translate(1%, -0.6%) ${s(1.07)}` }];
    default:
      return null;
  }
}

/**
 * Animatic leve, no navegador, da lista de planos: imagem de prévia do
 * apresentador com zoom pelo enquadramento, movimento de câmera ao longo da
 * duração estimada, slides e letreiro em HTML, transições como fades e a fala
 * como legenda. Sem áudio. Com movimento reduzido, só avança de plano em plano.
 * Cena em movimento: a prévia do apresentador desliza devagar de lado, com a
 * etiqueta "em movimento" (o vídeo real é gerado por prompt, sem fala).
 */
export function Animatic({
  direction,
  presentation,
  onClose,
  onActive,
}: {
  direction: SceneDirection;
  presentation: Presentation;
  onClose: () => void;
  onActive?: (shotId: string | null) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const shots = direction.shots;
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(0);
  const safeIndex = Math.min(index, shots.length - 1);
  const shot = shots[safeIndex]!;
  const dur = shotSeconds(shot) * 1000;
  const total = shots.reduce((s, x) => s + shotSeconds(x), 0);

  // relógio
  React.useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const dt = t - last;
      last = t;
      setElapsed((e) => e + dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // fim do plano: avança ou para no último
  React.useEffect(() => {
    if (elapsed < dur) return;
    if (safeIndex < shots.length - 1) {
      setIndex(safeIndex + 1);
      setElapsed(0);
    } else {
      setPlaying(false);
      setElapsed(dur);
    }
  }, [elapsed, dur, safeIndex, shots.length]);

  React.useEffect(() => {
    onActive?.(shot.id);
  }, [shot.id, onActive]);
  React.useEffect(() => () => onActive?.(null), [onActive]);

  const go = (i: number) => {
    setIndex(Math.max(0, Math.min(shots.length - 1, i)));
    setElapsed(0);
  };
  const restart = () => {
    go(0);
    setPlaying(true);
  };
  const ended = !playing && safeIndex === shots.length - 1 && elapsed >= dur;

  return (
    <section aria-label="Animatic da cena" className="space-y-3 rounded-xl border border-line bg-bg p-3" data-testid="animatic">
      <div className="mx-auto w-full max-w-2xl">
        <Stage key={`${safeIndex}-${shot.id}`} shot={shot} presentation={presentation} playing={playing} reduced={reduced} durationMs={dur} startAt={elapsed} />
      </div>

      {/* progresso: um segmento por plano, proporcional à duração */}
      <div className="mx-auto flex w-full max-w-2xl gap-0.5" aria-hidden="true">
        {shots.map((s, i) => {
          const w = (shotSeconds(s) / total) * 100;
          const fill = i < safeIndex ? 100 : i === safeIndex ? Math.min(100, (elapsed / dur) * 100) : 0;
          return (
            <span key={s.id} className="h-1.5 overflow-hidden rounded-full bg-surface-2" style={{ width: `${w}%` }}>
              <span className="block h-full bg-accent-fill" style={{ width: `${fill}%` }} />
            </span>
          );
        })}
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted" aria-live="polite">
          Plano {safeIndex + 1} de {shots.length} · {shot.layout === 'cinematic' ? 'Em movimento' : FRAMING_LABEL[shot.framing]} · {cameraLabel(presentation, shot.cameraId)}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Plano anterior" disabled={safeIndex === 0} onClick={() => go(safeIndex - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          {ended ? (
            <Button variant="secondary" size="sm" onClick={restart} data-testid="animatic-toggle">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ver de novo
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setPlaying((v) => !v)} data-testid="animatic-toggle">
              {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {playing ? 'Pausar' : 'Continuar'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Próximo plano" disabled={safeIndex === shots.length - 1} onClick={() => go(safeIndex + 1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar o animatic" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="mx-auto w-full max-w-2xl text-xs text-fg-faint">
        Sem áudio. O ritmo segue a duração estimada da fala (2,6 palavras por segundo); o vídeo final usa a voz real.
        {reduced ? ' Movimento reduzido: os planos avançam sem animação.' : ''}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Stage({ shot, presentation, playing, reduced, durationMs, startAt }: { shot: Shot; presentation: Presentation; playing: boolean; reduced: boolean; durationMs: number; startAt: number }) {
  const moveRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dipRef = React.useRef<HTMLDivElement>(null);
  const animRef = React.useRef<Animation | null>(null);
  const accent = presentation.directionStyle?.slideAccent ?? DEFAULT_SLIDE_ACCENT;
  const camera = shotCamera(presentation, shot.cameraId);
  const cinematic = shot.layout === 'cinematic';
  // cena em movimento: enquadramento não vale; um pan lateral lento sugere o deslocamento
  const zoom = cinematic ? 1.05 : framingZoom(shot.framing, camera?.nativeFraming ?? 'wide');
  const move: CameraMove = cinematic ? 'pan_left' : shot.cameraMove;
  const preview = cameraPreviewUrl(presentation, shot.cameraId);
  const bg = presentation.background;

  // movimento de câmera ao longo do plano (criado uma vez por plano)
  React.useEffect(() => {
    const el = moveRef.current;
    const frames = reduced ? null : moveFrames(move, zoom);
    if (!el || !frames || typeof el.animate !== 'function') return;
    const anim = el.animate(frames, { duration: durationMs, fill: 'forwards', easing: 'linear' });
    anim.currentTime = startAt;
    animRef.current = anim;
    return () => {
      anim.cancel();
      animRef.current = null;
    };
    // startAt só vale na criação do plano (o Stage remonta a cada plano)
  }, [reduced, move, zoom, durationMs]);
  React.useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    if (playing) a.play();
    else a.pause();
  }, [playing]);

  // transição de entrada
  React.useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root || typeof root.animate !== 'function') return;
    let anim: Animation | null = null;
    if (shot.transitionIn === 'crossfade') anim = root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    else if (shot.transitionIn === 'whip')
      anim = root.animate([{ transform: 'translateX(24%)', filter: 'blur(10px)', opacity: 0.4 }, { transform: 'none', filter: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    else if (shot.transitionIn === 'dip_to_color' && dipRef.current) anim = dipRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' });
    return () => anim?.cancel();
  }, [reduced, shot.transitionIn]);

  const presenter = (cls: string) => (
    <div className={cn('absolute overflow-hidden', cls)}>
      <div ref={moveRef} className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: '50% 26%' }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="absolute bottom-0 left-1/2 h-[94%] w-auto max-w-none -translate-x-1/2 object-contain" />
        ) : (
          <Silhouette className="inset-x-[30%] bottom-0 top-[12%]" />
        )}
      </div>
    </div>
  );
  const slide = layoutHasSlide(shot.layout) ? <SlidePreview slide={shot.slide ?? emptySlide()} accent={accent} /> : null;

  return (
    <div className="theme-video @container relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface-2" aria-hidden="true">
      <div ref={rootRef} className="absolute inset-0">
        {/* ambiente */}
        {bg.type === 'color' ? (
          <div className="absolute inset-0" style={{ backgroundColor: bg.value }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${bg.assetId}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {(shot.layout === 'presenter' || shot.layout === 'lower_third' || cinematic) && presenter('inset-0')}
        {cinematic && (
          <span className="absolute right-[3%] top-[4%] rounded-[0.6cqw] bg-paid-soft px-[1.4cqw] py-[0.5cqw] text-[2.2cqw] font-semibold text-paid" data-testid="animatic-cinematic-tag">
            em movimento
          </span>
        )}
        {shot.layout === 'presenter_slide_right' && (
          <>
            {presenter('inset-y-0 left-0 w-[46%]')}
            <div className="absolute bottom-[18%] right-[4%] top-[8%] w-[50%] overflow-hidden rounded-[1.2cqw] shadow-lg">{slide}</div>
          </>
        )}
        {shot.layout === 'presenter_slide_left' && (
          <>
            <div className="absolute bottom-[18%] left-[4%] top-[8%] w-[50%] overflow-hidden rounded-[1.2cqw] shadow-lg">{slide}</div>
            {presenter('inset-y-0 right-0 w-[46%]')}
          </>
        )}
        {shot.layout === 'slide_with_pip' && (
          <>
            <div className="absolute inset-0">{slide}</div>
            {presenter('bottom-[18%] right-[3%] h-[36%] w-[22%] rounded-[1cqw] border border-line-strong bg-surface-2 shadow-lg')}
          </>
        )}
        {(shot.layout === 'slide' || shot.layout === 'card') && <div className="absolute inset-0">{slide}</div>}
        {shot.layout === 'presenter_chips' && (
          <>
            {/* câmera de zona: o vídeo entra sem transformação; o painel de pílulas vai na parede livre */}
            {presenter('inset-0')}
            <div className={cn('absolute top-[15%] w-[36%] rounded-[1.4cqw] border border-white/15 bg-[#1D1E4C]/85 p-[2.2cqw] text-white', camera?.zone === 'right' ? 'left-[14%]' : camera?.zone === 'left' ? 'left-[50%]' : 'right-[4%]')} data-testid="animatic-chips">
              <div className="text-[3.1cqw] font-extrabold leading-tight">{shot.slide?.title}</div>
              <div className="mt-[1.2cqw] flex flex-col items-start gap-[0.8cqw]">
                {(shot.slide?.bullets ?? []).slice(0, 4).map((b, i) => (
                  <span key={i} className="flex items-center gap-[0.8cqw] rounded-full bg-white py-[0.6cqw] pl-[0.6cqw] pr-[1.6cqw] text-[2cqw] font-extrabold leading-none text-[#1D1E4C]">
                    <span className="h-[2.6cqw] w-[2.6cqw] rounded-full bg-[#FF7A08]" />
                    {chipLabel(b)}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        {shot.layout === 'presenter_panel' && (
          <>
            {presenter('inset-y-0 left-[8%] right-0')}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(15,16,48,.97) 0%, rgba(15,16,48,.92) 30%, rgba(15,16,48,.55) 40%, rgba(15,16,48,0) 48%)' }} />
            <div className="absolute left-[5%] top-[14%] w-[34%] text-white">
              <div className="text-[3.4cqw] font-extrabold leading-tight">{shot.slide?.title}</div>
              {(shot.slide?.bullets ?? []).slice(0, 3).map((b, i) => (
                <div key={i} className="mt-[1.4cqw] rounded-[1cqw] border border-white/10 bg-white/[.07] px-[1.4cqw] py-[1cqw] text-[1.9cqw] leading-snug">{b.replace(/\*\*/g, '')}</div>
              ))}
            </div>
          </>
        )}

        {(shot.layout === 'lower_third' || cinematic) && shot.caption?.trim() && (
          <div className="absolute bottom-[19%] left-[4%] flex max-w-[60%] items-stretch overflow-hidden rounded-[0.8cqw] bg-surface shadow-lg">
            <span className="w-[1cqw] shrink-0" style={{ backgroundColor: accent }} />
            <span className="px-[2cqw] py-[1cqw] text-[2.8cqw] font-semibold leading-tight text-fg">{shot.caption}</span>
          </div>
        )}

        {/* legenda */}
        <div className="absolute inset-x-[8%] bottom-[4%] text-center">
          <span className="box-decoration-clone rounded-[0.6cqw] bg-fg/80 px-[1.4cqw] py-[0.4cqw] text-[2.6cqw] leading-relaxed text-bg">{shot.line}</span>
        </div>
      </div>
      {shot.transitionIn === 'dip_to_color' && !reduced && <div ref={dipRef} className="pointer-events-none absolute inset-0" style={{ backgroundColor: accent, opacity: 0 }} />}
    </div>
  );
}

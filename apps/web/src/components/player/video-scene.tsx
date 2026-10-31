'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Captions, CaptionsOff, Loader2, Play, RotateCcw } from 'lucide-react';
import type { Intent } from '@lms/course-engine';
import { richTextToPlain, type AnyNode, type ChoiceNode, type ConsequenceNode, type MediaRef, type RichTextDocument } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/rich-text';

/* ------------------------------------------------------------------------ */
/* Compartilhados com o player                                               */
/* ------------------------------------------------------------------------ */

/** Letra da opção: A, B, C… */
export function letterOf(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export const TONE_STYLES: Record<ConsequenceNode['tone'], { rail: string; label: string }> = {
  positive: { rail: 'border-success', label: 'text-success' },
  neutral: { rail: 'border-line-strong', label: 'text-fg-muted' },
  negative: { rail: 'border-danger', label: 'text-danger' },
};

/** Cenas que podem ser apresentadas como vídeo interativo. */
export type VideoCapableNode = Extract<AnyNode, { type: 'scenario' | 'content' | 'choice' | 'consequence' }>;

/**
 * Legendas (WebVTT) geradas pelo worker. O campo ainda está entrando no
 * schema: aqui é opcional e a ausência é tolerada (cai no texto da cena).
 */
export type MediaWithCaptions = MediaRef & { captions?: { assetId: string; lang?: string } | null };

export function videoMediaOf(node: AnyNode | undefined): MediaWithCaptions | null {
  if (!node) return null;
  if (node.type !== 'scenario' && node.type !== 'content' && node.type !== 'choice' && node.type !== 'consequence') return null;
  return node.media?.kind === 'video' ? (node.media as MediaWithCaptions) : null;
}

export function isVideoCapable(node: AnyNode): node is VideoCapableNode {
  return node.type === 'scenario' || node.type === 'content' || node.type === 'choice' || node.type === 'consequence';
}

/* ------------------------------------------------------------------------ */
/* Utilitários                                                               */
/* ------------------------------------------------------------------------ */

const SMALL_SCREEN = '(max-width: 639px)';
function subscribeSmall(onChange: () => void) {
  const mq = window.matchMedia(SMALL_SCREEN);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
/** Abaixo de `sm`: respostas abaixo do vídeo, não sobre ele. */
function useSmallScreen(): boolean {
  return useSyncExternalStore(
    subscribeSmall,
    () => window.matchMedia(SMALL_SCREEN).matches,
    () => false,
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const CAPTIONS_KEY = 'lms.player.captions';
/** Preferência de legendas: ligadas por padrão; o storage pode estar bloqueado. */
export function readCaptionsPref(): boolean {
  try {
    const v = window.localStorage.getItem(CAPTIONS_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}
export function writeCaptionsPref(on: boolean) {
  try {
    window.localStorage.setItem(CAPTIONS_KEY, on ? '1' : '0');
  } catch {
    /* sem storage: a preferência vale só nesta cena */
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SEGMENT_MAX = 110;

/** Divide o texto em trechos de legenda (frases curtas, ~110 caracteres). */
export function segmentText(text: string): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;:])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(' ');
    let cur = '';
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > SEGMENT_MAX) {
        out.push(cur);
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  // junta trechos muito curtos ao anterior
  const merged: string[] = [];
  for (const seg of out) {
    const last = merged[merged.length - 1];
    if (last && last.length + 1 + seg.length <= SEGMENT_MAX * 0.8) merged[merged.length - 1] = `${last} ${seg}`;
    else merged.push(seg);
  }
  return merged;
}

/** Trecho a mostrar no instante atual, distribuindo o texto pela duração proporcionalmente ao tamanho. */
export function segmentAt(segments: string[], currentTime: number, duration: number): string | null {
  if (segments.length === 0) return null;
  if (!Number.isFinite(duration) || duration <= 0) return segments[0]!;
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  const target = Math.min(1, Math.max(0, currentTime / duration)) * total;
  let acc = 0;
  for (const seg of segments) {
    acc += seg.length;
    if (target < acc) return seg;
  }
  return segments[segments.length - 1]!;
}

/** Depois de pedir play: se nada tocar até aqui, oferecemos o texto da cena. */
const SLOW_NETWORK_MS = 12_000;

/* ------------------------------------------------------------------------ */
/* Vídeo interativo                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Estado do quadro. A regra é uma só: a camada de controles (opções da
 * decisão, ou "Continuar") aparece SEMPRE que o vídeo não está tocando:
 *
 *   paused (inicial) ──play──▶ playing ──pause/"Responder agora"/"Pular vídeo"──▶ paused
 *                                 │
 *                                 └──ended──▶ ended ──"Ver de novo"──▶ playing
 *
 * `dismissed` (Esc) esconde a camada até a próxima mudança de fase, para o
 * aluno usar os controles nativos. Assim os testes (e quem prefere ler)
 * respondem sem esperar o vídeo; quem assiste vê as opções quando ele acaba.
 *
 * Em telas pequenas a camada não fica sobre o vídeo: a decisão vira um painel
 * abaixo (vídeo em faixa 16:9 com controles mínimos, "Confirmar escolha" fixo
 * no rodapé) e as ações pós-vídeo ("Ver de novo", "Continuar") vão para uma
 * barra sob o quadro. No desktop a camada nunca cobre a barra nativa
 * (reserva os 48px de baixo) nem cresce além do vídeo (rola por dentro).
 */
type Phase = 'paused' | 'playing' | 'ended';

export interface VideoSceneProps {
  node: VideoCapableNode;
  media: MediaWithCaptions;
  pending: boolean;
  fieldError: string | null;
  /** tocar ao montar (o clique que levou a esta cena conta como gesto) */
  autoPlay: boolean;
  /** "Você escolheu: …" sobre o canto do vídeo (consequência de uma decisão) */
  chosenLabel?: string;
  /** painel completo de retorno (escolha/avaliação), abaixo do vídeo */
  feedback?: React.ReactNode;
  onSend: (intent: Intent) => void;
  /** o vídeo não carregou: o player volta ao layout de cartões */
  onFail: () => void;
}

const PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-white/40 bg-black/45 px-4 text-sm font-medium text-white backdrop-blur-md hover:bg-black/60 focus-visible:outline focus-visible:outline-3 focus-visible:outline-white focus-visible:outline-offset-2';
const ICON_PILL = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/40 bg-black/45 px-3 text-sm font-semibold text-white backdrop-blur-md hover:bg-black/60 focus-visible:outline focus-visible:outline-3 focus-visible:outline-white focus-visible:outline-offset-2';

/** Altura reservada para a barra de controles nativa (não é coberta pela camada). */
const NATIVE_BAR = 'bottom-12';

export function VideoScene({ node, media, pending, fieldError, autoPlay, chosenLabel, feedback, onSend, onFail }: VideoSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDetailsElement>(null);
  const focusLayerNext = useRef(false);
  const slowTimer = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>('paused');
  const [dismissed, setDismissed] = useState(false);
  /** o aluno chegou ao fim ou pulou: libera o que vem "depois do vídeo" */
  const [revealed, setRevealed] = useState(false);
  /** o navegador recusou tocar sozinho */
  const [blocked, setBlocked] = useState(false);
  /** rede lenta: esperando dados depois de pedir play */
  const [buffering, setBuffering] = useState(false);
  /** nada tocou em 12 s: oferece o texto da cena */
  const [slow, setSlow] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [textOpen, setTextOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const small = useSmallScreen();

  const isChoice = node.type === 'choice';
  const hasChip = !!chosenLabel;
  const layerVisible = phase !== 'playing' && !dismissed;
  /** celular: respostas/ações abaixo do vídeo em vez de sobre ele */
  // Opções longas (ou mais de 4) não cabem sobre o vídeo em nenhuma tela: a resposta desce para baixo do vídeo.
  // Opções curtas (o padrão dos cursos encurtados) ficam sobre o vídeo, em colunas.
  const longOptions = node.type === 'choice' && (node.options.length > 4 || Math.max(0, ...node.options.map((o) => o.label.length)) > 110);
  // Se a camada não couber no quadro (vídeo baixo), a resposta desce para baixo do vídeo (medido ao abrir).
  const [layerWidth, setLayerWidth] = useState(0);
  const [overflowed, setOverflowed] = useState(false);
  useEffect(() => setOverflowed(false), [node.id]);
  // Mede DEPOIS de a largura ser conhecida (as colunas dependem dela): se ainda não couber, desce.
  useEffect(() => {
    if (!layerWidth || !layerVisible || panelBelow || !isChoice) return;
    const id = requestAnimationFrame(() => {
      const el = layerRef.current;
      if (!el) return;
      if (el.scrollHeight > el.clientHeight + 8) setOverflowed(true);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerWidth, node.id, layerVisible]);
  const panelBelow = (small || longOptions || overflowed) && layerVisible;
  /** decisão aberta no celular: controles próprios, sem a barra nativa */
  const nativeControls = !(panelBelow && isChoice);
  const src = `/api/assets/${encodeURIComponent(media.assetId)}`;
  const captionsSrc = media.captions?.assetId ? `/api/assets/${encodeURIComponent(media.captions.assetId)}` : null;

  // Texto para a legenda de reserva (sem .vtt): transcrição, senão o texto da cena.
  const fallbackText = useMemo(() => {
    const transcript = media.transcript?.trim();
    if (transcript) return transcript;
    return richTextToPlain(node.type === 'choice' ? node.prompt : node.body).trim();
  }, [media.transcript, node]);
  const segments = useMemo(() => segmentText(fallbackText), [fallbackText]);
  const hasAnyText = !!captionsSrc || segments.length > 0;
  const fallbackLine = !captionsSrc && captionsOn && phase === 'playing' ? segmentAt(segments, currentTime, duration) : null;

  useEffect(() => {
    setCaptionsOn(readCaptionsPref());
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((on) => {
      writeCaptionsPref(!on);
      return !on;
    });
  }, []);

  // Liga/desliga a faixa de legendas nativa conforme a preferência.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !captionsSrc) return;
    const apply = () => {
      for (const track of Array.from(v.textTracks)) track.mode = captionsOn ? 'showing' : 'hidden';
    };
    apply();
    v.textTracks.addEventListener('addtrack', apply);
    return () => v.textTracks.removeEventListener('addtrack', apply);
  }, [captionsOn, captionsSrc]);

  const clearSlow = useCallback(() => {
    if (slowTimer.current !== null) {
      window.clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
    setSlow(false);
  }, []);

  /**
   * Esperando dados (ao pedir play sem buffer, ou em `waiting`/`stalled`): mostra
   * "Carregando…" e arma o aviso de rede lenta. Chamado na hora do play(), não na
   * promessa: ela só resolve quando o vídeo de fato começa a tocar.
   */
  const waitForData = useCallback(() => {
    setBuffering(true);
    if (slowTimer.current === null) slowTimer.current = window.setTimeout(() => setSlow(true), SLOW_NETWORK_MS);
  }, []);

  useEffect(() => clearSlow, [clearSlow]);

  // Tocar sozinho ao entrar na cena depois de um clique do aluno.
  useEffect(() => {
    if (!autoPlay) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (v.readyState < 3) waitForData();
    if (p)
      p.catch(() => {
        setBuffering(false);
        clearSlow();
        setBlocked(true);
      });
  }, [autoPlay, waitForData, clearSlow]);

  // Leva o foco para a camada (ou o painel abaixo) quando ela abre por fim do vídeo ou pedido do aluno,
  // e garante que o alvo esteja na tela.
  useEffect(() => {
    if (!layerVisible || !focusLayerNext.current) return;
    focusLayerNext.current = false;
    const root = layerRef.current;
    const target =
      root?.querySelector<HTMLElement>('input:checked:not(:disabled)') ??
      root?.querySelector<HTMLElement>('input:not(:disabled)') ??
      root?.querySelector<HTMLElement>('[data-testid="player-continue"]:not(:disabled)');
    if (!target) return;
    if (panelBelow) {
      target.focus();
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    // Sobre o vídeo: foca sem rolar a camada (a pergunta ficaria escondida); mostra o quadro inteiro na página.
    target.focus({ preventScroll: true });
    if (root) root.scrollTop = 0;
    videoRef.current?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [layerVisible, phase, panelBelow]);

  // Largura útil da camada sobre o vídeo (decide quantas colunas de opções cabem).
  useEffect(() => {
    const el = layerRef.current;
    if (!el || panelBelow || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setLayerWidth(Math.round(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [layerVisible, panelBelow]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    const p = v.play();
    if (v.readyState < 3) waitForData();
    // o botão some ao tocar; o foco vai para o vídeo (controles nativos)
    if (p)
      p.then(() => v.focus({ preventScroll: true })).catch(() => {
        setBuffering(false);
        clearSlow();
        setBlocked(true);
      });
  }, [waitForData, clearSlow]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  }, []);

  /** "Responder agora" / "Pular vídeo": pausa e abre a camada com o foco dentro dela. */
  const openControls = useCallback(() => {
    focusLayerNext.current = true;
    setRevealed(true);
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    else setDismissed(false);
  }, []);

  /** Rede lenta: abre o texto da cena e leva o foco até ele. */
  const openText = useCallback(() => {
    setTextOpen(true);
    requestAnimationFrame(() => {
      const d = textRef.current;
      if (!d) return;
      d.querySelector<HTMLElement>('summary')?.focus();
      d.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }, []);

  const onLayerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setDismissed(true);
    // depois do re-render: no celular a barra nativa volta junto com a camada dispensada
    requestAnimationFrame(() => videoRef.current?.focus({ preventScroll: true }));
  };

  const ccButton = hasAnyText && (
    <button
      type="button"
      onClick={toggleCaptions}
      aria-pressed={captionsOn}
      aria-label={captionsOn ? 'Legendas ativadas' : 'Legendas desativadas'}
      title={captionsOn ? 'Desativar legendas' : 'Ativar legendas'}
      data-testid="video-captions-toggle"
      className={ICON_PILL}
    >
      {captionsOn ? <Captions className="h-5 w-5" aria-hidden="true" /> : <CaptionsOff className="h-5 w-5" aria-hidden="true" />}
      <span className="sr-only">Legendas</span>
    </button>
  );

  return (
    <div className="space-y-5" data-testid="video-scene" data-phase={phase} data-layout={panelBelow ? 'below' : 'overlay'}>
      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-[0_12px_32px_-16px_rgb(16_24_40_/_0.45)]">
        {/* Camada de controles sobre o vídeo (desktop): ANTES do vídeo no DOM, para vir antes dos controles nativos no Tab.
            Absoluta e com rolagem interna: nunca cresce o quadro nem cobre a barra nativa. */}
        {layerVisible && !panelBelow && (
          <div
            ref={layerRef}
            onKeyDown={onLayerKeyDown}
            data-testid="video-overlay"
            className={cn(
              '@container absolute inset-x-0 top-0 z-10 flex flex-col overflow-y-auto overscroll-contain bg-black/55 bg-linear-to-t from-black/80 via-black/40 to-transparent p-4 sm:p-6 [justify-content:safe_flex-end]',
              NATIVE_BAR,
              'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:starting:opacity-0',
              hasChip && 'pt-14',
            )}
          >
            {isChoice ? (
              <div className="min-h-0">
                <ChoiceForm variant="overlay" width={layerWidth} node={node} phase={phase} blocked={blocked} pending={pending} fieldError={fieldError} onPlay={play} onSend={onSend} />
              </div>
            ) : (
              <div className="m-auto flex flex-col items-center gap-4 text-center">
                <PlayButton phase={phase} blocked={blocked} onPlay={play} large={phase !== 'ended'} />
                {fieldError && (
                  <p role="alert" className="rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white">
                    {fieldError}
                  </p>
                )}
                <Button size="lg" className="min-w-40 rounded-full shadow-lg" data-testid="player-continue" onClick={() => onSend({ kind: 'advance' })} disabled={pending} aria-busy={pending}>
                  {pending ? 'Enviando…' : 'Continuar'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Celular, vídeo parado: só o botão grande de assistir dentro do quadro; o resto fica abaixo. */}
        {panelBelow && phase === 'paused' && (
          <div className={cn('absolute inset-x-0 top-0 z-10 flex items-center justify-center bg-black/45', nativeControls ? NATIVE_BAR : 'bottom-0')}>
            <PlayButton phase={phase} blocked={blocked} onPlay={play} large />
          </div>
        )}

        {/* Carregando (rede lenta): spinner e, após 12 s, o caminho pelo texto. */}
        {buffering && (
          <div role="status" aria-live="polite" className={cn('pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/50 p-4 text-center text-white', nativeControls ? NATIVE_BAR : 'bottom-0')} data-testid="video-buffering">
            <Loader2 className="h-9 w-9 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm font-medium">Carregando vídeo…</p>
            {slow && (
              <>
                <p className="max-w-xs text-sm text-white/85">A conexão está lenta. Você pode ler a cena enquanto o vídeo carrega.</p>
                <button type="button" onClick={openText} className={cn(PILL, 'pointer-events-auto border-white bg-white text-black hover:bg-white/90')} data-testid="video-read-text">
                  Ler o texto da cena
                </button>
              </>
            )}
          </div>
        )}

        {/* Canto superior: legendas e o atalho para responder/pular enquanto toca (ou com a camada dispensada). */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          {ccButton}
          {!layerVisible && (
            <button type="button" onClick={openControls} className={PILL} data-testid={isChoice ? 'video-answer-now' : 'video-skip'}>
              {isChoice ? 'Responder agora' : 'Pular vídeo'}
            </button>
          )}
        </div>

        {hasChip && (
          <p aria-hidden="true" className={cn('absolute left-3 top-3 z-20 truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md sm:text-sm', hasAnyText ? 'max-w-[45%] sm:max-w-[60%]' : 'max-w-[70%]')}>
            Você escolheu: {chosenLabel}
          </p>
        )}

        {/* Legenda de reserva: sem .vtt, o texto da cena acompanha o vídeo como barra fixa. */}
        {fallbackLine && !buffering && (
          <p className={cn('pointer-events-none absolute inset-x-3 z-10 text-center', nativeControls ? 'bottom-14' : 'bottom-3')} data-testid="video-fallback-captions">
            <span className="line-clamp-3 inline-block max-w-full rounded-md bg-black/75 px-3 py-1.5 text-[13px] leading-snug text-white sm:text-base">{fallbackLine}</span>
          </p>
        )}

        <video
          ref={videoRef}
          src={`${src}#t=0.1`}
          controls={nativeControls}
          preload="metadata"
          playsInline
          aria-label={media.alt ?? 'Vídeo da cena'}
          className={cn('aspect-video w-full bg-black object-contain', small && 'max-h-[34vh]')}
          onPlay={() => {
            setPhase('playing');
            setDismissed(false);
            setBlocked(false);
          }}
          onPlaying={() => {
            setBuffering(false);
            clearSlow();
          }}
          onCanPlay={() => {
            setBuffering(false);
            clearSlow();
          }}
          onWaiting={waitForData}
          onStalled={(e) => {
            if (e.currentTarget.readyState < 3 && !e.currentTarget.paused) waitForData();
          }}
          onPause={(e) => {
            setBuffering(false);
            clearSlow();
            if (e.currentTarget.ended) return;
            setPhase('paused');
            setDismissed(false);
          }}
          onEnded={() => {
            focusLayerNext.current = true;
            setBuffering(false);
            clearSlow();
            setPhase('ended');
            setRevealed(true);
            setDismissed(false);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onError={onFail}
        >
          {captionsSrc && <track kind="captions" srcLang={media.captions?.lang ?? 'pt-BR'} label="Português" src={captionsSrc} default />}
        </video>

        {/* Controles mínimos quando a barra nativa está desligada (decisão aberta no celular). */}
        {!nativeControls && (
          <div className="flex items-center gap-2 bg-black px-2 py-1 text-white" data-testid="video-mini-controls">
            <button
              type="button"
              onClick={play}
              aria-label={phase === 'ended' ? 'Ver de novo' : 'Assistir'}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline focus-visible:outline-3 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              {phase === 'ended' ? <RotateCcw className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-white/85">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <input
              type="range"
              aria-label="Posição do vídeo"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="min-h-11 min-w-0 flex-1 accent-white"
            />
          </div>
        )}
      </div>

      {/* Celular: painel de resposta (decisão) ou barra de ações (demais cenas) ABAIXO do vídeo. */}
      {panelBelow && (
        <div ref={layerRef} onKeyDown={onLayerKeyDown} data-testid="video-overlay" className="space-y-4">
          {isChoice ? (
            <ChoiceForm variant="panel" node={node} phase={phase} blocked={blocked} pending={pending} fieldError={fieldError} onPlay={play} onSend={onSend} />
          ) : (
            <div className="space-y-3">
              {blocked && <p className="text-sm text-fg-muted">O navegador pausou o vídeo. Toque em Assistir.</p>}
              {fieldError && (
                <p role="alert" className="text-sm text-danger">
                  {fieldError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {phase === 'ended' && (
                  <Button variant="secondary" size="lg" className="rounded-full" onClick={play}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ver de novo
                  </Button>
                )}
                <Button size="lg" className="min-w-0 flex-1 rounded-full" data-testid="player-continue" onClick={() => onSend({ kind: 'advance' })} disabled={pending} aria-busy={pending}>
                  {pending ? 'Enviando…' : 'Continuar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {feedback}

      {node.type === 'consequence' && revealed && node.guidance && <Guidance node={node} guidance={node.guidance} />}

      <SceneText ref={textRef} node={node} media={media} showGuidance={!revealed} open={textOpen} onOpenChange={setTextOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function PlayButton({ phase, blocked, onPlay, large }: { phase: Phase; blocked: boolean; onPlay: () => void; large: boolean }) {
  if (phase === 'ended') {
    return (
      <button type="button" className={PILL} onClick={onPlay}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ver de novo
      </button>
    );
  }
  if (!large) {
    return (
      <button type="button" className={PILL} onClick={onPlay}>
        <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Assistir
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onPlay}
        aria-label="Assistir"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg hover:bg-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-white focus-visible:outline-offset-4 sm:h-20 sm:w-20"
      >
        <Play className="ml-1 h-7 w-7 fill-current sm:h-8 sm:w-8" aria-hidden="true" />
      </button>
      <span className="text-sm font-medium text-white" aria-hidden="true">
        {blocked ? 'Toque para assistir' : 'Assistir'}
      </span>
    </div>
  );
}

/**
 * Formulário da decisão. `overlay` = branco sobre o vídeo (desktop);
 * `panel` = tokens da página, abaixo do vídeo, com "Confirmar escolha" fixo
 * no rodapé da tela enquanto as opções rolam (celular).
 */
function ChoiceForm({
  variant,
  node,
  phase,
  blocked,
  pending,
  fieldError,
  onPlay,
  onSend,
  width = 0,
}: {
  variant: 'overlay' | 'panel';
  /** largura útil da camada sobre o vídeo (px); 0 = desconhecida */
  width?: number;
  node: ChoiceNode;
  phase: Phase;
  blocked: boolean;
  pending: boolean;
  fieldError: string | null;
  onPlay: () => void;
  onSend: (i: Intent) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const groupName = useId();
  const promptId = useId();
  const overlay = variant === 'overlay';
  // Colunas pelo tamanho das opções e pela largura do VÍDEO (não da janela): opções curtas lado a lado, longas em coluna única.
  const longest = Math.max(0, ...node.options.map((o) => o.label.length));
  // Colunas pela largura MEDIDA da camada (o quadro tem ~650px úteis no desktop): opções curtas lado a lado.
  const cols = !overlay ? 1 : node.options.length === 3 && longest <= 48 && width >= 540 ? 3 : node.options.length <= 4 && longest <= 100 && width >= 480 ? 2 : 1;
  return (
    <form
      role="group"
      aria-labelledby={promptId}
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onSend({ kind: 'choose', optionId: selected });
      }}
      className={cn('space-y-3', overlay && 'relative', overlay && cols > 1 ? 'space-y-2' : overlay && 'sm:space-y-4')}
    >
      {overlay && (
        <div className="absolute right-14 top-0 flex items-center gap-2 sm:right-16">
          <PlayButton phase={phase} blocked={blocked} onPlay={onPlay} large={false} />
          {blocked && <span className="text-sm text-white/85">O navegador pausou o vídeo. Toque em Assistir.</span>}
        </div>
      )}
      {!overlay && blocked && <p className="text-sm text-fg-muted">O navegador pausou o vídeo. Toque em Assistir.</p>}
      <div id={promptId}>
        <RichText doc={node.prompt} className={overlay ? 'pr-28 text-base font-medium leading-snug text-white sm:pr-32 sm:text-lg [&_p+p]:mt-1' : 'text-lg font-medium leading-snug text-fg'} />
      </div>
      <fieldset disabled={pending} className={overlay ? 'pb-1' : undefined}>
        <legend className="sr-only">Escolha uma opção</legend>
        <div className={cn('grid gap-2', cols === 1 && 'sm:gap-3')} style={cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined} role="presentation">
          {node.options.map((opt, i) => {
            const isSel = selected === opt.id;
            return (
              <label
                key={opt.id}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left text-base leading-snug transition-colors motion-reduce:transition-none',
                  overlay ? (cols > 1 ? 'gap-2 p-2.5 text-[15px]' : 'sm:p-3.5') : 'sm:p-4 sm:text-lg',
                  'has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-offset-2',
                  overlay
                    ? cn('text-white backdrop-blur-md has-focus-visible:outline-white', isSel ? 'border-white bg-white/30 ring-2 ring-white' : 'border-white/30 bg-white/10 hover:bg-white/20')
                    : cn('text-fg has-focus-visible:outline-accent', isSel ? 'panel-accent bg-accent-soft/50' : 'border-line bg-bg-2 hover:border-line-strong hover:bg-surface-2'),
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={opt.id}
                  checked={isSel}
                  onChange={() => setSelected(opt.id)}
                  data-testid={`option-${opt.id}`}
                  className={cn('mt-1 size-5 shrink-0', overlay ? 'accent-white' : 'accent-accent')}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    overlay ? (isSel ? 'bg-white text-black' : 'bg-white/20 text-white') : isSel ? 'bg-accent-fill text-accent-fill-fg' : 'bg-accent-soft text-accent',
                  )}
                >
                  {letterOf(i)}
                </span>
                <span className="min-w-0 flex-1">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {fieldError && (
        <p role="alert" className={overlay ? 'rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white' : 'text-sm text-danger'}>
          {fieldError}
        </p>
      )}
      {overlay && cols > 1 ? (
        // Opções lado a lado: o botão fica logo abaixo, à direita, sem cobrir nada.
        <div className="flex justify-end">
          <Button type="submit" size="sm" className="rounded-full px-5 shadow-lg" data-testid="player-submit" disabled={!selected || pending} aria-busy={pending}>
            {pending ? 'Enviando…' : 'Confirmar escolha'}
          </Button>
        </div>
      ) : overlay ? (
        // Lista em coluna: fixo no rodapé da camada; as opções rolam e o botão continua à vista.
        <div className="sticky -bottom-4 -mx-4 -mb-4 border-t border-white/15 bg-black/85 px-4 py-3 backdrop-blur-sm sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button type="submit" size="lg" className="w-full rounded-full shadow-lg sm:w-auto" data-testid="player-submit" disabled={!selected || pending} aria-busy={pending}>
            {pending ? 'Enviando…' : 'Confirmar escolha'}
          </Button>
        </div>
      ) : (
        // Barra fixa no rodapé da tela: o aluno confirma sem procurar o botão depois das opções.
        <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-md" data-testid="choice-confirm-bar">
          <Button type="submit" size="lg" className="w-full rounded-full" data-testid="player-submit" disabled={!selected || pending} aria-busy={pending}>
            {pending ? 'Enviando…' : 'Confirmar escolha'}
          </Button>
        </div>
      )}
    </form>
  );
}

function Guidance({ node, guidance }: { node: ConsequenceNode; guidance: RichTextDocument }) {
  const tone = TONE_STYLES[node.tone];
  return (
    <div className={cn('border-l-4 pl-4 sm:pl-5', tone.rail)}>
      <div className="rounded-[var(--radius-card)] bg-surface-2 p-4 sm:p-5">
        <p className={cn('text-sm font-medium', tone.label)}>O que levar disso</p>
        <RichText doc={guidance} className="mt-1 text-base leading-relaxed text-fg" />
      </div>
    </div>
  );
}

/** Texto da cena sempre disponível: o vídeo nunca é o único caminho para a instrução. */
function SceneText({
  ref,
  node,
  media,
  showGuidance,
  open,
  onOpenChange,
}: {
  ref: React.Ref<HTMLDetailsElement>;
  node: VideoCapableNode;
  media: MediaRef;
  showGuidance: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const doc = node.type === 'choice' ? node.prompt : node.body;
  const plain = richTextToPlain(doc).trim();
  const transcript = media.transcript?.trim();
  const showTranscript = !!transcript && transcript !== plain;
  const guidance = node.type === 'consequence' && showGuidance ? node.guidance : undefined;
  if (!plain && !showTranscript && !guidance) return null;
  const rail = node.type === 'consequence' ? TONE_STYLES[node.tone] : null;
  return (
    <details ref={ref} open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3" data-testid="scene-text">
      <summary className="min-h-6 cursor-pointer rounded font-medium text-fg">Ler o texto da cena</summary>
      <div className="mt-3 space-y-4">
        {plain && (
          <div className={cn(rail && cn('border-l-4 pl-4', rail.rail))}>
            <RichText doc={doc} className="text-lg leading-relaxed text-fg" />
          </div>
        )}
        {guidance && rail && (
          <div>
            <p className={cn('text-sm font-medium', rail.label)}>O que levar disso</p>
            <RichText doc={guidance} className="mt-1 text-base leading-relaxed text-fg" />
          </div>
        )}
        {showTranscript && (
          <div>
            <p className="text-sm font-medium text-fg-muted">Transcrição do vídeo</p>
            <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-fg">{transcript}</p>
          </div>
        )}
      </div>
    </details>
  );
}

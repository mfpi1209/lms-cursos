'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { richTextToPlain } from '@lms/course-schema';
import { readCaptionsPref, segmentAt, segmentText, writeCaptionsPref, type MediaWithCaptions, type VideoCapableNode } from '../video-scene';

/**
 * Estado do vídeo de uma cena no palco da plataforma (controles próprios, sem
 * a barra nativa). Regra da interação: a pergunta/ação aparece sempre que o
 * vídeo NÃO está tocando (antes de começar, pausado ou no fim); durante a
 * reprodução o painel mostra "Assista" + título e o atalho "Responder agora".
 *
 * Legendas: com .vtt, a faixa fica `hidden` (eventos de cue) e o texto é
 * desenhado pelo player acima da barra de controles; sem .vtt, o texto da cena
 * é distribuído pela duração (mesma reserva do player clássico).
 */
export type VideoPhase = 'idle' | 'playing' | 'paused' | 'ended';

export function useSceneVideo(node: VideoCapableNode | null, media: MediaWithCaptions | null, autoPlay: boolean, opts: { /** legendas ligadas neste vídeo mesmo sem a preferência salva (o fechamento do curso); o botão continua mandando */ captionsDefault?: boolean } = {}) {
  const captionsDefault = !!opts.captionsDefault;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<VideoPhase>('idle');
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [cue, setCue] = useState<string | null>(null);
  // rampa de volume no começo (≈100 ms): o vídeo entra sem estalo; enquanto sobe, o volume do aluno não muda
  const rampRef = useRef<number | null>(null);
  const fadeInAudio = useCallback((v: HTMLVideoElement) => {
    if (v.currentTime > 0.25 || v.muted) return;
    if (rampRef.current !== null) cancelAnimationFrame(rampRef.current);
    const target = v.volume > 0 ? v.volume : 1;
    const t0 = performance.now();
    v.volume = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 100);
      v.volume = target * k;
      if (k < 1) rampRef.current = requestAnimationFrame(step);
      else rampRef.current = null;
    };
    rampRef.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => {
    if (rampRef.current !== null) cancelAnimationFrame(rampRef.current);
  }, []);

  const active = !!media && !failed;
  const src = media ? `/api/assets/${encodeURIComponent(media.assetId)}` : null;
  const captionsSrc = media?.captions?.assetId ? `/api/assets/${encodeURIComponent(media.captions.assetId)}` : null;

  const fallbackText = useMemo(() => {
    if (!node || !media) return '';
    const transcript = media.transcript?.trim();
    if (transcript) return transcript;
    return richTextToPlain(node.type === 'choice' ? node.prompt : node.body).trim();
  }, [media, node]);
  const segments = useMemo(() => segmentText(fallbackText), [fallbackText]);
  const hasCaptions = !!captionsSrc || segments.length > 0;

  useEffect(() => setCaptionsOn(captionsDefault || readCaptionsPref()), [captionsDefault]);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((on) => {
      writeCaptionsPref(!on);
      return !on;
    });
  }, []);

  // Faixa .vtt: sempre "hidden" (o player desenha o texto); acompanha a cue ativa.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !captionsSrc || !active) return;
    const wire = () => {
      for (const track of Array.from(v.textTracks)) {
        track.mode = 'hidden';
        track.oncuechange = () => {
          const list = track.activeCues;
          const texts: string[] = [];
          if (list) for (let i = 0; i < list.length; i++) texts.push((list[i] as VTTCue).text);
          setCue(texts.join(' ').trim() || null);
        };
      }
    };
    wire();
    v.textTracks.addEventListener('addtrack', wire);
    return () => v.textTracks.removeEventListener('addtrack', wire);
  }, [captionsSrc, active]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    if (v.readyState < 3) setBuffering(true);
    const p = v.play();
    if (p)
      p.catch(() => {
        setBuffering(false);
        setBlocked(true);
      });
  }, []);

  const pause = useCallback(() => videoRef.current?.pause(), []);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else v.pause();
  }, [play]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = vol;
    v.muted = vol === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  // Toca sozinho ao entrar na cena depois de um clique do aluno.
  useEffect(() => {
    if (!autoPlay || !active) return;
    // o autoplay só COMEÇA um vídeo; nunca recomeça um que já terminou (ao avançar para a cena seguinte o
    // autoPlay oscila e o vídeo voltava ao início por meio segundo: o "corte" no fim de cada vídeo)
    if (videoRef.current?.ended) return;
    play();
  }, [autoPlay, active, play]);

  const caption = !captionsOn || phase !== 'playing' ? null : captionsSrc ? cue : segmentAt(segments, currentTime, duration);

  const videoProps: React.VideoHTMLAttributes<HTMLVideoElement> & { ref: React.Ref<HTMLVideoElement> } = {
    ref: videoRef,
    src: src ? `${src}#t=0.1` : undefined,
    preload: 'metadata',
    playsInline: true,
    controls: false,
    // entra com fade de imagem (globals.css; sem animação com movimento reduzido)
    ...({ 'data-im-video': '' } as Record<string, string>),
    onPlay: (e) => {
      setPhase('playing');
      setBlocked(false);
      fadeInAudio(e.currentTarget);
    },
    onPlaying: () => setBuffering(false),
    onCanPlay: () => setBuffering(false),
    onWaiting: () => setBuffering(true),
    onPause: (e) => {
      setBuffering(false);
      if (!e.currentTarget.ended) setPhase('paused');
    },
    onEnded: () => {
      setBuffering(false);
      setPhase('ended');
    },
    onTimeUpdate: (e) => setCurrentTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e) => setDuration(e.currentTarget.duration),
    onDurationChange: (e) => setDuration(e.currentTarget.duration),
    onVolumeChange: (e) => {
      setMuted(e.currentTarget.muted);
      if (rampRef.current === null) setVolumeState(e.currentTarget.volume);
    },
    onError: () => {
      setFailed(true);
      setPhase('idle');
    },
  };

  return {
    active,
    phase,
    playing: active && phase === 'playing',
    blocked,
    buffering,
    currentTime,
    duration,
    muted,
    volume,
    captionsOn,
    hasCaptions,
    captionsSrc,
    caption,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    toggleCaptions,
    videoProps,
  };
}

export type SceneVideo = ReturnType<typeof useSceneVideo>;

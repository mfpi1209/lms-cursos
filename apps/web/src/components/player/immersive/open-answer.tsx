'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Pencil, RotateCcw, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clock } from './theme';
import { ImButton, ImCard } from './ui';

/**
 * Resposta aberta da decisão: escrever ou falar. É sempre OPCIONAL: a escolha
 * entre as opções é o caminho principal; falar é um treino em voz alta. Nada sai do aparelho até o
 * aluno tocar em "Enviar"; mesmo assim, nesta versão a gravação NÃO é enviada
 * (não há rota de envio para o aluno): só o texto segue com a escolha.
 */

export type OpenAnswerDraft = { mode: 'text'; text: string } | { mode: 'voice'; url: string; seconds: number };

const MAX_TEXT = 1200;
const MAX_SECONDS = 180;

/* ------------------------------------------------------------------------ */
/* Escrever                                                                  */
/* ------------------------------------------------------------------------ */

export function WriteAnswer({ initial = '', onSubmit, onCancel }: { initial?: string; onSubmit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const hintId = useId();
  const len = text.trim().length;

  // altura automática
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [text]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <form
      data-testid="open-answer-write"
      onSubmit={(e) => {
        e.preventDefault();
        if (len > 0) onSubmit(text.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="space-y-3"
    >
      <ImCard className="p-0 md:p-0">
        <label htmlFor={id} className="sr-only">
          Sua resposta, do seu jeito
        </label>
        <textarea
          id={id}
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={3}
          maxLength={MAX_TEXT}
          aria-describedby={hintId}
          placeholder="Escreva como você responderia na entrevista…"
          data-testid="open-answer-text"
          className="block min-h-28 w-full resize-none rounded-[16px] bg-transparent px-5 py-4 text-lg leading-relaxed text-fg outline-none! placeholder:text-fg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--im-accent-ink)]"
        />
        <p id={hintId} className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-[13px] text-fg/70">
          <span>Use suas palavras. Ninguém dá nota para o jeito de escrever.</span>
          <span className="shrink-0 tabular-nums" aria-live="off">
            {text.length}/{MAX_TEXT}
          </span>
        </p>
      </ImCard>
      <div className="flex flex-wrap gap-3">
        <ImButton type="submit" size="md" disabled={len === 0} data-testid="open-answer-send">
          Enviar
        </ImButton>
        <ImButton variant="outline" size="md" onClick={onCancel}>
          Cancelar
        </ImButton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Falar                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * O aparelho consegue gravar? Sem API de gravação, sem entrada de áudio ou com
 * o microfone bloqueado, o treino em voz alta some sem aviso (a escolha basta).
 * Começa como `false` (servidor e primeiro render) e confirma no navegador.
 */
export function useMicAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
    let alive = true;
    setOk(true);
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (alive && status) setOk(status.state !== 'denied');
    };
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((st) => {
        status = st;
        onChange();
        st.addEventListener('change', onChange);
      })
      .catch(() => {});
    navigator.mediaDevices
      .enumerateDevices?.()
      .then((devices) => {
        if (alive && devices.length > 0 && !devices.some((d) => d.kind === 'audioinput')) setOk(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
      status?.removeEventListener('change', onChange);
    };
  }, []);
  return ok;
}

type RecState = 'idle' | 'asking' | 'recording' | 'recorded' | 'denied' | 'unsupported';

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

export function RecordAnswer({
  onSubmit,
  onCancel,
  onSwitchToWrite,
  onUnavailable,
}: {
  onSubmit: (draft: { url: string; seconds: number }) => void;
  onCancel: () => void;
  /** só quando escrever também é permitido */
  onSwitchToWrite?: () => void;
  /** treino só por voz: microfone negado ou sem gravação → volta às opções sem mensagem de erro */
  onUnavailable?: () => void;
}) {
  const [state, setState] = useState<RecState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const keepUrl = useRef(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  // Ao sair: desliga o microfone e libera a gravação local (a menos que tenha sido enviada).
  useEffect(
    () => () => {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      stopTracks();
    },
    [stopTracks],
  );
  useEffect(
    () => () => {
      if (url && !keepUrl.current) URL.revokeObjectURL(url);
    },
    [url],
  );

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('unsupported');
      return;
    }
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        stopTracks();
        const blob = new Blob(chunks.current, { type: rec.mimeType || mime || 'audio/webm' });
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
        setState('recorded');
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      setSeconds(0);
      rec.start();
      setState('recording');
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS && rec.state === 'recording') rec.stop();
      }, 250);
    } catch {
      stopTracks();
      setState('denied');
    }
  }, [stopTracks]);

  const stop = useCallback(() => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, []);

  const discard = useCallback(() => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setSeconds(0);
    setState('idle');
  }, [url]);

  useEffect(() => {
    if ((state === 'denied' || state === 'unsupported') && onUnavailable) {
      onUnavailable();
      return;
    }
    if (state === 'recorded' || state === 'denied' || state === 'unsupported') statusRef.current?.focus();
  }, [state, onUnavailable]);

  return (
    <div
      data-testid="open-answer-record"
      className="space-y-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && state !== 'recording') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <ImCard className="space-y-4">
        {(state === 'idle' || state === 'asking') && (
          <>
            <p className="text-base leading-relaxed text-fg/85">
              Fale em voz alta, como faria na entrevista. Só você ouve: a gravação fica no seu aparelho. Pode parar ou apagar quando quiser.
            </p>
            <ImButton size="md" onClick={() => void start()} disabled={state === 'asking'} aria-busy={state === 'asking'} data-testid="record-start">
              <Mic className="size-5" aria-hidden="true" /> {state === 'asking' ? 'Aguardando o microfone…' : 'Começar a gravar'}
            </ImButton>
          </>
        )}

        {state === 'recording' && (
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2.5 text-base font-medium text-fg">
              <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
              Gravando
            </span>
            <span className="text-2xl font-semibold tabular-nums text-fg" role="timer" aria-label={`Tempo de gravação: ${clock(seconds)}`}>
              {clock(seconds)}
            </span>
            <ImButton size="md" variant="outline" onClick={stop} className="ml-auto" data-testid="record-stop">
              <Square className="size-4 fill-current" aria-hidden="true" /> Parar
            </ImButton>
          </div>
        )}

        {state === 'recorded' && url && (
          <div className="space-y-3">
            <p ref={statusRef} tabIndex={-1} className="text-base font-medium text-fg outline-none">
              Sua resposta gravada ({clock(seconds)}). Ouça se quiser.
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- gravação do próprio aluno */}
            <audio src={url} controls className="w-full" aria-label="Ouvir sua gravação" />
            <div className="flex flex-wrap gap-2">
              <ImButton size="sm" variant="outline" onClick={() => { discard(); void start(); }}>
                <RotateCcw className="size-4" aria-hidden="true" /> Gravar de novo
              </ImButton>
              <ImButton size="sm" variant="ghost" onClick={discard}>
                <Trash2 className="size-4" aria-hidden="true" /> Apagar
              </ImButton>
            </div>
          </div>
        )}

        {(state === 'denied' || state === 'unsupported') && (
          <div className="space-y-3" role="alert">
            <p ref={statusRef} tabIndex={-1} className="text-base leading-relaxed text-fg outline-none">
              {state === 'denied'
                ? `Não conseguimos usar o microfone. Você pode liberar o acesso nas configurações do navegador${onSwitchToWrite ? ' ou responder escrevendo' : ' ou só escolher uma opção'}.`
                : `Este navegador não grava áudio. ${onSwitchToWrite ? 'Você pode responder escrevendo.' : 'Escolha uma opção para seguir.'}`}
            </p>
            {onSwitchToWrite ? (
              <ImButton size="md" variant="outline" onClick={onSwitchToWrite}>
                <Pencil className="size-5" aria-hidden="true" /> Escrever resposta
              </ImButton>
            ) : (
              <ImButton size="md" variant="outline" onClick={onCancel}>
                Voltar às opções
              </ImButton>
            )}
          </div>
        )}
      </ImCard>

      <p className="text-[13px] text-fg/70">A gravação fica só no seu aparelho nesta versão.</p>

      <div className="flex flex-wrap gap-3">
        {state === 'recorded' && url && (
          <ImButton
            size="md"
            data-testid="open-answer-send"
            onClick={() => {
              keepUrl.current = true;
              onSubmit({ url, seconds });
            }}
          >
            Usar esta gravação
          </ImButton>
        )}
        <ImButton variant="outline" size="md" onClick={onCancel} disabled={state === 'recording'} className={cn(state === 'recording' && 'hidden')}>
          Voltar às opções
        </ImButton>
      </div>
    </div>
  );
}

'use client';

import type { SceneDirection } from '@lms/course-schema';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Film, Music, RefreshCw, Upload, UserRound, X } from 'lucide-react';
import type { MediaRef, Presentation } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './confirm-dialog';
import { fetchRecomposeAvailability, presentationBlocker, presentationSummary, requestSceneRecompose, requestSceneVideo, SCRIPT_MAX, type GenerateResult, type RecomposeAvailability } from './generate';
import { ACTIVE_JOB, errorText, jobStatusLabel, type MediaJob } from './use-media-jobs';
import { useSharedMediaQueue } from '../media-queue/use-media-queue';
import { PHASE_LABEL } from '../media-queue/queue-model';

export interface MediaStripProps {
  courseId: string;
  lessonId: string;
  nodeId: string;
  media: MediaRef | undefined;
  /** o que o apresentador vai dizer (fala, ou o texto da cena quando não há fala) */
  script: string;
  /** fala escrita para o apresentador; quando ausente, o servidor usa o texto da cena */
  narration?: string;
  presentation: Presentation;
  latestJob: MediaJob | undefined;
  onMediaChange(media: MediaRef | undefined): void;
  onJobCreated(result: GenerateResult): Promise<void>;
  onJobCanceled(): Promise<void>;
  /** direção da cena (planos), quando houver */
  direction?: SceneDirection;
}

const STATUS_CLASS: Record<MediaJob['status'], string> = {
  queued: 'bg-bg/90 text-fg-muted border border-line',
  running: 'bg-accent-fill text-accent-fill-fg',
  succeeded: 'bg-bg/90 text-success border border-success/40',
  failed: 'bg-bg/90 text-danger border border-danger/40',
  canceled: 'bg-bg/90 text-fg-muted border border-line',
  reconciliation_required: 'bg-bg/90 text-paid border border-paid/40',
};

/**
 * Quadro de vídeo da cena (16:9): o vídeo quando existe; senão o apresentador
 * do curso com o convite para gerar; sem apresentador, um convite para escolher.
 * Abaixo, as ações de arquivo e o estado da geração.
 */
export function MediaStrip({ courseId, lessonId, nodeId, media, script, narration, presentation, latestJob, onMediaChange, onJobCreated, onJobCanceled, direction }: MediaStripProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState<{ progress: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // "Trocar o fundo sem custo": disponível quando a fala já tem vídeo transparente pago e o fundo/posição mudou
  const [recompose, setRecompose] = React.useState<RecomposeAvailability | null>(null);
  const presentationKey = JSON.stringify([presentation.background, presentation.presenterPlacement, presentation.presenterScale, presentation.presenterX, presentation.presenterBottom, presentation.presenterHeadroom, presentation.presenterGrade, presentation.cameras, presentation.avatarId, presentation.voiceId]);
  const mediaKey = media?.generatedFrom?.sceneHash ?? media?.assetId ?? '';
  React.useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      fetchRecomposeAvailability(courseId, lessonId, nodeId).then((r) => alive && setRecompose(r)).catch(() => alive && setRecompose(null));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId, nodeId, presentationKey, mediaKey, latestJob?.status]);

  const blocker = presentationBlocker(presentation);
  const trimmed = script.trim();
  const active = !!latestJob && ACTIVE_JOB.has(latestJob.status);
  // etapa e posição vêm da fila do curso (consulta compartilhada), quando disponível
  const queue = useSharedMediaQueue();
  const queueItem = latestJob ? queue?.itemByJobId.get(latestJob.id) : undefined;
  const simulation = queue?.data?.simulation === true;
  const shots = direction?.shots ?? [];
  // plano só de slide/cartão não passa pelo HeyGen (só áudio); cena em movimento é cobrada à parte (mais cara); os demais viram um clipe cada
  const cinematicShots = shots.filter((s) => s.layout === 'cinematic').length;
  const paidClips = shots.filter((s) => s.layout !== 'cinematic' && ((s.layout !== 'slide' && s.layout !== 'card') || !s.slide)).length;
  const chipLabel = !latestJob
    ? ''
    : active && queueItem
      ? queueItem.phase === 'waiting'
        ? queueItem.position
          ? `#${queueItem.position} na fila`
          : PHASE_LABEL.waiting
        : PHASE_LABEL[queueItem.phase]
      : jobStatusLabel(latestJob);
  // só dá para cancelar o que ainda espera na fila; o que já foi ao HeyGen está pago
  const cancellable = active && (queueItem ? queueItem.phase === 'waiting' : latestJob?.status === 'queued');
  const canGenerate = !blocker && trimmed.length > 0 && !active && !busy;
  const presenterUrl = presentation.avatarPreviewUrl;
  const presenterHref = `/estudio/cursos/${courseId}/montar`;
  // O convite "Gerar vídeo" fica sobre o quadro só quando há apresentador e ainda não há mídia.
  const generateInFrame = !media && !!presenterUrl && !active;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestSceneVideo({ courseId, lessonId, nodeId, narration, presentation });
      setConfirming(false);
      await onJobCreated(r);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma geração em andamento para esta cena.' : errorText(e, 'Não foi possível pedir a geração'));
    } finally {
      setBusy(false);
    }
  };

  const recomposeNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestSceneRecompose({ courseId, lessonId, nodeId, narration, presentation });
      setRecompose(null);
      await onJobCreated(r);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'Já existe uma geração em andamento para esta cena.' : errorText(e, 'Não foi possível pedir a troca de fundo'));
    } finally {
      setBusy(false);
    }
  };

  const sendFile = (file: File) => {
    setUpload({ progress: 0 });
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/assets');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUpload({ progress: Math.round((ev.loaded / ev.total) * 100) });
    };
    xhr.onerror = () => {
      setUpload(null);
      setError('Falha de rede ao enviar o arquivo.');
    };
    xhr.onload = () => {
      let data: { asset?: { id: string; kind: MediaRef['kind'] }; error?: { message?: string } } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* resposta vazia */
      }
      setUpload(null);
      if (xhr.status >= 200 && xhr.status < 300 && data.asset) onMediaChange({ assetId: data.asset.id, kind: data.asset.kind, alt: media?.alt, transcript: media?.transcript });
      else setError(data.error?.message ?? `Erro ${xhr.status} ao enviar o arquivo.`);
      if (fileRef.current) fileRef.current.value = '';
    };
    xhr.send(form);
  };

  const cancelJob = async () => {
    if (!latestJob || !window.confirm('Tirar este vídeo da fila?')) return;
    setBusy(true);
    try {
      await api<{ status: string }>(`/api/media-jobs/${latestJob.id}/cancel`, { method: 'POST' });
      await onJobCanceled();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'Este vídeo já foi enviado ao HeyGen e não pode mais ser cancelado.' : errorText(e, 'Não foi possível cancelar'));
      await onJobCanceled();
    } finally {
      void queue?.refresh();
      setBusy(false);
    }
  };

  const generateButton = (
    <Button size="sm" variant="paid" onClick={() => setConfirming(true)} disabled={!canGenerate} data-testid="media-generate" title={blocker ?? undefined}>
      <Film className="h-4 w-4" aria-hidden="true" /> {media ? 'Gerar de novo' : 'Gerar vídeo'}
    </Button>
  );

  return (
    <div className="space-y-2" data-testid="media-strip">
      {/* Quadro 16:9 */}
      <div className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-surface-2">
        <Frame media={media} presenterUrl={presenterUrl} presenterHref={presenterHref} />
        {generateInFrame && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 max-md:opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <span className="rounded-full bg-bg/90 px-2.5 py-1 text-xs font-medium text-fg-muted backdrop-blur-sm">Sem vídeo ainda</span>
            {generateButton}
          </div>
        )}
        {!generateInFrame && !media && presenterUrl && (
          <span className="absolute bottom-3 left-3 rounded-full bg-bg/90 px-2.5 py-1 text-xs font-medium text-fg-muted backdrop-blur-sm">Sem vídeo ainda</span>
        )}
        {latestJob && (
          <span
            className={cn('absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm', STATUS_CLASS[latestJob.status])}
            data-testid="media-job-chip"
            data-status={latestJob.status}
            title={latestJob.lastError ?? undefined}
          >
            {active && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
            {chipLabel}
          </span>
        )}
      </div>

      {/* Estado e ações */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <span className="font-medium text-fg">{media ? (media.kind === 'video' ? 'Vídeo' : media.kind === 'audio' ? 'Áudio' : 'Imagem') : 'Sem vídeo'}</span>
        {media?.stale && (
          <span className="inline-flex items-center gap-1 rounded-full bg-paid-soft px-2 py-0.5 font-medium text-paid" data-testid="media-stale">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Vídeo desatualizado: a cena mudou desde a geração
          </span>
        )}
        {blocker ? (
          <span>
            {blocker}{' '}
            <Link href={presenterHref} className="font-medium text-accent hover:underline">Abrir Apresentação</Link>
          </span>
        ) : (
          <span>{trimmed.length === 0 ? 'Escreva o texto da cena para poder narrar.' : `${trimmed.length.toLocaleString('pt-BR')} caracteres para narrar`}</span>
        )}
      </div>
      {latestJob?.status === 'failed' && latestJob.lastError && <p className="text-xs text-danger">{latestJob.lastError}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {active ? (
          cancellable ? (
            <Button size="sm" variant="secondary" onClick={() => void cancelJob()} disabled={busy} data-testid="media-cancel">
              Tirar da fila
            </Button>
          ) : (
            <span className="px-1 text-xs text-fg-muted">Em produção no HeyGen; não dá mais para cancelar.</span>
          )
        ) : (
          !generateInFrame && generateButton
        )}
        {!active && recompose?.available && !blocker && (
          <Button size="sm" variant="secondary" onClick={() => void recomposeNow()} disabled={busy} data-testid="media-recompose" title="Remonta o vídeo já pago desta fala sobre o fundo e a posição atuais; só ffmpeg local, nenhum provedor">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Trocar fundo (sem custo)
          </Button>
        )}
        <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface-2 px-3 text-sm font-medium text-fg hover:border-accent/60 hover:bg-accent-soft focus-within:outline focus-within:outline-2 focus-within:outline-accent', upload && 'pointer-events-none opacity-50')}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Enviar arquivo
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
            data-testid="media-upload"
            disabled={!!upload}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendFile(f);
            }}
          />
        </label>
        {media && (
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full"
            aria-label="Remover mídia desta cena"
            onClick={() => {
              if (window.confirm('Remover a mídia desta cena? O arquivo continua na biblioteca.')) onMediaChange(undefined);
            }}
            data-testid="media-remove"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {upload && (
        <div className="space-y-1" role="status" aria-live="polite">
          <p className="text-xs text-fg-muted">Enviando… {upload.progress}%</p>
          <div className="h-1 w-full overflow-hidden rounded bg-line" aria-hidden="true">
            <div className="h-full bg-accent-fill" style={{ width: `${upload.progress}%` }} />
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Gerar vídeo desta cena"
          confirmLabel="Gerar vídeo"
          paid
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void generate()}
          testId="media-confirm"
        >
          <p className="text-sm text-fg-muted">
            {simulation ? (
              <>Modo de demonstração: <strong className="text-fg">nenhuma cobrança</strong>. O vídeo é montado com um apresentador substituto, sem chamar os provedores.</>
            ) : (
              <>Esta é uma <strong className="text-paid">ação paga</strong> nos provedores externos.</>
            )}{' '}
            {narration ? 'O apresentador diz a fala escrita para esta cena.' : 'O apresentador lê o texto da cena (não há fala própria escrita).'}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-fg-muted">Apresentação</dt>
            <dd className="text-fg">{presentationSummary(presentation)}</dd>
            {shots.length > 0 && (
              <>
                <dt className="text-fg-muted">Direção</dt>
                <dd className="text-fg">
                  {shots.length} {shots.length === 1 ? 'plano' : 'planos'} · {paidClips} {paidClips === 1 ? 'clipe do apresentador' : 'clipes do apresentador'}
                  {cinematicShots > 0 && (
                    <span className="text-paid" data-testid="media-confirm-cinematic">
                      {' · '}{cinematicShots} {cinematicShots === 1 ? 'cena em movimento' : 'cenas em movimento'} (mais {cinematicShots === 1 ? 'cara' : 'caras'})
                    </span>
                  )}
                  {cinematicShots > 0 && paidClips > 0 && presentation.directionStyle?.matchCinematicSetting !== false && (
                    <span data-testid="media-confirm-match-setting">{' · '}fundo dos planos: lugar da cena em movimento</span>
                  )}
                  {shots.length > paidClips + cinematicShots && ` · ${shots.length - paidClips - cinematicShots} só com slide`}
                </dd>
              </>
            )}
            <dt className="text-fg-muted">Caracteres</dt>
            <dd className="text-fg">
              {trimmed.length.toLocaleString('pt-BR')} de {SCRIPT_MAX.toLocaleString('pt-BR')}
              {trimmed.length > SCRIPT_MAX && <span className="text-danger"> (o excedente será cortado)</span>}
            </dd>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Conteúdo do quadro: vídeo/imagem da cena, apresentador do curso, ou convite para escolher um. */
function Frame({ media, presenterUrl, presenterHref }: { media: MediaRef | undefined; presenterUrl: string | undefined; presenterHref: string }) {
  const src = media ? `/api/assets/${media.assetId}` : null;
  if (media && src) {
    if (media.kind === 'video') return <video src={src} preload="metadata" muted playsInline className="h-full w-full bg-bg-2 object-cover" aria-label={media.alt || 'Vídeo da cena'} />;
    // eslint-disable-next-line @next/next/no-img-element
    if (media.kind === 'image') return <img src={src} alt={media.alt ?? ''} className="h-full w-full object-cover" />;
    return (
      <div className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {presenterUrl && <img src={presenterUrl} alt="" className="h-full w-full object-cover opacity-70" />}
        <span className="absolute inset-0 flex items-center justify-center text-fg-muted" aria-label="Áudio da cena">
          <Music className="h-6 w-6" aria-hidden="true" />
        </span>
      </div>
    );
  }
  if (presenterUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={presenterUrl} alt="Apresentador do curso" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
        <UserRound className="h-5 w-5" />
      </span>
      <Link href={presenterHref} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-accent underline-offset-2 hover:underline">
        Escolha um apresentador
      </Link>
    </div>
  );
}

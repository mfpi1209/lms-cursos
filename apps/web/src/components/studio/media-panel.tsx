'use client';

import * as React from 'react';
import { AlertTriangle, Film, FolderOpen, Trash2, Upload, X } from 'lucide-react';
import type { MediaRef } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useDraft } from './draft-provider';
import { OverlayPortal } from '@/components/ui/overlay-portal';
import { useFocusTrap } from '@/components/ui/focus-trap';

/* ------------------------------------------------------------------ */
/* Tipos da API                                                        */
/* ------------------------------------------------------------------ */

type AssetKind = MediaRef['kind'];
interface AssetRow { id: string; kind: AssetKind; mimeType: string; sizeBytes: number; originalName: string | null; createdAt: string; transcript: string | null; source: string }
interface Capabilities {
  simulation: boolean;
  providers: { heygen: boolean; elevenlabs: boolean };
  limits: { scriptMaxChars: number; elevenLabsMaxChars: number };
  elevenLabsModelId?: string;
  costEstimateAvailable: boolean;
}
interface AvatarLook { id: string; name: string; previewImageUrl?: string; previewVideoUrl?: string; gender?: string; defaultVoiceId?: string }
interface Voice { id: string; name: string; language?: string; previewUrl?: string }
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required';
interface MediaJob {
  id: string;
  lessonId: string;
  nodeId: string;
  kind: string;
  provider: string;
  status: JobStatus;
  simulated: boolean;
  sceneHash: string;
  externalId: string | null;
  outputAssetId: string | null;
  outputUrl: string | null;
  attempts: number;
  lastError: string | null;
  costEstimatedUsd: number | null;
  costActualUsd: number | null;
  input: { avatarId: string; voiceProvider: 'heygen' | 'elevenlabs'; voiceId: string | null; scriptChars: number; estimate?: Estimate };
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
interface Estimate { characters: number; narrationSeconds: number; elevenLabsCredits: number; heygenCreditsUsd: number | null; note: string }

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Na fila',
  running: 'Em processamento',
  succeeded: 'Concluído',
  failed: 'Falhou',
  canceled: 'Cancelado',
  reconciliation_required: 'Requer conferência manual',
};
const JOB_TONE: Record<JobStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  queued: 'neutral',
  running: 'warning',
  succeeded: 'success',
  failed: 'danger',
  canceled: 'neutral',
  reconciliation_required: 'warning',
};
const ACTIVE: ReadonlySet<JobStatus> = new Set(['queued', 'running']);
const SCRIPT_MAX_DEFAULT = 5000;
const POLL_MS = 5000;

/** Mesma fórmula do pacote de mídia (150 palavras/min), só para exibir antes do POST. */
function estimateNarrationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 150) * 60));
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export interface MediaPanelProps {
  courseId: string;
  lessonId: string;
  nodeId: string;
  media: MediaRef | undefined;
  /** roteiro padrão (texto do bloco) */
  scriptDefault: string;
  onChange(media: MediaRef | undefined, coalesce?: string): void;
}

type Mode = 'idle' | 'library' | 'generate';

export function MediaPanel({ courseId, lessonId, nodeId, media, scriptDefault, onChange }: MediaPanelProps) {
  const { status: draftStatus, reload } = useDraft();
  const [mode, setMode] = React.useState<Mode>('idle');
  const [uploadState, setUploadState] = React.useState<{ busy: boolean; progress: number | null; error: string | null }>({ busy: false, progress: null, error: null });
  const [jobs, setJobs] = React.useState<MediaJob[] | null>(null);
  const [jobsError, setJobsError] = React.useState<string | null>(null);
  const [readyNotice, setReadyNotice] = React.useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const prevJobsRef = React.useRef<Map<string, JobStatus>>(new Map());
  const draftStatusRef = React.useRef(draftStatus);
  draftStatusRef.current = draftStatus;

  /* ---- jobs: carga + polling ---- */
  const loadJobs = React.useCallback(async () => {
    try {
      const r = await api<{ jobs: MediaJob[] }>(`/api/courses/${courseId}/media-jobs?lessonId=${encodeURIComponent(lessonId)}&nodeId=${encodeURIComponent(nodeId)}`);
      const sorted = [...r.jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setJobs(sorted);
      setJobsError(null);
      // transição para concluído: traz a mídia anexada pelo worker (se não há trabalho local)
      for (const j of sorted) {
        const prev = prevJobsRef.current.get(j.id);
        if (prev && ACTIVE.has(prev) && j.status === 'succeeded') await onJobSucceeded(j);
      }
      prevJobsRef.current = new Map(sorted.map((j) => [j.id, j.status]));
    } catch (e) {
      setJobsError(errorMessage(e, 'Não foi possível carregar os jobs'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId, nodeId]);

  async function onJobSucceeded(j: MediaJob) {
    if (!j.outputAssetId) {
      setReadyNotice('Job simulado concluído: nenhum vídeo foi produzido (nenhum provedor configurado).');
      return;
    }
    if (j.simulated) {
      try {
        if (draftStatusRef.current === 'saved') await reload();
      } catch {
        /* a prévia aparece ao recarregar */
      }
      setReadyNotice('Prévia simulada pronta: um vídeo substituto (cartão de marca) foi anexado à cena; nenhum provedor foi chamado.');
      return;
    }
    if (draftStatusRef.current === 'saved') {
      try {
        await reload();
        setReadyNotice('Vídeo pronto: a mídia gerada foi anexada ao bloco.');
      } catch {
        setReadyNotice('Vídeo pronto — recarregue para ver a mídia anexada.');
      }
    } else {
      setReadyNotice('Vídeo pronto — salve ou recarregue para ver a mídia anexada.');
    }
  }

  React.useEffect(() => {
    prevJobsRef.current = new Map();
    setJobs(null);
    setReadyNotice(null);
    void loadJobs();
  }, [loadJobs]);

  const hasActive = !!jobs?.some((j) => ACTIVE.has(j.status));
  React.useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void loadJobs(), POLL_MS);
    return () => clearInterval(t);
  }, [hasActive, loadJobs]);

  /* ---- upload ---- */
  const upload = (file: File) => {
    setUploadState({ busy: true, progress: 0, error: null });
    const form = new FormData();
    form.append('file', file);
    if (media?.transcript) form.append('transcript', media.transcript);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/assets');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadState((s) => ({ ...s, progress: Math.round((ev.loaded / ev.total) * 100) }));
    };
    xhr.onerror = () => setUploadState({ busy: false, progress: null, error: 'Falha de rede ao enviar o arquivo' });
    xhr.onload = () => {
      let data: { asset?: { id: string; kind: AssetKind }; error?: { message?: string } } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* resposta vazia */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.asset) {
        onChange({ assetId: data.asset.id, kind: data.asset.kind, alt: media?.alt, transcript: media?.transcript });
        setUploadState({ busy: false, progress: null, error: null });
        setMode('idle');
      } else {
        setUploadState({ busy: false, progress: null, error: data.error?.message ?? `Erro ${xhr.status} ao enviar` });
      }
      if (fileRef.current) fileRef.current.value = '';
    };
    xhr.send(form);
  };

  const latestJob = jobs?.[0] ?? null;

  return (
    <section aria-labelledby={`media-heading-${nodeId}`} className="space-y-4 rounded-lg border border-line bg-surface-2/40 p-3" data-testid="media-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`media-heading-${nodeId}`} className="text-sm font-semibold text-fg">Mídia da cena</h3>
        <p className="text-xs text-fg-muted">Opcional. Vídeo nunca é pré-requisito para o aluno avançar.</p>
      </div>

      {media ? (
        <CurrentMedia nodeId={nodeId} media={media} onChange={onChange} />
      ) : (
        <p className="text-sm text-fg-muted">Nenhuma mídia anexada a este bloco.</p>
      )}

      {readyNotice && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          {readyNotice}
        </p>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <label className={cn('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-surface-2 focus-within:outline focus-within:outline-2 focus-within:outline-accent', uploadState.busy && 'pointer-events-none opacity-50')}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Enviar arquivo
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
            data-testid="media-upload"
            disabled={uploadState.busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </label>
        <Button variant="secondary" size="sm" aria-expanded={mode === 'library'} onClick={() => setMode((m) => (m === 'library' ? 'idle' : 'library'))} data-testid="media-library">
          <FolderOpen className="h-4 w-4" aria-hidden="true" /> Escolher da biblioteca
        </Button>
        <Button variant="paid" size="sm" aria-expanded={mode === 'generate'} onClick={() => setMode((m) => (m === 'generate' ? 'idle' : 'generate'))} data-testid="media-generate">
          <Film className="h-4 w-4" aria-hidden="true" /> Gerar vídeo com avatar
        </Button>
      </div>
      {uploadState.busy && (
        <div className="space-y-1" role="status" aria-live="polite">
          <p className="text-xs text-fg-muted">Enviando… {uploadState.progress ?? 0}%</p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-line" aria-hidden="true">
            <div className="h-full bg-accent-fill" style={{ width: `${uploadState.progress ?? 0}%` }} />
          </div>
        </div>
      )}
      {uploadState.error && <p role="alert" className="text-sm text-danger">{uploadState.error}</p>}

      {mode === 'library' && (
        <LibraryPicker
          onPick={(a) => {
            onChange({ assetId: a.id, kind: a.kind, alt: media?.alt, transcript: a.transcript ?? media?.transcript ?? undefined });
            setMode('idle');
          }}
          onClose={() => setMode('idle')}
        />
      )}

      {mode === 'generate' && (
        <GenerateFlow
          courseId={courseId}
          lessonId={lessonId}
          nodeId={nodeId}
          scriptDefault={scriptDefault}
          hasOpenJob={hasActive}
          onClose={() => setMode('idle')}
          onCreated={async (r) => {
            setMode('idle');
            if (r.reused) {
              setReadyNotice(null);
              await onJobSucceeded(r.job);
            }
            await loadJobs();
          }}
        />
      )}

      {jobsError && <p role="alert" className="text-sm text-danger">{jobsError}</p>}
      {latestJob && (
        <JobCard
          job={latestJob}
          busy={cancelBusy}
          onCancel={async () => {
            if (!window.confirm('Cancelar este job de geração?')) return;
            setCancelBusy(true);
            try {
              await api<{ status: string }>(`/api/media-jobs/${latestJob.id}/cancel`, { method: 'POST' });
              await loadJobs();
            } catch (e) {
              setJobsError(errorMessage(e, 'Não foi possível cancelar'));
            } finally {
              setCancelBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mídia atual                                                         */
/* ------------------------------------------------------------------ */

function CurrentMedia({ nodeId, media, onChange }: { nodeId: string; media: MediaRef; onChange: MediaPanelProps['onChange'] }) {
  const src = `/api/assets/${media.assetId}`;
  return (
    <div className="space-y-3" data-testid="media-current">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{media.kind === 'video' ? 'Vídeo' : media.kind === 'audio' ? 'Áudio' : 'Imagem'}</Badge>
        {media.generatedFrom && <Badge tone="brand">Gerada por avatar{media.generatedFrom.simulated ? ' (simulada)' : ''}</Badge>}
        {media.stale && (
          <Badge tone="warning" data-testid="media-stale">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" /> Desatualizada — o texto mudou depois da geração
          </Badge>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-bg-2">
        {media.kind === 'video' && <video controls preload="metadata" src={src} className="max-h-72 w-full bg-bg-2" aria-label={media.alt || 'Vídeo da cena'} />}
        {media.kind === 'audio' && (
          <div className="p-3">
            <audio controls preload="metadata" src={src} className="w-full" aria-label={media.alt || 'Áudio da cena'} />
          </div>
        )}
        {media.kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={media.alt ?? ''} className="max-h-72 w-full object-contain" />
        )}
      </div>
      <Field label="Texto alternativo" htmlFor={`media-alt-${nodeId}`} hint="Descrição curta para quem não vê a mídia.">
        <Input id={`media-alt-${nodeId}`} maxLength={300} value={media.alt ?? ''} onChange={(e) => onChange({ ...media, alt: e.target.value || undefined }, `media.alt.${nodeId}`)} />
      </Field>
      <Field label="Transcrição" htmlFor={`media-transcript-${nodeId}`} hint="Obrigatória para acessibilidade de áudio e vídeo.">
        <Textarea
          id={`media-transcript-${nodeId}`}
          rows={3}
          maxLength={20000}
          value={media.transcript ?? ''}
          onChange={(e) => onChange({ ...media, transcript: e.target.value || undefined }, `media.transcript.${nodeId}`)}
        />
      </Field>
      <p className="text-xs text-fg-muted">Asset: {media.assetId}</p>
      <Button
        variant="secondary"
        size="sm"
        className="text-danger"
        data-testid="media-remove"
        onClick={() => {
          if (window.confirm('Remover a mídia deste bloco? O arquivo continua na biblioteca.')) onChange(undefined);
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover mídia
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Biblioteca                                                          */
/* ------------------------------------------------------------------ */

function LibraryPicker({ onPick, onClose }: { onPick: (a: AssetRow) => void; onClose: () => void }) {
  const [kind, setKind] = React.useState<'' | AssetKind>('');
  const [assets, setAssets] = React.useState<AssetRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setAssets(null);
    setError(null);
    api<{ assets: AssetRow[] }>(`/api/assets${kind ? `?kind=${kind}` : ''}`)
      .then((r) => setAssets(r.assets))
      .catch((e) => setError(errorMessage(e, 'Não foi possível carregar a biblioteca')));
  }, [kind]);
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3" data-testid="media-library-list">
      <div className="flex items-end justify-between gap-2">
        <Field label="Tipo" htmlFor="media-library-kind">
          <select id="media-library-kind" className="block min-h-11 rounded-lg border border-line bg-surface-2 px-2 text-sm text-fg" value={kind} onChange={(e) => setKind(e.target.value as '' | AssetKind)}>
            <option value="">Todos</option>
            <option value="image">Imagens</option>
            <option value="audio">Áudios</option>
            <option value="video">Vídeos</option>
          </select>
        </Field>
        <Button variant="ghost" size="sm" aria-label="Fechar biblioteca" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!assets && !error && <p className="text-sm text-fg-muted">Carregando…</p>}
      {assets && assets.length === 0 && <p className="text-sm text-fg-muted">Nenhum arquivo na biblioteca.</p>}
      <ul className="max-h-64 space-y-1 overflow-auto">
        {assets?.map((a) => (
          <li key={a.id}>
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-surface px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => onPick(a)}>
              <span className="min-w-0 truncate">
                <span className="mr-2 text-xs text-fg-muted">{a.kind}</span>
                {a.originalName ?? a.id}
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                {Math.round(a.sizeBytes / 1024)} KB · {formatDate(a.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Geração com avatar                                                  */
/* ------------------------------------------------------------------ */

interface CreateResponse { reused: boolean; job: MediaJob; estimate: Estimate }

function GenerateFlow({
  courseId,
  lessonId,
  nodeId,
  scriptDefault,
  hasOpenJob,
  onClose,
  onCreated,
}: {
  courseId: string;
  lessonId: string;
  nodeId: string;
  scriptDefault: string;
  hasOpenJob: boolean;
  onClose: () => void;
  onCreated: (r: CreateResponse) => Promise<void>;
}) {
  const [caps, setCaps] = React.useState<Capabilities | null>(null);
  const [capsError, setCapsError] = React.useState<string | null>(null);
  const [avatars, setAvatars] = React.useState<{ looks: AvatarLook[]; nextToken?: string; loading: boolean; error: string | null }>({ looks: [], loading: true, error: null });
  const [voiceProvider, setVoiceProvider] = React.useState<'heygen' | 'elevenlabs'>('heygen');
  const [voices, setVoices] = React.useState<{ list: Voice[]; nextToken?: string; loading: boolean; error: string | null }>({ list: [], loading: true, error: null });
  const [avatarId, setAvatarId] = React.useState('');
  const [voiceId, setVoiceId] = React.useState('');
  const [script, setScript] = React.useState(scriptDefault.slice(0, SCRIPT_MAX_DEFAULT));
  const [aspectRatio, setAspectRatio] = React.useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [backgroundColor, setBackgroundColor] = React.useState('#ffffff');
  const [confirming, setConfirming] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const scriptMax = caps?.limits.scriptMaxChars ?? SCRIPT_MAX_DEFAULT;

  React.useEffect(() => {
    api<Capabilities>('/api/media/capabilities')
      .then(setCaps)
      .catch((e) => setCapsError(errorMessage(e, 'Não foi possível consultar os provedores')));
  }, []);

  const loadAvatars = React.useCallback(async (token?: string) => {
    setAvatars((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await api<{ simulation: boolean; looks: AvatarLook[]; nextToken?: string }>(`/api/media/avatars${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      setAvatars((s) => ({ looks: token ? [...s.looks, ...r.looks] : r.looks, nextToken: r.nextToken, loading: false, error: null }));
    } catch (e) {
      setAvatars((s) => ({ ...s, loading: false, error: errorMessage(e, 'Não foi possível carregar avatares') }));
    }
  }, []);

  const loadVoices = React.useCallback(
    async (provider: 'heygen' | 'elevenlabs', token?: string) => {
      setVoices((s) => ({ ...s, loading: true, error: null }));
      try {
        const r = await api<{ simulation: boolean; voices: Voice[]; nextToken?: string }>(`/api/media/voices?provider=${provider}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
        setVoices((s) => ({ list: token ? [...s.list, ...r.voices] : r.voices, nextToken: r.nextToken, loading: false, error: null }));
      } catch (e) {
        setVoices((s) => ({ ...s, loading: false, error: errorMessage(e, 'Não foi possível carregar vozes') }));
      }
    },
    [],
  );

  React.useEffect(() => {
    void loadAvatars();
  }, [loadAvatars]);
  React.useEffect(() => {
    setVoiceId('');
    setVoices({ list: [], loading: true, error: null });
    void loadVoices(voiceProvider);
  }, [voiceProvider, loadVoices]);

  const trimmed = script.trim();
  const canReview = !!avatarId && trimmed.length > 0 && trimmed.length <= scriptMax && !hasOpenJob && !submitting;
  const estimate: Estimate = {
    characters: trimmed.length,
    narrationSeconds: estimateNarrationSeconds(trimmed),
    elevenLabsCredits: voiceProvider === 'elevenlabs' ? trimmed.length : 0,
    heygenCreditsUsd: null,
    note: '',
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api<CreateResponse>(`/api/courses/${courseId}/media-jobs`, {
        json: { lessonId, nodeId, avatarId, voiceProvider, voiceId: voiceId || null, script: trimmed, aspectRatio, backgroundColor, confirmPaid: true },
      });
      setConfirming(false);
      await onCreated(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSubmitError('Já existe um job em andamento para este bloco. Aguarde ou cancele-o antes de gerar outro.');
      } else {
        setSubmitError(errorMessage(e, 'Não foi possível criar o job'));
      }
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-3" data-testid="media-generate-flow">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-fg">Gerar vídeo com avatar</h4>
          <p className="text-xs text-paid">Ação explícita e paga. Nada é gerado automaticamente ao editar o texto.</p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Fechar geração" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {capsError && <p role="alert" className="text-sm text-danger">{capsError}</p>}
      {caps?.simulation && (
        <p role="status" className="rounded-md bg-paid-soft px-3 py-2 text-sm text-paid" data-testid="media-simulation-banner">
          <strong>Modo de demonstração:</strong> nenhum provedor configurado — o job é simulado e anexa uma prévia substituta (cartão de marca) à cena, sem custo.
        </p>
      )}
      {hasOpenJob && <p className="rounded-md bg-paid-soft px-3 py-2 text-sm text-paid">Há um job em andamento para este bloco. Aguarde ou cancele-o para gerar outro.</p>}

      {/* Avatar */}
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-fg-muted">Avatar</legend>
        {avatars.error && <p role="alert" className="text-sm text-danger">{avatars.error}</p>}
        <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3" aria-label="Avatares disponíveis">
          {avatars.looks.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={avatarId === a.id}
                onClick={() => {
                  setAvatarId(a.id);
                  if (a.defaultVoiceId && voiceProvider === 'heygen' && !voiceId) setVoiceId(a.defaultVoiceId);
                }}
                className={cn('flex w-full flex-col items-stretch gap-1 rounded-lg border bg-surface p-1 text-left text-xs text-fg hover:bg-surface-2', avatarId === a.id ? 'border-accent ring-2 ring-accent/30' : 'border-line')}
                data-testid={`avatar-${a.id}`}
              >
                {a.previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewImageUrl} alt="" className="aspect-square w-full rounded object-cover" />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center rounded bg-surface-2 text-fg-faint" aria-hidden="true">sem prévia</span>
                )}
                <span className="truncate px-1 font-medium">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {avatars.loading && <p className="mt-1 text-xs text-fg-muted">Carregando avatares…</p>}
        {avatars.nextToken && !avatars.loading && (
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => void loadAvatars(avatars.nextToken)}>Carregar mais avatares</Button>
        )}
      </fieldset>

      {/* Voz */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg-muted">Voz</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={`voice-provider-${nodeId}`} value="heygen" checked={voiceProvider === 'heygen'} onChange={() => setVoiceProvider('heygen')} /> Voz do HeyGen
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`voice-provider-${nodeId}`}
              value="elevenlabs"
              checked={voiceProvider === 'elevenlabs'}
              disabled={caps ? !caps.providers.elevenlabs && !caps.simulation : false}
              onChange={() => setVoiceProvider('elevenlabs')}
            />{' '}
            Voz do ElevenLabs
          </label>
        </div>
        <div>
          <Label htmlFor={`voice-${nodeId}`}>Selecionar voz</Label>
          <select id={`voice-${nodeId}`} className="block min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-base text-fg" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            <option value="">{voiceProvider === 'heygen' ? 'Voz padrão do avatar' : '— selecione —'}</option>
            {voices.list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.language ? ` (${v.language})` : ''}
              </option>
            ))}
          </select>
          {voices.error && <p role="alert" className="mt-1 text-xs text-danger">{voices.error}</p>}
          {voices.loading && <p className="mt-1 text-xs text-fg-muted">Carregando vozes…</p>}
          {voices.nextToken && !voices.loading && (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => void loadVoices(voiceProvider, voices.nextToken)}>Carregar mais vozes</Button>
          )}
        </div>
      </fieldset>

      {/* Roteiro */}
      <div>
        <Label htmlFor={`script-${nodeId}`}>Roteiro narrado</Label>
        <Textarea id={`script-${nodeId}`} rows={5} value={script} maxLength={scriptMax} onChange={(e) => setScript(e.target.value)} aria-describedby={`script-count-${nodeId}`} />
        <p id={`script-count-${nodeId}`} className={cn('mt-1 text-xs', trimmed.length > scriptMax ? 'text-danger' : 'text-fg-muted')}>
          {trimmed.length}/{scriptMax} caracteres{trimmed.length === 0 && ' — o roteiro não pode ficar vazio'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proporção" htmlFor={`aspect-${nodeId}`}>
          <select id={`aspect-${nodeId}`} className="block min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-base text-fg" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}>
            <option value="16:9">16:9 (paisagem)</option>
            <option value="9:16">9:16 (retrato)</option>
            <option value="1:1">1:1 (quadrado)</option>
          </select>
        </Field>
        <Field label="Cor de fundo" htmlFor={`bg-${nodeId}`}>
          <input id={`bg-${nodeId}`} type="color" className="block h-11 w-full rounded-lg border border-line bg-surface-2 p-1" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
        </Field>
      </div>

      {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="paid" disabled={!canReview} onClick={() => setConfirming(true)} data-testid="media-generate-review">
          Revisar e gerar
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>

      {confirming && (
        <ConfirmDialog
          estimate={estimate}
          simulation={!!caps?.simulation}
          voiceProvider={voiceProvider}
          busy={submitting}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submit()}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  estimate,
  simulation,
  voiceProvider,
  busy,
  onCancel,
  onConfirm,
}: {
  estimate: Estimate;
  simulation: boolean;
  voiceProvider: 'heygen' | 'elevenlabs';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  // foco inicial no confirmar, Tab circula, Esc cancela, foco volta a "Revisar e gerar"
  useFocusTrap(dialogRef, {
    initialFocus: confirmRef,
    onEscape: () => {
      if (!busy) onCancelRef.current();
    },
  });
  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/75 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="media-confirm-title" className="rise w-full max-w-md space-y-3 rounded-[var(--radius-card)] border border-line-strong bg-surface p-5 shadow-2xl" data-testid="media-confirm-dialog">
        <h4 id="media-confirm-title" className="text-lg font-semibold text-fg">Confirmar geração paga</h4>
        <p className="text-sm text-fg-muted">
          Esta é uma <strong className="text-paid">ação paga</strong> nos provedores externos. O vídeo será gerado para esta cena apenas após sua confirmação.
        </p>
        {simulation && <p className="rounded-md bg-paid-soft px-3 py-2 text-sm text-paid">Modo de demonstração: o job será simulado e nenhum vídeo será produzido.</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-fg-muted">Caracteres</dt>
          <dd className="text-fg">{estimate.characters}</dd>
          <dt className="text-fg-muted">Narração estimada</dt>
          <dd className="text-fg">{estimate.narrationSeconds} s</dd>
          {voiceProvider === 'elevenlabs' && (
            <>
              <dt className="text-fg-muted">Créditos ElevenLabs</dt>
              <dd className="text-fg">{estimate.elevenLabsCredits}</dd>
            </>
          )}
          <dt className="text-fg-muted">Custo HeyGen</dt>
          <dd className="text-fg">{estimate.heygenCreditsUsd === null ? 'Custo em moeda indisponível' : `US$ ${estimate.heygenCreditsUsd.toFixed(2)}`}</dd>
        </dl>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button ref={confirmRef} size="sm" variant="paid" onClick={onConfirm} disabled={busy} data-testid="media-generate-confirm">
            {busy ? 'Enviando…' : 'Confirmar e gerar'}
          </Button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

/* ------------------------------------------------------------------ */
/* Card do job                                                         */
/* ------------------------------------------------------------------ */

function JobCard({ job, busy, onCancel }: { job: MediaJob; busy: boolean; onCancel: () => void }) {
  const active = ACTIVE.has(job.status);
  const simulatedDone = job.status === 'succeeded' && (job.simulated || !job.outputAssetId);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-sm text-fg" data-testid="media-job-status" data-status={job.status} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{job.provider === 'local-adjust' ? 'Ajuste fino (grátis)' : 'Job de vídeo'}</span>
          <Badge tone={JOB_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
          {job.simulated && <Badge tone="warning">Simulado</Badge>}
        </div>
        {active && (
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy} data-testid="media-job-cancel">
            {busy ? 'Cancelando…' : 'Cancelar'}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs text-fg-muted">
        <dt>Provedor</dt>
        <dd className="text-fg">{job.provider}{job.input.voiceProvider === 'elevenlabs' ? ' + elevenlabs' : ''}</dd>
        <dt>Tentativas</dt>
        <dd className="text-fg">{job.attempts}</dd>
        <dt>Criado</dt>
        <dd className="text-fg">{formatDate(job.createdAt)}</dd>
        {job.finishedAt && (
          <>
            <dt>Finalizado</dt>
            <dd className="text-fg">{formatDate(job.finishedAt)}</dd>
          </>
        )}
        {job.costActualUsd !== null && (
          <>
            <dt>Custo real</dt>
            <dd className="text-fg">US$ {job.costActualUsd.toFixed(2)}</dd>
          </>
        )}
      </dl>
      {active && <p className="text-xs text-fg-muted">Atualizando a cada 5 segundos…</p>}
      {simulatedDone && <p className="rounded-md bg-paid-soft px-2 py-1 text-xs text-paid">Concluído em modo simulado: nenhum vídeo foi produzido.</p>}
      {job.lastError && (
        <p className={cn('rounded-md px-2 py-1 text-xs', job.status === 'failed' || job.status === 'reconciliation_required' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted')}>
          {job.lastError}
        </p>
      )}
      {job.outputUrl && (
        <a href={job.outputUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">
          Abrir vídeo gerado
        </a>
      )}
    </div>
  );
}

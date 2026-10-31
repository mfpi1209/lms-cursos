'use client';

import * as React from 'react';
import { Check, Loader2, Music, Play, Sparkles, Star, Trash2, Upload } from 'lucide-react';
import { BUMPER_PLAY_ON, BUMPER_PLAY_ON_LABELS, type BumperBranding, type BumperPlayOn } from '@lms/course-schema';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { useDraft } from '@/components/studio/draft-provider';
import { errorMessage } from '@/components/studio/wizard/agent-api';

/**
 * Construtor de vinheta ("Vinheta da marca"): assinatura animada + sonora no
 * fim da aula/curso. A prévia é GRATUITA (render local no worker; nenhum
 * provedor). O som por IA é a única ação paga, em duas etapas e desabilitada
 * em modo de demonstração. Guarda no curso só `branding.bumper` (qual vinheta,
 * quando tocar, se pode pular); a vinheta padrão do workspace é o asset
 * marcado como padrão.
 */
type Style = 'reveal' | 'sweep' | 'pulse';
type Variant = 'light' | 'navy';
type Preset = 'warm' | 'bright' | 'minimal';
type SoundMode = 'synth' | 'file' | 'ai';

interface Bumper {
  id: string;
  url: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  hash: string;
  name?: string;
  default: boolean;
  verticalAssetId?: string;
  verticalUrl?: string;
  spec: Record<string, unknown>;
  createdAt: string;
}
interface Job { id: string; status: string; lastError: string | null; outputAssetId: string | null }
interface Listing {
  bumpers: Bumper[];
  defaults: { '16:9': string | null; '9:16': string | null };
  jobs: Job[];
  builder: { style: Style; variant: Variant; durationSec: number; tagline: string; audio: Preset; brandName: string; logoLight: string | null; logoDark: string | null };
  aiSound: { available: boolean; simulation: boolean };
}

const STYLES: { value: Style; label: string; hint: string }[] = [
  { value: 'reveal', label: 'Revelar', hint: 'O logo surge da esquerda para a direita; a frase aparece em seguida.' },
  { value: 'sweep', label: 'Varredura', hint: 'Uma barra laranja atravessa a tela e deixa o logo atrás.' },
  { value: 'pulse', label: 'Pulso', hint: 'O logo cresce com um leve pulso; a frase é digitada.' },
];
const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: 'warm', label: 'Quente', hint: '3 notas subindo, com um fundo suave' },
  { value: 'bright', label: 'Brilhante', hint: '2 notas, mais agudo e vivo' },
  { value: 'minimal', label: 'Mínimo', hint: 'Um único tom suave' },
];

const PHASE_LABEL: Record<string, string> = { queued: 'Na fila…', running: 'Renderizando a vinheta…', succeeded: 'Pronta', failed: 'Falhou', canceled: 'Cancelada' };

export function BumperBuilder() {
  const { document: doc, update } = useDraft();
  const courseBumper: BumperBranding | undefined = doc.branding.bumper;
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try {
      setListing(await api<Listing>('/api/media/bumpers'));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e, 'Não foi possível carregar as vinhetas'));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  // formulário (pré-preenchido pelo preset de marca)
  const [style, setStyle] = React.useState<Style>('reveal');
  const [variant, setVariant] = React.useState<Variant>('light');
  const [duration, setDuration] = React.useState(4);
  const [tagline, setTagline] = React.useState('');
  const [sound, setSound] = React.useState<SoundMode>('synth');
  const [preset, setPreset] = React.useState<Preset>('warm');
  const [fileAsset, setFileAsset] = React.useState<{ id: string; name: string } | null>(null);
  const [seeded, setSeeded] = React.useState(false);
  React.useEffect(() => {
    if (!listing || seeded) return;
    setStyle(listing.builder.style);
    setVariant(listing.builder.variant);
    setDuration(listing.builder.durationSec);
    setTagline(listing.builder.tagline);
    setPreset(listing.builder.audio);
    setSeeded(true);
  }, [listing, seeded]);

  // geração (gratuita) + acompanhamento
  const [job, setJob] = React.useState<Job | null>(null);
  const [outputs, setOutputs] = React.useState<Bumper[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aspect, setAspect] = React.useState<'16:9' | '9:16'>('16:9');
  React.useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    const id = setInterval(async () => {
      try {
        const r = await api<{ job: Job; outputs: Bumper[] }>(`/api/media/bumpers/jobs/${encodeURIComponent(job.id)}`);
        setJob(r.job);
        if (r.job.status === 'succeeded') {
          setOutputs(r.outputs);
          void load();
        }
      } catch (e) {
        setError(errorMessage(e, 'Não foi possível acompanhar a vinheta'));
      }
    }, 1500);
    return () => clearInterval(id);
  }, [job, load]);

  const generate = async (setDefault = false) => {
    setBusy(true);
    setError(null);
    setOutputs([]);
    try {
      const audio = sound === 'synth' ? { kind: 'synth', preset } : fileAsset ? { kind: 'file', assetId: fileAsset.id } : { kind: 'none' };
      const r = await api<{ job: Job; existing: boolean }>('/api/media/bumpers', { json: { style, variant, durationSec: duration, tagline, audio, aspects: ['16:9', '9:16'], setDefault, name: `${STYLES.find((s) => s.value === style)?.label} · ${variant === 'light' ? 'claro' : 'marinho'} · ${duration}s` } });
      setJob(r.job);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível gerar a vinheta'));
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ asset: { id: string; kind: string; originalName?: string } }>('/api/assets', { method: 'POST', body: fd });
      if (r.asset.kind !== 'audio') throw new Error('Envie um arquivo de áudio (MP3, WAV ou OGG)');
      setFileAsset({ id: r.asset.id, name: r.asset.originalName ?? file.name });
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível enviar o áudio'));
    }
  };

  const setDefault = async (id: string) => {
    setError(null);
    try {
      await api(`/api/media/bumpers/${encodeURIComponent(id)}`, { method: 'PATCH', json: { default: true } });
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível definir a vinheta padrão'));
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Excluir esta vinheta do workspace?')) return;
    setError(null);
    try {
      await api(`/api/media/bumpers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setOutputs((o) => o.filter((b) => b.id !== id && b.verticalAssetId !== id));
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível excluir a vinheta'));
    }
  };

  // vinheta do curso: `branding.bumper`
  const setCourse = (patch: Partial<BumperBranding>) =>
    update((d) => {
      const cur = d.branding.bumper ?? { playOn: ['course_end'] as BumperPlayOn[], skippable: true };
      const next = { ...cur, ...patch };
      for (const k of Object.keys(patch) as Array<keyof BumperBranding>) if (patch[k] === undefined) delete next[k];
      return { ...d, branding: { ...d.branding, bumper: next } };
    });
  const togglePlayOn = (on: BumperPlayOn, checked: boolean) => {
    const cur = new Set(courseBumper?.playOn ?? ['course_end']);
    if (checked) cur.add(on);
    else cur.delete(on);
    setCourse({ playOn: BUMPER_PLAY_ON.filter((x) => cur.has(x)) });
  };

  const ready = outputs.find((o) => o.aspect === '16:9') ?? outputs[0];
  const readyVertical = outputs.find((o) => o.aspect === '9:16');
  const preview = aspect === '9:16' ? readyVertical ?? ready : ready;
  const workspaceDefault = listing?.bumpers.find((b) => b.default && b.aspect === '16:9');
  const courseChoice = courseBumper?.assetId ? listing?.bumpers.find((b) => b.id === courseBumper.assetId) : undefined;
  const inflight = job && (job.status === 'queued' || job.status === 'running');
  const sliderClass = 'w-full accent-[var(--color-accent)] disabled:opacity-50';

  return (
    <section aria-labelledby="bumper-title" className="@container space-y-6" data-testid="bumper-builder">
      <div>
        <h2 id="bumper-title" className="font-display text-xl font-bold">Vinheta da marca</h2>
        <p className="mt-1 text-sm text-fg-muted">Assinatura animada e sonora de 3 a 5 segundos no fim da aula. Gerada aqui mesmo, sem custo; o som por IA é a única opção paga.</p>
      </div>
      {loadError && <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">{loadError}</p>}

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---- formulário ---- */}
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">Estilo</legend>
            <div className="grid gap-2 @md:grid-cols-3" role="radiogroup" aria-label="Estilo da vinheta">
              {STYLES.map((s) => {
                const active = style === s.value;
                return (
                  <button key={s.value} type="button" role="radio" aria-checked={active} onClick={() => setStyle(s.value)} data-testid={`bumper-style-${s.value}`} className={cn('rounded-2xl border-2 bg-surface p-3 text-left transition-colors', active ? 'border-accent' : 'border-line hover:border-line-strong')}>
                    <span className="block text-sm font-semibold text-fg">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{s.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 @md:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">Fundo</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Fundo da vinheta">
                {(['light', 'navy'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={variant === v} onClick={() => setVariant(v)} data-testid={`bumper-variant-${v}`} className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium', variant === v ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:border-line-strong')}>
                    <span aria-hidden="true" className={cn('size-3.5 rounded-full border border-line-strong', v === 'light' ? 'bg-[#F4F7FA]' : 'bg-[#1D1E4C]')} />
                    {v === 'light' ? 'Claro' : 'Marinho'}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="bumper-duration" className="mb-2 block text-sm font-medium text-fg">Duração: {duration.toFixed(1).replace('.0', '')} s</label>
              <input id="bumper-duration" type="range" min={3} max={5} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={sliderClass} data-testid="bumper-duration" />
              <div className="mt-1 flex justify-between text-xs text-fg-faint"><span>3 s</span><span>5 s</span></div>
            </div>
          </div>

          <div>
            <label htmlFor="bumper-tagline" className="mb-1 block text-sm font-medium text-fg">Frase</label>
            <Input id="bumper-tagline" maxLength={60} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Slogan oficial da marca (opcional)" className="min-h-11 text-sm" data-testid="bumper-tagline" />
            <p className="mt-1 text-xs text-fg-muted">{tagline.length}/60 · use só o slogan oficial da marca; vazio = só o logo.</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">Som</legend>
            <div className="space-y-2" role="radiogroup" aria-label="Som da vinheta">
              <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3', sound === 'synth' ? 'border-accent' : 'border-line')}>
                <input type="radio" name="bumper-sound" className="mt-1" checked={sound === 'synth'} onChange={() => setSound('synth')} data-testid="bumper-sound-synth" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Music className="size-4" aria-hidden="true" /> Sintetizado (grátis)</span>
                  <span className="mt-2 grid gap-2 @md:grid-cols-3">
                    {PRESETS.map((p) => (
                      <button key={p.value} type="button" disabled={sound !== 'synth'} aria-pressed={preset === p.value} onClick={() => setPreset(p.value)} data-testid={`bumper-preset-${p.value}`} className={cn('rounded-xl border px-3 py-2 text-left disabled:opacity-50', preset === p.value && sound === 'synth' ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
                        <span className="block text-xs font-semibold text-fg">{p.label}</span>
                        <span className="block text-[11px] text-fg-muted">{p.hint}</span>
                      </button>
                    ))}
                  </span>
                </span>
              </label>
              <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3', sound === 'file' ? 'border-accent' : 'border-line')}>
                <input type="radio" name="bumper-sound" className="mt-1" checked={sound === 'file'} onChange={() => setSound('file')} data-testid="bumper-sound-file" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Upload className="size-4" aria-hidden="true" /> Enviar arquivo</span>
                  <span className="mt-1 block text-xs text-fg-muted">MP3, WAV ou OGG; cortado na duração da vinheta, com fades e volume normalizado.</span>
                  {sound === 'file' && (
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <input id="bumper-audio-file" type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" className="text-xs" onChange={(e) => e.target.files?.[0] && void uploadFile(e.target.files[0])} data-testid="bumper-audio-file" />
                      {fileAsset && <span className="inline-flex items-center gap-1 rounded-full bg-bg-2 px-2 py-1 text-xs text-fg"><Check className="size-3" aria-hidden="true" /> {fileAsset.name}</span>}
                    </span>
                  )}
                </span>
              </label>
              <AiSoundOption listing={listing} selected={sound === 'ai'} onSelect={() => setSound('ai')} durationSec={duration} preset={preset} onGenerated={(a) => { setFileAsset(a); setSound('file'); }} onError={setError} />
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void generate(false)} disabled={busy || !!inflight || (sound === 'file' && !fileAsset) || sound === 'ai'} data-testid="bumper-generate">
              {busy || inflight ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              Gerar prévia
            </Button>
            <span className="text-xs text-fg-muted">Gratuito · 16:9 e 9:16 juntos</span>
          </div>
          {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
        </div>

        {/* ---- prévia e uso ---- */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-line bg-bg-2 p-4" data-testid="bumper-preview">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-fg">Prévia</p>
              {ready && (
                <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Proporção da prévia">
                  {(['16:9', '9:16'] as const).map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={aspect === a} disabled={a === '9:16' && !readyVertical} onClick={() => setAspect(a)} data-testid={`bumper-aspect-${a}`} className={cn('min-h-9 rounded-full px-3 text-xs font-semibold disabled:opacity-40', aspect === a ? 'bg-fg text-bg' : 'text-fg-muted')}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {preview ? (
              <video key={preview.id} src={preview.url} controls playsInline preload="metadata" className={cn('mx-auto rounded-xl bg-black', aspect === '9:16' ? 'max-h-[420px] aspect-[9/16]' : 'aspect-video w-full')} data-testid="bumper-video" />
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-line text-center text-sm text-fg-muted">
                {inflight ? (
                  <span className="inline-flex items-center gap-2" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {PHASE_LABEL[job!.status] ?? job!.status}</span>
                ) : job?.status === 'failed' ? (
                  <span role="alert" className="px-4 text-danger">{job.lastError ?? 'A vinheta falhou.'}</span>
                ) : (
                  <span className="px-4">Escolha o estilo e clique em “Gerar prévia”.</span>
                )}
              </div>
            )}
            {ready && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void setDefault(ready.id)} disabled={ready.default || workspaceDefault?.id === ready.id} data-testid="bumper-set-default">
                  <Star className="size-4" aria-hidden="true" /> {workspaceDefault?.id === ready.id ? 'É a padrão da marca' : 'Usar como padrão da marca'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setCourse({ assetId: ready.id, assetIdVertical: readyVertical?.id })} disabled={courseBumper?.assetId === ready.id} data-testid="bumper-use-in-course">
                  {courseBumper?.assetId === ready.id ? 'Usada neste curso' : 'Usar só neste curso'}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line p-4">
            <p className="text-sm font-medium text-fg">Neste curso</p>
            <p className="mt-1 text-xs text-fg-muted">
              {courseChoice ? `Vinheta própria: ${courseChoice.name ?? courseChoice.id}.` : workspaceDefault ? `Usa a vinheta padrão da marca (${workspaceDefault.name ?? workspaceDefault.id}).` : 'Sem vinheta padrão ainda: gere uma prévia e marque como padrão da marca.'}
              {courseChoice && (
                <button type="button" className="ml-2 font-medium text-accent hover:underline" onClick={() => setCourse({ assetId: undefined, assetIdVertical: undefined })}>Voltar à padrão</button>
              )}
            </p>
            <div className="mt-3 grid gap-2 @md:grid-cols-2">
              {BUMPER_PLAY_ON.map((on) => (
                <label key={on} className="flex min-h-11 items-center gap-2 text-sm text-fg">
                  <Checkbox checked={(courseBumper?.playOn ?? ['course_end']).includes(on)} onChange={(e) => togglePlayOn(on, e.target.checked)} data-testid={`bumper-play-${on}`} />
                  {BUMPER_PLAY_ON_LABELS[on]}
                </label>
              ))}
              <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
                <Checkbox checked={courseBumper?.skippable ?? true} onChange={(e) => setCourse({ skippable: e.target.checked })} data-testid="bumper-skippable" />
                O aluno pode pular
              </label>
            </div>
          </div>

          {listing && listing.bumpers.filter((b) => b.aspect === '16:9').length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-fg">Vinhetas do workspace</p>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {listing.bumpers.filter((b) => b.aspect === '16:9').map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-fg">{b.name ?? b.id}{b.default && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-fg">padrão</span>}</span>
                    <span className="text-xs text-fg-faint">{b.durationSec.toFixed(1)} s</span>
                    <button type="button" className="min-h-9 rounded px-2 text-xs font-medium text-accent hover:underline" onClick={() => { setOutputs([b, ...(b.verticalAssetId && b.verticalUrl ? [{ ...b, id: b.verticalAssetId, url: b.verticalUrl, aspect: '9:16' as const }] : [])]); setAspect('16:9'); }}>Ver</button>
                    {!b.default && <button type="button" className="min-h-9 rounded px-2 text-xs font-medium text-accent hover:underline" onClick={() => void setDefault(b.id)}>Padrão</button>}
                    <button type="button" aria-label={`Excluir ${b.name ?? b.id}`} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded text-fg-muted hover:text-danger" onClick={() => void remove(b.id)}><Trash2 className="size-4" aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Som por IA (ElevenLabs Sound Effects): ação paga em duas etapas; desabilitada em demonstração com explicação. */
function AiSoundOption({ listing, selected, onSelect, durationSec, preset, onGenerated, onError }: { listing: Listing | null; selected: boolean; onSelect: () => void; durationSec: number; preset: Preset; onGenerated: (a: { id: string; name: string }) => void; onError: (m: string | null) => void }) {
  const available = !!listing?.aiSound.available;
  const [quote, setQuote] = React.useState<{ prompt: string; estimate: { estimatedUsd: number; note: string }; reason: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ask = async () => {
    setBusy(true);
    onError(null);
    try {
      setQuote(await api('/api/media/bumper/sound', { json: { mood: preset, durationSec: Math.min(durationSec, 22) } }));
    } catch (e) {
      onError(errorMessage(e, 'Não foi possível consultar o som por IA'));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    onError(null);
    try {
      const r = await api<{ asset: { id: string } }>('/api/media/bumper/sound', { json: { mood: preset, durationSec: Math.min(durationSec, 22), confirm: true } });
      onGenerated({ id: r.asset.id, name: 'Som gerado por IA' });
      setQuote(null);
    } catch (e) {
      onError(errorMessage(e, 'Não foi possível gerar o som'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={cn('flex items-start gap-3 rounded-2xl border-2 p-3', selected ? 'border-paid' : 'border-line', !available && 'cursor-not-allowed opacity-80')}>
      <input type="radio" name="bumper-sound" className="mt-1" checked={selected} disabled={!available} onChange={onSelect} data-testid="bumper-sound-ai" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Sparkles className="size-4 text-paid" aria-hidden="true" /> Gerar com IA <span className="rounded-full bg-paid-soft px-2 py-0.5 text-[11px] font-semibold text-paid">pago</span></span>
        <span className="mt-1 block text-xs text-fg-muted">
          {available
            ? 'ElevenLabs Sound Effects: descreve a assinatura em inglês a partir do preset escolhido; o áudio vira um arquivo do workspace. Duas etapas: ver o prompt e a estimativa, depois confirmar.'
            : 'Desabilitado em modo de demonstração: é uma ação paga (ElevenLabs) e este ambiente não tem ALLOW_PAID_PROVIDERS=1 nem chave configurada. Use o som sintetizado ou envie um arquivo.'}
        </span>
        {available && selected && (
          <span className="mt-2 flex flex-col gap-2">
            {!quote ? (
              <Button variant="paid" size="sm" onClick={() => void ask()} disabled={busy}>Ver prompt e estimativa</Button>
            ) : (
              <>
                <span className="block rounded-xl bg-bg-2 p-2 text-xs text-fg"><span className="font-semibold">Prompt:</span> {quote.prompt}</span>
                <span className="block text-xs text-fg-muted">Estimativa: US$ {quote.estimate.estimatedUsd.toFixed(4)} · {quote.estimate.note}</span>
                <span className="flex gap-2">
                  <Button variant="paid" size="sm" onClick={() => void confirm()} disabled={busy}>Confirmar e gerar (pago)</Button>
                  <Button variant="ghost" size="sm" onClick={() => setQuote(null)} disabled={busy}>Cancelar</Button>
                </span>
              </>
            )}
          </span>
        )}
      </span>
    </label>
  );
}

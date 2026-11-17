'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ClipboardCopy, Eye, Flag, Pause, Play, RotateCcw, SkipBack, SkipForward, Trash2, Wrench } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { FIX_KIND_LABEL, type FixPlan } from '@/lib/video-review/fix';
import { STATUS_LABEL, type MarkStatus } from '@/lib/video-review/status';
import { REVIEW_CATEGORIES, RETAKE_CATEGORIES, categoryLabel, fmtTime, resolveMark, type MarkResolution, type ReviewCategory, type SceneReviewContext } from '@/lib/video-review/resolve';

export interface MarkItem {
  id: string;
  lessonId: string;
  nodeId: string;
  sceneTimeSec: number;
  sceneAssetId: string;
  category: string;
  note: string;
  expected: string | null;
  status: MarkStatus;
  createdByName: string | null;
  createdAt: string;
  resolution: MarkResolution | null;
  stale: boolean;
  /** prompt de correção pronto para copiar */
  brief: string;
  /** sem "deveria ficar" ou nota curta: o prompt sai vago */
  vague: boolean;
  plan: FixPlan | null;
  approvalUsd: number | null;
  attempts: number;
  fix: Record<string, unknown> | null;
}

const STATUS_TONE: Record<MarkStatus, 'danger' | 'warning' | 'brand' | 'success' | 'neutral' | 'ai'> = {
  open: 'danger',
  awaiting_fix: 'warning',
  awaiting_approval: 'warning',
  reprocessing: 'ai',
  ready_to_check: 'brand',
  resolved: 'success',
};

interface LessonOption {
  id: string;
  title: string;
  videos: number;
  open: number;
}

interface FormState {
  sceneIdx: number;
  t: number;
  category: ReviewCategory | null;
  note: string;
  expected: string;
}

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
};

/** Linhas do "Isso cai em" (a mais útil para a categoria vem primeiro e em destaque). */
function ResolutionView({ r, category, compact = false }: { r: MarkResolution; category?: string; compact?: boolean }) {
  const lines: Array<{ key: string; label: string; body: React.ReactNode }> = [];
  if (r.take) {
    lines.push({
      key: 'take',
      label: 'Tomada',
      body: (
        <>
          <code className="rounded bg-fg/10 px-1 font-mono text-[0.8rem] text-fg">{r.take.id}</code>
          {' '}· {r.take.index}/{r.take.total}
          {r.take.cameraId && <> · câmera {r.take.cameraId}{r.take.cameraZone ? ` (${r.take.cameraZone === 'left' ? 'esquerda' : r.take.cameraZone === 'right' ? 'direita' : 'centro'})` : ''}</>}
          {' '}· {fmtTime(r.take.start)}–{fmtTime(r.take.end)}
          {r.take.variation > 0 && <> · variação {r.take.variation}</>}
          {!r.take.retakeable && r.take.why && <span className="text-paid"> · {r.take.why}</span>}
        </>
      ),
    });
  }
  if (r.shot) {
    const c = r.shot.nearestCut;
    lines.push({
      key: 'shot',
      label: 'Plano',
      body: (
        <>
          {r.shot.id} ({r.shot.index}/{r.shot.total}) · {r.shot.layout}{r.shot.framing ? ` · ${r.shot.framing}` : ''} · {fmtTime(r.shot.start)}–{fmtTime(r.shot.end)}
          {c && Math.abs(c.deltaSec) <= 2 && <> · corte {c.from}→{c.to}{c.cameraChange ? ' (troca de câmera)' : ''} em {fmtTime(c.at)} ({c.deltaSec >= 0 ? '+' : ''}{c.deltaSec.toFixed(1)} s)</>}
          {r.shot.slide && <> · cartão “{r.shot.slide.title}”</>}
          {r.shot.timing === 'proporcional' && <span className="text-fg-faint"> · tempo aprox.</span>}
        </>
      ),
    });
  }
  if (r.speech) {
    lines.push({
      key: 'speech',
      label: 'Fala',
      body: (
        <>
          “{r.speech.cue}”{r.speech.word && <span className="text-fg-faint"> · palavra “{r.speech.word}”</span>}
        </>
      ),
    });
  }
  if (r.screen) {
    const st = r.screen.step ?? r.screen.nextStep;
    lines.push({
      key: 'screen',
      label: 'Tela',
      body: (
        <>
          <code className="rounded bg-fg/10 px-1 font-mono text-[0.8rem] text-fg">{r.screen.section}</code> ({r.screen.recordingIndex}/{r.screen.total}{r.screen.model ? `, ${r.screen.model}` : ', gravação enviada'}) · {fmtTime(r.screen.start)}–{fmtTime(r.screen.end)}
          {st && (
            <>
              <br />
              {r.screen.step ? `passo ${st.index}/${r.screen.totalSteps}` : `antes do 1º passo; vem o passo 1/${r.screen.totalSteps}`} ({fmtTime(st.start)}): <span className="text-fg">{st.line}</span>
              {r.screen.timing === 'proporcional' && <span className="text-fg-faint"> · tempo aprox.</span>}
            </>
          )}
        </>
      ),
    });
  }
  if (r.topic) {
    lines.push({
      key: 'topic',
      label: 'Painel',
      body: (
        <>
          {r.topic.index ? <>tópico {r.topic.index}/{r.topic.total} “{r.topic.text}”{r.topic.start !== undefined ? ` aceso em ${fmtTime(r.topic.start)}` : ''}</> : 'nenhum tópico aceso ainda'}
          {r.topic.visible.length > 0 && <span className="text-fg-faint"> · na tela: {r.topic.visible.join(' / ')}</span>}
          {r.topic.next && <span className="text-fg-faint"> · próximo: {r.topic.next.index} “{r.topic.next.text}” em {fmtTime(r.topic.next.start)}</span>}
        </>
      ),
    });
  }
  const first: Record<string, string> = { gesture: 'take', wrist: 'take', face: 'take', cut: 'shot', sync: r.screen ? 'screen' : r.topic ? 'topic' : 'shot', screen: 'screen', topics: 'topic', speech: 'speech' };
  const lead = category ? first[category] : undefined;
  if (lead) lines.sort((a, b) => (a.key === lead ? -1 : b.key === lead ? 1 : 0));
  return (
    <dl className={cn('space-y-1 text-sm text-fg-muted', compact && 'text-xs')}>
      {lines.map((l) => (
        <div key={l.key} className="flex gap-2">
          <dt className={cn('w-14 shrink-0 font-medium', l.key === lead ? 'text-accent-strong' : 'text-fg-faint')}>{l.label}</dt>
          <dd className={cn('min-w-0 break-words', l.key === lead && 'text-fg')}>{l.body}</dd>
        </div>
      ))}
      {r.edge && (
        <div className="flex gap-2">
          <dt className="w-14 shrink-0 font-medium text-fg-faint">Onde</dt>
          <dd>{r.edge}</dd>
        </div>
      )}
      {r.notes.length > 0 && !compact && <p className="text-xs text-fg-faint">{r.notes.join(' · ')}</p>}
    </dl>
  );
}

export function WatchAndMark({ courseId, lessons, lessonId, scenes, initialMarks, canEdit = false }: { courseId: string; lessons: LessonOption[]; lessonId: string; scenes: SceneReviewContext[]; initialMarks: MarkItem[]; canEdit?: boolean }) {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [sceneIdx, setSceneIdx] = React.useState(0);
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [durations, setDurations] = React.useState<number[]>(() => scenes.map((s) => s.durationSec ?? 0));
  const pending = React.useRef<{ t: number; play: boolean } | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [marks, setMarks] = React.useState<MarkItem[]>(initialMarks);
  const [filter, setFilter] = React.useState<'open' | 'all'>('open');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chipRef = React.useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [fixing, setFixing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const scene = scenes[sceneIdx];
  const offsets = React.useMemo(() => durations.reduce<number[]>((acc, d, i) => (acc.push(i === 0 ? 0 : acc[i - 1]! + durations[i - 1]!), acc), []), [durations]);
  const total = durations.reduce((a, b) => a + b, 0);

  const seekTo = React.useCallback((idx: number, t: number, play?: boolean) => {
    const v = videoRef.current;
    const wasPlaying = play ?? (v ? !v.paused : false);
    if (idx !== sceneIdx) {
      pending.current = { t, play: wasPlaying };
      setSceneIdx(idx);
      setTime(t);
      return;
    }
    if (v) {
      v.currentTime = Math.max(0, t);
      setTime(Math.max(0, t));
      if (play) void v.play().catch(() => undefined);
    }
  }, [sceneIdx]);

  const nudge = React.useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime + delta;
    const d = durations[sceneIdx] || v.duration || 0;
    if (t < 0 && sceneIdx > 0) return seekTo(sceneIdx - 1, Math.max(0, (durations[sceneIdx - 1] ?? 0) + t));
    if (d && t > d && sceneIdx < scenes.length - 1) return seekTo(sceneIdx + 1, Math.min(t - d, durations[sceneIdx + 1] || t - d));
    seekTo(sceneIdx, Math.max(0, Math.min(t, d || t)));
  }, [durations, sceneIdx, scenes.length, seekTo]);

  const togglePlay = React.useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const openForm = React.useCallback(() => {
    const v = videoRef.current;
    if (!v || !scene) return;
    v.pause();
    setError(null);
    setForm({ sceneIdx, t: v.currentTime, category: null, note: '', expected: '' });
  }, [scene, sceneIdx]);

  React.useEffect(() => {
    if (form) chipRef.current?.focus();
  }, [form?.sceneIdx, form?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (form) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setForm(null);
          return;
        }
        if (!isTyping(e.target) && /^[1-9]$/.test(e.key)) {
          const c = REVIEW_CATEGORIES[Number(e.key) - 1];
          if (c) {
            e.preventDefault();
            setForm((f) => (f ? { ...f, category: c.id } : f));
          }
        }
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        openForm();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 0.2 : 1;
        nudge(e.key === 'ArrowLeft' ? -step : step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, togglePlay, openForm, nudge]);

  // instante atual resolvido (arredondado a 0,1 s para não recalcular a cada quadro)
  const tKey = Math.round(time * 10) / 10;
  const live = React.useMemo(() => (scene ? resolveMark(scene, tKey, durations[sceneIdx] || null) : null), [scene, tKey, durations, sceneIdx]);
  const formRes = React.useMemo(() => (form && scenes[form.sceneIdx] ? resolveMark(scenes[form.sceneIdx]!, form.t, durations[form.sceneIdx] || null) : null), [form, scenes, durations]);

  const sceneOrder = React.useMemo(() => new Map(scenes.map((s, i) => [s.nodeId, i])), [scenes]);
  const sorted = React.useMemo(
    () => [...marks].filter((m) => filter === 'all' || m.status !== 'resolved').sort((a, b) => (sceneOrder.get(a.nodeId) ?? 999) - (sceneOrder.get(b.nodeId) ?? 999) || a.sceneTimeSec - b.sceneTimeSec),
    [marks, filter, sceneOrder],
  );
  const openCount = marks.filter((m) => m.status !== 'resolved').length;
  const fixable = marks.filter((m) => m.status === 'open');

  async function save() {
    if (!form?.category) return;
    const sc = scenes[form.sceneIdx]!;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mark: MarkItem }>(`/api/courses/${courseId}/review-marks`, {
        json: { lessonId, nodeId: sc.nodeId, assetId: sc.assetId, sceneTimeSec: Math.round(form.t * 1000) / 1000, ...(durations[form.sceneIdx] ? { playerDurationSec: durations[form.sceneIdx] } : {}), category: form.category, note: form.note, ...(form.expected.trim() ? { expected: form.expected } : {}) },
      });
      setMarks((ms) => [...ms, res.mark]);
      setForm(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para salvar a marca. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function act(m: MarkItem, action: 'approve' | 'resolve' | 'reopen' | 'still_wrong') {
    setError(null);
    try {
      await api(`/api/courses/${courseId}/review-marks/${m.id}`, { method: 'PATCH', json: { action } });
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para mudar a marca.');
    }
  }

  async function reload() {
    const res = await api<{ marks: MarkItem[] }>(`/api/courses/${courseId}/review-marks?lessonId=${encodeURIComponent(lessonId)}`);
    setMarks(res.marks);
    router.refresh();
  }

  async function fix(ids: string[]) {
    if (!ids.length) return;
    setFixing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ counts: Record<string, number>; paidUsd: number; skipped: unknown[] }>(`/api/courses/${courseId}/review-marks/fix`, { json: { markIds: ids } });
      const c = res.counts;
      const parts = [c.free ? `${c.free} grátis` : '', c.edit ? `${c.edit} com edição` : '', c.paid ? `${c.paid} paga${c.paid > 1 ? 's' : ''} (US$ ${res.paidUsd.toFixed(2)} a aprovar)` : '', c.manual ? `${c.manual} para decidir` : ''].filter(Boolean);
      setNotice(parts.length ? `Pedido registrado: ${parts.join(' · ')}.` : 'Nada a corrigir.');
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para pedir o conserto.');
    } finally {
      setFixing(false);
    }
  }

  async function copyBrief(m: MarkItem) {
    try {
      await navigator.clipboard.writeText(m.brief);
      setCopied(m.id);
      window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 2000);
    } catch {
      setError('Não deu para copiar. Selecione o texto do prompt manualmente.');
    }
  }

  async function remove(m: MarkItem) {
    if (!window.confirm('Apagar esta marca? Não dá para desfazer.')) return;
    try {
      await api(`/api/courses/${courseId}/review-marks/${m.id}`, { method: 'DELETE' });
      setMarks((ms) => ms.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não deu para apagar a marca.');
    }
  }

  function seekGlobal(e: React.MouseEvent<HTMLDivElement>) {
    if (!total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const g = ((e.clientX - rect.left) / rect.width) * total;
    let idx = 0;
    for (let i = 0; i < offsets.length; i++) if (g >= offsets[i]!) idx = i;
    seekTo(idx, Math.max(0, g - offsets[idx]!));
  }

  if (!scenes.length) {
    return <Card className="text-sm text-fg-muted">Esta aula não tem vídeo de cena para assistir.</Card>;
  }

  const globalNow = (offsets[sceneIdx] ?? 0) + time;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section aria-labelledby="watch-title" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="watch-title" className="text-2xl">Assistir e marcar</h2>
            <p className="text-sm text-fg-muted">Viu um problema? Aperte M no instante exato.</p>
          </div>
          <div className="w-full max-w-xs space-y-1 sm:w-72">
            <Label htmlFor="review-lesson">Aula</Label>
            <Select id="review-lesson" value={lessonId} onChange={(e) => router.push(`/estudio/cursos/${courseId}/assistir?aula=${encodeURIComponent(e.target.value)}`)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}{l.open ? ` · ${l.open} aberta${l.open > 1 ? 's' : ''}` : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          <video
            ref={videoRef}
            key={scene!.assetId}
            src={`/api/assets/${encodeURIComponent(scene!.assetId)}`}
            className="aspect-video w-full bg-black"
            preload="auto"
            playsInline
            data-testid="review-video"
            onClick={togglePlay}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (Number.isFinite(v.duration) && v.duration > 0) setDurations((ds) => (Math.abs((ds[sceneIdx] ?? 0) - v.duration) > 0.01 ? ds.map((d, i) => (i === sceneIdx ? v.duration : d)) : ds));
              const p = pending.current;
              pending.current = null;
              if (p) {
                v.currentTime = p.t;
                setTime(p.t);
                if (p.play) void v.play().catch(() => undefined);
              }
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              if (sceneIdx < scenes.length - 1) seekTo(sceneIdx + 1, 0, true);
            }}
          />
        </div>

        {/* linha do tempo da aula inteira: uma faixa por cena, marcas como traços */}
        <div className="space-y-2">
          <div
            role="slider"
            tabIndex={-1}
            aria-label="Linha do tempo da aula"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(globalNow)}
            aria-valuetext={`${scene!.nodeId} ${fmtTime(time)}`}
            className="relative flex h-9 w-full cursor-pointer select-none overflow-hidden rounded-lg border border-line bg-fg/5"
            onClick={seekGlobal}
            data-testid="review-timeline"
          >
            {scenes.map((s, i) => (
              <div key={s.nodeId} className={cn('relative h-full border-r border-line last:border-r-0', i === sceneIdx && 'bg-accent/10')} style={{ width: total ? `${((durations[i] ?? 0) / total) * 100}%` : `${100 / scenes.length}%` }}>
                <span className="absolute left-1 top-0.5 text-[10px] font-medium text-fg-faint">{s.nodeId}</span>
              </div>
            ))}
            {total > 0 &&
              marks.map((m) => {
                const i = sceneOrder.get(m.nodeId);
                if (i === undefined) return null;
                const left = (((offsets[i] ?? 0) + m.sceneTimeSec) / total) * 100;
                return <span key={m.id} title={`${categoryLabel(m.category)} · ${m.note}`} className={cn('pointer-events-none absolute bottom-0 h-4 w-0.5 -translate-x-1/2', m.status === 'resolved' ? 'bg-fg-faint' : m.status === 'ready_to_check' ? 'bg-accent' : 'bg-danger')} style={{ left: `${left}%` }} />;
              })}
            {total > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent" style={{ left: `${(globalNow / total) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="secondary" aria-label="Cena anterior" disabled={sceneIdx === 0} onClick={() => seekTo(sceneIdx - 1, 0)}><SkipBack className="h-4 w-4" /></Button>
            <Button size="icon" variant="secondary" aria-label={playing ? 'Pausar (espaço)' : 'Tocar (espaço)'} onClick={togglePlay}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <Button size="icon" variant="secondary" aria-label="Próxima cena" disabled={sceneIdx >= scenes.length - 1} onClick={() => seekTo(sceneIdx + 1, 0)}><SkipForward className="h-4 w-4" /></Button>
            <Button size="sm" onClick={openForm} data-testid="review-mark-button"><Flag className="h-4 w-4" />Marcar (M)</Button>
            <span className="ml-auto font-mono text-sm tabular-nums text-fg-muted" data-testid="review-clock">
              {scene!.nodeId} · {fmtTime(time)} / {fmtTime(durations[sceneIdx] ?? 0)}
              <span className="text-fg-faint"> · aula {fmtTime(globalNow)}</span>
            </span>
          </div>
          <p className="text-xs text-fg-faint">Espaço tocar/pausar · M marcar · ←/→ 1 s · Shift+←/→ 0,2 s · na marca: 1–9 escolhe o tipo, Esc fecha</p>
        </div>

        {form && formRes ? (
          <Card accent className="space-y-4 p-5" data-testid="review-mark-form">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">Marca em {scenes[form.sceneIdx]!.nodeId} · {fmtTime(form.t)}</h3>
              <span className="text-sm text-fg-muted">{scenes[form.sceneIdx]!.title}</span>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">O que está errado?</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {REVIEW_CATEGORIES.map((c, i) => (
                  <button
                    key={c.id}
                    ref={i === 0 ? chipRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={form.category === c.id}
                    onClick={() => setForm({ ...form, category: c.id })}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                      form.category === c.id ? 'border-accent bg-accent/15 text-fg' : 'border-line-strong text-fg-muted hover:border-fg/40 hover:text-fg',
                    )}
                  >
                    <span className="text-xs text-fg-faint">{i + 1}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mark-note">O que você viu</Label>
                <Input id="mark-note" value={form.note} maxLength={1000} placeholder="ex.: a mão sobe alto demais" onChange={(e) => setForm({ ...form, note: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && form.category) { e.preventDefault(); void save(); } }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mark-expected">Deveria ficar (opcional)</Label>
                <Input id="mark-expected" value={form.expected} maxLength={1000} placeholder="ex.: mão na altura do peito" onChange={(e) => setForm({ ...form, expected: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && form.category) { e.preventDefault(); void save(); } }} />
              </div>
            </div>
            {!form.expected.trim() && <p className="text-xs text-paid">Sem “deveria ficar” a marca fica vaga: diga como deveria ser para o conserto sair certo.</p>}
            <div className="space-y-1 rounded-xl border border-line p-3">
              <p className="text-sm font-medium">Isso cai em:</p>
              <ResolutionView r={formRes} category={form.category ?? undefined} />
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={!form.category || busy} data-testid="review-mark-save">{busy ? 'Salvando…' : 'Salvar marca'}</Button>
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              {form.category && RETAKE_CATEGORIES.includes(form.category) && formRes.take && !formRes.take.retakeable && <p className="self-center text-sm text-paid">{formRes.take.why}</p>}
            </div>
          </Card>
        ) : (
          live && (
            <div className="rounded-xl border border-line p-3" aria-live="off">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-faint">Agora</p>
              <ResolutionView r={live} compact />
            </div>
          )
        )}
        {!form && error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </section>

      <aside aria-labelledby="marks-title" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="marks-title" className="text-2xl">Marcas <span className="text-base text-fg-muted">({openCount} pendente{openCount === 1 ? '' : 's'})</span></h2>
          <div className="flex gap-1" role="group" aria-label="Filtrar marcas">
            <Button size="sm" variant={filter === 'open' ? 'secondary' : 'ghost'} aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Pendentes</Button>
            <Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</Button>
          </div>
        </div>
        {canEdit && fixable.length > 0 && (
          <Button variant="secondary" size="sm" disabled={fixing} onClick={() => void fix(fixable.map((m) => m.id))} data-testid="review-fix-all">
            <Wrench className="h-4 w-4" />{fixing ? 'Classificando…' : `Corrigir tudo (${fixable.length})`}
          </Button>
        )}
        {notice && <p role="status" className="text-sm text-fg-muted">{notice}</p>}
        {error && !form && <p role="alert" className="text-sm text-danger">{error}</p>}
        {sorted.length === 0 ? (
          <Card className="text-sm text-fg-muted">{filter === 'open' && marks.length ? 'Nenhuma marca pendente nesta aula.' : 'Nenhuma marca nesta aula ainda.'}</Card>
        ) : (
          <ul className="space-y-3" data-testid="review-mark-list">
            {sorted.map((m) => {
              const i = sceneOrder.get(m.nodeId);
              return (
                <li key={m.id}>
                  <Card className={cn('space-y-2 p-4', m.status === 'resolved' && 'opacity-70')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="font-mono text-sm font-semibold tabular-nums text-accent-strong underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
                        disabled={i === undefined}
                        onClick={() => i !== undefined && seekTo(i, m.sceneTimeSec, false)}
                        aria-label={`Ir para ${m.nodeId} em ${fmtTime(m.sceneTimeSec)}`}
                      >
                        {m.nodeId} · {fmtTime(m.sceneTimeSec)}
                      </button>
                      <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                      <Badge>{categoryLabel(m.category)}</Badge>
                      {m.vague && m.status !== 'resolved' && <Badge tone="warning" title="Sem “deveria ficar” (ou nota curta): o prompt de correção sai vago"><AlertTriangle className="h-3 w-3" />nota vaga</Badge>}
                      {m.attempts > 0 && <span className="text-xs text-fg-faint">tentativa {m.attempts + 1}</span>}
                    </div>
                    {m.note && <p className="text-sm text-fg">{m.note}</p>}
                    {m.expected && <p className="text-sm text-fg-muted">Deveria: {m.expected}</p>}
                    {m.resolution && (
                      <div className="border-t border-line pt-2">
                        <p className="mb-1 text-xs font-medium text-fg-faint">Isso cai em:{m.stale ? ' (vídeo da cena mudou depois da marca; retrato da hora da marca)' : ''}</p>
                        <ResolutionView r={m.resolution} category={m.category} compact />
                      </div>
                    )}
                    {m.plan && m.status !== 'open' && (
                      <div className="space-y-1 rounded-lg border border-line p-2 text-sm" data-testid="review-fix-plan">
                        <p className="font-medium">{m.plan.label} <span className="text-xs font-normal text-fg-faint">· {FIX_KIND_LABEL[m.plan.kind]}</span></p>
                        <p className="text-xs text-fg-muted">{m.plan.reason}</p>
                        {m.status === 'awaiting_approval' && <p className="text-xs text-paid">Gasto a aprovar: US$ {(m.approvalUsd ?? m.plan.usd ?? 0).toFixed(2)}{m.plan.tomadas?.length ? ` · ${m.plan.tomadas.join(', ')}` : ''}</p>}
                        {m.status === 'awaiting_fix' && (m.fix as { approval?: { usd?: number } } | null)?.approval && <p className="text-xs text-paid">Gasto aprovado: US$ {((m.fix as { approval: { usd?: number } }).approval.usd ?? 0).toFixed(2)}</p>}
                        {(m.status === 'awaiting_fix' || m.status === 'awaiting_approval') && m.plan.executor === 'operator' && <p className="text-xs text-fg-faint">Será executado pelo operador (revisao-acoes.ts --pendentes).</p>}
                        {m.status === 'reprocessing' && <p className="text-xs text-fg-faint">Na fila de produção. Quando o vídeo novo chegar, a marca fica pronta para conferir.</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      {m.status === 'ready_to_check' && (
                        <>
                          <Button size="sm" variant="secondary" disabled={i === undefined} onClick={() => i !== undefined && seekTo(i, Math.max(0, m.sceneTimeSec - 2), true)}><Eye className="h-4 w-4" />Conferir</Button>
                          <Button size="sm" variant="ghost" onClick={() => void act(m, 'resolve')}><Check className="h-4 w-4" />Resolvida</Button>
                          <Button size="sm" variant="ghost" onClick={() => void act(m, 'still_wrong')}><RotateCcw className="h-4 w-4" />Ainda errado</Button>
                        </>
                      )}
                      {m.status === 'open' && canEdit && <Button size="sm" variant="secondary" disabled={fixing} onClick={() => void fix([m.id])}><Wrench className="h-4 w-4" />Corrigir</Button>}
                      {m.status === 'awaiting_approval' && canEdit && <Button size="sm" variant="paid" onClick={() => void act(m, 'approve')}>Aprovar US$ {(m.approvalUsd ?? m.plan?.usd ?? 0).toFixed(2)}</Button>}
                      {m.status !== 'resolved' && <Button size="sm" variant="ghost" onClick={() => void copyBrief(m)} data-testid="review-copy-brief"><ClipboardCopy className="h-4 w-4" />{copied === m.id ? 'Copiado' : 'Copiar prompt'}</Button>}
                      {m.status === 'open' && <Button size="sm" variant="ghost" onClick={() => void act(m, 'resolve')}><Check className="h-4 w-4" />Resolver</Button>}
                      {(m.status === 'awaiting_fix' || m.status === 'awaiting_approval' || m.status === 'reprocessing') && <Button size="sm" variant="ghost" onClick={() => void act(m, 'reopen')}><RotateCcw className="h-4 w-4" />Cancelar pedido</Button>}
                      {m.status === 'resolved' && <Button size="sm" variant="ghost" onClick={() => void act(m, 'reopen')}><RotateCcw className="h-4 w-4" />Reabrir</Button>}
                      <Button size="sm" variant="ghost" aria-label="Apagar marca" onClick={() => void remove(m)}><Trash2 className="h-4 w-4" />Apagar</Button>
                      <span className="ml-auto text-xs text-fg-faint">{m.createdByName ?? ''}</span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-faint">Plano de ações e prompts: <code className="font-mono">tsx src/scripts/revisao-acoes.ts --course {courseId} --prompts</code> (em apps/web).</p>
      </aside>
    </div>
  );
}

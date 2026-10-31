'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Camera as CameraIcon, Check, ImagePlus, Pause, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import {
  CAMERA_PLACEMENTS, CAMERA_PLACEMENT_LABELS, CAMERA_ZONES, CAMERA_ZONE_LABELS, FOREGROUND_FROM_MIN, PRESENTER_BOTTOM_MIN, PRESENTER_GRADES, PRESENTER_GRADE_LABELS, PRESENTER_HEADROOM_MAX, PRESENTER_HEADROOM_MIN, PRESENTER_PLACEMENT_LABELS,
  PRESENTER_PRONOUNS, PRESENTER_PRONOUN_LABELS, PRESENTER_X_MAX, PRESENTER_X_MIN, looksSeated, resolveCameraPlacement,
  type BackdropFrame, type Camera, type CameraPlacement, type CameraZone, type PresenterGrade, type PresenterPlacement, type PresenterPronoun, type Presentation,
} from '@lms/course-schema';
import { BACKDROP_FRAME_PRESETS, BACKDROP_FRAME_PRESET_LABELS, NOMINAL_CLIP, PRESENTER_GRADE_CSS, computeComposition, mediumFrameFor, type BackdropFramePreset, type Composition } from '@lms/media/layout';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { useDraft } from '@/components/studio/draft-provider';
import { errorMessage } from './agent-api';
import { backgroundImageLabel, humanName, presentationSummary } from './wizard-state';
import { focusAfter, useFocusTrap } from '@/components/ui/focus-trap';

export { humanName };
import { moveItem } from '@/components/studio/graph-ops';
import {
  ANGLE_LABEL,
  ANGLE_ORDER,
  DEFAULT_SLIDE_ACCENT,
  FRAMING_LABEL,
  FRAMING_ORDER,
  MAX_CAMERAS,
  MAX_CINEMATIC_OPTIONS,
  newCameraId,
  PACE,
  PACE_ORDER,
  type CameraAngle,
  type DirectionStyle,
  type Framing,
} from '@/components/studio/direction/direction-model';
import { SlidePreview } from '@/components/studio/direction/slide-preview';
import { OverlayPortal } from '@/components/ui/overlay-portal';
import { BumperBuilder } from '@/components/studio/bumper-builder';

interface Capabilities {
  simulation: boolean;
  providers: { heygen: boolean; elevenlabs: boolean };
}
interface AvatarLook { id: string; name: string; avatarType?: string; previewImageUrl?: string; previewVideoUrl?: string; gender?: string; defaultVoiceId?: string; groupId?: string }
interface Voice { id: string; name: string; language?: string; previewUrl?: string }
/** Metadados de cenário de uma imagem do workspace (ver `SceneryMetadata` no banco). */
interface SceneryMeta {
  name?: string;
  frame?: BackdropFrame;
  presenterX?: number;
  presenterScale?: number;
  presenterBottom?: number;
  headroom?: number;
  foregroundFrom?: number;
  presenterGrade?: PresenterGrade;
  blur?: boolean;
}
interface Backgrounds {
  presets: { id: string; name: string; type: 'color'; value: string }[];
  images: BackgroundImage[];
}
type Provider = NonNullable<Presentation['voiceProvider']>;
type Ratio = Presentation['aspectRatio'];

const RATIOS: { value: Ratio; label: string; hint: string; box: string }[] = [
  { value: '16:9', label: 'Horizontal', hint: 'Telas de computador e TV', box: 'h-7 w-12' },
  { value: '9:16', label: 'Vertical', hint: 'Celular, como stories', box: 'h-12 w-7' },
  { value: '1:1', label: 'Quadrado', hint: 'Redes sociais e cards', box: 'h-10 w-10' },
];

export function StepApresentacao() {
  const { document: doc, update } = useDraft();
  const p = doc.presentation;
  const setPresentation = (patch: Partial<Presentation>) => update((d) => ({ ...d, presentation: { ...d.presentation, ...patch } }));

  const [caps, setCaps] = React.useState<Capabilities | null>(null);
  React.useEffect(() => {
    api<Capabilities>('/api/media/capabilities').then(setCaps).catch(() => setCaps(null));
  }, []);
  // fundos e cenários do workspace (partilhados entre "Em que ambiente" e "Posição da apresentadora")
  const [backgrounds, setBackgrounds] = React.useState<Backgrounds | null>(null);
  const [backgroundsError, setBackgroundsError] = React.useState<string | null>(null);
  const loadBackgrounds = React.useCallback(async () => {
    try {
      setBackgrounds(await api<Backgrounds>('/api/media/backgrounds'));
      setBackgroundsError(null);
    } catch (e) {
      setBackgroundsError(errorMessage(e, 'Não foi possível carregar os fundos'));
    }
  }, []);
  React.useEffect(() => {
    void loadBackgrounds();
  }, [loadBackgrounds]);
  const backgroundImage = p.background.type === 'image' ? backgrounds?.images.find((i) => i.assetId === (p.background as { assetId: string }).assetId) : undefined;

  return (
    <div className="space-y-12">
      <div className="rounded-xl bg-bg-2 px-4 py-3 text-sm" data-testid="presentation-summary">
        <span className="text-fg-faint">Resumo: </span>
        <span className="font-medium text-fg">{presentationSummary(p)}</span>
      </div>

      {caps?.simulation && (
        <p role="status" className="rounded-xl border border-paid/30 bg-paid-soft px-4 py-3 text-sm text-paid" data-testid="media-simulation-banner">
          Modo de demonstração: os provedores de vídeo e voz não estão configurados. As listas abaixo são exemplos e nenhum vídeo real será produzido até configurar as chaves.
        </p>
      )}

      <PresenterGallery
        selectedId={p.avatarId}
        selected={p.avatarId ? { id: p.avatarId, name: p.avatarName, previewImageUrl: p.avatarPreviewUrl } : undefined}
        onSelect={(a) =>
          update((d) => {
            const pres = d.presentation;
            const cams = pres.cameras ?? [];
            // a câmera principal acompanha o apresentador escolhido
            const cameras = cams[0] && cams[0].lookId === pres.avatarId ? [{ ...cams[0], lookId: a.id, previewUrl: a.previewImageUrl }, ...cams.slice(1)] : cams;
            return { ...d, presentation: { ...pres, avatarId: a.id, avatarName: humanName(a.name).label.slice(0, 120), avatarPreviewUrl: a.previewImageUrl, cameras } };
          })
        }
      />

      <div className="max-w-xs">
        <label htmlFor="presenter-pronoun" className="mb-1 block text-sm font-medium text-fg">Apresentador(a) é</label>
        <Select id="presenter-pronoun" value={p.presenterPronoun ?? 'she'} onChange={(e) => setPresentation({ presenterPronoun: e.target.value as PresenterPronoun })} className="min-h-11 text-sm" data-testid="presenter-pronoun">
          {PRESENTER_PRONOUNS.map((v) => (
            <option key={v} value={v}>{PRESENTER_PRONOUN_LABELS[v]}</option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-fg-muted">Usado nos pedidos das cenas em movimento e nas instruções da IA.</p>
      </div>

      <CameraKit presentation={p} simulation={!!caps?.simulation} />

      <VoicePicker
        provider={p.voiceProvider ?? 'heygen'}
        selectedId={p.voiceId}
        providersAvailable={caps?.providers}
        simulation={!!caps?.simulation}
        onProvider={(prov) => setPresentation({ voiceProvider: prov, voiceId: undefined, voiceName: undefined })}
        onSelect={(v, prov) => setPresentation({ voiceProvider: prov, voiceId: v.id, voiceName: v.name })}
      />

      <BackgroundPicker
        background={p.background}
        presenterPreviewUrl={p.avatarPreviewUrl}
        data={backgrounds}
        error={backgroundsError}
        reload={loadBackgrounds}
        onChange={(bg) => setPresentation({ background: bg })}
        onScenery={(img) => update((d) => ({ ...d, presentation: applyScenery(d.presentation, img) }))}
      />

      <PresenterPlacementPicker
        presentation={p}
        backgroundImage={backgroundImage}
        onChange={(patch, coalesce) =>
          update((d) => {
            const next = { ...d.presentation, ...patch };
            // chaves opcionais desligadas saem do documento (hash de cena inalterado)
            for (const k of Object.keys(patch) as Array<keyof Presentation>) if (patch[k] === undefined) delete next[k];
            return { ...d, presentation: next };
          }, coalesce ? { coalesce } : undefined)
        }
      />

      <section aria-labelledby="ratio-title" className="space-y-5">
        <div>
          <h2 id="ratio-title" className="font-display text-xl font-bold">Formato do vídeo</h2>
          <p className="mt-1 text-sm text-fg-muted">Onde o aluno vai assistir define o formato.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Formato do vídeo">
          {RATIOS.map((r) => {
            const active = p.aspectRatio === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPresentation({ aspectRatio: r.value })}
                data-testid={`ratio-${r.value}`}
                className={cn('flex items-center gap-4 rounded-2xl border-2 bg-surface p-4 text-left transition-colors', active ? 'border-accent' : 'border-line hover:border-line-strong')}
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-bg-2">
                  <span className={cn('rounded-[3px] border-2', r.box, active ? 'border-accent bg-accent-soft' : 'border-line-strong')} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-fg">{r.label} ({r.value})</span>
                  <span className="block text-xs text-fg-muted">{r.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <DirectionStyleFields
        style={p.directionStyle}
        onChange={(patch, coalesce) => update((d) => ({ ...d, presentation: { ...d.presentation, directionStyle: { ...d.presentation.directionStyle, ...patch } } }), coalesce ? { coalesce } : undefined)}
      />

      {/* vinheta da marca (assinatura animada + sonora no fim da aula/curso) */}
      <BumperBuilder />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nomes, busca e filtros                                              */
/* ------------------------------------------------------------------ */

/* `humanName` (nomes técnicos do provedor → legíveis) vive em wizard-state.ts e é reexportado acima. */

const normalize = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Tipos de avatar do HeyGen (`avatarType`) em linguagem de autor. */
const AVATAR_TYPES: { value: string; label: string }[] = [
  { value: 'photo_avatar', label: 'Fotos' },
  { value: 'studio_avatar', label: 'Estúdio' },
  { value: 'digital_twin', label: 'Gêmeos digitais' },
];

/** Agrupa códigos de idioma ("pt-BR", "pt", "Portuguese") num rótulo só. */
function languageGroup(language?: string): string {
  if (!language) return 'Sem idioma informado';
  const l = normalize(language);
  if (/^pt\b|^pt[-_]|portug/.test(l)) return 'Português';
  if (/^en\b|^en[-_]|english|ingles/.test(l)) return 'Inglês';
  if (/^es\b|^es[-_]|spanish|espanhol/.test(l)) return 'Espanhol';
  return language;
}
const PT = 'Português';
const ALL = 'all';

/** Botões de filtro (alternância única) com contagem. */
function FilterChips({ label, options, value, onChange }: { label: string; options: { value: string; label: string; count: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
              active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {o.label} <span className={cn('tabular-nums', active ? 'text-accent-strong' : 'text-fg-faint')}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function SearchBox({ id, label, value, onChange, placeholder, autoFocus = false }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="relative max-w-md">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" aria-hidden="true" />
      <Input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} className="pl-11" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PresenterGallery({
  selectedId,
  selected,
  onSelect,
}: {
  selectedId?: string;
  /** o apresentador gravado no curso: aparece mesmo quando a lista (de demonstração ou paginada) não o traz */
  selected?: { id: string; name?: string; previewImageUrl?: string };
  onSelect: (a: AvatarLook) => void;
}) {
  const [state, setState] = React.useState<{ looks: AvatarLook[]; nextToken?: string; loading: boolean; error: string | null }>({ looks: [], loading: true, error: null });
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState<string>(ALL);
  // a escolha que já existia ao abrir o passo fica no topo; clicar em outra não reordena a grade
  const [pinnedId] = React.useState(selectedId);

  const load = React.useCallback(async (token?: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await api<{ simulation: boolean; looks: AvatarLook[]; nextToken?: string }>(`/api/media/avatars${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      setState((s) => ({ looks: token ? [...s.looks, ...r.looks] : r.looks, nextToken: r.nextToken, loading: false, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(e, 'Não foi possível carregar os apresentadores') }));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const typeOptions = React.useMemo(() => {
    const opts = [{ value: ALL, label: 'Todos', count: state.looks.length }];
    for (const t of AVATAR_TYPES) {
      const count = state.looks.filter((a) => a.avatarType === t.value).length;
      if (count > 0) opts.push({ value: t.value, label: t.label, count });
    }
    return opts;
  }, [state.looks]);

  // apresentador gravado que a lista não traz (ex.: escolhido com o provedor real, lista agora em demonstração): vira um cartão no topo
  const looks = React.useMemo<AvatarLook[]>(() => {
    if (!selected || state.loading || state.looks.some((a) => a.id === selected.id)) return state.looks;
    return [{ id: selected.id, name: selected.name?.trim() || 'Apresentador escolhido', previewImageUrl: selected.previewImageUrl }, ...state.looks];
  }, [selected, state.looks, state.loading]);

  const visible = React.useMemo(() => {
    const q = normalize(query);
    const list = looks.filter((a) => {
      if (type !== ALL && a.avatarType !== type && a.id !== selectedId) return false;
      if (!q) return true;
      return normalize(`${a.name} ${humanName(a.name).label} ${a.id}`).includes(q);
    });
    if (pinnedId) {
      const i = list.findIndex((a) => a.id === pinnedId);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return list;
  }, [looks, query, type, pinnedId, selectedId]);

  const filtering = query.trim() !== '' || type !== ALL;

  return (
    <section aria-labelledby="presenter-title" className="space-y-5">
      <div>
        <h2 id="presenter-title" className="font-display text-xl font-bold">Quem apresenta</h2>
        <p className="mt-1 text-sm text-fg-muted">Passe o mouse ou foque com o teclado para ver o apresentador em movimento. Use as setas para trocar de opção.</p>
      </div>
      {state.looks.length > 0 && (
        <div className="space-y-3">
          <SearchBox id="presenter-search" label="Buscar apresentador pelo nome" value={query} onChange={setQuery} placeholder="Buscar pelo nome" />
          {typeOptions.length > 2 && <FilterChips label="Tipo de apresentador" options={typeOptions} value={type} onChange={setType} />}
          <p className="text-sm text-fg-muted" aria-live="polite">
            {filtering ? `${visible.length} de ${state.looks.length} apresentadores` : `${state.looks.length} apresentadores`}
            {state.nextToken ? ' carregados' : ''}
          </p>
        </div>
      )}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.looks.length === 0 && state.loading && <p className="text-sm text-fg-muted">Carregando apresentadores…</p>}
      {looks.length === 0 && !state.loading && !state.error && <p className="text-sm text-fg-muted">Nenhum apresentador disponível no provedor configurado.</p>}
      {looks.length > 0 && visible.length === 0 && (
        <p className="text-sm text-fg-muted">
          Nenhum apresentador encontrado.{' '}
          <button type="button" className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline" onClick={() => { setQuery(''); setType(ALL); }}>
            Limpar busca e filtros
          </button>
        </p>
      )}
      {visible.length > 0 && (
        <fieldset>
          <legend className="sr-only">Apresentadores</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((a) => {
              const active = a.id === selectedId;
              const showVideo = previewId === a.id && !!a.previewVideoUrl;
              const { label, technical } = humanName(a.name);
              const outsideList = !state.looks.some((x) => x.id === a.id);
              return (
                <label
                  key={a.id}
                  data-testid={`presenter-${a.id}`}
                  data-outside-list={outsideList ? 'true' : undefined}
                  title={outsideList ? `${label} (escolhido neste curso; não está na lista atual do provedor)` : technical ? `${a.name} (id ${a.id})` : `${a.name}`}
                  onMouseEnter={() => setPreviewId(a.id)}
                  onMouseLeave={() => setPreviewId((v) => (v === a.id ? null : v))}
                  className={cn(
                    'relative block aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-2xl bg-bg-2 transition-shadow has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent',
                    active ? 'ring-4 ring-accent ring-offset-2 ring-offset-surface' : 'ring-1 ring-line hover:ring-2 hover:ring-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="presenter"
                    value={a.id}
                    checked={active}
                    onChange={() => onSelect(a)}
                    onFocus={() => setPreviewId(a.id)}
                    onBlur={() => setPreviewId((v) => (v === a.id ? null : v))}
                    className="sr-only"
                  />
                  {a.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewImageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-surface-2 font-display text-5xl font-bold text-accent" aria-hidden="true">{label.slice(0, 1)}</span>
                  )}
                  {showVideo && <video src={a.previewVideoUrl} className="absolute inset-0 h-full w-full object-cover object-top" autoPlay muted loop playsInline aria-hidden="true" />}
                  <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-xl bg-surface/90 px-3 py-2 backdrop-blur-sm">
                    <span className="min-w-0">
                      <span className="line-clamp-2 block break-words text-sm font-semibold leading-snug text-fg">{label}</span>
                      {outsideList && <span className="block text-[11px] text-fg-muted">Escolhido neste curso</span>}
                    </span>
                    {active && (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-fill text-accent-fill-fg" aria-hidden="true">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {state.nextToken && (
        <Button variant="secondary" size="sm" onClick={() => void load(state.nextToken)} disabled={state.loading}>
          {state.loading ? 'Carregando…' : 'Carregar mais apresentadores'}
        </Button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function VoicePicker({
  provider,
  selectedId,
  providersAvailable,
  simulation,
  onProvider,
  onSelect,
}: {
  provider: Provider;
  selectedId?: string;
  providersAvailable?: { heygen: boolean; elevenlabs: boolean };
  simulation: boolean;
  onProvider: (p: Provider) => void;
  onSelect: (v: Voice, provider: Provider) => void;
}) {
  const [state, setState] = React.useState<{ list: Voice[]; nextToken?: string; loading: boolean; error: string | null }>({ list: [], loading: true, error: null });
  const [playing, setPlaying] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  /** null = ainda não escolhido: usa Português quando houver vozes em português */
  const [language, setLanguage] = React.useState<string | null>(null);
  const [pinnedId] = React.useState(selectedId);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const load = React.useCallback(async (prov: Provider, token?: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await api<{ simulation: boolean; voices: Voice[]; nextToken?: string }>(`/api/media/voices?provider=${prov}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
      setState((s) => ({ list: token ? [...s.list, ...r.voices] : r.voices, nextToken: r.nextToken, loading: false, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(e, 'Não foi possível carregar as vozes') }));
    }
  }, []);
  React.useEffect(() => {
    setState({ list: [], loading: true, error: null });
    setLanguage(null);
    void load(provider);
  }, [provider, load]);
  React.useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = (v: Voice) => {
    if (!v.previewUrl) return;
    if (playing === v.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(v.previewUrl);
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
    setPlaying(v.id);
  };

  const providerDisabled = (p: Provider) => (providersAvailable ? !providersAvailable[p] && !simulation : false);

  // idiomas presentes, com Português sempre primeiro
  const languageOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of state.list) counts.set(languageGroup(v.language), (counts.get(languageGroup(v.language)) ?? 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => (a[0] === PT ? -1 : b[0] === PT ? 1 : b[1] - a[1]));
    return [...groups.slice(0, 5).map(([g, count]) => ({ value: g, label: g, count })), { value: ALL, label: 'Todos os idiomas', count: state.list.length }];
  }, [state.list]);
  const effectiveLanguage = language ?? (languageOptions.some((o) => o.value === PT) ? PT : ALL);

  const visible = React.useMemo(() => {
    const q = normalize(query);
    const list = state.list.filter((v) => {
      if (effectiveLanguage !== ALL && languageGroup(v.language) !== effectiveLanguage) return false;
      if (!q) return true;
      return normalize(`${v.name} ${humanName(v.name).label}`).includes(q);
    });
    if (pinnedId) {
      const i = list.findIndex((v) => v.id === pinnedId);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return list;
  }, [state.list, query, effectiveLanguage, pinnedId]);
  const filtering = query.trim() !== '' || effectiveLanguage !== ALL;
  const selectedHidden = !!selectedId && state.list.some((v) => v.id === selectedId) && !visible.some((v) => v.id === selectedId);

  return (
    <section aria-labelledby="voice-title" className="space-y-5">
      <div>
        <h2 id="voice-title" className="font-display text-xl font-bold">Com que voz</h2>
        <p className="mt-1 text-sm text-fg-muted">Ouça antes de escolher. A voz do HeyGen vem junto com o vídeo; a do ElevenLabs é gerada à parte e costuma soar mais natural.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg">Provedor de voz</legend>
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface-2 p-1">
          {(['heygen', 'elevenlabs'] as Provider[]).map((p) => (
            <label
              key={p}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 text-sm font-medium transition-colors has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-accent',
                provider === p ? 'bg-surface text-fg shadow-sm ring-1 ring-line-strong' : 'text-fg-muted hover:text-fg',
                providerDisabled(p) && 'cursor-not-allowed opacity-50',
              )}
            >
              <input type="radio" name="voice-provider" className="sr-only" checked={provider === p} disabled={providerDisabled(p)} onChange={() => onProvider(p)} />
              {p === 'heygen' ? 'HeyGen' : 'ElevenLabs'}
              {providerDisabled(p) && <span className="sr-only"> (não configurado)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {state.list.length > 0 && (
        <div className="space-y-3">
          <SearchBox id="voice-search" label="Buscar voz pelo nome" value={query} onChange={setQuery} placeholder="Buscar pelo nome" />
          {languageOptions.length > 2 && <FilterChips label="Idioma da voz" options={languageOptions} value={effectiveLanguage} onChange={setLanguage} />}
          <p className="text-sm text-fg-muted" aria-live="polite">
            {filtering ? `${visible.length} de ${state.list.length} vozes` : `${state.list.length} vozes`}
            {state.nextToken ? ' carregadas' : ''}
            {selectedHidden ? ' · a voz escolhida está fora deste filtro' : ''}
          </p>
        </div>
      )}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.loading && state.list.length === 0 && <p className="text-sm text-fg-muted">Carregando vozes…</p>}
      {!state.loading && state.list.length === 0 && !state.error && <p className="text-sm text-fg-muted">Nenhuma voz disponível neste provedor.</p>}
      {state.list.length > 0 && visible.length === 0 && (
        <p className="text-sm text-fg-muted">
          Nenhuma voz encontrada.{' '}
          <button type="button" className="inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline" onClick={() => { setQuery(''); setLanguage(ALL); }}>
            Limpar busca e filtros
          </button>
        </p>
      )}
      {visible.length > 0 && (
        <fieldset>
          <legend className="sr-only">Vozes</legend>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {visible.map((v) => {
              const active = v.id === selectedId;
              const isPlaying = playing === v.id;
              const { label, technical } = humanName(v.name);
              return (
                <li key={v.id} className={cn('flex items-center gap-3 px-3 py-2', active && 'bg-accent-soft/60')}>
                  <button
                    type="button"
                    aria-label={isPlaying ? `Pausar prévia da voz ${label}` : `Ouvir prévia da voz ${label}`}
                    disabled={!v.previewUrl}
                    onClick={() => toggle(v)}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-fill text-accent-fill-fg transition-colors hover:bg-accent-fill-strong disabled:opacity-40"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />}
                  </button>
                  <label
                    data-testid={`voice-${v.id}`}
                    title={technical ? v.name : undefined}
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg text-left has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-accent"
                  >
                    <input type="radio" name="voice" value={v.id} checked={active} onChange={() => onSelect(v, provider)} className="sr-only" />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-fg">{label}</span>
                      {v.language && <span className="block text-xs text-fg-faint">{v.language}</span>}
                    </span>
                    {active && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-strong" aria-hidden="true">
                        <Check className="h-3.5 w-3.5" /> Escolhida
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {state.nextToken && (
        <Button variant="secondary" size="sm" onClick={() => void load(provider, state.nextToken)} disabled={state.loading}>
          {state.loading ? 'Carregando…' : 'Carregar mais vozes'}
        </Button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** Mini-tela 16:9 com o apresentador escolhido composto no canto inferior direito. */
function MiniScreen({ presenterPreviewUrl, children }: { presenterPreviewUrl?: string; children: React.ReactNode }) {
  return (
    <span className="relative block aspect-video w-full overflow-hidden rounded-xl bg-bg-2" aria-hidden="true">
      {children}
      {presenterPreviewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={presenterPreviewUrl} alt="" className="absolute bottom-0 right-[8%] h-[88%] w-auto object-cover object-top drop-shadow-md" />
      )}
    </span>
  );
}

/** Imagem do fundo (prévia e tiles): dados vindos de /api/media/backgrounds. */
interface BackgroundImage { id: string; name: string; assetId: string; url: string; scenery?: SceneryMeta }

/** Apresentação como o cenário sugere (ao escolher um cenário no grupo "Cenários"). */
export function applyScenery(pres: Presentation, img: BackgroundImage): Presentation {
  const sc = img.scenery;
  const background: Presentation['background'] = {
    type: 'image',
    assetId: img.assetId,
    name: (sc?.name ?? backgroundImageLabel(img.name)).slice(0, 60),
    ...(sc?.foregroundFrom !== undefined ? { foregroundFrom: sc.foregroundFrom } : {}),
    ...(sc?.frame ? { frame: sc.frame } : {}),
    ...(sc?.blur === false ? { blur: false } : {}),
  };
  if (!sc) return { ...pres, background };
  const next: Presentation = { ...pres, background };
  // cenário = apresentadora montada por nós: do centro passa para a direita (a posição livre manda no x)
  if ((next.presenterPlacement ?? 'center') === 'center' && (sc.presenterX !== undefined || sc.foregroundFrom !== undefined || sc.frame)) next.presenterPlacement = 'right';
  next.presenterX = sc.presenterX;
  next.presenterBottom = sc.presenterBottom;
  next.presenterHeadroom = sc.headroom;
  if (sc.presenterScale !== undefined) next.presenterScale = sc.presenterScale;
  next.presenterGrade = sc.presenterGrade;
  return next;
}

function BackgroundPicker({
  background,
  presenterPreviewUrl,
  data,
  error,
  reload,
  onChange,
  onScenery,
}: {
  background: Presentation['background'];
  presenterPreviewUrl?: string;
  data: Backgrounds | null;
  error: string | null;
  reload: () => Promise<void>;
  onChange: (bg: Presentation['background']) => void;
  /** escolha de um cenário (imagem com enquadramento e posição sugeridos) */
  onScenery: (img: BackgroundImage) => void;
}) {
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ asset: { id: string; url: string } }>('/api/assets', { method: 'POST', body: fd });
      onChange({ type: 'image', assetId: r.asset.id, name: backgroundImageLabel(file.name).slice(0, 60) });
      await reload();
    } catch (e) {
      setUploadError(errorMessage(e, 'Não foi possível enviar a imagem'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const isColor = (value: string) => background.type === 'color' && background.value.toLowerCase() === value.toLowerCase();
  const isImage = (assetId: string) => background.type === 'image' && background.assetId === assetId;
  const tile = (active: boolean) =>
    cn('block w-full rounded-2xl bg-surface p-1.5 text-left transition-shadow', active ? 'ring-4 ring-accent ring-offset-2 ring-offset-surface' : 'ring-1 ring-line hover:ring-2 hover:ring-line-strong');
  const sceneries = (data?.images ?? []).filter((i) => i.scenery);
  const others = (data?.images ?? []).filter((i) => !i.scenery);
  const shown = error ?? uploadError;

  const imageTile = (img: BackgroundImage, i: number, scenery: boolean) => {
    const active = isImage(img.assetId);
    // rótulo amigável: nome do cenário, ou nome do envio sem extensão; ids viram "Imagem N"
    const friendly = scenery ? (img.scenery?.name ?? backgroundImageLabel(img.name, i)) : backgroundImageLabel(img.name, i);
    return (
      <button
        key={img.id}
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={friendly}
        title={scenery ? `${friendly} · cenário com enquadramento e posição sugeridos` : friendly}
        data-testid={`background-${img.id}`}
        onClick={() => (scenery ? onScenery(img) : onChange({ type: 'image', assetId: img.assetId, name: friendly.slice(0, 60) }))}
        className={tile(active)}
      >
        <MiniScreen presenterPreviewUrl={scenery ? undefined : presenterPreviewUrl}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {scenery && (
            <span className="absolute left-2 top-2 rounded-full bg-bg/90 px-2 py-0.5 text-[11px] font-medium text-fg backdrop-blur-sm">
              {img.scenery?.foregroundFrom !== undefined ? 'com balcão' : img.scenery?.frame ? 'plano médio' : 'cenário'}
            </span>
          )}
        </MiniScreen>
        <span className="block truncate px-1.5 pt-2 pb-1 text-xs font-medium text-fg-muted" aria-hidden="true">{friendly}</span>
      </button>
    );
  };

  return (
    <section aria-labelledby="bg-title" className="space-y-6">
      <div>
        <h2 id="bg-title" className="font-display text-xl font-bold">Em que ambiente</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Fundo atrás do apresentador. Uma cor lisa funciona bem; uma imagem dá contexto; um cenário já vem com enquadramento e posição.
          {presenterPreviewUrl ? ' As miniaturas mostram o apresentador escolhido em cada ambiente.' : ''}
        </p>
      </div>
      {shown && <p role="alert" className="text-sm text-danger">{shown}</p>}
      {sceneries.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-fg">Cenários</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4" role="radiogroup" aria-label="Cenários" data-testid="background-sceneries">
            {sceneries.map((img, i) => imageTile(img, i, true))}
          </div>
          <p className="text-xs text-fg-muted">Ao escolher um cenário, a posição, o tamanho, a folga e o balcão da apresentadora são preenchidos; ajuste abaixo em "Posição da apresentadora".</p>
        </div>
      )}
      <div className="space-y-3">
        <p className="text-sm font-medium text-fg">Cores</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4" role="radiogroup" aria-label="Fundos de cor">
          {(data?.presets ?? []).map((c) => {
            const active = isColor(c.value);
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={c.name}
                title={c.name}
                data-testid={`background-${c.id}`}
                onClick={() => onChange({ type: 'color', value: c.value, name: c.name })}
                className={tile(active)}
              >
                <MiniScreen presenterPreviewUrl={presenterPreviewUrl}>
                  <span className="absolute inset-0" style={{ backgroundColor: c.value }} />
                </MiniScreen>
                <span className="block truncate px-1.5 pt-2 pb-1 text-xs font-medium text-fg-muted" aria-hidden="true">{c.name}</span>
              </button>
            );
          })}
        </div>
        {data && data.presets.length === 0 && <p className="text-sm text-fg-muted">Nenhuma cor predefinida.</p>}
        {!data && !error && <p className="text-sm text-fg-muted">Carregando…</p>}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-fg">Imagens</p>
          <div>
            <label htmlFor="bg-upload" className="sr-only">Enviar imagem de fundo (PNG, JPEG ou WebP)</label>
            <input ref={inputRef} id="bg-upload" type="file" tabIndex={-1} accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden="true" /> {uploading ? 'Enviando…' : 'Enviar imagem'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4" role="radiogroup" aria-label="Fundos de imagem">
          {others.map((img, i) => imageTile(img, i, false))}
        </div>
        {data && others.length === 0 && <p className="text-sm text-fg-muted">Nenhuma imagem enviada ainda. PNG, JPEG ou WebP.</p>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Posição da apresentadora                                            */
/* ------------------------------------------------------------------ */

const PLACEMENT_ORDER: PresenterPlacement[] = ['center', 'right', 'left'];
/** quadro de referência da prévia (a mesma geometria da montagem em 1080p) */
const PREVIEW_FRAME = { width: 1920, height: 1080 };
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** Tamanho natural de uma imagem (carregada fora da tela); null enquanto carrega ou se falhar. */
function useImageSize(src: string | null): { width: number; height: number } | null {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  React.useEffect(() => {
    setSize(null);
    if (!src) return;
    let alive = true;
    const img = new window.Image();
    img.onload = () => alive && setSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => alive && setSize(null);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return size;
}

/**
 * Posição, tamanho, folga, base, balcão, enquadramento e cor — tudo o que a
 * montagem nossa (direita/esquerda) usa — com a prévia ao vivo calculada pela
 * MESMA função da montagem (`computeComposition`).
 */
function PresenterPlacementPicker({
  presentation: p,
  backgroundImage,
  onChange,
}: {
  presentation: Presentation;
  /** a imagem de fundo escolhida (com metadados de cenário, se houver) */
  backgroundImage: BackgroundImage | undefined;
  onChange: (patch: Partial<Presentation>, coalesce?: string) => void;
}) {
  const placement = p.presenterPlacement ?? 'center';
  const positioned = placement !== 'center';
  const bg = p.background;
  const isImage = bg.type === 'image';
  const bgSize = useImageSize(isImage ? `/api/assets/${bg.assetId}` : null);
  const scale = p.presenterScale ?? 0.92;
  const headroomOn = p.presenterHeadroom !== undefined;
  const deskOn = isImage && bg.foregroundFrom !== undefined;
  const framePreset: BackdropFramePreset = isImage && bg.frame ? 'medium' : 'wide';
  const setBackground = (patch: Partial<Extract<Presentation['background'], { type: 'image' }>>, coalesce?: string) => {
    if (!isImage) return;
    const next = { ...bg, ...patch } as Presentation['background'];
    for (const k of Object.keys(next) as Array<keyof typeof next>) if (next[k] === undefined) delete next[k];
    onChange({ background: next }, coalesce);
  };
  const composition = React.useMemo(
    () =>
      computeComposition({
        frame: PREVIEW_FRAME,
        backdrop: isImage ? { width: bgSize?.width ?? 1920, height: bgSize?.height ?? 1080, frame: positioned ? bg.frame : undefined } : undefined,
        clip: NOMINAL_CLIP,
        placement,
        presenterX: positioned ? p.presenterX : undefined,
        presenterScale: positioned ? scale : 0.9,
        presenterBottom: positioned ? p.presenterBottom : undefined,
        headroom: positioned ? p.presenterHeadroom : undefined,
        foregroundFrom: positioned && isImage ? bg.foregroundFrom : undefined,
      }),
    [isImage, bgSize, bg, placement, positioned, p.presenterX, scale, p.presenterBottom, p.presenterHeadroom],
  );
  const mediumFrame = (): BackdropFrame => backgroundImage?.scenery?.frame ?? mediumFrameFor(bgSize ?? { width: 1920, height: 1080 });
  const xValue = p.presenterX ?? composition.centerX;
  const bottomValue = p.presenterBottom ?? 1;
  const slider = 'w-full accent-[var(--color-accent)] disabled:opacity-50';
  const row = (label: string, id: string, value: string) => (
    <div className="mb-1 flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      <span className="text-xs tabular-nums text-fg-muted" aria-hidden="true">{value}</span>
    </div>
  );
  return (
    <section aria-labelledby="placement-title" className="space-y-5" data-testid="presenter-placement">
      <div>
        <h2 id="placement-title" className="font-display text-xl font-bold">Posição da apresentadora</h2>
        <p className="mt-1 text-sm text-fg-muted">Onde ela aparece no quadro do vídeo, sobre o ambiente escolhido. A prévia usa a mesma geometria da montagem.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start">
        <div className="space-y-5">
          <div role="radiogroup" aria-label="Posição da apresentadora" className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg-2 p-1">
            {PLACEMENT_ORDER.map((v) => {
              const active = placement === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ presenterPlacement: v })}
                  data-testid={`placement-${v}`}
                  className={cn('min-h-11 rounded-lg px-5 text-sm font-medium transition-colors', active ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg')}
                >
                  {PRESENTER_PLACEMENT_LABELS[v]}
                </button>
              );
            })}
          </div>
          <p id="placement-note" className="text-sm text-fg-muted">
            {positioned
              ? 'Direita/esquerda geram o vídeo com fundo transparente e montam a apresentadora sobre o fundo escolhido; os ajustes abaixo valem para essa montagem.'
              : 'No centro, o vídeo sai do provedor como ele compõe (apresentadora centralizada); escolha direita ou esquerda para ajustar posição, balcão e enquadramento.'}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              {row('Posição horizontal', 'presenter-x', `${Math.round(xValue * 100)}% da largura${p.presenterX === undefined ? ' (predefinida)' : ''}`)}
              <input id="presenter-x" type="range" min={PRESENTER_X_MIN} max={PRESENTER_X_MAX} step={0.005} value={xValue} disabled={!positioned} aria-valuetext={`${Math.round(xValue * 100)}% da largura`} aria-describedby="placement-note"
                onChange={(e) => onChange({ presenterX: Math.round(Number(e.target.value) * 1000) / 1000 }, 'presentation.presenterX')} className={slider} data-testid="presenter-x" />
              {positioned && p.presenterX !== undefined && (
                <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => onChange({ presenterX: undefined })} data-testid="presenter-x-reset">Voltar ao predefinido</button>
              )}
            </div>
            <div>
              {row('Tamanho', 'presenter-scale', headroomOn ? `${Math.round(composition.scale * 100)}% (pela folga)` : `${Math.round(scale * 100)}% da altura`)}
              <input id="presenter-scale" type="range" min={0.5} max={1.2} step={0.02} value={scale} disabled={!positioned} aria-valuetext={`${Math.round(scale * 100)}% da altura do quadro`} aria-describedby="placement-note"
                onChange={(e) => onChange({ presenterScale: Math.round(Number(e.target.value) * 100) / 100 }, 'presentation.presenterScale')} className={slider} data-testid="presenter-scale" />
              {!positioned && <p className="mt-1 text-xs text-fg-muted">O tamanho vale para direita e esquerda.</p>}
            </div>
            <div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-fg">
                <Checkbox checked={headroomOn} disabled={!positioned} onChange={(e) => onChange({ presenterHeadroom: e.target.checked ? 0.06 : undefined })} data-testid="presenter-headroom-toggle" />
                Folga acima da cabeça
              </label>
              {headroomOn && (
                <>
                  {row('Folga', 'presenter-headroom', `${Math.round((p.presenterHeadroom ?? 0.06) * 100)}% da altura`)}
                  <input id="presenter-headroom" type="range" min={PRESENTER_HEADROOM_MIN} max={PRESENTER_HEADROOM_MAX} step={0.005} value={p.presenterHeadroom ?? 0.06} disabled={!positioned} aria-valuetext={`${Math.round((p.presenterHeadroom ?? 0.06) * 100)}% da altura`}
                    onChange={(e) => onChange({ presenterHeadroom: Math.round(Number(e.target.value) * 1000) / 1000 }, 'presentation.presenterHeadroom')} className={slider} data-testid="presenter-headroom" />
                  <p className="mt-1 text-xs text-fg-muted">O clipe desce até o topo da cabeça cair nessa linha; o tronco continua para fora do quadro.</p>
                </>
              )}
            </div>
            <div>
              {row('Base do recorte', 'presenter-bottom', `${Math.round(bottomValue * 100)}% da altura`)}
              <input id="presenter-bottom" type="range" min={PRESENTER_BOTTOM_MIN} max={1} step={0.005} value={bottomValue} disabled={!positioned || !deskOn} aria-valuetext={`${Math.round(bottomValue * 100)}% da altura`}
                onChange={(e) => onChange({ presenterBottom: Number(e.target.value) >= 0.999 ? undefined : Math.round(Number(e.target.value) * 1000) / 1000 }, 'presentation.presenterBottom')} className={slider} data-testid="presenter-bottom" />
              <p className="mt-1 text-xs text-fg-muted">{deskOn ? 'Com balcão: a base fica na linha do tampo (nunca acima dela).' : 'Sem balcão, a base fica no fundo do quadro (o tronco não pode ficar cortado à mostra).'}</p>
            </div>
          </div>
          {isImage ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-fg">
                  <Checkbox checked={deskOn} disabled={!positioned} onChange={(e) => setBackground({ foregroundFrom: e.target.checked ? (backgroundImage?.scenery?.foregroundFrom ?? 0.85) : undefined })} data-testid="foreground-toggle" />
                  Há um balcão/mesa na frente
                </label>
                {deskOn && (
                  <>
                    {row('Linha do balcão', 'foreground-from', `${Math.round((bg.foregroundFrom ?? 0.85) * 100)}% da altura`)}
                    <input id="foreground-from" type="range" min={FOREGROUND_FROM_MIN} max={1} step={0.005} value={bg.foregroundFrom ?? 0.85} disabled={!positioned} aria-valuetext={`${Math.round((bg.foregroundFrom ?? 0.85) * 100)}% da altura`}
                      onChange={(e) => setBackground({ foregroundFrom: Math.round(Number(e.target.value) * 1000) / 1000 }, 'presentation.background.foregroundFrom')} className={slider} data-testid="foreground-from" />
                    <p className="mt-1 text-xs text-fg-muted">A faixa da imagem a partir dessa linha fica por cima da apresentadora (ela aparece atrás do balcão).</p>
                  </>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-fg">Enquadramento do cenário</p>
                <div role="radiogroup" aria-label="Enquadramento do cenário" className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg-2 p-1">
                  {BACKDROP_FRAME_PRESETS.map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={framePreset === v} disabled={!positioned} data-testid={`frame-preset-${v}`}
                      onClick={() => setBackground({ frame: v === 'wide' ? undefined : mediumFrame() })}
                      className={cn('min-h-11 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50', framePreset === v ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg')}>
                      {BACKDROP_FRAME_PRESET_LABELS[v]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-fg-muted">Plano médio recorta o cenário em 16:9 sem o piso, para combinar com o plano médio da apresentadora.</p>
              </div>
            </div>
          ) : null}
          <div className="max-w-xs">
            <label htmlFor="presenter-grade" className="mb-1 block text-sm font-medium text-fg">Cor da apresentadora</label>
            <Select id="presenter-grade" value={p.presenterGrade ?? 'none'} disabled={!positioned} onChange={(e) => onChange({ presenterGrade: e.target.value === 'none' ? undefined : (e.target.value as PresenterGrade) })} className="min-h-11 text-sm" data-testid="presenter-grade">
              {PRESENTER_GRADES.map((g) => (
                <option key={g} value={g}>{PRESENTER_GRADE_LABELS[g]}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-fg-muted">Ajuste leve só na camada da apresentadora, para combinar com a luz do cenário.</p>
          </div>
        </div>
        <CompositionPreview
          presentation={p}
          composition={composition}
          bgSize={bgSize}
          onDragX={positioned ? (x) => onChange({ presenterX: Math.round(x * 1000) / 1000 }, 'presentation.presenterX') : undefined}
        />
      </div>
    </section>
  );
}

/**
 * Prévia 16:9 ao vivo: cenário recortado/escalado, apresentadora de referência
 * (recorte com alfa, mesmo tamanho nominal do clipe do HeyGen) e a faixa do
 * balcão por cima — tudo nas coordenadas de `computeComposition`. Arrastar a
 * apresentadora muda a posição horizontal.
 */
function CompositionPreview({ presentation: p, composition: c, bgSize, onDragX }: { presentation: Presentation; composition: Composition; bgSize: { width: number; height: number } | null; onDragX?: (x: number) => void }) {
  const { width: W, height: H } = PREVIEW_FRAME;
  const bg = p.background;
  const stageRef = React.useRef<HTMLSpanElement>(null);
  const dragging = React.useRef(false);
  const placement = p.presenterPlacement ?? 'center';
  const grade = (p.presenterPlacement ?? 'center') !== 'center' ? (p.presenterGrade ?? 'none') : 'none';
  const bgStyle: React.CSSProperties | undefined =
    bg.type === 'image' && c.bgCrop
      ? {
          left: pct(-c.bgCrop.x * c.bgScale, W),
          top: pct(-c.bgCrop.y * c.bgScale, H),
          width: pct((bgSize?.width ?? W) * c.bgScale, W),
          height: pct((bgSize?.height ?? H) * c.bgScale, H),
          filter: bg.blur === false ? undefined : 'blur(1px)',
        }
      : undefined;
  const onPointer = (e: React.PointerEvent) => {
    if (!dragging.current || !onDragX || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    onDragX(Math.min(PRESENTER_X_MAX, Math.max(PRESENTER_X_MIN, (e.clientX - r.left) / r.width)));
  };
  return (
    <div className="space-y-2" data-testid="placement-preview" data-placement={placement}>
      <span
        ref={stageRef}
        className={cn('relative block aspect-video w-full overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line', onDragX && 'cursor-ew-resize touch-none')}
        aria-hidden="true"
        onPointerDown={(e) => {
          if (!onDragX) return;
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onPointer(e);
        }}
        onPointerMove={onPointer}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {bg.type === 'color' ? (
          <span className="absolute inset-0" style={{ backgroundColor: bg.value }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${bg.assetId}`} alt="" className="absolute max-w-none" style={bgStyle ?? { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} data-testid="preview-backdrop" />
        )}
        {/* apresentadora de referência: recorte com alfa, 1920×1072 como o clipe do HeyGen, só escala uniforme */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/studio/presenter-cutout.png"
          alt=""
          className="absolute max-w-none select-none drop-shadow-sm"
          draggable={false}
          style={{ left: pct(c.clip.x, W), top: pct(c.clip.y, H), width: pct(c.clip.w, W), height: pct(c.clip.h, H), filter: PRESENTER_GRADE_CSS[grade] === 'none' ? undefined : PRESENTER_GRADE_CSS[grade] }}
          data-testid="preview-presenter"
          data-x={c.clip.x}
          data-y={c.clip.y}
          data-w={c.clip.w}
          data-h={c.clip.h}
        />
        {bg.type === 'image' && c.foreground && bgStyle && (
          // faixa do balcão: a mesma imagem, nítida, recortada a partir da linha do balcão, por cima da apresentadora
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${bg.assetId}`} alt="" className="absolute max-w-none" style={{ ...bgStyle, filter: undefined, clipPath: `inset(${pct(c.foreground.y + c.bgCrop!.y * c.bgScale, H)} 0 0 0)` }} data-testid="preview-foreground" />
        )}
      </span>
      <p className="text-xs text-fg-muted" data-testid="placement-preview-caption">
        Prévia: {PRESENTER_PLACEMENT_LABELS[placement].toLowerCase()}
        {placement === 'center' ? '' : `, centro em ${Math.round(c.centerX * 100)}%, ${Math.round(c.scale * 100)}% da altura, cabeça a ${Math.round(c.headTop * 100)}% do topo${c.foreground ? `, balcão a partir de ${Math.round((c.foreground.y / H) * 100)}%` : ''}`}.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Câmeras                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_DIRECTION_STYLE: DirectionStyle = { pace: 'balanced', useSlides: true, slideAccent: DEFAULT_SLIDE_ACCENT, maxCinematicPerLesson: 2, matchCinematicSetting: true, cameraMode: 'single', cardsPerMinute: 2, gestures: 'natural' };

function CameraThumb({ src, name }: { src?: string; name: string }) {
  return (
    <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-2 ring-1 ring-line">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-surface-2 font-display text-lg font-bold text-accent" aria-hidden="true">
          {(name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * Kit de câmeras: cada câmera é um visual (look) do mesmo apresentador. A
 * primeira é a principal e acompanha o apresentador escolhido; com o kit vazio,
 * o próprio apresentador é a câmera principal (implícita).
 */
function CameraKit({ presentation: p, simulation = false }: { presentation: Presentation; simulation?: boolean }) {
  const { update } = useDraft();
  const cams = p.cameras ?? [];
  const [picking, setPicking] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const generateButtonRef = React.useRef<HTMLButtonElement>(null);
  // com o kit vazio, adicionar uma câmera cria também a principal (ocupa 2 lugares)
  const full = cams.length + (cams.length === 0 ? 1 : 0) >= MAX_CAMERAS;

  const setCameras = (fn: (list: Camera[], pres: Presentation) => Camera[], coalesce?: string) =>
    update((d) => ({ ...d, presentation: { ...d.presentation, cameras: fn(d.presentation.cameras ?? [], d.presentation) } }), coalesce ? { coalesce } : undefined);
  const patchCamera = (id: string, patch: Partial<Camera>, coalesce?: string) => setCameras((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)), coalesce);

  const add = (cam: Omit<Camera, 'id'>) => {
    const id = newCameraId();
    setCameras((list, pres) => {
      const base: Camera[] =
        list.length > 0 || !pres.avatarId
          ? list
          : [{ id: newCameraId(), name: 'Câmera principal', lookId: pres.avatarId, previewUrl: pres.avatarPreviewUrl, nativeFraming: 'medium', angle: 'front', status: 'ready' }];
      return [...base, { ...cam, id }].slice(0, MAX_CAMERAS);
    });
    setPicking(false);
    setGenerating(false);
    // o seletor/diálogo some: o foco vai para o nome da câmera recém-criada
    focusAfter(() => document.getElementById(`camera-name-${id}`), { preventScroll: false });
  };
  const closePicker = () => {
    setPicking(false);
    focusAfter(() => addButtonRef.current, { preventScroll: true });
  };
  const closeGenerate = () => {
    setGenerating(false);
    focusAfter(() => generateButtonRef.current, { preventScroll: true });
  };

  // ângulos gerados por IA: consulta ao montar e a cada 5 s até ficarem prontos (ou falharem)
  const pendingKey = cams
    .filter((c) => c.status === 'generating' && c.generationId)
    .map((c) => `${c.id}:${c.generationId}`)
    .join(',');
  React.useEffect(() => {
    if (!pendingKey) return;
    const pending = pendingKey.split(',').map((x) => {
      const at = x.indexOf(':');
      return { id: x.slice(0, at), generationId: x.slice(at + 1) };
    });
    let cancelled = false;
    const tick = async () => {
      for (const { id, generationId } of pending) {
        try {
          const r = await api<{ status: 'pending' | 'processing' | 'completed' | 'failed'; lookId?: string; previewUrl?: string; error?: string }>(`/api/media/looks/${encodeURIComponent(generationId)}`);
          if (cancelled) return;
          if (r.status === 'completed' && r.lookId) {
            const lookId = r.lookId;
            setCameras((list) => list.map((c) => (c.id === id && c.status === 'generating' ? { ...c, status: 'ready', lookId, previewUrl: r.previewUrl ?? c.previewUrl, generationError: undefined } : c)));
          } else if (r.status === 'failed') {
            setCameras((list) =>
              list.map((c) => (c.id === id && c.status === 'generating' ? { ...c, status: 'failed', generationError: (r.error ?? 'A geração falhou no provedor').slice(0, 500) } : c)),
            );
          }
        } catch {
          /* tenta de novo no próximo ciclo */
        }
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
    // setCameras usa só `update` (estável)
  }, [pendingKey]); // eslint-disable-line

  const excluded = new Set([p.avatarId, ...cams.map((c) => c.lookId)].filter((x): x is string => !!x));

  return (
    <section aria-labelledby="cameras-title" className="space-y-5" data-testid="camera-kit">
      <div>
        <h2 id="cameras-title" className="font-display text-xl font-bold">Câmeras</h2>
        <p className="mt-1 text-sm text-fg-muted">Cada câmera é um visual do mesmo apresentador. Com uma câmera só, os cortes e closes são feitos por zoom.</p>
      </div>

      <ol className="space-y-3" aria-label="Câmeras do curso">
        {cams.length === 0 ? (
          <li className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-3" data-testid="camera-principal">
            <CameraThumb src={p.avatarPreviewUrl} name={p.avatarName ?? 'Câmera principal'} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                Câmera principal
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">Principal</span>
              </p>
              <p className="text-sm text-fg-muted">
                {p.avatarId ? `${p.avatarName ?? 'Apresentador escolhido'} · ${ANGLE_LABEL.front} · ${FRAMING_LABEL.medium}` : 'Escolha quem apresenta para definir a câmera principal.'}
              </p>
              <p className="text-xs text-fg-faint">Automática: é o apresentador escolhido acima.</p>
            </div>
          </li>
        ) : (
          cams.map((c, i) => {
            const nameId = `camera-name-${c.id}`;
            return (
              <li key={c.id} className={cn('rounded-2xl border bg-surface p-3', c.status === 'failed' ? 'border-danger/40' : 'border-line')} data-testid={`camera-${c.id}`} data-status={c.status}>
                {c.status === 'generating' && (
                  <p role="status" className="mb-3 flex items-center gap-2 rounded-full bg-paid-soft px-3 py-1.5 text-xs font-medium text-paid">
                    <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-paid" aria-hidden="true" /> Gerando ângulo… pode levar alguns minutos. Pode fechar a página: o resultado fica guardado.
                  </p>
                )}
                {c.status === 'failed' && (
                  <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
                    Não foi possível gerar este ângulo{c.generationError ? `: ${c.generationError}` : '.'} Remova a câmera e tente de novo.
                  </p>
                )}
                <div className="flex flex-wrap items-start gap-4">
                  <CameraThumb src={c.previewUrl} name={c.name} />
                  <div className="grid min-w-0 flex-1 basis-64 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(9.5rem,1fr)_minmax(9.5rem,1fr)]">
                    <div>
                      <label htmlFor={nameId} className="mb-1 flex items-center gap-2 text-xs font-medium text-fg-muted">
                        Nome
                        {i === 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">Principal</span>}
                        {c.placement === 'full_frame' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted" data-testid={`camera-full-frame-${c.id}`}>tela cheia</span>}
                        {c.zone && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong" data-testid={`camera-zone-badge-${c.id}`}>{CAMERA_ZONE_LABELS[c.zone]}</span>}
                        {c.status === 'generating' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">Gerando…</span>}
                        {c.status === 'failed' && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger" title={c.generationError}>Falhou</span>}
                      </label>
                      <Input id={nameId} maxLength={60} value={c.name} placeholder={i === 0 ? 'Câmera principal' : 'Câmera lateral'} onChange={(e) => patchCamera(c.id, { name: e.target.value }, `camera.name.${c.id}`)} className="min-h-11 text-sm" />
                    </div>
                    <div>
                      <label htmlFor={`camera-angle-${c.id}`} className="mb-1 block text-xs font-medium text-fg-muted">Ângulo</label>
                      {/* largura mínima para "Pela esquerda"/"Pela direita" não cortarem */}
                      <Select id={`camera-angle-${c.id}`} value={c.angle} onChange={(e) => patchCamera(c.id, { angle: e.target.value as CameraAngle })} className="min-h-11 min-w-[9.5rem] text-sm">
                        {ANGLE_ORDER.map((a) => (
                          <option key={a} value={a}>{ANGLE_LABEL[a]}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label htmlFor={`camera-framing-${c.id}`} className="mb-1 block text-xs font-medium text-fg-muted">Enquadramento</label>
                      <Select id={`camera-framing-${c.id}`} value={c.nativeFraming} onChange={(e) => patchCamera(c.id, { nativeFraming: e.target.value as Framing })} className="min-h-11 min-w-[9.5rem] text-sm">
                        {FRAMING_ORDER.map((f) => (
                          <option key={f} value={f}>{FRAMING_LABEL[f]}</option>
                        ))}
                      </Select>
                    </div>
                    <CameraPlacementFields camera={c} presentation={p} onChange={(patch, coalesce) => patchCamera(c.id, patch, coalesce)} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Subir ${c.name || 'câmera'}`} disabled={i === 0} onClick={() => setCameras((list) => moveItem(list, i, -1))}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Descer ${c.name || 'câmera'}`} disabled={i === cams.length - 1} onClick={() => setCameras((list) => moveItem(list, i, 1))}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {/* a câmera principal acompanha o apresentador: não se remove (só se troca o apresentador) */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-danger hover:text-danger"
                      aria-label={`Remover ${c.name || 'câmera'}`}
                      disabled={i === 0}
                      title={i === 0 ? 'A câmera principal acompanha o apresentador escolhido e não pode ser removida' : undefined}
                      onClick={() => {
                        setCameras((list) => list.filter((x) => x.id !== c.id));
                        focusAfter(() => addButtonRef.current, { preventScroll: true });
                      }}
                      data-testid={`camera-remove-${c.id}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ol>
      {cams.length > 1 && <p className="text-xs text-fg-muted">A primeira câmera da lista é a principal: é ela que aparece quando um plano não escolhe outra.</p>}

      {!picking ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button ref={addButtonRef} variant="secondary" size="sm" disabled={full || !p.avatarId} onClick={() => setPicking(true)} title={!p.avatarId ? 'Escolha quem apresenta primeiro' : full ? `No máximo ${MAX_CAMERAS} câmeras` : undefined} data-testid="camera-add">
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar câmera
            </Button>
            <Button ref={generateButtonRef} variant="paid" size="sm" disabled={full || !p.avatarId} onClick={() => setGenerating(true)} title={!p.avatarId ? 'Escolha quem apresenta primeiro' : full ? `No máximo ${MAX_CAMERAS} câmeras` : undefined} data-testid="camera-generate">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Gerar novo ângulo com IA
            </Button>
          </div>
          <p className="text-xs text-fg-muted">
            Gera um novo visual do mesmo apresentador com outro ângulo. {simulation ? 'Modo de demonstração: nenhuma cobrança será feita.' : 'Cobrado na HeyGen.'}
          </p>
        </div>
      ) : (
        <LookPicker mainLookId={p.avatarId} excluded={excluded} suggestedName={cams.length <= 1 ? 'Câmera lateral' : `Câmera ${cams.length + 1}`} onAdd={add} onCancel={closePicker} />
      )}
      {full && <p className="text-xs text-fg-muted">O kit já tem {MAX_CAMERAS} câmeras, o máximo (contando as que estão sendo geradas).</p>}
      {generating && p.avatarId && (
        <GenerateAngleDialog
          sources={[
            { lookId: p.avatarId, label: `Câmera principal${p.avatarName ? ` (${humanName(p.avatarName).label})` : ''}` },
            ...cams.filter((c, i) => i > 0 && c.status === 'ready' && c.lookId && c.lookId !== p.avatarId).map((c) => ({ lookId: c.lookId, label: c.name || 'Câmera sem nome' })),
          ]}
          simulation={simulation}
          pronoun={p.presenterPronoun ?? 'she'}
          onCancel={closeGenerate}
          onCreated={(cam) => add(cam)}
        />
      )}
    </section>
  );
}

const SEATED_PLACEMENT_HINT = 'Para visuais sentados, use Tela cheia para não cortar cadeira e mesa.';

/**
 * Posição desta câmera: "Igual ao curso" (padrão), centro, direita, esquerda ou
 * tela cheia com o fundo do próprio visual; tamanho só com direita/esquerda.
 */
function CameraPlacementFields({ camera: c, presentation: p, onChange }: { camera: Camera; presentation: Presentation; onChange: (patch: Partial<Camera>, coalesce?: string) => void }) {
  const value: CameraPlacement = c.placement ?? 'inherit';
  const resolved = resolveCameraPlacement(p, c);
  const courseLabel = PRESENTER_PLACEMENT_LABELS[p.presenterPlacement ?? 'center'];
  const ownSide = value === 'right' || value === 'left';
  const scale = c.scale ?? p.presenterScale ?? 0.92;
  // visual sentado (pedido ou nome) fora da tela cheia: o recorte cortaria cadeira e mesa
  const seatedWarning = looksSeated(`${c.generationPrompt ?? ''} ${c.name}`) && resolved.placement !== 'full_frame';
  const hintId = `camera-placement-hint-${c.id}`;
  return (
    <div className="grid gap-3 sm:col-span-3 sm:grid-cols-[minmax(18rem,1fr)_minmax(0,1fr)]" data-testid={`camera-placement-row-${c.id}`}>
      <div>
        <label htmlFor={`camera-placement-${c.id}`} className="mb-1 block text-xs font-medium text-fg-muted">Posição</label>
        <Select
          id={`camera-placement-${c.id}`}
          value={value}
          onChange={(e) => {
            const next = e.target.value as CameraPlacement;
            // "igual ao curso" volta a seguir o curso por inteiro (sem tamanho próprio)
            onChange(next === 'inherit' ? { placement: undefined, scale: undefined } : { placement: next });
          }}
          aria-describedby={hintId}
          className="min-h-11 text-sm"
          data-testid={`camera-placement-${c.id}`}
        >
          {CAMERA_PLACEMENTS.map((v) => (
            <option key={v} value={v}>{v === 'inherit' ? `${CAMERA_PLACEMENT_LABELS.inherit} (${courseLabel})` : CAMERA_PLACEMENT_LABELS[v]}</option>
          ))}
        </Select>
      </div>
      <div className="min-w-0">
        {/* estúdio com zonas: onde a apresentadora está no quadro deste visual (a parede livre fica do outro lado) */}
        <div className="mb-2">
          <label htmlFor={`camera-zone-${c.id}`} className="mb-1 block text-xs font-medium text-fg-muted">Zona no estúdio</label>
          <Select
            id={`camera-zone-${c.id}`}
            value={c.zone ?? ''}
            onChange={(e) => onChange({ zone: (e.target.value || undefined) as CameraZone | undefined })}
            className="min-h-11 text-sm"
            data-testid={`camera-zone-${c.id}`}
          >
            <option value="">Sem zona (câmera comum)</option>
            {CAMERA_ZONES.map((z) => (
              <option key={z} value={z}>{CAMERA_ZONE_LABELS[z]}</option>
            ))}
          </Select>
        </div>
        {ownSide && (
          <div className="mb-1">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <label htmlFor={`camera-scale-${c.id}`} className="text-xs font-medium text-fg-muted">Tamanho</label>
              <span className="text-xs tabular-nums text-fg-muted" aria-hidden="true">{Math.round(scale * 100)}% da altura</span>
            </div>
            <input
              id={`camera-scale-${c.id}`}
              type="range"
              min={0.5}
              max={1.2}
              step={0.02}
              value={scale}
              aria-valuetext={`${Math.round(scale * 100)}% da altura do quadro`}
              onChange={(e) => onChange({ scale: Math.round(Number(e.target.value) * 100) / 100 }, `camera.scale.${c.id}`)}
              className="w-full accent-[var(--color-accent)]"
              data-testid={`camera-scale-${c.id}`}
            />
          </div>
        )}
        <p id={hintId} className={cn('text-xs', seatedWarning ? 'text-paid' : 'text-fg-muted')} data-testid={`camera-placement-hint-${c.id}`}>
          {resolved.placement === 'full_frame'
            ? 'Tela cheia: o visual aparece inteiro, com o fundo dele (sem o fundo do curso).'
            : resolved.transparent
              ? `Em pé ${resolved.placement === 'right' ? 'à direita' : 'à esquerda'}, recortada sobre o fundo do curso. `
              : ''}
          {resolved.placement !== 'full_frame' && SEATED_PLACEMENT_HINT}
        </p>
      </div>
    </div>
  );
}

/** Lista de visuais do provedor para escolher uma câmera nova; do mesmo grupo do apresentador, quando o provedor informa o grupo. */
function LookPicker({
  mainLookId,
  excluded,
  suggestedName,
  onAdd,
  onCancel,
}: {
  mainLookId?: string;
  excluded: Set<string>;
  suggestedName: string;
  onAdd: (cam: Omit<Camera, 'id'>) => void;
  onCancel: () => void;
}) {
  const [state, setState] = React.useState<{ looks: AvatarLook[]; nextToken?: string; loading: boolean; error: string | null }>({ looks: [], loading: true, error: null });
  const [group, setGroup] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [chosen, setChosen] = React.useState<AvatarLook | null>(null);
  const [name, setName] = React.useState(suggestedName);
  const [angle, setAngle] = React.useState<CameraAngle>('left');
  const [framing, setFraming] = React.useState<Framing>('medium');

  const load = React.useCallback(async (opts: { token?: string; group?: string | null } = {}) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const q = new URLSearchParams();
      if (opts.token) q.set('token', opts.token);
      if (opts.group) q.set('group', opts.group);
      const qs = q.toString();
      const r = await api<{ simulation: boolean; looks: AvatarLook[]; nextToken?: string }>(`/api/media/avatars${qs ? `?${qs}` : ''}`);
      setState((s) => ({ looks: opts.token ? [...s.looks, ...r.looks] : r.looks, nextToken: r.nextToken, loading: false, error: null }));
      return r.looks;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(e, 'Não foi possível carregar os visuais') }));
      return [];
    }
  }, []);

  // primeira carga: descobre o grupo do apresentador principal e, se houver, filtra por ele
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await load();
      if (cancelled) return;
      const g = first.find((a) => a.id === mainLookId)?.groupId;
      if (g) {
        setGroup(g);
        await load({ group: g });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, mainLookId]);

  const visible = React.useMemo(() => {
    const q = normalize(query);
    return state.looks.filter((a) => {
      if (excluded.has(a.id)) return false;
      if (group && a.groupId && a.groupId !== group) return false;
      if (!q) return true;
      return normalize(`${a.name} ${humanName(a.name).label} ${a.id}`).includes(q);
    });
  }, [state.looks, query, excluded, group]);

  // Esc fecha o seletor (o foco volta a "Adicionar câmera", ver CameraKit.closePicker)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (chosen) setChosen(null);
      else onCancel();
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4" data-testid="camera-picker" role="group" aria-labelledby="camera-picker-title" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p id="camera-picker-title" className="text-sm font-semibold text-fg">Escolha o visual da nova câmera</p>
          <p className="text-xs text-fg-muted">
            {group ? 'Mostrando os visuais do mesmo apresentador.' : 'Escolha um visual do mesmo apresentador (outra roupa, ângulo ou enquadramento).'}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar a escolha de câmera" onClick={onCancel}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {!chosen ? (
        <>
          {state.looks.length > 0 && <SearchBox id="camera-look-search" label="Buscar visual pelo nome" value={query} onChange={setQuery} placeholder="Buscar pelo nome" autoFocus />}
          {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          {state.loading && state.looks.length === 0 && <p className="text-sm text-fg-muted">Carregando visuais…</p>}
          {!state.loading && visible.length === 0 && !state.error && <p className="text-sm text-fg-muted">Nenhum outro visual disponível{query ? ' com esse nome' : ''}.</p>}
          {visible.length > 0 && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" aria-label="Visuais disponíveis">
              {visible.map((a) => {
                const { label } = humanName(a.name);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(a)}
                      title={a.name}
                      data-testid={`camera-look-${a.id}`}
                      className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line hover:ring-2 hover:ring-line-strong"
                    >
                      {a.previewImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.previewImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center bg-surface-2 font-display text-3xl font-bold text-accent" aria-hidden="true">{label.slice(0, 1)}</span>
                      )}
                      <span className="absolute inset-x-1 bottom-1 line-clamp-2 rounded-lg bg-surface/90 px-2 py-1 text-left text-xs font-semibold leading-snug text-fg">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {state.nextToken && (
            <Button variant="secondary" size="sm" onClick={() => void load({ token: state.nextToken, group })} disabled={state.loading}>
              {state.loading ? 'Carregando…' : 'Carregar mais visuais'}
            </Button>
          )}
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd({ name: name.trim() || suggestedName, lookId: chosen.id, previewUrl: chosen.previewImageUrl, angle, nativeFraming: framing, status: 'ready' });
          }}
        >
          <div className="flex flex-wrap items-start gap-4">
            <CameraThumb src={chosen.previewImageUrl} name={humanName(chosen.name).label} />
            <div className="grid min-w-0 flex-1 basis-64 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="new-camera-name" className="mb-1 block text-xs font-medium text-fg-muted">Nome da câmera</label>
                <Input id="new-camera-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Câmera lateral" className="min-h-11 text-sm" autoFocus />
              </div>
              <div>
                <label htmlFor="new-camera-angle" className="mb-1 block text-xs font-medium text-fg-muted">Ângulo</label>
                <Select id="new-camera-angle" value={angle} onChange={(e) => setAngle(e.target.value as CameraAngle)} className="min-h-11 text-sm">
                  {ANGLE_ORDER.map((a) => (
                    <option key={a} value={a}>{ANGLE_LABEL[a]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="new-camera-framing" className="mb-1 block text-xs font-medium text-fg-muted">Enquadramento</label>
                <Select id="new-camera-framing" value={framing} onChange={(e) => setFraming(e.target.value as Framing)} className="min-h-11 text-sm">
                  {FRAMING_ORDER.map((f) => (
                    <option key={f} value={f}>{FRAMING_LABEL[f]}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" data-testid="camera-add-confirm">
              <CameraIcon className="h-4 w-4" aria-hidden="true" /> Adicionar ao kit
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>Escolher outro visual</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estilo de direção                                                   */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9a-fA-F]{6}$/;

function DirectionStyleFields({ style: raw, onChange }: { style: DirectionStyle | undefined; onChange: (patch: Partial<DirectionStyle>, coalesce?: string) => void }) {
  const style = { ...DEFAULT_DIRECTION_STYLE, ...raw };
  const [hex, setHex] = React.useState(style.slideAccent);
  React.useEffect(() => setHex(style.slideAccent), [style.slideAccent]);

  return (
    <section aria-labelledby="direction-style-title" className="space-y-5" data-testid="direction-style">
      <div>
        <h2 id="direction-style-title" className="font-display text-xl font-bold">Estilo de direção</h2>
        <p className="mt-1 text-sm text-fg-muted">Guia a IA ao dividir cada cena em planos. Você ajusta cena a cena no storyboard.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Ritmo dos planos">
        {PACE_ORDER.map((pace) => {
          const active = style.pace === pace;
          return (
            <button
              key={pace}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ pace })}
              data-testid={`pace-${pace}`}
              className={cn('rounded-2xl border-2 bg-surface p-4 text-left transition-colors', active ? 'border-accent' : 'border-line hover:border-line-strong')}
            >
              <span className="block text-sm font-semibold text-fg">{PACE[pace].label}</span>
              <span className="block text-xs text-fg-muted">≈ {PACE[pace].seconds} s por plano</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Câmera">
        {(['single', 'multi'] as const).map((mode) => {
          const active = (style.cameraMode ?? 'single') === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ cameraMode: mode })}
              data-testid={`camera-mode-${mode}`}
              className={cn('rounded-2xl border-2 bg-surface p-4 text-left transition-colors', active ? 'border-accent' : 'border-line hover:border-line-strong')}
            >
              <span className="block text-sm font-semibold text-fg">{mode === 'single' ? 'Uma câmera constante' : 'Várias câmeras'}</span>
              <span className="block text-xs text-fg-muted">
                {mode === 'single' ? 'Como numa aula de estúdio: a câmera principal o tempo todo; o ritmo vem dos cartões em tela cheia e dos gestos.' : 'O kit de câmeras alterna ângulos entre os planos.'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
            <Checkbox checked={style.useSlides} onChange={(e) => onChange({ useSlides: e.target.checked })} data-testid="direction-use-slides" />
            Usar cartões e slides para listas e ideias-chave
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="direction-cards-per-minute" className="mb-2 block text-sm font-medium text-fg">Cartões por minuto</label>
              <Select
                id="direction-cards-per-minute"
                value={String(style.cardsPerMinute ?? 2)}
                disabled={!style.useSlides}
                onChange={(e) => onChange({ cardsPerMinute: Number(e.target.value) })}
                aria-describedby="direction-cards-hint"
                className="min-h-11 text-sm"
                data-testid="direction-cards-per-minute"
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n === 0 ? 'Nenhum' : `≈ ${n}`}</option>
                ))}
              </Select>
              <p id="direction-cards-hint" className="mt-2 text-sm text-fg-muted">Cartões de marca em tela cheia (5 a 15 s) enquanto a voz continua; nunca dois seguidos.</p>
            </div>
            <div>
              <label htmlFor="direction-gestures" className="mb-2 block text-sm font-medium text-fg">Gestos</label>
              <Select id="direction-gestures" value={style.gestures ?? 'natural'} onChange={(e) => onChange({ gestures: e.target.value as DirectionStyle['gestures'] })} className="min-h-11 text-sm" data-testid="direction-gestures">
                <option value="natural">Naturais (mãos visíveis, explicando)</option>
                <option value="minimal">Mínimos (cabeça e olhar)</option>
              </Select>
              <p className="mt-2 text-sm text-fg-muted">Naturais: um gesto em todo plano explicativo. Nunca gestos com dedos.</p>
            </div>
          </div>
          <div>
            <label htmlFor="slide-accent-hex" className="mb-2 block text-sm font-medium text-fg">Cor de destaque dos slides</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Escolher a cor de destaque"
                value={HEX.test(hex) ? hex : style.slideAccent}
                onChange={(e) => {
                  setHex(e.target.value);
                  onChange({ slideAccent: e.target.value }, 'presentation.slideAccent');
                }}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
              />
              <Input
                id="slide-accent-hex"
                value={hex}
                maxLength={7}
                spellCheck={false}
                aria-describedby="slide-accent-hint"
                aria-invalid={!HEX.test(hex)}
                onChange={(e) => {
                  const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                  setHex(v);
                  if (HEX.test(v)) onChange({ slideAccent: v.toLowerCase() }, 'presentation.slideAccent');
                }}
                className="max-w-36 font-mono text-sm uppercase"
              />
            </div>
            <p id="slide-accent-hint" className={cn('mt-2 text-sm', HEX.test(hex) ? 'text-fg-muted' : 'text-danger')}>
              {HEX.test(hex) ? 'Usada em títulos, marcadores e letreiros.' : 'Use o formato #RRGGBB, por exemplo #1A66D1.'}
            </p>
          </div>
          <div>
            <label htmlFor="direction-max-cinematic" className="mb-2 block text-sm font-medium text-fg">Cenas em movimento por aula</label>
            <Select
              id="direction-max-cinematic"
              value={String(style.maxCinematicPerLesson ?? 2)}
              onChange={(e) => onChange({ maxCinematicPerLesson: Number(e.target.value) })}
              aria-describedby="direction-max-cinematic-hint"
              className="min-h-11 max-w-48 text-sm"
              data-testid="direction-max-cinematic"
            >
              {MAX_CINEMATIC_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 0 ? 'Nenhuma' : String(n)}</option>
              ))}
              {/* valor gravado fora das opções (até 6) continua visível */}
              {!(MAX_CINEMATIC_OPTIONS as readonly number[]).includes(style.maxCinematicPerLesson ?? 2) && <option value={style.maxCinematicPerLesson}>{style.maxCinematicPerLesson}</option>}
            </Select>
            <p id="direction-max-cinematic-hint" className="mt-2 text-sm text-fg-muted">
              A apresentadora caminha ou age sem falar enquanto a narração toca por cima (4 a 15 s). Cada uma é <strong className="text-paid">cobrada à parte e custa mais</strong>; exige a voz do ElevenLabs.
            </p>
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-accent"
                checked={style.matchCinematicSetting !== false}
                disabled={(style.maxCinematicPerLesson ?? 2) === 0}
                onChange={(e) => onChange({ matchCinematicSetting: e.target.checked })}
                aria-describedby="direction-match-setting-hint"
                data-testid="direction-match-setting"
              />
              <span>Usar o lugar da cena em movimento como fundo dos outros planos da cena</span>
            </label>
            <p id="direction-match-setting-hint" className="mt-1 pl-8 text-sm text-fg-muted">
              Dá continuidade: os planos com a apresentadora falando usam um quadro desfocado do lugar da cena em movimento. Esses planos só começam depois que a cena em movimento fica pronta (a geração leva mais tempo).
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-fg-muted">Exemplo de slide</p>
          <SlidePreview slide={{ title: 'Três passos para começar', bullets: ['Ouça antes de responder', 'Confirme o que entendeu', 'Combine o próximo passo'], style: 'clean' }} accent={style.slideAccent} framed />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Gerar novo ângulo com IA (pago)                                     */
/* ------------------------------------------------------------------ */

/** Sugestões de visual sentado (pt-BR, concordando com o pronome da pessoa apresentadora). */
function seatedSuggestions(pronoun: PresenterPronoun): Array<{ id: string; text: string; angle: CameraAngle; framing: Framing }> {
  const sentada = pronoun === 'he' ? 'Sentado' : pronoun === 'they' ? 'Pessoa sentada' : 'Sentada';
  return [
    { id: 'mesa-frente', text: `${sentada} à mesa de reunião, plano médio, de frente, mãos sobre a mesa, mesmo escritório`, angle: 'front', framing: 'medium' },
    { id: 'mesa-lateral', text: `${sentada} à mesa, leve ângulo lateral, olhando para a câmera`, angle: 'left', framing: 'medium' },
  ];
}

interface LookEstimate { requiresConfirmation: true; estimate: { provider: string; note: string }; prompt: string; simulated?: boolean; referenceImages?: string[]; name?: string; placement?: 'full_frame' }

/** Presets "dentro do cenário" (a câmera nasce em tela cheia: o cenário faz parte do visual). */
const SCENE_PRESETS = [
  { id: 'scene_three_quarter', label: '3/4', hint: 'Plano médio-aberto, corpo a 30°', framing: 'wide' as const },
  { id: 'scene_front', label: 'De frente', hint: 'Plano médio, da cintura para cima', framing: 'medium' as const },
  { id: 'scene_close', label: 'Close', hint: 'Do peito para cima', framing: 'close' as const },
] as const;
type ScenePreset = (typeof SCENE_PRESETS)[number]['id'];

/**
 * Diálogo "Gerar novo ângulo com IA" (pago). Os ângulos usam os mesmos nomes
 * das linhas de câmera (De frente / Pela esquerda / Pela direita / De cima /
 * De baixo) e o mesmo controle segmentado do enquadramento. Em demonstração
 * (`simulation` ou `review.simulated`) a cópia deixa claro que não há cobrança.
 */
function GenerateAngleDialog({
  sources,
  simulation = false,
  pronoun = 'she',
  onCancel,
  onCreated,
}: {
  sources: { lookId: string; label: string }[];
  simulation?: boolean;
  pronoun?: PresenterPronoun;
  onCancel: () => void;
  onCreated: (cam: Omit<Camera, 'id'>) => void;
}) {
  const [sourceLookId, setSource] = React.useState(sources[0]?.lookId ?? '');
  const [angle, setAngle] = React.useState<CameraAngle>('left');
  const [framing, setFraming] = React.useState<Framing>('close');
  const [extra, setExtra] = React.useState('');
  // "dentro do cenário": cenários do workspace (imagens com metadados `scenery`) + preset; exclui o pedido por ângulo
  const [sceneries, setSceneries] = React.useState<BackgroundImage[]>([]);
  const [sceneryId, setSceneryId] = React.useState<string | null>(null);
  const [scenePreset, setScenePreset] = React.useState<ScenePreset>('scene_three_quarter');
  React.useEffect(() => {
    let cancelled = false;
    api<Backgrounds>('/api/media/backgrounds')
      .then((b) => {
        if (!cancelled) setSceneries((b.images ?? []).filter((i) => i.scenery));
      })
      .catch(() => {
        /* sem cenários: a seção não aparece */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [review, setReview] = React.useState<LookEstimate | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const demo = review?.simulated ?? simulation;

  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  const busyRef = React.useRef(busy);
  busyRef.current = busy;
  // foco inicial no primeiro controle, Tab circula, Esc fecha, foco volta a "Gerar novo ângulo com IA"
  useFocusTrap(dialogRef, {
    initialFocus: '[role="radio"][aria-checked="true"]',
    onEscape: () => {
      if (!busyRef.current) onCancelRef.current();
    },
  });
  // ao armar a confirmação, o foco vai ao botão de confirmar (segundo clique claro também no teclado)
  React.useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  // qualquer mudança no pedido invalida a prévia e a confirmação
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setReview(null);
    setArmed(false);
  };
  const body = (confirm: boolean) =>
    sceneryId
      ? { sourceLookId, sceneryAssetId: sceneryId, preset: scenePreset, pronoun, confirm }
      : { sourceLookId, angle, framing, extra: extra.trim() ? extra.trim().slice(0, 300) : undefined, confirm };

  const askEstimate = async () => {
    setBusy(true);
    setError(null);
    try {
      setReview(await api<LookEstimate>('/api/media/looks', { json: body(false) }));
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível preparar o pedido'));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ generationId: string; prompt: string; simulated?: boolean; name?: string; placement?: 'full_frame' }>('/api/media/looks', { json: body(true) });
      // grava a câmera na hora: o resultado pago não se perde se a página fechar.
      // visual sentado (sentad…/seated/mesa/cadeira) e visual dentro do cenário: tela cheia (o fundo faz parte do look)
      const seated = looksSeated(extra);
      const scene = sceneryId ? SCENE_PRESETS.find((p) => p.id === scenePreset) : undefined;
      onCreated({
        name: (scene ? (r.name ?? `No cenário · ${scene.label}`) : `${FRAMING_LABEL[framing]} · ${ANGLE_LABEL[angle].toLowerCase()}`).slice(0, 60),
        lookId: '',
        angle: scene ? 'front' : angle,
        nativeFraming: scene ? scene.framing : framing,
        status: 'generating',
        generationId: r.generationId.slice(0, 120),
        generationPrompt: (r.prompt ?? review?.prompt ?? '').slice(0, 1000) || undefined,
        sourceLookId,
        ...(seated || scene || r.placement === 'full_frame' ? { placement: 'full_frame' as const } : {}),
      });
    } catch (e) {
      setArmed(false);
      setError(errorMessage(e, 'Não foi possível pedir a geração'));
    } finally {
      setBusy(false);
    }
  };

  const seg = (active: boolean) => cn('inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors', active ? 'bg-surface text-fg shadow-sm ring-1 ring-line-strong' : 'text-fg-muted hover:text-fg');

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/75 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-desc`} className="rise max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--radius-card)] border border-line-strong bg-surface p-5 shadow-2xl" data-testid="camera-generate-dialog" data-simulation={demo ? 'true' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-fg">Gerar novo ângulo com IA</h2>
            <p id={`${titleId}-desc`} className="text-sm text-fg-muted">
              Gera um novo visual do mesmo apresentador com outro ângulo. {demo ? <span className="text-paid">Modo de demonstração: nenhuma cobrança será feita.</span> : 'Cobrado na HeyGen.'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar" disabled={busy} onClick={onCancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {sources.length > 1 && (
          <div>
            <label htmlFor="gen-source" className="mb-1 block text-xs font-medium text-fg-muted">A partir de</label>
            <Select id="gen-source" value={sourceLookId} onChange={(e) => edit(setSource)(e.target.value)} className="min-h-11 text-sm">
              {sources.map((s) => (
                <option key={s.lookId} value={s.lookId}>{s.label}</option>
              ))}
            </Select>
          </div>
        )}

        {/* mesmos nomes e mesmo controle segmentado das linhas de câmera */}
        <div role="radiogroup" aria-labelledby={`${titleId}-angle`}>
          <p id={`${titleId}-angle`} className="mb-1 text-xs font-medium text-fg-muted">Ângulo</p>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface-2 p-1">
            {ANGLE_ORDER.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={angle === a} onClick={() => edit(setAngle)(a)} className={seg(angle === a)} data-testid={`camera-generate-angle-${a}`}>
                {ANGLE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>

        <div role="radiogroup" aria-labelledby={`${titleId}-framing`}>
          <p id={`${titleId}-framing`} className="mb-1 text-xs font-medium text-fg-muted">Enquadramento</p>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface-2 p-1">
            {FRAMING_ORDER.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={framing === f} onClick={() => edit(setFraming)(f)} className={seg(framing === f)}>
                {FRAMING_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p id={`${titleId}-seated`} className="mb-1 text-xs font-medium text-fg-muted">Sugestões de visual sentado</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${titleId}-seated`}>
            {seatedSuggestions(pronoun).map((sug) => (
              <button
                key={sug.id}
                type="button"
                aria-pressed={extra.trim() === sug.text}
                onClick={() => {
                  edit(setExtra)(sug.text);
                  edit(setAngle)(sug.angle);
                  edit(setFraming)(sug.framing);
                }}
                className={cn('rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors', extra.trim() === sug.text ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg')}
                data-testid={`camera-generate-suggestion-${sug.id}`}
              >
                {sug.text}
              </button>
            ))}
          </div>
          {looksSeated(extra) && <p className="mt-1 text-xs text-fg-muted" data-testid="camera-generate-seated-note">A nova câmera entra em Tela cheia (fundo do próprio visual), para não cortar cadeira e mesa.</p>}
        </div>

        {sceneries.length > 0 && (
          <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3" data-testid="camera-generate-scenery">
            <p id={`${titleId}-scenery`} className="text-xs font-semibold text-fg">Gerar a instrutora dentro do cenário</p>
            <p className="text-xs text-fg-muted">
              O cenário vai como imagem de referência: a mesma pessoa, com a mesma roupa, colocada no ambiente. A câmera nasce em tela cheia.{' '}
              {demo ? <span className="text-paid">Modo de demonstração: sem cobrança.</span> : <span className="text-paid">Cobrado na HeyGen como qualquer geração de visual.</span>}
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${titleId}-scenery`}>
              {sceneries.map((sc) => {
                const active = sceneryId === sc.assetId;
                const name = sc.scenery?.name ?? backgroundImageLabel(sc.name);
                return (
                  <button
                    key={sc.assetId}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => edit(setSceneryId)(active ? null : sc.assetId)}
                    className={cn('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left text-xs font-medium transition-colors', active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg')}
                    data-testid={`camera-generate-scenery-${sc.assetId}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sc.url} alt="" className="h-7 w-12 rounded-full object-cover" />
                    {name}
                  </button>
                );
              })}
            </div>
            {sceneryId && (
              <div role="radiogroup" aria-label="Enquadramento no cenário" className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
                {SCENE_PRESETS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={scenePreset === p.id} title={p.hint} onClick={() => edit(setScenePreset)(p.id)} className={seg(scenePreset === p.id)} data-testid={`camera-generate-scene-${p.id}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {sceneryId && <p className="text-xs text-fg-muted" data-testid="camera-generate-scene-note">A nova câmera entra em Tela cheia; o ângulo e o enquadramento acima são ignorados.</p>}
          </div>
        )}

        <div>
          <label htmlFor="gen-extra" className="mb-1 block text-xs font-medium text-fg-muted">Detalhes (opcional)</label>
          <Textarea id="gen-extra" rows={2} maxLength={300} value={extra} onChange={(e) => edit(setExtra)(e.target.value)} placeholder="Ex.: mesma roupa, luz suave, olhando levemente para a câmera" className="text-sm" />
        </div>

        {review && (
          <div className="space-y-2 rounded-xl border border-paid/30 bg-paid-soft p-3 text-sm" data-testid="camera-generate-review-box">
            <p className="font-medium text-paid">{demo ? 'Pedido (demonstração: não vai para a HeyGen)' : 'Pedido que vai para a HeyGen'}</p>
            <p className="rounded-lg bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-fg" lang="en">{review.prompt}</p>
            {review.estimate.note && <p className="text-xs text-paid">{review.estimate.note}</p>}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>Cancelar</Button>
          {!review ? (
            <Button size="sm" disabled={busy || !sourceLookId} onClick={() => void askEstimate()} data-testid="camera-generate-review">
              {busy ? 'Preparando…' : 'Ver pedido'}
            </Button>
          ) : (
            <Button ref={confirmRef} variant="paid" size="sm" disabled={busy} onClick={() => void generate()} data-testid="camera-generate-confirm" data-armed={armed ? 'true' : undefined}>
              {busy ? 'Enviando…' : armed ? (demo ? 'Confirmar: gerar (demonstração)' : 'Confirmar: gerar e cobrar') : demo ? 'Gerar ângulo (demonstração)' : 'Gerar ângulo (cobrado na HeyGen)'}
            </Button>
          )}
        </div>
        {armed && !busy && (
          <p className="text-right text-xs text-paid" role="status" aria-live="polite">
            {demo ? 'Modo de demonstração: nenhuma cobrança será feita. Clique de novo para confirmar.' : 'Clique de novo para confirmar a cobrança.'}
          </p>
        )}
      </div>
    </div>
    </OverlayPortal>
  );
}

'use client';

import * as React from 'react';
import { ImagePlus, Merge, Plus, Scissors, Trash2, X } from 'lucide-react';
import { buildCinematicPrompt, CAMERA_PLACEMENT_LABELS, CINEMATIC_ACTIONS, CINEMATIC_ACTION_LABELS, CINEMATIC_MIN_SECONDS_BY_ACTION, cinematicClipSeconds, resolveCameraPlacement, type CinematicAction, type Presentation, type ResolvedPlacement, type SceneDirection, type Shot, type Slide } from '@lms/course-schema';
import { api } from '@/lib/api';

/** Rótulo da posição resolvida do plano (mesmos nomes do cartão da câmera). */
const placementLabel = (p: ResolvedPlacement) => CAMERA_PLACEMENT_LABELS[p];
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { errorText } from '@/components/studio/storyboard/use-media-jobs';
import {
  CINEMATIC_EXAMPLES,
  CINEMATIC_HELP,
  PANEL_HELP,
  CHIPS_HELP,
  CINEMATIC_SECONDS,
  CINEMATIC_WORDS,
  emptySlide,
  FRAMING_LABEL,
  FRAMING_ORDER,
  GESTURE_EXAMPLES,
  insertShotAfter,
  LAYOUT_LABEL,
  LAYOUT_ORDER,
  layoutHasSlide,
  MAX_BULLETS,
  MAX_SHOTS,
  mergeWithNext,
  MOVE_LABEL,
  MOVE_ORDER,
  newShot,
  removeShot,
  shotSeconds,
  SLIDE_STYLE_LABEL,
  SLIDE_STYLE_ORDER,
  splitShot,
  TRANSITION_LABEL,
  TRANSITION_ORDER,
  updateShot,
  wordCount,
  type Framing,
  type Layout,
} from './direction-model';
import { SlidePreview } from './slide-preview';
import { FramingIcon, LayoutDiagram } from './visuals';

export type DirectionChange = (fn: (d: SceneDirection) => SceneDirection | undefined | null, coalesce?: string) => void;
/** Seleção de plano; `focus: 'card'` leva o foco ao cartão do plano na linha do tempo. */
export type ShotSelect = (id: string | null, opts?: { focus?: 'card' | 'none' }) => void;

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
    active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-bg text-fg-muted hover:border-line-strong hover:text-fg',
  );

const label = 'mb-1 block text-xs font-medium text-fg-muted';
/** limite do título do slide (esquema do curso) */
const SLIDE_TITLE_MAX = 80;

/**
 * Editor do plano selecionado. Monte com `key={shot.id}`: o texto da fala tem
 * estado local para permitir apagar tudo e reescrever sem gravar um plano vazio.
 */
export function ShotEditor({
  nodeId,
  direction,
  shot,
  presentation,
  change,
  onSelect,
  startAdding = false,
}: {
  nodeId: string;
  direction: SceneDirection;
  shot: Shot;
  presentation: Presentation;
  change: DirectionChange;
  onSelect: ShotSelect;
  /** abre já com o formulário de novo plano */
  startAdding?: boolean;
}) {
  const index = direction.shots.findIndex((s) => s.id === shot.id);
  const isLast = index === direction.shots.length - 1;
  const full = direction.shots.length >= MAX_SHOTS;
  const cams = presentation.cameras ?? [];
  // câmera do plano (ausente = a principal, a primeira do kit): a posição dela aparece na dica
  const shotCam = shot.cameraId ? cams.find((c) => c.id === shot.cameraId) : cams[0];
  const accent = presentation.directionStyle?.slideAccent;
  const ids = (k: string) => `shot-${shot.id}-${k}`;

  const [line, setLine] = React.useState(shot.line);
  React.useEffect(() => {
    setLine((cur) => (cur.trim() === '' ? cur : shot.line));
  }, [shot.line]);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const lineRef = React.useRef<HTMLTextAreaElement>(null);
  const trackCursor = () => setCursor(lineRef.current?.selectionStart ?? null);
  const canSplit = !full && cursor !== null && line.slice(0, cursor).trim() !== '' && line.slice(cursor).trim() !== '';

  const [adding, setAdding] = React.useState(startAdding);
  const [newLine, setNewLine] = React.useState('');

  const setShot = (patch: Partial<Shot>, coalesce?: string) =>
    change(
      (d) =>
        updateShot(d, shot.id, (s) => {
          const next: Shot = { ...s, ...patch };
          if ('motionPrompt' in patch && !patch.motionPrompt) delete next.motionPrompt;
          if ('caption' in patch && !patch.caption) delete next.caption;
          if ('cameraId' in patch && !patch.cameraId) delete next.cameraId;
          if ('cinematic' in patch && !patch.cinematic) delete next.cinematic;
          return next;
        }),
      coalesce,
    );
  const slide: Slide = shot.slide ?? emptySlide();
  const setSlide = (patch: Partial<Slide>, coalesce?: string) => {
    const next: Slide = { ...slide, ...patch };
    if ('highlight' in patch && !patch.highlight) delete next.highlight;
    if ('imageAssetId' in patch && !patch.imageAssetId) delete next.imageAssetId;
    setShot({ slide: next }, coalesce);
  };

  const cinematic = shot.layout === 'cinematic';
  // enquadramento e movimento que o plano tinha antes de virar "cena em movimento": voltam ao sair dela
  const beforeCinematic = React.useRef<{ framing: Framing; cameraMove: Shot['cameraMove'] } | null>(null);
  // a legenda da cena em movimento só aparece quando ela está escolhida ou sob o mouse/foco
  const [cinematicHint, setCinematicHint] = React.useState(false);
  // "Lugar (inglês)" só é apontado como inválido depois de o autor mexer nele
  const [promptTouched, setPromptTouched] = React.useState(!!shot.cinematic?.prompt?.trim());
  const setLayout = (layout: Layout) => {
    if (layout === 'cinematic') {
      if (!cinematic) beforeCinematic.current = { framing: shot.framing, cameraMove: shot.cameraMove };
      return setShot({ layout, cinematic: shot.cinematic ?? { prompt: '' }, framing: 'medium', cameraMove: 'static' });
    }
    const patch: Partial<Shot> = layoutHasSlide(layout) && !shot.slide ? { layout, slide: emptySlide() } : { layout };
    if (shot.cinematic) patch.cinematic = undefined;
    if (cinematic && beforeCinematic.current) {
      patch.framing = beforeCinematic.current.framing;
      patch.cameraMove = beforeCinematic.current.cameraMove;
    }
    setShot(patch);
  };
  const setCinematic = (patch: Partial<NonNullable<Shot['cinematic']>>, coalesce?: string) => {
    const next = { prompt: '', ...shot.cinematic, ...patch };
    if ('setting' in patch && !patch.setting) delete next.setting;
    setShot({ cinematic: next }, coalesce);
  };
  const lineWords = wordCount(line);
  const cinematicLineOk = lineWords >= CINEMATIC_WORDS.min && lineWords <= CINEMATIC_WORDS.max;
  // fala ≈ 2,6 palavras/s; a imagem dura o mínimo do movimento ou a fala + 0,5 s (o que for maior, até 15 s)
  const speechSeconds = lineWords / 2.6;
  const imageSeconds = cinematicClipSeconds(shot.cinematic?.action, speechSeconds);
  const imageAtMinimum = imageSeconds === CINEMATIC_MIN_SECONDS_BY_ACTION[shot.cinematic?.action ?? 'walk_across'] && imageSeconds > Math.ceil(speechSeconds + 0.5);
  const mainCamValue = !shot.cameraId || shot.cameraId === cams[0]?.id ? '' : shot.cameraId;
  const knownCam = mainCamValue === '' || cams.some((c) => c.id === mainCamValue);

  const split = () => {
    if (cursor === null) return;
    let newId: string | null = null;
    change((d) => {
      const r = splitShot(d, shot.id, cursor);
      if (!r) return null;
      newId = r.newId;
      return r.direction;
    });
    // o editor é remontado com o novo plano: o foco vai para o cartão dele na linha do tempo
    if (newId) onSelect(newId, { focus: 'card' });
  };

  const addShot = () => {
    const text = newLine.trim();
    if (!text) return;
    const created = newShot(text.slice(0, 1200), { cameraId: shot.cameraId, framing: shot.framing });
    change((d) => insertShotAfter(d, shot.id, created));
    setAdding(false);
    setNewLine('');
    onSelect(created.id, { focus: 'card' });
  };

  return (
    <section aria-label={`Plano ${index + 1} de ${direction.shots.length}`} className="@container scroll-mt-24 space-y-4 rounded-xl border border-accent/40 bg-bg p-2.5 sm:p-4" data-testid="shot-editor">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-fg">
          Plano {index + 1} de {direction.shots.length}
          <span className="ml-2 text-xs font-normal text-fg-faint">≈ {Math.round(shotSeconds({ line }))} s de fala</span>
        </p>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar o editor do plano" onClick={() => onSelect(null, { focus: 'card' })}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      {/* Fala */}
      <div>
        <label htmlFor={ids('line')} className={label}>Fala deste plano</label>
        <Textarea
          ref={lineRef}
          id={ids('line')}
          rows={3}
          maxLength={1200}
          value={line}
          aria-describedby={ids('line-hint')}
          aria-invalid={line.trim() === ''}
          onChange={(e) => {
            setLine(e.target.value);
            trackCursor();
            if (e.target.value.trim()) setShot({ line: e.target.value }, `shot.line.${nodeId}.${shot.id}`);
          }}
          onSelect={trackCursor}
          onKeyUp={trackCursor}
          onClick={trackCursor}
          className="text-sm"
          data-testid="shot-editor-line"
        />
        <p id={ids('line-hint')} className={cn('mt-1 text-xs', line.trim() === '' ? 'text-danger' : 'text-fg-muted')}>
          {line.trim() === '' ? 'O plano precisa de uma fala. Escreva algo ou remova o plano.' : 'Trecho exato da fala. Para dividir, posicione o cursor onde o novo plano começa.'}
        </p>
      </div>

      {/* Ações do plano */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!canSplit} onClick={split} title={full ? `No máximo ${MAX_SHOTS} planos por cena` : undefined} data-testid="shot-editor-split">
          <Scissors className="h-4 w-4" aria-hidden="true" /> Dividir plano
        </Button>
        <Button variant="secondary" size="sm" disabled={isLast} onClick={() => change((d) => mergeWithNext(d, shot.id))} data-testid="shot-editor-merge">
          <Merge className="h-4 w-4" aria-hidden="true" /> Juntar com o próximo
        </Button>
        <Button variant="secondary" size="sm" disabled={full} onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid="shot-editor-add">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar plano
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:text-danger"
          onClick={() => {
            const neighbor = direction.shots[index + 1]?.id ?? direction.shots[index - 1]?.id ?? null;
            change((d) => removeShot(d, shot.id));
            onSelect(neighbor, { focus: 'card' });
          }}
          data-testid="shot-editor-remove"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover plano
        </Button>
      </div>
      {adding && (
        <form
          className="space-y-2 rounded-lg border border-line bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            addShot();
          }}
        >
          <label htmlFor={ids('new')} className={label}>Fala do novo plano (entra depois deste)</label>
          <Textarea id={ids('new')} rows={2} maxLength={1200} value={newLine} onChange={(e) => setNewLine(e.target.value)} className="text-sm" autoFocus />
          <p className="text-xs text-fg-muted">Um trecho novo muda a fala da cena; depois, use “Reconciliar com a fala”.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={!newLine.trim()}>Adicionar</Button>
          </div>
        </form>
      )}

      <div className="grid gap-4 @lg:grid-cols-2">
        {/* Câmera */}
        <div>
          <label htmlFor={ids('camera')} className={label}>Câmera</label>
          <Select
            id={ids('camera')}
            value={knownCam ? mainCamValue : '__missing'}
            disabled={cams.length <= 1}
            onChange={(e) => setShot({ cameraId: e.target.value || undefined })}
            className="min-h-11 text-sm"
            aria-describedby={ids('camera-hint')}
          >
            <option value="">Principal{cams[0] ? ` (${cams[0].name})` : ''}</option>
            {cams.slice(1).map((c) => (
              <option key={c.id} value={c.id} disabled={c.status !== 'ready'}>
                {c.name || 'Câmera sem nome'}
                {c.status === 'generating' ? ' (gerando…)' : c.status === 'failed' ? ' (falhou)' : ''}
              </option>
            ))}
            {!knownCam && <option value="__missing" disabled>Câmera removida do kit</option>}
          </Select>
          <p id={ids('camera-hint')} className="mt-1 text-xs text-fg-muted">
            {cams.length <= 1 ? 'Com uma câmera só, os cortes e closes são feitos por zoom.' : 'Trocar de câmera entre planos dá a sensação de corte.'}
            {shotCam && (
              <span className="block" data-testid={ids('camera-placement')}>
                Posição: {placementLabel(resolveCameraPlacement(presentation, shotCam).placement)}
                {shotCam.placement && shotCam.placement !== 'inherit' ? '' : ' (igual ao curso)'}
              </span>
            )}
          </p>
        </div>

        {/* Movimento e transição */}
        <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
          {!cinematic && <div>
            <label htmlFor={ids('move')} className={label}>Movimento</label>
            <Select id={ids('move')} value={shot.cameraMove} onChange={(e) => setShot({ cameraMove: e.target.value as Shot['cameraMove'] })} className="min-h-11 text-sm">
              {MOVE_ORDER.map((m) => (
                <option key={m} value={m}>{MOVE_LABEL[m]}</option>
              ))}
            </Select>
          </div>}
          <div>
            <label htmlFor={ids('transition')} className={label}>{index === 0 ? 'Entrada da cena' : 'Transição de entrada'}</label>
            <Select id={ids('transition')} value={shot.transitionIn} onChange={(e) => setShot({ transitionIn: e.target.value as Shot['transitionIn'] })} className="min-h-11 text-sm">
              {TRANSITION_ORDER.map((t) => (
                <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Enquadramento (não vale na cena em movimento: o movimento está no clipe) */}
      {!cinematic && <div role="group" aria-labelledby={ids('framing')}>
        <p id={ids('framing')} className={label}>Enquadramento</p>
        {/* contêiner estreito: grade 2×2 de pílulas; a partir de @md, controle segmentado numa linha */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface-2 p-1 @md:inline-flex @md:flex-wrap @md:rounded-full">
          {FRAMING_ORDER.map((f: Framing) => {
            const active = shot.framing === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setShot({ framing: f })}
                className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors @md:justify-start @md:px-3.5', active ? 'bg-surface text-fg shadow-sm ring-1 ring-line-strong' : 'text-fg-muted hover:text-fg')}
              >
                <FramingIcon framing={f} />
                {FRAMING_LABEL[f]}
              </button>
            );
          })}
        </div>
      </div>}

      {/* Layout */}
      <div role="group" aria-labelledby={ids('layout')}>
        <p id={ids('layout')} className={label}>O que aparece na tela</p>
        <div className="grid grid-cols-2 gap-2 @xs:grid-cols-3 @lg:grid-cols-4 @2xl:grid-cols-7">
          {LAYOUT_ORDER.map((l) => {
            const active = shot.layout === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={active}
                onClick={() => setLayout(l)}
                title={l === 'cinematic' ? CINEMATIC_HELP : l === 'presenter_panel' ? PANEL_HELP : l === 'presenter_chips' ? CHIPS_HELP : undefined}
                aria-describedby={l === 'cinematic' ? ids('cinematic-help') : undefined}
                onMouseEnter={l === 'cinematic' ? () => setCinematicHint(true) : undefined}
                onMouseLeave={l === 'cinematic' ? () => setCinematicHint(false) : undefined}
                onFocus={l === 'cinematic' ? () => setCinematicHint(true) : undefined}
                onBlur={l === 'cinematic' ? () => setCinematicHint(false) : undefined}
                className={cn('rounded-lg border-2 bg-surface p-1.5 text-left transition-colors', active ? 'border-accent' : 'border-line hover:border-line-strong')}
                data-testid={`shot-editor-layout-${l}`}
              >
                <LayoutDiagram layout={l} />
                <span className={cn('mt-1 block text-[11px] font-medium leading-tight', active ? 'text-accent-strong' : 'text-fg-muted')}>{LAYOUT_LABEL[l]}</span>
              </button>
            );
          })}
        </div>
        {/* legenda da cena em movimento: visível só quando escolhida ou sob o mouse/foco da opção; sempre lida pelo aria-describedby */}
        <p id={ids('cinematic-help')} className={cn('text-xs', cinematic || cinematicHint ? 'mt-1.5' : 'sr-only', cinematic ? 'text-paid' : 'text-fg-faint')}>
          <strong className="font-semibold">Cena em movimento:</strong> {CINEMATIC_HELP}
        </p>
      </div>

      {/* Cena em movimento */}
      {cinematic && (
        <fieldset className="space-y-3 rounded-lg border border-paid/40 bg-paid-soft/40 p-3" data-testid="shot-editor-cinematic">
          <legend className="px-1 text-xs font-semibold text-fg">Cena em movimento</legend>
          <div>
            <label htmlFor={ids('cine-setting')} className={label}>O que acontece na cena</label>
            <Input
              id={ids('cine-setting')}
              maxLength={200}
              value={shot.cinematic?.setting ?? ''}
              placeholder="Ex.: chegando ao prédio da empresa"
              onChange={(e) => setCinematic({ setting: e.target.value }, `shot.cine.setting.${nodeId}.${shot.id}`)}
              className="min-h-11 text-sm"
            />
          </div>
          <div>
            <label htmlFor={ids('cine-action')} className={label}>Movimento da apresentadora</label>
            <Select
              id={ids('cine-action')}
              value={shot.cinematic?.action ?? 'walk_across'}
              onChange={(e) => setCinematic({ action: e.target.value as CinematicAction })}
              className="min-h-11 text-sm"
              data-testid="shot-editor-cinematic-action"
            >
              {CINEMATIC_ACTIONS.map((a) => <option key={a} value={a}>{CINEMATIC_ACTION_LABELS[a]}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor={ids('cine-prompt')} className={label}>Lugar (inglês)</label>
            <Textarea
              id={ids('cine-prompt')}
              rows={3}
              maxLength={600}
              value={shot.cinematic?.prompt ?? ''}
              placeholder="Ambiente, luz e objetos. Ex.: a bright office corridor with glass walls and plants; morning light"
              aria-invalid={promptTouched && !shot.cinematic?.prompt?.trim() ? true : undefined}
              aria-describedby={ids('cine-prompt-hint')}
              onBlur={() => setPromptTouched(true)}
              onChange={(e) => {
                setPromptTouched(true);
                setCinematic({ prompt: e.target.value }, `shot.cine.prompt.${nodeId}.${shot.id}`);
              }}
              className="text-sm"
              data-testid="shot-editor-cinematic-prompt"
            />
            <p id={ids('cine-prompt-hint')} className={cn('mt-1 text-xs', shot.cinematic?.prompt?.trim() || !promptTouched ? 'text-fg-muted' : 'text-danger')}>
              {shot.cinematic?.prompt?.trim() ? 'Descreva só o lugar: o movimento e a câmera entram automaticamente, de forma assertiva. Ela fica em silêncio.' : 'Descreva o lugar ou escolha um exemplo.'}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Exemplos de pedido de câmera">
              {CINEMATIC_EXAMPLES.map((ex) => {
                const on = shot.cinematic?.prompt === ex.prompt;
                return (
                  <li key={ex.label}>
                    <button type="button" aria-pressed={on} title={ex.prompt} className={chip(on)} onClick={() => setCinematic({ prompt: ex.prompt, action: ex.action, setting: shot.cinematic?.setting || ex.setting })}>
                      {ex.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <details className="text-xs">
            <summary className="min-h-6 cursor-pointer select-none text-fg-muted hover:text-fg">Ver o pedido completo enviado à HeyGen</summary>
            <p className="mt-1.5 rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed text-fg" data-testid="shot-editor-cinematic-final">
              {buildCinematicPrompt({ action: shot.cinematic?.action, details: shot.cinematic?.prompt ?? '', durationSeconds: imageSeconds, pronoun: presentation.presenterPronoun })}
            </p>
          </details>
          <p className={cn('text-xs', cinematicLineOk ? 'text-fg-muted' : 'text-danger')} data-testid="shot-editor-cinematic-words">
            Imagem: ≈ {imageSeconds} s{imageAtMinimum ? ' (mínimo para este movimento)' : ''} · fala: ≈ {formatSeconds(speechSeconds)} s ({lineWords} {lineWords === 1 ? 'palavra' : 'palavras'}).
            {lineWords > CINEMATIC_WORDS.max
              ? ` A fala passa de ${CINEMATIC_SECONDS.max} s (≈ ${CINEMATIC_WORDS.max} palavras); divida a fala.`
              : lineWords < CINEMATIC_WORDS.min
                ? ` Fala curta demais (mínimo ≈ ${CINEMATIC_WORDS.min} palavras); junte com o próximo plano.`
                : imageSeconds > Math.ceil(speechSeconds) ? ' A narração entra depois de um respiro e a imagem segue sem fala até o fim.' : ''}
          </p>
        </fieldset>
      )}

      {/* Letreiro */}
      {(shot.layout === 'lower_third' || cinematic) && (
        <div>
          <label htmlFor={ids('caption')} className={label}>{cinematic ? 'Letreiro (opcional)' : 'Texto do letreiro'}</label>
          <Input id={ids('caption')} maxLength={80} value={shot.caption ?? ''} placeholder="Ex.: Ana Souza · Gerente de atendimento" onChange={(e) => setShot({ caption: e.target.value }, `shot.caption.${nodeId}.${shot.id}`)} className="min-h-11 text-sm" />
        </div>
      )}

      {/* Slide */}
      {layoutHasSlide(shot.layout) && (
        <SlideFields idBase={ids('slide')} slide={slide} accent={accent} setSlide={setSlide} coalesceKey={`shot.slide.${nodeId}.${shot.id}`} />
      )}

      {/* Gesto (não vale na cena em movimento) */}
      {!cinematic && <div>
        <label htmlFor={ids('gesture')} className={label}>Gesto do apresentador neste plano</label>
        <Input
          id={ids('gesture')}
          maxLength={200}
          value={shot.motionPrompt ?? ''}
          placeholder="Um gesto e uma emoção, em inglês"
          onChange={(e) => setShot({ motionPrompt: e.target.value }, `shot.motion.${nodeId}.${shot.id}`)}
          className="min-h-11 text-sm"
        />
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Exemplos de gesto">
          {GESTURE_EXAMPLES.map((g) => (
            <li key={g}>
              <button type="button" aria-pressed={shot.motionPrompt === g} className={chip(shot.motionPrompt === g)} onClick={() => setShot({ motionPrompt: shot.motionPrompt === g ? undefined : g })}>
                {g}
              </button>
            </li>
          ))}
        </ul>
      </div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Slide                                                               */
/* ------------------------------------------------------------------ */

function SlideFields({
  idBase,
  slide,
  accent,
  setSlide,
  coalesceKey,
}: {
  idBase: string;
  slide: Slide;
  accent?: string;
  setSlide: (patch: Partial<Slide>, coalesce?: string) => void;
  coalesceKey: string;
}) {
  const [picking, setPicking] = React.useState(false);
  const bullets = slide.bullets;
  return (
    <fieldset className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
      <legend className="px-1 text-xs font-semibold text-fg">Slide</legend>
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${idBase}-title`} className={label}>Título</label>
              <span id={`${idBase}-title-count`} className={cn('text-xs tabular-nums', slide.title.length >= SLIDE_TITLE_MAX ? 'font-medium text-paid' : 'text-fg-faint')} aria-live="polite">
                {slide.title.length}/{SLIDE_TITLE_MAX}
                {slide.title.length >= SLIDE_TITLE_MAX && <span className="sr-only"> — limite atingido</span>}
              </span>
            </div>
            <Input
              id={`${idBase}-title`}
              maxLength={SLIDE_TITLE_MAX}
              value={slide.title}
              aria-describedby={`${idBase}-title-count`}
              onChange={(e) => setSlide({ title: e.target.value }, `${coalesceKey}.title`)}
              className="min-h-11 text-sm"
            />
            {slide.title.length >= SLIDE_TITLE_MAX && <p className="mt-1 text-xs text-paid">Limite de {SLIDE_TITLE_MAX} caracteres: o título não aceita mais texto.</p>}
          </div>
          <div>
            <p className={label}>Tópicos (até {MAX_BULLETS})</p>
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <label htmlFor={`${idBase}-b${i}`} className="sr-only">Tópico {i + 1}</label>
                  <Input
                    id={`${idBase}-b${i}`}
                    maxLength={90}
                    value={b}
                    onChange={(e) => setSlide({ bullets: bullets.map((x, j) => (j === i ? e.target.value : x)) }, `${coalesceKey}.b${i}`)}
                    className="min-h-10 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Remover tópico ${i + 1}`} onClick={() => setSlide({ bullets: bullets.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
            {bullets.length < MAX_BULLETS && (
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setSlide({ bullets: [...bullets, ''] })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar tópico
              </Button>
            )}
          </div>
          <div>
            <label htmlFor={`${idBase}-highlight`} className={label}>Destaque (opcional)</label>
            <Input
              id={`${idBase}-highlight`}
              maxLength={120}
              value={slide.highlight ?? ''}
              placeholder="Uma pergunta, um número ou uma frase-chave"
              onChange={(e) => setSlide({ highlight: e.target.value }, `${coalesceKey}.highlight`)}
              className="min-h-11 text-sm"
            />
          </div>
          <div role="group" aria-label="Estilo do slide">
            <p className={label}>Estilo</p>
            <div className="flex flex-wrap gap-1.5">
              {SLIDE_STYLE_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={slide.style === s} className={chip(slide.style === s)} onClick={() => setSlide({ style: s })}>
                  {SLIDE_STYLE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={label}>Imagem (opcional)</p>
            <div className="flex flex-wrap items-center gap-2">
              {slide.imageAssetId && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg p-1 pr-2 text-xs text-fg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${slide.imageAssetId}`} alt="" className="h-9 w-14 rounded object-cover" />
                  Imagem escolhida
                  <button type="button" className="min-h-6 rounded underline" onClick={() => setSlide({ imageAssetId: undefined })}>Tirar</button>
                </span>
              )}
              <Button variant="secondary" size="sm" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
                <ImagePlus className="h-4 w-4" aria-hidden="true" /> {slide.imageAssetId ? 'Trocar imagem' : 'Escolher da biblioteca'}
              </Button>
            </div>
            {picking && (
              <ImageLibrary
                selectedId={slide.imageAssetId}
                onPick={(id) => {
                  setSlide({ imageAssetId: id });
                  setPicking(false);
                }}
                onClose={() => setPicking(false)}
              />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className={label}>Prévia do slide</p>
          <SlidePreview slide={slide} accent={accent} framed />
          <p className="text-xs text-fg-faint">Aproximação. A cor de destaque vem do estilo de direção do curso.</p>
        </div>
      </div>
    </fieldset>
  );
}

interface AssetRow { id: string; kind: string; originalName: string | null }

function ImageLibrary({ selectedId, onPick, onClose }: { selectedId?: string; onPick: (id: string) => void; onClose: () => void }) {
  const [assets, setAssets] = React.useState<AssetRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    api<{ assets: AssetRow[] }>('/api/assets?kind=image')
      .then((r) => setAssets(r.assets))
      .catch((e) => setError(errorText(e, 'Não foi possível carregar a biblioteca')));
  }, []);
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-bg p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg">Imagens da biblioteca</p>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar a biblioteca" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {!assets && !error && <p className="text-xs text-fg-muted">Carregando…</p>}
      {assets && assets.length === 0 && <p className="text-xs text-fg-muted">Nenhuma imagem na biblioteca. Envie imagens pelo painel de mídia de uma cena.</p>}
      {assets && assets.length > 0 && (
        <ul className="grid max-h-56 grid-cols-2 gap-2 overflow-auto @xs:grid-cols-3 @md:grid-cols-4">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={a.id === selectedId}
                title={a.originalName ?? a.id}
                onClick={() => onPick(a.id)}
                className={cn('block w-full overflow-hidden rounded-md border-2', a.id === selectedId ? 'border-accent' : 'border-transparent hover:border-line-strong')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${a.id}`} alt={a.originalName ?? 'Imagem da biblioteca'} loading="lazy" className="aspect-video w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Segundos com uma casa (vírgula decimal), ex.: 2,3. */
function formatSeconds(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

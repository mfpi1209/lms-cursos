'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, FlaskConical, Map as MapIcon, RotateCcw, Search, SkipBack, SkipForward, SlidersHorizontal } from 'lucide-react';
import type { AttemptState } from '@lms/course-engine';
import type { Lesson, Scalar } from '@lms/course-schema';
import { buttonVariants } from '@/components/ui/button';
import { fieldClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PreviewDriver, PreviewStartAt } from '@/components/player/preview-driver';
import { sendPlayerCommand } from '@/components/player/navigation/commands';
import { useSharedMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { useDraft } from '@/components/studio/draft-provider';
import { isVideoScene, previewHref, SCENE_GROUP_LABEL, sceneVideoStatus, testScenes, testVariables, type SceneVideoStatus, type TestScene } from './test-model';
import { VariableInput } from './variable-input';

function useDriverState(driver: PreviewDriver): AttemptState | null {
  const [state, setState] = React.useState<AttemptState | null>(() => driver.getState());
  React.useEffect(() => {
    setState(driver.getState());
    return driver.subscribe(setState);
  }, [driver]);
  return state;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function marker(status: SceneVideoStatus, direction: boolean): string {
  if (status === 'ready') return ' 🎬';
  if (status === 'stale') return ' 🎬 ⏳ desatualizado';
  if (status === 'generating') return ' · em geração';
  return direction ? ' · direção, sem vídeo' : '';
}

const BAR_BTN = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 px-3');

/**
 * Barra "Modo de teste" da prévia do estúdio (nunca no LMS): pular para
 * qualquer cena, cena anterior, recomeçar, variáveis ao vivo, trocar de aula e
 * navegar só pelas cenas com vídeo. Tudo roda na prévia sem estado no
 * servidor: começar numa cena = novo driver com `startAt`.
 */
export function TestModeToolbar({
  courseId,
  lesson,
  lessons,
  driver,
  startAt,
  onStart,
}: {
  courseId: string;
  lesson: Lesson;
  lessons: Array<{ id: string; title: string }>;
  driver: PreviewDriver;
  startAt?: PreviewStartAt;
  onStart(next: PreviewStartAt): void;
}) {
  const router = useRouter();
  const doc = useDraft().document;
  const queue = useSharedMediaQueue();
  const state = useDriverState(driver);
  const graph = lesson.graph;
  const scenes = React.useMemo(() => testScenes(graph), [graph]);
  const vars = React.useMemo(() => testVariables(graph, doc), [graph, doc]);
  const [videoOnly, setVideoOnly] = React.useState(false);
  const [varsOpen, setVarsOpen] = React.useState(false);
  const values: Record<string, Scalar> = React.useMemo(() => {
    const out: Record<string, Scalar> = {};
    for (const v of vars) out[v.name] = startAt?.variables?.[v.name] ?? v.initial;
    return out;
  }, [vars, startAt]);

  const currentId = state?.currentNodeId;
  const statusOf = (s: TestScene) => sceneVideoStatus(lesson.id, s.node, queue?.data?.items, doc.presentation);
  const curIdx = scenes.findIndex((s) => s.node.id === currentId);
  const videoScenes = scenes.map((s, i) => ({ s, i })).filter(({ s }) => isVideoScene(s.node));
  const nextVideo = videoScenes.find(({ i }) => i > curIdx)?.s;
  const prevVideo = [...videoScenes].reverse().find(({ i }) => i < curIdx)?.s;
  const canBack = !!state && state.status !== 'completed' && state.path.length > 1 && lesson.allowBack !== false;

  const jump = (nodeId: string, variables = values) => onStart({ nodeId, variables });
  const currentTitle = scenes.find((s) => s.node.id === currentId)?.title ?? 'Carregando…';

  return (
    <div role="region" aria-label="Modo de teste" data-testid="test-toolbar" className="relative z-40 border-b border-line bg-surface text-fg">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 md:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Modo de teste
          <span className="sr-only">: prévia do rascunho, nada é salvo</span>
        </span>

        <label className="sr-only" htmlFor="test-lesson-switch">Aula</label>
        <select
          id="test-lesson-switch"
          className={cn(fieldClassName, 'min-h-11 w-auto max-w-48 py-1.5 text-sm')}
          value={lesson.id}
          onChange={(e) => router.push(previewHref(courseId, e.target.value, { variables: pickCourseVars(values, vars) }))}
          data-testid="test-lesson-switch"
        >
          {lessons.map((l, i) => (
            <option key={l.id} value={l.id}>
              Aula {i + 1}: {l.title}
            </option>
          ))}
        </select>

        <SceneJump scenes={scenes} currentId={currentId} currentTitle={currentTitle} videoOnly={videoOnly} statusOf={statusOf} onPick={(id) => jump(id)} />

        <button type="button" className={BAR_BTN} disabled={!canBack} onClick={() => sendPlayerCommand({ kind: 'back' })} data-testid="test-back">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Cena anterior
        </button>
        <button type="button" className={BAR_BTN} onClick={() => jump(graph.startNodeId)} data-testid="test-restart" title="Volta para a primeira cena da aula com os mesmos valores de teste">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Recomeçar
        </button>
        <button type="button" className={BAR_BTN} onClick={() => sendPlayerCommand({ kind: 'open-map' })} data-testid="test-open-map">
          <MapIcon className="h-4 w-4" aria-hidden="true" /> <span className="max-xl:sr-only">Mapa</span>
        </button>

        <span className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden="true" />
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={videoOnly} onChange={(e) => setVideoOnly(e.target.checked)} data-testid="test-video-only" />
          Só cenas com vídeo
        </label>
        <button type="button" className={BAR_BTN} disabled={!prevVideo} onClick={() => prevVideo && jump(prevVideo.node.id)} data-testid="test-prev-video" title={prevVideo ? `Vídeo anterior: ${prevVideo.title}` : 'Nenhum vídeo antes desta cena'}>
          <SkipBack className="h-4 w-4" aria-hidden="true" /> <span className="max-[1700px]:sr-only">Vídeo anterior</span>
        </button>
        <button type="button" className={BAR_BTN} disabled={!nextVideo} onClick={() => nextVideo && jump(nextVideo.node.id)} data-testid="test-next-video" title={nextVideo ? `Próximo vídeo: ${nextVideo.title}` : 'Nenhum vídeo depois desta cena'}>
          <SkipForward className="h-4 w-4" aria-hidden="true" /> <span className="max-[1700px]:sr-only">Próximo vídeo</span>
        </button>

        {vars.length > 0 && (
          <button type="button" className={cn(BAR_BTN, 'md:ml-auto')} aria-expanded={varsOpen} aria-controls="test-vars-panel" onClick={() => setVarsOpen((o) => !o)} data-testid="test-vars-toggle">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Variáveis
            <span className="max-w-56 truncate text-fg-muted">({vars.map((v) => `${v.label}: ${String(state?.variables[v.name] ?? values[v.name])}`).join(' · ')})</span>
          </button>
        )}
      </div>
      {varsOpen && vars.length > 0 && (
        <div id="test-vars-panel" className="mx-auto max-w-[1920px] border-t border-line px-3 py-3 md:px-6" data-testid="test-vars-panel">
          <p className="mb-2 text-xs text-fg-muted">Mudar um valor recomeça desta mesma cena com os novos valores.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {vars.map((v) => (
              <VariableInput
                key={v.name}
                variable={v}
                value={values[v.name]!}
                live={state?.variables[v.name]}
                onChange={(x) => currentId && jump(currentId, { ...values, [v.name]: x })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function pickCourseVars(values: Record<string, Scalar>, vars: ReturnType<typeof testVariables>): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const v of vars) if (v.scope === 'course') out[v.name] = values[v.name]!;
  return out;
}

/** Pular para uma cena: lista agrupada e pesquisável (combobox). */
function SceneJump({
  scenes,
  currentId,
  currentTitle,
  videoOnly,
  statusOf,
  onPick,
}: {
  scenes: TestScene[];
  currentId?: string;
  currentTitle: string;
  videoOnly: boolean;
  statusOf(s: TestScene): SceneVideoStatus;
  onPick(nodeId: string): void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const wrap = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  const q = fold(query.trim());
  const visible = scenes.filter((s) => (!videoOnly || isVideoScene(s.node)) && (!q || fold(`${s.title} ${s.node.id}`).includes(q)));
  const groups = (['main', 'branch', 'unreachable'] as const).map((g) => ({ g, items: visible.filter((s) => s.group === g) })).filter((x) => x.items.length > 0);
  const flat = groups.flatMap((x) => x.items);

  React.useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, flat.findIndex((s) => s.node.id === currentId)));
    requestAnimationFrame(() => input.current?.focus());
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  React.useEffect(() => setActive(0), [query, videoOnly]);
  React.useEffect(() => {
    if (open) document.getElementById(`${listId}-${flat[active]?.node.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, flat, listId]);

  const pick = (s: TestScene | undefined) => {
    if (!s) return;
    setOpen(false);
    setQuery('');
    onPick(s.node.id);
    trigger.current?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={trigger} type="button" className={cn(BAR_BTN, 'max-w-64 border border-line-strong')} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="scene-jump">
        <span className="text-fg-muted">Cena:</span> <span className="truncate">{currentTitle}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[min(28rem,calc(100vw-1.5rem))] rounded-lg border border-line-strong bg-surface shadow-xl" data-testid="scene-jump-popover">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 text-fg-muted" aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={flat[active] ? `${listId}-${flat[active]!.node.id}` : undefined}
              aria-label="Procurar cena"
              placeholder="Procurar cena pelo nome…"
              className="min-h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(flat.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  pick(flat[active]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  trigger.current?.focus();
                }
              }}
              data-testid="scene-jump-search"
            />
          </div>
          <div id={listId} role="listbox" aria-label="Cenas da aula" className="max-h-[60vh] overflow-y-auto py-1">
            {flat.length === 0 && <p className="px-3 py-3 text-sm text-fg-muted">Nenhuma cena{videoOnly ? ' com vídeo' : ''} com esse nome.</p>}
            {groups.map(({ g, items }) => (
              <div key={g} role="group" aria-labelledby={`${listId}-${g}`}>
                <p id={`${listId}-${g}`} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">{SCENE_GROUP_LABEL[g]}</p>
                {items.map((s) => {
                  const i = flat.indexOf(s);
                  const st = statusOf(s);
                  const direction = isVideoScene(s.node) && st === 'none';
                  return (
                    <div
                      key={s.node.id}
                      id={`${listId}-${s.node.id}`}
                      role="option"
                      aria-selected={i === active}
                      aria-current={s.node.id === currentId ? 'true' : undefined}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(s)}
                      data-testid={`scene-jump-option-${s.node.id}`}
                      className={cn('flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm', i === active ? 'bg-accent-soft text-fg' : 'text-fg', g === 'branch' && 'pl-6')}
                    >
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-fg-faint">{s.seq || '–'}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {s.title}
                        <span className={cn('text-xs', st === 'stale' ? 'text-paid' : 'text-fg-muted')}>{marker(st, direction)}</span>
                      </span>
                      {s.node.id === currentId && <span className="shrink-0 text-xs text-accent-strong">atual</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

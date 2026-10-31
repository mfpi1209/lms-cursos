'use client';

import * as React from 'react';
import { AlertTriangle, Clapperboard, Film, Plus, Sparkles } from 'lucide-react';
import { directionNarration, type Presentation, type SceneDirection } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { focusAfter } from '@/components/ui/focus-trap';
import { spokenScript, type SpokenNode } from '@/components/studio/storyboard/narration-fields';
import type { GraphChange } from '@/components/studio/storyboard/scene-fields';
import { cinematicCount, directionMatches, directionSeconds, formatSeconds, MAX_SHOTS, newShot, patchDirection, slideCount } from './direction-model';
import { ShotTimeline } from './shot-timeline';
import { ShotEditor, type DirectionChange } from './shot-editor';
import { Animatic } from './animatic';

export interface DirectionAi {
  /** pode pedir agora (nenhuma execução da IA em andamento) */
  canSuggest: boolean;
  /** a IA está dirigindo esta cena */
  suggesting: boolean;
  /** há proposta de direção desta cena aguardando revisão */
  pending: boolean;
  onSuggest(): Promise<void>;
}

/**
 * Direção da cena: linha do tempo de planos, editor do plano selecionado e
 * animatic. Sem direção, o vídeo é um plano único com a fala inteira.
 */
export function DirectionPanel({ node, presentation, changeGraph, ai }: { node: SpokenNode; presentation: Presentation; changeGraph: GraphChange; ai?: DirectionAi }) {
  const direction = node.direction;
  const [open, setOpen] = React.useState(() => !!direction);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [animatic, setAnimatic] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  /** pedido de "Adicionar plano" pela barra: abre o editor do último plano já com o formulário */
  const [addNonce, setAddNonce] = React.useState(0);
  const [addPending, setAddPending] = React.useState(false);
  const summaryRef = React.useRef<HTMLElement>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  const animaticRef = React.useRef<HTMLButtonElement>(null);
  const shotCard = (id: string | null) => (id ? document.querySelector<HTMLElement>(`[data-testid="shot-${id}"]`) : null);
  /**
   * Seleciona um plano. `focus` leva o foco ao cartão do plano na linha do
   * tempo (ex.: fechar o editor, dividir/adicionar/remover plano), para o foco
   * não cair no body quando o editor some ou é remontado.
   */
  const select = (id: string | null, opts: { focus?: 'card' | 'none' } = {}) => {
    setAddPending(false);
    const prev = selectedId;
    setSelectedId(id);
    if (opts.focus === 'card') focusAfter(() => shotCard(id ?? prev), { preventScroll: true });
  };
  const script = spokenScript(node).trim();
  const selected = direction?.shots.find((s) => s.id === selectedId);
  const matches = direction ? directionMatches(direction, script) : true;

  const suggest = async () => {
    if (!ai) return;
    await ai.onSuggest();
    // o botão fica desabilitado enquanto a IA trabalha: o foco vai para o aviso de andamento
    focusAfter(() => statusRef.current, { preventScroll: true });
  };

  // a direção chegou (IA aplicada / desfazer): abre o painel
  const hadDirection = React.useRef(!!direction);
  React.useEffect(() => {
    if (direction && !hadDirection.current) setOpen(true);
    hadDirection.current = !!direction;
    if (!direction) setAnimatic(false);
  }, [direction]);

  const change: DirectionChange = (fn, coalesce) =>
    patchDirection(
      changeGraph,
      node.id,
      (d) => {
        if (!d) return null;
        const next = fn(d);
        return next === null ? null : { direction: next };
      },
      coalesce,
    );

  const createManual = () => {
    if (!script) return;
    const shot = newShot(script.slice(0, 1200));
    patchDirection(changeGraph, node.id, () => ({ direction: { version: 1, shots: [shot], intent: '', source: 'author' } satisfies SceneDirection }));
    setOpen(true);
    setSelectedId(shot.id);
  };
  const reconcile = () => {
    if (!direction) return;
    patchDirection(changeGraph, node.id, (d) => (d ? { narration: directionNarration(d).slice(0, 5000) } : null));
    // o aviso (e o botão) somem: o foco vai para o título do painel
    focusAfter(() => summaryRef.current, { preventScroll: true });
  };
  const clear = () => {
    patchDirection(changeGraph, node.id, () => ({ direction: undefined }));
    setSelectedId(null);
    focusAfter(() => summaryRef.current, { preventScroll: true });
  };
  const closeAnimatic = () => {
    setAnimatic(false);
    focusAfter(() => animaticRef.current, { preventScroll: true });
  };
  const onActive = React.useCallback((id: string | null) => setActiveId(id), []);

  const summary = direction
    ? `${direction.shots.length} ${direction.shots.length === 1 ? 'plano' : 'planos'} · ≈ ${formatSeconds(directionSeconds(direction))}${slideCount(direction) ? ` · ${slideCount(direction)} ${slideCount(direction) === 1 ? 'slide' : 'slides'}` : ''}${cinematicCount(direction) ? ` · ${cinematicCount(direction)} em movimento` : ''}`
    : 'plano único';

  return (
    <details
      className="group rounded-xl border border-line bg-surface-2/60"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-testid={`direction-panel-${node.id}`}
    >
      <summary ref={summaryRef} className="flex min-h-11 cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <Clapperboard className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span>Direção</span>
        <span className="text-xs font-normal text-fg-faint">{summary}</span>
        {direction && <Badge tone={direction.source === 'ai' ? 'ai' : 'neutral'}>{direction.source === 'ai' ? 'Sugerida pela IA' : 'Ajustada por você'}</Badge>}
        {direction && !matches && (
          <span className="inline-flex items-center gap-1 rounded-full bg-paid-soft px-2 py-0.5 text-xs font-medium text-paid">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Planos diferentes da fala
          </span>
        )}
        <span aria-hidden="true" className="ml-auto text-fg-faint transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
      </summary>

      <div className="space-y-3 border-t border-line px-2 pb-3 pt-3 sm:px-3">
        {ai?.suggesting && (
          <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="flex items-center gap-2 rounded-full border border-ai/30 bg-ai-soft px-3 py-1.5 text-xs font-medium text-ai">
            <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-ai" aria-hidden="true" /> A IA está dirigindo esta cena…
          </p>
        )}
        {ai?.pending && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-ai-soft px-3 py-2 text-xs text-ai">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">Há uma direção proposta pela IA para esta cena. Nada muda até você aplicar.</span>
            <button
              type="button"
              className="min-h-6 rounded font-medium underline"
              onClick={() => document.getElementById('direction-proposal')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            >
              Ver proposta
            </button>
          </p>
        )}

        {!direction ? (
          <div className="space-y-3 rounded-lg border border-dashed border-line-strong bg-bg px-3 py-4 text-center">
            <p className="text-sm text-fg-muted">Sem direção: o vídeo é um plano único.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="ai"
                size="sm"
                disabled={!ai || !ai.canSuggest || ai.suggesting || !script}
                title={!script ? 'Escreva a fala ou o texto da cena primeiro' : undefined}
                onClick={() => void suggest()}
                data-testid="direction-suggest"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Sugerir direção com IA
              </Button>
              <Button variant="secondary" size="sm" disabled={!script} onClick={createManual} data-testid="direction-manual">
                <Plus className="h-4 w-4" aria-hidden="true" /> Criar manualmente
              </Button>
            </div>
            <p className="text-xs text-fg-faint">Planos dividem a fala em trechos, cada um com enquadramento, câmera, slide ou letreiro.</p>
          </div>
        ) : (
          <>
            {direction.intent && <p className="text-sm italic leading-relaxed text-fg-muted">“{direction.intent}”</p>}

            {!matches && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-paid-soft px-3 py-2 text-xs text-paid">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">As falas dos planos, juntas, não batem com o que o apresentador fala. O vídeo usa as falas dos planos.</span>
                <Button variant="secondary" size="sm" onClick={reconcile} data-testid="direction-reconcile">
                  Reconciliar com a fala
                </Button>
              </div>
            )}

            <ShotTimeline direction={direction} presentation={presentation} selectedId={selectedId} onSelect={select} activeId={animatic ? activeId : null} />

            <div className="flex flex-wrap items-center gap-2">
              <Button ref={animaticRef} variant="secondary" size="sm" aria-pressed={animatic} onClick={() => setAnimatic((v) => !v)} data-testid="animatic-play">
                <Film className="h-4 w-4" aria-hidden="true" /> {animatic ? 'Fechar animatic' : 'Ver animatic'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={direction.shots.length >= MAX_SHOTS}
                onClick={() => {
                  setSelectedId(direction.shots[direction.shots.length - 1]?.id ?? null);
                  setAddNonce((n) => n + 1);
                  setAddPending(true);
                }}
                data-testid="direction-add-shot"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar plano
              </Button>
              <span className="flex-1" />
              {ai && (
                <Button variant="ai" size="sm" disabled={!ai.canSuggest || ai.suggesting || !script} onClick={() => void suggest()} data-testid="direction-resuggest">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Pedir nova direção
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clear} data-testid="direction-clear">
                Voltar ao plano único
              </Button>
            </div>

            {animatic && <Animatic direction={direction} presentation={presentation} onClose={closeAnimatic} onActive={onActive} />}

            {selected && (
              <ShotEditor
                key={`${selected.id}-${addNonce}`}
                startAdding={addPending}
                nodeId={node.id}
                direction={direction}
                shot={selected}
                presentation={presentation}
                change={change}
                onSelect={(id, opts) => select(id, opts)}
              />
            )}
            {!selected && <p className="text-xs text-fg-faint">Selecione um plano para editar fala, câmera, enquadramento e o que aparece na tela.</p>}
          </>
        )}
      </div>
    </details>
  );
}

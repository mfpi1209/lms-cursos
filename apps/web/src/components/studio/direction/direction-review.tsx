'use client';

import * as React from 'react';
import { Clapperboard, X } from 'lucide-react';
import { findLesson } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { focusAfter } from '@/components/ui/focus-trap';
import { useDraft } from '@/components/studio/draft-provider';
import { authoredConflict, isConflict, type AgentProposal, type ApplyResult } from '@/components/studio/storyboard/use-agent-runs';
import { errorText } from '@/components/studio/storyboard/use-media-jobs';
import { cinematicCount, directionSeconds, formatSeconds, framingSequence, slideCount } from './direction-model';
import { LayoutDiagram } from './visuals';

type DirectionProposal = Extract<AgentProposal, { kind: 'scene_direction' }>;

export interface DirectionApplyOptions {
  force?: boolean;
  /** substituir também as cenas cuja direção foi ajustada pelo autor (padrão: preservá-las) */
  overwriteAuthored?: boolean;
}

/**
 * Revisão da direção proposta pela IA para a aula (ou para uma cena): por
 * cena, quantos planos, a sequência de enquadramentos e os slides. Mesmo fluxo
 * de conflito da revisão da aula.
 *
 * Cenas cuja direção atual foi "Ajustada por você" ficam marcadas e, por
 * padrão, são preservadas ao aplicar (`overwriteAuthored: false`).
 */
export function DirectionProposalPanel({
  proposal,
  busy,
  sceneName,
  onGoTo,
  onApply,
  onReject,
  returnFocusTo,
}: {
  proposal: DirectionProposal;
  busy: boolean;
  sceneName: (nodeId: string) => string;
  onGoTo: (nodeId: string) => void;
  onApply: (opts: DirectionApplyOptions) => Promise<ApplyResult | void>;
  onReject: () => Promise<void>;
  /** para onde o foco vai depois de descartar (ex.: o botão "Dirigir aula com IA") */
  returnFocusTo?: () => HTMLElement | null | undefined;
}) {
  const { status: draftStatus, reload, document: doc } = useDraft();
  const [conflict, setConflict] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [overwriteAuthored, setOverwriteAuthored] = React.useState(false);
  /** o servidor recusou (409 authoredConflict): todas as cenas-alvo foram ajustadas pelo autor */
  const [serverAuthored, setServerAuthored] = React.useState<string[] | null>(null);
  const saving = draftStatus === 'saving' || draftStatus === 'dirty';
  const scenes = proposal.payload.scenes;
  const s = proposal.summary;
  const shots = s.shots ?? scenes.reduce((n, x) => n + x.direction.shots.length, 0);
  const slides = s.slides ?? scenes.reduce((n, x) => n + slideCount(x.direction), 0);
  const headingId = `direction-proposal-${proposal.id}`;

  // cenas-alvo que hoje têm direção ajustada pelo autor: do resumo do servidor ou do rascunho atual
  const authored = React.useMemo<Set<string>>(() => {
    if (serverAuthored) return new Set(serverAuthored);
    if (s.authoredTargets) return new Set(s.authoredTargets);
    const lesson = findLesson(doc, proposal.payload.lessonId)?.lesson;
    const set = new Set<string>();
    for (const { nodeId } of scenes) {
      const node = lesson?.graph.nodes.find((n) => n.id === nodeId);
      if (node && 'direction' in node && node.direction?.source === 'author') set.add(nodeId);
    }
    return set;
  }, [serverAuthored, s.authoredTargets, doc, proposal.payload.lessonId, scenes]);
  const authoredCount = authored.size;
  const willApply = overwriteAuthored ? scenes.length : scenes.length - authoredCount;

  const apply = async (force = false) => {
    setError(null);
    try {
      await onApply({ force, overwriteAuthored });
      // o painel some: o foco vai para a primeira cena que recebeu a direção
      const first = scenes.find(({ nodeId }) => overwriteAuthored || !authored.has(nodeId)) ?? scenes[0];
      if (first) focusAfter(() => document.getElementById(`scene-${first.nodeId}`));
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        return;
      }
      const ac = authoredConflict(e);
      if (ac) {
        // nada entrou: todas as cenas-alvo foram ajustadas por você. Mostra a opção de substituir e deixa confirmar.
        setServerAuthored(ac.skippedAuthored.length ? ac.skippedAuthored : scenes.map((x) => x.nodeId));
        setError(`${ac.skippedAuthored.length === 1 ? 'A cena-alvo foi ajustada' : 'As cenas-alvo foram ajustadas'} por você depois da proposta. Marque “Substituir também…” e aplique de novo para sobrescrever.`);
        focusAfter('[data-testid="direction-overwrite-authored"]', { preventScroll: true });
        return;
      }
      try {
        await reload();
      } catch {
        /* segue com a mensagem original */
      }
      setError(errorText(e, 'Não foi possível aplicar a direção'));
    }
  };

  const reject = async () => {
    await onReject();
    focusAfter(() => returnFocusTo?.() ?? document.querySelector<HTMLElement>('[data-testid="direction-lesson"]'));
  };

  const goTo = (nodeId: string) => {
    onGoTo(nodeId);
    // além de rolar, o foco vai para o cartão da cena (teclado e leitor de tela)
    focusAfter(() => document.getElementById(`scene-${nodeId}`), { preventScroll: true });
  };

  return (
    <section id="direction-proposal" aria-labelledby={headingId} className="panel rise scroll-mt-24 overflow-hidden" data-testid="direction-proposal">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-ai-soft px-5 py-3">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-ai">
          <Clapperboard className="h-4 w-4" aria-hidden="true" /> Direção proposta pela IA
        </h3>
        <p className="text-xs text-ai/80">Nada muda até você aplicar.</p>
      </header>
      <div className="space-y-4 p-5">
        <p className="text-sm text-fg-muted">Confira o ritmo de cada cena abaixo. A intenção de cada plano aparece no cartão da cena; use “Ver animatic” depois de aplicar.</p>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Resumo da direção">
          <li className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
            {scenes.length} {scenes.length === 1 ? 'cena' : 'cenas'}
          </li>
          <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">
            {shots} {shots === 1 ? 'plano' : 'planos'}
          </li>
          <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">
            {slides} {slides === 1 ? 'slide' : 'slides'}
          </li>
          {typeof s.cameras === 'number' && (
            <li className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">
              {s.cameras} {s.cameras === 1 ? 'câmera' : 'câmeras'}
            </li>
          )}
          {authoredCount > 0 && (
            <li className="rounded-full bg-paid-soft px-2.5 py-1 font-medium text-paid" data-testid="direction-proposal-authored-count">
              {authoredCount} {authoredCount === 1 ? 'ajustada por você' : 'ajustadas por você'}
            </li>
          )}
        </ul>

        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Direção por cena">
          {scenes.map(({ nodeId, direction }) => {
            const n = direction.shots.length;
            const sl = slideCount(direction);
            const cine = cinematicCount(direction);
            const isAuthored = authored.has(nodeId);
            const kept = isAuthored && !overwriteAuthored;
            return (
              <li key={nodeId} className={cn('space-y-2 px-4 py-3', kept && 'bg-surface-2/60')} data-testid={`direction-proposal-scene-${nodeId}`} data-authored={isAuthored ? 'true' : undefined}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <button type="button" className="min-h-6 rounded text-left text-sm font-semibold text-accent hover:underline" onClick={() => goTo(nodeId)} aria-label={`Ir para a cena “${sceneName(nodeId)}”`}>
                      {sceneName(nodeId)}
                    </button>
                    {isAuthored && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', kept ? 'bg-surface-2 text-fg-muted' : 'bg-paid-soft text-paid')} data-testid="direction-proposal-authored">
                        {kept ? 'Ajustada por você · mantida' : 'Ajustada por você · será substituída'}
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-fg-faint">
                    {n} {n === 1 ? 'plano' : 'planos'} · {sl} {sl === 1 ? 'slide' : 'slides'}
                    {cine > 0 && <span className="text-paid"> · {cine} em movimento</span>} · ≈ {formatSeconds(directionSeconds(direction))}
                  </span>
                </div>
                <p className={cn('text-sm', kept ? 'text-fg-faint' : 'text-fg-muted')}>{framingSequence(direction)}</p>
                <ul className={cn('flex flex-wrap gap-1', kept && 'opacity-50')} aria-hidden="true">
                  {direction.shots.map((shot) => (
                    <li key={shot.id} className="w-12">
                      <LayoutDiagram layout={shot.layout} />
                    </li>
                  ))}
                </ul>
                {direction.intent && <p className="text-xs italic text-fg-faint">“{direction.intent}”</p>}
              </li>
            );
          })}
        </ol>

        {authoredCount > 0 && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-paid/40 bg-paid-soft/40 px-3 py-2 text-sm text-fg">
            <Checkbox className="mt-0.5" checked={overwriteAuthored} onChange={(e) => setOverwriteAuthored(e.target.checked)} data-testid="direction-overwrite-authored" />
            <span>
              Substituir também {authoredCount === 1 ? 'a 1 cena ajustada' : `as ${authoredCount} cenas ajustadas`} por você
              <span className="block text-xs text-fg-muted">Desmarcado, a IA só dirige {willApply} {willApply === 1 ? 'cena' : 'cenas'}; suas edições manuais ficam como estão.</span>
            </span>
          </label>
        )}

        {s.conversionWarnings && s.conversionWarnings.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <p className="font-medium text-fg">Ajustes feitos na proposta</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
              {s.conversionWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {conflict ? (
          <div role="alert" className="space-y-2 rounded-xl bg-paid-soft p-3 text-sm text-paid">
            <p>Esta aula foi editada depois que a IA preparou a direção. Aplicar mesmo assim substitui a direção dessas cenas pelo que a IA propôs.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="paid" size="sm" disabled={busy} onClick={() => void apply(true)} data-testid="direction-apply-force">
                Aplicar mesmo assim
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConflict(false)}>Voltar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ai" size="sm" disabled={busy || saving || willApply === 0} onClick={() => void apply(false)} data-testid="direction-apply">
              {busy ? 'Aplicando…' : willApply < scenes.length ? `Aplicar direção (${willApply} de ${scenes.length})` : 'Aplicar direção'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void reject()} data-testid="direction-reject">
              <X className="h-4 w-4" aria-hidden="true" /> Descartar
            </Button>
            {saving && <span className="text-xs text-fg-muted">Aguardando salvar suas alterações…</span>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </section>
  );
}

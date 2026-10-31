'use client';

import * as React from 'react';
import { AlertCircle, ChevronDown, Gauge, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { focusAfter } from '@/components/ui/focus-trap';
import { cn, formatDate } from '@/lib/utils';
import { AiRunBar } from '@/components/studio/storyboard/ai-revise';
import { ActionCard } from '@/components/studio/assistant/action-button';
import { useAssistantState } from '@/components/studio/assistant/use-assistant';
import {
  FINDINGS_FILTERS,
  OPEN_QUALITY_EVENT,
  QUALITY_DIMENSIONS,
  QUALITY_DIMENSION_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  VIDEO_DIMENSIONS,
  formatScore,
  matchesFilter,
  scoreLabel,
  scoreTone,
  sortFindings,
  topFindingByDimension,
  type FindingsFilter,
  type OpenQualityDetail,
  type QualityDimension,
  type QualityFinding,
  type QualityScorecard,
  type QualitySeverity,
} from './quality-model';
import type { LessonQualityState } from './use-quality';

/* ------------------------------------------------------------------ */
/* Peças compartilhadas (painel da aula e cartão do curso)             */
/* ------------------------------------------------------------------ */

const TONE_TEXT: Record<ReturnType<typeof scoreTone>, string> = { danger: 'text-danger', warning: 'text-paid', success: 'text-success', neutral: 'text-fg-faint' };
const TONE_BAR: Record<ReturnType<typeof scoreTone>, string> = { danger: 'bg-danger', warning: 'bg-paid', success: 'bg-success', neutral: 'bg-fg-faint' };
const TONE_BADGE: Record<ReturnType<typeof scoreTone>, BadgeTone> = { danger: 'danger', warning: 'warning', success: 'success', neutral: 'neutral' };
const SEVERITY_TONE: Record<QualitySeverity, BadgeTone> = { alta: 'danger', média: 'warning', baixa: 'neutral' };

/** Nota geral: número grande "/5" + rótulo. */
export function OverallScore({ score, size = 'lg', className, ...rest }: { score: number | null | undefined; size?: 'lg' | 'md' } & React.HTMLAttributes<HTMLDivElement>) {
  const tone = scoreTone(score);
  const has = typeof score === 'number';
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent', className)} aria-label={has ? `Nota geral ${formatScore(score)} de 5: ${scoreLabel(score)}` : 'Sem nota geral'} {...rest}>
      <span className="flex items-baseline gap-0.5">
        <span className={cn('font-display font-bold tabular-nums leading-none', size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl', has ? TONE_TEXT[tone] : 'text-fg-faint')} aria-hidden="true">
          {formatScore(score)}
        </span>
        <span className="text-sm text-fg-faint" aria-hidden="true">/5</span>
      </span>
      <Badge tone={TONE_BADGE[tone]} aria-hidden="true">{scoreLabel(score)}</Badge>
    </div>
  );
}

/** Segmento "Texto" / "Texto e vídeo": o que a IA analisa. */
export function BasisToggle({ value, onChange, readyVideos, disabled, idPrefix }: { value: boolean; onChange: (includeVideo: boolean) => void; readyVideos: number; disabled?: boolean; idPrefix: string }) {
  const noteId = `${idPrefix}-basis-note`;
  const noVideo = readyVideos === 0;
  const seg = (active: boolean, extra?: string) =>
    cn('min-h-9 rounded-full px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', active ? 'bg-ai-soft text-ai' : 'text-fg-muted hover:text-fg', extra);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div role="group" aria-label="O que avaliar" className="inline-flex rounded-full border border-line bg-surface p-0.5">
        <button type="button" className={seg(!value)} aria-pressed={!value} disabled={disabled} onClick={() => onChange(false)} data-testid={`${idPrefix}-basis-text`}>
          Texto
        </button>
        <button
          type="button"
          className={seg(value)}
          aria-pressed={value}
          aria-describedby={noteId}
          disabled={disabled || noVideo}
          title={noVideo ? 'Nenhum vídeo pronto para analisar' : undefined}
          onClick={() => onChange(true)}
          data-testid={`${idPrefix}-basis-video`}
        >
          Texto e vídeo
        </button>
      </div>
      <span id={noteId} className="text-xs text-fg-faint">
        {noVideo ? 'nenhum vídeo pronto para analisar' : `analisa quadros dos vídeos prontos (${readyVideos})`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cartões de dimensão                                                 */
/* ------------------------------------------------------------------ */

function DimensionTile({ dimension, score, note }: { dimension: QualityDimension; score: number | null; note: string }) {
  const label = QUALITY_DIMENSION_LABELS[dimension];
  const tone = scoreTone(score);
  const has = typeof score === 'number';
  return (
    <li className="min-w-0 rounded-xl border border-line bg-surface p-3" data-testid={`quality-dimension-${dimension}`} data-score={score ?? ''}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{label}</span>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', has ? TONE_TEXT[tone] : 'text-fg-faint')} aria-hidden="true">
          {has ? score : '—'}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={has ? score : undefined} aria-valuetext={has ? `${score} de 5` : 'sem nota'} aria-label={label}>
        {has && <div className={cn('h-full rounded-full', TONE_BAR[tone])} style={{ width: `${(score / 5) * 100}%` }} />}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-fg-muted">{note}</p>
    </li>
  );
}

function tileNote(dimension: QualityDimension, score: number | null, top: QualityFinding | undefined): string {
  if (score === null) return VIDEO_DIMENSIONS.has(dimension) ? 'sem vídeo para avaliar' : 'sem nota';
  if (top) return top.problem;
  return scoreLabel(score);
}

/* ------------------------------------------------------------------ */
/* Apontamentos                                                        */
/* ------------------------------------------------------------------ */

function FindingItem({ finding, index, sceneName, onGoTo, simulated }: { finding: QualityFinding; index: number; sceneName: (nodeId: string) => string | null; onGoTo: (nodeId: string) => void; simulated: boolean | null }) {
  const name = finding.scene ? sceneName(finding.scene) : null;
  const canAct = useAssistantState() !== null;
  return (
    <li
      tabIndex={-1}
      data-testid={`quality-finding-${index}`}
      data-scene={finding.scene ?? undefined}
      data-severity={finding.severity}
      className={cn('space-y-1.5 rounded-xl border px-3 py-2.5 outline-none scroll-mt-24 focus-visible:ring-2 focus-visible:ring-accent', finding.severity === 'alta' ? 'border-danger/30 bg-danger-soft/30' : 'border-line bg-surface')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-fg-muted">{QUALITY_DIMENSION_LABELS[finding.dimension] ?? finding.dimension}</span>
        {finding.scene &&
          (name ? (
            <button type="button" className="min-h-6 rounded font-medium text-accent hover:underline" onClick={() => onGoTo(finding.scene!)} aria-label={`Ir para a cena “${name}”`}>
              {name}
            </button>
          ) : (
            <span className="text-fg-faint">{finding.scene}</span>
          ))}
        {typeof finding.shot === 'number' && <span className="text-fg-faint">plano {finding.shot}</span>}
      </div>
      {finding.evidence && (
        <blockquote className="border-l-2 border-line-strong pl-2.5 text-sm italic leading-relaxed text-fg-muted">“{finding.evidence}”</blockquote>
      )}
      <p className="text-sm leading-relaxed text-fg">{finding.problem}</p>
      {finding.fix && (
        <p className="text-sm leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">Como corrigir: </span>
          {finding.fix}
        </p>
      )}
      {finding.action && canAct && (
        <div className="pt-1">
          <ActionCard action={finding.action} simulated={simulated} />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeCollapsed(key: string, v: boolean) {
  try {
    window.localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export interface QualityPanelProps {
  quality: LessonQualityState;
  /** nome da cena para um id de nó; null quando o id não é uma cena desta aula */
  sceneName(nodeId: string): string | null;
  /** rola até a cena (o painel cuida do foco) */
  onGoTo(nodeId: string): void;
  /** vídeos prontos nesta aula (base da opção "Texto e vídeo") */
  readyVideos: number;
  /** outra execução da IA em andamento nesta aula */
  otherBusy?: boolean;
  headingLevel?: 'h2' | 'h3';
  storageKey?: string;
  className?: string;
}

/**
 * "Avaliação": nota geral, 11 dimensões e apontamentos com correções sugeridas.
 * Nada muda na aula por aqui: as ações dos apontamentos passam pelos cartões do
 * assistente (IA → proposta; pago → dois cliques).
 */
export function QualityPanel({ quality, sceneName, onGoTo, readyVideos, otherBusy = false, headingLevel = 'h3', storageKey = 'lms.quality.storyboard.collapsed', className }: QualityPanelProps) {
  const Heading = headingLevel;
  const headingId = React.useId();
  const bodyId = React.useId();
  const idPrefix = React.useId().replace(/:/g, '');
  const assistant = useAssistantState();
  const [collapsed, setCollapsed] = React.useState(false);
  const [includeVideo, setIncludeVideo] = React.useState(false);
  const [filter, setFilter] = React.useState<FindingsFilter>('all');
  const [announce, setAnnounce] = React.useState('');
  const sectionRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => setCollapsed(readCollapsed(storageKey)), [storageKey]);
  // sem vídeo pronto, a opção "Texto e vídeo" não fica selecionável
  React.useEffect(() => {
    if (readyVideos === 0) setIncludeVideo(false);
  }, [readyVideos]);

  const scorecard: QualityScorecard | null = quality.data?.scorecard ?? null;
  const stale = !!quality.data?.stale;
  const running = quality.run !== null;
  const sorted = React.useMemo(() => sortFindings(scorecard?.findings ?? []), [scorecard]);
  const topByDimension = React.useMemo(() => topFindingByDimension(sorted), [sorted]);
  const hasVideoFindings = sorted.some((f) => VIDEO_DIMENSIONS.has(f.dimension));
  const hasTextFindings = sorted.some((f) => !VIDEO_DIMENSIONS.has(f.dimension));

  const toggle = () =>
    setCollapsed((v) => {
      writeCollapsed(storageKey, !v);
      return !v;
    });

  // Selos das cenas ("2 apontamentos") pedem para abrir o painel e ir ao primeiro apontamento daquela cena.
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const nodeId = (e as CustomEvent<OpenQualityDetail>).detail?.nodeId;
      setCollapsed(false);
      writeCollapsed(storageKey, false);
      setFilter('all');
      sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      focusAfter(() => {
        const root = sectionRef.current;
        if (!root) return null;
        const target = nodeId ? root.querySelector<HTMLElement>(`[data-testid^="quality-finding-"][data-scene="${CSS.escape(nodeId)}"]`) : null;
        return target ?? root.querySelector<HTMLElement>('[data-testid="quality-overall"]') ?? root;
      });
    };
    window.addEventListener(OPEN_QUALITY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_QUALITY_EVENT, onOpen);
  }, [storageKey]);

  // Avaliação concluída nesta sessão: abre o painel, anuncia e leva o foco à nota.
  const completed = quality.completedCount;
  React.useEffect(() => {
    if (completed === 0) return;
    setCollapsed(false);
    writeCollapsed(storageKey, false);
    const sc = quality.data?.scorecard;
    setAnnounce(sc ? `Avaliação concluída: nota ${formatScore(sc.overall)} de 5, ${scoreLabel(sc.overall).toLowerCase()}. ${sc.findings.length} ${sc.findings.length === 1 ? 'apontamento' : 'apontamentos'}.` : 'Avaliação concluída.');
    focusAfter(() => sectionRef.current?.querySelector<HTMLElement>('[data-testid="quality-overall"]'), { preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só ao término da avaliação
  }, [completed]);

  const evaluate = async () => {
    setAnnounce('');
    await quality.evaluate(includeVideo);
    // o botão fica desabilitado durante a execução: o foco vai para a barra de andamento
    focusAfter('[data-testid="quality-run-bar"]', { preventScroll: true });
  };

  const disabledReason = quality.unavailable
    ? 'A avaliação ainda não está disponível neste servidor'
    : running
      ? 'A avaliação desta aula já está em andamento'
      : otherBusy
        ? 'Aguarde a execução da IA em andamento terminar'
        : undefined;
  const canEvaluate = !quality.unavailable && !running && !otherBusy && !quality.busy;

  const visible = sorted.filter((f) => matchesFilter(f, filter));
  const groups = SEVERITY_ORDER.map((sev) => ({ sev, items: visible.map((f) => ({ f, index: sorted.indexOf(f) })).filter((x) => x.f.severity === sev) })).filter((g) => g.items.length > 0);

  return (
    <section ref={sectionRef} id="quality-panel" aria-labelledby={headingId} data-testid="quality-panel" data-state={quality.unavailable ? 'unavailable' : scorecard ? 'ready' : 'empty'} className={cn('panel scroll-mt-24 overflow-hidden', className)}>
      {/* Cabeçalho: título, nota geral, quando foi avaliada, controles */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <Heading id={headingId} className="flex items-center gap-2 font-sans text-base font-semibold text-fg">
          <Gauge className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          Avaliação
        </Heading>
        <OverallScore score={scorecard?.overall ?? null} tabIndex={-1} data-testid="quality-overall" />
        {scorecard && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-faint">
            <span>Avaliada em {formatDate(scorecard.evaluatedAt)}</span>
            {stale && (
              <Badge tone="warning" title="A aula mudou depois desta avaliação" data-testid="quality-stale">
                Desatualizada
              </Badge>
            )}
          </span>
        )}
        <div className="flex basis-full flex-wrap items-center gap-2 sm:ml-auto sm:basis-auto sm:justify-end">
          {!quality.unavailable && <BasisToggle value={includeVideo} onChange={setIncludeVideo} readyVideos={readyVideos} disabled={!canEvaluate} idPrefix={`${idPrefix}-q`} />}
          <Button variant="ai" size="sm" disabled={!canEvaluate} title={disabledReason} onClick={() => void evaluate()} data-testid="quality-evaluate">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> {scorecard ? 'Avaliar de novo com IA' : 'Avaliar com IA'}
          </Button>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            data-testid="quality-toggle"
          >
            {collapsed ? 'Mostrar' : 'Recolher'}
            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !collapsed && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Andamento, falha, erro: sempre visíveis (mesmo recolhido) */}
      {(running || quality.failedRun || quality.error) && (
        <div className="space-y-2 px-4 pb-3 sm:px-5">
          {quality.run && <AiRunBar run={quality.run} label={quality.run.task && /video/i.test(quality.run.task) ? 'Avaliando texto e vídeos da aula' : 'Avaliando a aula'} testId="quality-run-bar" />}
          {quality.failedRun && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger" data-testid="quality-failed">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">A IA não conseguiu concluir a avaliação: {quality.failedRun.error ?? 'erro desconhecido'}.</span>
              <button type="button" className="min-h-6 rounded text-xs underline" onClick={quality.dismissFailed} aria-label="Fechar aviso">Fechar</button>
            </p>
          )}
          {quality.error && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
              <span className="flex-1">{quality.error}</span>
              <button type="button" className="min-h-6 rounded text-xs underline" onClick={quality.clearError}>Fechar</button>
            </p>
          )}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {!collapsed && (
        <div id={bodyId} className="space-y-5 border-t border-line px-4 py-4 sm:px-5">
          {quality.unavailable ? (
            <p className="text-sm text-fg-muted" data-testid="quality-unavailable">Avaliação ainda não disponível. Assim que o serviço estiver no ar, você poderá pedir notas e correções sugeridas por aqui.</p>
          ) : quality.loading && !scorecard ? (
            <p className="text-sm text-fg-muted">Carregando avaliação…</p>
          ) : !scorecard ? (
            <p className="text-sm text-fg-muted" data-testid="quality-empty">Sem avaliação ainda. Avalie para receber notas e correções sugeridas.</p>
          ) : (
            <>
              {scorecard.summary && <p className="max-w-prose text-sm leading-relaxed text-fg">{scorecard.summary}</p>}
              <p className="text-xs text-fg-faint">
                Com base {scorecard.basis.text ? 'no texto da aula' : 'nos vídeos'}
                {scorecard.basis.video.length > 0 && ` e em ${scorecard.basis.video.length} ${scorecard.basis.video.length === 1 ? 'vídeo' : 'vídeos'} (${scorecard.basis.framesPerVideo} ${scorecard.basis.framesPerVideo === 1 ? 'quadro' : 'quadros'} cada)`}
                {' · '}revisão {scorecard.revision}
              </p>

              {/* Dimensões */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-fg">Notas por dimensão</h4>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="Notas por dimensão">
                  {QUALITY_DIMENSIONS.map((d) => {
                    const score = scorecard.scores?.[d] ?? null;
                    return <DimensionTile key={d} dimension={d} score={score} note={tileNote(d, score, topByDimension.get(d))} />;
                  })}
                </ul>
              </div>

              {/* Apontamentos */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-fg">
                    Apontamentos <span className="font-normal text-fg-faint">{sorted.length}</span>
                  </h4>
                  {sorted.length > 0 && hasTextFindings && hasVideoFindings && (
                    <div role="group" aria-label="Filtrar apontamentos" className="flex flex-wrap gap-1">
                      {FINDINGS_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          aria-pressed={filter === f.id}
                          onClick={() => setFilter(f.id)}
                          className={cn('min-h-9 rounded-full border px-3 text-xs font-medium transition-colors', filter === f.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-fg-muted hover:text-fg')}
                          data-testid={`quality-filter-${f.id}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {sorted.length === 0 ? (
                  <p className="text-sm text-fg-muted">Nenhum apontamento. A aula está em boa forma nesta avaliação.</p>
                ) : visible.length === 0 ? (
                  <p className="text-sm text-fg-muted">Nenhum apontamento neste filtro.</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.sev}>
                      <h5 className="mb-1.5 text-xs font-medium text-fg-muted">
                        Gravidade {SEVERITY_LABELS[g.sev].toLowerCase()} <span className="text-fg-faint">({g.items.length})</span>
                      </h5>
                      <ul className="space-y-2" aria-label={`Apontamentos de gravidade ${SEVERITY_LABELS[g.sev].toLowerCase()}`}>
                        {g.items.map(({ f, index }) => (
                          <FindingItem key={index} finding={f} index={index} sceneName={sceneName} onGoTo={onGoTo} simulated={assistant?.simulated ?? null} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

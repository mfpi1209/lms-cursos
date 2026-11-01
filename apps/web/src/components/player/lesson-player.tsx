'use client';

import Link from 'next/link';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveReview, type AttemptState, type Intent, type ReviewSummary } from '@lms/course-engine';
import {
  MISSION_LABELS,
  MISSION_NOTE_MAX,
  NODE_TYPE_LABELS,
  type AnyNode,
  type AssessmentNode,
  type ChoiceNode,
  type ConsequenceNode,
  type EndNode,
  type Lesson,
  type MediaRef,
  type MissionNode,
  type ReflectionNode,
  richTextToPlain,
} from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { NOTE_PRIVACY_HINT } from './privacy-hint';
import { RichText } from '@/components/rich-text';
import type { LessonPlayerProps } from './types';
import { findNode, prefersReducedMotion, usePlayerSession, type Carry, type PlayerSession, type RetryInfo } from './use-player-session';
import { ImmersivePlayer } from './immersive/immersive-player';
import { RecapView } from './recap-view';
import { useRecap } from './use-recap';
import { BrandBumper } from './brand-bumper';
import { bumperPlaysHere } from './platform-context';
import { isVideoCapable, letterOf, TONE_STYLES, VideoScene, videoMediaOf } from './video-scene';
import { BackSceneButton, LessonMapDrawer, useLessonNav } from './navigation';
import { NarrationBlock, narrationHeading, narrationOf } from './narration-block';
import { ReviewSummaryView } from './review-summary';
import { ScaffoldComposer, type ComposedSentence } from './scaffold-composer';
import { saveButtonState } from './compose-state';
import { closingNodeId as closingNodeIdOf, isLastLessonOfCourse } from './immersive/scene-flow';

/* ------------------------------------------------------------------------ */
/* Player                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Player de aula. O mesmo componente roda no LMS (driver persistido) e na
 * prévia do estúdio (driver em memória). O servidor decide as transições; o
 * player só apresenta o nó atual e envia intenções.
 *
 * Idempotência: cada submissão recebe UM eventId, reaproveitado ao tentar de
 * novo após falha de rede. Conflito (409) = outra aba avançou: ressincroniza
 * via driver.start() e avisa sem bloquear.
 *
 * O `driver` deve ser estável entre renderizações (useMemo no pai): trocar o
 * driver reinicia o player. Com `platform`, usa o visual da plataforma (palco
 * escuro); a lógica de sessão/intenções é a mesma (`usePlayerSession`).
 */
export function LessonPlayer({ lesson, driver, courseTitle, exitHref, platform }: LessonPlayerProps) {
  // fechamento do curso (despedida): só a última aula tem; o motor da sessão usa para anunciar "Falta só o fechamento"
  const closingNodeId = useMemo(() => closingNodeIdOf(lesson.graph, !!platform && isLastLessonOfCourse(platform.lessons, lesson.id)), [lesson, platform]);
  const player = usePlayerSession(lesson, driver, { closingNodeId });
  if (platform && platform.theme !== 'classic') {
    return <ImmersivePlayer lesson={lesson} driver={driver} exitHref={exitHref} platform={platform} player={player} />;
  }
  return <ClassicPlayer lesson={lesson} driver={driver} courseTitle={courseTitle} exitHref={exitHref} player={player} platform={platform} />;
}

/** Visual clássico (cartões claros): reserva, pedido com `?player=classic`. */
function ClassicPlayer({ lesson, driver, courseTitle, exitHref, player, platform }: LessonPlayerProps & { player: PlayerSession }) {
  const narrationTitle = narrationHeading(platform?.branding.presenterName?.trim() || platform?.castPresenter?.name, platform?.presenterPronoun);
  const { session, loadError, pending, inflight, stepError, fieldError, conflict, setConflict, carry, retry, announce, gesture, begin, send, retrySend, restart } = player;
  // "Cena anterior", atalhos (← / Enter / →) e mapa da aula, como no player da plataforma
  const nav = useLessonNav(player);
  const reviewNode = session ? findNode(lesson, session.state.currentNodeId) : undefined;
  const review = useMemo<ReviewSummary | null>(
    () => (session && reviewNode?.type === 'content' && reviewNode.reviewNodeIds?.length ? resolveReview(lesson.graph, reviewNode.reviewNodeIds, session.state) : null),
    [session, reviewNode, lesson.graph],
  );

  /* ---------------------------------------------------------------------- */

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6" data-testid="player-load-error">
        <PlayerHeader courseTitle={courseTitle} lessonTitle={lesson.title} exitHref={exitHref} attemptNumber={null} percent={0} mode={driver.mode} />
        <div role="alert" className="rounded-[var(--radius-card)] bg-danger-soft p-5 text-danger">
          <p className="font-medium">Não foi possível abrir a aula.</p>
          <p className="mt-1 text-sm">{loadError}</p>
          <div className="mt-4">
            <Button variant="secondary" className="rounded-full" onClick={() => void begin(() => driver.start())}>Tentar de novo</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
        <PlayerHeader courseTitle={courseTitle} lessonTitle={lesson.title} exitHref={exitHref} attemptNumber={null} percent={0} mode={driver.mode} />
        <p role="status" className="text-sm text-fg-muted">Carregando aula…</p>
      </div>
    );
  }

  const { state, progress } = session;
  const node = findNode(lesson, state.currentNodeId);
  const completed = state.status === 'completed' || node?.type === 'end';
  const carryHere = carry && carry.nodeId === state.currentNodeId ? carry : null;
  const retryHere = retry && retry.nodeId === state.currentNodeId ? retry : null;
  // largura estável dentro da aula: com vídeo, o quadro é maior
  const hasVideo = lesson.graph.nodes.some((n) => !!videoMediaOf(n));

  return (
    <div className={cn('mx-auto space-y-6', hasVideo ? 'max-w-3xl' : 'max-w-2xl')}>
      <PlayerHeader
        courseTitle={courseTitle}
        lessonTitle={lesson.title}
        exitHref={exitHref}
        attemptNumber={session.attemptNumber}
        percent={progress.percent}
        mode={driver.mode}
      />

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div className="flex flex-wrap items-center gap-2">
        <BackSceneButton canGoBack={player.canGoBack} pending={pending} onBack={() => void player.goBack()} />
        <button type="button" onClick={nav.openMap} aria-haspopup="dialog" aria-expanded={nav.mapOpen} data-testid="open-lesson-map" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-fg-muted hover:bg-fg/5 hover:text-fg">
          Mapa da aula
        </button>
      </div>
      <LessonMapDrawer
        open={nav.mapOpen}
        onClose={nav.closeMap}
        lesson={lesson}
        state={state}
        progress={progress}
        canGoBack={player.canGoBack}
        backBlocked={player.backBlocked}
        pending={pending}
        onGoTo={(i) => player.goBack(i)}
        onRestart={driver.restart ? () => restart({ midway: state.status !== 'completed' }) : undefined}
        lessonsHref={exitHref}
      />

      {conflict && (
        <div role="status" data-testid="player-conflict" className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3 text-sm text-fg">
          <span>Esta aula avançou em outra aba. Continuamos do ponto atual.</span>
          <button type="button" className="min-h-6 shrink-0 rounded text-fg-muted underline underline-offset-2 hover:text-fg" onClick={() => setConflict(false)}>Fechar</button>
        </div>
      )}

      {stepError && (
        <div role="alert" className="rounded-[var(--radius-card)] bg-danger-soft p-4 text-sm text-danger">
          <p className="font-medium">Não foi possível enviar sua resposta.</p>
          <p className="mt-1">{stepError}</p>
          {inflight && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" className="rounded-full" onClick={retrySend} disabled={pending}>Tentar de novo</Button>
            </div>
          )}
        </div>
      )}

      {!node ? (
        <NodeFrame nodeId={state.currentNodeId} nodeType="unknown" title="Etapa não encontrada">
          <p className="text-fg-muted">Esta etapa não existe mais nesta versão da aula. Volte ao curso e tente novamente.</p>
          <div className="mt-6">
            <Link href={exitHref} className={cn(buttonVariants({ variant: 'secondary' }), 'rounded-full')}>Voltar ao curso</Link>
          </div>
        </NodeFrame>
      ) : completed ? (
        <NodeFrame nodeId={node.id} nodeType={node.type} title={node.title ?? 'Aula concluída'}>
          {carryHere && <CarryPanel carry={carryHere} />}
          {bumperPlaysHere(platform?.bumper) && <BrandBumper bumper={platform!.bumper!} gesture={gesture} variant="card" className="mb-6" />}
          <CompletedView
            node={node.type === 'end' ? node : null}
            graph={lesson.graph}
            state={state}
            exitHref={exitHref}
            canRestart={!!driver.restart}
            pending={pending}
            onRestart={() => void restart()}
          />
        </NodeFrame>
      ) : (
        <NodeFrame key={node.id} nodeId={node.id} nodeType={node.type} title={node.title ?? NODE_TYPE_LABELS[node.type]}>
          <NodeBody node={node} carry={carryHere} autoPlay={gesture} pending={pending} fieldError={fieldError} retry={retryHere} onSend={send} narrationTitle={narrationTitle} review={review} />
        </NodeFrame>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho: barra de progresso fina no topo, depois curso e aula           */
/* ------------------------------------------------------------------------ */

function PlayerHeader({
  courseTitle,
  lessonTitle,
  exitHref,
  attemptNumber,
  percent,
  mode,
}: {
  courseTitle: string;
  lessonTitle: string;
  exitHref: string;
  attemptNumber: number | null;
  percent: number;
  mode: 'lms' | 'preview';
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <header className="space-y-3">
      <div
        role="progressbar"
        aria-label="Progresso da aula"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}%`}
        data-testid="player-progress"
        className="flex items-center gap-3"
      >
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent-fill transition-[width] duration-300" style={{ width: `${value}%` }} />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-fg-muted">{value}%</span>
      </div>
      {/* Linha de título compacta (24px): o vídeo e suas ações cabem na primeira tela. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-fg-muted">{courseTitle}</p>
          {/* `!`: a regra global de h1 (clamp até 52px) não é em camada e venceria o utilitário. */}
          <h1 className="display mt-0.5 text-2xl! leading-tight! text-fg">{lessonTitle}</h1>
          {/* sem contador de tentativas para o aluno; a prévia avisa que nada é salvo */}
          {mode === 'preview' ? <p className="mt-0.5 text-sm text-fg-faint">Prévia (nada é salvo)</p> : attemptNumber === null ? <p className="mt-0.5 text-sm text-fg-faint">Preparando a aula…</p> : null}
        </div>
        <Link href={exitHref} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          Sair da aula
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------ */
/* Moldura do nó (foco no título a cada mudança de nó)                       */
/* ------------------------------------------------------------------------ */

/** Altura do cabeçalho fixo + folga: o título focado nunca fica escondido sob ele (`scroll-mt-24`). */
const HEADER_OFFSET_PX = 96;

function NodeFrame({ nodeId, nodeType, title, children }: { nodeId: string; nodeType: string; title: string; children: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const label = (NODE_TYPE_LABELS as Record<string, string>)[nodeType];

  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // Rola só se o essencial da cena (o quadro do vídeo com suas ações, ou o cartão inteiro) não cabe na tela
    // a partir de onde está: título no topo (sob o cabeçalho) e vídeo logo abaixo.
    const rect = el.getBoundingClientRect();
    const section = el.closest('section');
    const essential = section?.querySelector('video')?.parentElement ?? section;
    const fits = rect.top >= HEADER_OFFSET_PX - 16 && (essential?.getBoundingClientRect().bottom ?? rect.bottom) <= window.innerHeight;
    if (!fits) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [nodeId]);

  return (
    <section
      data-testid="player-node"
      data-node-id={nodeId}
      data-node-type={nodeType}
      aria-labelledby={headingId}
      className="panel rise p-5 sm:p-7 md:p-8"
    >
      {label && <p className="text-sm text-fg-muted">{label}</p>}
      {/* Foco programático a cada cena: contorno discreto, e só para quem navega pelo teclado (:focus-visible).
          `!` porque a regra global de :focus-visible não é em camada e venceria o utilitário. */}
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="display mt-1 scroll-mt-24 rounded-md text-xl leading-snug text-fg focus-visible:outline-solid! focus-visible:outline-2! focus-visible:outline-offset-4! focus-visible:outline-accent/60! sm:text-2xl"
      >
        {title}
      </h2>
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Painéis de retorno (escolha / avaliação) mostrados no nó seguinte         */
/* ------------------------------------------------------------------------ */

function CarryPanel({ carry }: { carry: Carry }) {
  if (carry.kind === 'choice') {
    return (
      <aside data-testid="choice-feedback" aria-label="Sua escolha" className="rounded-[var(--radius-card)] bg-accent-soft p-4 sm:p-5">
        <p className="text-sm text-fg-muted">Sua escolha</p>
        <p className="mt-1 font-medium text-fg">{carry.optionLabel}</p>
        {carry.feedback && <RichText doc={carry.feedback} className="mt-2 text-base leading-relaxed text-fg" />}
      </aside>
    );
  }
  const { outcome } = carry;
  return (
    <aside
      data-testid="assessment-feedback"
      aria-label="Resultado da avaliação"
      className={cn('rounded-[var(--radius-card)] p-4 sm:p-5', outcome.passed ? 'bg-success-soft' : 'bg-surface-2')}
    >
      <p className="text-sm text-fg-muted">Resultado da avaliação</p>
      <p className={cn('mt-1 font-semibold', outcome.passed ? 'text-success' : 'text-fg')}>{outcome.passed ? 'Correto' : 'Não foi dessa vez'}</p>
      <p className="mt-1 text-sm text-fg-muted">
        Você marcou {outcome.correctCount} de {outcome.totalCorrect} {outcome.totalCorrect === 1 ? 'alternativa correta' : 'alternativas corretas'}
        {outcome.attemptsUsed > 1 ? ` em ${outcome.attemptsUsed} tentativas.` : '.'}
      </p>
      {carry.feedback && <RichText doc={carry.feedback} className="mt-2 text-base leading-relaxed text-fg" />}
    </aside>
  );
}

/* ------------------------------------------------------------------------ */
/* Corpo por tipo de nó                                                      */
/* ------------------------------------------------------------------------ */

const BODY = 'text-lg leading-relaxed text-fg';

/**
 * Cena com vídeo = vídeo interativo (respostas sobre o quadro). Se o vídeo
 * falhar ao carregar, ou não houver vídeo, fica o layout de cartões.
 */
function NodeBody({
  node,
  carry,
  autoPlay,
  pending,
  fieldError,
  retry,
  onSend,
  narrationTitle,
  review,
}: {
  node: AnyNode;
  carry: Carry | null;
  autoPlay: boolean;
  pending: boolean;
  fieldError: string | null;
  retry: RetryInfo | null;
  onSend: (intent: Intent) => void;
  narrationTitle: string;
  review: ReviewSummary | null;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const video = videoMediaOf(node);
  const narration = narrationOf(node);
  if (video && !videoFailed && isVideoCapable(node)) {
    return (
      <>
      <VideoScene
        node={node}
        media={video}
        pending={pending}
        fieldError={fieldError}
        autoPlay={autoPlay}
        chosenLabel={carry?.kind === 'choice' ? carry.optionLabel : undefined}
        feedback={carry ? <CarryPanel carry={carry} /> : undefined}
        onSend={onSend}
        onFail={() => setVideoFailed(true)}
      />
      {narration && <NarrationBlock narration={narration} heading={narrationTitle} hasVideo />}
      </>
    );
  }
  // sem vídeo pronto: a fala da apresentadora aparece aberta, antes das respostas
  const spoken = narration ? <NarrationBlock key={node.id} narration={narration} heading={narrationTitle} hasVideo={false} /> : null;
  return (
    <>
      {carry && <CarryPanel carry={carry} />}
      <CardBody node={node} mediaFailed={videoFailed} pending={pending} fieldError={fieldError} retry={retry} onSend={onSend} spoken={spoken} review={review} />
    </>
  );
}

/** Layout de cartões: texto, mídia opcional acima e respostas abaixo. */
function CardBody({
  node,
  mediaFailed,
  pending,
  fieldError,
  retry,
  onSend,
  spoken,
  review,
}: {
  node: AnyNode;
  mediaFailed: boolean;
  pending: boolean;
  fieldError: string | null;
  retry: RetryInfo | null;
  onSend: (intent: Intent) => void;
  spoken?: React.ReactNode;
  review?: ReviewSummary | null;
}) {
  switch (node.type) {
    case 'scenario':
    case 'content':
      return (
        <>
          {node.media && <MediaBlock media={node.media} initiallyFailed={mediaFailed} />}
          <RichText doc={node.body} className={BODY} />
          {review && <ReviewSummaryView review={review} />}
          {spoken}
          <ContinueBar pending={pending} fieldError={fieldError} onContinue={() => onSend({ kind: 'advance' })} />
        </>
      );
    case 'consequence':
      return (
        <>
          <ConsequenceView node={node} mediaFailed={mediaFailed} pending={pending} fieldError={fieldError} onSend={onSend} />
          {spoken}
        </>
      );
    case 'choice':
      return (
        <>
          {spoken}
          <ChoiceView node={node} pending={pending} fieldError={fieldError} onSend={onSend} />
        </>
      );
    case 'reflection':
      return node.scaffold ? <ComposeView node={node} pending={pending} fieldError={fieldError} onSend={onSend} /> : <ReflectionView node={node} pending={pending} fieldError={fieldError} onSend={onSend} />;
    case 'mission':
      return <MissionView node={node} pending={pending} fieldError={fieldError} onSend={onSend} />;
    case 'assessment':
      return <AssessmentView node={node} pending={pending} fieldError={fieldError} retry={retry} onSend={onSend} />;
    case 'end':
      return null;
    default:
      return (
        <p className="rounded-[var(--radius-card)] bg-surface-2 p-4 text-sm text-fg-muted">
          Este tipo de etapa ({NODE_TYPE_LABELS[node.type]}) ainda não está disponível. Avise a equipe do curso.
        </p>
      );
  }
}

function ContinueBar({ pending, fieldError, onContinue, label = 'Continuar' }: { pending: boolean; fieldError: string | null; onContinue: () => void; label?: string }) {
  return (
    <div className="space-y-2 pt-2">
      {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
      <Button size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-continue" onClick={onContinue} disabled={pending} aria-busy={pending}>
        {pending ? 'Enviando…' : label}
      </Button>
    </div>
  );
}

function ConsequenceView({ node, mediaFailed, pending, fieldError, onSend }: { node: ConsequenceNode; mediaFailed: boolean; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const tone = TONE_STYLES[node.tone];
  return (
    <>
      {node.media && <MediaBlock media={node.media} initiallyFailed={mediaFailed} />}
      <div className={cn('border-l-4 pl-4 sm:pl-5', tone.rail)}>
        <RichText doc={node.body} className={BODY} />
      </div>
      {node.guidance && (
        <div className="rounded-[var(--radius-card)] bg-surface-2 p-4 sm:p-5">
          <p className={cn('text-sm font-medium', tone.label)}>O que levar disso</p>
          <RichText doc={node.guidance} className="mt-1 text-base leading-relaxed text-fg" />
        </div>
      )}
      <ContinueBar pending={pending} fieldError={fieldError} onContinue={() => onSend({ kind: 'advance' })} />
    </>
  );
}

/** Linha de opção: alvo largo, letra, controle nativo e texto grande. Selecionada = painel com acento. */
function OptionRow({
  letter,
  selected,
  children,
  input,
}: {
  letter: string;
  selected: boolean;
  children: React.ReactNode;
  input: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-line bg-bg-2 p-4 text-left text-lg leading-relaxed text-fg transition-colors hover:border-line-strong hover:bg-surface-2 has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-accent has-focus-visible:outline-offset-2 sm:p-5',
        selected && 'panel-accent bg-accent-soft/50',
      )}
    >
      {input}
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          selected ? 'bg-accent-fill text-accent-fill-fg' : 'bg-accent-soft text-accent',
        )}
        aria-hidden="true"
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

const optionInputClass = 'mt-1 size-5 shrink-0 accent-accent';

function ChoiceView({ node, pending, fieldError, onSend }: { node: ChoiceNode; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const groupName = useId();
  const promptId = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onSend({ kind: 'choose', optionId: selected });
      }}
      className="space-y-6"
    >
      <fieldset disabled={pending} aria-describedby={promptId} className="space-y-4">
        <legend className="sr-only">Escolha uma opção</legend>
        <div id={promptId}>
          <RichText doc={node.prompt} className={BODY} />
        </div>
        <div className="space-y-3" role="presentation">
          {node.options.map((opt, i) => (
            <OptionRow
              key={opt.id}
              letter={letterOf(i)}
              selected={selected === opt.id}
              input={
                <input
                  type="radio"
                  name={groupName}
                  value={opt.id}
                  checked={selected === opt.id}
                  onChange={() => setSelected(opt.id)}
                  data-testid={`option-${opt.id}`}
                  className={optionInputClass}
                />
              }
            >
              {opt.label}
            </OptionRow>
          ))}
        </div>
      </fieldset>
      {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
      <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-submit" disabled={!selected || pending} aria-busy={pending}>
        {pending ? 'Enviando…' : 'Confirmar escolha'}
      </Button>
    </form>
  );
}

function ReflectionView({ node, pending, fieldError, onSend }: { node: ReflectionNode; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const [text, setText] = useState('');
  const textareaId = useId();
  const promptId = useId();
  const hintId = useId();
  const len = text.trim().length;
  const tooShort = len < node.minLength;
  const tooLong = len > node.maxLength;
  // minLength 0: anotação opcional, com "Pular" (envia texto vazio; o roteiro mostra o texto de vazio)
  const optional = node.minLength === 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !tooLong) onSend({ kind: 'reflect', text: text.trim() });
      }}
      className="space-y-5"
    >
      <div id={promptId}>
        <RichText doc={node.prompt} className={BODY} />
      </div>
      <div>
        <label htmlFor={textareaId} className="sr-only">Sua resposta</label>
        <Textarea
          id={textareaId}
          data-testid="reflection-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={node.placeholder ?? 'Escreva com suas palavras.'}
          rows={7}
          maxLength={node.maxLength + 200}
          disabled={pending}
          aria-labelledby={promptId}
          aria-describedby={hintId}
          aria-invalid={!!fieldError || tooLong || undefined}
          className="min-h-48 rounded-[var(--radius-card)] p-4 text-lg leading-relaxed"
        />
        <div id={hintId} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
          <span>Sua resposta fica registrada para você e para a equipe; não é avaliada automaticamente. {NOTE_PRIVACY_HINT}</span>
          <span className={cn('tabular-nums', tooLong && 'text-danger', !tooLong && !tooShort && 'text-success')}>
            {len}/{node.maxLength}
            {node.minLength > 0 && tooShort && ` · mínimo ${node.minLength}`}
          </span>
        </div>
      </div>
      {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-submit" disabled={tooShort || tooLong || pending || (optional && len === 0)} aria-busy={pending}>
          {pending ? 'Enviando…' : 'Registrar resposta'}
        </Button>
        {optional && (
          <Button type="button" variant="secondary" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-skip" disabled={pending} onClick={() => onSend({ kind: 'reflect', text: '' })}>
            Pular
          </Button>
        )}
      </div>
    </form>
  );
}

/** Missão "Leve para a vida real" no visual clássico: a mesma regra do player da plataforma (nunca trava a aula). */
function MissionView({ node, pending, fieldError, onSend }: { node: MissionNode; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const len = note.trim().length;
  const tooLong = len > MISSION_NOTE_MAX;
  return (
    <form
      data-testid="mission-panel"
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reporting && !tooLong) onSend({ kind: 'mission', status: 'done', ...(len > 0 ? { note: note.trim() } : {}) });
      }}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">{MISSION_LABELS.moment}</p>
      {node.intro.trim() && <p className={BODY}>{node.intro.trim()}</p>}
      <div className="rounded-[var(--radius-card)] bg-surface-2 p-4">
        <p className="text-sm font-semibold text-fg-muted">O que fazer</p>
        <p className="mt-1 whitespace-pre-line text-lg text-fg">{node.action}</p>
      </div>
      <div className="rounded-[var(--radius-card)] bg-surface-2 p-4">
        <p className="text-sm font-semibold text-fg-muted">Se você ainda não trabalha</p>
        <p className="mt-1 text-base text-fg">{node.alternative}</p>
      </div>
      {node.tip?.trim() && <p className="text-sm text-fg-muted"><strong className="text-fg">Dica: </strong>{node.tip.trim()}</p>}
      {node.example?.trim() && <p className="text-sm text-fg-muted"><strong className="text-fg">Exemplo: </strong>{node.example.trim()}</p>}
      {reporting && (
        <div>
          <label htmlFor={noteId} className="block text-base font-semibold text-fg">{MISSION_LABELS.note} <span className="font-normal text-fg-muted">(opcional)</span></label>
          <Textarea id={noteId} data-testid="mission-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={MISSION_NOTE_MAX} disabled={pending} aria-describedby={`${noteId}-dica`} className="mt-2 min-h-28 rounded-[var(--radius-card)] p-4 text-lg" />
          <p className={cn('mt-1 flex justify-between gap-3 text-xs text-fg-muted')}>
            <span id={`${noteId}-dica`}>{NOTE_PRIVACY_HINT}</span>
            <span className={cn('tabular-nums', tooLong && 'text-danger')}>{len}/{MISSION_NOTE_MAX}</span>
          </p>
        </div>
      )}
      {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        {reporting ? (
          <Fragment key="registrando">
            <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-submit" disabled={pending || tooLong} aria-busy={pending}>{pending ? 'Salvando…' : 'Salvar e continuar'}</Button>
            <Button type="button" variant="secondary" size="lg" className="w-full rounded-full sm:w-auto" disabled={pending} onClick={() => setReporting(false)}>Voltar</Button>
          </Fragment>
        ) : (
          <Fragment key="aberto">
            <Button type="button" size="lg" className="w-full rounded-full sm:w-auto" data-testid="mission-done" disabled={pending} onClick={() => setReporting(true)}>{MISSION_LABELS.done}</Button>
            <Button type="button" variant="secondary" size="lg" className="w-full rounded-full sm:w-auto" data-testid="mission-later" disabled={pending} onClick={() => onSend({ kind: 'mission', status: 'later' })}>{MISSION_LABELS.later}</Button>
          </Fragment>
        )}
      </div>
    </form>
  );
}

/** "Na prática" no visual clássico: a mesma montagem por grupos do player da plataforma (prévia única ao lado). */
function ComposeView({ node, pending, fieldError, onSend }: { node: ReflectionNode; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const [sentence, setSentence] = useState<ComposedSentence>({ text: '', complete: false, missing: 1, total: 1 });
  const optional = node.minLength === 0;
  const lead = richTextToPlain(node.prompt).trim();
  const tooLong = sentence.text.length > node.maxLength;
  const btn = saveButtonState({ missing: sentence.missing, tooLong, tooShort: sentence.complete && sentence.text.length < node.minLength, pending, saved: false });
  return (
    <form
      data-testid="compose-panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (!btn.disabled) onSend({ kind: 'reflect', text: sentence.text });
      }}
      className="space-y-5"
    >
      {node.intro?.trim() && <p className="text-lg leading-snug text-fg" data-testid="compose-intro">{node.intro.trim()}</p>}
      <p className="text-lg leading-relaxed text-fg">Escolha uma opção em cada grupo para montar sua resposta.</p>
      {lead && !/^monte sua frase/i.test(lead) && <p className="leading-relaxed text-fg-muted">{lead}</p>}
      <ScaffoldComposer
        scaffold={node.scaffold!}
        disabled={pending}
        onChange={setSentence}
        actions={
          <div className="mt-5 space-y-3">
            {tooLong && <p role="alert" className="text-sm text-danger">A resposta passou de {node.maxLength} caracteres. Escolha uma opção mais curta ou encurte o que escreveu.</p>}
            {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
            <Button type="submit" size="lg" className="w-full rounded-full" data-testid="player-submit" disabled={btn.disabled} aria-busy={pending}>
              {btn.label}
            </Button>
            {optional && (
              <Button type="button" variant="ghost" size="lg" className="w-full rounded-full" data-testid="player-skip" disabled={pending} onClick={() => onSend({ kind: 'reflect', text: '' })}>
                Fazer depois
              </Button>
            )}
          </div>
        }
      />
    </form>
  );
}

function AssessmentView({
  node,
  pending,
  fieldError,
  retry,
  onSend,
}: {
  node: AssessmentNode;
  pending: boolean;
  fieldError: string | null;
  retry: RetryInfo | null;
  onSend: (i: Intent) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const groupName = useId();
  const promptId = useId();
  const multiple = node.mode === 'multiple';

  function toggle(id: string) {
    setSelected((prev) => (multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length > 0) onSend({ kind: 'assess', optionIds: selected });
      }}
      className="space-y-6"
    >
      <fieldset disabled={pending} aria-describedby={promptId} className="space-y-4">
        <legend className="sr-only">{multiple ? 'Marque todas as alternativas corretas' : 'Marque a alternativa correta'}</legend>
        <div id={promptId}>
          <RichText doc={node.prompt} className={BODY} />
          <p className="mt-2 text-sm text-fg-muted">{multiple ? 'Pode haver mais de uma alternativa correta.' : 'Marque uma alternativa.'}</p>
        </div>
        <div className="space-y-3" role="presentation">
          {node.options.map((opt, i) => (
            <OptionRow
              key={opt.id}
              letter={letterOf(i)}
              selected={selected.includes(opt.id)}
              input={
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={groupName}
                  value={opt.id}
                  checked={selected.includes(opt.id)}
                  onChange={() => toggle(opt.id)}
                  data-testid={`option-${opt.id}`}
                  className={optionInputClass}
                />
              }
            >
              {opt.label}
            </OptionRow>
          ))}
        </div>
      </fieldset>

      {retry && (
        <div data-testid="assessment-result" role="status" className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4 sm:p-5">
          <p className="font-semibold text-fg">Ainda não.</p>
          <p className="mt-1 text-sm text-fg-muted">
            Você marcou {retry.outcome.correctCount} de {retry.outcome.totalCorrect} {retry.outcome.totalCorrect === 1 ? 'alternativa correta' : 'alternativas corretas'}. Revise e responda de novo.
          </p>
          {(retry.feedback ?? node.feedbackFailed) && <RichText doc={retry.feedback ?? node.feedbackFailed} className="mt-2 text-base leading-relaxed text-fg" />}
          <p className="mt-2 text-sm font-medium text-fg">Tentativas restantes: {retry.outcome.attemptsLeft}</p>
        </div>
      )}

      {fieldError && <p role="alert" className="text-sm text-danger">{fieldError}</p>}
      <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-submit" disabled={selected.length === 0 || pending} aria-busy={pending}>
        {pending ? 'Enviando…' : retry ? 'Responder de novo' : 'Responder'}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Conclusão                                                                 */
/* ------------------------------------------------------------------------ */

function CompletedView({
  node,
  graph,
  state,
  exitHref,
  canRestart,
  pending,
  onRestart,
}: {
  node: EndNode | null;
  graph: Lesson['graph'];
  state: AttemptState;
  exitHref: string;
  canRestart: boolean;
  pending: boolean;
  onRestart: () => void;
}) {
  const recap = useRecap(graph, state);
  return (
    <div data-testid="player-completed" className="space-y-6">
      <p className="display text-2xl text-fg sm:text-3xl">Você chegou ao fim desta aula.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success">Aula concluída</span>
        {node?.outcomeLabel && node.outcomeLabel !== 'Aula concluída' && (
          <span className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-fg-muted">{node.outcomeLabel}</span>
        )}
      </div>
      {node && <RichText doc={node.summary} className={BODY} />}
      {/* "Meu roteiro": o que o aluno leva, nas palavras dele (só quando o encerramento define recap) */}
      {recap && <RecapView items={recap.items} title={recap.title} closingLine={recap.closingLine} variant="page" />}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row">
        <Link href={exitHref} className={cn(buttonVariants({ size: 'lg' }), 'w-full rounded-full sm:w-auto')}>
          Voltar ao curso
        </Link>
        {canRestart && (
          <Button variant="secondary" size="lg" className="w-full rounded-full sm:w-auto" data-testid="player-restart" onClick={onRestart} disabled={pending} aria-busy={pending}>
            {pending ? 'Enviando…' : 'Fazer de novo'}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Mídia (opcional, nunca pré-requisito)                                     */
/* ------------------------------------------------------------------------ */

function MediaBlock({ media, initiallyFailed = false }: { media: MediaRef; initiallyFailed?: boolean }) {
  const [failed, setFailed] = useState(initiallyFailed);
  const src = `/api/assets/${encodeURIComponent(media.assetId)}`;
  return (
    <figure className="space-y-2">
      {!failed && media.kind === 'image' && (
        <img src={src} alt={media.alt ?? ''} className="max-h-96 w-full rounded-2xl object-cover" loading="lazy" onError={() => setFailed(true)} />
      )}
      {!failed && media.kind === 'audio' && (
        <audio src={src} controls preload="none" aria-label={media.alt ?? 'Áudio'} className="w-full" onError={() => setFailed(true)} />
      )}
      {!failed && media.kind === 'video' && (
        <video src={src} controls preload="metadata" playsInline aria-label={media.alt ?? 'Vídeo'} className="aspect-video w-full rounded-2xl bg-bg-2 object-cover shadow-[0_12px_32px_-16px_rgb(16_24_40_/_0.3)]" onError={() => setFailed(true)} />
      )}
      {failed && media.alt && <figcaption className="text-sm text-fg-muted">Mídia indisponível no momento: {media.alt}</figcaption>}
      {!failed && media.alt && media.kind !== 'image' && <figcaption className="text-sm text-fg-muted">{media.alt}</figcaption>}
      {media.transcript && (
        <details className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          <summary className="min-h-6 cursor-pointer rounded font-medium text-fg">Transcrição</summary>
          <p className="mt-2 whitespace-pre-wrap">{media.transcript}</p>
        </details>
      )}
    </figure>
  );
}

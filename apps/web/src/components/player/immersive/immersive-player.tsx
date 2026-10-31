'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, ListVideo, Mic, Pencil, Play, RotateCcw, Undo2 } from 'lucide-react';
import { resolveReview, type AttemptState, type ProgressSummary, type ReviewSummary } from '@lms/course-engine';
import {
  NODE_TYPE_LABELS,
  richTextToPlain,
  type AnyNode,
  type AssessmentNode,
  type ChoiceNode,
  type ConsequenceNode,
  type EndNode,
  type Lesson,
  type ReflectionNode,
  type RichTextBlock,
  type RichTextDocument,
} from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { RichText } from '@/components/rich-text';
import { RecapView } from '../recap-view';
import type { PlatformContext, PlayerDriver } from '../types';
import { findNode, prefersReducedMotion, type Carry, type PlayerIntent, type PlayerSession, type RetryInfo } from '../use-player-session';
import { isVideoCapable, videoMediaOf } from '../video-scene';
import { ControlBar } from './controls';
import { OptionCards } from './option-cards';
import { RecordAnswer, WriteAnswer, useMicAvailable, type OpenAnswerDraft } from './open-answer';
import { RecapDrawer, useCourseRecap, type CourseRecap } from './recap-drawer';
import { chipFor, clock, headingSize, isTipScene, resolveBrand, splitPrompt, type ResolvedBrand } from './theme';
import { ImButton, ImCard, ImLink, StatusChip } from './ui';
import { ThemeSwitch } from '@/components/theme-switch';
import { useSceneVideo, type SceneVideo } from './use-scene-video';
import { VideoPrefetch } from './video-prefetch';
import { NarrationBlock, narrationHeading, narrationOf } from '../narration-block';
import { ReviewSummaryView } from '../review-summary';
import { ScaffoldComposer, type ComposedSentence } from '../scaffold-composer';
import { LessonMapDrawer, useLessonNav } from '../navigation';
import { BrandBumper } from '../brand-bumper';
import { bumperPlaysHere } from '../platform-context';

/**
 * Player da plataforma: cabeçalho com a marca, palco escuro com o vídeo (ou a
 * imagem do apresentador) à direita e o painel da cena à esquerda, rodapé com
 * a frase do curso. A sessão e as intenções vêm de `usePlayerSession` (a mesma
 * do visual clássico); aqui só muda a apresentação.
 *
 * Celular (< 768px): vídeo 16:9 no topo, painel abaixo e a ação principal fixa
 * no rodapé da tela. O DOM é um só (os data-testid não se repetem).
 */
/** A chamada é só a pergunta do título com um convite na frente ("Agora é com você: como você…?")? */
export function callRepeatsTitle(call: string, title: string): boolean {
  const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const c = norm(call);
  const t = norm(title);
  return !!t && c.endsWith(t);
}

export function ImmersivePlayer({
  lesson,
  driver,
  exitHref,
  platform,
  player,
}: {
  lesson: Lesson;
  driver: PlayerDriver;
  exitHref: string;
  platform: PlatformContext;
  player: PlayerSession;
}) {
  const brand = useMemo(() => resolveBrand(platform), [platform]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // mapa da aula + atalhos (← cena anterior; Enter/→ continuar)
  const nav = useLessonNav(player);
  const { session, loadError, begin, announce } = player;
  const state = session?.state ?? null;
  // reação da instrutora à resposta (A14): toca uma vez, logo depois da escolha, antes da cena seguinte
  const [reactionDone, setReactionDone] = useState<Carry | null>(null);
  const pendingReaction =
    player.carry?.kind === 'choice' && player.carry.reaction && state && player.carry.nodeId === state.currentNodeId && reactionDone !== player.carry ? player.carry : null;
  const node = state ? findNode(lesson, state.currentNodeId) : undefined;
  const completed = !!state && (state.status === 'completed' || node?.type === 'end');
  const recap = useCourseRecap(platform, lesson, state, `${drawerOpen}:${state?.status ?? ''}`);
  const homeHref = driver.mode === 'lms' ? '/aprender' : exitHref;

  const lessons = platform.lessons.some((l) => l.id === lesson.id)
    ? platform.lessons.map((l) => (l.id === lesson.id && completed ? { ...l, status: 'completed' as const } : l))
    : [{ id: lesson.id, title: lesson.title, status: completed ? ('completed' as const) : ('in_progress' as const), href: '' }];
  const lessonIndex = Math.max(0, lessons.findIndex((l) => l.id === lesson.id));
  const nextLesson = lessons[lessonIndex + 1];

  const frame: FrameInfo = {
    lessonTitle: lesson.title,
    lessons,
    lessonIndex,
    exitHref,
    shortLabel: shortLessonLabel(lesson),
    posterUrl: platform.posterUrl,
    presenterPlacement: platform.presenterPlacement ?? 'center',
    brand,
    narrationTitle: narrationHeading(brand.presenterName, platform.presenterPronoun),
    nav: {
      openMap: nav.openMap,
      mapOpen: nav.mapOpen,
      canGoBack: player.canGoBack,
      pending: player.pending,
      onBack: () => void player.goBack(),
      // reiniciar a aula a qualquer momento (abandona a tentativa aberta e começa do zero)
      ...(driver.restart ? { onRestart: () => void player.restart({ midway: true }) } : {}),
    },
    // vinheta da marca no fim: a do curso ou a padrão do workspace, só nas aulas em que deve tocar
    ...(bumperPlaysHere(platform.bumper) ? { bumper: platform.bumper } : {}),
  };

  return (
    <div
      data-immersive-root
      data-testid="immersive-player"
      style={brand.style}
      className="theme-platform flex min-h-dvh flex-col bg-bg text-fg"
    >
      <PlatformHeader brand={brand} homeHref={homeHref} onOpenRecap={() => setDrawerOpen(true)} drawerOpen={drawerOpen} />

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {/* próximos vídeos já baixando enquanto o atual toca (sem espera na troca) */}
      <VideoPrefetch lesson={lesson} currentNodeId={state?.currentNodeId} />

      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col md:px-6">
        {loadError ? (
          <StageShell frame={frame} percent={0} nodeId="load-error" nodeType="unknown" testId="player-load-error">
            <PanelHead chip={{ label: 'Aviso', tone: 'danger' }} title="Não foi possível abrir a aula." />
            <p role="alert" className="mt-4 text-lg text-fg/80">
              {loadError}
            </p>
            <div className="mt-8">
              <ImButton onClick={() => void begin(() => driver.start())}>Tentar de novo</ImButton>
            </div>
          </StageShell>
        ) : !session ? (
          <StageShell frame={frame} percent={0} nodeId="loading" nodeType="loading" busy>
            <p role="status" className="text-lg text-fg/75">
              Carregando aula…
            </p>
          </StageShell>
        ) : pendingReaction?.kind === 'choice' && pendingReaction.reaction ? (
          <ReactionScene
            key={`reacao:${pendingReaction.nodeId}:${pendingReaction.optionLabel}`}
            frame={frame}
            percent={session.progress.percent}
            reaction={pendingReaction.reaction}
            optionLabel={pendingReaction.optionLabel}
            autoPlay={player.gesture}
            onDone={() => setReactionDone(pendingReaction)}
          />
        ) : (
          <Scene
            key={`${node?.id ?? state!.currentNodeId}:${session.attemptNumber}`}
            lesson={lesson}
            node={node}
            state={session.state}
            progress={session.progress}
            completed={completed}
            player={player}
            frame={frame}
            canRestart={!!driver.restart}
            nextLesson={completed && nextLesson && nextLesson.href ? nextLesson : undefined}
            recap={recap}
            onOpenRecap={() => setDrawerOpen(true)}
          />
        )}
      </div>

      {brand.tagline ? (
        <footer className="px-4 py-4 text-center text-sm text-fg-muted md:py-[18px]">{brand.tagline}</footer>
      ) : (
        <div aria-hidden="true" className="h-6 md:h-14" />
      )}

      <RecapDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} recap={recap} />
      <LessonMapDrawer
        platform
        open={nav.mapOpen}
        onClose={nav.closeMap}
        lesson={lesson}
        state={state}
        progress={session?.progress ?? null}
        canGoBack={player.canGoBack}
        backBlocked={player.backBlocked}
        pending={player.pending}
        onGoTo={(i) => player.goBack(i)}
        onRestart={driver.restart ? () => player.restart({ midway: !completed }) : undefined}
        lessonsHref={exitHref}
        studioHref={platform.studioHref}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho                                                                 */
/* ------------------------------------------------------------------------ */

function PlatformHeader({ brand, homeHref, onOpenRecap, drawerOpen }: { brand: ResolvedBrand; homeHref: string; onOpenRecap: () => void; drawerOpen: boolean }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1920px] items-center justify-between gap-3 px-4 md:grid md:h-[72px] md:grid-cols-[1fr_auto_1fr] md:px-10">
      <Link
        href={homeHref}
        className="inline-flex min-h-11 min-w-0 items-center rounded-lg text-[26px] font-semibold leading-none tracking-[-0.035em] text-fg lowercase md:text-[32px]"
        aria-label={`${brand.wordmark}: início`}
      >
        <span className="truncate">{brand.wordmark}</span>
        <span aria-hidden="true" className="text-[var(--im-accent-ink)]">
          .
        </span>
      </Link>
      <p className="hidden truncate text-center text-[17px] text-fg/70 md:block">{brand.subtitle}</p>
      <div className="flex items-center justify-end gap-2 md:gap-3">
        <ThemeSwitch />
        <button
          type="button"
          onClick={onOpenRecap}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          data-testid="open-recap"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-[12px] border border-line-strong px-3 text-[15px] font-medium text-fg hover:border-fg/40 hover:bg-fg/5 md:px-5"
        >
          <FileText className="size-5" aria-hidden="true" />
          <span className="max-md:sr-only">Meu roteiro</span>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------ */
/* Palco                                                                     */
/* ------------------------------------------------------------------------ */

interface FrameInfo {
  lessonTitle: string;
  lessons: PlatformContext['lessons'];
  lessonIndex: number;
  exitHref: string;
  /** rótulo curto da aula ("Sua apresentação") */
  shortLabel: string;
  posterUrl?: string;
  /** vídeos com a apresentadora já ao lado (`right`/`left`) ocupam o palco inteiro */
  presenterPlacement: 'center' | 'right' | 'left';
  brand: ResolvedBrand;
  /** título do bloco com a fala escrita ("O que a Marina diz") */
  narrationTitle: string;
  /** mapa da aula e "Cena anterior" */
  nav?: { openMap(): void; mapOpen: boolean; canGoBack: boolean; pending: boolean; onBack(): void; onRestart?(): void };
  /** vinheta da marca a tocar no palco quando a aula termina (já filtrada por `playOn`) */
  bumper?: PlatformContext['bumper'];
}

/** Moldura do palco sem cena (carregando / erro): mesma geometria, sem vídeo. */
function StageShell({
  frame,
  percent,
  nodeId,
  nodeType,
  testId,
  busy,
  children,
}: {
  frame: FrameInfo;
  percent: number;
  nodeId: string;
  nodeType: string;
  testId?: string;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} data-node-id={nodeId} data-node-type={nodeType} aria-busy={busy || undefined} className={stageClass(false)}>
      <StageTopNav frame={frame} percent={percent} />
      <StageMedia frame={frame} video={null} />
      <PanelArea hasControls={false}>{children}</PanelArea>
    </section>
  );
}

function stageClass(hasControls: boolean) {
  return cn(
    'relative flex flex-col md:overflow-hidden md:rounded-[20px] md:border md:border-line md:bg-[var(--im-stage)]',
    // palco = viewport menos cabeçalho (72) e rodapé (56); cresce se a cena pedir mais
    'md:min-h-[max(560px,calc(100dvh-128px))]',
    hasControls && 'md:pb-28',
  );
}

/** Botão redondo só com ícone; o nome aparece ao passar o mouse ou focar (e é o rótulo acessível). */
function RoundIconButton({ label, onClick, disabled, testId, children, ...rest }: { label: string; onClick(): void; disabled?: boolean; testId?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <span className="group/tip relative inline-flex">
      <button type="button" aria-label={label} onClick={onClick} disabled={disabled} data-testid={testId} className={ROUND_BTN} {...rest}>
        {children}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 whitespace-nowrap rounded-lg bg-[#0f1030]/90 px-2.5 py-1.5 text-[13px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

const ROUND_BTN =
  'inline-grid size-11 place-items-center rounded-full border border-[var(--im-ctrl-line)] bg-[var(--im-ctrl-bg)] text-[var(--im-ctrl-fg)] backdrop-blur-[12px] hover:bg-[var(--im-ctrl-hover)] disabled:opacity-50 focus-visible:outline-3! focus-visible:outline-offset-2! focus-visible:outline-[var(--im-accent-ink)]!';

/**
 * Topo do palco (estilo serviço de vídeo): voltar, "Aula N · título" e três
 * ícones redondos (voltar cena, capítulos, reiniciar). Com o vídeo tocando e o
 * mouse parado, some junto com a barra de controles (`hidden`); volta ao mexer
 * o mouse, tocar, pausar ou ao focar pelo teclado.
 */
function StageTopNav({ frame, percent, hidden = false }: { frame: FrameInfo; percent: number; hidden?: boolean }) {
  const label = `Aula ${frame.lessonIndex + 1} · ${frame.lessonTitle}`;
  return (
    <div
      data-testid="stage-top-nav"
      data-hidden={hidden || undefined}
      className={cn(
        'relative z-20 transition-opacity duration-300 motion-reduce:transition-none',
        hidden && 'opacity-0 pointer-events-none focus-within:pointer-events-auto focus-within:opacity-100',
      )}
    >
      {/* progresso da aula: uma linha fina na borda de cima do palco */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 hidden h-[3px] bg-fg/10 md:block">
        <div className="h-full bg-[var(--im-accent)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
      </div>
      <div className="flex items-center gap-3 px-4 pb-4 pt-2 md:px-8 md:pb-0 md:pt-6 min-[1600px]:pt-8">
        <Link
          href={frame.exitHref}
          aria-label="Voltar para a lista de aulas"
          data-testid="player-lessons-link"
          className={ROUND_BTN}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="m-0 min-w-0 text-[15px]! font-semibold! leading-tight! tracking-normal! text-fg! md:text-base!">
          <span className="block truncate" title={label}>
            <span className="max-sm:hidden">{label}</span>
            <span className="sm:hidden">Aula {frame.lessonIndex + 1}</span>
          </span>
        </h1>
        {frame.nav && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {frame.nav.canGoBack && (
              <RoundIconButton label="Cena anterior" onClick={frame.nav.onBack} disabled={frame.nav.pending} testId="player-back" aria-keyshortcuts="ArrowLeft">
                <Undo2 className="size-5" aria-hidden="true" />
              </RoundIconButton>
            )}
            <RoundIconButton label="Capítulos" onClick={frame.nav.openMap} testId="open-chapters" aria-haspopup="dialog" aria-expanded={frame.nav.mapOpen}>
              <ListVideo className="size-5" aria-hidden="true" />
            </RoundIconButton>
            {frame.nav.onRestart && (
              <RoundIconButton
                label="Reiniciar aula"
                testId="restart-lesson"
                disabled={frame.nav.pending}
                onClick={() => {
                  if (window.confirm('Reiniciar esta aula do começo? Suas respostas desta vez serão descartadas.')) frame.nav!.onRestart!();
                }}
              >
                <RotateCcw className="size-5" aria-hidden="true" />
              </RoundIconButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vídeo (ou imagem parada) à direita, fundindo com o marinho; legenda do apresentador. */
function StageMedia({ frame, video, bumper, children }: { frame: FrameInfo; video: { el: React.ReactNode; playing: boolean; caption: string | null; hasControls: boolean; /** vídeo tocando: quadro inteiro e limpo */ watching?: boolean } | null; /** vinheta da marca no lugar da mídia (fim da aula) */ bumper?: React.ReactNode; children?: React.ReactNode }) {
  const { brand, posterUrl } = frame;
  const showPresenter = !!brand.presenterName && !bumper;
  // vídeo já montado com a apresentadora ao lado: quadro inteiro, sem a âncora à direita (que só serve ao avatar centralizado)
  const placed = !!video?.el && frame.presenterPlacement !== 'center';
  // tocando: o vídeo já vem dirigido (cartões, câmeras, marca d'água) — ocupa o palco inteiro, sem véu nem recorte
  const watching = !!video?.el && !!video.watching;
  return (
    <div
      className={cn(
        'relative mx-4 aspect-video overflow-hidden rounded-[16px] border border-line bg-[var(--im-media-bg)] md:absolute md:inset-0 md:z-0 md:mx-0 md:aspect-auto md:rounded-none md:border-0',
        // celular sem vídeo nem imagem: não ocupa a tela com um quadro vazio
        !video?.el && !posterUrl && !bumper && 'max-md:hidden',
      )}
    >
      {/* vinheta no fim: ocupa a parte direita do palco (o painel do fim fica à esquerda); celular: o quadro 16:9 inteiro */}
      {bumper && <div data-testid="stage-bumper" className="absolute inset-0 z-[1] md:left-[42%]">{bumper}</div>}
      {/* Fundo do palco inteiro: a mesma imagem, desfocada e escurecida — o "cenário" que aparece atrás do texto. */}
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="" aria-hidden="true" className="absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-[var(--im-backdrop-opacity)] blur-2xl md:block" />
      )}
      {/* Mídia nítida ancorada à direita (apresentador ao lado do texto, como a referência), fundindo à esquerda.
          Vídeo: 84% da largura (corte lateral pequeno); imagem parada: 70%. Celular: 16:9 inteiro. */}
      <div
        data-testid="stage-media"
        data-presenter-placement={video?.el ? frame.presenterPlacement : undefined}
        className={cn('absolute inset-0 transition-[left] duration-300 motion-reduce:transition-none', !watching && !(placed && frame.presenterPlacement === 'left') && 'im-media-fade', video?.el ? (placed || watching ? 'md:left-0' : 'md:left-[16%]') : 'md:left-[30%]')}
      >
        {video?.el ??
          (posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" className="h-full w-full object-cover object-[center_30%]" data-testid="stage-poster" />
          ) : (
            <div aria-hidden="true" className="h-full w-full bg-[image:var(--im-media-empty)]" />
          ))}
      </div>
      {/* legibilidade (referência): fundo do palco cheio à esquerda → 85% em 30% → nada em 60%; topo e base suaves.
          Escuro: marinho. Claro: cinza claro à esquerda (o texto fica no painel branco) e sem véus no topo/base. */}
      {!watching && <div aria-hidden="true" className="absolute inset-0 hidden bg-[image:var(--im-scrim-x)] md:block" />}
      {!watching && <div aria-hidden="true" className="absolute inset-x-0 top-0 hidden h-32 bg-[image:var(--im-scrim-top)] md:block" />}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-[image:var(--im-scrim-bottom)] md:h-48" />

      {video?.caption && (
        <p data-testid="video-captions" className="pointer-events-none absolute inset-x-2 bottom-2 z-10 text-center md:bottom-32 md:left-[50%] md:right-8">
          <span className="inline-block max-w-full rounded-lg bg-[#050A14]/80 px-3 py-1.5 text-[13px] leading-snug text-white md:text-lg">{video.caption}</span>
        </p>
      )}

      {/* legenda do apresentador: no celular o vídeo 16:9 aparece inteiro e a marca d'água do logo fica no canto inferior
          direito do vídeo — a legenda vai para a esquerda; no desktop o vídeo é recortado (object-cover, 84% da largura) e
          fica sob o véu da base e os controles, então a legenda continua à direita, acima da área do logo */}
      {showPresenter && !watching && (
        <p className={cn('im-nametag absolute bottom-3 left-4 z-10 text-left leading-snug md:left-auto md:right-12 md:text-right', video?.hasControls ? 'md:bottom-[7.25rem]' : 'md:bottom-9', video?.caption && 'hidden')}>
          <span className="block text-[15px] font-semibold text-[var(--im-tag-fg)] md:text-[17px]">{brand.presenterName}</span>
          {brand.presenterRole && <span className="block text-[13px] text-[var(--im-tag-muted)] md:text-[15px]">{brand.presenterRole}</span>}
        </p>
      )}
      {children}
    </div>
  );
}

function PanelArea({ hasControls, compact, children }: { hasControls: boolean; /** vídeo tocando: etiqueta pequena no canto, sem cobrir a cena */ compact?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative z-10 flex-1 px-4 pt-7 md:flex md:px-16 md:py-6 min-[1600px]:py-10',
        compact ? 'md:pointer-events-none md:items-end md:px-6 md:pb-28' : cn('md:items-center', hasControls ? 'md:pb-6' : 'md:pb-14'),
      )}
    >
      {/* vídeo tocando: sem o painel branco do tema claro (no desktop não há nada visível aqui; o atalho fica na barra) */}
      <div className={cn('w-full', compact ? 'md:pointer-events-auto md:max-w-[340px]' : 'im-panel max-w-[600px] min-[1700px]:max-w-[680px]')}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Reação da instrutora à resposta (A14)                                     */
/* ------------------------------------------------------------------------ */

/**
 * Vídeo curto (5 a 10 s) da instrutora reagindo à opção escolhida, no palco
 * inteiro, antes da cena seguinte. Toca sozinho depois do clique em "Confirmar
 * escolha"; sem gesto (ou com o navegador bloqueando), o aluno toca ou pula.
 * Ao terminar, falhar ou pular, segue para a cena seguinte, que mostra "Sua
 * escolha" com ▶ Assistir.
 */
function ReactionScene({
  frame,
  percent,
  reaction,
  optionLabel,
  autoPlay,
  onDone,
}: {
  frame: FrameInfo;
  percent: number;
  reaction: { text: string; media: NonNullable<ReturnType<typeof videoMediaOf>> };
  optionLabel: string;
  autoPlay: boolean;
  onDone: () => void;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const video = useSceneVideo(null, { ...reaction.media, transcript: reaction.media.transcript ?? reaction.text }, autoPlay);
  const playing = video.playing;
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  // acabou ou o vídeo não carrega: segue (a reação nunca prende o aluno)
  useEffect(() => {
    if (video.phase === 'ended' || !video.active) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.phase, video.active]);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  const videoEl = video.active ? (
    <video
      {...video.videoProps}
      aria-label="Reação da instrutora à sua resposta"
      className={cn('h-full w-full object-cover', frame.presenterPlacement === 'right' && 'object-[70%_50%]', frame.presenterPlacement === 'left' && 'object-[30%_50%]')}
      poster={frame.posterUrl}
    >
      {video.captionsSrc && <track kind="captions" srcLang={reaction.media.captions?.lang ?? 'pt-BR'} label="Português" src={video.captionsSrc} default />}
    </video>
  ) : null;
  return (
    <section ref={stageRef} data-testid="reaction-scene" data-phase={video.phase} aria-labelledby={headingId} className={stageClass(true)}>
      <StageTopNav frame={frame} percent={percent} hidden={playing} />
      <StageMedia frame={frame} video={{ el: videoEl, playing, caption: video.caption, hasControls: true, watching: playing }} />
      <ControlBar
        video={video}
        fullscreenTarget={stageRef}
        skip={{ label: 'Pular', onClick: finish, testId: 'reaction-skip' }}
        className="mx-4 mt-2 md:absolute md:inset-x-6 md:bottom-6 md:z-20 md:mx-0 md:mt-0"
      />
      <PanelArea hasControls compact={playing}>
        <ImCard data-testid="reaction-card" className={cn(playing && 'md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none')}>
          <h2 ref={headingRef} id={headingId} tabIndex={-1} className={cn('rounded-md text-[17px] font-semibold leading-snug text-fg outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--im-accent-ink)]', playing && 'md:sr-only')}>
            {frame.brand.presenterName ? `${frame.brand.presenterName} comenta a sua resposta` : 'Comentário sobre a sua resposta'}
          </h2>
          {!playing && (
            <>
              <p className="mt-1 text-[15px] leading-snug text-fg/75">Você escolheu: {optionLabel}</p>
              <ActionBar>
                <ImButton size="xl" data-testid="reaction-play" onClick={() => video.play()}>
                  <Play className="size-5 fill-current" aria-hidden="true" /> Assistir
                </ImButton>
                <ImButton size="xl" variant="outline" data-testid="reaction-continue" onClick={finish}>
                  Continuar
                </ImButton>
              </ActionBar>
            </>
          )}
        </ImCard>
      </PanelArea>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Cena                                                                      */
/* ------------------------------------------------------------------------ */

function Scene({
  lesson,
  node,
  state,
  progress,
  completed,
  player,
  frame,
  canRestart,
  nextLesson,
  recap,
  onOpenRecap,
}: {
  lesson: Lesson;
  node: AnyNode | undefined;
  state: AttemptState;
  progress: ProgressSummary;
  completed: boolean;
  player: PlayerSession;
  frame: FrameInfo;
  canRestart: boolean;
  nextLesson?: { id: string; title: string; href: string };
  recap: CourseRecap | null;
  onOpenRecap: () => void;
}) {
  const { pending, fieldError, stepError, inflight, retrySend, conflict, setConflict, carry, retry, gesture, send, restart } = player;
  const stageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const capable = node && !completed && isVideoCapable(node) ? node : null;
  const media = capable ? videoMediaOf(capable) : null;
  const carryHere = carry && carry.nodeId === state.currentNodeId ? carry : null;
  // logo depois de responder: a cena seguinte mostra primeiro "Sua escolha" + o retorno, e o vídeo espera o
  // "Assistir" (sem isso o vídeo tocava sozinho por cima e o retorno só aparecia no fim dele)
  const holdForCarry = !!carryHere && !!capable && capable.type !== 'choice';
  const video = useSceneVideo(capable, media, gesture && !holdForCarry);
  const hasControls = video.active;
  const playing = video.playing;
  // "Pular vídeo"/"Responder agora": o aluno pediu o painel inteiro (mesmo com o vídeo pausado no meio)
  const [expanded, setExpanded] = useState(false);
  // vídeo começado e pausado no meio (cena sem pergunta): continua compacto para não cobrir o que o vídeo mostra
  const watching = !completed && video.active && (playing || (video.phase === 'paused' && !expanded && node?.type !== 'choice'));
  const retryHere = retry && retry.nodeId === state.currentNodeId ? retry : null;
  const endNode = node?.type === 'end' ? node : null;
  // vinheta da marca: toca no palco junto com o painel do fim (nunca bloqueia o encerramento)
  const bumperEl = completed && frame.bumper ? <BrandBumper bumper={frame.bumper} gesture={gesture} variant="stage" /> : null;
  // "Resultado da simulação": decisões desta aula revisadas a partir das respostas da tentativa
  const review = useMemo<ReviewSummary | null>(
    () => (node?.type === 'content' && node.reviewNodeIds?.length ? resolveReview(lesson.graph, node.reviewNodeIds, state) : null),
    [node, lesson.graph, state],
  );

  // Foco no título a cada cena (sem rolar a página); no celular, garante o palco à vista.
  useEffect(() => {
    const h = headingRef.current;
    if (h) h.focus({ preventScroll: true });
    const s = stageRef.current;
    if (!s) return;
    const r = s.getBoundingClientRect();
    if (r.top < -8) s.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  // "Responder agora": pausa e leva o foco ao título da pergunta.
  // estilo serviço de vídeo: tocando e com o mouse parado por 2,5 s, topo e controles somem; mexer, tocar ou teclar traz de volta
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (playing) idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setIdle(false);
    if (playing) idleTimer.current = setTimeout(() => setIdle(true), 2500);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [playing]);
  const chromeHidden = playing && idle;

  const answerNow = () => {
    setExpanded(true);
    video.pause();
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  // Ao terminar o vídeo, a pergunta aparece: foco no título.
  useEffect(() => {
    if (video.phase === 'ended') headingRef.current?.focus({ preventScroll: true });
  }, [video.phase]);

  const videoEl = video.active ? (
    <video
      {...video.videoProps}
      aria-label={media?.alt ?? 'Vídeo da cena'}
      // posicionada: em palcos mais estreitos que 16:9, o recorte preserva o lado da apresentadora
      className={cn('h-full w-full object-cover', frame.presenterPlacement === 'right' && 'object-[70%_50%]', frame.presenterPlacement === 'left' && 'object-[30%_50%]')}
      poster={frame.posterUrl}
    >
      {video.captionsSrc && <track kind="captions" srcLang={media?.captions?.lang ?? 'pt-BR'} label="Português" src={video.captionsSrc} default />}
    </video>
  ) : null;

  const percent = completed ? 100 : progress.percent;

  let panel: React.ReactNode;
  if (!node) {
    panel = (
      <>
        <PanelHead ref={headingRef} id={headingId} chip={{ label: 'Aviso', tone: 'warm' }} title="Etapa não encontrada" />
        <p className="mt-4 text-lg text-fg/80">Esta etapa não existe mais nesta versão da aula. Volte ao curso e tente novamente.</p>
        <div className="mt-8">
          <ImLink href={frame.exitHref}>Voltar ao curso</ImLink>
        </div>
      </>
    );
  } else if (completed) {
    panel = (
      <EndPanel
        headingRef={headingRef}
        headingId={headingId}
        node={endNode}
        carry={carryHere}
        exitHref={frame.exitHref}
        nextLesson={nextLesson}
        canRestart={canRestart}
        pending={pending}
        onRestart={() => void restart()}
        hasRecap={!!recap}
        onOpenRecap={onOpenRecap}
      />
    );
  } else if (watching) {
    // vídeo no palco inteiro: no desktop, nada por cima da cena (o atalho vai para a barra de controles; o título fica só
    // para leitores de tela). No celular, o vídeo fica em cima e este cartão curto embaixo.
    panel = (
      <ImCard data-testid="video-watching" className="md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="rounded-md text-[17px] font-semibold leading-snug text-fg outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--im-accent-ink)] md:sr-only">
          {node.title ?? NODE_TYPE_LABELS[node.type]}
        </h2>
        <div className="md:hidden">
          <p className="mt-1 text-[15px] leading-snug text-fg/75">
            {node.type === 'choice' ? 'A pergunta aparece quando o vídeo terminar.' : 'Você continua quando o vídeo terminar.'}
          </p>
          <button
            type="button"
            onClick={answerNow}
            data-testid={node.type === 'choice' ? 'video-answer-now' : 'video-skip'}
            className="mt-1 inline-flex min-h-11 items-center rounded text-[15px] font-semibold text-fg underline decoration-fg/40 underline-offset-4 hover:decoration-[var(--im-accent-line)]"
          >
            {node.type === 'choice' ? 'Responder agora' : 'Pular vídeo'}
          </button>
        </div>
      </ImCard>
    );
  } else {
    panel = (
      <NodePanel
        node={node}
        headingRef={headingRef}
        headingId={headingId}
        carry={carryHere}
        retry={retryHere}
        pending={pending}
        fieldError={fieldError}
        onSend={send}
        video={video.active ? video : null}
        narrationTitle={frame.narrationTitle}
        review={review}
      />
    );
  }

  return (
    <>
      <section
        ref={stageRef}
        data-testid="player-node"
        data-node-id={node?.id ?? state.currentNodeId}
        data-node-type={node?.type ?? 'unknown'}
        data-phase={video.active ? video.phase : undefined}
        aria-labelledby={headingId}
        data-chrome={chromeHidden ? 'hidden' : undefined}
        onPointerMove={wake}
        onPointerDown={wake}
        onKeyDown={wake}
        className={cn(stageClass(hasControls), chromeHidden && 'md:cursor-none')}
      >
        <StageTopNav frame={frame} percent={percent} hidden={chromeHidden} />
        <StageMedia frame={frame} video={{ el: videoEl, playing, caption: video.caption, hasControls, watching }} bumper={bumperEl}>
          {video.buffering && (
            <p role="status" className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050A14]/80 px-4 py-2 text-sm text-white md:left-[62%]">
              Carregando vídeo…
            </p>
          )}
        </StageMedia>
        {hasControls && <ControlBar video={video} fullscreenTarget={stageRef} skip={watching && node ? { label: node.type === 'choice' ? 'Responder agora' : 'Pular vídeo', onClick: answerNow, testId: node.type === 'choice' ? 'video-answer-now-bar' : 'video-skip-bar' } : undefined} className={cn('mx-4 mt-2 transition-opacity duration-300 motion-reduce:transition-none md:absolute md:inset-x-6 md:bottom-6 md:z-20 md:mx-0 md:mt-0', chromeHidden && 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100')} />}
        <PanelArea hasControls={hasControls} compact={watching}>
          {conflict && (
            <ImCard role="status" data-testid="player-conflict" className="mb-6 flex items-start justify-between gap-3 py-3 text-sm text-fg/85 md:py-3">
              <span>Esta aula avançou em outra aba. Continuamos do ponto atual.</span>
              <button type="button" className="min-h-6 shrink-0 rounded text-fg/80 underline underline-offset-2 hover:text-fg" onClick={() => setConflict(false)}>
                Fechar
              </button>
            </ImCard>
          )}
          {stepError && (
            <ImCard role="alert" className="mb-6 border-danger/40 text-danger">
              <p className="font-semibold">Não foi possível enviar sua resposta.</p>
              <p className="mt-1 text-sm">{stepError}</p>
              {inflight && (
                <ImButton variant="outline" size="sm" className="mt-3" onClick={retrySend} disabled={pending}>
                  Tentar de novo
                </ImButton>
              )}
            </ImCard>
          )}
          {panel}
        </PanelArea>
      </section>

      {completed && endNode && recap && endNode.recap && endNode.recap.length > 0 && (
        <div className="mx-auto mt-8 w-full max-w-[880px] space-y-8 px-4 md:mt-12 md:px-0">
          <RecapView items={recap.items} title={recap.title} variant="page" headingLevel={2} className="border-line bg-bg-2" />
          {recap.closingLine && (
            <p data-testid="recap-closing-line" className="border-l-4 border-[var(--im-accent-line)] py-2 pl-5 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[40px]">
              {recap.closingLine}
            </p>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho do painel: pílula de estado + título grande                     */
/* ------------------------------------------------------------------------ */

/** Rótulos que só repetem o tipo da etapa: não aparecem para o aluno. */
const SILENT_CHIPS = new Set(['Cena', 'Entenda', 'Sua vez', 'Fim', 'Assista', 'Etapa']);

function PanelHead({
  ref,
  id,
  chip,
  title,
  aside,
}: {
  ref?: React.Ref<HTMLHeadingElement>;
  id?: string;
  chip: ReturnType<typeof chipFor>;
  title: string;
  aside?: React.ReactNode;
}) {
  // o selo só aparece quando informa algo (Dica, Opcional, Resultado, Feedback, Aviso); o tipo da etapa ("Cena", "Sua vez"…) não
  const showChip = !SILENT_CHIPS.has(chip.label);
  return (
    <div>
      {(showChip || aside) && (
        <div className="mb-5 flex flex-wrap items-center gap-3 min-[1600px]:mb-7">
          {showChip && <StatusChip chip={chip} />}
          {aside}
        </div>
      )}
      <h2
        id={id}
        ref={ref}
        tabIndex={-1}
        // sem cn(): o tailwind-merge descartaria o leading ao lado do tamanho de texto
        className={`rounded-md font-medium! tracking-[-0.02em]! text-fg outline-none focus-visible:outline-3! focus-visible:outline-offset-4! focus-visible:outline-[var(--im-accent-ink)]! ${headingSize(title)} leading-[1.08]!`}
      >
        {title}
      </h2>
    </div>
  );
}

/** Ação principal fixa no rodapé da tela no celular; em linha no desktop. */
function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mt-8 grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-2 md:gap-4 min-[1600px]:mt-12',
        'max-md:sticky max-md:bottom-0 max-md:z-30 max-md:-mx-4 max-md:border-t max-md:border-line max-md:bg-[var(--im-sticky)] max-md:px-4 max-md:py-3 max-md:backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

const BODY = 'text-[18px] leading-relaxed text-fg/80 [&_li]:marker:text-fg-muted';

/* ------------------------------------------------------------------------ */
/* Painéis por tipo de cena                                                  */
/* ------------------------------------------------------------------------ */

interface PanelProps {
  headingRef: React.Ref<HTMLHeadingElement>;
  headingId: string;
  pending: boolean;
  fieldError: string | null;
  onSend: (intent: PlayerIntent) => void;
}

function NodePanel({
  node,
  carry,
  retry,
  video,
  narrationTitle,
  review,
  ...p
}: PanelProps & { node: AnyNode; carry: Carry | null; retry: RetryInfo | null; video: SceneVideo | null; narrationTitle: string; review: ReviewSummary | null }) {
  // Fala escrita: sem vídeo pronto, aberta ("O que a Marina diz"); com vídeo, recolhida ("Ler a fala").
  const narration = narrationOf(node);
  const spoken = narration ? <NarrationBlock key={`${node.id}:${!!video}`} narration={narration} heading={narrationTitle} hasVideo={!!video} className="mt-6" /> : null;
  switch (node.type) {
    case 'choice':
      return <ChoicePanel node={node} carry={carry} spoken={spoken} {...p} />;
    case 'consequence':
      return <FeedbackPanel node={node} carry={carry} spoken={spoken} {...p} />;
    case 'scenario':
    case 'content':
      return <InfoPanel node={node} carry={carry} spoken={spoken} review={review} video={video} {...p} />;
    case 'reflection':
      return node.scaffold ? <ComposePanel node={node} carry={carry} {...p} /> : <ReflectionPanel node={node} carry={carry} {...p} />;
    case 'assessment':
      return <AssessmentPanel node={node} carry={carry} retry={retry} {...p} />;
    default:
      return (
        <>
          <PanelHead ref={p.headingRef} id={p.headingId} chip={chipFor(node, false)} title={node.title ?? NODE_TYPE_LABELS[node.type]} />
          <p className="mt-4 text-lg text-fg/80">Este tipo de etapa ({NODE_TYPE_LABELS[node.type]}) ainda não está disponível. Avise a equipe do curso.</p>
        </>
      );
  }
}

/** Retorno da escolha/avaliação anterior, mostrado na cena seguinte. */
function CarryCard({ carry }: { carry: Carry }) {
  if (carry.kind === 'choice') {
    return (
      <ImCard data-testid="choice-feedback" aria-label="Sua escolha" className="mt-6">
        <p className="eyebrow text-fg/70!">Sua escolha</p>
        <p className="mt-1.5 text-lg font-medium leading-snug text-fg">{carry.optionLabel}</p>
        {carry.feedback && <RichText doc={carry.feedback} className="mt-2 text-base leading-relaxed text-fg/80" />}
      </ImCard>
    );
  }
  const { outcome } = carry;
  return (
    <ImCard data-testid="assessment-feedback" aria-label="Resultado da avaliação" className={cn('mt-6', outcome.passed && 'border-[var(--im-accent-line)]/50')}>
      <p className="eyebrow text-fg/70!">Resultado da avaliação</p>
      <p className={cn('mt-1.5 text-lg font-semibold', outcome.passed ? 'text-[var(--im-accent-ink)]' : 'text-fg')}>{outcome.passed ? 'Correto' : 'Não foi dessa vez'}</p>
      <p className="mt-1 text-sm text-fg/75">
        Você marcou {outcome.correctCount} de {outcome.totalCorrect} {outcome.totalCorrect === 1 ? 'alternativa correta' : 'alternativas corretas'}
        {outcome.attemptsUsed > 1 ? ` em ${outcome.attemptsUsed} tentativas.` : '.'}
      </p>
      {carry.feedback && <RichText doc={carry.feedback} className="mt-2 text-base leading-relaxed text-fg/80" />}
    </ImCard>
  );
}

function ContinueAction({ pending, fieldError, onSend, video }: { pending: boolean; fieldError: string | null; onSend: (i: PlayerIntent) => void; video?: SceneVideo | null }) {
  // cena com vídeo ainda não assistido: o caminho principal é ASSISTIR; seguir sem ver fica como opção secundária
  const watchFirst = !!video && video.phase === 'idle' && !video.blocked;
  return (
    <>
      <FieldError message={fieldError} />
      <ActionBar>
        {watchFirst ? (
          <>
            <ImButton size="xl" data-testid="player-watch" onClick={() => video!.play()} disabled={pending}>
              <Play className="size-5 fill-current" aria-hidden="true" /> Assistir
            </ImButton>
            <ImButton size="xl" variant="outline" data-testid="player-continue" onClick={() => onSend({ kind: 'advance' })} disabled={pending} aria-busy={pending}>
              {pending ? 'Enviando…' : 'Pular vídeo'}
            </ImButton>
          </>
        ) : (
          <ImButton size="xl" data-testid="player-continue" onClick={() => onSend({ kind: 'advance' })} disabled={pending} aria-busy={pending}>
            {pending ? 'Enviando…' : 'Continuar'}
          </ImButton>
        )}
      </ActionBar>
    </>
  );
}

/* ---------------------------- Decisão ----------------------------------- */

type ChoiceMode = 'choose' | 'write' | 'record' | 'match';

/**
 * Decisão: as opções e "Confirmar escolha" são SEMPRE o caminho principal.
 * Resposta aberta (quando a cena liga) é opcional e discreta:
 * - voz: "Treinar em voz alta (opcional)" abaixo das opções; some sem aviso se
 *   o aparelho não grava ou o microfone está bloqueado;
 * - texto (só se `openAnswer.text`): link "Prefere responder do seu jeito?".
 * Depois de gravar/escrever, o aluno aponta a opção mais parecida e segue.
 */
function ChoicePanel({ node, carry, spoken, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { node: ChoiceNode; carry: Carry | null; spoken?: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<ChoiceMode>('choose');
  const [draft, setDraft] = useState<OpenAnswerDraft | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const micAvailable = useMicAvailable();
  const subId = useId();
  const voiceNoteId = useId();
  const oa = node.openAnswer?.enabled && (node.openAnswer.voice || node.openAnswer.text) ? node.openAnswer : null;
  const canVoice = !!oa?.voice && micAvailable && !micBlocked;
  const canWrite = !!oa?.text;
  const { heading, lead, leadDoc } = splitPrompt(node.prompt, node.title ?? 'Sua vez');
  const matchPrompt = oa?.matchPrompt?.trim() || 'Qual destas respostas se parece mais com a sua?';
  const title = mode === 'match' ? matchPrompt : heading;
  // Uma só linha de apoio: o contexto do enunciado (sem a frase de instrução, que duplicaria) + a instrução padrão.
  const context = lead ? stripInstruction(lead) : '';
  const focusHeading = () => requestAnimationFrame(() => (headingRef as React.RefObject<HTMLHeadingElement | null>)?.current?.focus({ preventScroll: true }));

  const toMatch = (d: OpenAnswerDraft) => {
    setDraft(d);
    setSelected(null);
    setMode('match');
    focusHeading();
  };
  const backToOptions = () => {
    setMode(draft ? 'match' : 'choose');
    focusHeading();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (mode === 'match' && draft) onSend({ kind: 'choose', optionId: selected, openAnswer: { text: draft.mode === 'text' ? draft.text : undefined } });
    else onSend({ kind: 'choose', optionId: selected });
  };

  return (
    <div data-testid="choice-panel" data-mode={mode}>
      <PanelHead ref={headingRef} id={headingId} chip={chipFor(node, false)} title={title} />
      {carry && mode === 'choose' && <CarryCard carry={carry} />}

      {mode === 'choose' && (
        <div id={subId} className="mt-4 space-y-3">
          {leadDoc && <RichText doc={leadDoc} className={BODY} />}
          {(() => {
            const call = node.bridge?.call?.trim();
            // quando a chamada termina com a própria pergunta do título, não repete; sem chamada, a instrução padrão
            const instruction = call ? (callRepeatsTitle(call, title) ? null : <span data-testid="choice-call">{call}</span>) : 'Escolha uma resposta.';
            if (!context && !instruction) return null;
            return (
              <p className="text-[18px] leading-snug text-fg/75 md:text-[20px]">
                {context && <span className="text-fg/80">{context} </span>}
                {instruction}
              </p>
            );
          })()}
          {spoken}
        </div>
      )}

      {mode === 'match' && draft && (
        <div id={subId} className="mt-5 space-y-4">
          <ImCard data-testid="open-answer-summary">
            <p className="eyebrow text-fg/70!">{draft.mode === 'voice' ? 'Seu treino' : 'Sua resposta'}</p>
            {draft.mode === 'text' ? (
              <p className="mt-1.5 line-clamp-5 whitespace-pre-wrap text-base leading-relaxed text-fg">{draft.text}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- gravação do próprio aluno */}
                <audio src={draft.url} controls className="w-full" aria-label={`Sua gravação (${clock(draft.seconds)})`} />
                <p className="text-[13px] text-fg/70">Só você ouve: a gravação fica no seu aparelho.</p>
              </div>
            )}
          </ImCard>
          <p className="text-[17px] text-fg/75">Escolha a opção mais próxima do que você disse. O caminho segue por ela.</p>
        </div>
      )}

      {mode === 'write' && (
        <div className="mt-6">
          <WriteAnswer initial={draft?.mode === 'text' ? draft.text : ''} onSubmit={(text) => toMatch({ mode: 'text', text })} onCancel={backToOptions} />
        </div>
      )}

      {mode === 'record' && (
        <div className="mt-6">
          <RecordAnswer
            onSubmit={(d) => toMatch({ mode: 'voice', ...d })}
            onCancel={backToOptions}
            onSwitchToWrite={canWrite ? () => setMode('write') : undefined}
            onUnavailable={
              canWrite
                ? undefined
                : () => {
                    setMicBlocked(true);
                    setMode('choose');
                    focusHeading();
                  }
            }
          />
        </div>
      )}

      {(mode === 'choose' || mode === 'match') && (
        <form onSubmit={submit} className="mt-6 min-[1600px]:mt-8">
          <OptionCards
            options={node.options}
            selected={selected ? [selected] : []}
            onToggle={(id) => setSelected(id)}
            disabled={pending}
            legend={mode === 'match' ? matchPrompt : 'Escolha uma resposta'}
            describedBy={subId}
          />
          {mode === 'choose' && canVoice && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="voice-practice">
              <ImButton size="sm" variant="outline" onClick={() => setMode('record')} data-testid="open-answer-voice" aria-describedby={voiceNoteId}>
                <Mic className="size-4" aria-hidden="true" /> Treinar em voz alta (opcional)
              </ImButton>
              <span id={voiceNoteId} className="text-[14px] text-fg/65">
                Só você ouve. Pode pular.
              </span>
            </div>
          )}
          <FieldError message={fieldError} />
          <ActionBar>
            <ImButton type="submit" size="xl" data-testid="player-submit" disabled={!selected || pending} aria-busy={pending}>
              {pending ? 'Enviando…' : 'Confirmar escolha'}
            </ImButton>
            {mode === 'match' && (
              <ImButton variant="outline" size="xl" onClick={() => setMode(draft?.mode === 'voice' ? 'record' : 'write')} className="max-md:px-4 max-md:text-[15px]">
                {draft?.mode === 'voice' ? 'Gravar de novo' : 'Refazer'}
                <span className="max-md:sr-only">{draft?.mode === 'voice' ? '' : ' minha resposta'}</span>
              </ImButton>
            )}
          </ActionBar>
          {mode === 'choose' && canWrite && (
            <button
              type="button"
              onClick={() => setMode('write')}
              data-testid="open-answer-text-start"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded text-[15px] text-fg/75 underline decoration-fg/30 underline-offset-4 hover:text-fg hover:decoration-[var(--im-accent-line)]"
            >
              <Pencil className="size-4" aria-hidden="true" /> Prefere responder do seu jeito?
            </button>
          )}
        </form>
      )}
    </div>
  );
}

/* ---------------------------- Retorno ----------------------------------- */

function FeedbackPanel({ node, carry, spoken, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { node: ConsequenceNode; carry: Carry | null; spoken?: React.ReactNode }) {
  return (
    <div>
      <PanelHead ref={headingRef} id={headingId} chip={chipFor(node, false)} title={node.title ?? 'O que aconteceu'} />
      {carry && <CarryCard carry={carry} />}
      <RichText doc={node.body} className={cn(BODY, 'mt-5')} />
      {node.guidance && (
        <ImCard className="mt-6">
          <p className="eyebrow text-[var(--im-accent-ink)]!">O que levar disso</p>
          <RichText doc={node.guidance} className="mt-1.5 text-base leading-relaxed text-fg/85" />
        </ImCard>
      )}
      {spoken}
      <ContinueAction pending={pending} fieldError={fieldError} onSend={onSend} />
    </div>
  );
}

/* --------------------------- Conteúdo / dica ---------------------------- */

function InfoPanel({
  node,
  carry,
  spoken,
  review,
  headingRef,
  headingId,
  pending,
  fieldError,
  onSend,
  video,
}: PanelProps & { node: Extract<AnyNode, { type: 'content' | 'scenario' }>; carry: Carry | null; spoken?: React.ReactNode; review?: ReviewSummary | null; video?: SceneVideo | null }) {
  const tip = isTipScene(node);
  return (
    <div>
      <PanelHead ref={headingRef} id={headingId} chip={review ? { label: 'Resultado', tone: 'accent' } : chipFor(node, false)} title={node.title ?? NODE_TYPE_LABELS[node.type]} />
      {carry && <CarryCard carry={carry} />}
      {tip ? <ChecklistBody doc={node.body} /> : <RichText doc={node.body} className={cn(BODY, 'mt-5')} />}
      {review && <ReviewSummaryView review={review} className="mt-6" />}
      {spoken}
      <ContinueAction pending={pending} fieldError={fieldError} onSend={onSend} video={video} />
    </div>
  );
}

function inlineText(content?: Array<{ text: string; marks?: Array<{ type: string }> }>): React.ReactNode {
  return (content ?? []).map((t, i) => {
    let el: React.ReactNode = t.text;
    for (const m of t.marks ?? []) {
      if (m.type === 'bold') el = <strong key={`b${i}`} className="font-semibold text-fg">{el}</strong>;
      if (m.type === 'italic') el = <em key={`i${i}`}>{el}</em>;
    }
    return <span key={i}>{el}</span>;
  });
}

/** Dica: parágrafos normais e listas como linhas de checklist com o check no acento. */
function ChecklistBody({ doc }: { doc: RichTextDocument }) {
  return (
    <div className="mt-5 space-y-4">
      {doc.content.map((b: RichTextBlock, i) => {
        if (b.type === 'bulletList' || b.type === 'orderedList') {
          return (
            <ul key={i} className="space-y-2.5" data-testid="tip-checklist">
              {b.content.map((li, j) => (
                <li key={j} className="flex items-start gap-3.5 rounded-[14px] border border-line bg-[var(--im-card)] px-4 py-3 text-[17px] leading-snug text-fg backdrop-blur-md">
                  <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--im-accent)] text-[var(--im-on-accent)]">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <span className="min-w-0">{li.content.map((p, k) => <span key={k}>{inlineText(p.content)}</span>)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'heading') return <h3 key={i} className="text-lg font-semibold text-fg">{inlineText(b.content)}</h3>;
        return (
          <p key={i} className="text-[18px] leading-relaxed text-fg/80">
            {inlineText(b.content)}
          </p>
        );
      })}
    </div>
  );
}

/* ---------------------------- Reflexão ---------------------------------- */

function ReflectionPanel({ node, carry, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { node: ReflectionNode; carry: Carry | null }) {
  const [text, setText] = useState('');
  const taId = useId();
  const hintId = useId();
  const promptId = useId();
  const ta = useRef<HTMLTextAreaElement>(null);
  const { heading, lead, leadDoc } = splitPrompt(node.prompt, node.title ?? 'Sua vez');
  const len = text.trim().length;
  const tooShort = len < node.minLength;
  const tooLong = len > node.maxLength;
  // minLength 0: anotação opcional. "Pular" envia texto vazio (o roteiro mostra o texto de vazio).
  const optional = node.minLength === 0;

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, optional ? 120 : 160), 420)}px`;
  }, [text, optional]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !tooLong && !(optional && len === 0)) onSend({ kind: 'reflect', text: text.trim() });
      }}
    >
      <PanelHead ref={headingRef} id={headingId} chip={optional ? { label: 'Opcional', tone: 'neutral' } : chipFor(node, false)} title={heading} />
      {carry && <CarryCard carry={carry} />}
      <div id={promptId} className="mt-4 space-y-3">
        {lead && <p className="text-[18px] leading-relaxed text-fg/80">{lead}</p>}
        {leadDoc && <RichText doc={leadDoc} className={BODY} />}
        {!lead && !leadDoc && <p className="text-[18px] text-fg/75">{optional ? 'Se quiser, use o modelo abaixo. Se não, pule.' : 'Escreva com suas palavras.'}</p>}
      </div>
      <ImCard className="mt-6 p-0 md:p-0">
        <label htmlFor={taId} className="sr-only">
          Sua resposta
        </label>
        <textarea
          id={taId}
          ref={ta}
          data-testid="reflection-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={node.placeholder ?? 'Escreva com suas palavras.'}
          rows={optional ? 3 : 5}
          maxLength={node.maxLength + 200}
          disabled={pending}
          aria-describedby={`${promptId} ${hintId}`}
          aria-invalid={!!fieldError || tooLong || undefined}
          className={cn(
            'block w-full resize-none rounded-[16px] bg-transparent px-5 py-4 text-lg leading-relaxed text-fg outline-none! placeholder:text-fg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--im-accent-ink)]',
            optional ? 'min-h-30' : 'min-h-40',
          )}
        />
        <p id={hintId} className="flex flex-wrap items-center justify-between gap-2 border-t border-fg/10 px-5 py-2.5 text-[13px] text-fg/70">
          <span>{optional ? 'Opcional. Vai para o seu roteiro; não vale nota.' : 'Fica registrada para você e para a equipe; não é avaliada automaticamente.'}</span>
          <span className={cn('tabular-nums', tooLong && 'text-danger', !tooLong && !tooShort && len > 0 && 'text-[var(--im-accent-ink)]')}>
            {len}/{node.maxLength}
            {node.minLength > 0 && tooShort && ` · mínimo ${node.minLength}`}
          </span>
        </p>
      </ImCard>
      <FieldError message={fieldError} />
      <ActionBar>
        <ImButton type="submit" size="xl" data-testid="player-submit" disabled={tooShort || tooLong || pending || (optional && len === 0)} aria-busy={pending}>
          {pending ? 'Enviando…' : 'Salvar e continuar'}
        </ImButton>
        {optional && (
          <ImButton variant="outline" size="xl" data-testid="player-skip" disabled={pending} onClick={() => onSend({ kind: 'reflect', text: '' })}>
            Pular
          </ImButton>
        )}
      </ActionBar>
    </form>
  );
}

/* ------------------------- Composição guiada ---------------------------- */

/**
 * "Monte sua frase": blocos prontos para tocar (sem campo em branco). "Usar esta
 * frase" envia a frase montada pela intenção `reflect`; "Pular" quando opcional.
 */
function ComposePanel({ node, carry, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { node: ReflectionNode; carry: Carry | null }) {
  const [sentence, setSentence] = useState<ComposedSentence>({ text: '', complete: false });
  const optional = node.minLength === 0;
  const lead = richTextToPlain(node.prompt).trim();
  const tooLong = sentence.text.length > node.maxLength;
  const ready = sentence.complete && !tooLong && sentence.text.length >= node.minLength;
  return (
    <form
      data-testid="compose-panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSend({ kind: 'reflect', text: sentence.text });
      }}
    >
      <PanelHead ref={headingRef} id={headingId} chip={optional ? { label: 'Opcional', tone: 'neutral' } : chipFor(node, false)} title={node.title?.trim() || 'Monte sua frase'} />
      {carry && <CarryCard carry={carry} />}
      {lead && <p className="mt-4 text-[18px] leading-relaxed text-fg/80">{lead}</p>}
      <ScaffoldComposer scaffold={node.scaffold!} disabled={pending} onChange={setSentence} className="mt-6" />
      {tooLong && (
        <p role="alert" className="mt-3 text-sm text-danger">
          A frase passou de {node.maxLength} caracteres. Encurte uma das partes.
        </p>
      )}
      <FieldError message={fieldError} />
      <ActionBar>
        <ImButton type="submit" size="xl" data-testid="player-submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? 'Enviando…' : 'Usar esta frase'}
        </ImButton>
        {optional && (
          <ImButton variant="outline" size="xl" data-testid="player-skip" disabled={pending} onClick={() => onSend({ kind: 'reflect', text: '' })}>
            Pular
          </ImButton>
        )}
      </ActionBar>
    </form>
  );
}

/* ---------------------------- Avaliação --------------------------------- */

function AssessmentPanel({ node, carry, retry, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { node: AssessmentNode; carry: Carry | null; retry: RetryInfo | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const subId = useId();
  const multiple = node.mode === 'multiple';
  const { heading, lead, leadDoc } = splitPrompt(node.prompt, node.title ?? 'Sua vez');
  const toggle = (id: string) => setSelected((prev) => (multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length > 0) onSend({ kind: 'assess', optionIds: selected });
      }}
    >
      <PanelHead ref={headingRef} id={headingId} chip={chipFor(node, false)} title={heading} />
      {carry && <CarryCard carry={carry} />}
      <div id={subId} className="mt-4 space-y-3">
        {lead && <p className="text-[18px] leading-relaxed text-fg/80">{lead}</p>}
        {leadDoc && <RichText doc={leadDoc} className={BODY} />}
        <p className="text-[18px] text-fg/75">{multiple ? 'Pode haver mais de uma alternativa correta.' : 'Marque uma alternativa.'}</p>
      </div>
      <div className="mt-7">
        <OptionCards
          options={node.options}
          selected={selected}
          onToggle={toggle}
          multiple={multiple}
          disabled={pending}
          legend={multiple ? 'Marque todas as alternativas corretas' : 'Marque a alternativa correta'}
          describedBy={subId}
        />
      </div>
      {retry && (
        <ImCard data-testid="assessment-result" role="status" className="mt-6">
          <p className="text-lg font-semibold text-fg">Ainda não.</p>
          <p className="mt-1 text-sm text-fg/75">
            Você marcou {retry.outcome.correctCount} de {retry.outcome.totalCorrect} {retry.outcome.totalCorrect === 1 ? 'alternativa correta' : 'alternativas corretas'}. Revise e responda de novo.
          </p>
          {(retry.feedback ?? node.feedbackFailed) && <RichText doc={retry.feedback ?? node.feedbackFailed} className="mt-2 text-base leading-relaxed text-fg/85" />}
          <p className="mt-2 text-sm font-medium text-fg">Tentativas restantes: {retry.outcome.attemptsLeft}</p>
        </ImCard>
      )}
      <FieldError message={fieldError} />
      <ActionBar>
        <ImButton type="submit" size="xl" data-testid="player-submit" disabled={selected.length === 0 || pending} aria-busy={pending}>
          {pending ? 'Enviando…' : retry ? 'Responder de novo' : 'Responder'}
        </ImButton>
      </ActionBar>
    </form>
  );
}

/* ---------------------------- Encerramento ------------------------------ */

function EndPanel({
  headingRef,
  headingId,
  node,
  carry,
  exitHref,
  nextLesson,
  canRestart,
  pending,
  onRestart,
  hasRecap,
  onOpenRecap,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  headingId: string;
  node: EndNode | null;
  carry: Carry | null;
  exitHref: string;
  nextLesson?: { id: string; title: string; href: string };
  canRestart: boolean;
  pending: boolean;
  onRestart: () => void;
  hasRecap: boolean;
  onOpenRecap: () => void;
}) {
  const ownRecap = !!node?.recap && node.recap.length > 0;
  return (
    <div data-testid="player-completed">
      <PanelHead ref={headingRef} id={headingId} chip={{ label: 'Fim', tone: 'accent' }} title={node?.title?.trim() || 'Você chegou ao fim desta aula.'} />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--im-accent)] px-3 py-1 text-sm font-semibold text-[var(--im-on-accent)]">
          <Check className="size-4" strokeWidth={3} aria-hidden="true" /> Aula concluída
        </span>
        {node?.outcomeLabel && node.outcomeLabel !== 'Aula concluída' && (
          <span className="inline-flex items-center rounded-full border border-line-strong bg-fg/5 px-3 py-1 text-sm font-medium text-fg/85">{node.outcomeLabel}</span>
        )}
      </div>
      {carry && <CarryCard carry={carry} />}
      {node && <RichText doc={node.summary} className={cn(BODY, 'mt-5')} />}
      {!ownRecap && node?.closingLine && <p className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[32px]">{node.closingLine}</p>}
      {ownRecap && <p className="mt-5 text-base text-fg/75">Seu roteiro está logo abaixo: copie ou imprima quando quiser.</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {nextLesson ? (
          <ImLink href={nextLesson.href} data-testid="next-lesson-link">
            Próxima aula
          </ImLink>
        ) : (
          <ImLink href={exitHref}>Voltar ao curso</ImLink>
        )}
        {nextLesson && (
          <ImLink href={exitHref} variant="outline">
            Voltar ao curso
          </ImLink>
        )}
        {!ownRecap && hasRecap && (
          <ImButton variant="outline" onClick={onOpenRecap}>
            <FileText className="size-5" aria-hidden="true" /> Meu roteiro
          </ImButton>
        )}
        {canRestart && (
          <ImButton variant="ghost" data-testid="player-restart" onClick={onRestart} disabled={pending} aria-busy={pending}>
            <RotateCcw className="size-4" aria-hidden="true" /> {pending ? 'Enviando…' : 'Fazer de novo'}
          </ImButton>
        )}
      </div>
    </div>
  );
}

/** Remove do contexto a frase de instrução ("Escolha como você responderia.") — o subtítulo padrão já instrui. */
function stripInstruction(text: string): string {
  return text
    .split(/(?<=[.!?…]["”»)]?)\s+/u)
    .filter((x) => !/^(escolha|marque|selecione|aponte|responda)\b/i.test(x.trim()))
    .join(' ')
    .trim();
}

/**
 * Rótulo da aula na barra: `shortTitle` (se o curso tiver), senão o título inteiro.
 * Cortar em 3 palavras gerava rótulos sem sentido ("Você tem mais"); o corte agora é
 * visual (reticências por CSS), e o título completo fica no leitor de tela e no mapa.
 */
function shortLessonLabel(lesson: Lesson): string {
  const explicit = (lesson as Lesson & { shortTitle?: string }).shortTitle?.trim();
  return explicit || lesson.title.trim();
}

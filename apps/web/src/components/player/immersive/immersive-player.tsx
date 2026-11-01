'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Award, BookOpen, Check, CircleCheck, Copy, FileText, Flag, Footprints, ListChecks, ListVideo, Maximize, Mic, Minimize, MousePointerClick, Pause, Pencil, Play, RotateCcw, Target, Undo2 } from 'lucide-react';
import { resolveReview, type AttemptState, type ProgressSummary, type ReviewSummary } from '@lms/course-engine';
import {
  MISSION_LABELS,
  MISSION_NOTE_MAX,
  NODE_TYPE_LABELS,
  callHostId,
  questionVideoFollows,
  questionVideoSkipped,
  richTextToPlain,
  type AnyNode,
  type AssessmentNode,
  type ChoiceNode,
  type ConsequenceNode,
  type EndNode,
  type Lesson,
  type MissionNode,
  type ReflectionNode,
  type RichTextBlock,
  type RichTextDocument,
} from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { RichText } from '@/components/rich-text';
import { RecapView, copyToClipboard } from '../recap-view';
import type { PlatformContext, PlatformSeries, PlayerDriver } from '../types';
import { findNode, prefersReducedMotion, type Carry, type PlayerIntent, type PlayerSession, type RetryInfo } from '../use-player-session';
import { isVideoCapable, videoMediaOf } from '../video-scene';
import { lessonAchievements, practiceChipLabel, realLifeChipLabel, type LessonAchievements } from './achievements';
import { ControlBar } from './controls';
import { ImmersiveFullscreenProvider, useImmersiveFullscreen, useImmersiveFullscreenState } from './fullscreen';
import { OptionCards } from './option-cards';
import { RecordAnswer, WriteAnswer, useMicAvailable, type OpenAnswerDraft } from './open-answer';
import { RecapDrawer, useCourseRecap, type CourseRecap } from './recap-drawer';
import { BRIDGE_BUTTON, BRIDGE_EYEBROW, BRIDGE_LINE, CLOSING_LABEL, LAST_PRACTICE_CHIP, closingCardTitle, closingNodeId as closingNodeIdOf, farewellAfter, isCourseEnd, isLastLessonOfCourse, isLastPractice, missionAckText, missionAfter, missionContinueLabel } from './scene-flow';
import { chipFor, clock, headingSize, isTipScene, resolveBrand, splitPrompt, type ResolvedBrand } from './theme';
import { ImButton, ImCard, ImLink, StatusChip } from './ui';
import { seriesEndChip, seriesEndsTrail, seriesHeaderLabel, seriesNextButton } from './series';
import { TrailSeal } from '@/components/trail-seal';
import { ThemeSwitch } from '@/components/theme-switch';
import { BrandLogo } from '@/components/brand-logo';
import { useSceneVideo, type SceneVideo } from './use-scene-video';
import { VideoPrefetch } from './video-prefetch';
import { NarrationBlock, narrationHeading, narrationOf } from '../narration-block';
import { ReviewSummaryView } from '../review-summary';
import { ScaffoldComposer, type ComposedSentence } from '../scaffold-composer';
import { saveButtonState } from '../compose-state';
import { LessonMapDrawer, useLessonNav } from '../navigation';
import { BrandBumper } from '../brand-bumper';
import { bumperPlaysHere } from '../platform-context';
import { LegalLinks } from '@/components/legal/legal-links';
import { NOTE_PRIVACY_HINT } from '../privacy-hint';

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
  // tela cheia no raiz do player (não desmonta entre cenas, reações, decisões, missão e despedida): ela segue pela aula toda
  const rootRef = useRef<HTMLDivElement>(null);
  const fullscreen = useImmersiveFullscreen(rootRef, platform.enrollmentId ?? lesson.id);
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
  // vinheta da marca: uma vez por aula (sessão), na passagem entre "assistir" e "responder"
  const outroKey = `lms.bumper.played:${lesson.id}`;
  const [outroPlayed, setOutroPlayed] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(outroKey) === '1') setOutroPlayed(true);
    } catch {}
  }, [outroKey]);
  const markOutro = useCallback(() => {
    setOutroPlayed(true);
    try {
      window.sessionStorage.setItem(outroKey, '1');
    } catch {}
  }, [outroKey]);
  // a vinheta fecha o ÚLTIMO vídeo longo da aula (a última cena narrada com vídeo, em geral a explicação): toca no
  // palco inteiro logo que esse vídeo termina (visto até o fim), antes da última pergunta e da atividade. Não toca
  // depois das reações curtas nem do vídeo próprio da pergunta. Quem pulou vê a vinheta no painel final.
  const lastLongId = useMemo(() => lastLongVideoId(lesson), [lesson]);
  const outroArmed = bumperPlaysHere(platform.bumper) && !outroPlayed && !!lastLongId;
  const [outroNow, setOutroNow] = useState(false);
  // a vinheta terminou e o avanço foi pedido: o palco SEGURA o último quadro dela até o motor trocar de cena. Soltar antes
  // remontaria a cena do vídeo longo, e o autoplay de uma instância nova recomeçaria o vídeo durante o `advance`
  const [outroDone, setOutroDone] = useState(false);
  // cena cujo vídeo longo foi visto até o fim: enquanto o aluno estiver nela, nenhuma remontagem a faz tocar sozinha
  const [seenLongId, setSeenLongId] = useState<string | null>(null);
  const onLongVideoEnded = useCallback(() => {
    setSeenLongId(lastLongId ?? null);
    setOutroNow(true);
  }, [lastLongId]);
  const currentId = state?.currentNodeId;
  useEffect(() => {
    // solta o palco quando a cena troca, ou quando o envio terminou sem trocar (falha de rede, conflito): o aluno vê o erro/estado
    if (outroDone && (currentId !== lastLongId || !player.pending)) {
      setOutroNow(false);
      setOutroDone(false);
    }
  }, [outroDone, currentId, lastLongId, player.pending]);
  useEffect(() => {
    if (seenLongId && currentId !== seenLongId) setSeenLongId(null);
  }, [seenLongId, currentId]);
  // o roteiro do curso recarrega ao abrir a gaveta, ao concluir a aula e quando uma missão é registrada
  const recap = useCourseRecap(platform, lesson, state, `${drawerOpen}:${state?.status ?? ''}:${Object.values(player.missions).map((m) => m.status).join(',')}`);
  const homeHref = driver.mode === 'lms' ? '/aprender' : exitHref;

  const lessons = platform.lessons.some((l) => l.id === lesson.id)
    ? platform.lessons.map((l) => (l.id === lesson.id && completed ? { ...l, status: 'completed' as const } : l))
    : [{ id: lesson.id, title: lesson.title, status: completed ? ('completed' as const) : ('in_progress' as const), href: '' }];
  const lessonIndex = Math.max(0, lessons.findIndex((l) => l.id === lesson.id));
  const nextLesson = lessons[lessonIndex + 1];
  // posição da aula no curso: a última tem o fechamento (despedida) e, ao acabar, a tela de CURSO concluído.
  // Fora da lista do curso (prévia de uma aula só do estúdio), nada disso vale.
  const inCourse = platform.lessons.some((l) => l.id === lesson.id);
  const lastLesson = inCourse && isLastLessonOfCourse(lessons, lesson.id);
  const courseEnd = inCourse && isCourseEnd(lessons, lesson.id);
  const closingId = useMemo(() => closingNodeIdOf(lesson.graph, lastLesson), [lesson.graph, lastLesson]);

  const frame: FrameInfo = {
    lessonTitle: lesson.title,
    courseTitle: platform.courseTitle,
    lastLesson,
    courseEnd,
    ...(closingId ? { closingNodeId: closingId } : {}),
    lessons,
    lessonIndex,
    ...(platform.courseGoals?.length ? { courseGoals: platform.courseGoals } : {}),
    ...(platform.achievement ? { achievement: platform.achievement } : {}),
    ...(platform.courseTrail ? { courseTrail: platform.courseTrail } : {}),
    ...(platform.series ? { series: platform.series } : {}),
    ...(platform.enrollmentId ? { enrollmentId: platform.enrollmentId } : {}),
    exitHref,
    ...(driver.mode === 'lms' && lessons[0]?.href ? { courseRestartHref: `${lessons[0].href}?reiniciar=1` } : {}),
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
    <ImmersiveFullscreenProvider value={fullscreen}>
    <div
      ref={rootRef}
      data-immersive-root
      data-testid="immersive-player"
      data-fullscreen={fullscreen.active ? (fullscreen.pseudo ? 'pseudo' : 'native') : undefined}
      style={brand.style}
      className={cn(
        'theme-platform flex min-h-dvh flex-col bg-bg text-fg',
        // o raiz rola por dentro (a página atrás não rola); no iPhone ele mesmo é a camada que ocupa a tela, sob a área segura
        fullscreen.active && 'overflow-y-auto overscroll-contain',
        fullscreen.pseudo && 'fixed inset-x-0 top-0 z-[60] h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {/* tela cheia: só o palco (cabeçalho e rodapé saem; "Meu roteiro" e o tema voltam ao sair) */}
      {!fullscreen.active && <PlatformHeader brand={brand} homeHref={homeHref} {...(platform.series ? { seriesLabel: seriesHeaderLabel(platform.series) } : {})} onOpenRecap={() => setDrawerOpen(true)} drawerOpen={drawerOpen} />}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {/* próximos vídeos já baixando enquanto o atual toca (sem espera na troca) */}
      <VideoPrefetch lesson={lesson} currentNodeId={state?.currentNodeId} />

      <div className={cn('mx-auto flex w-full flex-1 flex-col', fullscreen.active ? 'max-w-none' : 'max-w-[1920px] md:px-6')}>
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
        ) : outroNow && !pendingReaction ? (
          <OutroStage
            key={`vinheta:${lesson.id}`}
            frame={frame}
            percent={session.progress.percent}
            gesture={player.gesture}
            onDone={() => {
              markOutro();
              // a cena do vídeo longo já foi vista: segue direto (a pergunta seguinte abre, como no avanço automático),
              // com a vinheta ainda no palco até a cena trocar
              if (session.state.currentNodeId === lastLongId) {
                setOutroDone(true);
                void player.send({ kind: 'advance' });
              } else setOutroNow(false);
            }}
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
            outroPlayed={outroPlayed}
            onOutroDone={markOutro}
            videoSeen={!!node && seenLongId === node.id}
            {...(outroArmed && node?.id === lastLongId ? { onLongVideoEnded } : {})}
          />
        )}
      </div>

      {fullscreen.active ? null : brand.tagline || platform.enrollmentId ? (
        <footer className="px-4 py-3 text-center text-sm text-fg-muted md:py-[14px]">
          {brand.tagline ? <p className="py-1">{brand.tagline}</p> : null}
          {/* textos legais (aluno logado): abrem em outra aba para a pessoa não perder o lugar na aula */}
          {platform.enrollmentId ? <LegalLinks newTab /> : null}
        </footer>
      ) : (
        <div aria-hidden="true" className="h-6 md:h-14" />
      )}

      <RecapDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} recap={recap} {...(platform.enrollmentId ? { enrollmentId: platform.enrollmentId } : {})} />
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
    </ImmersiveFullscreenProvider>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho                                                                 */
/* ------------------------------------------------------------------------ */

function PlatformHeader({ brand, homeHref, seriesLabel, onOpenRecap, drawerOpen }: { brand: ResolvedBrand; homeHref: string; /** curso que é parte de uma série: "{trilha} · Parte N de 3" no lugar do nome do curso */ seriesLabel?: string; onOpenRecap: () => void; drawerOpen: boolean }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1920px] items-center justify-between gap-3 px-4 md:grid md:h-[72px] md:grid-cols-[1fr_auto_1fr] md:px-10">
      {brand.mark ? (
        // o mesmo logo do catálogo e da página do curso (`[data-testid=brand-logo]`); o nome acessível é o do curso
        <Link href={homeHref} className="inline-flex min-h-11 min-w-0 shrink items-center rounded-lg" aria-label={`${brand.title}: início`} data-testid="player-brand">
          <BrandLogo brand={brand.mark} height={28} className="max-sm:[--logo-h:22px]" alt={brand.title} />
        </Link>
      ) : (
        <Link
          href={homeHref}
          className="inline-flex min-h-11 min-w-0 items-center rounded-lg text-[26px] font-semibold leading-none tracking-[-0.035em] text-fg lowercase md:text-[32px]"
          aria-label={`${brand.title}: início`}
          data-testid="player-brand"
        >
          <span className="truncate">{brand.title}</span>
          {/* o ponto laranja da marca só entra quando o título não termina em pontuação ("terminei. e agora?" sem "?.") */}
          {!/[.!?…:]$/.test(brand.title.trim()) && (
            <span aria-hidden="true" className="text-[var(--im-accent-ink)]">
              .
            </span>
          )}
        </Link>
      )}
      {/* nome curto do curso (o do catálogo); com a marca em texto no lugar do logo, ele já está à esquerda. Oculto no celular: não empurra os botões */}
      {seriesLabel ? (
        <p className="hidden truncate text-center text-[17px] text-fg/70 md:block" data-testid="player-series-label" title={`${seriesLabel} · ${brand.title}`}>
          {seriesLabel}
        </p>
      ) : brand.mark ? (
        <p className="hidden truncate text-center text-[17px] text-fg/70 md:block" data-testid="player-course-name">{brand.title}</p>
      ) : (
        <span className="hidden md:block" aria-hidden="true" />
      )}
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
  /** título do curso (o inteiro): "Você concluiu …" e o cartão do fechamento */
  courseTitle: string;
  /** esta é a última aula do curso */
  lastLesson: boolean;
  /** ao acabar esta aula, o CURSO acaba (última aula e as outras já concluídas) */
  courseEnd: boolean;
  /** a cena do fechamento do curso (despedida), quando esta aula tem uma */
  closingNodeId?: string;
  lessons: PlatformContext['lessons'];
  lessonIndex: number;
  /** recomeçar o curso do início (1ª aula, tentativa nova; o progresso das outras aulas fica) */
  courseRestartHref?: string;
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
  /** abertura do curso: o que o aluno leva e o selo para o currículo */
  courseGoals?: string[];
  /** conquista do curso (dentro da plataforma) e a trilha até o Selo DNA Work */
  achievement?: string;
  courseTrail?: NonNullable<PlatformContext['courseTrail']>;
  /** o curso é uma parte de uma trilha em série */
  series?: PlatformSeries;
  /** matrícula (LMS): habilita registrar a missão e o roteiro com as missões do curso */
  enrollmentId?: string;
}

type StepKind = 'video' | 'choice' | 'mission' | 'real' | 'review' | 'closing';
const STEP_LABEL: Record<StepKind, string> = { video: 'Vídeo', choice: 'Decisão', mission: 'Na prática', real: MISSION_LABELS.moment, review: 'Revisão', closing: CLOSING_LABEL };

/** Etapas da aula na ordem do roteiro (avaliações seguidas viram uma só "Revisão"); o fim não conta. */
export function lessonSteps(lesson: Lesson, closingNodeId?: string): Array<{ kind: StepKind; nodeIds: string[] }> {
  const out: Array<{ kind: StepKind; nodeIds: string[] }> = [];
  for (const n of lesson.graph.nodes) {
    const kind: StepKind | null = n.id === closingNodeId ? 'closing' : n.type === 'scenario' || n.type === 'content' || n.type === 'consequence' ? 'video' : n.type === 'choice' ? 'choice' : n.type === 'reflection' ? 'mission' : n.type === 'mission' ? 'real' : n.type === 'assessment' ? 'review' : null;
    if (!kind) continue;
    const last = out[out.length - 1];
    if (kind === 'review' && last?.kind === 'review') last.nodeIds.push(n.id);
    else out.push({ kind, nodeIds: [n.id] });
  }
  return out;
}

const STEP_ICON: Record<StepKind, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>> = { video: Play, choice: MousePointerClick, mission: Target, real: Footprints, review: ListChecks, closing: Flag };

/**
 * Trilha da aula (gamificação leve): uma marca por etapa — feita (laranja, com visto), atual (anel) e a fazer.
 * "3 de 7 etapas" para leitores de tela e ao lado no computador. Não muda regra nenhuma: só mostra o caminho.
 */
function LessonStepsBar({ lesson, state, currentNodeId, completed, closingNodeId }: { lesson: Lesson; state: AttemptState; currentNodeId?: string; completed: boolean; /** a cena do fechamento do curso: etapa "Fechamento", com bandeira */ closingNodeId?: string }) {
  const steps = useMemo(() => lessonSteps(lesson, closingNodeId), [lesson, closingNodeId]);
  if (steps.length < 2) return null;
  const done = new Set(state.completedNodeIds);
  const doneCount = completed ? steps.length : steps.filter((st) => st.nodeIds.every((id) => done.has(id))).length;
  return (
    <div className="flex items-center gap-3" data-testid="lesson-steps">
      <ol className="flex items-center gap-1.5" aria-label={`Etapas da aula: ${doneCount} de ${steps.length} concluídas`}>
        {steps.map((st, i) => {
          const isDone = completed || st.nodeIds.every((id) => done.has(id));
          const isNow = !completed && !!currentNodeId && st.nodeIds.includes(currentNodeId);
          const Icon = STEP_ICON[st.kind];
          return (
            <li key={i} title={STEP_LABEL[st.kind]} className={cn('grid size-7 place-items-center rounded-full transition-colors motion-reduce:transition-none', isDone ? 'bg-[var(--im-accent)] text-[var(--im-on-accent)]' : isNow ? 'bg-surface text-fg ring-2 ring-[var(--im-accent)]' : 'bg-fg/10 text-fg/45')}>
              {isDone ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <Icon className="size-3.5" aria-hidden="true" />}
              <span className="sr-only">
                {STEP_LABEL[st.kind]}
                {isDone ? ' (feita)' : isNow ? ' (agora)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="hidden text-[13px] font-medium tabular-nums text-fg/65 lg:inline" aria-hidden="true">
        {!completed && closingNodeId && currentNodeId === closingNodeId ? `${CLOSING_LABEL} · ` : ''}
        {doneCount} de {steps.length} etapas
      </span>
    </div>
  );
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
  const fullscreen = useImmersiveFullscreenState().active;
  return (
    <section data-testid={testId} data-node-id={nodeId} data-node-type={nodeType} aria-busy={busy || undefined} className={stageClass(false, fullscreen)}>
      <StageTopNav frame={frame} percent={percent} />
      <StageMedia frame={frame} video={null} />
      <PanelArea hasControls={false}>{children}</PanelArea>
    </section>
  );
}

function stageClass(hasControls: boolean, fullscreen = false) {
  return cn(
    'relative flex flex-col md:overflow-hidden md:bg-[var(--im-stage)]',
    // tela cheia: o palco é a tela inteira, de borda a borda (sem moldura, cantos nem margem); cresce se a cena pedir mais
    fullscreen
      ? 'md:min-h-dvh'
      : // palco = viewport menos cabeçalho (72) e rodapé (56); cresce se a cena pedir mais
        'md:min-h-[max(560px,calc(100dvh-128px))] md:rounded-[20px] md:border md:border-line',
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
function StageTopNav({ frame, percent, hidden = false, onVideo = false, steps }: { frame: FrameInfo; percent: number; hidden?: boolean; /** tela cheia com o vídeo tocando: o título fica sobre as faixas escuras do quadro */ onVideo?: boolean; /** trilha de etapas da aula (gamificação) */ steps?: React.ReactNode }) {
  // o cabeçalho da página já diz "Aula N de M": aqui fica só o nome da aula (no celular, onde o cabeçalho não mostra a posição, "Aula N")
  const label = frame.lessonTitle;
  // tela cheia: sempre à mão aqui (a barra de controles só existe com o vídeo rodando e some nas perguntas)
  const fs = useImmersiveFullscreenState();
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
        <h1 className={cn('m-0 min-w-0 text-[15px]! font-semibold! leading-tight! tracking-normal! text-fg! md:text-base!', onVideo && 'md:text-white!')}>
          <span className="block truncate" title={label}>
            <span className="max-sm:hidden">{label}</span>
            <span className="sm:hidden">{frame.series ? `Parte ${frame.series.part} de ${frame.series.total} · ` : ''}Aula {frame.lessonIndex + 1}</span>
          </span>
        </h1>
        {steps && <div className={cn('ml-auto hidden md:block', onVideo && '[&_span.tabular-nums]:text-white/80')}>{steps}</div>}
        {frame.nav && (
          <div className={cn('flex shrink-0 items-center gap-2', steps ? 'md:ml-4 max-md:ml-auto' : 'ml-auto')}>
            {frame.nav.canGoBack && (
              <RoundIconButton label="Cena anterior" onClick={frame.nav.onBack} disabled={frame.nav.pending} testId="player-back" aria-keyshortcuts="ArrowLeft">
                <Undo2 className="size-5" aria-hidden="true" />
              </RoundIconButton>
            )}
            {fs.ready && (
              <RoundIconButton label={fs.active ? 'Sair da tela cheia' : 'Tela cheia'} onClick={fs.toggle} testId="fullscreen-toggle">
                {fs.active ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}
              </RoundIconButton>
            )}
            <RoundIconButton label="Capítulos" onClick={frame.nav.openMap} testId="open-chapters" aria-haspopup="dialog" aria-expanded={frame.nav.mapOpen}>
              <ListVideo className="size-5" aria-hidden="true" />
            </RoundIconButton>
            {frame.nav.onRestart && <RestartLesson onRestart={frame.nav.onRestart} disabled={frame.nav.pending} {...(frame.courseRestartHref ? { courseRestartHref: frame.courseRestartHref } : {})} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Reiniciar aula" com confirmação da própria plataforma (não a janela nativa do navegador): um balão logo
 * abaixo do botão, com "Reiniciar" e "Cancelar". Esc ou clique fora fecham; o foco vai para "Cancelar" (seguro) e,
 * ao fechar com Esc ou "Cancelar", volta para o botão que abriu o balão (clique fora deixa o foco onde o aluno clicou).
 */
function RestartLesson({ onRestart, disabled, courseRestartHref }: { onRestart: () => void; disabled?: boolean; courseRestartHref?: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // fecha e devolve o foco ao botão "Reiniciar aula" (o balão desmonta com o foco dentro dele)
  const closeToTrigger = useCallback(() => {
    setOpen(false);
    boxRef.current?.querySelector<HTMLElement>('[data-testid="restart-lesson"]')?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeToTrigger();
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, closeToTrigger]);
  return (
    <div ref={boxRef} className="relative">
      <RoundIconButton label="Reiniciar aula" testId="restart-lesson" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}>
        <RotateCcw className="size-5" aria-hidden="true" />
      </RoundIconButton>
      {open && (
        <div role="dialog" aria-labelledby={titleId} data-testid="restart-confirm" className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-32px))] rounded-[16px] border border-line bg-surface p-4 text-left shadow-[0_18px_40px_-20px_rgba(15,16,48,0.55)]">
          <p id={titleId} className="text-[16px] font-semibold leading-snug text-fg">Reiniciar a aula do começo?</p>
          <p className="mt-1 text-[14px] leading-snug text-fg/70">As respostas que você deu nesta tentativa serão descartadas.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button ref={cancelRef} type="button" data-testid="restart-confirm-cancel" onClick={closeToTrigger} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[15px] font-medium text-fg hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--im-accent-ink)]">
              Cancelar
            </button>
            <button type="button" data-testid="restart-confirm-ok" onClick={() => { setOpen(false); onRestart(); }} className="inline-flex min-h-11 items-center rounded-full bg-[var(--im-accent)] px-4 text-[15px] font-semibold text-[#1d1e4c] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--im-accent-ink)]">
              Reiniciar aula
            </button>
          </div>
          {courseRestartHref && (
            <a href={courseRestartHref} data-testid="restart-course" className="mt-3 block rounded text-center text-[14px] font-medium text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--im-accent-ink)]">
              Recomeçar o curso desde as boas-vindas
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** A última cena narrada com vídeo da aula (sem outra cena com vídeo pela frente): onde a vinheta fecha. */
function lastLongVideoId(lesson: Lesson): string | undefined {
  const narrated = lesson.graph.nodes.filter((n) => (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') && (n as { media?: { kind?: string; assetId?: string } | null }).media?.kind === 'video' && !!(n as { media?: { assetId?: string } | null }).media?.assetId);
  return narrated.filter((n) => !videoAhead(lesson, n.id)).at(-1)?.id;
}

/** Há vídeo de cena (não reação) alcançável a partir de `fromId` (sem contar ele)? Decide onde a vinheta toca. */
function videoAhead(lesson: Lesson, fromId: string): boolean {
  const seen = new Set<string>([fromId]);
  const queue = lesson.graph.edges.filter((e) => e.from === fromId).map((e) => e.to);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = lesson.graph.nodes.find((x) => x.id === id) as { type: string; media?: { kind?: string; assetId?: string } | null } | undefined;
    if (n && n.type !== 'choice' && n.media?.kind === 'video' && n.media.assetId) return true;
    for (const e of lesson.graph.edges) if (e.from === id) queue.push(e.to);
  }
  return false;
}

/**
 * Vinheta da marca no palco inteiro, entre o último vídeo da aula e a atividade (ou o fim): com som (o aluno
 * acabou de interagir), com o botão de pular quando a vinheta permitir. Ao terminar, a atividade entra direto.
 */
function OutroStage({ frame, percent, gesture, onDone }: { frame: FrameInfo; percent: number; gesture: boolean; onDone: () => void }) {
  const fullscreen = useImmersiveFullscreenState().active;
  return (
    <section data-testid="outro-stage" aria-label="Vinheta da marca" className={stageClass(false, fullscreen)}>
      <StageTopNav frame={frame} percent={percent} hidden />
      <StageMedia frame={frame} video={null} bumper={<BrandBumper key="outro" bumper={frame.bumper!} gesture={gesture} variant="stage" onDone={onDone} className="im-bumper-in" />} bumperFull />
      <p className="sr-only" role="status">Vinheta da marca. Em seguida, a atividade.</p>
    </section>
  );
}

/** Vídeo (ou imagem parada) à direita, fundindo com o marinho; legenda do apresentador. */
function StageMedia({ frame, video, bumper, bumperFull, children }: { frame: FrameInfo; video: { el: React.ReactNode; playing: boolean; caption: string | null; hasControls: boolean; /** vídeo tocando: quadro inteiro e limpo */ watching?: boolean } | null; /** vinheta da marca no lugar da mídia (fim da aula) */ bumper?: React.ReactNode; /** vinheta fechando o último vídeo: ocupa o palco inteiro, por cima */ bumperFull?: boolean; children?: React.ReactNode }) {
  const { brand, posterUrl } = frame;
  const showPresenter = !!brand.presenterName && !bumper;
  // vídeo já montado com a apresentadora ao lado: quadro inteiro, sem a âncora à direita (que só serve ao avatar centralizado)
  const placed = !!video?.el && frame.presenterPlacement !== 'center';
  // tocando: o vídeo já vem dirigido (cartões, câmeras, marca d'água) — ocupa o palco inteiro, sem véu nem recorte
  const watching = !!video?.el && !!video.watching;
  // tela cheia tocando: o vídeo aparece inteiro (`object-contain`) e as faixas dos lados são escuras, como no cinema
  const letterbox = useImmersiveFullscreenState().active && watching;
  return (
    <div
      className={cn(
        'relative mx-4 aspect-video overflow-hidden rounded-[16px] border border-line bg-[var(--im-media-bg)] md:absolute md:inset-0 md:z-0 md:mx-0 md:aspect-auto md:rounded-none md:border-0',
        letterbox && 'bg-[#050A14]',
        // celular sem vídeo nem imagem: não ocupa a tela com um quadro vazio
        !video?.el && !posterUrl && !bumper && 'max-md:hidden',
      )}
    >
      {/* vinheta no fim: ocupa a parte direita do palco (o painel do fim fica à esquerda); celular: o quadro 16:9 inteiro */}
      {bumper && <div data-testid="stage-bumper" className={cn('absolute inset-0 z-[1]', bumperFull ? 'z-20' : 'md:left-[42%]')}>{bumper}</div>}
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
            <img src={posterUrl} alt="" className="h-full w-full object-cover object-[50%_0%]" data-testid="stage-poster" />
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

function PanelArea({ hasControls, compact, light, center, wide, side = 'left', children }: { hasControls: boolean; /** atividade "Na prática": duas colunas, com superfície própria (sem o painel do tema) */ wide?: boolean; /** vídeo tocando: etiqueta pequena no canto, sem cobrir a cena */ compact?: boolean; /** abertura: texto direto sobre o cenário (sem o painel branco) */ light?: boolean; /** pergunta e missão: no centro do palco, mais largas, com o fundo escurecido (foco no que o aluno faz) */ center?: boolean; /** lado livre do palco (o oposto ao da apresentadora, quando o curso informa) */ side?: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative z-10 flex-1 px-4 pt-7 md:flex md:px-16 md:py-6 min-[1600px]:py-10',
        compact ? 'md:pointer-events-none md:items-end md:px-6 md:pb-28' : cn('md:items-center', hasControls || wide ? 'md:pb-6' : 'md:pb-14'),
        !compact && !center && side === 'right' && 'md:justify-end',
        !compact && center && 'md:justify-center',
      )}
    >
      {/* vídeo tocando: sem o painel branco do tema claro (no desktop não há nada visível aqui; o atalho fica na barra) */}
      <div className={cn('w-full', compact ? 'md:pointer-events-auto md:max-w-[340px]' : light ? 'max-w-[560px] min-[1700px]:max-w-[620px]' : wide ? 'max-w-[1120px] min-[1700px]:max-w-[1200px]' : center ? 'im-panel max-w-[760px] md:shadow-[0_30px_80px_-30px_rgba(15,16,48,0.55)] min-[1700px]:max-w-[820px]' : 'im-panel max-w-[600px] min-[1700px]:max-w-[680px]')}>{children}</div>
    </div>
  );
}

/**
 * Estilo serviço de vídeo: tocando e sem toque/mouse/tecla por 2,5 s, topo e controles somem; mexer, tocar ou teclar
 * traz de volta (no celular, um toque no palco). Pausar ou terminar mostra tudo de novo.
 */
function useIdleChrome(playing: boolean) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (playing) timer.current = setTimeout(() => setIdle(true), 2500);
  }, [playing]);
  const wake = useCallback(() => {
    setIdle(false);
    arm();
  }, [arm]);
  useEffect(() => {
    setIdle(false);
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm]);
  return { chromeHidden: playing && idle, wake };
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
  /** terminou de tocar, ou o aluno pulou / o vídeo não carregou */
  onDone: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const video = useSceneVideo(null, { ...reaction.media, transcript: reaction.media.transcript ?? reaction.text }, autoPlay);
  const playing = video.playing;
  const fullscreen = useImmersiveFullscreenState().active;
  const { chromeHidden, wake } = useIdleChrome(playing);
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
      className={cn('h-full w-full object-cover object-[50%_0%]', frame.presenterPlacement === 'right' && 'object-[70%_0%]', frame.presenterPlacement === 'left' && 'object-[30%_0%]', fullscreen && playing && 'object-contain')}
      poster={frame.posterUrl}
    >
      {video.captionsSrc && <track kind="captions" srcLang={reaction.media.captions?.lang ?? 'pt-BR'} label="Português" src={video.captionsSrc} default />}
    </video>
  ) : null;
  return (
    <section data-testid="reaction-scene" data-phase={video.phase} data-chrome={chromeHidden ? 'hidden' : undefined} aria-labelledby={headingId} onPointerMove={wake} onPointerDown={wake} onKeyDown={wake} className={cn(stageClass(true, fullscreen), chromeHidden && 'md:cursor-none')}>
      <StageTopNav frame={frame} percent={percent} hidden={playing} onVideo={fullscreen && playing} />
      <StageMedia frame={frame} video={{ el: videoEl, playing, caption: video.caption, hasControls: true, watching: playing }} />
      <ControlBar
        video={video}
        skip={{ label: 'Pular', onClick: () => finish(), testId: 'reaction-skip' }}
        className={cn('mx-4 mt-2 transition-opacity duration-300 motion-reduce:transition-none md:absolute md:inset-x-6 md:bottom-6 md:z-20 md:mx-0 md:mt-0', chromeHidden && 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100')}
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
                <ImButton size="xl" variant="outline" data-testid="reaction-continue" onClick={() => finish()}>
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
  outroPlayed,
  onOutroDone,
  onLongVideoEnded,
  videoSeen,
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
  /** a vinheta desta aula já tocou (sessão) */
  outroPlayed: boolean;
  onOutroDone: () => void;
  /** esta cena é o último vídeo longo da aula e a vinheta ainda vai tocar: ao fim do vídeo, a vinheta (sem avanço automático) */
  onLongVideoEnded?: () => void;
  /** o vídeo desta cena já foi visto até o fim (e a vinheta tocou): remontar a cena não pode recomeçá-lo */
  videoSeen?: boolean;
}) {
  const { pending, fieldError, stepError, inflight, retrySend, conflict, setConflict, carry, retry, gesture, send, restart, saved, dismissSaved } = player;
  // "Na prática" acabou de ser salva: o motor já está na cena seguinte, mas a confirmação fica até "Continuar aula"
  const savedHere = saved && saved.toNodeId === state.currentNodeId ? saved : null;
  const savedNode = savedHere ? findNode(lesson, savedHere.fromNodeId) : undefined;
  const savedCompose = savedNode?.type === 'reflection' && savedNode.scaffold ? savedNode : null;
  // missão "Leve para a vida real" recém-registrada: o motor já seguiu, mas a confirmação fica até "Continuar aula"
  const savedMission = savedNode?.type === 'mission' && savedHere?.mission ? { node: savedNode, status: savedHere.mission, note: savedHere.text, requested: savedHere.requested } : null;
  const stageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  // a cena anterior já fala a situação e a pergunta ("… Agora, responda: …"): o vídeo próprio da pergunta repetiria
  // tudo em seguida; a pergunta entra direto, com o instrutor parado no palco
  // (regra única, também usada na duração do percurso: questionVideoSkipped)
  const callSpoken = useMemo(() => (node?.type === 'choice' ? questionVideoSkipped(lesson.graph, node.id) : false), [node, lesson.graph]);
  const capable = node && !completed && !callSpoken && isVideoCapable(node) ? node : null;
  const media = capable ? videoMediaOf(capable) : null;
  const carryHere = carry && carry.nodeId === state.currentNodeId ? carry : null;
  // logo depois de responder: a cena seguinte mostra primeiro "Sua escolha" + o retorno, e o vídeo espera o
  // "Assistir" (sem isso o vídeo tocava sozinho por cima e o retorno só aparecia no fim dele)
  // ...exceto quando a instrutora já reagiu em vídeo à escolha: aí o próximo vídeo segue direto (continuidade);
  // o retorno escrito aparece no painel quando o vídeo termina
  const holdForCarry = (!!carryHere && !!capable && capable.type !== 'choice' && !(carryHere.kind === 'choice' && carryHere.reaction)) || !!savedCompose || !!savedMission;
  // fechamento do curso (a despedida, depois da última prática): rótulo próprio, cartão-título e legendas ligadas por padrão
  const isClosing = !!node && !completed && node.id === frame.closingNodeId;
  const video = useSceneVideo(capable, media, gesture && !holdForCarry && !videoSeen, { captionsDefault: isClosing });
  // cartão "Fechamento do curso · …" sobre o começo do vídeo, por ~1,5 s, uma vez
  const [closingCard, setClosingCard] = useState<'idle' | 'on' | 'done'>('idle');
  useEffect(() => {
    if (isClosing && closingCard === 'idle' && video.phase === 'playing') setClosingCard('on');
  }, [isClosing, closingCard, video.phase]);
  useEffect(() => {
    if (closingCard !== 'on') return;
    const t = window.setTimeout(() => setClosingCard('done'), 1500);
    return () => window.clearTimeout(t);
  }, [closingCard]);
  // depois do vídeo desta cena vem a missão: o fim do vídeo mostra a PONTE para ela, não o cartão genérico
  const bridgeMission = useMemo(() => (node && (node.type === 'content' || node.type === 'scenario' || node.type === 'consequence') ? missionAfter(lesson.graph, node.id) : null), [node, lesson.graph]);
  // antes do primeiro play, um só acionador (o da abertura): a barra de controles entra quando o vídeo começa
  const hasControls = video.active && video.phase !== 'idle';
  // abertura leve (sem o painel branco): cena com vídeo ainda não iniciado e sem retorno de escolha a mostrar antes
  const opening = !!node && !completed && !savedCompose && !savedMission && video.active && video.phase === 'idle' && !carryHere && (node.type === 'scenario' || node.type === 'content' || node.type === 'consequence');
  const firstSceneId = useMemo(() => lesson.graph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')?.id, [lesson.graph.nodes]);
  // decisão sem vídeo próprio: o palco mostra o fim do vídeo que fez a chamada (o instrutor "pausado"), não um fundo vazio
  const stageFrame = useMemo(() => {
    if (!node || media) return frame;
    // fim sem retrato do curso (`avatarPreviewUrl` vazio, ex.: C01): o palco mostra o último vídeo visto, não um lado vazio
    const endWithoutPortrait = node.type === 'end' && !frame.posterUrl;
    if (node.type !== 'choice' && node.type !== 'reflection' && node.type !== 'mission' && !endWithoutPortrait) return frame;
    // decisão: o vídeo que fez a chamada; missão (ou decisão sem anfitrião): o último vídeo do caminho feito
    const videoOf = (id: string | undefined) => {
      const n = id ? lesson.graph.nodes.find((x) => x.id === id) : undefined;
      const m = n ? (n as { media?: { kind?: string; assetId?: string } | null }).media : null;
      return m?.kind === 'video' && m.assetId ? n : undefined;
    };
    const hostId = (node.type === 'choice' ? callHostId(lesson.graph, node.id) : null) ?? [...state.path].reverse().map((p) => p.nodeId).find((id) => id !== node.id && videoOf(id));
    const host = videoOf(hostId ?? undefined);
    const assetId = host ? (host as { media?: { kind?: string; assetId?: string } | null }).media : null;
    return assetId?.kind === 'video' && assetId.assetId ? { ...frame, posterUrl: `/api/assets/${assetId.assetId}/thumb?at=0.82` } : frame;
  }, [node, media, lesson.graph, frame, state.path]);
  const playing = video.playing;
  const fullscreen = useImmersiveFullscreenState().active;
  // "Pular vídeo"/"Responder agora": o aluno pediu o painel inteiro (mesmo com o vídeo pausado no meio)
  const [expanded, setExpanded] = useState(false);
  // vídeo começado e pausado no meio (cena sem pergunta): continua compacto para não cobrir o que o vídeo mostra
  const watching = !completed && video.active && (playing || (video.phase === 'paused' && !expanded && node?.type !== 'choice'));
  const retryHere = retry && retry.nodeId === state.currentNodeId ? retry : null;
  // pergunta e missão abrem no centro, com o fundo escurecido (o que o aluno precisa fazer em evidência)
  const composeHere = !!node && !completed && !watching && node.type === 'reflection' && !!node.scaffold;
  const centered = (!!node && !completed && !watching && (node.type === 'choice' || node.type === 'reflection' || node.type === 'mission')) || !!savedCompose || !!savedMission;
  // pergunta/atividade no centro: o vídeo já terminou e a barra ficaria embaixo do painel (fora da tela); some
  const barShown = hasControls && !centered;
  const wide = composeHere || !!savedCompose;

  const endNode = node?.type === 'end' ? node : null;
  // vinheta: no palco inteiro antes da atividade/fim (OutroStage, na raiz). Quem pulou vídeos a vê aqui, no fim,
  // junto com o painel de encerramento (não trava o fluxo)
  const bumperEl = savedCompose || savedMission ? null : completed && frame.bumper && !outroPlayed ? (
    <BrandBumper key="end" bumper={frame.bumper} gesture={gesture} variant="stage" onDone={onOutroDone} />
  ) : null;
  // "Resultado da simulação": decisões desta aula revisadas a partir das respostas da tentativa
  const review = useMemo<ReviewSummary | null>(
    () => (node?.type === 'content' && node.reviewNodeIds?.length ? resolveReview(lesson.graph, node.reviewNodeIds, state) : null),
    [node, lesson.graph, state],
  );

  // Foco no título a cada cena (sem rolar a página); no celular, garante o palco à vista.
  // Resposta "Na prática" recém-salva: a confirmação (perto do botão que o aluno tocou) fica à vista.
  // "Continuar aula": volta ao fluxo normal (foco no título da cena seguinte, palco à vista).
  const savedShown = !!savedCompose || !!savedMission;
  const wasSaved = useRef(savedShown);
  useEffect(() => {
    const h = headingRef.current;
    if (h) h.focus({ preventScroll: true });
    const s = stageRef.current;
    if (!s) return;
    if (savedShown) {
      s.querySelector('[data-testid="compose-saved"], [data-testid="mission-saved"]')?.scrollIntoView({ behavior: 'auto', block: 'center' });
      return;
    }
    const r = s.getBoundingClientRect();
    if (r.top < -8) s.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!wasSaved.current || savedShown) return;
    wasSaved.current = false;
    headingRef.current?.focus({ preventScroll: true });
    const s = stageRef.current;
    if (s && s.getBoundingClientRect().top < -8) s.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [savedShown]);

  // "Responder agora": pausa e leva o foco ao título da pergunta.
  // estilo serviço de vídeo: tocando e com o mouse parado por 2,5 s, topo e controles somem; mexer, tocar ou teclar traz de volta
  const { chromeHidden, wake } = useIdleChrome(playing);

  const answerNow = () => {
    setExpanded(true);
    video.pause();
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  // Ao terminar o vídeo, a pergunta aparece: foco no título.
  useEffect(() => {
    if (video.phase === 'ended') headingRef.current?.focus({ preventScroll: true });
  }, [video.phase]);

  // O vídeo termina chamando a pergunta ("Agora é com você: …"): ao fim dele, a pergunta entra direto,
  // sem tela intermediária. Só quando o vídeo chegou ao fim (não quando o aluno pulou) e não há vinheta tocando.
  const leadsToChoice = useMemo(() => {
    if (!node || node.type === 'choice' || node.type === 'end') return false;
    const outs = [...new Set(lesson.graph.edges.filter((e) => e.from === node.id).map((e) => e.to))];
    if (outs.length !== 1) return false;
    const next = lesson.graph.nodes.find((n) => n.id === outs[0]);
    if (next?.type !== 'choice') return false;
    if (callHostId(lesson.graph, next.id) === node.id) return true;
    // a pergunta tem vídeo próprio, mas ele é pulado porque este vídeo já termina com a chamada (mesma regra do palco)
    if (questionVideoSkipped(lesson.graph, next.id)) return true;
    // a pergunta tem vídeo próprio e ele toca: este vídeo termina e o da pergunta segue direto, sem "Continuar"
    return questionVideoFollows(lesson.graph, node.id);
  }, [node, lesson.graph]);
  const autoAdvanced = useRef(false);
  // último vídeo longo visto até o fim: a vinheta entra antes (o avanço acontece depois dela)
  const outroFired = useRef(false);
  useEffect(() => {
    if (!onLongVideoEnded || video.phase !== 'ended' || outroFired.current) return;
    outroFired.current = true;
    autoAdvanced.current = true;
    onLongVideoEnded();
  }, [onLongVideoEnded, video.phase]);
  useEffect(() => {
    if (!leadsToChoice || video.phase !== 'ended' || pending || autoAdvanced.current || onLongVideoEnded) return;
    autoAdvanced.current = true;
    const t = window.setTimeout(() => send({ kind: 'advance' }), 700);
    return () => window.clearTimeout(t);
  }, [leadsToChoice, video.phase, pending, send, onLongVideoEnded]);

  const videoEl = video.active ? (
    <video
      {...video.videoProps}
      aria-label={media?.alt ?? 'Vídeo da cena'}
      // posicionada: em palcos mais estreitos que 16:9, o recorte preserva o lado da apresentadora
      // tela cheia tocando: o quadro inteiro, sem cortar a cabeça nem a composição (faixas escuras nos lados do palco mais largo que 16:9)
      className={cn('h-full w-full object-cover object-[50%_0%]', frame.presenterPlacement === 'right' && 'object-[70%_0%]', frame.presenterPlacement === 'left' && 'object-[30%_0%]', fullscreen && watching && 'object-contain')}
      poster={frame.posterUrl}
    >
      {video.captionsSrc && <track kind="captions" srcLang={media?.captions?.lang ?? 'pt-BR'} label="Português" src={video.captionsSrc} default />}
    </video>
  ) : null;

  const percent = completed ? 100 : progress.percent;
  // o que o servidor deixou valendo em cada missão (esta sessão manda; senão o registro do curso): o chip final e o roteiro leem o mesmo estado
  const missionStatusMap = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [id, r] of Object.entries(recap?.missions ?? {})) out[id] = r.status;
    for (const [id, r] of Object.entries(player.missions)) out[id] = r.status;
    return out;
  }, [recap?.missions, player.missions]);

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
  } else if (savedCompose && savedHere) {
    panel = (
      <ComposePanel
        key={`salva:${savedCompose.id}`}
        node={savedCompose}
        carry={null}
        headingRef={headingRef}
        headingId={headingId}
        pending={pending}
        fieldError={null}
        onSend={send}
        saved={savedHere.text}
        onContinue={dismissSaved}
      />
    );
  } else if (savedMission) {
    panel = (
      <MissionPanel
        key={`salva:${savedMission.node.id}`}
        node={savedMission.node}
        carry={null}
        headingRef={headingRef}
        headingId={headingId}
        pending={pending}
        fieldError={null}
        onSend={send}
        saved={{ status: savedMission.status, note: savedMission.note, ...(savedMission.requested ? { requested: savedMission.requested } : {}) }}
        farewell={farewellAfter(lesson.graph, savedMission.node.id, frame.lastLesson)}
        onContinue={dismissSaved}
      />
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
        achievements={lessonAchievements(lesson.graph.nodes, state, missionStatusMap)}
        {...(frame.series ? { series: frame.series } : {})}
        {...(frame.courseEnd ? { courseEnd: { course: seriesEndsTrail(frame.series) ? frame.series!.trail : frame.courseTitle, ...((endNode?.closingLine?.trim() || recap?.closingLine) ? { closingLine: (endNode?.closingLine?.trim() || recap?.closingLine)! } : {}) } } : {})}
        {...(!nextLesson && frame.achievement && frame.lessons.every((l) => l.status === 'completed' || l.id === lesson.id) ? { conquest: { name: frame.achievement, ...(frame.courseTrail ? { trail: frame.courseTrail } : {}) } } : {})}
      />
    );
  } else if (watching) {
    // vídeo no palco inteiro: no desktop, nada por cima da cena (o atalho vai para a barra de controles; o título fica só
    // para leitores de tela). No celular, o vídeo fica em cima e este cartão curto embaixo.
    panel = (
      <ImCard data-testid="video-watching" className="md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="rounded-md text-[17px] font-semibold leading-snug text-fg outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--im-accent-ink)] md:sr-only">
          {isClosing ? closingCardTitle(frame.courseTitle) : (node.title ?? NODE_TYPE_LABELS[node.type])}
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
  } else if (opening && (node.type === 'scenario' || node.type === 'content' || node.type === 'consequence')) {
    panel = (
      <OpeningPanel
        node={node}
        first={node.id === firstSceneId}
        {...(node.id === firstSceneId && frame.lessonIndex === 0 && frame.courseGoals?.length ? { courseIntro: { goals: frame.courseGoals, ...(frame.courseTrail ? { trail: frame.courseTrail.name } : {}) } } : {})}
        lessonTitle={lesson.title}
        {...(isClosing ? { closing: true } : {})}
        {...(lesson.description?.trim() ? { lessonDescription: lesson.description.trim() } : {})}
        video={video}
        narrationTitle={frame.narrationTitle}
        headingRef={headingRef}
        headingId={headingId}
        pending={pending}
        fieldError={fieldError}
        onSend={send}
      />
    );
  } else if (node.type === 'mission') {
    // revisita: o que a pessoa já respondeu nesta tentativa ou o registro do curso (editável depois da aula)
    const prevAnswer = state.answers[node.id];
    const prevRec = recap?.missions?.[node.id];
    // o registro do servidor manda (ele não rebaixa "Já experimentei"); a resposta da tentativa vale enquanto ele não chega
    const previous = player.missions[node.id] ?? (prevRec ? { status: prevRec.status, note: prevRec.note } : prevAnswer?.missionStatus ? { status: prevAnswer.missionStatus, note: prevAnswer.text ?? null } : null);
    const draftText = node.draftFromNodeId ? (state.answers[node.draftFromNodeId]?.text ?? (recap?.answers?.[node.draftFromNodeId]?.lessonId === lesson.id ? recap.answers[node.draftFromNodeId]!.text : undefined))?.trim() || null : null;
    panel = (
      <MissionPanel
        node={node}
        carry={carryHere}
        headingRef={headingRef}
        headingId={headingId}
        pending={pending}
        fieldError={fieldError}
        onSend={send}
        previous={previous}
        draftText={draftText}
        saveError={stepError && inflight?.nodeId === node.id ? stepError : null}
        onRetry={retrySend}
        lastPractice={isLastPractice(lesson.graph, node.id, frame.lastLesson)}
        farewell={farewellAfter(lesson.graph, node.id, frame.lastLesson)}
      />
    );
  } else if (node.type === 'reflection' && node.scaffold) {
    // revisita: a resposta desta tentativa (ao voltar a uma cena já respondida) ou a última salva no curso
    const previousText = state.answers[node.id]?.text ?? (recap?.answers?.[node.id]?.lessonId === lesson.id ? recap.answers[node.id]!.text : undefined) ?? null;
    panel = (
      <ComposePanel
        node={node}
        carry={carryHere}
        headingRef={headingRef}
        headingId={headingId}
        pending={pending}
        fieldError={fieldError}
        onSend={send}
        previousText={previousText}
        saveError={stepError && inflight?.nodeId === node.id ? stepError : null}
        onRetry={retrySend}
      />
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
        bridge={bridgeMission}
        narrationTitle={frame.narrationTitle}
        review={review}
        sceneTitle={node.id === firstSceneId ? lesson.title : (node.title ?? lesson.title)}
        {...(() => {
          const qs = lesson.graph.nodes.filter((n) => n.type === 'choice');
          const i = qs.findIndex((n) => n.id === node.id);
          return i >= 0 ? { questionPos: { n: i + 1, total: qs.length } } : {};
        })()}
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
        className={cn(stageClass(barShown, fullscreen), chromeHidden && 'md:cursor-none')}
      >
        <StageTopNav frame={frame} percent={percent} hidden={chromeHidden} onVideo={fullscreen && watching} steps={<LessonStepsBar lesson={lesson} state={state} {...(node ? { currentNodeId: node.id } : {})} completed={completed} {...(frame.closingNodeId ? { closingNodeId: frame.closingNodeId } : {})} />} />
        {/* celular: a trilha de etapas logo abaixo do topo */}
        <div className="px-4 pb-3 md:hidden">
          <LessonStepsBar lesson={lesson} state={state} {...(node ? { currentNodeId: node.id } : {})} completed={completed} {...(frame.closingNodeId ? { closingNodeId: frame.closingNodeId } : {})} />
        </div>
        <StageMedia frame={stageFrame} video={{ el: videoEl, playing, caption: video.caption, hasControls: barShown, watching }} bumper={bumperEl}>
          {/* decisão: aviso discreto de que é a vez do aluno (o vídeo não segue sozinho) */}
          {node?.type === 'choice' && !completed && !watching && (
            <p className="pointer-events-none absolute bottom-6 right-6 z-10 hidden items-center gap-2 rounded-full bg-[#0f1030]/80 px-4 py-2 text-[14px] font-medium text-white backdrop-blur md:flex" data-testid="stage-your-turn">
              <Pause className="size-3.5 fill-current" strokeWidth={0} aria-hidden="true" />
              {(video.active && video.phase !== 'idle') || stageFrame !== frame ? 'Vídeo pausado para sua escolha' : 'Sua vez de escolher'}
            </p>
          )}
          {closingCard === 'on' && (
            <div data-testid="closing-card" aria-hidden="true" className="im-closing-card pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#050A14]/40 px-6">
              <p className="flex max-w-[34ch] items-center gap-3 rounded-[16px] bg-[#0f1030]/90 px-5 py-3.5 text-center text-[18px] font-semibold leading-snug text-white md:text-[22px]">
                <Flag className="size-5 shrink-0 text-[var(--im-accent)]" aria-hidden="true" />
                {closingCardTitle(frame.courseTitle)}
              </p>
            </div>
          )}
          {video.buffering && (
            <p role="status" className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050A14]/80 px-4 py-2 text-sm text-white md:left-[62%]">
              Carregando vídeo…
            </p>
          )}
        </StageMedia>
        {barShown && <ControlBar video={video} skip={watching && node ? { label: node.type === 'choice' ? 'Responder agora' : 'Pular vídeo', onClick: answerNow, testId: node.type === 'choice' ? 'video-answer-now-bar' : 'video-skip-bar' } : undefined} className={cn('mx-4 mt-2 transition-opacity duration-300 motion-reduce:transition-none md:absolute md:inset-x-6 md:bottom-6 md:z-20 md:mx-0 md:mt-0', chromeHidden && 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100')} />}
        {centered && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] hidden bg-[#0f1030]/45 backdrop-blur-[2px] md:block" />}
        {completed && frame.courseEnd && !savedShown && <Celebration />}
        <PanelArea hasControls={barShown} compact={watching} light={opening} center={centered} wide={wide} side={frame.presenterPlacement === 'left' ? 'right' : 'left'}>
          {conflict && (
            <ImCard role="status" data-testid="player-conflict" className="mb-6 flex items-start justify-between gap-3 py-3 text-sm text-fg/85 md:py-3">
              <span>Esta aula avançou em outra aba. Continuamos do ponto atual.</span>
              <button type="button" className="min-h-6 shrink-0 rounded text-fg/80 underline underline-offset-2 hover:text-fg" onClick={() => setConflict(false)}>
                Fechar
              </button>
            </ImCard>
          )}
          {stepError && !composeHere && node?.type !== 'mission' && (
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

      {completed && !savedCompose && !savedMission && endNode && recap && endNode.recap && endNode.recap.length > 0 && (
        <div className="mx-auto mt-8 w-full max-w-[880px] space-y-8 px-4 md:mt-12 md:px-0">
          <RecapView items={recap.items} title={recap.title} variant="page" headingLevel={2} className="border-line bg-bg-2" {...(frame.enrollmentId ? { enrollmentId: frame.enrollmentId } : {})} />
          {recap.closingLine && !frame.courseEnd && (
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
  eyebrow,
  compact,
}: {
  ref?: React.Ref<HTMLHeadingElement>;
  id?: string;
  chip: ReturnType<typeof chipFor>;
  title: string;
  aside?: React.ReactNode;
  /** rótulo discreto acima do título ("Antes de começar", "Agora é com você") */
  eyebrow?: string;
  /** título menor (decisão: a pergunta divide espaço com a situação e as alternativas) */
  compact?: boolean;
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
        className={`rounded-md font-medium! tracking-[-0.02em]! text-fg outline-none! ${compact ? 'text-[26px]! font-semibold! md:text-[clamp(1.75rem,2.2vw,2.5rem)]!' : headingSize(title)} leading-[1.08]!`}
      >
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {title}
      </h2>
    </div>
  );
}

/** Rótulo discreto em laranja com um traço (parte do título para leitores de tela: "Agora é com você. <pergunta>"). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--im-accent-ink)] md:mb-3">
      <span aria-hidden="true" className="h-[2px] w-6 rounded-full bg-[var(--im-accent)]" />
      {children}
      <span className="sr-only">.</span>
    </span>
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
  sceneTitle,
  questionPos,
  bridge,
  ...p
}: PanelProps & { node: AnyNode; carry: Carry | null; retry: RetryInfo | null; video: SceneVideo | null; /** a missão que vem a seguir: o fim do vídeo mostra a ponte para ela */ bridge?: MissionNode | null; narrationTitle: string; review: ReviewSummary | null; /** título de apresentação da cena (a 1ª cena da aula usa o nome da aula) */ sceneTitle?: string; questionPos?: { n: number; total: number } }) {
  // Fala escrita: só quando não há vídeo (ou ele falhou), aberta ("O que a Marina diz"). Com vídeo, a fala
  // fica nas legendas do próprio vídeo, em tempo real, ligadas pelo aluno no botão "Legendas" da barra.
  const narration = narrationOf(node);
  const hasVideo = !!video?.active;
  // o vídeo terminou e o próximo passo é a missão: ponte, no lugar de "A seguir · {título deste vídeo}" e de "Sua escolha"
  if (bridge && video?.active && video.phase === 'ended' && (node.type === 'content' || node.type === 'scenario' || node.type === 'consequence')) {
    return <MissionBridge mission={bridge} {...p} />;
  }
  const spoken = narration && !hasVideo ? <NarrationBlock key={`${node.id}:none`} narration={narration} heading={narrationTitle} hasVideo={false} className="mt-6" /> : null;
  switch (node.type) {
    case 'choice':
      return <ChoicePanel node={node} carry={carry} spoken={spoken} {...(questionPos ? { questionPos } : {})} {...p} />;
    case 'consequence':
      return <FeedbackPanel node={node} carry={carry} spoken={spoken} {...p} />;
    case 'scenario':
    case 'content':
      return <InfoPanel node={node} carry={carry} spoken={spoken} review={review} video={video} {...(sceneTitle ? { sceneTitle } : {})} {...p} />;
    case 'reflection':
      return node.scaffold ? <ComposePanel node={node} carry={carry} {...p} /> : <ReflectionPanel node={node} carry={carry} {...p} />;
    case 'mission':
      return <MissionPanel node={node} carry={carry} {...p} />;
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
    // o retorno do roteiro costuma trazer "o que acontece" + "Faça assim: …": a orientação prática vira um bloco à parte
    const plain = carry.feedback ? richTextToPlain(carry.feedback).replace(/\s+/g, ' ').trim() : '';
    const cut = plain.search(/faça assim:/i);
    const effect = cut > 0 ? plain.slice(0, cut).trim() : null;
    const practice = cut >= 0 ? plain.slice(cut).replace(/^faça assim:\s*/i, '').trim() : null;
    return (
      <ImCard data-testid="choice-feedback" aria-label="Sua escolha" className="mt-6">
        <p className="eyebrow text-fg/70!">Sua escolha</p>
        <p className="mt-1.5 text-lg font-medium leading-snug text-fg">{carry.optionLabel}</p>
        {practice !== null ? (
          <>
            {effect && <p className="mt-2 text-base leading-relaxed text-fg/80">{effect}</p>}
            {practice && (
              <p className="mt-3 border-l-[3px] border-[var(--im-accent)] pl-3 text-base leading-relaxed text-fg">
                <span className="font-semibold">Faça assim: </span>
                {practice}
              </p>
            )}
          </>
        ) : (
          carry.feedback && <RichText doc={carry.feedback} className="mt-2 text-base leading-relaxed text-fg/80" />
        )}
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

/**
 * Ponte antes da missão ("Agora é com você"): nomeia a missão, diz que é uma prática fora da plataforma que pode ficar para
 * depois e leva a "Ver a missão". Substitui o cartão genérico do fim do vídeo (que repetia o título do vídeo e "Sua escolha").
 */
export function MissionBridge({ mission, headingRef, headingId, pending, fieldError, onSend }: PanelProps & { mission: MissionNode }) {
  const title = missionTitleOf(mission);
  return (
    <div data-testid="mission-bridge" className="im-bridge-in">
      <PanelHead ref={headingRef} id={headingId} chip={{ label: 'Etapa', tone: 'accent' }} title={title} eyebrow={BRIDGE_EYEBROW} />
      <p data-testid="mission-bridge-line" className="mt-4 max-w-[40ch] text-[18px] leading-relaxed text-fg/80">
        {BRIDGE_LINE}
      </p>
      <FieldError message={fieldError} />
      <ActionBar>
        <ImButton size="xl" data-testid="player-continue" onClick={() => onSend({ kind: 'advance' })} disabled={pending} aria-busy={pending}>
          {pending ? 'Enviando…' : BRIDGE_BUTTON}
        </ImButton>
      </ActionBar>
    </div>
  );
}

/** O título da missão para o aluno; sem um título próprio, o nome do momento ("Leve para a vida real"). */
function missionTitleOf(node: MissionNode): string {
  const t = node.title?.trim() ?? '';
  return t || MISSION_LABELS.moment;
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

/* ---------------------------- Abertura ---------------------------------- */

/** "26 s", "1 min 10 s" */
function spanLabel(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/**
 * Abertura de uma cena com vídeo (antes do play): composição leve sobre o cenário, sem o painel branco.
 * Rótulo discreto, título voltado ao aluno (a 1ª cena da aula usa o nome da aula; as demais, o título da cena),
 * uma frase de orientação quando houver, "Começar aula"/"Assistir" (o vídeo só toca por ação do aluno), a duração
 * real do trecho, "Prefiro ler" (abre a fala escrita; não conclui nada nem responde por ninguém) e "Pular vídeo",
 * discreto, com a regra de avanço de sempre.
 */
function OpeningPanel({
  node,
  first,
  lessonTitle,
  lessonDescription,
  video,
  narrationTitle,
  headingRef,
  headingId,
  pending,
  fieldError,
  onSend,
  courseIntro,
  closing,
}: PanelProps & { node: Extract<AnyNode, { type: 'content' | 'scenario' | 'consequence' }>; first: boolean; /** o fechamento do curso (despedida): rótulo "Fechamento do curso" */ closing?: boolean; lessonTitle: string; lessonDescription?: string; video: SceneVideo; narrationTitle: string; /** 1ª cena do curso: o que o aluno leva ao concluir e o selo */ courseIntro?: { goals: string[]; trail?: string } }) {
  const [reading, setReading] = useState(false);
  const narration = narrationOf(node) ?? ((node as { media?: { transcript?: string } }).media?.transcript?.trim() || null);
  const title = first ? lessonTitle : (node.title ?? lessonTitle);
  // orientação: na 1ª cena, a frase de abertura da aula; nas demais, o texto da cena quando é uma frase curta (nunca a lista de palavras-chave)
  const bodyText = node.type === 'consequence' ? '' : richTextToPlain(node.body).replace(/\s+/g, ' ').trim();
  const firstSentence = (t: string) => (t.match(/^[^.!?]+[.!?]/)?.[0] ?? t).trim();
  const orientation = first ? (lessonDescription ? firstSentence(lessonDescription) : '') : bodyText && !isKeywordLine(node.body) && bodyText.length <= 160 ? bodyText : '';
  const readRef = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="opening-panel">
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className="rounded-md text-[clamp(2rem,1.2rem+2.4vw,3.25rem)]! font-semibold! leading-[1.05]! tracking-[-0.025em]! text-fg outline-none! [text-wrap:balance]">
        <Eyebrow>{first ? 'Antes de começar' : closing ? 'Fechamento do curso' : 'A seguir'}</Eyebrow>
        {title}
      </h2>
      {orientation && !courseIntro && <p className="mt-3 max-w-[38ch] text-[18px] leading-snug text-fg/75 md:text-[20px]">{orientation}</p>}
      {courseIntro && <CourseIntro goals={courseIntro.goals} {...(courseIntro.trail ? { trail: courseIntro.trail } : {})} />}
      <FieldError message={fieldError} />
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ImButton size="xl" data-testid="player-watch" onClick={() => video.play()} disabled={pending}>
          <Play className="size-5 fill-current" aria-hidden="true" /> {first ? 'Começar aula' : closing ? 'Assistir ao fechamento' : 'Assistir'}
        </ImButton>
        {video.duration > 0 && (
          <span className="text-[15px] tabular-nums text-fg/60">
            <span className="sr-only">Duração: </span>
            {spanLabel(video.duration)}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
        {narration && (
          <button
            type="button"
            aria-expanded={reading}
            aria-controls={`${headingId}-read`}
            onClick={() => {
              setReading((r) => !r);
              if (!reading) requestAnimationFrame(() => readRef.current?.focus({ preventScroll: false }));
            }}
            data-testid="opening-read"
            className="inline-flex min-h-11 items-center text-[16px] font-semibold text-fg underline decoration-fg/35 underline-offset-[6px] hover:decoration-[var(--im-accent-line)]"
          >
            {reading ? 'Fechar o texto' : 'Prefiro ler'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSend({ kind: 'advance' })}
          disabled={pending}
          data-testid="player-continue"
          className="inline-flex min-h-11 items-center text-[15px] text-fg/65 underline decoration-fg/25 underline-offset-[6px] hover:text-fg"
        >
          {pending ? 'Enviando…' : 'Pular vídeo'}
        </button>
      </div>
      {reading && narration && (
        <div ref={readRef} id={`${headingId}-read`} tabIndex={-1} role="region" aria-label={narrationTitle} className="mt-4 max-h-[40vh] overflow-y-auto rounded-[14px] border border-line bg-[var(--im-glass)] p-4 text-[17px] leading-relaxed text-fg/85 outline-none backdrop-blur-[10px] focus-visible:outline-3 focus-visible:outline-[var(--im-accent-ink)]">
          <p className="mb-1 text-[13px] font-semibold text-fg/60">{narrationTitle}</p>
          {narration}
        </div>
      )}
    </div>
  );
}

/** "Ao concluir este curso, você…": os objetivos do curso + o selo de competência para o currículo. */
function CourseIntro({ goals, trail }: { goals: string[]; trail?: string }) {
  return (
    <div className="mt-4 max-w-[46ch] space-y-3" data-testid="course-intro">
      <p className="text-[15px] font-semibold text-fg/80">Ao concluir este curso:</p>
      <ul className="space-y-1.5">
        {goals.map((g) => (
          <li key={g} className="flex gap-2.5 text-[16px] leading-snug text-fg/85 md:text-[17px]">
            <Check className="mt-0.5 size-[18px] shrink-0 text-[var(--im-accent-ink)]" strokeWidth={3} aria-hidden="true" />
            <span>{g}</span>
          </li>
        ))}
      </ul>
      {/* o Selo DNA Work é da trilha (curso sozinho dá conquista dentro da plataforma): sem trilha, nada sobre selo */}
      {trail && (
        <p className="flex items-center gap-2.5 rounded-[12px] border border-[var(--im-accent-line)]/50 bg-[color-mix(in_oklab,var(--im-accent)_10%,transparent)] px-3 py-2 text-[15px] leading-snug text-fg" data-testid="course-intro-trail">
          <Award className="size-5 shrink-0 text-[var(--im-accent-ink)]" aria-hidden="true" />
          <span>
            Este curso faz parte da trilha <strong>{trail}</strong>. Conclua a trilha para ganhar o <strong>Selo DNA Work</strong>.
          </span>
        </p>
      )}
    </div>
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
function ChoicePanel({ node, carry, spoken, headingRef, headingId, pending, fieldError, onSend, questionPos }: PanelProps & { node: ChoiceNode; carry: Carry | null; spoken?: React.ReactNode; /** "Pergunta 1 de 2" */ questionPos?: { n: number; total: number } }) {
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
      <PanelHead ref={headingRef} id={headingId} chip={chipFor(node, false)} title={title} eyebrow={mode === 'match' ? undefined : questionPos && questionPos.total > 1 ? `Pergunta ${questionPos.n} de ${questionPos.total} · Agora é com você` : 'Agora é com você'} compact />
      {carry && mode === 'choose' && <CarryCard carry={carry} />}

      {mode === 'choose' && (
        <div id={subId} className="mt-4 space-y-3">
          {/* a situação em quadro próprio: o aluno vê o caso antes de escolher */}
          {(leadDoc || context) && (
            <div className="rounded-[14px] border-l-4 border-[var(--im-accent)] bg-fg/[0.04] px-4 py-3" data-testid="choice-situation">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg/60">A situação</p>
              {leadDoc ? <RichText doc={leadDoc} className="mt-1 text-[17px] leading-relaxed text-fg/90 md:text-[18px]" /> : <p className="mt-1 text-[17px] leading-relaxed text-fg/90 md:text-[18px]">{context}</p>}
            </div>
          )}
          {(() => {
            const call = node.bridge?.call?.trim();
            // a chamada é o que a instrutora acabou de falar: com o quadro "A situação" na tela, ela só repetiria o caso e a
            // pergunta; aparece apenas quando não há situação escrita e não repete o título
            const instruction = call && !(leadDoc || context) && !callRepeatsTitle(call, title) ? <span data-testid="choice-call">{call}</span> : null;
            // ligação explícita com a pergunta: o aluno responde como ELE agiria (não "a resposta certa")
            return (
              <p className="flex items-start gap-2 text-[17px] font-medium leading-snug text-fg">
                <MousePointerClick className="mt-0.5 size-5 shrink-0 text-[var(--im-accent-ink)]" aria-hidden="true" />
                <span>{instruction ? <>{instruction} </> : null}Responda como você agiria nessa situação.</span>
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
            lettered
          />
          {mode === 'choose' && <p className="mt-3 text-[15px] text-fg/65">Escolha uma alternativa e confirme para ver o que acontece.</p>}
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

/**
 * "Texto na tela" do roteiro que é só uma lista de palavras-chave ("Celular · Atenção · Combinado"): no
 * vídeo elas viram pílulas com contexto; soltas no cartão parecem um subtítulo sem sentido, então não aparecem.
 */
function isKeywordLine(doc: RichTextDocument | undefined): boolean {
  if (!doc) return false;
  const text = richTextToPlain(doc).replace(/\s+/g, ' ').trim();
  if (!text || !text.includes('·')) return false;
  const parts = text.split('·').map((t) => t.trim()).filter(Boolean);
  return parts.length >= 2 && parts.every((t) => t.split(' ').length <= 3 && !/[.!?:;]/.test(t));
}

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
  sceneTitle,
}: PanelProps & { node: Extract<AnyNode, { type: 'content' | 'scenario' }>; carry: Carry | null; spoken?: React.ReactNode; review?: ReviewSummary | null; video?: SceneVideo | null; sceneTitle?: string }) {
  const tip = isTipScene(node);
  // depois do vídeo: o título de apresentação, menor (o título técnico da cena não vira manchete)
  const afterVideo = !!video && video.phase !== 'idle' && !review && !tip;
  return (
    <div>
      <PanelHead ref={headingRef} id={headingId} chip={review ? { label: 'Resultado', tone: 'accent' } : chipFor(node, false)} title={((afterVideo || carry) && sceneTitle) || node.title || NODE_TYPE_LABELS[node.type]} compact={afterVideo || !!carry} {...(carry ? { eyebrow: 'A seguir' } : {})} />
      {carry && <CarryCard carry={carry} />}
      {tip ? <ChecklistBody doc={node.body} /> : !isKeywordLine(node.body) && <RichText doc={node.body} className={cn(BODY, 'mt-5')} />}
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
          <span>{optional ? 'Opcional. Vai para o seu roteiro; não vale nota.' : 'Fica registrada para você e para a equipe; não é avaliada automaticamente.'} {NOTE_PRIVACY_HINT}</span>
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

/** Título da atividade: o da cena, sem o prefixo "Missão:"; sem título, "Monte sua resposta". */
function composeTitle(node: ReflectionNode): string {
  const t = node.title?.trim().replace(/^miss[aã]o\s*:\s*/i, '').trim();
  return t ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : 'Monte sua resposta';
}

/**
 * "Na prática" (reflexão com molde): todos os grupos de opções à mostra e uma prévia única da
 * resposta, numa superfície roxa só desta atividade (`.compose-surface`). "Salvar no meu roteiro"
 * envia a resposta montada pela intenção `reflect` (o mesmo contrato de sempre); a confirmação
 * ("Resposta salva no Meu roteiro" + "Continuar aula") aparece quando o envio termina (`saved`).
 * "Fazer depois" só quando a cena é opcional (envia vazio, como o antigo "Pular": nada é salvo).
 */
function ComposePanel({
  node,
  carry,
  headingRef,
  headingId,
  pending,
  fieldError,
  onSend,
  previousText,
  saveError,
  onRetry,
  saved,
  onContinue,
}: PanelProps & {
  node: ReflectionNode;
  carry: Carry | null;
  /** resposta salva antes (revisita): as escolhas voltam marcadas */
  previousText?: string | null;
  /** falha de rede/servidor ao salvar (as escolhas ficam) */
  saveError?: string | null;
  onRetry?: () => void;
  /** resposta já salva: confirmação + "Continuar aula" */
  saved?: string;
  onContinue?: () => void;
}) {
  const [sentence, setSentence] = useState<ComposedSentence>({ text: '', complete: false, missing: 1, total: 1 });
  const optional = node.minLength === 0;
  const lead = richTextToPlain(node.prompt).trim();
  // o enunciado antigo ("Monte sua frase tocando nas partes… Outro… Pode pular") não descreve mais a tela
  const showLead = !!lead && !/^monte sua frase/i.test(lead);
  const tooLong = sentence.text.length > node.maxLength;
  const tooShort = sentence.complete && sentence.text.length < node.minLength;
  const isSaved = saved !== undefined;
  const btn = saveButtonState({ missing: sentence.missing, tooLong, tooShort, pending, saved: isSaved });
  const continueRef = useRef<HTMLButtonElement>(null);

  const actions = isSaved ? (
    <div className="space-y-3">
      {/* anunciado pela região viva do player ("Resposta salva no Meu roteiro."): aqui só o visual */}
      <p className="flex items-center gap-2.5 rounded-[12px] border border-[var(--t-accent-fill)] bg-[var(--cp-selected,var(--t-accent-soft))] px-4 py-2.5 text-[15px] font-semibold text-fg" data-testid="compose-saved">
        <CircleCheck className="size-6 shrink-0" aria-hidden="true" />
        Resposta salva no Meu roteiro.
      </p>
      <ImButton ref={continueRef} size="lg" className="w-full" data-testid="compose-continue" onClick={onContinue}>
        Continuar aula
      </ImButton>
    </div>
  ) : (
    <div className="space-y-2">
      {saveError && (
        <div role="alert" className="rounded-[12px] border border-danger/50 bg-danger-soft px-4 py-3 text-[15px] text-fg" data-testid="compose-save-error">
          <p className="font-semibold">Não foi possível salvar sua resposta.</p>
          <p className="mt-0.5 text-fg-muted">Suas escolhas continuam aqui. Verifique a conexão e tente de novo.</p>
          {onRetry && (
            <ImButton variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={pending} data-testid="compose-retry">
              Tentar de novo
            </ImButton>
          )}
        </div>
      )}
      {tooLong && (
        <p role="alert" className="text-[15px] text-danger">
          A resposta passou de {node.maxLength} caracteres. Escolha uma opção mais curta ou encurte o que escreveu.
        </p>
      )}
      <FieldError message={fieldError} />
      <ImButton type="submit" size="lg" className="w-full whitespace-normal" data-testid="player-submit" disabled={btn.disabled} aria-busy={pending} aria-disabled={btn.disabled}>
        {btn.label}
      </ImButton>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
          <BookOpen className="size-4 shrink-0" aria-hidden="true" />
          Fica disponível no Meu roteiro.
        </p>
        {optional && (
          <button
            type="button"
            data-testid="player-skip"
            disabled={pending}
            onClick={() => onSend({ kind: 'reflect', text: '' })}
            className="flex min-h-11 items-center justify-center rounded-[10px] px-2 text-[15px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg disabled:opacity-50"
          >
            Fazer depois
          </button>
        )}
      </div>
    </div>
  );

  return (
    <form
      data-testid="compose-panel"
      data-state={isSaved ? 'saved' : sentence.missing === 0 ? 'complete' : sentence.missing === sentence.total ? 'empty' : 'partial'}
      className="compose-surface rounded-[22px] border p-5 md:px-7 md:py-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!btn.disabled) onSend({ kind: 'reflect', text: sentence.text });
      }}
    >
      {/* "Na prática" e o título na mesma linha (quando couber) */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--cp-eyebrow,var(--t-accent))]">
          <span aria-hidden="true" className="h-[2px] w-6 rounded-full bg-[var(--t-accent-fill)]" />
          Na prática
        </p>
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="rounded-md text-[24px] font-bold leading-[1.12] tracking-[-0.015em] text-fg outline-none! md:text-[28px]">
          {composeTitle(node)}
        </h2>
      </div>
      {/* ponte e instrução numa linha só (quando couber) */}
      <p className="mt-1.5 max-w-[80ch] text-[15px] leading-snug text-fg-muted md:text-[16px]">
        {node.intro?.trim() && (
          <span className="text-fg" data-testid="compose-intro">
            {node.intro.trim()}{' '}
          </span>
        )}
        Escolha uma opção em cada grupo para montar sua resposta.
      </p>
      {showLead && <p className="mt-1.5 text-[15px] leading-snug text-fg-muted">{lead}</p>}
      {carry && <CarryCard carry={carry} />}
      <ScaffoldComposer
        scaffold={node.scaffold!}
        disabled={pending}
        readOnly={isSaved}
        initialText={isSaved ? saved : previousText}
        onChange={setSentence}
        actions={actions}
        stickyActions={!isSaved && sentence.complete}
        className="mt-3"
      />
    </form>
  );
}

/* ----------------- Missão "Leve para a vida real" ----------------------- */

/**
 * Terceiro momento da aula, depois de "Você decide": uma ação para fazer FORA da plataforma, com alternativa para quem
 * ainda não trabalha. Nunca trava a aula: "Vou fazer depois" continua (e a missão fica em "Missões para depois" na página
 * do curso e no Meu roteiro); "Já experimentei" abre o campo opcional "O que você percebeu?" (até 500 caracteres).
 * Os dois caminhos usam a intenção `mission`; a confirmação ("Missão registrada…") só aparece depois que o servidor
 * respondeu (`saved`). Se o envio falhar, o texto continua no campo e há "Tentar de novo".
 */
export function MissionPanel({
  node,
  carry,
  headingRef,
  headingId,
  pending,
  fieldError,
  onSend,
  previous,
  draftText,
  saveError,
  onRetry,
  saved,
  onContinue,
  lastPractice,
  farewell,
}: PanelProps & {
  node: MissionNode;
  carry: Carry | null;
  /** é a última prática do curso (depois dela só há o fechamento): chip "Última prática do curso" */
  lastPractice?: boolean;
  /** depois desta missão vem o fechamento do curso: "Falta só o fechamento…" e o botão "Ver o fechamento" */
  farewell?: boolean;
  /** o que a pessoa já registrou (revisita da cena ou registro do curso) */
  previous?: { status: 'later' | 'done'; note: string | null } | null;
  /** a frase que ela montou antes na aula (`draftFromNodeId`), para copiar */
  draftText?: string | null;
  saveError?: string | null;
  onRetry?: () => void;
  /** registrada: confirmação + "Continuar aula" (`status` é o que o servidor deixou valendo; `requested`, o que a pessoa tocou) */
  saved?: { status: 'later' | 'done'; note: string; requested?: 'later' | 'done' };
  onContinue?: () => void;
}) {
  const [reporting, setReporting] = useState(previous?.status === 'done');
  const [note, setNote] = useState(previous?.note ?? '');
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const noteId = useId();
  const countId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const len = note.trim().length;
  const tooLong = len > MISSION_NOTE_MAX;
  const isSaved = saved !== undefined;
  const title = node.title?.trim() ?? '';
  const specific = !!title && title.toLocaleLowerCase('pt-BR') !== MISSION_LABELS.moment.toLocaleLowerCase('pt-BR');
  const ack = saved ? missionAckText(saved.status, { farewell: !!farewell, ...(saved.requested ? { requested: saved.requested } : {}) }) : null;

  // o campo só ganha foco (e rola até ele) quando a pessoa ACABOU de tocar em "Já experimentei"; na revisita ele já abre
  // preenchido e a página fica no topo, no título da missão
  const askedToReport = useRef(false);
  useEffect(() => {
    if (reporting && !isSaved && askedToReport.current) noteRef.current?.focus({ preventScroll: false });
  }, [reporting, isSaved]);
  useEffect(() => {
    if (isSaved) continueRef.current?.focus({ preventScroll: true });
  }, [isSaved]);
  useEffect(() => {
    if (copied === 'idle') return;
    const t = window.setTimeout(() => setCopied('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (!draftText) return;
    try {
      await copyToClipboard(draftText);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  const card = 'rounded-[16px] border border-line bg-[var(--im-card)] p-4 md:p-5';
  const label = 'text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--im-accent-ink)]';

  return (
    <form
      data-testid="mission-panel"
      className={cn(!isSaved && 'im-mission-in')}
      data-state={isSaved ? 'saved' : reporting ? 'reporting' : previous ? previous.status : 'open'}
      onSubmit={(e) => {
        e.preventDefault();
        if (isSaved || pending || tooLong) return;
        if (reporting) onSend({ kind: 'mission', status: 'done', ...(len > 0 ? { note: note.trim() } : {}) });
      }}
    >
      <PanelHead ref={headingRef} id={headingId} chip={{ label: 'Sua vez', tone: 'accent' }} title={specific ? title : MISSION_LABELS.moment} {...(specific ? { eyebrow: MISSION_LABELS.moment } : {})} {...(lastPractice && !isSaved ? { aside: <LastPracticeChip /> } : {})} />
      {carry && <CarryCard carry={carry} />}
      {previous && !isSaved && (
        <p data-testid="mission-previous" className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full bg-fg/10 px-4 text-[15px] font-semibold text-fg">
          {previous.status === 'done' ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
          Você marcou: {previous.status === 'done' ? MISSION_LABELS.done : MISSION_LABELS.later}
        </p>
      )}
      {node.intro.trim() && !isSaved && (
        <p className="mt-4 text-[18px] leading-relaxed text-fg/85" data-testid="mission-intro">
          {node.intro.trim()}
        </p>
      )}
      {/* registrada: o painel vira só o reconhecimento (a missão em si já foi lida) */}
      {!isSaved && (
      <div className="mt-5 space-y-3">
        <div className={card} data-testid="mission-action">
          <p className={label}>O que fazer</p>
          <p className="mt-1.5 whitespace-pre-line text-[19px] font-medium leading-snug text-fg">{node.action}</p>
        </div>
        <div className={card} data-testid="mission-alternative">
          <p className={label}>Se você ainda não trabalha</p>
          <p className="mt-1.5 text-[17px] leading-snug text-fg/85">{node.alternative}</p>
        </div>
        {(node.tip?.trim() || node.example?.trim()) && (
          <ul className="space-y-1.5 text-[16px] leading-snug text-fg/80">
            {node.tip?.trim() && (
              <li data-testid="mission-tip">
                <span className="font-semibold text-fg">Dica: </span>
                {node.tip.trim()}
              </li>
            )}
            {node.example?.trim() && (
              <li data-testid="mission-example">
                <span className="font-semibold text-fg">Exemplo: </span>
                {node.example.trim()}
              </li>
            )}
          </ul>
        )}
        {draftText && (
          <div className={card} data-testid="mission-draft">
            <p className={label}>A frase que você montou</p>
            <blockquote className="mt-1.5 text-[18px] font-medium leading-snug text-fg">{draftText}</blockquote>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ImButton variant="outline" size="sm" onClick={() => void copy()} data-testid="mission-copy">
                <Copy className="size-4" aria-hidden="true" />
                Copiar frase
              </ImButton>
              <span role="status" aria-live="polite" className={cn('text-sm', copied === 'failed' ? 'text-danger' : 'text-fg/75')}>
                {copied === 'done' ? 'Frase copiada.' : copied === 'failed' ? 'Não foi possível copiar. Selecione o texto e copie.' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
      )}

      {isSaved && ack ? (
        <div className="mt-6 space-y-4">
          {/* a frase é anunciada pela região viva do player (mesmo texto); aqui é o retorno visual, no tom de quem acolhe */}
          <div data-testid="mission-saved" className="rounded-[16px] border border-[var(--im-accent-line)] bg-[color-mix(in_oklab,var(--im-accent)_10%,transparent)] px-5 py-4 text-fg">
            <p data-testid="mission-saved-headline" className="flex items-start gap-3 text-[20px] font-semibold leading-snug md:text-[22px]">
              <CircleCheck className="mt-0.5 size-6 shrink-0 text-[var(--im-accent-ink)]" aria-hidden="true" />
              {ack.headline}
            </p>
            {ack.follow && (
              <p data-testid="mission-saved-follow" className="mt-2 pl-9 text-[17px] font-medium leading-snug text-fg">
                {ack.follow}
              </p>
            )}
            {saved.status === 'done' && saved.note && <p className="mt-3 whitespace-pre-wrap pl-9 text-[15px] leading-snug text-fg/85">{saved.note}</p>}
            <p className="mt-2 pl-9 text-[14px] text-fg/70">{ack.hint}</p>
          </div>
          <ImButton ref={continueRef} size="lg" className="w-full" data-testid="mission-continue" onClick={onContinue}>
            {missionContinueLabel(!!farewell)}
          </ImButton>
        </div>
      ) : (
        <>
          {reporting && (
            <div className="mt-6" data-testid="mission-report">
              <p className={label}>Como foi?</p>
              <label htmlFor={noteId} className="mt-1.5 block text-[18px] font-semibold text-fg">
                {MISSION_LABELS.note} <span className="font-normal text-fg/70">(opcional)</span>
              </label>
              <ImCard className="mt-2 p-0 md:p-0">
                <textarea
                  id={noteId}
                  ref={noteRef}
                  data-testid="mission-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={MISSION_NOTE_MAX}
                  disabled={pending}
                  aria-describedby={countId}
                  aria-invalid={!!fieldError || tooLong || undefined}
                  placeholder="O que deu certo? O que foi difícil?"
                  className="block min-h-28 w-full resize-none rounded-[16px] bg-transparent px-4 py-3 text-[18px] leading-relaxed text-fg outline-none! placeholder:text-fg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--im-accent-ink)]"
                />
                <p id={countId} className="flex items-center justify-between gap-2 border-t border-fg/10 px-4 py-2 text-[13px] text-fg/70">
                  <span>Só para você. Pode deixar em branco. {NOTE_PRIVACY_HINT}</span>
                  <span className={cn('tabular-nums', tooLong && 'text-danger')}>
                    {len}/{MISSION_NOTE_MAX}
                  </span>
                </p>
              </ImCard>
            </div>
          )}
          {saveError && (
            <div role="alert" className="mt-4 rounded-[12px] border border-danger/50 bg-danger-soft px-4 py-3 text-[15px] text-fg" data-testid="mission-save-error">
              <p className="font-semibold">Não foi possível salvar.</p>
              <p className="mt-0.5 text-fg-muted">{reporting ? 'O que você escreveu continua aqui. ' : ''}Verifique a conexão e tente de novo.</p>
              {onRetry && (
                <ImButton variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={pending} data-testid="mission-retry">
                  Tentar de novo
                </ImButton>
              )}
            </div>
          )}
          <FieldError message={fieldError} />
          {/* antes dos botões: quem não pode fazer agora vê, na hora de escolher, que pode deixar para depois */}
          {!reporting && (
            <p data-testid="mission-later-note" className="mt-6 text-[15px] leading-snug text-fg/80 md:text-[16px]">
              <span className="font-semibold text-fg">Pode deixar para depois.</span> Você termina a aula de qualquer jeito e a missão fica guardada no Meu roteiro.
            </p>
          )}
          <ActionBar className={cn('md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-md:grid-cols-2', !reporting && 'mt-4 min-[1600px]:mt-6')}>
            {reporting ? (
              <Fragment key="registrando">
                <ImButton key="salvar" type="submit" size="lg" className="whitespace-normal px-3 text-[16px] md:px-7 md:text-[17px]" data-testid="player-submit" disabled={pending || tooLong} aria-busy={pending}>
                  {pending ? 'Salvando…' : 'Salvar e continuar'}
                </ImButton>
                <ImButton key="voltar" variant="outline" size="lg" className="whitespace-normal px-3 text-[16px] md:px-7 md:text-[17px]" data-testid="mission-back" disabled={pending} onClick={() => setReporting(false)}>
                  Voltar
                </ImButton>
              </Fragment>
            ) : (
              <Fragment key="aberto">
                <ImButton key="feita" size="lg" className="whitespace-normal px-3 text-[16px] md:px-7 md:text-[17px]" data-testid="mission-done" disabled={pending} onClick={() => { askedToReport.current = true; setReporting(true); }}>
                  {MISSION_LABELS.done}
                </ImButton>
                <ImButton key="depois" variant="outline" size="lg" className="whitespace-normal px-3 text-[16px] md:px-7 md:text-[17px]" data-testid="mission-later" disabled={pending} aria-busy={pending} onClick={() => onSend({ kind: 'mission', status: 'later' })}>
                  {pending ? 'Salvando…' : MISSION_LABELS.later}
                </ImButton>
              </Fragment>
            )}
          </ActionBar>
        </>
      )}
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

export function EndPanel({
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
  achievements,
  conquest,
  courseEnd,
  series,
}: {
  /** o curso é parte de uma trilha em série: chip "Parte N concluída", botão para a próxima parte e, na última, o fim da trilha */
  series?: PlatformSeries;
  /** o CURSO acaba aqui: título "Você concluiu …", chip "Curso concluído", a frase de fecho logo abaixo e o selo em destaque */
  courseEnd?: { course: string; closingLine?: string };
  /** conquistas da aula (contadas do caminho feito) */
  achievements?: LessonAchievements;
  /** curso inteiro concluído: a conquista (dentro da plataforma) e o caminho até o Selo DNA Work da trilha */
  conquest?: { name: string; trail?: NonNullable<PlatformContext['courseTrail']> };
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
  const trail = conquest?.trail;
  const nextPart = seriesNextButton(series);
  return (
    <div data-testid="player-completed" data-course-end={courseEnd ? 'true' : undefined}>
      {courseEnd ? (
        <>
          <p className="mb-5">
            <span data-testid="end-chip" className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--im-accent)] px-4 text-[14px] font-semibold text-[var(--im-on-accent)]">
              <Check className="size-4" strokeWidth={3} aria-hidden="true" /> {seriesEndChip(series)}
            </span>
          </p>
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            data-testid="end-title"
            className={`rounded-md font-semibold! tracking-[-0.02em]! text-fg outline-none! ${headingSize(`Você concluiu ${courseEnd.course}`)} leading-[1.08]!`}
          >
            Você concluiu <span className="text-[var(--im-accent-ink)]">{courseEnd.course}</span>
          </h2>
          {courseEnd.closingLine && (
            <p data-testid="end-closing-line" className="mt-4 max-w-[36ch] text-[22px] font-medium leading-snug tracking-[-0.01em] text-fg md:text-[26px]">
              {courseEnd.closingLine}
            </p>
          )}
        </>
      ) : (
        <>
          <PanelHead ref={headingRef} id={headingId} chip={{ label: 'Fim', tone: 'accent' }} title={node?.title?.trim() || 'Você chegou ao fim desta aula.'} />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--im-accent)] px-3 py-1 text-sm font-semibold text-[var(--im-on-accent)]">
              <Check className="size-4" strokeWidth={3} aria-hidden="true" /> Aula concluída
            </span>
            {node?.outcomeLabel && node.outcomeLabel !== 'Aula concluída' && (
              <span className="inline-flex items-center rounded-full border border-line-strong bg-fg/5 px-3 py-1 text-sm font-medium text-fg/85">{node.outcomeLabel}</span>
            )}
          </div>
        </>
      )}
      {achievements && (achievements.choices > 0 || achievements.practices > 0 || achievements.skippedPractices > 0 || achievements.reviews > 0 || !!achievements.realLife) && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Conquistas desta aula" data-testid="lesson-achievements">
          {achievements.choices > 0 && <AchievementChip icon={MousePointerClick} label={`${achievements.choices} ${achievements.choices === 1 ? 'decisão tomada' : 'decisões tomadas'}`} />}
          {(() => {
            const m = practiceChipLabel(achievements);
            return m && <AchievementChip icon={Target} label={m.label} done={m.done} />;
          })()}
          {(() => {
            const m = realLifeChipLabel(achievements);
            return m && <AchievementChip icon={Footprints} label={m.label} done={m.done} />;
          })()}
          {achievements.reviews > 0 && <AchievementChip icon={ListChecks} label="Revisão feita" />}
        </ul>
      )}
      {conquest && (courseEnd && seriesEndsTrail(series) && conquest.trail ? <TrailDoneCard trail={conquest.trail} /> : <ConquestCard name={conquest.name} highlight={!!courseEnd} {...(conquest.trail ? { trail: conquest.trail } : {})} />)}
      {carry && <CarryCard carry={carry} />}
      {node && <RichText doc={node.summary} className={cn(BODY, 'mt-5')} />}
      {!ownRecap && !courseEnd && node?.closingLine && <p className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[32px]">{node.closingLine}</p>}
      {ownRecap && <p className="mt-5 text-base text-fg/75">Seu roteiro está logo abaixo: copie ou imprima quando quiser.</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {nextLesson ? (
          <ImLink href={nextLesson.href} data-testid="next-lesson-link">
            Próxima aula
          </ImLink>
        ) : courseEnd && nextPart ? (
          // parte 1 ou 2 de uma trilha em série: o caminho é a próxima parte (começa ou continua a matrícula dela)
          <ImLink href={nextPart.href} data-testid="next-part-link">
            {nextPart.label}
          </ImLink>
        ) : courseEnd && trail ? (
          // curso concluído: o selo é o caminho principal; "Voltar ao curso" fica em segundo plano
          <ImLink href={trail.href} data-testid="end-badge-link">
            {trail.badge ? 'Ver meu selo' : 'Ver o caminho até o Selo'}
          </ImLink>
        ) : (
          <ImLink href={exitHref}>Voltar ao curso</ImLink>
        )}
        {courseEnd && nextPart && trail && (
          // o selo fica em segundo plano enquanto há outra parte a fazer
          <ImLink href={trail.href} variant="outline" data-testid="end-badge-link">
            {trail.badge ? 'Ver meu selo' : 'Ver o caminho até o Selo'}
          </ImLink>
        )}
        {(nextLesson || (courseEnd && (trail || nextPart))) && (
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

function AchievementChip({ icon: Icon, label, done = true }: { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>; label: string; /** `false`: tom neutro (ex.: "Prática para depois") */ done?: boolean }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-fg" data-done={done ? 'true' : 'false'}>
      <Icon className={cn('size-4', done ? 'text-[var(--im-accent-ink)]' : 'text-fg-muted')} aria-hidden="true" />
      {label}
    </li>
  );
}

/**
 * Conquista do curso concluído (só dentro da plataforma; o reconhecimento para o currículo é o Selo DNA Work da
 * trilha). Com trilha: quantos cursos dela já foram concluídos (este conta, mesmo que a página tenha aberto antes
 * da conclusão) e o link para o caminho até o Selo, ou para o selo já emitido.
 */
function ConquestCard({ name, trail, highlight }: { name: string; trail?: NonNullable<PlatformContext['courseTrail']>; /** curso concluído: o selo em destaque (o botão para ele fica nas ações do painel) */ highlight?: boolean }) {
  const done = trail ? Math.min(trail.total, trail.done + (trail.currentDone ? 0 : 1)) : 0;
  const unit = trail?.series ? (trail.total === 1 ? 'parte concluída' : 'partes concluídas') : trail?.total === 1 ? 'curso concluído' : 'cursos concluídos';
  if (highlight) {
    return (
      <div className="im-badge-glow mt-6 flex items-center gap-4 rounded-[20px] border-2 border-[var(--im-accent)] bg-[color-mix(in_oklab,var(--im-accent)_14%,transparent)] p-4 md:p-5" data-testid="conquest-card" data-highlight="true">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--im-accent)] text-[var(--im-on-accent)] md:size-16">
          <Award className="size-7 md:size-8" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--im-accent-ink)]">Conquista</p>
          <p className="mt-0.5 text-[19px] font-semibold leading-snug text-fg md:text-[21px]">{name}</p>
          {trail && (
            <p className="mt-1 text-[15px] leading-snug text-fg/80" data-testid="conquest-trail">
              Parte da trilha {trail.name}: {done} de {trail.total} {unit}.
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-[16px] border border-[var(--im-accent-line)]/60 bg-[color-mix(in_oklab,var(--im-accent)_10%,transparent)] p-4" data-testid="conquest-card">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Award className="size-5 text-[var(--im-accent-ink)]" aria-hidden="true" /> Conquista
      </p>
      <p className="mt-1 text-[17px] font-semibold text-fg">{name}</p>
      {trail && (
        <>
          <p className="mt-1 text-sm text-fg/75" data-testid="conquest-trail">
            Parte da trilha {trail.name}: {done} de {trail.total} {unit}.
          </p>
          <Link
            href={trail.href}
            className="mt-3 inline-flex min-h-11 items-center rounded-[10px] border border-line-strong bg-surface px-4 text-[15px] font-medium text-fg hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--im-accent-ink)]"
          >
            {trail.badge ? 'Ver meu selo' : 'Ver o caminho até o Selo'}
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * Fim da última parte de uma trilha em série: a trilha inteira concluída, com o selo da trilha. O botão para o selo
 * fica nas ações do painel (`end-badge-link`); aqui só o selo e o que falta para ele (checagem final, atividades).
 */
function TrailDoneCard({ trail }: { trail: NonNullable<PlatformContext['courseTrail']> }) {
  return (
    <div className="im-badge-glow mt-6 flex items-center gap-4 rounded-[20px] border-2 border-[var(--im-accent)] bg-[color-mix(in_oklab,var(--im-accent)_14%,transparent)] p-4 md:p-5" data-testid="trail-done-card">
      <TrailSeal trail={trail.name} size={84} tone="dark" className="shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--im-accent-ink)]">{trail.badge ? 'Selo conquistado' : 'Selo DNA Work'}</p>
        <p className="mt-0.5 text-[19px] font-semibold leading-snug text-fg md:text-[21px]">Selo DNA Work · {trail.name}</p>
        {trail.sealNote && (
          <p className="mt-1 text-[15px] leading-snug text-fg/80" data-testid="trail-seal-note">
            {trail.sealNote}
          </p>
        )}
      </div>
    </div>
  );
}

/** Chip "Última prática do curso" na chegada da missão. */
function LastPracticeChip() {
  return (
    <span data-testid="mission-last-practice" className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--im-accent)] px-4 text-[13px] font-semibold text-[var(--im-on-accent)]">
      <Flag className="size-4" aria-hidden="true" />
      {LAST_PRACTICE_CHIP}
    </span>
  );
}

/** Quadradinhos que saem do alto do painel por ~1,5 s, uma vez só (CSS em globals.css; some com movimento reduzido). Sem biblioteca. */
const CONFETTI = [
  { x: -300, y: 190, r: -200, d: 0, c: 0 }, { x: -220, y: 260, r: 160, d: 60, c: 1 }, { x: -150, y: 150, r: -120, d: 20, c: 2 },
  { x: -90, y: 300, r: 260, d: 100, c: 3 }, { x: -40, y: 210, r: -90, d: 40, c: 0 }, { x: 30, y: 320, r: 180, d: 0, c: 1 },
  { x: 90, y: 170, r: -240, d: 80, c: 2 }, { x: 150, y: 280, r: 130, d: 30, c: 3 }, { x: 220, y: 200, r: -170, d: 120, c: 0 },
  { x: 300, y: 300, r: 220, d: 50, c: 1 }, { x: 360, y: 170, r: -110, d: 90, c: 2 }, { x: -340, y: 310, r: 150, d: 140, c: 3 },
  { x: 410, y: 260, r: -260, d: 10, c: 0 }, { x: -10, y: 120, r: 100, d: 70, c: 1 }, { x: 190, y: 360, r: -140, d: 110, c: 2 },
  { x: -190, y: 350, r: 200, d: 130, c: 3 },
] as const;
const CONFETTI_COLORS = ['var(--im-accent)', '#ffffff', 'var(--im-accent-ink)', 'color-mix(in oklab, var(--im-accent) 55%, white)'];

function Celebration() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), 1700);
    return () => window.clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div data-testid="celebration" aria-hidden="true" className="im-celebrate">
      {CONFETTI.map((p, i) => (
        <i key={i} style={{ ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg`, ['--d' as string]: `${p.d}ms`, ['--c' as string]: CONFETTI_COLORS[p.c] }} />
      ))}
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

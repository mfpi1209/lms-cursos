import type { Branding, BumperPlayOn, EndNode, Lesson, RichTextDocument } from '@lms/course-schema';
import type { AttemptState, Intent, NavigationTarget, ProgressSummary, AssessmentOutcome } from '@lms/course-engine';

/** Resultado de um passo do motor, igual para LMS (persistido) e prévia (sem persistência). */
export interface PlayerStepResult {
  state: AttemptState;
  revision: number;
  feedback?: RichTextDocument;
  assessment?: AssessmentOutcome;
  transitioned: boolean;
  fromNodeId: string;
  toNodeId: string;
  progress: ProgressSummary;
  lessonCompleted: boolean;
  courseCompleted: boolean;
}

export interface PlayerStart {
  state: AttemptState;
  revision: number;
  progress: ProgressSummary;
  attemptNumber: number;
}

/**
 * Driver do player. O componente LessonPlayer é o mesmo no LMS e na prévia;
 * só o driver muda (API de tentativas vs. /api/preview/step).
 */
export interface PlayerDriver {
  readonly mode: 'lms' | 'preview';
  start(): Promise<PlayerStart>;
  /** Deve ser idempotente por eventId no modo LMS. */
  step(input: { nodeId: string; expectedRevision: number; intent: Intent; eventId: string }): Promise<PlayerStepResult>;
  /** Nova tentativa (apenas após conclusão); opcional na prévia. */
  restart?(): Promise<PlayerStart>;
  /** "Recomeçar aula" no meio da tentativa (o LMS abandona a aberta e cria outra); a prévia usa `restart`. */
  restartNow?(): Promise<PlayerStart>;
  /** Voltar cenas ("Cena anterior" / mapa da aula). Idempotente por eventId no LMS. */
  navigate?(input: { nodeId: string; expectedRevision: number; target: NavigationTarget; eventId: string }): Promise<PlayerStepResult>;
}

export interface LessonPlayerProps {
  lesson: Lesson;
  driver: PlayerDriver;
  /** rótulo do curso para o cabeçalho */
  courseTitle: string;
  /** destino do botão "voltar"/"concluir" */
  exitHref: string;
  /** contexto do visual da plataforma (palco escuro); sem ele, o player clássico */
  platform?: PlatformContext;
}

export type LessonRunStatus = 'not_started' | 'in_progress' | 'completed';

/** Nó mínimo de outra aula, para o roteiro nomear a cena e traduzir a opção escolhida. */
export interface RecapNodeRef {
  title?: string;
  type: string;
  options?: Array<{ id: string; label: string }>;
}

/**
 * Contexto que o servidor monta para o player da plataforma: marca do curso,
 * imagem do apresentador, lista de aulas (progresso em segmentos) e o roteiro
 * do curso ("Meu roteiro"). Tudo serializável.
 */
export interface PlatformContext {
  /** 'classic' só quando pedido explicitamente (?player=classic) */
  theme: 'immersive' | 'classic';
  branding: Partial<Branding>;
  courseTitle: string;
  /** imagem parada do apresentador (fundo do palco sem vídeo) */
  posterUrl?: string;
  /**
   * posição da apresentadora nos vídeos do curso: `center` = vídeo do HeyGen
   * (avatar no meio; o palco ancora o vídeo à direita); `right`/`left` = vídeo já
   * montado com ela ao lado (o palco mostra o quadro inteiro, sem recorte)
   */
  presenterPlacement?: 'center' | 'right' | 'left';
  /** gênero da apresentadora (artigo do bloco "O que a Marina diz") */
  presenterPronoun?: 'she' | 'he' | 'they';
  /** quem aparece no vídeo segundo o elenco do curso (apresentador/mentor/entrevistador), sem marca definida */
  castPresenter?: { name: string; role?: string };
  lessons: Array<{ id: string; title: string; status: LessonRunStatus; href: string }>;
  currentLessonId: string;
  /** matrícula (LMS): habilita as respostas do curso inteiro no roteiro */
  enrollmentId?: string;
  /** encerramento com roteiro do curso (de qualquer aula) e os nós que ele cita */
  recap?: { lessonId: string; endNode: EndNode; nodes: Record<string, RecapNodeRef> };
  /**
   * Só para quem edita o curso (servidor decide): base do link discreto
   * "Abrir no estúdio" (storyboard da aula; o player acrescenta `?node=`).
   */
  studioHref?: string;
  /**
   * Vinheta da marca no fim da aula (resolvida no servidor: a do curso ou a
   * padrão do workspace). `isLastLesson` decide `course_end`. Sem o campo,
   * nenhuma vinheta toca.
   */
  bumper?: PlatformBumper;
}

export interface PlatformBumper {
  /** vídeo 16:9 */
  assetId: string;
  /** vídeo 9:16 (telas em pé), quando houver */
  assetIdVertical?: string;
  playOn: BumperPlayOn[];
  skippable: boolean;
  durationSec?: number;
  isLastLesson: boolean;
  /** logo para o cartão estático (movimento reduzido); claro e escuro */
  logoLight?: string;
  logoDark?: string;
  brandName?: string;
  /** cor de fundo da vinheta (variante claro/marinho): preenche a área do palco em volta do vídeo */
  bg?: string;
}

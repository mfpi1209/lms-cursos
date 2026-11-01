import type { Branding, BumperPlayOn, EndNode, Lesson, RichTextDocument } from '@lms/course-schema';
import type { BrandMark } from '@/config/brand';
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
  /** só na missão "Leve para a vida real": o que o servidor deixou valendo (não rebaixa "Já experimentei") */
  mission?: { status: 'later' | 'done'; note: string | null };
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
  /** missão "Leve para a vida real": o que fazer (o roteiro mostra ao lado do estado) */
  mission?: { intro?: string; action?: string; alternative?: string };
}

/** Posição do curso numa trilha em série e para onde ir ao concluí-lo. */
export interface PlatformSeries {
  trail: string;
  /** página da trilha (as partes e o selo) */
  trailHref: string;
  /** esta parte (Parte 1 = 1) e quantas a série tem */
  part: number;
  total: number;
  /** as outras partes já estão concluídas: terminar esta fecha a trilha inteira */
  othersDone: boolean;
  /** a parte a abrir depois desta (a seguinte, ou a primeira que falta); a aula certa da matrícula dela. Sem ela, não há para onde ir. */
  next?: { n: number; title: string; href: string; started: boolean };
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
  /** logo da marca do workspace (o mesmo do catálogo e da página do curso); sem ele, o cabeçalho mostra o nome do curso em texto */
  brandMark?: BrandMark;
  courseTitle: string;
  /** nome curto do curso, o mesmo do catálogo (`shortTitleFor`): centro do cabeçalho do player; sem ele, vale `courseTitle` */
  courseShortTitle?: string;
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
  /** o que o aluno leva ao concluir o curso (objetivos do curso, na voz do aluno) */
  courseGoals?: string[];
  /** frase do curso para o aluno (`learnerSummary`) */
  courseSummary?: string;
  /** conquista do curso (só dentro da plataforma): "Curso concluído · <título curto>" */
  achievement?: string;
  /** trilha do curso e o caminho até o Selo DNA Work (o reconhecimento para o currículo) */
  courseTrail?: { name: string; href: string; done: number; total: number; badge: boolean; /** este curso já conta como concluído na trilha (ao abrir a página) */ currentDone?: boolean; /** o que falta para o selo, numa frase (fim da última parte) */ sealNote?: string; /** a trilha é uma série: conta "partes" */ series?: boolean };
  /**
   * Este curso é uma parte de uma trilha em série (`TRAIL_SERIES`): "{trilha} · Parte N de 3" no cabeçalho e, no fim do curso,
   * o caminho para a próxima parte. Só apresentação: o curso, a matrícula e o selo seguem como são.
   */
  series?: PlatformSeries;
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

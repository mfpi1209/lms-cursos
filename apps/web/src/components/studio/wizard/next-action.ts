import type { CourseDocument, WizardStep } from '@lms/course-schema';
import { allLessons } from '@lms/course-schema';
import { computeNextSteps, type MediaQueueItem, type NextStep } from '@lms/ai/client';
import type { VideoStats } from '../video-stats';
import { lessonStats, stepStatus, type StepStatusContext } from './wizard-state';

/**
 * UMA ação principal para o estado atual do curso, em linguagem de autor.
 * Fases da trilha primeiro (ideia → material → estrutura → aulas → apresentação →
 * prévia → vídeos); com tudo pronto, os bloqueios de publicação vêm dos
 * "próximos passos" do pacote de IA (`computeNextSteps`), e por fim "Publicar".
 */
export interface PrimaryAction {
  id: string;
  /** verbo no botão: "Propor estrutura", "Gerar 5 aulas", "Publicar" */
  label: string;
  /** uma linha: o que acontece e o que a IA faz */
  hint: string;
  /** passo onde a ação acontece */
  step: WizardStep;
  cost: 'free' | 'ai' | 'paid';
  /** espera (ex.: arquivo sendo lido): o botão não leva a lugar nenhum */
  waiting?: boolean;
}

export interface PrimaryActionContext extends StepStatusContext {
  courseId: string;
  /** IA configurada (fake conta como configurada) */
  aiConfigured?: boolean;
  /** contagem de vídeos do curso (rascunho + fila) */
  videos?: VideoStats;
  /** fila de vídeos (para os próximos passos do pacote de IA) */
  mediaQueue?: readonly MediaQueueItem[];
  /** fontes prontas (texto lido) */
  sourcesReady?: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function primaryAction(doc: CourseDocument, ctx: PrimaryActionContext): PrimaryAction {
  const lessons = allLessons(doc);

  if (stepStatus('tema', doc, ctx) !== 'ready') {
    return { id: 'brief', label: 'Descrever o curso', hint: 'Título, ideia em uma frase e público. É o que a IA vai usar em tudo.', step: 'tema', cost: 'free' };
  }

  if ((ctx.sourcesProcessing ?? 0) > 0) {
    return { id: 'sources-wait', label: 'Lendo o arquivo…', hint: 'Espere a leitura terminar para a IA usar o material.', step: 'conteudo', cost: 'free', waiting: true };
  }
  if ((ctx.sourcesFailed ?? 0) > 0 && (ctx.sourcesReady ?? 0) === 0 && doc.wizard.contentMode !== 'generate') {
    return { id: 'sources-retry', label: 'Tentar ler o arquivo de novo', hint: 'A leitura falhou. Tente de novo, envie outro arquivo ou cole o texto.', step: 'conteudo', cost: 'free' };
  }
  if (stepStatus('conteudo', doc, ctx) !== 'ready') {
    return { id: 'sources', label: 'Escolher o material', hint: 'Cole um texto, envie um PDF ou deixe a IA partir só da sua ideia.', step: 'conteudo', cost: 'free' };
  }

  if (lessons.length === 0) {
    return ctx.aiConfigured === false
      ? { id: 'outline-manual', label: 'Montar a estrutura', hint: 'Sem IA configurada: escreva objetivos, módulos e aulas à mão.', step: 'estrutura', cost: 'free' }
      : { id: 'outline', label: 'Propor estrutura', hint: 'A IA propõe objetivos, módulos e aulas. Você aprova antes de aplicar.', step: 'estrutura', cost: 'ai' };
  }

  const empty = lessons.filter((l) => lessonStats(l).empty).length;
  if (empty > 0) {
    return ctx.aiConfigured === false
      ? { id: 'lessons-manual', label: `Escrever ${plural(empty, 'aula', 'aulas')}`, hint: 'Sem IA configurada: escreva as cenas no storyboard de cada aula.', step: 'aulas', cost: 'free' }
      : { id: 'lessons', label: `Gerar ${plural(empty, 'aula', 'aulas')}`, hint: 'A IA escreve cenas, decisões e falas. Você revisa cada proposta antes de aplicar.', step: 'aulas', cost: 'ai' };
  }

  if (!doc.presentation.avatarId) {
    return { id: 'presenter', label: 'Escolher apresentador', hint: 'Quem aparece nos vídeos, com que voz e em que fundo. Sem custo até gerar vídeo.', step: 'apresentacao', cost: 'free' };
  }

  if (!doc.wizard.completedSteps.includes('previa')) {
    return { id: 'preview', label: 'Testar o curso', hint: 'Percorra as aulas como aluno e confira a lista de verificação antes de gastar com vídeo.', step: 'previa', cost: 'free' };
  }

  const v = ctx.videos;
  if (v) {
    if (v.generating > 0) {
      return { id: 'videos-generating', label: 'Acompanhar a produção', hint: `${plural(v.generating, 'vídeo', 'vídeos')} na fila ou em produção. Você pode sair desta tela.`, step: 'producao', cost: 'free' };
    }
    if (v.stale > 0) {
      const why =
        v.presentationStale === v.stale ? 'A apresentação (apresentador, voz, fundo ou posição) mudou depois do vídeo.'
        : v.presentationStale > 0 ? `O texto ou a direção mudou depois do vídeo; ${plural(v.presentationStale, 'cena está', 'cenas estão')} com a apresentação antiga.`
        : 'O texto ou a direção mudou depois do vídeo.';
      return { id: 'videos-stale', label: `Atualizar ${plural(v.stale, 'vídeo', 'vídeos')}`, hint: `${why} Gerar de novo é pago; você aprova o orçamento antes.`, step: 'producao', cost: 'paid' };
    }
    if (v.missing > 0) {
      return { id: 'videos-quote', label: 'Calcular orçamento', hint: `${plural(v.missing, 'cena ainda não tem vídeo', 'cenas ainda não têm vídeo')}. Veja o custo antes de confirmar.`, step: 'producao', cost: 'paid' };
    }
  }

  let steps: NextStep[] = [];
  try {
    steps = computeNextSteps(doc, { courseId: ctx.courseId, mediaQueue: ctx.mediaQueue });
  } catch {
    steps = [];
  }
  const blocker = steps.find((s) => s.severity === 'blocker');
  if (blocker) {
    return { id: `blocker-${blocker.id}`, label: 'Resolver o que impede publicar', hint: blocker.title, step: 'revisao', cost: 'free' };
  }

  return doc.wizard.finished
    ? { id: 'publish-again', label: 'Publicar nova versão', hint: 'Quem já está matriculado continua na versão atual; novos alunos recebem a nova.', step: 'revisao', cost: 'free' }
    : { id: 'publish', label: 'Publicar', hint: 'Cria a primeira versão do curso para os alunos. O rascunho continua editável.', step: 'revisao', cost: 'free' };
}

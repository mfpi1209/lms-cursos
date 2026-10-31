import { allLessons, compileCourse, type AnyNode, type CourseCompileResult, type CourseDocument, type Lesson } from '@lms/course-schema';
import { DIRECTION_NODE_TYPES, directionTargetsFromGraph } from './direction';
import type { AssistantAction, AssistantContext, NextStep, PromptSuggestion } from './assistant-schema';
import { scorecardIsStale, sortFindings, type QualityScorecard } from './evaluation-schema';

/*
 * Próximos passos e sugestões de prompt do Assistente: funções puras,
 * determinísticas e seguras para o navegador (sem SDKs). Exportadas também
 * por `@lms/ai/client`.
 */

/** Estado de um job de mídia (o mais recente por cena), vindo da fila do curso. */
export interface MediaQueueItem {
  lessonId: string;
  nodeId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required' | (string & {});
}

export type SceneMediaState = 'none' | 'ready' | 'stale' | 'generating' | 'failed';

const queueKey = (lessonId: string, nodeId: string) => `${lessonId}:${nodeId}`;

export function indexMediaQueue(queue: readonly MediaQueueItem[] | undefined): Map<string, MediaQueueItem> {
  const m = new Map<string, MediaQueueItem>();
  for (const q of queue ?? []) m.set(queueKey(q.lessonId, q.nodeId), q);
  return m;
}

/** Cena que vira vídeo do apresentador. */
export function isVideoScene(n: AnyNode): boolean {
  return (DIRECTION_NODE_TYPES as readonly string[]).includes(n.type);
}

function nodeVideo(n: AnyNode): { hasVideo: boolean; stale: boolean } {
  const media = 'media' in n ? n.media : undefined;
  return { hasVideo: media?.kind === 'video', stale: media?.kind === 'video' && media.stale === true };
}

export function nodeHasDirection(n: AnyNode): boolean {
  return 'direction' in n && !!n.direction?.shots.length;
}

export function nodeHasNarration(n: AnyNode): boolean {
  return 'narration' in n && typeof n.narration === 'string' && n.narration.trim().length > 0;
}

/** Estado da mídia de uma cena: fila (gerando/falhou) tem precedência sobre o rascunho. */
export function sceneMediaState(lessonId: string, n: AnyNode, queue?: Map<string, MediaQueueItem>): SceneMediaState {
  const q = queue?.get(queueKey(lessonId, n.id));
  if (q && (q.status === 'queued' || q.status === 'running')) return 'generating';
  const v = nodeVideo(n);
  if (q && (q.status === 'failed' || q.status === 'reconciliation_required') && !v.hasVideo) return 'failed';
  if (v.stale) return 'stale';
  if (v.hasVideo) return 'ready';
  if (q && (q.status === 'failed' || q.status === 'reconciliation_required')) return 'failed';
  return 'none';
}

export interface LessonVideoStats {
  /** cenas com vídeo que têm fala ou texto (dirigíveis) */
  videoSceneIds: string[];
  withoutNarration: string[];
  undirected: string[];
  directed: string[];
  stale: string[];
  missing: string[];
  generating: string[];
  failed: string[];
}

export function lessonVideoStats(lesson: Lesson, queue?: Map<string, MediaQueueItem>): LessonVideoStats {
  const targets = directionTargetsFromGraph(lesson.graph);
  const byId = new Map(lesson.graph.nodes.map((n) => [n.id, n] as const));
  const s: LessonVideoStats = { videoSceneIds: [], withoutNarration: [], undirected: [], directed: [], stale: [], missing: [], generating: [], failed: [] };
  for (const t of targets) {
    const n = byId.get(t.nodeId)!;
    s.videoSceneIds.push(n.id);
    if (!t.hasNarration) s.withoutNarration.push(n.id);
    (nodeHasDirection(n) ? s.directed : s.undirected).push(n.id);
    const st = sceneMediaState(lesson.id, n, queue);
    if (st === 'stale') s.stale.push(n.id);
    else if (st === 'none') s.missing.push(n.id);
    else if (st === 'generating') s.generating.push(n.id);
    else if (st === 'failed') s.failed.push(n.id);
  }
  return s;
}

export const lessonEditorHref = (courseId: string, lessonId: string) => `/estudio/cursos/${courseId}/aulas/${lessonId}`;
export const presentationHref = (courseId: string) => `/estudio/cursos/${courseId}/montar?passo=apresentacao`;
export const productionHref = (courseId: string) => `/estudio/cursos/${courseId}/producao`;
export const reviewHref = (courseId: string) => `/estudio/cursos/${courseId}/revisao`;

/** Como as falas devem soar, conforme o ponto de vista do curso (doc.brief.narrativeVoice). */
export const NARRATION_VOICE_INSTRUCTION: Record<CourseDocument['brief']['narrativeVoice'], { short: string; instruction: string }> = {
  second_person: { short: 'em segunda pessoa', instruction: 'em 2ª pessoa, com o aluno como protagonista ("você"), faladas como uma conversa' },
  presenter: { short: 'na voz de quem apresenta', instruction: 'na voz da pessoa apresentadora, em 1ª pessoa, conversando com o aluno e comentando o caso' },
  third_person: { short: 'acompanhando os personagens', instruction: 'narrando os personagens em 3ª pessoa e perguntando ao aluno o que ele recomendaria' },
};

const open = (label: string, description: string, href: string): AssistantAction => ({ kind: 'open', cost: 'free', label, description, params: { href } });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

export interface NextStepsOptions {
  courseId: string;
  /** resultado de `compileCourse` (padrão: compila o documento) */
  compileResults?: CourseCompileResult;
  /** jobs de mídia mais recentes por cena */
  mediaQueue?: readonly MediaQueueItem[];
  /** restringe os passos por aula a esta aula (os do curso continuam) */
  lessonId?: string;
  /** último cartão de qualidade por aula (lesson_quality); ausente = sem avaliação */
  quality?: Record<string, QualityScorecard | null | undefined>;
  /** revisão atual do rascunho (para detectar avaliação desatualizada) */
  draftRevision?: number;
}

export const MAX_NEXT_STEPS = 8;
const SEVERITY_RANK: Record<NextStep['severity'], number> = { blocker: 0, recommended: 1, optional: 2 };

/**
 * Próximos passos do curso, determinísticos: bloqueios de publicação, cenas com
 * vídeo sem fala, aulas sem direção, vídeos desatualizados (ação paga, sempre
 * sinalizada), câmeras em geração/falhas e apresentador ausente. Ordenados por
 * severidade e depois pela ordem do curso; no máximo 8. Sem pendências, sugere
 * publicar uma nova versão.
 */
export function computeNextSteps(doc: CourseDocument, opts: NextStepsOptions): NextStep[] {
  const { courseId } = opts;
  const compile = opts.compileResults ?? compileCourse(doc);
  const queue = indexMediaQueue(opts.mediaQueue);
  const lessons = allLessons(doc);
  const items: Array<{ step: NextStep; order: number }> = [];
  const push = (order: number, step: NextStep) => items.push({ order, step });

  // 1. bloqueios de publicação: erros do curso (sem aula) e por aula
  const courseErrors = compile.errors.filter((e) => !e.lessonId);
  if (courseErrors.length) {
    push(-1, {
      id: 'publish-course',
      severity: 'blocker',
      title: 'Resolva os erros do curso para publicar',
      detail: clip(`${plural(courseErrors.length, 'erro impede', 'erros impedem')} a publicação: ${courseErrors.slice(0, 2).map((e) => e.message).join('; ')}.`, 300),
      action: open('Abrir o curso', 'Abre a página do curso para corrigir.', `/estudio/cursos/${courseId}`),
    });
  }

  // 2. apresentador e câmeras (valem para o curso todo)
  const pres = doc.presentation;
  const hasVideoScenes = lessons.some((l) => directionTargetsFromGraph(l.graph).length > 0);
  if (!pres.avatarId && hasVideoScenes) {
    push(-1, {
      id: 'presenter-missing',
      severity: 'blocker',
      title: 'Escolha o apresentador',
      detail: 'Sem apresentador e voz definidos, nenhum vídeo pode ser gerado.',
      action: open('Escolher apresentador', 'Abre a etapa de apresentação do curso.', presentationHref(courseId)),
    });
  }
  const failedCams = pres.cameras.filter((c) => c.status === 'failed');
  const generatingCams = pres.cameras.filter((c) => c.status === 'generating');
  if (failedCams.length) {
    push(-1, {
      id: 'cameras-failed',
      severity: 'recommended',
      title: failedCams.length === 1 ? `A câmera "${clip(failedCams[0]!.name || failedCams[0]!.id, 40)}" falhou` : `${failedCams.length} câmeras falharam`,
      detail: 'Remova ou gere de novo; planos que usam essa câmera não podem virar vídeo.',
      action: open('Ver câmeras', 'Abre o kit de câmeras da apresentação.', presentationHref(courseId)),
    });
  }
  if (generatingCams.length) {
    push(-1, {
      id: 'cameras-generating',
      severity: 'optional',
      title: `${plural(generatingCams.length, 'câmera ainda está', 'câmeras ainda estão')} sendo gerada${generatingCams.length === 1 ? '' : 's'}`,
      detail: 'Aguarde terminar antes de gerar vídeos que usem essas câmeras.',
      action: open('Ver câmeras', 'Abre o kit de câmeras da apresentação.', presentationHref(courseId)),
    });
  }

  // 3. por aula, na ordem do curso
  lessons.forEach((lesson, index) => {
    if (opts.lessonId && lesson.id !== opts.lessonId) return;
    const lessonErrors = compile.lessons[lesson.id]?.errors ?? compile.errors.filter((e) => e.lessonId === lesson.id);
    const title = clip(lesson.title, 60);
    if (lessonErrors.length) {
      push(index, {
        id: `publish-${lesson.id}`,
        severity: 'blocker',
        title: clip(`Corrija "${title}" para publicar`, 120),
        detail: clip(`${plural(lessonErrors.length, 'erro', 'erros')}: ${lessonErrors.slice(0, 2).map((e) => e.message).join('; ')}.`, 300),
        action: open('Abrir a aula', 'Abre o editor da aula para corrigir.', lessonEditorHref(courseId, lesson.id)),
      });
    }
    // aula longa demais (aviso LESSON_TOO_LONG do compilador): encurtar antes de escrever falas e dirigir cenas que seriam removidas
    const tooLong = compile.warnings.find((w) => w.code === 'LESSON_TOO_LONG' && w.lessonId === lesson.id);
    if (tooLong) {
      push(index, {
        id: `shorten-${lesson.id}`,
        severity: 'recommended',
        title: clip(`Encurtar a aula "${title}"`, 120),
        detail: clip(tooLong.message, 300),
        action: {
          kind: 'revise_lesson', cost: 'ai', label: 'Encurtar com IA',
          description: 'A IA propõe uma versão curta: situação, uma decisão com três opções, consequências e uma dica. Você revisa antes de aplicar.',
          params: { lessonId: lesson.id, focus: 'shorten', instruction: 'Encurtar a aula para caber nos limites: no máximo 7 cenas sem o encerramento, uma decisão central com 3 opções e uma consequência por opção, textos curtos e a cena "Dica" com 3 tópicos práticos; mantenha os ids das cenas que ficarem.' },
        },
      });
    }
    const s = lessonVideoStats(lesson, queue);
    if (s.withoutNarration.length) {
      const voice = NARRATION_VOICE_INSTRUCTION[doc.brief.narrativeVoice ?? 'second_person'];
      push(index, {
        id: `narration-${lesson.id}`,
        severity: 'recommended',
        title: clip(`Escreva as falas de "${title}"`, 120),
        detail: `${plural(s.withoutNarration.length, 'cena com vídeo ainda usa', 'cenas com vídeo ainda usam')} o texto da tela como fala; fala escrita para ser dita soa mais natural.`,
        action: {
          kind: 'revise_lesson', cost: 'ai', label: 'Escrever as falas',
          description: `A IA propõe falas ${voice.short} para as cenas com vídeo; você revisa antes de aplicar.`,
          params: { lessonId: lesson.id, focus: 'tone', instruction: `Escrever falas (narration) ${voice.instruction}, para as cenas com vídeo que ainda não têm fala, sem mudar o texto da tela nem a estrutura.` },
        },
      });
    }
    if (s.undirected.length) {
      const all = s.undirected.length === s.videoSceneIds.length;
      push(index, {
        id: `direction-${lesson.id}`,
        severity: 'recommended',
        title: clip(`Dirija as cenas de "${title}"`, 120),
        detail: `${plural(s.undirected.length, 'cena com vídeo está', 'cenas com vídeo estão')} sem direção (planos, enquadramentos, slides).`,
        action: {
          kind: 'direct_lesson', cost: 'ai', label: 'Dirigir a aula',
          description: 'A IA diretora propõe os planos das cenas; você revisa antes de aplicar. Não gera vídeo.',
          params: { lessonId: lesson.id, ...(all ? {} : { nodeIds: s.undirected }) },
        },
      });
    }
    if (s.stale.length) {
      push(index, {
        id: `stale-${lesson.id}`,
        severity: 'recommended',
        title: clip(`Atualize ${plural(s.stale.length, 'vídeo', 'vídeos')} de "${title}"`, 120),
        detail: `${plural(s.stale.length, 'vídeo ficou desatualizado', 'vídeos ficaram desatualizados')} depois de mudanças no texto ou na direção. Gerar de novo é pago.`,
        action: {
          kind: 'generate_videos', cost: 'paid', label: `Regerar ${plural(s.stale.length, 'vídeo', 'vídeos')}`,
          description: `Ação paga (HeyGen/ElevenLabs): gera de novo ${plural(s.stale.length, 'vídeo', 'vídeos')}. Você confirma o custo antes.`,
          params: { lessonId: lesson.id, nodeIds: s.stale },
        },
      });
    }
    if (s.failed.length) {
      push(index, {
        id: `media-failed-${lesson.id}`,
        severity: 'recommended',
        title: clip(`${plural(s.failed.length, 'vídeo falhou', 'vídeos falharam')} em "${title}"`, 120),
        detail: 'Veja o erro na fila de produção antes de tentar de novo.',
        action: open('Ver produção', 'Abre a fila de produção de vídeos.', productionHref(courseId)),
      });
    }
    // avaliação de qualidade: recomendada quando não há cartão ou ele ficou desatualizado; com nota geral ≤ 3, os achados mais graves viram passos
    if (opts.quality && lesson.graph.nodes.length >= 3 && !lessonErrors.length) {
      const card = opts.quality[lesson.id] ?? null;
      const stale = card ? (opts.draftRevision !== undefined ? scorecardIsStale(card, opts.draftRevision) : false) : false;
      if (!card || stale) {
        push(index, {
          id: `evaluate-${lesson.id}`,
          severity: 'recommended',
          title: clip(`Avaliar a aula "${title}"`, 120),
          detail: stale ? 'A aula mudou depois da última avaliação; avalie de novo (texto e vídeos) antes de publicar.' : 'Nenhuma avaliação ainda: a IA dá notas de 1 a 5 (ensina? voz de mentor? decisões? vídeo) com correções sugeridas.',
          action: { kind: 'evaluate_lesson', cost: 'ai', label: 'Avaliar a aula', description: 'A IA avalia o roteiro e os vídeos produzidos; devolve um cartão de notas com correções. Nada é aplicado.', params: { lessonId: lesson.id } },
        });
      } else if (card.overall <= 3) {
        const top = sortFindings(card.findings).filter((f) => f.action && f.action.cost !== 'paid').slice(0, 2);
        top.forEach((f, i) => {
          push(index, {
            id: `quality-${lesson.id}-${i}`,
            severity: f.severity === 'alta' ? 'recommended' : 'optional',
            title: clip(`Qualidade ${card.overall}/5 em "${title}": ${f.problem}`, 120),
            detail: clip(`${f.evidence} — ${f.fix}`, 300),
            action: f.action,
          });
        });
        if (!top.length) {
          push(index, {
            id: `quality-${lesson.id}`,
            severity: 'recommended',
            title: clip(`Qualidade ${card.overall}/5 em "${title}"`, 120),
            detail: clip(card.summary, 300),
            action: open('Abrir a aula', 'Abre o editor da aula para corrigir.', lessonEditorHref(courseId, lesson.id)),
          });
        }
      }
    }
  });

  const pending = items.some((i) => i.step.severity !== 'optional');
  if (!pending) {
    push(Number.MAX_SAFE_INTEGER, {
      id: 'publish-new-version',
      severity: 'optional',
      title: 'Publicar nova versão',
      detail: 'Nada pendente: revise as mudanças e publique quando quiser. Quem já está matriculado continua na versão atual.',
      action: open('Revisar e publicar', 'Abre a revisão do curso.', reviewHref(courseId)),
    });
  }

  return items
    .map((it, i) => ({ ...it, i }))
    .sort((a, b) => SEVERITY_RANK[a.step.severity] - SEVERITY_RANK[b.step.severity] || a.order - b.order || a.i - b.i)
    .slice(0, MAX_NEXT_STEPS)
    .map((it) => it.step);
}

/* ------------------------------------------------------------------ */
/* Sugestões de prompt                                                 */
/* ------------------------------------------------------------------ */

export const MAX_PROMPT_SUGGESTIONS = 6;

const sug = (id: string, label: string, prompt = label): PromptSuggestion => ({ id, label, prompt });

/**
 * Atalhos de prompt para o contexto atual (no máximo 6, pt-BR). Com o
 * documento, esconde atalhos que não se aplicam (variações fora de decisão ou
 * consequência, animatic sem direção, vídeos desatualizados quando não há).
 */
export function promptSuggestions(context: AssistantContext, doc?: CourseDocument | null): PromptSuggestion[] {
  const lesson = doc && context.lessonId ? allLessons(doc).find((l) => l.id === context.lessonId) : undefined;
  const node = lesson && context.nodeId ? lesson.graph.nodes.find((n) => n.id === context.nodeId) : undefined;
  const lessonHasStale = (l: Lesson | undefined) => (l ? lessonVideoStats(l).stale.length > 0 : !doc);
  const anyStale = doc ? allLessons(doc).some((l) => lessonVideoStats(l).stale.length > 0) : true;
  const out: PromptSuggestion[] = [];

  if (context.screen === 'wizard') {
    switch (context.step) {
      case 'tema':
        out.push(sug('publico', 'Sugira um público mais específico'), sug('tom', 'Que tom combina com estagiários?'), sug('habilidade', 'Escreva uma habilidade final observável'));
        break;
      case 'conteudo':
        out.push(sug('fontes', 'Que fontes devo trazer para este tema?'), sug('lacunas', 'O que falta no conteúdo para o público?'));
        break;
      case 'estrutura':
        out.push(sug('dinamicas', 'Varie a dinâmica entre as aulas'), sug('duracao', 'A duração total está boa?'));
        break;
      case 'apresentacao':
        out.push(sug('angulo_perfil', 'Gere um ângulo de perfil'), sug('ritmo_calmo', 'Deixe o ritmo calmo'), sug('o_que_e_camera', 'O que é uma câmera?'), sug('slides', 'Coloque slides nas listas'));
        break;
      case 'aulas':
        out.push(sug('segunda_pessoa', 'Fale mais em segunda pessoa'), sug('encurtar', 'Encurte as falas longas'), sug('dinamico', 'Deixe o curso mais dinâmico'));
        break;
      case 'revisao':
        out.push(sug('impede', 'O que impede publicar?'), sug('mudou', 'Resuma o que mudou desde a última versão'));
        break;
      default:
        out.push(sug('proximo', 'Qual é o próximo passo?'));
    }
    return out.slice(0, MAX_PROMPT_SUGGESTIONS);
  }

  if (context.screen === 'production') {
    out.push(sug('falharam', 'Por que estes vídeos falharam?'), sug('falta', 'Quanto falta para terminar?'));
    if (anyStale) out.push(sug('desatualizados', 'Gere os vídeos desatualizados'));
    return out;
  }

  if (context.screen === 'review') {
    return [sug('impede', 'O que impede publicar?'), sug('mudou', 'Resuma o que mudou desde a última versão'), sug('proximo', 'Qual é o próximo passo?')];
  }

  if (context.nodeId && (node || !doc)) {
    // chips da fala: "esta fala" => o assistente limita a reescrita a esta cena
    out.push(sug('fala_pessoal', 'Reescreva esta fala mais pessoal'), sug('fala_curta', 'Reescreva esta fala mais curta'));
    if (!node || isVideoScene(node)) out.push(sug('dirigir_cena', 'Dirija esta cena'));
    if (!node || node.type === 'choice' || node.type === 'consequence') out.push(sug('variacoes', 'Crie variações desta cena'));
    if (!node || nodeHasDirection(node)) out.push(sug('animatic', 'Ver animatic'));
    if (!node || isVideoScene(node)) out.push(sug('close_pergunta', 'Use close nas perguntas ao aluno'));
    out.push(sug('fala_acolhedora', 'Reescreva esta fala mais acolhedora'));
    return out.slice(0, MAX_PROMPT_SUGGESTIONS);
  }

  if (context.lessonId && (lesson || !doc)) {
    out.push(
      sug('dinamica', 'Deixe esta aula mais dinâmica'),
      sug('close_perguntas', 'Use close nas perguntas ao aluno'),
      sug('slides_listas', 'Coloque slides nas listas'),
      sug('segunda_pessoa', 'Fale mais em segunda pessoa'),
      sug('encurtar', 'Encurte as falas longas'),
    );
    if (lessonHasStale(lesson)) out.push(sug('desatualizados', 'Gere os vídeos desatualizados'));
    return out.slice(0, MAX_PROMPT_SUGGESTIONS);
  }

  out.push(sug('proximo', 'Qual é o próximo passo?'), sug('impede', 'O que impede publicar?'), sug('curso_dinamico', 'Deixe o curso mais dinâmico'), sug('slides', 'Coloque slides nas listas'));
  if (anyStale) out.push(sug('desatualizados', 'O que está desatualizado?'));
  return out.slice(0, MAX_PROMPT_SUGGESTIONS);
}

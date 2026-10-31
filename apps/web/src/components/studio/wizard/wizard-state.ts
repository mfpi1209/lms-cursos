import {
  WIZARD_STEPS,
  allLessons,
  isRichTextEmpty,
  mediaPresentationStale,
  type AnyNode,
  type CourseDocument,
  type Lesson,
  type LessonGraph,
  type Presentation,
  type WizardStep,
} from '@lms/course-schema';

/**
 * Texto de cada passo, em linguagem de autor (sem jargão): o que você faz,
 * o que a IA faz (se faz) e o que você aprova. Duas linhas curtas, no máximo.
 */
export interface StepMeta {
  label: string;
  short: string;
  lead: string;
  youDo: string;
  aiDoes?: string;
  youApprove: string;
}

export const STEP_META: Record<WizardStep, StepMeta> = {
  tema: {
    label: 'Ideia e público',
    short: 'Ideia',
    lead: 'Diga em poucas palavras sobre o que é o curso e para quem ele é.',
    youDo: 'Conta a ideia, escolhe o público e o tom.',
    aiDoes: 'Usa isso em tudo o que escrever: estrutura, cenas e falas.',
    youApprove: 'Nada ainda: só o que você escreve aqui.',
  },
  conteudo: {
    label: 'Material',
    short: 'Material',
    lead: 'Cole um texto, envie um arquivo ou deixe a IA partir só da sua ideia.',
    youDo: 'Traz o material que a IA deve usar (opcional).',
    aiDoes: 'Lê o material e usa seus exemplos e termos nas aulas.',
    youApprove: 'Quais fontes entram.',
  },
  estrutura: {
    label: 'Estrutura',
    short: 'Estrutura',
    lead: 'Objetivos, módulos e aulas. Peça uma proposta à IA ou monte à mão.',
    youDo: 'Pede uma proposta ou escreve as aulas à mão.',
    aiDoes: 'Propõe objetivos, módulos e aulas para a duração escolhida.',
    youApprove: 'A proposta, antes de ela virar a estrutura do curso.',
  },
  aulas: {
    label: 'Aulas',
    short: 'Aulas',
    lead: 'Cada aula vira cenas e decisões. A IA escreve; você revisa no storyboard.',
    youDo: 'Escolhe quais aulas gerar e revisa o resultado.',
    aiDoes: 'Escreve as cenas, as decisões e as falas de cada aula.',
    youApprove: 'Cada proposta de aula, antes de ela entrar no curso.',
  },
  apresentacao: {
    label: 'Apresentação',
    short: 'Apresentação',
    lead: 'Quem apresenta, com que voz e em que ambiente. Vale para todas as cenas.',
    youDo: 'Escolhe apresentador, voz, fundo e formato.',
    aiDoes: 'Pode gerar novos ângulos de câmera (ação paga, só se você pedir).',
    youApprove: 'Cada câmera nova e a apresentação do curso.',
  },
  previa: {
    label: 'Prévia',
    short: 'Prévia',
    lead: 'Teste o curso como aluno antes de gastar com vídeo.',
    youDo: 'Percorre as aulas e confere a lista de verificação.',
    youApprove: 'Que o texto está pronto para virar vídeo.',
  },
  producao: {
    label: 'Produção de vídeo',
    short: 'Vídeos',
    lead: 'Gere os vídeos das cenas com o apresentador. É a única etapa paga.',
    youDo: 'Pede o orçamento e acompanha a fila.',
    aiDoes: 'Produz um vídeo por cena, com a voz e o fundo escolhidos.',
    youApprove: 'O orçamento, antes de qualquer vídeo ser gerado.',
  },
  revisao: {
    label: 'Publicar',
    short: 'Publicar',
    lead: 'Confira a lista final e publique uma versão para os alunos.',
    youDo: 'Resolve o que falta e publica.',
    youApprove: 'A versão que os alunos vão receber.',
  },
};

export const stepIndex = (step: WizardStep) => WIZARD_STEPS.indexOf(step);
export const stepAt = (i: number): WizardStep | undefined => WIZARD_STEPS[i];
export const isWizardStep = (x: unknown): x is WizardStep => typeof x === 'string' && (WIZARD_STEPS as readonly string[]).includes(x);

/** Até onde o autor pode navegar: qualquer passo concluído, mais o seguinte ao último concluído. */
export function maxReachableIndex(doc: CourseDocument): number {
  const done = doc.wizard.completedSteps.map(stepIndex);
  const base = done.length ? Math.max(...done) + 1 : 0;
  return Math.max(base, stepIndex(doc.wizard.step));
}

/** Motivo pelo qual o passo ainda não pode ser concluído, ou null quando pode. */
export function blockerFor(step: WizardStep, doc: CourseDocument): string | null {
  switch (step) {
    case 'tema':
      if (!doc.title.trim()) return 'Dê um título ao curso.';
      if (!doc.brief.topic.trim()) return 'Diga em uma frase sobre o que é o curso.';
      return null;
    case 'conteudo':
      if (doc.wizard.contentMode === 'none' && doc.sourceIds.length === 0) return 'Escolha de onde vem o conteúdo: cole um texto, envie um arquivo ou gere a partir da sua ideia.';
      return null;
    case 'estrutura':
      if (allLessons(doc).length === 0) return 'O curso precisa de pelo menos uma aula.';
      return null;
    case 'aulas':
      if (allLessons(doc).every((l) => lessonStats(l).empty)) return 'Gere ou escreva as cenas de pelo menos uma aula.';
      return null;
    case 'apresentacao':
      if (!doc.presentation.avatarId) return 'Escolha quem vai apresentar o curso.';
      return null;
    case 'previa':
    case 'producao':
    case 'revisao':
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Estado de cada passo (chip no cabeçalho e na trilha)                 */
/* ------------------------------------------------------------------ */

export type StepStatus = 'not_started' | 'in_progress' | 'ready' | 'stale';

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  ready: 'Pronto',
  stale: 'Desatualizado',
};

/** Informações que só o cliente tem (fila de vídeos, fontes). Tudo opcional. */
export interface StepStatusContext {
  /** fontes ainda sendo lidas (PDF) */
  sourcesProcessing?: number;
  /** fontes que falharam */
  sourcesFailed?: number;
  /** vídeos na fila ou em produção */
  videosGenerating?: number;
  /** vídeos desatualizados (texto, direção ou apresentação mudou depois do vídeo) */
  videosStale?: number;
}

/** Estado de um passo, lido do documento (e do contexto do cliente, quando houver). */
export function stepStatus(step: WizardStep, doc: CourseDocument, ctx: StepStatusContext = {}): StepStatus {
  const done = doc.wizard.completedSteps.includes(step);
  const lessons = allLessons(doc);
  switch (step) {
    case 'tema': {
      if (doc.title.trim() && doc.brief.topic.trim()) return 'ready';
      return doc.title.trim() || doc.brief.topic.trim() ? 'in_progress' : 'not_started';
    }
    case 'conteudo': {
      if ((ctx.sourcesProcessing ?? 0) > 0) return 'in_progress';
      if (doc.sourceIds.length > 0 || doc.wizard.contentMode === 'generate') return 'ready';
      return doc.wizard.contentMode !== 'none' ? 'in_progress' : 'not_started';
    }
    case 'estrutura':
      if (lessons.length > 0) return 'ready';
      return doc.objectives.length > 0 || doc.modules.length > 0 ? 'in_progress' : 'not_started';
    case 'aulas': {
      if (lessons.length === 0) return 'not_started';
      const withScenes = lessons.filter((l) => !lessonStats(l).empty).length;
      if (withScenes === lessons.length) return 'ready';
      return withScenes > 0 ? 'in_progress' : 'not_started';
    }
    case 'apresentacao':
      if (doc.presentation.avatarId) return 'ready';
      return doc.presentation.voiceId || doc.presentation.cameras.length ? 'in_progress' : 'not_started';
    case 'previa':
      return done ? 'ready' : 'not_started';
    case 'producao': {
      const t = courseMediaTotals(doc);
      if ((ctx.videosStale ?? 0) > 0) return 'stale';
      if (t.eligible === 0) return done ? 'ready' : 'not_started';
      if (t.withMedia >= t.eligible) return 'ready';
      // passou pelo passo mas ainda faltam vídeos: em andamento (publicar sem vídeo é permitido, mas não é "pronto")
      return t.withMedia > 0 || (ctx.videosGenerating ?? 0) > 0 || done ? 'in_progress' : 'not_started';
    }
    case 'revisao':
      return doc.wizard.finished ? 'ready' : done ? 'in_progress' : 'not_started';
  }
}

/** Primeiro passo que ainda não está pronto (na ordem da trilha); sem pendência, o último. */
export function nextStepFor(doc: CourseDocument, ctx: StepStatusContext = {}): WizardStep {
  for (const s of WIZARD_STEPS) {
    const st = stepStatus(s, doc, ctx);
    if (st !== 'ready') return s;
  }
  return WIZARD_STEPS[WIZARD_STEPS.length - 1]!;
}

/* ------------------------------------------------------------------ */
/* Leituras sobre cenas e mídia                                        */
/* ------------------------------------------------------------------ */

export type MediaNode = Extract<AnyNode, { type: 'scenario' | 'content' | 'choice' | 'consequence' }>;

export function isMediaNode(n: AnyNode): n is MediaNode {
  return n.type === 'scenario' || n.type === 'content' || n.type === 'choice' || n.type === 'consequence';
}

export function nodeText(n: AnyNode) {
  if (n.type === 'choice') return n.prompt;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return n.body;
  return undefined;
}

export interface LessonStats {
  /** blocos que o aluno vê (tudo menos o encerramento) */
  scenes: number;
  decisions: number;
  /** cenas que podem receber vídeo e têm texto */
  mediaEligible: number;
  withMedia: number;
  /** só o grafo mínimo (situação vazia → encerramento) */
  empty: boolean;
}

/** Vídeo atualizado: existe, o texto não mudou e (quando se sabe) a apresentação é a mesma. */
export function hasCurrentMedia(n: MediaNode, presentation?: Presentation): boolean {
  return !!n.media && !n.media.stale && !mediaPresentationStale(n.media, presentation, n);
}

export function lessonStats(lesson: Lesson, presentation?: Presentation): LessonStats {
  return graphStats(lesson.graph, presentation);
}

export function graphStats(graph: LessonGraph, presentation?: Presentation): LessonStats {
  const nodes = graph.nodes;
  const scenes = nodes.filter((n) => n.type !== 'end').length;
  const decisions = nodes.filter((n) => n.type === 'choice').length;
  const eligible = nodes.filter((n): n is MediaNode => isMediaNode(n) && !isRichTextEmpty(nodeText(n)));
  const withMedia = eligible.filter((n) => hasCurrentMedia(n, presentation)).length;
  // vazia = grafo mínimo (situação→encerramento) sem texto, ou o placeholder criado ao aplicar a estrutura (inicio→fim)
  const placeholder = nodes.length <= 2 && nodes.some((n) => n.id === 'inicio') && nodes.some((n) => n.id === 'fim' && n.type === 'end');
  const empty = placeholder || (nodes.length <= 2 && nodes.every((n) => n.type === 'end' || isRichTextEmpty(nodeText(n))));
  return { scenes, decisions, mediaEligible: eligible.length, withMedia, empty };
}

/** Cenas sem vídeo (ou com vídeo desatualizado) em todo o curso, na ordem das aulas. */
export function scenesWithoutMedia(doc: CourseDocument): { lessonId: string; lessonTitle: string; nodeId: string; nodeTitle: string }[] {
  const out: { lessonId: string; lessonTitle: string; nodeId: string; nodeTitle: string }[] = [];
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      for (const n of l.graph.nodes) {
        if (!isMediaNode(n) || isRichTextEmpty(nodeText(n))) continue;
        if (hasCurrentMedia(n, doc.presentation)) continue;
        out.push({ lessonId: l.id, lessonTitle: l.title, nodeId: n.id, nodeTitle: n.title ?? n.id });
      }
    }
  }
  return out;
}

export function courseMediaTotals(doc: CourseDocument) {
  let eligible = 0;
  let withMedia = 0;
  for (const l of doc.modules.flatMap((m) => m.lessons)) {
    const s = lessonStats(l, doc.presentation);
    eligible += s.mediaEligible;
    withMedia += s.withMedia;
  }
  return { eligible, withMedia };
}

/**
 * Nomes de looks/vozes do provedor costumam ser técnicos ("professora_1-teal").
 * Quando o nome tem `-`/`_` e dígitos, devolve uma versão legível
 * ("Professora 1 · teal"); o nome cru fica para o tooltip.
 */
export function humanName(raw: string): { label: string; technical: boolean } {
  const technical = /[-_]/.test(raw) && /\d/.test(raw);
  if (!technical) return { label: raw, technical };
  const parts = raw
    .split(/\s*-\s*/)
    .map((part) =>
      part
        .replace(/_/g, ' ')
        .replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    // "professora-1-teal": o número fica junto da palavra anterior ("Professora 1 · teal"), não vira uma parte solta
    .reduce<string[]>((acc, part) => {
      if (/^\d+$/.test(part) && acc.length) acc[acc.length - 1] = `${acc[acc.length - 1]} ${part}`;
      else acc.push(part);
      return acc;
    }, []);
  const label = parts.join(' · ');
  return { label: label ? label.charAt(0).toUpperCase() + label.slice(1) : raw, technical };
}

/** Parece um identificador de arquivo/asset (ex.: "ast_x7k…", "a1b2c3…"), não um nome para mostrar. */
const looksLikeId = (s: string) => /^(ast|asset|img|file)[_-]/i.test(s) || /^[a-z0-9_-]{16,}$/i.test(s.replace(/\.[a-z0-9]+$/i, ''));

/** Nome amigável de uma imagem de fundo: sem extensão; ids e nomes de 1–2 caracteres viram "Imagem N" (ou "Imagem"). */
export function backgroundImageLabel(name: string | undefined, index?: number): string {
  const base = (name ?? '').trim().replace(/\.(png|jpe?g|webp|gif|svg)$/i, '');
  if (base.length < 3 || looksLikeId(base)) return index === undefined ? 'Imagem' : `Imagem ${index + 1}`;
  return base.replace(/[_-]+/g, ' ');
}

/** Nome do apresentador para exibir (nunca o id cru): o nome gravado, humanizado se vier técnico. */
export function presenterDisplayName(p: Pick<CourseDocument['presentation'], 'avatarId' | 'avatarName'>): string {
  if (p.avatarName?.trim()) return humanName(p.avatarName.trim()).label;
  return p.avatarId ? 'Apresentador escolhido' : 'Sem apresentador';
}

export function presentationSummary(p: CourseDocument['presentation']): string {
  const parts = [
    presenterDisplayName(p),
    p.voiceName ? `Voz ${humanName(p.voiceName).label}` : p.voiceId ? 'Voz escolhida' : 'Sem voz',
    p.background.type === 'color' ? (p.background.name ?? `Fundo ${p.background.value}`) : `Fundo: ${backgroundImageLabel(p.background.name)}`,
    p.aspectRatio,
  ];
  return parts.join(' · ');
}

/** Durações alvo oferecidas (min); 15 é a recomendada (≈ 3 min por aula). Rascunhos com outros valores (ex.: 45) continuam válidos. */
export const DURATION_CHIPS = [10, 15, 20, 30] as const;
export const RECOMMENDED_DURATION = 15;

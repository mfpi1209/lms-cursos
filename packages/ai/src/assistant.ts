import { z } from 'zod';
import { compileCourse, findLesson, NODE_TYPE_LABELS, zoneCamerasOf, type AnyNode, type CourseCompileResult, type CourseDocument, type Lesson } from '@lms/course-schema';
import { isUnusableOutput } from './adapter';
import type { FakeLlmAdapter } from './fake';
import { generateWithFallback, type AdapterSet } from './registry';
import { REVISION_FOCUS, RevisionFocusSchema, VARIATION_SCENE_TYPES, type RevisionFocus } from './schemas';
import { directionTargetsFromGraph } from './direction';
import { videoCapabilitiesText } from './capabilities';
import { ASSISTANT_INSTRUCTIONS_VERSION, SYSTEM_ASSISTANT, TASK_ASSISTANT_REPAIR } from './assistant-prompts';
import { AssistantActionSchema, AssistantReplySchema, offeredCardKinds, type AssistantAction, type AssistantActionKind, type AssistantContext, type AssistantReply, type NextStep } from './assistant-schema';
import { computeNextSteps, indexMediaQueue, isVideoScene, lessonEditorHref, lessonVideoStats, nodeHasDirection, nodeHasNarration, presentationHref, productionHref, reviewHref, sceneMediaState, type MediaQueueItem, type SceneMediaState } from './next-steps';

/* ------------------------------------------------------------------ */
/* Resumo do curso para o assistente                                   */
/* ------------------------------------------------------------------ */

export interface AssistantSceneSummary {
  id: string;
  type: AnyNode['type'];
  title: string;
  /** cena que vira vídeo do apresentador */
  video: boolean;
  hasNarration: boolean;
  hasDirection: boolean;
  media: SceneMediaState;
}

export interface AssistantLessonSummary {
  id: string;
  title: string;
  moduleTitle: string;
  scenes: number;
  videoScenes: number;
  directed: number;
  withoutNarration: number;
  staleVideos: number;
  missingVideos: number;
  generating: number;
  failedVideos: number;
  /** true quando todas as cenas com vídeo têm fala escrita */
  hasNarration: boolean;
  errors: number;
}

export interface AssistantCourseSummary {
  title: string;
  /** uma linha por campo preenchido do briefing */
  brief: string[];
  lessons: AssistantLessonSummary[];
  focusLesson?: { id: string; title: string; scenes: AssistantSceneSummary[] };
  focusNode?: { id: string; title: string; type: AnyNode['type'] };
  presentation: {
    presenter: string | null;
    voice: string | null;
    cameras: { ready: number; generating: number; failed: number; names: string[] };
    directionStyle: CourseDocument['presentation']['directionStyle'];
  };
  validation: { ok: boolean; errors: number; warnings: number; topErrors: string[] };
  media: { waiting: number; generating: number; failed: number };
  nextSteps: NextStep[];
  /** rotas reais do estúdio para cartões `open` (só com courseId) */
  routes: Array<{ label: string; href: string }>;
}

export interface BuildAssistantContextOptions {
  courseId?: string;
  compile?: CourseCompileResult;
  mediaQueue?: readonly MediaQueueItem[];
  nextSteps?: NextStep[];
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const oneLine = (s: string, max = 160) => clip(s.replace(/\s+/g, ' ').trim(), max);

const BRIEF_LABELS: Array<[keyof CourseDocument['brief'], string]> = [
  ['topic', 'tema'],
  ['audience', 'público'],
  ['context', 'contexto'],
  ['finalSkill', 'habilidade final'],
  ['tone', 'tom'],
  ['narrativeVoice', 'ponto de vista'],
  ['targetMinutes', 'duração alvo (min)'],
];

/** Resumo compacto do curso (títulos, contagens e ids válidos) para o assistente e a UI. */
export function buildAssistantContext(doc: CourseDocument, ctx: AssistantContext, opts: BuildAssistantContextOptions = {}): AssistantCourseSummary {
  const compile = opts.compile ?? compileCourse(doc);
  const queue = indexMediaQueue(opts.mediaQueue);
  const lessons: AssistantLessonSummary[] = [];
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      const s = lessonVideoStats(l, queue);
      lessons.push({
        id: l.id,
        title: oneLine(l.title, 120),
        moduleTitle: oneLine(m.title, 80),
        scenes: l.graph.nodes.length,
        videoScenes: s.videoSceneIds.length,
        directed: s.directed.length,
        withoutNarration: s.withoutNarration.length,
        staleVideos: s.stale.length,
        missingVideos: s.missing.length,
        generating: s.generating.length,
        failedVideos: s.failed.length,
        hasNarration: s.videoSceneIds.length > 0 && s.withoutNarration.length === 0,
        errors: compile.lessons[l.id]?.errors.length ?? 0,
      });
    }
  }
  const focus = ctx.lessonId ? findLesson(doc, ctx.lessonId)?.lesson : undefined;
  const focusLesson = focus
    ? {
        id: focus.id,
        title: oneLine(focus.title, 120),
        scenes: focus.graph.nodes.slice(0, 80).map((n) => ({
          id: n.id,
          type: n.type,
          title: oneLine(n.title ?? n.id, 80),
          video: isVideoScene(n),
          hasNarration: nodeHasNarration(n),
          hasDirection: nodeHasDirection(n),
          media: isVideoScene(n) ? sceneMediaState(focus.id, n, queue) : ('none' as const),
        })),
      }
    : undefined;
  const node = focus && ctx.nodeId ? focus.graph.nodes.find((n) => n.id === ctx.nodeId) : undefined;
  const pres = doc.presentation;
  const items = [...queue.values()];
  return {
    title: oneLine(doc.title, 160),
    brief: BRIEF_LABELS.map(([k, label]) => [label, String(doc.brief[k] ?? '').trim()] as const).filter(([, v]) => v).map(([label, v]) => `${label}: ${oneLine(v)}`),
    lessons,
    focusLesson,
    focusNode: node ? { id: node.id, title: oneLine(node.title ?? node.id, 80), type: node.type } : undefined,
    presentation: {
      presenter: pres.avatarId ? oneLine(pres.avatarName || pres.avatarId, 80) : null,
      voice: pres.voiceId ? oneLine(`${pres.voiceName || pres.voiceId}${pres.voiceProvider ? ` (${pres.voiceProvider})` : ''}`, 80) : null,
      cameras: {
        ready: pres.cameras.filter((c) => c.status === 'ready').length,
        generating: pres.cameras.filter((c) => c.status === 'generating').length,
        failed: pres.cameras.filter((c) => c.status === 'failed').length,
        names: pres.cameras.map((c) => `${oneLine(c.name || c.id, 40)} (${c.angle}, ${c.nativeFraming}, ${c.status})`),
      },
      directionStyle: pres.directionStyle,
    },
    validation: { ok: compile.ok, errors: compile.errors.length, warnings: compile.warnings.length, topErrors: compile.errors.slice(0, 5).map((e) => oneLine(e.message, 200)) },
    media: {
      waiting: items.filter((q) => q.status === 'queued').length,
      generating: items.filter((q) => q.status === 'running').length,
      failed: items.filter((q) => q.status === 'failed' || q.status === 'reconciliation_required').length,
    },
    nextSteps: opts.nextSteps ?? (opts.courseId ? computeNextSteps(doc, { courseId: opts.courseId, compileResults: compile, mediaQueue: opts.mediaQueue }) : []),
    routes: opts.courseId ? courseRoutes(doc, opts.courseId) : [],
  };
}

/** Rotas do estúdio que o assistente pode abrir (curso, cada aula, apresentação, produção, revisão). */
export function courseRoutes(doc: CourseDocument, courseId: string): Array<{ label: string; href: string }> {
  const lessons = doc.modules.flatMap((m) => m.lessons).slice(0, 60);
  return [
    { label: 'página do curso', href: `/estudio/cursos/${courseId}` },
    ...lessons.map((l) => ({ label: `editor da aula ${l.id} ("${oneLine(l.title, 60)}")`, href: lessonEditorHref(courseId, l.id) })),
    { label: 'apresentação (apresentador, voz, câmeras, estilo de direção)', href: presentationHref(courseId) },
    { label: 'produção de vídeos (fila)', href: productionHref(courseId) },
    { label: 'revisão e publicação', href: reviewHref(courseId) },
  ];
}

const MEDIA_LABEL: Record<SceneMediaState, string> = { none: 'sem vídeo', ready: 'pronto', stale: 'desatualizado', generating: 'gerando', failed: 'falhou' };
const SCREEN_LABEL: Record<AssistantContext['screen'], string> = { course: 'página do curso', wizard: 'assistente de montagem', storyboard: 'roteiro da aula (storyboard)', production: 'produção de vídeos', review: 'revisão e publicação' };

/** Remove marcações que poderiam fechar os blocos da entrada (texto do usuário e do curso é dado). */
function data(s: string): string {
  return s.replace(/<\/?\s*(tela|curso|estado|capacidades|conversa|pedido)\s*>/gi, '');
}

export interface AssistantInputArgs {
  summary: AssistantCourseSummary;
  context: AssistantContext;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  capabilities: string;
}

/** Entrada do roteador: <tela>, <curso>, <estado>, <capacidades>, <conversa>, <pedido>. */
export function buildAssistantInput(args: AssistantInputArgs): string {
  const { summary: s, context: c } = args;
  const tela = [`tela: ${SCREEN_LABEL[c.screen]}`];
  if (c.step) tela.push(`passo do assistente de montagem: ${data(c.step)}`);
  if (s.focusLesson) tela.push(`aula em foco: ${s.focusLesson.id} ("${data(s.focusLesson.title)}")`);
  if (s.focusNode) tela.push(`cena em foco: ${s.focusNode.id} ("${data(s.focusNode.title)}", ${NODE_TYPE_LABELS[s.focusNode.type]})`);

  const curso = [`título: ${data(s.title)}`];
  if (s.brief.length) curso.push(`briefing:\n${s.brief.map((b) => `- ${data(b)}`).join('\n')}`);
  curso.push(
    `aulas:\n${s.lessons.length
      ? s.lessons
          .slice(0, 60)
          .map((l) => `- id: ${l.id} | "${data(l.title)}" | módulo "${data(l.moduleTitle)}" | ${l.scenes} cenas, ${l.videoScenes} com vídeo, ${l.directed} dirigidas, ${l.withoutNarration} sem fala, ${l.staleVideos} vídeos desatualizados, ${l.missingVideos} sem vídeo${l.generating ? `, ${l.generating} gerando` : ''}${l.failedVideos ? `, ${l.failedVideos} falharam` : ''} | erros: ${l.errors}`)
          .join('\n')
      : '(nenhuma aula)'}`,
  );
  if (s.routes.length) curso.push(`rotas (use exatamente estes href em open):\n${s.routes.map((r) => `- ${data(r.label)}: ${r.href}`).join('\n')}`);
  if (s.focusLesson) {
    curso.push(
      `cenas da aula em foco (${s.focusLesson.id}), em ordem:\n${s.focusLesson.scenes
        .map((n) => `- id: ${n.id} | ${NODE_TYPE_LABELS[n.type]} | "${data(n.title)}"${n.video ? ` | fala: ${n.hasNarration ? 'sim' : 'não'} | direção: ${n.hasDirection ? 'sim' : 'não'} | vídeo: ${MEDIA_LABEL[n.media]}` : ' | sem vídeo'}`)
        .join('\n')}`,
    );
  }

  const p = s.presentation;
  const estado = [
    `apresentador: ${p.presenter ? data(p.presenter) : 'NÃO ESCOLHIDO'} | voz: ${p.voice ? data(p.voice) : 'não escolhida'}`,
    `câmeras: ${p.cameras.ready} prontas, ${p.cameras.generating} gerando, ${p.cameras.failed} com falha${p.cameras.names.length ? ` (${p.cameras.names.map(data).join('; ')})` : ''}`,
    `estilo de direção do curso: ritmo ${p.directionStyle.pace}, slides ${p.directionStyle.useSlides ? 'ligados' : 'desligados'}, cenas em movimento até ${p.directionStyle.maxCinematicPerLesson} por aula`,
    `validação: ${s.validation.ok ? 'sem erros (pode publicar)' : `${s.validation.errors} erro(s) bloqueiam a publicação`}, ${s.validation.warnings} aviso(s)${s.validation.topErrors.length ? `\nprimeiros erros:\n${s.validation.topErrors.map((e) => `- ${data(e)}`).join('\n')}` : ''}`,
    `fila de vídeos: ${s.media.waiting} esperando, ${s.media.generating} gerando, ${s.media.failed} falharam`,
  ];
  if (s.nextSteps.length) estado.push(`próximos passos:\n${s.nextSteps.map((n) => `- [${n.severity}] ${data(n.title)}: ${data(n.detail)}`).join('\n')}`);

  const parts = [
    `<tela>\n${tela.join('\n')}\n</tela>`,
    `<curso>\n${curso.join('\n')}\n</curso>`,
    `<estado>\n${estado.join('\n')}\n</estado>`,
    `<capacidades>\n${args.capabilities}\n</capacidades>`,
  ];
  const history = (args.history ?? []).slice(-10);
  // o sufixo "[cartões: …]" das respostas fica inteiro (confirmação de cartões pagos)
  const historyLine = (h: { role: string; text: string }) => {
    const cards = h.role === 'assistant' ? offeredCardKinds(h.text) : [];
    const suffix = cards.length ? ` ${/\[cartões: [^\]]*\]\s*$/.exec(h.text)![0].trim()}` : '';
    const body = suffix ? h.text.replace(/\s*\[cartões: [^\]]*\]\s*$/, '') : h.text;
    return `${h.role === 'user' ? 'pessoa' : 'assistente'}: ${data(oneLine(body, 600))}${data(suffix)}`;
  };
  if (history.length) parts.push(`<conversa>\n${history.map(historyLine).join('\n')}\n</conversa>`);
  parts.push(`<pedido>\n${data(args.message.trim().slice(0, 2000))}\n</pedido>`);
  parts.push('Responda ao pedido seguindo as regras do sistema: reply curto e até 4 ações, só com ids de <curso>.');
  return parts.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* Saída estruturada do modelo (formato plano, campos nulos)           */
/* ------------------------------------------------------------------ */

export const ASSISTANT_ACTION_KINDS = ['revise_lesson', 'direct_lesson', 'scene_variations', 'evaluate_lesson', 'update_direction_style', 'preview_animatic', 'open', 'generate_videos', 'generate_angle'] as const satisfies readonly AssistantActionKind[];

export const ACTION_COSTS: Record<AssistantActionKind, AssistantAction['cost']> = {
  revise_lesson: 'ai',
  direct_lesson: 'ai',
  scene_variations: 'ai',
  evaluate_lesson: 'ai',
  update_direction_style: 'free',
  preview_animatic: 'free',
  open: 'free',
  generate_videos: 'paid',
  generate_angle: 'paid',
};

/**
 * Formato pedido ao modelo: plano e com todos os campos obrigatórios (nulos
 * quando não se aplicam), compatível com saída estruturada estrita. O custo
 * não vem do modelo: é fixado pelo tipo da ação.
 */
export const AssistantProposalActionSchema = z.object({
  kind: z.enum(ASSISTANT_ACTION_KINDS),
  label: z.string().describe('texto do botão, até 6 palavras'),
  description: z.string().describe('uma frase: o que acontece e o custo'),
  lessonId: z.string().nullable().describe('id de aula de <curso>'),
  nodeId: z.string().nullable().describe('id de cena de <curso> (scene_variations, preview_animatic)'),
  includeVideo: z.boolean().nullable().describe('evaluate_lesson: avaliar também os vídeos produzidos (padrão true)'),
  nodeIds: z.array(z.string()).nullable().describe('ids de cenas: direct_lesson e revise_lesson (null = aula toda); generate_videos (null = as cenas desatualizadas e sem vídeo da aula)'),
  focus: z.enum(REVISION_FOCUS).nullable(),
  instruction: z.string().nullable().describe('pedido claro para a IA (revise_lesson, direct_lesson)'),
  pace: z.enum(['calm', 'balanced', 'dynamic']).nullable(),
  useSlides: z.boolean().nullable(),
  maxCinematicPerLesson: z.number().int().nullable().describe('cenas em movimento por aula (0 a 6; 0 desliga)'),
  href: z.string().nullable().describe('uma das rotas listadas em <curso> (open)'),
  angle: z.enum(['front', 'left', 'right', 'high', 'low']).nullable(),
  framing: z.enum(['wide', 'medium', 'close', 'extreme_close']).nullable(),
  extra: z.string().nullable(),
});
export type AssistantProposalAction = z.infer<typeof AssistantProposalActionSchema>;

export const AssistantReplyProposalSchema = z.object({
  reply: z.string().describe('resposta curta em pt-BR, até 3 frases'),
  actions: z.array(AssistantProposalActionSchema).describe('no máximo 4 ações'),
});
export type AssistantReplyProposal = z.infer<typeof AssistantReplyProposalSchema>;

const nn = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
const txt = (v: string | null | undefined, max: number) => {
  const t = v?.trim();
  return t ? clip(t, max) : undefined;
};

/** Converte a ação plana do modelo no contrato `AssistantAction` (sem validar ids). */
export function proposalToAction(p: AssistantProposalAction): unknown {
  const base = { kind: p.kind, cost: ACTION_COSTS[p.kind], label: clip(p.label.trim() || p.kind, 80), description: clip(p.description.trim(), 300) };
  switch (p.kind) {
    case 'revise_lesson':
      return { ...base, params: { lessonId: p.lessonId, focus: nn(p.focus), instruction: txt(p.instruction, 2000) ?? '', nodeIds: p.nodeIds?.length ? p.nodeIds.slice(0, 200) : undefined } };
    case 'direct_lesson':
      return { ...base, params: { lessonId: p.lessonId, nodeIds: p.nodeIds?.length ? p.nodeIds.slice(0, 200) : undefined, instruction: txt(p.instruction, 2000) } };
    case 'scene_variations':
    case 'preview_animatic':
      return { ...base, params: { lessonId: p.lessonId, nodeId: p.nodeId } };
    case 'evaluate_lesson':
      return { ...base, params: { lessonId: p.lessonId, includeVideo: p.includeVideo === false ? false : undefined } };
    case 'update_direction_style':
      return { ...base, params: { pace: nn(p.pace), useSlides: nn(p.useSlides), maxCinematicPerLesson: nn(p.maxCinematicPerLesson) } };
    case 'open':
      return { ...base, params: { href: p.href } };
    case 'generate_videos':
      // null/vazio = desatualizados + sem vídeo da aula (resolvido em sanitizeActions)
      return { ...base, params: { lessonId: p.lessonId, nodeIds: p.nodeIds?.length ? p.nodeIds.slice(0, 200) : null } };
    case 'generate_angle':
      return { ...base, params: { angle: p.angle, framing: p.framing, extra: txt(p.extra, 300) } };
  }
}

/* ------------------------------------------------------------------ */
/* Validação das ações (ids, custo, pedido explícito para pagas)       */
/* ------------------------------------------------------------------ */

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Verbos de geração (texto já normalizado, sem acentos). "cria/criar" não contam. */
const GENERATION_VERB_RE = /^(gera(r|m|ndo|d[oa]s?|-?l[oa]s?|rem|ria\w*)?|gere(m)?|regera\w*|regere\w*|produz\w*|renderiz\w*|refa(ca|cam|zer|z|zendo)|atualiz(e|em|ar|a))$/;
const NEGATION = new Set(['nao', 'nunca', 'sem']);
const CONFIRMATION_RE = /^(sim|pode|confirmo|confirma|ok|okay|isso|claro|manda|vai|bora|faca|faz|quero)\b/;

function tokens(message: string): string[] {
  return normalizeText(message).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
}

/** Há um verbo de geração não negado ("não/nunca/sem" até 2 palavras antes)? */
export function hasGenerationVerb(message: string): boolean {
  const t = tokens(message);
  return t.some((w, i) => GENERATION_VERB_RE.test(w) && !t.slice(Math.max(0, i - 2), i).some((x) => NEGATION.has(x)));
}

/** Pedido explícito de geração (verbo não negado). Para liberar um cartão pago use `paidActionAllowed`. */
export function isExplicitGenerationRequest(message: string): boolean {
  return hasGenerationVerb(message);
}

/** Pedido explícito por tipo pago: verbo de geração + o objeto certo (vídeo(s); câmera/ângulo/look). */
export function paidIntent(message: string): { videos: boolean; angle: boolean } {
  if (!hasGenerationVerb(message)) return { videos: false, angle: false };
  const m = normalizeText(message);
  return { videos: /\bvideos?\b/.test(m), angle: /\b(cameras?|angulos?|looks?)\b/.test(m) };
}

/** Resposta curta de confirmação ("sim", "pode", "confirmo", "pode gerar"). */
export function isShortConfirmation(message: string): boolean {
  const t = tokens(message);
  if (!t.length || t.length > 4 || NEGATION.has(t[0]!)) return false;
  return CONFIRMATION_RE.test(t.join(' ')) || (t.length <= 2 && hasGenerationVerb(message));
}

type HistoryEntry = { role: 'user' | 'assistant'; text: string };

/**
 * Ação paga liberada? Pedido explícito com verbo + objeto do tipo, ou uma
 * confirmação curta logo depois de o assistente oferecer o MESMO cartão pago
 * (o histórico traz "[cartões: …]", ver `assistantHistoryText`).
 */
export function paidActionAllowed(kind: AssistantActionKind, message: string, history: readonly HistoryEntry[] = []): boolean {
  const intent = paidIntent(message);
  if (kind === 'generate_videos' && intent.videos) return true;
  if (kind === 'generate_angle' && intent.angle) return true;
  if (!isShortConfirmation(message)) return false;
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  return !!lastAssistant && offeredCardKinds(lastAssistant.text).includes(kind);
}

export interface SanitizeOptions {
  courseId?: string;
  /** texto do pedido; ações pagas sem pedido explícito de geração são descartadas */
  message?: string;
  /** conversa anterior (confirmação curta de um cartão pago oferecido) */
  history?: readonly HistoryEntry[];
  /** fila de mídia (cenas gerando ficam fora de generate_videos sem nodeIds) */
  mediaQueue?: readonly MediaQueueItem[];
}

export interface DroppedAction {
  kind: string;
  reason: string;
}

type CheckResult = { ok: true; action: AssistantAction } | { ok: false; reason: string };

function checkAction(action: AssistantAction, doc: CourseDocument, opts: SanitizeOptions): CheckResult {
  const lessonOf = (id: string) => findLesson(doc, id)?.lesson;
  const nodeOf = (l: Lesson, id: string) => l.graph.nodes.find((n) => n.id === id);
  switch (action.kind) {
    case 'revise_lesson': {
      const l = lessonOf(action.params.lessonId);
      if (!l) return { ok: false, reason: 'aula inexistente' };
      if (!action.params.instruction.trim() && !action.params.focus) return { ok: false, reason: 'sem pedido' };
      const focus = action.params.focus && RevisionFocusSchema.safeParse(action.params.focus).success ? action.params.focus : undefined;
      let nodeIds: string[] | undefined;
      if (action.params.nodeIds?.length) {
        const ids = new Set(l.graph.nodes.map((n) => n.id));
        nodeIds = [...new Set(action.params.nodeIds)].filter((id) => ids.has(id));
        if (!nodeIds.length) return { ok: false, reason: 'cenas inexistentes' };
      }
      return { ok: true, action: { ...action, params: { ...action.params, focus, nodeIds } } };
    }
    case 'direct_lesson': {
      const l = lessonOf(action.params.lessonId);
      if (!l) return { ok: false, reason: 'aula inexistente' };
      const targets = new Set(directionTargetsFromGraph(l.graph).map((t) => t.nodeId));
      if (!targets.size) return { ok: false, reason: 'aula sem cenas de vídeo' };
      if (action.params.nodeIds?.length) {
        const nodeIds = [...new Set(action.params.nodeIds)].filter((id) => targets.has(id));
        if (!nodeIds.length) return { ok: false, reason: 'cenas inexistentes ou sem vídeo' };
        return { ok: true, action: { ...action, params: { ...action.params, nodeIds } } };
      }
      return { ok: true, action: { ...action, params: { ...action.params, nodeIds: undefined } } };
    }
    case 'scene_variations': {
      const l = lessonOf(action.params.lessonId);
      const n = l && nodeOf(l, action.params.nodeId);
      if (!n) return { ok: false, reason: 'cena inexistente' };
      if (!(VARIATION_SCENE_TYPES as readonly string[]).includes(n.type)) return { ok: false, reason: 'variações só em decisão ou consequência' };
      return { ok: true, action };
    }
    case 'preview_animatic': {
      const l = lessonOf(action.params.lessonId);
      const n = l && nodeOf(l, action.params.nodeId);
      if (!n) return { ok: false, reason: 'cena inexistente' };
      if (!nodeHasDirection(n)) return { ok: false, reason: 'cena sem direção' };
      return { ok: true, action };
    }
    case 'evaluate_lesson': {
      const l = lessonOf(action.params.lessonId);
      if (!l) return { ok: false, reason: 'aula inexistente' };
      if (l.graph.nodes.length < 3) return { ok: false, reason: 'aula sem cenas' };
      return { ok: true, action };
    }
    case 'update_direction_style': {
      const p = action.params;
      if (p.pace === undefined && p.useSlides === undefined && p.maxCinematicPerLesson === undefined) return { ok: false, reason: 'nada a mudar' };
      return { ok: true, action };
    }
    case 'open': {
      const href = action.params.href;
      if (/\.\.|\/\/|[\s<>"']/.test(href)) return { ok: false, reason: 'rota inválida' };
      if (opts.courseId && href.startsWith('/estudio/cursos/') && !href.startsWith(`/estudio/cursos/${opts.courseId}`)) return { ok: false, reason: 'rota de outro curso' };
      const m = /^\/estudio\/cursos\/[^/?#]+\/aulas\/([^/?#]+)/.exec(href);
      if (m && !lessonOf(decodeURIComponent(m[1]!))) return { ok: false, reason: 'aula inexistente' };
      return { ok: true, action };
    }
    case 'generate_videos': {
      const l = lessonOf(action.params.lessonId);
      if (!l) return { ok: false, reason: 'aula inexistente' };
      const targets = new Set(directionTargetsFromGraph(l.graph).map((t) => t.nodeId));
      const nodeIds = [...new Set(action.params.nodeIds)].filter((id) => targets.has(id));
      if (!nodeIds.length) return { ok: false, reason: 'cenas inexistentes ou sem vídeo' };
      return { ok: true, action: { ...action, params: { ...action.params, nodeIds } } };
    }
    case 'generate_angle':
      return { ok: true, action };
  }
}

/**
 * Valida as ações propostas: schema, custo canônico do tipo, ids existentes no
 * documento e pedido explícito para ações pagas. Ações inválidas são
 * descartadas (não falham a resposta); duplicadas também; no máximo 4.
 */
export function sanitizeActions(raw: readonly unknown[], doc: CourseDocument, opts: SanitizeOptions = {}): { actions: AssistantAction[]; dropped: DroppedAction[] } {
  const actions: AssistantAction[] = [];
  const dropped: DroppedAction[] = [];
  const seen = new Set<string>();
  const queue = indexMediaQueue(opts.mediaQueue);
  for (const r of raw) {
    const kind = typeof r === 'object' && r && 'kind' in r ? String((r as { kind: unknown }).kind) : '?';
    // custo sempre o do tipo (nunca o que veio de fora)
    let withCost: unknown = kind in ACTION_COSTS ? { ...(r as object), cost: ACTION_COSTS[kind as AssistantActionKind] } : r;
    // generate_videos sem cenas = desatualizadas + sem vídeo da aula (fora as que já estão gerando)
    if (kind === 'generate_videos') {
      const params = ((withCost as { params?: { lessonId?: unknown; nodeIds?: unknown } }).params ?? {});
      if (!Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
        const l = typeof params.lessonId === 'string' ? findLesson(doc, params.lessonId)?.lesson : undefined;
        if (!l) {
          dropped.push({ kind, reason: 'aula inexistente' });
          continue;
        }
        const st = lessonVideoStats(l, queue);
        const nodeIds = [...st.stale, ...st.missing];
        if (!nodeIds.length) {
          dropped.push({ kind, reason: 'nada para gerar' });
          continue;
        }
        withCost = { ...(withCost as object), params: { ...params, nodeIds } };
      }
    }
    const parsed = AssistantActionSchema.safeParse(withCost);
    if (!parsed.success) {
      dropped.push({ kind, reason: 'formato inválido' });
      continue;
    }
    if (parsed.data.cost === 'paid' && opts.message !== undefined && !paidActionAllowed(parsed.data.kind, opts.message, opts.history)) {
      dropped.push({ kind, reason: 'ação paga sem pedido explícito de geração' });
      continue;
    }
    const c = checkAction(parsed.data, doc, opts);
    if (!c.ok) {
      dropped.push({ kind, reason: c.reason });
      continue;
    }
    const key = JSON.stringify([c.action.kind, c.action.params]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (actions.length >= 4) {
      dropped.push({ kind, reason: 'mais de 4 ações' });
      continue;
    }
    actions.push(c.action);
  }
  return { actions, dropped };
}

/* ------------------------------------------------------------------ */
/* Roteador determinístico (modo de demonstração)                      */
/* ------------------------------------------------------------------ */

export const DEMO_PREFIX = '[demonstração]';

export interface FakeRouterArgs {
  doc: CourseDocument;
  context: AssistantContext;
  message: string;
  summary: AssistantCourseSummary;
  courseId?: string;
  /** conversa anterior (confirmações curtas de cartões pagos) */
  history?: readonly HistoryEntry[];
  /** fila de mídia: cenas já gerando não entram em "gerar vídeos" */
  mediaQueue?: readonly MediaQueueItem[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const HELP_REPLY = 'Posso revisar o texto de uma aula, avaliar a qualidade (texto e vídeos), dirigir as cenas, criar variações de uma decisão, mudar o ritmo do curso ou gerar vídeos (pago, com confirmação). O que você quer fazer?';

/**
 * Escopo pedido no texto (normalizado): "esta fala/cena" = a cena em foco;
 * "a aula/esta aula/aula toda" = a aula inteira; null = não disse.
 */
export function messageScope(normalizedMessage: string): 'scene' | 'lesson' | null {
  const m = normalizedMessage;
  if (/\b(esta|essa|desta|dessa|nesta|nessa|so a|so esta|so essa) (fala|cena)\b/.test(m)) return 'scene';
  if (/\b(a|esta|essa|desta|dessa|nesta|nessa|na|da|toda a|toda esta|toda essa) aula\b/.test(m) || /\baula (toda|inteira)\b/.test(m)) return 'lesson';
  return null;
}

/** Cena da aula pelo título (sem acentos/caixa; título contido no pedido ou o contrário). */
export function findSceneByTitle(lesson: Lesson, query: string): AnyNode | undefined {
  const q = normalizeText(query).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return undefined;
  const scenes = lesson.graph.nodes.filter(isVideoScene);
  const norm = (n: AnyNode) => normalizeText(n.title ?? n.id).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return scenes.find((n) => norm(n) === q) ?? scenes.find((n) => norm(n).includes(q)) ?? scenes.find((n) => norm(n).length >= 3 && q.includes(norm(n))) ?? scenes.find((n) => normalizeText(n.id) === q.replace(/ /g, '_'));
}

const CINEMATIC_OPENING_INSTRUCTION = 'Abra com uma cena em movimento (apresentadora caminhando) no primeiro plano; mantenha o resto.';

/**
 * Roteador por palavras-chave para AI_PROVIDER=fake: mesmo contrato, mesmas
 * validações, sem modelo. A resposta começa com "[demonstração]".
 */
export function fakeAssistantReply(args: FakeRouterArgs): AssistantReply {
  const { doc, context, summary } = args;
  const m = normalizeText(args.message);
  const lesson = context.lessonId ? findLesson(doc, context.lessonId)?.lesson : undefined;
  const node = lesson && context.nodeId ? lesson.graph.nodes.find((n) => n.id === context.nodeId) : undefined;
  const scope = messageScope(m);
  const say = (reply: string, actions: AssistantAction[] = []): AssistantReply => ({ reply: `${DEMO_PREFIX} ${reply}`, actions });
  const needLesson = (what: string) => say(`Abra uma aula para eu ${what}; daqui eu não sei qual aula você quer mudar.`);
  const isQuestion = m.includes('?') || /^(o que|por que|porque|quanto|qual|quais|como|onde|quando)\b/.test(m.trim());
  const href = (fn: (courseId: string) => string) => (args.courseId ? fn(args.courseId) : null);
  const queue = indexMediaQueue(args.mediaQueue);
  const lastAssistant = [...(args.history ?? [])].reverse().find((h) => h.role === 'assistant');
  const confirmsVideos = isShortConfirmation(args.message) && !!lastAssistant && offeredCardKinds(lastAssistant.text).includes('generate_videos');

  // 0. assistente de montagem: orientação sobre o briefing (sem ações)
  if (context.screen === 'wizard' && /publico|\btom\b|habilidade final/.test(m) && !/angulo|perfil|ritmo|slide/.test(m)) {
    if (/publico/.test(m)) return say('Descreva quem é, em que momento está e onde aplica o curso, por exemplo: estagiários de 18 a 24 anos nas primeiras semanas em escritório. Quanto mais concreto, melhores as situações das aulas.');
    if (/\btom\b/.test(m)) return say('Para estagiários, funciona um tom direto e acolhedor: frases curtas, você no centro, sem infantilizar e sem gírias forçadas. Escreva isso no campo tom do briefing.');
    return say('Uma boa habilidade final é observável e começa por verbo, por exemplo: negociar um prazo inviável com fatos e uma proposta.');
  }

  // 1. perguntas sobre o estúdio (respondidas do estado, sem ações pagas)
  if (isQuestion && !paidIntent(args.message).videos) {
    if (/\bcamera/.test(m) && /o que (e|sao)|para que serve/.test(m)) {
      return say('Uma câmera é um visual do mesmo apresentador com outro ângulo ou enquadramento; os planos alternam entre elas. Com uma câmera só, os cortes viram zoom digital.');
    }
    if (/impede|bloque|publicar|publicacao/.test(m)) {
      const blockers = summary.nextSteps.filter((s) => s.severity === 'blocker');
      if (summary.validation.ok && !blockers.length) return say(`Nada impede publicar: a validação passou${summary.validation.warnings ? ` com ${plural(summary.validation.warnings, 'aviso', 'avisos')} editoriais` : ''}.`);
      const list = blockers.length ? blockers.slice(0, 3).map((b) => b.title).join('; ') : summary.validation.topErrors.slice(0, 2).join('; ');
      const first = blockers.find((b) => b.action && b.action.cost !== 'paid')?.action;
      return say(`${summary.validation.ok ? 'A validação passou, mas há pendências' : `Há ${plural(summary.validation.errors, 'erro', 'erros')} de validação`}: ${list}.`, first ? [first] : []);
    }
    if (/falh/.test(m)) {
      const open = href(productionHref);
      return say(
        summary.media.failed ? `${plural(summary.media.failed, 'vídeo falhou', 'vídeos falharam')}; o motivo de cada um aparece na fila de produção.` : 'Nenhum vídeo falhou até agora.',
        open && summary.media.failed ? [{ kind: 'open', cost: 'free', label: 'Ver produção', description: 'Abre a fila de produção com o erro de cada vídeo.', params: { href: open } }] : [],
      );
    }
    if (/falta|terminar|demora|fila/.test(m)) {
      const { waiting, generating } = summary.media;
      return say(waiting + generating ? `Na fila: ${waiting} esperando e ${generating} gerando agora.` : 'Não há vídeos na fila agora.');
    }
    if (/desatualiz/.test(m)) {
      const stale = summary.lessons.filter((l) => l.staleVideos > 0);
      return say(stale.length ? `Vídeos desatualizados: ${stale.map((l) => `${l.title} (${l.staleVideos})`).join('; ')}. Peça para gerar de novo quando quiser; é pago.` : 'Nenhum vídeo está desatualizado.');
    }
    if (/mudou|ultima versao/.test(m)) {
      const open = href(reviewHref);
      return say('A comparação com a última versão publicada fica na tela de revisão.', open ? [{ kind: 'open', cost: 'free', label: 'Abrir revisão', description: 'Abre a revisão do curso.', params: { href: open } }] : []);
    }
    if (/proximo passo/.test(m)) {
      const step = summary.nextSteps[0];
      if (!step) return say('Não encontrei pendências.');
      return say(`${step.title}: ${step.detail}`, step.action && step.action.cost !== 'paid' ? [step.action] : []);
    }
  }

  // 2. gerar vídeos (pago): pedido explícito (verbo + vídeos) ou "sim" ao cartão oferecido
  if (paidIntent(args.message).videos || confirmsVideos) {
    if (!lesson) return needLesson('gerar os vídeos');
    const s = lessonVideoStats(lesson, queue);
    // cena em foco só quando o pedido diz "esta cena"; senão, a aula toda (desatualizados + sem vídeo)
    const nodeIds = node && isVideoScene(node) && scope === 'scene' ? [node.id] : [...s.stale, ...s.missing];
    if (!nodeIds.length) return say(s.generating.length ? `Os outros vídeos desta aula estão em dia; ${plural(s.generating.length, 'já está', 'já estão')} gerando.` : 'Os vídeos desta aula estão em dia; não há nada para gerar.');
    const n = nodeIds.length;
    return say(`Posso gerar ${plural(n, 'vídeo', 'vídeos')} desta aula. É uma ação paga (HeyGen/ElevenLabs): você vê a estimativa e confirma antes.`, [
      { kind: 'generate_videos', cost: 'paid', label: `Gerar ${plural(n, 'vídeo', 'vídeos')}`, description: `Ação paga: gera ${plural(n, 'vídeo', 'vídeos')} (${scope === 'scene' && node ? 'esta cena' : 'desatualizados ou sem vídeo'}). Você confirma o custo antes.`, params: { lessonId: lesson.id, nodeIds } },
    ]);
  }

  // 3. nova câmera / ângulo (pago)
  if (/angulo|perfil|camera lateral/.test(m)) {
    const angle = /direita/.test(m) ? 'right' : /esquerda|perfil|lateral/.test(m) ? 'left' : /de cima|alto|plongee/.test(m) ? 'high' : /de baixo|baixo|contra-?plongee/.test(m) ? 'low' : 'front';
    const framing = /close|fechad/.test(m) ? 'close' : /aberto|wide|geral/.test(m) ? 'wide' : 'medium';
    if (!paidIntent(args.message).angle) return say('Dá para gerar uma câmera nova do apresentador com outro ângulo. É pago (HeyGen); peça "gere um ângulo…" e eu preparo o cartão.');
    return say('Preparei uma câmera nova do apresentador. É uma ação paga (HeyGen): você confirma antes de gerar.', [
      { kind: 'generate_angle', cost: 'paid', label: angle === 'left' ? 'Gerar ângulo de perfil' : 'Gerar novo ângulo', description: 'Ação paga (HeyGen): cria um novo visual do apresentador. Você confirma antes.', params: { angle, framing } },
    ]);
  }

  // 4. animatic (grátis)
  if (/animatic|previa/.test(m)) {
    if (!lesson) return needLesson('abrir a animatic');
    const target = node && nodeHasDirection(node) ? node : node ? undefined : lesson.graph.nodes.find(nodeHasDirection);
    if (!target) return say('Esta cena ainda não tem direção; dirija a cena primeiro para ver a animatic.');
    return say('Abra a animatic para ver a direção montada, sem gerar vídeo.', [
      { kind: 'preview_animatic', cost: 'free', label: 'Ver animatic', description: 'Prévia gratuita da direção desta cena.', params: { lessonId: lesson.id, nodeId: target.id } },
    ]);
  }

  // 5a. avaliação de qualidade (IA): "avalie a aula", "qual a nota", "qualidade"
  if (/\bavali\w*|qualidade|\bnotas?\b|\bscore\b|cartao de qualidade/.test(m) && !/varia/.test(m)) {
    if (!lesson) {
      const open = href((c) => `/estudio/cursos/${c}`);
      return say('Posso avaliar uma aula por vez: texto (ensina? voz de mentor? decisões?) e, se houver vídeos prontos, postura, aparência, fundo, voz e realismo. Abra a aula e peça de novo.', open ? [{ kind: 'open', cost: 'free', label: 'Abrir o curso', description: 'Abre a página do curso para escolher a aula.', params: { href: open } }] : []);
    }
    if (lesson.graph.nodes.length < 3) return say('Esta aula ainda não tem cenas; gere a aula antes de avaliar.');
    const withVideo = !/sem (os )?video|so (o )?texto|apenas (o )?texto/.test(m);
    const videos = lessonVideoStats(lesson, queue).videoSceneIds.filter((id) => sceneMediaState(lesson.id, lesson.graph.nodes.find((n) => n.id === id)!, queue) === 'ready' || sceneMediaState(lesson.id, lesson.graph.nodes.find((n) => n.id === id)!, queue) === 'stale').length;
    return say(`Vou avaliar "${lesson.title}": conteúdo, voz narrativa, perguntas, decisões, realismo e fala${withVideo && videos ? `, mais ${plural(videos, 'vídeo produzido', 'vídeos produzidos')} (postura, aparência, fundo, voz, realismo visual)` : ''}. O resultado é um cartão de notas com correções sugeridas; nada muda sem você.`, [
      { kind: 'evaluate_lesson', cost: 'ai', label: 'Avaliar a aula', description: `A IA avalia o roteiro${withVideo && videos ? ' e os vídeos (quadros + ritmo da fala)' : ''} e devolve notas de 1 a 5 com evidências e correções.`, params: { lessonId: lesson.id, ...(withVideo ? {} : { includeVideo: false }) } },
    ]);
  }

  // 5. variações de uma cena (IA)
  if (/varia/.test(m)) {
    if (!lesson) return needLesson('criar variações');
    const isVar = (n: AnyNode) => (VARIATION_SCENE_TYPES as readonly string[]).includes(n.type);
    const target = node ? (isVar(node) ? node : undefined) : lesson.graph.nodes.find((n) => n.type === 'choice');
    if (!target) return say('Variações só se aplicam a decisões e consequências; selecione uma dessas cenas.');
    return say(`Posso propor 2 ou 3 versões de "${target.title ?? target.id}". Você escolhe uma ao revisar.`, [
      { kind: 'scene_variations', cost: 'ai', label: 'Criar variações', description: 'A IA propõe versões alternativas da cena; nada muda sem sua aprovação.', params: { lessonId: lesson.id, nodeId: target.id } },
    ]);
  }

  // 6. cena em movimento ("faz ela andar na abertura", "coloca uma cena em movimento")
  if (/\b(andar|anda|andando|caminh\w*)\b|em movimento/.test(m)) {
    if (!lesson) return needLesson('abrir com uma cena em movimento');
    const first = directionTargetsFromGraph(lesson.graph)[0];
    if (!first) return say('Esta aula ainda não tem cenas de vídeo com fala ou texto para dirigir.');
    if (doc.presentation.voiceProvider === 'heygen') {
      const open = href(presentationHref);
      return say('A cena em movimento é muda e a narração toca por cima: precisa de uma voz do ElevenLabs. Troque a voz na apresentação e peça de novo.', open ? [{ kind: 'open', cost: 'free', label: 'Abrir apresentação', description: 'Abre a apresentação para trocar a voz (grátis).', params: { href: open } }] : []);
    }
    const direct: AssistantAction = { kind: 'direct_lesson', cost: 'ai', label: 'Abrir em movimento', description: 'A IA diretora propõe a abertura com a apresentadora caminhando; você revisa antes. A cena em movimento é cobrada à parte ao gerar o vídeo.', params: { lessonId: lesson.id, nodeIds: [first.nodeId], instruction: CINEMATIC_OPENING_INSTRUCTION } };
    if (doc.presentation.directionStyle.maxCinematicPerLesson <= 0) {
      return say('As cenas em movimento estão desligadas no curso. Posso ligar uma por aula e pedir a abertura da aula em movimento; chega como proposta.', [
        { kind: 'update_direction_style', cost: 'free', label: 'Ligar cena em movimento', description: 'Grátis: permite 1 cena em movimento por aula.', params: { maxCinematicPerLesson: 1 } },
        direct,
      ]);
    }
    return say(`Vou pedir à IA diretora a abertura de "${lesson.title}" com uma cena em movimento. Chega como proposta; nenhum vídeo é gerado.`, [direct]);
  }

  // 7. "dirija a cena <título>"
  const named = /\b(dirij\w*|dirig\w*|dirija)\b\s+(a\s+)?cena\s+(.+)$/.exec(m);
  if (named && lesson && !/^(esta|essa|desta|dessa)\b/.test(named[3]!.trim())) {
    const target = findSceneByTitle(lesson, named[3]!.replace(/["'“”?!.]+/g, ' '));
    if (!target) return say(`Não encontrei a cena "${args.message.trim().slice(named.index + named[0].length - named[3]!.length).trim()}" nesta aula; diga o título como aparece no roteiro.`);
    return say(`Vou pedir à IA diretora uma nova direção para "${target.title ?? target.id}". Chega como proposta; nenhum vídeo é gerado.`, [
      { kind: 'direct_lesson', cost: 'ai', label: 'Dirigir a cena', description: 'A IA diretora propõe planos novos; você revisa antes de aplicar. Não gera vídeo.', params: { lessonId: lesson.id, nodeIds: [target.id], instruction: clip(args.message.trim(), 2000) } },
    ]);
  }

  // 8. revisão de texto (IA)
  const focus: RevisionFocus | null = /mais curt|encurt|resum/.test(m) ? 'shorten' : /pratic|\bdicas?\b|orient/.test(m) ? 'practical' : /terceira pessoa|3a pessoa|3ª pessoa|voz de ensino|ensin|mentor|parece um curso|feedback|fal\w* com o aluno|segunda pessoa|2a pessoa|2ª pessoa|\bvoce\b/.test(m) ? 'teaching' : /dificil|desafiador/.test(m) ? 'difficulty_harder' : /facil/.test(m) ? 'difficulty_easier' : /pessoal|acolhed|\btom\b/.test(m) ? 'tone' : null;
  if (focus) {
    if (!lesson) return needLesson('revisar o texto');
    if (node && scope === 'scene') {
      return say(`Vou pedir uma revisão só de "${node.title ?? node.id}". Ela chega como proposta para você aprovar; o resto da aula fica igual.`, [
        { kind: 'revise_lesson', cost: 'ai', label: 'Reescrever a fala', description: 'A IA reescreve só esta cena; você revisa a diferença antes de aplicar.', params: { lessonId: lesson.id, focus, nodeIds: [node.id], instruction: clip(`Altere SÓ a cena "${node.title ?? node.id}" (${node.id}). Pedido do autor: ${args.message.trim()}`, 2000) } },
      ]);
    }
    const where = node && scope !== 'lesson' ? ` Concentre a mudança na cena "${node.title ?? node.id}" (${node.id}).` : '';
    return say(`Vou pedir uma revisão de "${lesson.title}". Ela chega como proposta para você aprovar.`, [
      { kind: 'revise_lesson', cost: 'ai', label: 'Revisar a aula', description: 'A IA reescreve conforme o pedido; você revisa a diferença antes de aplicar.', params: { lessonId: lesson.id, focus, instruction: clip(`Pedido do autor: ${args.message.trim()}.${where}`, 2000) } },
    ]);
  }

  // 9. direção (IA) ou estilo do curso (grátis)
  if (/dinamic|ritmo|camera|close|slide|calm|enquadra|corte|dirij|dirig/.test(m)) {
    const courseWide = !lesson || /curso (todo|inteiro)|todas as aulas|\bo curso\b|do curso/.test(m);
    if (courseWide) {
      const pace = /dinamic|rapid|agil/.test(m) ? 'dynamic' : /calm|devagar|lent|tranquil/.test(m) ? 'calm' : /equilibr/.test(m) ? 'balanced' : undefined;
      const useSlides = /sem slides?|tir\w* (os )?slides|desliga\w* (os )?slides/.test(m) ? false : /slide/.test(m) ? true : undefined;
      if (pace !== undefined || useSlides !== undefined) {
        const what = [pace ? `ritmo ${pace === 'dynamic' ? 'dinâmico' : pace === 'calm' ? 'calmo' : 'equilibrado'}` : null, useSlides === undefined ? null : useSlides ? 'com slides' : 'sem slides'].filter(Boolean).join(', ');
        return say(`Posso mudar o padrão do curso para ${what}. Vale para as próximas direções; as já feitas não mudam.`, [
          { kind: 'update_direction_style', cost: 'free', label: 'Mudar estilo do curso', description: `Grátis: define ${what} como padrão de direção do curso.`, params: { ...(pace ? { pace } : {}), ...(useSlides === undefined ? {} : { useSlides }) } },
        ]);
      }
      if (!lesson) return needLesson('dirigir as cenas');
    }
    // cena em foco, salvo quando o pedido fala da aula
    const nodeIds = node && isVideoScene(node) && scope !== 'lesson' ? [node.id] : undefined;
    if (!directionTargetsFromGraph(lesson!.graph, nodeIds).length) return say('Esta aula ainda não tem cenas de vídeo com fala ou texto para dirigir.');
    return say(`Vou pedir à IA diretora uma nova direção para ${nodeIds ? 'esta cena' : `"${lesson!.title}"`}. Chega como proposta; nenhum vídeo é gerado.`, [
      { kind: 'direct_lesson', cost: 'ai', label: nodeIds ? 'Dirigir esta cena' : 'Dirigir a aula', description: 'A IA diretora propõe planos novos; você revisa antes de aplicar. Não gera vídeo.', params: { lessonId: lesson!.id, ...(nodeIds ? { nodeIds } : {}), instruction: clip(args.message.trim(), 2000) } },
    ]);
  }

  return say(HELP_REPLY);
}

/* ------------------------------------------------------------------ */
/* Turno do assistente                                                 */
/* ------------------------------------------------------------------ */

/** Uma frase sobre por que nenhum cartão sobrou (motivo mais relevante primeiro). */
export function droppedExplanation(dropped: readonly DroppedAction[]): string {
  const reasons = new Set(dropped.map((d) => d.reason));
  if (reasons.has('ação paga sem pedido explícito de geração')) return 'Não deixei o cartão pago: ações pagas só saem com um pedido explícito, como "gere os vídeos desta aula".';
  if (reasons.has('nada para gerar')) return 'Não há vídeos para gerar nesta aula: estão em dia ou já gerando.';
  if (['aula inexistente', 'cena inexistente', 'cenas inexistentes', 'cenas inexistentes ou sem vídeo'].some((r) => reasons.has(r))) return 'Não encontrei a aula ou a cena indicada; diga qual é pelo título.';
  if (reasons.has('cena sem direção')) return 'Esta cena ainda não tem direção; dirija a cena antes de ver a animatic.';
  if (reasons.has('variações só em decisão ou consequência')) return 'Variações só valem para cenas de decisão ou consequência.';
  if (reasons.has('rota de outro curso') || reasons.has('rota inválida')) return 'Não consegui abrir essa tela; use o menu do estúdio.';
  const first = dropped[0]?.reason;
  return first ? `Não consegui preparar o cartão (${first}).` : '';
}

export const ASSISTANT_TASK = 'assistant_turn';
export const ASSISTANT_REPAIR_TASK = 'assistant_turn_repair';

export interface AssistantTurnArgs {
  doc: CourseDocument;
  courseId?: string;
  context: AssistantContext;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** resumo pronto (senão é montado a partir do documento) */
  summary?: AssistantCourseSummary;
  mediaQueue?: readonly MediaQueueItem[];
  /** texto de <capacidades> (padrão: `videoCapabilitiesText` do kit do curso) */
  capabilities?: string;
  log?: (m: string) => void;
}

export interface AssistantTurnMeta {
  provider: string;
  model: string;
  simulated: boolean;
  instructionsVersion: string;
  latencyMs: number;
  repairs: number;
  costUsd?: number;
  dropped: DroppedAction[];
}

const isUnusable = isUnusableOutput;

/** Usa o roteador determinístico quando o adapter é o FAKE sem resposta registrada para o assistente (AI_PROVIDER=fake). */
export function usesDemoRouter(set: AdapterSet): boolean {
  // sem `instanceof`/método obrigatório: no dev server o módulo do adapter pode estar duplicado ou desatualizado pelo HMR
  const p = set.primary as Partial<Pick<FakeLlmAdapter, 'has'>> & { provider: string };
  return p.provider === 'fake' && !(typeof p.has === 'function' && p.has(ASSISTANT_TASK));
}

/**
 * Um turno do assistente: UMA chamada de saída estruturada (com uma rodada de
 * reparo se a resposta vier ilegível), depois validação das ações contra o
 * documento (ids inexistentes e ações pagas sem pedido explícito são
 * descartadas). Nunca executa nada: devolve resposta e cartões.
 */
export async function assistantTurn(set: AdapterSet, args: AssistantTurnArgs): Promise<{ reply: AssistantReply; meta: AssistantTurnMeta }> {
  const summary = args.summary ?? buildAssistantContext(args.doc, args.context, { courseId: args.courseId, mediaQueue: args.mediaQueue });
  const sanitizeOpts: SanitizeOptions = { courseId: args.courseId, message: args.message, history: args.history, mediaQueue: args.mediaQueue };

  if (usesDemoRouter(set)) {
    const raw = fakeAssistantReply({ doc: args.doc, context: args.context, message: args.message, summary, courseId: args.courseId, history: args.history, mediaQueue: args.mediaQueue });
    const { actions, dropped } = sanitizeActions(raw.actions, args.doc, sanitizeOpts);
    return {
      reply: AssistantReplySchema.parse({ reply: clip(raw.reply, 2000), actions }),
      meta: { provider: set.primary.provider, model: set.primary.model, simulated: true, instructionsVersion: ASSISTANT_INSTRUCTIONS_VERSION, latencyMs: 0, repairs: 0, dropped },
    };
  }

  const capabilities = args.capabilities ?? videoCapabilitiesText({
    cameraCount: args.doc.presentation.cameras.filter((c) => c.status === 'ready').length,
    avatarType: args.doc.presentation.avatarType ?? null,
    maxCinematicPerLesson: args.doc.presentation.directionStyle.maxCinematicPerLesson,
    voiceProvider: args.doc.presentation.voiceProvider ?? null,
    zones: !!zoneCamerasOf(args.doc.presentation.cameras),
  });
  const input = buildAssistantInput({ summary, context: args.context, message: args.message, history: args.history, capabilities });
  const req = { task: ASSISTANT_TASK, instructionsVersion: ASSISTANT_INSTRUCTIONS_VERSION, system: SYSTEM_ASSISTANT, input, schema: AssistantReplyProposalSchema, schemaName: 'assistant_reply', maxOutputTokens: 4000, effort: 'low' as const };
  let repairs = 0;
  let result;
  try {
    result = await generateWithFallback(set, req, args.log);
  } catch (e) {
    if (!isUnusable(e)) throw e;
    repairs = 1;
    args.log?.('[ai] resposta do assistente ilegível; pedindo reparo');
    try {
      result = await generateWithFallback(set, { ...req, task: ASSISTANT_REPAIR_TASK, input: `${input}\n\n${TASK_ASSISTANT_REPAIR}` }, args.log);
    } catch (e2) {
      if (!isUnusable(e2)) throw e2;
      args.log?.('[ai] reparo do assistente também falhou; resposta neutra');
      return {
        reply: { reply: 'Não consegui montar uma resposta agora. Tente reformular o pedido.', actions: [] },
        meta: { provider: set.primary.provider, model: set.primary.model, simulated: set.primary.provider === 'fake', instructionsVersion: ASSISTANT_INSTRUCTIONS_VERSION, latencyMs: 0, repairs, dropped: [] },
      };
    }
  }
  const proposal = result.output;
  const { actions, dropped } = sanitizeActions(proposal.actions.map(proposalToAction), args.doc, sanitizeOpts);
  for (const d of dropped) args.log?.(`[ai] ação "${d.kind}" do assistente descartada: ${d.reason}`);
  // todas as ações propostas caíram: uma frase explicando por quê (a resposta prometia um cartão)
  const why = proposal.actions.length > 0 && actions.length === 0 ? droppedExplanation(dropped) : '';
  const replyText = [proposal.reply.trim() || 'Pronto.', why].filter(Boolean).join(' ');
  return {
    reply: AssistantReplySchema.parse({ reply: clip(replyText, 2000), actions }),
    meta: { provider: result.provider, model: result.model, simulated: result.provider === 'fake', instructionsVersion: ASSISTANT_INSTRUCTIONS_VERSION, latencyMs: result.latencyMs, repairs, costUsd: result.costUsd, dropped },
  };
}

/* ------------------------------------------------------------------ */
/* Execução no servidor (plano puro; a rota aplica)                    */
/* ------------------------------------------------------------------ */

export type ExecutionPlan =
  | { kind: 'enqueue'; task: 'revise_lesson'; lessonId: string; instruction?: string; focus?: RevisionFocus; /** só estas cenas mudam (o resto volta idêntico) */ nodeIds?: string[] }
  | { kind: 'enqueue'; task: 'evaluate_lesson'; lessonId: string; includeVideo: boolean }
  | { kind: 'enqueue'; task: 'scene_direction'; lessonId: string; instruction?: string; nodeIds?: string[]; targets: string[] }
  | { kind: 'enqueue'; task: 'scene_variations'; lessonId: string; nodeId: string }
  | { kind: 'patch_direction_style'; directionStyle: CourseDocument['presentation']['directionStyle']; document: CourseDocument }
  | { kind: 'reject'; status: 400 | 404 | 422; code: 'CLIENT_SIDE_ACTION' | 'CLIENT_CONFIRMATION_REQUIRED' | 'NOT_FOUND' | 'VALIDATION'; message: string };

const reject = (status: 400 | 404 | 422, code: Extract<ExecutionPlan, { kind: 'reject' }>['code'], message: string): ExecutionPlan => ({ kind: 'reject', status, code, message });

/**
 * O que o servidor deve fazer com uma ação do assistente (função pura).
 * Executa no servidor só ações de IA (enfileira o agente, como as rotas
 * existentes) e a mudança de estilo (gratuita). `open`/`preview_animatic` são
 * do cliente; ações pagas exigem a confirmação em dois cliques do cliente, que
 * chama os endpoints pagos existentes.
 */
export function planExecution(action: AssistantAction, doc: CourseDocument): ExecutionPlan {
  if (action.kind === 'generate_videos' || action.kind === 'generate_angle') {
    return reject(400, 'CLIENT_CONFIRMATION_REQUIRED', 'Ações pagas são confirmadas e executadas pela tela, com confirmação em dois cliques.');
  }
  if (action.kind === 'open' || action.kind === 'preview_animatic') return reject(400, 'CLIENT_SIDE_ACTION', 'Esta ação é executada na própria tela, não no servidor.');
  if (action.kind === 'update_direction_style') {
    const p = action.params;
    if (p.pace === undefined && p.useSlides === undefined && p.maxCinematicPerLesson === undefined) return reject(422, 'VALIDATION', 'Nada a mudar no estilo de direção.');
    const directionStyle = {
      ...doc.presentation.directionStyle,
      ...(p.pace !== undefined ? { pace: p.pace } : {}),
      ...(p.useSlides !== undefined ? { useSlides: p.useSlides } : {}),
      ...(p.maxCinematicPerLesson !== undefined ? { maxCinematicPerLesson: p.maxCinematicPerLesson } : {}),
    };
    return { kind: 'patch_direction_style', directionStyle, document: { ...doc, presentation: { ...doc.presentation, directionStyle } } };
  }

  const lesson = findLesson(doc, action.params.lessonId)?.lesson;
  if (!lesson) return reject(404, 'NOT_FOUND', 'Aula não encontrada no rascunho');
  switch (action.kind) {
    case 'revise_lesson': {
      // mesmo critério de "aula sem cenas" da rota de revisão (grafo provisório de 2 nós)
      if (lesson.graph.nodes.length < 3) return reject(422, 'VALIDATION', 'Esta aula ainda não tem cenas. Gere a aula antes de revisar.');
      let instruction = action.params.instruction.trim() || undefined;
      const focus = action.params.focus && RevisionFocusSchema.safeParse(action.params.focus).success ? (action.params.focus as RevisionFocus) : undefined;
      if (!instruction && !focus) return reject(422, 'VALIDATION', 'Informe um pedido ou um foco para a revisão.');
      const scoped = action.params.nodeIds?.length ? lesson.graph.nodes.filter((n) => action.params.nodeIds!.includes(n.id)) : [];
      if (action.params.nodeIds?.length && !scoped.length) return reject(422, 'VALIDATION', 'Nenhuma das cenas indicadas existe nesta aula.');
      if (scoped.length) {
        // escopo também no texto do pedido (o agente revisa a aula, mas só estas cenas podem mudar)
        const only = `Altere SÓ ${scoped.length === 1 ? 'a cena' : 'as cenas'} ${scoped.map((n) => `"${n.title ?? n.id}" (${n.id})`).join(', ')}; as demais voltam idênticas.`;
        instruction = clip(instruction?.includes(scoped[0]!.id) && /altere s[óo]/i.test(instruction) ? instruction : `${only}${instruction ? ` ${instruction}` : ''}`, 2000);
      }
      return { kind: 'enqueue', task: 'revise_lesson', lessonId: lesson.id, instruction, focus, ...(scoped.length ? { nodeIds: scoped.map((n) => n.id) } : {}) };
    }
    case 'direct_lesson': {
      // mesma lógica de alvos da rota de direção
      const nodeIds = action.params.nodeIds?.length ? [...new Set(action.params.nodeIds)] : undefined;
      const targets = directionTargetsFromGraph(lesson.graph, nodeIds);
      if (!targets.length) {
        return reject(422, 'VALIDATION', nodeIds ? 'Nenhuma das cenas indicadas tem vídeo com fala ou texto para dirigir.' : 'Esta aula não tem cenas de vídeo com fala ou texto para dirigir.');
      }
      return { kind: 'enqueue', task: 'scene_direction', lessonId: lesson.id, instruction: action.params.instruction?.trim() || undefined, nodeIds: nodeIds ? targets.map((t) => t.nodeId) : undefined, targets: targets.map((t) => t.nodeId) };
    }
    case 'scene_variations': {
      const node = lesson.graph.nodes.find((n) => n.id === action.params.nodeId);
      if (!node) return reject(404, 'NOT_FOUND', 'Cena não encontrada na aula');
      if (!(VARIATION_SCENE_TYPES as readonly string[]).includes(node.type)) return reject(422, 'VALIDATION', `Variações só se aplicam a decisões e consequências (esta cena é "${NODE_TYPE_LABELS[node.type]}")`);
      return { kind: 'enqueue', task: 'scene_variations', lessonId: lesson.id, nodeId: node.id };
    }
    case 'evaluate_lesson':
      if (lesson.graph.nodes.length < 3) return reject(422, 'VALIDATION', 'Esta aula ainda não tem cenas. Gere a aula antes de avaliar.');
      return { kind: 'enqueue', task: 'evaluate_lesson', lessonId: lesson.id, includeVideo: action.params.includeVideo !== false };
  }
}

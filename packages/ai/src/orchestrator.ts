import { compileLesson, gestureKey, LessonGraphSchema, SAFE_GESTURES, SceneDirectionSchema, zoneCamerasOf, type Camera, type LessonGraph, type SceneDirection, type Shot, type ZoneCameraSet } from '@lms/course-schema';
import { DEFAULT_MAX_CINEMATIC_PER_LESSON, MAX_SHOT_WORDS, MAX_SHOTS_PER_SCENE_WORDS, MIN_SHOT_WORDS } from './capabilities';
import { isUnusableOutput, LlmError, type StructuredResult } from './adapter';
import { generateWithFallback, type AdapterSet } from './registry';
import { DIRECTION_INSTRUCTIONS_VERSION, INSTRUCTIONS_VERSION, SYSTEM_DESIGNER, SYSTEM_DIRECTOR, TASK_DIRECTION_REPAIR, TASK_REPAIR, briefTargetMinutes, buildDirectionInput, buildLessonInput, buildOutlineInput, buildReviseInput, buildVariationsInput, type DirectionInputArgs, type OutlineInputArgs, type PreviousSceneDirection, type ReviseInputArgs } from './prompts';
import { alignLinesToNarration, applyZoneRules, clampDirectionFullFrame, directionGestureWarnings, directionPlacementWarnings, lastChipsZoneOf, spokenWords, validateDirectionScene, type DirectionTarget } from './direction';
import { CAPPED_REVISION_FOCUS, VOICE_REVISION_FOCUS, LessonScriptSchema, OutlineProposalSchema, SceneDirectionProposalSchema, SceneVariationsSchema, VARIATION_SCENE_TYPES, directionProposalToSceneDirection, type DirectionSceneProposal, type SceneDirectionProposal, applyScriptToGraph, graphToScriptWithWarnings, scriptToGraph, swapScene, type LessonScene, type LessonScript, type OutlineProposal, type RevisionFocus } from './schemas';
import { isBeginnerAudience, outlineTargets, validateLessonRules, validateTeachingVoice, type LessonRulesOptions } from './lesson-rules';
import { assessmentAllowed } from './prompts';

export interface RunMeta {
  provider: string;
  model: string;
  instructionsVersion: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  fallbackUsed: boolean;
  repairs: number;
}

function meta(results: StructuredResult<unknown>[], repairs: number, instructionsVersion = INSTRUCTIONS_VERSION, fallback?: { provider: string; model: string }): RunMeta {
  const last = results[results.length - 1] ?? { provider: fallback?.provider ?? 'unknown', model: fallback?.model ?? 'unknown' };
  return {
    provider: last.provider,
    model: last.model,
    instructionsVersion,
    latencyMs: results.reduce((a, r) => a + r.latencyMs, 0),
    usage: { inputTokens: results.reduce((a, r) => a + (r.usage?.inputTokens ?? 0), 0), outputTokens: results.reduce((a, r) => a + (r.usage?.outputTokens ?? 0), 0) },
    costUsd: results.every((r) => r.costUsd !== undefined) ? results.reduce((a, r) => a + (r.costUsd ?? 0), 0) : undefined,
    fallbackUsed: results.some((r) => r.fallbackUsed === true),
    repairs,
  };
}

/** Limita o texto das fontes enviado ao modelo (contexto e custo). */
export function sourcesExcerpt(sources: Array<{ title: string; text: string }>, maxChars = 60_000): string {
  let budget = maxChars;
  const out: string[] = [];
  for (const s of sources) {
    if (budget <= 0) break;
    const t = s.text.slice(0, budget);
    out.push(`## ${s.title}\n${t}`);
    budget -= t.length;
  }
  return out.join('\n\n');
}

export interface OutlineIssue {
  code: string;
  message: string;
}

/**
 * Validação semântica da estrutura proposta (o schema só garante o formato):
 * ids únicos (objetivos, módulos, aulas), objectiveIds existentes, nenhum
 * módulo vazio, quantidade de aulas dentro da faixa da duração alvo (abaixo da
 * faixa só é aceito quando há pedido do autor, ex. "menos aulas"), e, com a
 * estrutura atual, toda aula de hoje ou continua (mesmo id) ou está em
 * removedLessonIds; um id removido não pode reaparecer.
 */
export function validateOutline(p: OutlineProposal, opts: { brief?: Record<string, unknown>; hasInstruction?: boolean; currentLessonIds?: readonly string[] } = {}): OutlineIssue[] {
  const issues: OutlineIssue[] = [];
  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ code: 'DUPLICATE_ID', message: `${what} com id repetido "${id}"; ids são únicos no curso inteiro` });
      seen.add(id);
    }
  };
  dup(p.objectives.map((o) => o.id), 'objetivo');
  dup(p.modules.map((m) => m.id), 'módulo');
  const lessons = p.modules.flatMap((m) => m.lessons);
  dup(lessons.map((l) => l.id), 'aula');
  const objectiveIds = new Set(p.objectives.map((o) => o.id));
  for (const l of lessons) for (const oid of l.objectiveIds) if (!objectiveIds.has(oid)) issues.push({ code: 'OBJECTIVE_UNKNOWN', message: `aula "${l.id}" aponta para o objetivo "${oid}", que não existe em objectives` });
  for (const m of p.modules) if (m.lessons.length === 0) issues.push({ code: 'EMPTY_MODULE', message: `módulo "${m.id}" sem aulas; remova o módulo ou mova aulas para ele` });
  const t = outlineTargets(opts.brief ? briefTargetMinutes(opts.brief) ?? 15 : 15);
  // acima da faixa é erro (o curso vira longo demais); abaixo é aceitável (pedido do autor, curso curto): não bloqueia
  if (lessons.length > t.lessonsMax) issues.push({ code: 'TOO_MANY_LESSONS', message: `${lessons.length} aulas para a duração alvo (máximo ${t.lessonsMax}); funda ou remova aulas` });
  void opts.hasInstruction;
  const proposed = new Set(lessons.map((l) => l.id));
  const removed = new Set(p.removedLessonIds);
  for (const id of removed) if (proposed.has(id)) issues.push({ code: 'REMOVED_BUT_PRESENT', message: `a aula "${id}" está em removedLessonIds e também na estrutura; decida uma coisa` });
  if (opts.currentLessonIds) {
    const current = new Set(opts.currentLessonIds);
    for (const id of opts.currentLessonIds) if (!proposed.has(id) && !removed.has(id)) issues.push({ code: 'LESSON_UNACCOUNTED', message: `a aula atual "${id}" não continua (mesmo id) nem está em removedLessonIds; mantenha o id se ela continua, ou liste-a como removida` });
    for (const id of removed) if (!current.has(id)) issues.push({ code: 'REMOVED_UNKNOWN', message: `removedLessonIds traz "${id}", que não existe na estrutura atual` });
  }
  return issues;
}

/**
 * Propõe a estrutura e valida semanticamente; problemas voltam ao modelo
 * (tarefa outline_repair, até 2 rodadas). Se persistirem, a proposta é
 * recusada com a lista (uma estrutura com ids repetidos corromperia o curso).
 */
export async function proposeOutline(
  set: AdapterSet,
  args: OutlineInputArgs,
  log?: (m: string) => void,
  opts: LoopOpts = {},
): Promise<{ proposal: OutlineProposal; meta: RunMeta; issues: OutlineIssue[] }> {
  const maxRepairs = opts.maxRepairs ?? 2;
  const results: StructuredResult<unknown>[] = [];
  const base = { instructionsVersion: INSTRUCTIONS_VERSION, system: SYSTEM_DESIGNER, schema: OutlineProposalSchema, schemaName: 'outline', effort: 'high' as const };
  const currentLessonIds = args.currentStructure?.modules.flatMap((m) => m.lessons.map((l) => l.id));
  let input = buildOutlineInput(args);
  let repairs = 0;
  let lastIssues: OutlineIssue[] = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    let r: StructuredResult<OutlineProposal>;
    try {
      r = await generateWithFallback(set, { ...base, task: attempt === 0 ? 'outline' : 'outline_repair', input }, opts.log ?? log);
    } catch (e) {
      if (!isUnusableOutput(e) || attempt === maxRepairs) throw e;
      repairs++;
      (opts.log ?? log)?.(`[ai] estrutura ilegível (${e instanceof Error ? e.message.slice(0, 120) : 'formato'}); pedindo reparo ${repairs}`);
      input = `${buildOutlineInput(args)}\n\n${TASK_REPAIR}\n- a resposta anterior não validou contra o formato pedido; devolva a estrutura completa, com todos os campos (removedLessonIds como lista, vazia se nada foi removido)`;
      continue;
    }
    results.push(r);
    lastIssues = validateOutline(r.output, { brief: args.brief, hasInstruction: !!args.instruction?.trim(), currentLessonIds });
    if (lastIssues.length === 0) return { proposal: r.output, meta: meta(results, repairs), issues: [] };
    if (attempt === maxRepairs) break;
    repairs++;
    (opts.log ?? log)?.(`[ai] estrutura com ${lastIssues.length} problema(s); pedindo reparo ${repairs}`);
    input = `${buildOutlineInput(args)}\n\n<proposta_anterior>\n${JSON.stringify(r.output)}\n</proposta_anterior>\n\n${TASK_REPAIR}\n${lastIssues.map((i) => `- ${i.code}: ${i.message}`).join('\n')}`;
  }
  throw new Error(`A estrutura proposta não passou na validação após ${repairs} reparo(s): ${lastIssues.slice(0, 6).map((i) => i.message).join('; ')}`);
}

export interface LessonIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export interface LessonResult {
  graph: LessonGraph;
  script: LessonScript;
  rationale: string;
  meta: RunMeta;
  issues: { errors: number; warnings: number };
  /** os erros e avisos (compilador + regras) da versão devolvida, para a tela de proposta */
  issueList: { errors: LessonIssue[]; warnings: LessonIssue[] };
}

type LoopOpts = { maxRepairs?: number; log?: (m: string) => void };

/**
 * Laço comum de geração/revisão: pede o roteiro, converte em grafo, valida com
 * o compilador e, se houver erros, devolve-os ao modelo para reparo limitado.
 * Após o limite, devolve a proposta mesmo assim, marcada com os erros.
 */
async function scriptLoop(
  set: AdapterSet,
  cfg: {
    task: string; repairTask: string; label: string; buildInput: () => string; toGraph: (script: LessonScript) => LessonGraph; objectiveIds: Set<string>;
    /** ajusta o roteiro do modelo antes de validar (ex.: revisão restrita a algumas cenas) */
    transform?: (script: LessonScript) => LessonScript;
    /**
     * limites de extensão/formato (≤ 7 cenas, 3 opções, cena "Dica"…): com `enforce`, estouros viram erros de reparo; senão, avisos.
     * `enforceVoice`: as regras de voz de ensino (terceira pessoa, cena que não ensina) viram erros; `voiceScope` limita isso a algumas cenas
     * (revisão restrita: o modelo não pode mexer nas outras).
     */
    rules?: LessonRulesOptions & { enforce: boolean; enforceVoice?: boolean; voiceScope?: ReadonlySet<string> };
  },
  opts: LoopOpts,
): Promise<LessonResult> {
  const maxRepairs = opts.maxRepairs ?? 2;
  const results: StructuredResult<unknown>[] = [];
  const base = { instructionsVersion: INSTRUCTIONS_VERSION, system: SYSTEM_DESIGNER, schema: LessonScriptSchema, schemaName: 'lesson_script', effort: 'high' as const };
  let input = cfg.buildInput();
  let repairs = 0;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    let r: StructuredResult<LessonScript>;
    try {
      r = await generateWithFallback(set, { ...base, task: attempt === 0 ? cfg.task : cfg.repairTask, input }, opts.log);
    } catch (e) {
      // resposta fora do formato: uma nova rodada (reparo) em vez de falhar a aula inteira
      if (!isUnusableOutput(e) || attempt === maxRepairs) throw e;
      repairs++;
      opts.log?.(`[ai] roteiro de "${cfg.label}" ilegível (${e instanceof Error ? e.message.slice(0, 120) : 'formato'}); pedindo reparo ${repairs}`);
      input = `${cfg.buildInput()}\n\n${TASK_REPAIR}\n- a resposta anterior não validou contra o formato pedido; devolva o roteiro completo, com todos os campos (null quando não se aplica)`;
      continue;
    }
    results.push(r);
    const script = cfg.transform ? cfg.transform(r.output) : r.output;
    const graph = cfg.toGraph(script);
    const c = compileLesson(graph, { objectiveIds: cfg.objectiveIds });
    let repairWarnings: Array<{ code: string; message: string }> = [];
    const parsed = LessonGraphSchema.safeParse(graph);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 10)) c.errors.push({ code: 'SCHEMA', message: `${issue.path.join('.')}: ${issue.message}` });
      c.ok = false;
    }
    // extensão e formato (aula curta e prática): com enforce, estouros voltam ao modelo como erros; senão, contam como avisos
    if (cfg.rules) {
      const asIssue = (i: { code: string; message: string; sceneId?: string }) => ({ code: i.code, message: i.message, ...(i.sceneId ? { nodeId: i.sceneId } : {}) });
      const ruleIssues = validateLessonRules(script, { ...cfg.rules, voice: false });
      // avisos reparáveis (tela com fala demais, escrita obrigatória para iniciantes): nunca bloqueiam; vão junto num reparo
      const softIssues = ruleIssues.filter((i) => i.severity === 'warning').map(asIssue);
      const lengthIssues = ruleIssues.filter((i) => i.severity !== 'warning').map(asIssue);
      if (cfg.rules.enforce && lengthIssues.length) {
        c.errors.push(...lengthIssues);
        c.ok = false;
      } else c.warnings.push(...lengthIssues);
      c.warnings.push(...softIssues);
      repairWarnings = softIssues;
      // voz de ensino (mentor falando com "você"; consequências como feedback): erros nos focos de voz, avisos nos demais
      const voiceIssues = validateTeachingVoice(script, { castNames: cfg.rules.castNames }).map(asIssue);
      const scope = cfg.rules.voiceScope;
      const enforced = cfg.rules.enforceVoice ? voiceIssues.filter((i) => !scope || (i.nodeId !== undefined && scope.has(i.nodeId))) : [];
      if (enforced.length) {
        c.errors.push(...enforced);
        c.ok = false;
      }
      c.warnings.push(...voiceIssues.filter((i) => !enforced.includes(i)));
    }
    if (c.ok || attempt === maxRepairs) {
      const pick = (i: { code: string; message: string; nodeId?: string }): LessonIssue => ({ code: i.code, message: i.message, ...(i.nodeId ? { nodeId: i.nodeId } : {}) });
      return { graph, script, rationale: script.rationale, meta: meta(results, repairs), issues: { errors: c.errors.length, warnings: c.warnings.length }, issueList: { errors: c.errors.map(pick), warnings: c.warnings.map(pick) } };
    }
    repairs++;
    opts.log?.(`[ai] roteiro de "${cfg.label}" com ${c.errors.length} erro(s); pedindo reparo ${repairs}`);
    input = `${cfg.buildInput()}\n\n<roteiro_anterior>\n${JSON.stringify(script)}\n</roteiro_anterior>\n\n${TASK_REPAIR}\n${[...c.errors, ...repairWarnings.map((w) => ({ ...w, code: `${w.code} (aviso; corrija se der)` }))].map((e) => `- ${e.code}: ${e.message}`).join('\n')}`;
  }
  throw new Error('unreachable');
}

/** Nomes do elenco (para o validador de voz: "<Nome> <verbo>" é narração em terceira pessoa). */
export function castNamesOf(cast: ReadonlyArray<{ name: string }> | undefined): string[] {
  return (cast ?? []).map((c) => c.name.trim()).filter(Boolean);
}

/**
 * Gera o roteiro de uma aula, converte em grafo e valida com o compilador.
 * Reparo limitado (máx. 2 rodadas) enviando os erros de volta ao modelo.
 */
export async function generateLesson(set: AdapterSet, args: Parameters<typeof buildLessonInput>[0], opts: LoopOpts = {}): Promise<LessonResult> {
  return scriptLoop(
    set,
    { task: 'lesson', repairTask: 'lesson_repair', label: args.lesson.title, buildInput: () => buildLessonInput(args), toGraph: scriptToGraph, objectiveIds: new Set(args.objectives.map((o) => o.id)), rules: { enforce: true, enforceVoice: true, didactic: 'enforce', castNames: castNamesOf(args.cast), family: args.lesson.family, allowAssessment: assessmentAllowed(args.lesson), beginnerAudience: isBeginnerAudience(args.brief) } },
    opts,
  );
}

export type ReviseLessonArgs = Omit<ReviseInputArgs, 'script'> & { graph: LessonGraph; focus?: RevisionFocus; /** só estas cenas podem mudar; as demais voltam idênticas (ids desconhecidos são ignorados) */ nodeIds?: readonly string[] | null };

/**
 * Revisão restrita: parte do roteiro ORIGINAL e troca só as cenas-alvo pela
 * versão do modelo (mesmo id). Cenas novas ou mudanças fora do alvo são
 * descartadas, então o diff fica limitado ao que foi pedido.
 */
export function restrictScriptToScenes(original: LessonScript, revised: LessonScript, nodeIds: ReadonlySet<string>): LessonScript {
  const byId = new Map(revised.scenes.map((sc) => [sc.id, sc]));
  return { rationale: revised.rationale, scenes: original.scenes.map((sc) => (nodeIds.has(sc.id) && byId.get(sc.id)?.type === sc.type ? byId.get(sc.id)! : sc)) };
}

/**
 * Revisa uma aula existente: o grafo atual vira roteiro, o modelo devolve o
 * roteiro completo revisado e o resultado é reconvertido preservando o que o
 * roteiro não carrega (variáveis, mídia, efeitos, layout). Mesmo laço de
 * validação e reparo da geração. O agente nunca edita o rascunho: isto é uma proposta.
 */
export async function reviseLesson(set: AdapterSet, args: ReviseLessonArgs, opts: LoopOpts = {}): Promise<LessonResult & { conversionWarnings: string[] }> {
  const { script, warnings } = graphToScriptWithWarnings(args.graph);
  if (script.scenes.length < 3) throw new Error('A aula ainda não tem cenas suficientes para revisar; gere a aula antes.');
  const only = new Set((args.nodeIds ?? []).filter((id) => script.scenes.some((sc) => sc.id === id)));
  const scopedNote = only.size
    ? `Altere SÓ ${only.size === 1 ? 'a cena' : 'as cenas'} ${script.scenes.filter((sc) => only.has(sc.id)).map((sc) => `"${sc.title}" (${sc.id})`).join(', ')}; todas as outras cenas voltam idênticas.`
    : '';
  const instruction = [scopedNote, args.instruction?.trim()].filter(Boolean).join(' ') || undefined;
  const r = await scriptLoop(
    set,
    {
      task: 'revise_lesson', repairTask: 'revise_lesson_repair', label: args.lesson.title,
      buildInput: () => buildReviseInput({ ...args, instruction, script }),
      toGraph: (s) => applyScriptToGraph(args.graph, s),
      objectiveIds: new Set(args.objectives.map((o) => o.id)),
      transform: only.size ? (s) => restrictScriptToScenes(script, s, only) : undefined,
      // os limites só são exigidos nos focos de encurtar/praticar e na aula inteira (restrita a algumas cenas, não dá para remover as outras);
      // a voz de ensino é exigida nos focos teaching/shorten/practical (numa revisão restrita, só nas cenas-alvo)
      rules: {
        enforce: !only.size && !!args.focus && CAPPED_REVISION_FOCUS.includes(args.focus),
        enforceVoice: !!args.focus && VOICE_REVISION_FOCUS.includes(args.focus),
        // aulas antigas podem não ter a abertura/fechamento didáticos: só aviso (vai junto num reparo)
        didactic: 'warn',
        voiceScope: only.size ? only : undefined,
        castNames: castNamesOf(args.cast),
        family: args.lesson.family,
        allowAssessment: assessmentAllowed(args.lesson),
        beginnerAudience: isBeginnerAudience(args.brief),
      },
    },
    opts,
  );
  return { ...r, conversionWarnings: [...warnings, ...droppedAuthoredDirectionWarnings(args.graph, r.graph)] };
}

/**
 * Cenas cuja direção foi ajustada pelo autor (`source: 'author'`) e que perdem
 * essa direção na revisão porque a fala mudou (o áudio é cortado pelas linhas
 * dos planos). Entram em `conversionWarnings` para o autor decidir antes de aplicar.
 */
export function droppedAuthoredDirectionWarnings(before: LessonGraph, after: LessonGraph): string[] {
  const out: string[] = [];
  const next = new Map(after.nodes.map((n) => [n.id, n]));
  for (const n of before.nodes) {
    const dir = 'direction' in n ? n.direction : undefined;
    if (!dir || dir.source !== 'author') continue;
    const a = next.get(n.id);
    const keeps = a && 'direction' in a && a.direction && a.direction.source === 'author';
    if (!keeps) out.push(`cena "${n.title ?? n.id}": a fala mudou e a direção ajustada por você (${dir.shots.length} ${dir.shots.length === 1 ? 'plano' : 'planos'}) deixa de valer; ao aplicar, dirija a cena de novo ou ajuste os planos`);
  }
  return out;
}

export interface SceneVariation {
  label: string;
  scene: LessonScene;
  /** grafo completo da aula com a variação aplicada */
  graph: LessonGraph;
  issues: { errors: number; warnings: number };
}

export type SceneVariationsArgs = Parameters<typeof buildLessonInput>[0] & { graph: LessonGraph; sceneId: string };

/**
 * Propõe 2–3 variações para uma cena de decisão ou consequência. Cada variação
 * é validada aplicando-a ao roteiro completo e compilando; variações com erro
 * motivam uma rodada de reparo e, se persistirem, são descartadas (ao menos
 * uma válida é exigida). Nada é aplicado automaticamente.
 */
export async function proposeSceneVariations(
  set: AdapterSet,
  args: SceneVariationsArgs,
  opts: LoopOpts = {},
): Promise<{ sceneId: string; sceneType: LessonScene['type']; rationale: string; variations: SceneVariation[]; meta: RunMeta; conversionWarnings: string[] }> {
  const { script, warnings } = graphToScriptWithWarnings(args.graph);
  const target = script.scenes.find((s) => s.id === args.sceneId);
  if (!target) throw new Error(`A cena "${args.sceneId}" não existe na aula`);
  if (!(VARIATION_SCENE_TYPES as readonly string[]).includes(target.type)) throw new Error(`Variações só se aplicam a decisões e consequências (a cena "${args.sceneId}" é ${target.type})`);
  const maxRepairs = opts.maxRepairs ?? 1;
  const results: StructuredResult<unknown>[] = [];
  const objectiveIds = new Set(args.objectives.map((o) => o.id));
  const base = { instructionsVersion: INSTRUCTIONS_VERSION, system: SYSTEM_DESIGNER, schema: SceneVariationsSchema, schemaName: 'scene_variations', effort: 'high' as const };
  let input = buildVariationsInput({ ...args, script });
  let repairs = 0;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const r = await generateWithFallback(set, { ...base, task: attempt === 0 ? 'scene_variations' : 'scene_variations_repair', input }, opts.log);
    results.push(r);
    const problems: string[] = [];
    const evaluated: SceneVariation[] = r.output.variations.map((v, i) => {
      const scene: LessonScene = { ...v.scene, id: target.id };
      if (v.scene.type !== target.type) problems.push(`- variação ${i + 1}: o tipo deve ser "${target.type}" (veio "${v.scene.type}")`);
      const graph = applyScriptToGraph(args.graph, swapScene(script, scene));
      const c = compileLesson(graph, { objectiveIds });
      for (const e of c.errors) problems.push(`- variação ${i + 1}: ${e.code}: ${e.message}`);
      return { label: v.label, scene, graph, issues: { errors: c.errors.length + (v.scene.type !== target.type ? 1 : 0), warnings: c.warnings.length } };
    });
    const valid = evaluated.filter((v) => v.issues.errors === 0);
    if (problems.length === 0 || attempt === maxRepairs) {
      if (valid.length === 0) throw new Error(`Nenhuma variação válida para "${target.title}": ${problems.slice(0, 5).join('; ')}`);
      if (valid.length < evaluated.length) opts.log?.(`[ai] ${evaluated.length - valid.length} variação(ões) descartada(s) por erro de validação`);
      return { sceneId: target.id, sceneType: target.type, rationale: r.output.rationale, variations: valid, meta: meta(results, repairs), conversionWarnings: warnings };
    }
    repairs++;
    opts.log?.(`[ai] variações de "${target.title}" com problemas; pedindo reparo ${repairs}`);
    input = `${buildVariationsInput({ ...args, script })}\n\n<variacoes_anteriores>\n${JSON.stringify(r.output)}\n</variacoes_anteriores>\n\n${TASK_REPAIR}\n${problems.join('\n')}`;
  }
  throw new Error('unreachable');
}

export type DirectScenesArgs = DirectionInputArgs & {
  /** cenas em movimento já existentes em cenas da aula que NÃO estão sendo dirigidas agora (contam no limite por aula) */
  existingCinematicShots?: number;
};

export interface DirectedScene {
  nodeId: string;
  direction: SceneDirection;
}

export interface DirectScenesResult {
  scenes: DirectedScene[];
  /** cenas descartadas (inválidas após os reparos, longas demais ou de um lote que falhou) */
  errors: Array<{ nodeId: string; message: string }>;
  /** ajustes automáticos (ex.: cenas em movimento acima do limite da aula convertidas em presenter) */
  warnings: Array<{ nodeId: string; shotId: string; message: string }>;
  meta: RunMeta;
}

type ProposalShotLike = Parameters<typeof validateDirectionScene>[0]['shots'][number];

/** SceneDirection → formato de proposta (para revalidar depois de ajustes automáticos). */
function directionAsProposal(nodeId: string, d: SceneDirection): Parameters<typeof validateDirectionScene>[0] {
  return {
    nodeId,
    intent: d.intent,
    shots: d.shots.map((s): ProposalShotLike => ({
      id: s.id, line: s.line, cameraId: s.cameraId ?? null, framing: s.framing, layout: s.layout, cameraMove: s.cameraMove, motionPrompt: s.motionPrompt ?? '',
      slide: s.slide ? { title: s.slide.title, bullets: s.slide.bullets, highlight: s.slide.highlight ?? null, style: s.slide.style, variant: s.slide.variant ?? null } : null,
      caption: s.caption ?? null, transitionIn: s.transitionIn,
      cinematic: s.cinematic ? { action: s.cinematic.action ?? 'walk_across', prompt: s.cinematic.prompt, setting: s.cinematic.setting ?? null } : null,
    })),
  };
}

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Divide uma fala longa em dois trechos EXATOS do original (fronteira de
 * frase, depois vírgula/reticências, depois antes de "e/mas/que/porque", por
 * fim qualquer espaço), escolhendo o corte mais perto do meio com as duas
 * partes entre o mínimo e o máximo de palavras do plano.
 */
export function splitLineInTwo(line: string): [string, string] | null {
  const spaces = [...line.matchAll(/\s+/g)].map((m) => m.index!);
  const ok = (pos: number) => {
    const a = line.slice(0, pos).trim();
    const b = line.slice(pos).trim();
    return wc(a) >= MIN_SHOT_WORDS && wc(b) >= MIN_SHOT_WORDS && wc(a) <= MAX_SHOT_WORDS && wc(b) <= MAX_SHOT_WORDS;
  };
  const total = wc(line);
  const tiers: Array<(pos: number) => boolean> = [
    (pos) => /[.!?…]["'”’»)]*$/.test(line.slice(0, pos)),
    (pos) => /[,;:]$|\.\.\.$/.test(line.slice(0, pos)),
    (pos) => /^\s+(e|mas|que|porque)\b/i.test(line.slice(pos)),
    () => true,
  ];
  for (const tier of tiers) {
    const cands = spaces.filter((p) => tier(p) && ok(p));
    if (cands.length) {
      const best = cands.reduce((x, y) => (Math.abs(wc(line.slice(0, x)) - total / 2) <= Math.abs(wc(line.slice(0, y)) - total / 2) ? x : y));
      return [line.slice(0, best).trim(), line.slice(best).trim()];
    }
  }
  return null;
}

/** Gesto seguro diferente dos vizinhos (planos convertidos ganham um gesto). */
function gestureAvoiding(...neighbors: Array<string | undefined>): string {
  const keys = new Set(neighbors.map((n) => gestureKey(n)).filter(Boolean));
  return (SAFE_GESTURES.find((g) => (g.mood === 'explaining' || g.mood === 'serious') && !keys.has(gestureKey(g.prompt))) ?? SAFE_GESTURES[0]!).prompt;
}

/**
 * Plano em movimento convertido em apresentador: até 26 palavras vira um plano
 * medium (ou close, se os vizinhos já são medium); acima disso, dois planos
 * (medium + close) cortados numa fronteira de frase ou vírgula.
 */
function convertCinematic(shots: Shot[], index: number): Shot[] | null {
  const shot = shots[index]!;
  const { cinematic: _drop, ...rest } = shot;
  const prev = shots[index - 1];
  const next = shots[index + 1];
  const neighbors = [prev?.layout === 'cinematic' ? undefined : prev?.framing, next?.layout === 'cinematic' ? undefined : next?.framing];
  const base = { ...rest, layout: 'presenter' as const, cameraMove: 'static' as const };
  if (wc(shot.line) <= MAX_SHOT_WORDS) {
    const framing = neighbors.filter((f) => f === 'medium').length ? 'close' : 'medium';
    return [{ ...base, framing, motionPrompt: gestureAvoiding(prev?.motionPrompt, next?.motionPrompt) }];
  }
  const parts = splitLineInTwo(shot.line);
  if (!parts) return null;
  const ids = new Set(shots.map((s) => s.id));
  let id2 = `${shot.id}b`.slice(0, 40);
  for (let k = 2; ids.has(id2); k++) id2 = `${shot.id.slice(0, 36)}b${k}`;
  const g1 = gestureAvoiding(prev?.motionPrompt);
  const g2 = gestureAvoiding(g1, next?.motionPrompt);
  const f1 = prev?.framing === 'medium' && prev.layout !== 'cinematic' ? 'close' : 'medium';
  const f2 = f1 === 'medium' ? 'close' : 'medium';
  return [{ ...base, line: parts[0], framing: f1, motionPrompt: g1 }, { ...base, id: id2, line: parts[1], framing: f2, motionPrompt: g2, transitionIn: 'cut' }];
}

/**
 * Limite de cenas em movimento por aula: mantém as primeiras `budget` (ordem das
 * cenas, depois dos planos) e converte as demais em apresentador, sem pedir
 * reparo ao modelo (evita laços). A cena ajustada é revalidada: fala acima de
 * 26 palavras vira dois planos; enquadramentos repetidos são trocados. Se ainda
 * assim ficar inválida, a cena vai para `errors` (nunca sai um plano inválido).
 */
export function enforceCinematicLessonCap(
  scenes: DirectedScene[],
  budget: number,
  opts: { targets?: readonly DirectionTarget[]; cameras?: Parameters<typeof validateDirectionScene>[2]; useSlides?: boolean; cameraMode?: 'single' | 'multi'; placement?: { presenterPlacement?: string | null; presenterScale?: number | null }; zones?: ZoneCameraSet | null } = {},
): { scenes: DirectedScene[]; warnings: DirectScenesResult['warnings']; errors: DirectScenesResult['errors'] } {
  let left = Math.max(0, budget);
  const warnings: DirectScenesResult['warnings'] = [];
  const errors: DirectScenesResult['errors'] = [];
  const out: DirectedScene[] = [];
  for (const sc of scenes) {
    let shots = [...sc.direction.shots];
    let changed = false;
    let failed: string | null = null;
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]!;
      if (shot.layout !== 'cinematic') continue;
      if (left > 0) {
        left--;
        continue;
      }
      const converted = convertCinematic(shots, i);
      if (!converted) {
        failed = `cena em movimento acima do limite da aula (${Math.max(0, budget)}) e a fala do plano ${shot.id} não pôde ser dividida; dirija a cena de novo`;
        break;
      }
      changed = true;
      warnings.push({ nodeId: sc.nodeId, shotId: shot.id, message: `cena em movimento acima do limite da aula (${Math.max(0, budget)}); plano ${shot.id} convertido em apresentador (${converted.map((c) => c.framing).join(' + ')})` });
      shots.splice(i, 1, ...converted);
      i += converted.length - 1;
    }
    if (failed) {
      errors.push({ nodeId: sc.nodeId, message: failed });
      continue;
    }
    if (!changed) {
      out.push(sc);
      continue;
    }
    // três enquadramentos iguais seguidos (fora das cenas em movimento): troca o do meio
    for (let i = 2; i < shots.length; i++) {
      const [a, b, c] = [shots[i - 2]!, shots[i - 1]!, shots[i]!];
      if ([a, b, c].some((x) => x.layout === 'cinematic')) continue;
      if (a.framing === b.framing && b.framing === c.framing) shots[i - 1] = { ...b, framing: b.framing === 'close' ? 'medium' : 'close' };
    }
    if (shots.length > 12) {
      errors.push({ nodeId: sc.nodeId, message: 'cena em movimento acima do limite da aula; a conversão passaria de 12 planos; dirija a cena de novo' });
      continue;
    }
    let direction: SceneDirection;
    try {
      direction = SceneDirectionSchema.parse({ ...sc.direction, shots });
    } catch (e) {
      errors.push({ nodeId: sc.nodeId, message: `ajuste automático inválido: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` });
      continue;
    }
    const target = opts.targets?.find((t) => t.nodeId === sc.nodeId);
    if (target) {
      const problems = validateDirectionScene(directionAsProposal(sc.nodeId, direction), target, opts.cameras ?? [], { useSlides: opts.useSlides, maxCinematic: 1, cameraMode: opts.cameraMode, placement: opts.placement, zones: opts.zones });
      if (problems.length) {
        errors.push({ nodeId: sc.nodeId, message: `ajuste automático do limite de cenas em movimento deixou a cena inválida: ${problems.slice(0, 3).join('; ')}` });
        continue;
      }
    }
    out.push({ nodeId: sc.nodeId, direction });
  }
  return { scenes: out, warnings, errors };
}

/** Máximo de cenas por chamada ao modelo (aulas maiores são divididas em lotes). */
export const DIRECTION_CHUNK_SIZE = 8;

const countCinematic = (d: Pick<SceneDirection, 'shots'>) => d.shots.filter((s) => s.layout === 'cinematic').length;

/**
 * IA diretora: propõe a direção (planos) das cenas-alvo de uma aula. Uma
 * chamada por lote de até 8 cenas; cada cena é validada (falas reproduzem a
 * fala em ordem, ids únicos, câmeras existentes, limites de slide e de planos)
 * e as inválidas voltam ao modelo com o erro exato (até 2 rodadas de reparo,
 * só com as cenas inválidas). Cenas que continuarem inválidas são descartadas
 * e relatadas em `errors`; falas acima de 12 × 26 palavras nem vão ao modelo;
 * um lote que falha (resposta ilegível após os reparos, erro do provedor) vira
 * erro das suas cenas sem derrubar os outros lotes. O limite de cenas em
 * movimento por aula é descontado lote a lote. As falas aprovadas são
 * realinhadas ao texto original da cena. Nada é aplicado: é proposta.
 */
export async function directScenes(set: AdapterSet, args: DirectScenesArgs, opts: LoopOpts = {}): Promise<DirectScenesResult> {
  if (args.scenes.length === 0) throw new Error('Nenhuma cena com fala ou texto para dirigir');
  const maxRepairs = opts.maxRepairs ?? 2;
  const results: StructuredResult<unknown>[] = [];
  const directed = new Map<string, SceneDirection>();
  const errors: DirectScenesResult['errors'] = [];
  const warnings: DirectScenesResult['warnings'] = [];
  let repairs = 0;
  const base = { instructionsVersion: DIRECTION_INSTRUCTIONS_VERSION, system: SYSTEM_DIRECTOR, schema: SceneDirectionProposalSchema, schemaName: 'scene_direction', effort: 'high' as const };
  let cinematicLeft = Math.max(0, (args.style?.maxCinematicPerLesson ?? DEFAULT_MAX_CINEMATIC_PER_LESSON) - (args.existingCinematicShots ?? 0));
  const previous: PreviousSceneDirection[] = [...(args.previousDirections ?? [])];
  // estúdio com zonas: câmeras de zona do kit e o lado das últimas pílulas ANTES da primeira cena pedida (para alternar)
  const zones = zoneCamerasOf(args.cameras);
  const firstPos = args.scenes[0]?.position ?? Number.POSITIVE_INFINITY;
  let chipsZone = zones
    ? [...previous].filter((d) => (d.position ?? -1) < firstPos).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).reduce<'left' | 'right' | undefined>((z, d) => lastChipsZoneOf(d.direction.shots, args.cameras) ?? z, undefined)
    : undefined;

  // falas que não cabem em 12 planos de 26 palavras: nem vão ao modelo
  const eligible: DirectionTarget[] = [];
  for (const t of args.scenes) {
    const w = spokenWords(t.narration).length;
    if (w > MAX_SHOTS_PER_SCENE_WORDS) {
      const message = `fala longa demais (${w} palavras; máximo ${MAX_SHOTS_PER_SCENE_WORDS}, 12 planos de ${MAX_SHOT_WORDS}); ${t.hasNarration ? 'encurte a fala ou divida a cena' : 'escreva a narration (a cena usa o texto da tela)'}`;
      errors.push({ nodeId: t.nodeId, message });
      opts.log?.(`[ai] direção da cena "${t.nodeId}" não pedida: ${message}`);
    } else eligible.push(t);
  }

  for (let c = 0; c < eligible.length; c += DIRECTION_CHUNK_SIZE) {
    const chunk = eligible.slice(c, c + DIRECTION_CHUNK_SIZE);
    const budget = cinematicLeft;
    const inputArgs: DirectionInputArgs = { ...args, style: { ...args.style, maxCinematicPerLesson: budget }, previousDirections: previous.slice(-12) };
    let pending: DirectionTarget[] = chunk;
    let input = buildDirectionInput({ ...inputArgs, scenes: pending });
    let lastProblems = new Map<string, string[]>();
    let batchError: string | null = null;
    const chunkDirected = new Map<string, SceneDirection>();
    for (let attempt = 0; attempt <= maxRepairs && pending.length; attempt++) {
      let r: StructuredResult<SceneDirectionProposal>;
      try {
        r = await generateWithFallback(set, { ...base, task: attempt === 0 ? 'scene_direction' : 'scene_direction_repair', input }, opts.log);
      } catch (e) {
        if (e instanceof LlmError && e.kind === 'auth') throw e;
        if (isUnusableOutput(e) && attempt < maxRepairs) {
          repairs++;
          opts.log?.(`[ai] direção ilegível (${e instanceof Error ? e.message.slice(0, 120) : 'formato'}); pedindo reparo ${repairs}`);
          lastProblems = new Map(pending.map((t) => [t.nodeId, [`cena "${t.nodeId}": a resposta anterior não validou contra o formato pedido`]]));
          input = `${buildDirectionInput({ ...inputArgs, scenes: pending })}\n\n${TASK_DIRECTION_REPAIR}\n- a resposta anterior não validou contra o formato pedido (JSON fora do schema); devolva todas as cenas com todos os campos (null quando não se aplica) e respeite os tamanhos máximos`;
          continue;
        }
        batchError = `${isUnusableOutput(e) ? 'resposta ilegível do modelo' : 'falha ao chamar o modelo'}: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
        break;
      }
      results.push(r);
      const byId = new Map<string, DirectionSceneProposal>();
      for (const sc of r.output.scenes) if (!byId.has(sc.nodeId)) byId.set(sc.nodeId, sc);
      const problems = new Map<string, string[]>();
      const invalid: Array<{ target: DirectionTarget; previous?: DirectionSceneProposal }> = [];
      for (const target of pending) {
        const sc = byId.get(target.nodeId);
        if (!sc) {
          problems.set(target.nodeId, [`cena "${target.nodeId}": ausente na resposta; devolva a direção desta cena`]);
          invalid.push({ target });
          continue;
        }
        const p = validateDirectionScene(sc, target, args.cameras, { useSlides: args.style?.useSlides, maxCinematic: budget > 0 ? 1 : 0, cameraMode: args.style?.cameraMode ?? 'single', placement: args.placement, zones });
        let direction: SceneDirection | null = null;
        if (p.length === 0) {
          const lines = alignLinesToNarration(target.narration, sc.shots.map((s) => s.line));
          if (!lines) p.push(`cena "${target.nodeId}": as falas dos planos não se alinham à fala da cena; reproduza-a exatamente`);
          else {
            try {
              direction = directionProposalToSceneDirection({ ...sc, shots: sc.shots.map((s, i) => ({ ...s, line: lines[i]! })) });
            } catch (e) {
              p.push(`cena "${target.nodeId}": ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
            }
          }
        }
        if (direction) chunkDirected.set(target.nodeId, direction);
        else {
          problems.set(target.nodeId, p);
          invalid.push({ target, previous: sc });
        }
      }
      lastProblems = problems;
      pending = invalid.map((i) => i.target);
      if (!pending.length || attempt === maxRepairs) break;
      repairs++;
      opts.log?.(`[ai] direção com ${pending.length} cena(s) inválida(s); pedindo reparo ${repairs}`);
      const prevProposals = invalid.filter((i) => i.previous).map((i) => i.previous);
      input = `${buildDirectionInput({ ...inputArgs, scenes: pending })}${prevProposals.length ? `\n\n<direcao_anterior>\n${JSON.stringify({ scenes: prevProposals })}\n</direcao_anterior>` : ''}\n\n${TASK_DIRECTION_REPAIR}\n${[...problems.values()].flat().map((m) => `- ${m}`).join('\n')}`;
    }
    for (const t of pending) {
      const message = batchError ?? (lastProblems.get(t.nodeId) ?? ['inválida']).slice(0, 5).join('; ');
      errors.push({ nodeId: t.nodeId, message });
      opts.log?.(`[ai] direção da cena "${t.nodeId}" descartada: ${message}`);
    }
    // limite por aula: aplicado no lote, na ordem das cenas; o que sobra passa ao próximo lote
    const ordered = chunk.filter((t) => chunkDirected.has(t.nodeId)).map((t) => ({ nodeId: t.nodeId, direction: chunkDirected.get(t.nodeId)! }));
    const capped = enforceCinematicLessonCap(ordered, budget, { targets: chunk, cameras: args.cameras, useSlides: args.style?.useSlides, cameraMode: args.style?.cameraMode ?? 'single', placement: args.placement, zones });
    warnings.push(...capped.warnings);
    errors.push(...capped.errors);
    for (const w of capped.warnings) opts.log?.(`[ai] cena "${w.nodeId}": ${w.message}`);
    for (const sc of capped.scenes) {
      // câmera em tela cheia: sem zoom/movimento digital (corrige para o enquadramento nativo + static e avisa)
      const ff = clampDirectionFullFrame(sc.direction, args.cameras, args.placement);
      sc.direction = ff.direction;
      for (const w of ff.warnings) {
        warnings.push({ nodeId: sc.nodeId, ...w });
        opts.log?.(`[ai] cena "${sc.nodeId}": ${w.message}`);
      }
      // estúdio com zonas: pílulas numa câmera lateral alternando o lado (corrige e avisa); cortes só entre frases (avisa)
      if (zones) {
        const zr = applyZoneRules(sc.direction, args.cameras, zones, chipsZone);
        sc.direction = zr.direction;
        chipsZone = zr.lastChipsZone ?? chipsZone;
        for (const w of zr.warnings) {
          warnings.push({ nodeId: sc.nodeId, ...w });
          opts.log?.(`[ai] cena "${sc.nodeId}": ${w.message}`);
        }
      }
      // aviso suave: posição do apresentador alternando mais de uma vez na cena (a direção segue válida)
      for (const w of directionPlacementWarnings(sc.direction.shots, args.cameras, args.placement)) {
        warnings.push({ nodeId: sc.nodeId, ...w });
        opts.log?.(`[ai] cena "${sc.nodeId}": ${w.message}`);
      }
      // aviso suave: plano com apresentador sem gesto (gestos naturais pedem um gesto em todo plano explicativo)
      if ((args.style?.gestures ?? 'natural') === 'natural') {
        for (const w of directionGestureWarnings(sc.direction.shots)) {
          warnings.push({ nodeId: sc.nodeId, ...w });
          opts.log?.(`[ai] cena "${sc.nodeId}": ${w.message}`);
        }
      }
      directed.set(sc.nodeId, sc.direction);
      cinematicLeft = Math.max(0, cinematicLeft - countCinematic(sc.direction));
      const t = chunk.find((x) => x.nodeId === sc.nodeId);
      previous.push({ nodeId: sc.nodeId, title: t?.title, position: t?.position, direction: sc.direction });
    }
  }
  const scenes = args.scenes.filter((t) => directed.has(t.nodeId)).map((t) => ({ nodeId: t.nodeId, direction: directed.get(t.nodeId)! }));
  const order = new Map(args.scenes.map((t, i) => [t.nodeId, i]));
  errors.sort((a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0));
  return { scenes, errors, warnings, meta: meta(results, repairs, DIRECTION_INSTRUCTIONS_VERSION, set.primary) };
}

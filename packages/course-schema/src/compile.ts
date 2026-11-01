import type { LessonGraph, Edge } from './graph';
import type { CourseDocument } from './course';
import { isExecutableNodeType, nodeRequiresAnswer, NODE_TYPE_LABELS, type AnyNode } from './nodes';
import { checkConditionTypes, checkEffectTypes, variableScope, type VariableScope, type VariableType } from './dsl';
import { isRichTextEmpty } from './richtext';
import { courseLengthReport } from './length';
import { scaffoldIssues } from './scaffold';
import { resolveCameraPlacement } from './direction';
import { mediaPresentationStale } from './presentation-fingerprint';
import { callStatuses } from './bridge';
import { reactionStatuses } from './reaction';
import type { Presentation } from './course';

export interface CompileIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  lessonId?: string;
}

export interface LessonCompileResult {
  ok: boolean;
  errors: CompileIssue[];
  warnings: CompileIssue[];
  /** nós alcançáveis a partir do início */
  reachable: string[];
}

export interface CourseCompileResult {
  ok: boolean;
  errors: CompileIssue[];
  warnings: CompileIssue[];
  lessons: Record<string, LessonCompileResult>;
}

function outgoing(graph: LessonGraph): Map<string, Edge[]> {
  const map = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    const list = map.get(e.from) ?? [];
    list.push(e);
    map.set(e.from, list);
  }
  return map;
}

/**
 * Compilador de publicação de uma aula. Erros impedem publicar. Avisos são
 * editoriais. Validação estrutural não é prova de qualidade pedagógica.
 */
export interface CompileLessonOptions {
  lessonId?: string;
  objectiveIds?: Set<string>;
  /**
   * Nós das OUTRAS aulas do mesmo curso (id → nó). Quando informado, uma fonte
   * de recap fora desta aula é verificada de verdade (erro se não existir ou
   * tiver o tipo errado); quando ausente, a compilação de aula só avisa.
   */
  externalNodes?: ReadonlyMap<string, AnyNode>;
  /**
   * Apresentação atual do curso. Quando informada, o vídeo gerado com OUTRA
   * apresentação (impressão diferente) recebe `MEDIA_STALE` ("a apresentação mudou").
   */
  presentation?: Presentation;
  /**
   * Avisar `MEDIA_MISSING` em cenas com texto para narrar e sem vídeo. O
   * compilador de curso liga isto quando há apresentador escolhido (vídeo é
   * a intenção); no editor ao vivo fica desligado para não poluir o storyboard.
   */
  missingMedia?: boolean;
  /**
   * Ids de nós desta aula com job de vídeo aberto (fila/produção). O compilador
   * é puro: quem chama (validação/publicação) consulta a fila e passa aqui.
   * Esses nós recebem `MEDIA_IN_PROGRESS` em vez dos outros avisos de mídia.
   */
  openMediaNodeIds?: ReadonlySet<string>;
}

export function compileLesson(graph: LessonGraph, opts: CompileLessonOptions = {}): LessonCompileResult {
  const errors: CompileIssue[] = [];
  const warnings: CompileIssue[] = [];
  const tag = (i: Omit<CompileIssue, 'lessonId'>): CompileIssue => (opts.lessonId ? { ...i, lessonId: opts.lessonId } : i);
  const err = (i: Omit<CompileIssue, 'lessonId'>) => errors.push(tag(i));
  const warn = (i: Omit<CompileIssue, 'lessonId'>) => warnings.push(tag(i));

  const nodeById = new Map<string, AnyNode>();
  for (const n of graph.nodes) {
    if (nodeById.has(n.id)) err({ code: 'DUPLICATE_NODE_ID', message: `ID de nó duplicado: "${n.id}"`, nodeId: n.id });
    nodeById.set(n.id, n);
  }
  const edgeIds = new Set<string>();
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) err({ code: 'DUPLICATE_EDGE_ID', message: `ID de aresta duplicado: "${e.id}"`, edgeId: e.id });
    edgeIds.add(e.id);
  }

  // Nó inicial
  if (!nodeById.has(graph.startNodeId)) {
    err({ code: 'START_NOT_FOUND', message: `Nó inicial "${graph.startNodeId}" não existe` });
  }

  // Tipos sem executor registrado
  for (const n of graph.nodes) {
    if (!isExecutableNodeType(n.type)) {
      err({ code: 'NODE_TYPE_NOT_EXECUTABLE', message: `Bloco "${NODE_TYPE_LABELS[n.type]}" ainda não tem executor registrado`, nodeId: n.id });
    }
  }

  // Variáveis. Uma variável de curso (`scope: 'course'`) pode ser só lida nesta
  // aula — o valor vem das aulas anteriores (ou de `initial`, se o aluno ainda
  // não passou por quem a grava) —, então não há aviso de "nunca atribuída".
  const vars = new Map<string, VariableType>();
  for (const v of graph.variables) {
    if (vars.has(v.name)) err({ code: 'DUPLICATE_VARIABLE', message: `Variável duplicada: "${v.name}"` });
    const vt = typeof v.initial === 'number' ? 'number' : typeof v.initial === 'boolean' ? 'boolean' : 'string';
    if (vt !== v.type) err({ code: 'VARIABLE_INITIAL_TYPE', message: `Valor inicial de "${v.name}" não é ${v.type}` });
    vars.set(v.name, v.type);
  }
  const knownIds = new Set(nodeById.keys());

  // Arestas: referências, opções, condições
  const out = outgoing(graph);
  for (const e of graph.edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from) err({ code: 'EDGE_FROM_MISSING', message: `Aresta "${e.id}" parte de nó inexistente "${e.from}"`, edgeId: e.id });
    if (!to) err({ code: 'EDGE_TO_MISSING', message: `Aresta "${e.id}" aponta para nó inexistente "${e.to}"`, edgeId: e.id, nodeId: e.from });
    if (from?.type === 'end') err({ code: 'EDGE_FROM_END', message: `Encerramento "${from.id}" não pode ter saída`, edgeId: e.id, nodeId: from.id });
    if (from?.type === 'choice') {
      if (!e.optionId) err({ code: 'CHOICE_EDGE_WITHOUT_OPTION', message: `Aresta "${e.id}" sai de uma decisão sem indicar a opção`, edgeId: e.id, nodeId: from.id });
      else if (!from.options.some((o) => o.id === e.optionId))
        err({ code: 'CHOICE_OPTION_MISSING', message: `Opção "${e.optionId}" não existe na decisão "${from.id}"`, edgeId: e.id, nodeId: from.id });
    } else if (from && e.optionId) {
      err({ code: 'OPTION_ON_NON_CHOICE', message: `Aresta "${e.id}" usa optionId em nó que não é decisão`, edgeId: e.id, nodeId: from.id });
    }
    if (e.isDefault && e.condition) err({ code: 'DEFAULT_WITH_CONDITION', message: `Aresta "${e.id}" é fallback e tem condição: a condição seria ignorada`, edgeId: e.id, nodeId: e.from });
    for (const m of checkConditionTypes(e.condition, vars, knownIds, `aresta ${e.id}`)) err({ code: 'CONDITION_TYPE', message: m, edgeId: e.id, nodeId: e.from });
    for (const m of checkEffectTypes(e.effects, vars, `aresta ${e.id}`)) err({ code: 'EFFECT_TYPE', message: m, edgeId: e.id, nodeId: e.from });
  }

  // Por nó: saídas sem ambiguidade e com fallback
  for (const n of graph.nodes) {
    const edges = out.get(n.id) ?? [];
    if (n.type === 'end') continue;
    if (n.type === 'consequence') {
      for (const m of checkEffectTypes(n.effects, vars, `consequência ${n.id}`)) err({ code: 'EFFECT_TYPE', message: m, nodeId: n.id });
    }
    if (n.type === 'choice') {
      for (const o of n.options) {
        const forOption = edges.filter((e) => e.optionId === o.id);
        if (forOption.length === 0) err({ code: 'OPTION_WITHOUT_DESTINATION', message: `Opção "${o.label}" da decisão "${n.title ?? n.id}" não tem destino`, nodeId: n.id });
        if (forOption.length === 1 && forOption[0]!.condition && !forOption[0]!.isDefault)
          err({ code: 'NO_FALLBACK', message: `Opção "${o.label}" tem apenas uma saída condicional e nenhum fallback`, nodeId: n.id });
        if (forOption.length > 1) {
          const defaults = forOption.filter((e) => e.isDefault).length;
          const conditioned = forOption.filter((e) => e.condition && !e.isDefault);
          if (defaults !== 1 || conditioned.length !== forOption.length - 1)
            err({ code: 'OPTION_AMBIGUOUS', message: `Opção "${o.label}" tem várias saídas sem condições e fallback definidos`, nodeId: n.id });
          const prios = conditioned.map((e) => e.priority ?? 0);
          if (new Set(prios).size !== prios.length) err({ code: 'PRIORITY_TIE', message: `Saídas da opção "${o.label}" empatam em prioridade`, nodeId: n.id });
        }
        if (!o.feedback || isRichTextEmpty(o.feedback)) warn({ code: 'OPTION_NO_FEEDBACK', message: `Opção "${o.label}" sem feedback`, nodeId: n.id });
      }
      continue;
    }
    if (edges.length === 0) {
      err({ code: 'NO_EXIT', message: `"${n.title ?? n.id}" não leva a lugar nenhum`, nodeId: n.id });
      continue;
    }
    if (edges.length === 1) {
      if (edges[0]!.condition && !edges[0]!.isDefault) {
        err({ code: 'NO_FALLBACK', message: `"${n.title ?? n.id}" tem apenas uma saída condicional e nenhum fallback`, nodeId: n.id });
      }
      continue;
    }
    const defaults = edges.filter((e) => e.isDefault);
    const conditioned = edges.filter((e) => !e.isDefault);
    if (defaults.length !== 1) err({ code: 'NO_FALLBACK', message: `"${n.title ?? n.id}" tem ${edges.length} saídas e ${defaults.length === 0 ? 'nenhum' : 'mais de um'} fallback`, nodeId: n.id });
    if (conditioned.some((e) => !e.condition)) err({ code: 'UNCONDITIONED_BRANCH', message: `"${n.title ?? n.id}" tem saída sem condição que não é fallback`, nodeId: n.id });
    const prios = conditioned.map((e) => e.priority ?? 0);
    if (new Set(prios).size !== prios.length) err({ code: 'PRIORITY_TIE', message: `Saídas de "${n.title ?? n.id}" empatam em prioridade`, nodeId: n.id });
  }

  // Conteúdo mínimo e objetivos
  for (const n of graph.nodes) {
    const body =
      n.type === 'scenario' || n.type === 'content' || n.type === 'consequence' ? n.body
      : n.type === 'choice' || n.type === 'reflection' || n.type === 'assessment' ? n.prompt
      : n.type === 'end' ? n.summary : undefined;
    if (body && isRichTextEmpty(body)) warn({ code: 'EMPTY_BODY', message: `"${n.title ?? n.id}" está sem texto`, nodeId: n.id });
    if (opts.objectiveIds) {
      for (const oid of n.objectiveIds) if (!opts.objectiveIds.has(oid)) err({ code: 'OBJECTIVE_MISSING', message: `Nó "${n.id}" referencia objetivo inexistente "${oid}"`, nodeId: n.id });
    }
    if (nodeRequiresAnswer(n.type) && n.objectiveIds.length === 0) warn({ code: 'NO_OBJECTIVE', message: `"${n.title ?? n.id}" não está ligado a nenhum objetivo`, nodeId: n.id });
    if (n.type === 'assessment') {
      const correct = n.options.filter((o) => o.correct).length;
      if (correct === 0) err({ code: 'ASSESSMENT_NO_CORRECT', message: `Avaliação "${n.title ?? n.id}" não tem opção correta`, nodeId: n.id });
      if (n.mode === 'single' && correct > 1) err({ code: 'ASSESSMENT_SINGLE_MULTI', message: `Avaliação "${n.title ?? n.id}" é de resposta única mas tem ${correct} corretas`, nodeId: n.id });
      if (n.passing.kind === 'min_correct' && n.passing.min > correct) err({ code: 'ASSESSMENT_MIN_TOO_HIGH', message: `Critério exige ${n.passing.min} acertos, mas só há ${correct} opções corretas`, nodeId: n.id });
      const optIds = new Set<string>();
      for (const o of n.options) { if (optIds.has(o.id)) err({ code: 'DUPLICATE_OPTION_ID', message: `Opção duplicada "${o.id}"`, nodeId: n.id }); optIds.add(o.id); }
    }
    if (n.type === 'choice') {
      const optIds = new Set<string>();
      for (const o of n.options) { if (optIds.has(o.id)) err({ code: 'DUPLICATE_OPTION_ID', message: `Opção duplicada "${o.id}"`, nodeId: n.id }); optIds.add(o.id); }
    }
    if (n.type === 'mission') {
      const label = n.title?.trim() || n.id;
      if (!n.title?.trim()) err({ code: 'MISSION_TITLE', message: `A missão "${n.id}" precisa de um título`, nodeId: n.id });
      if (!n.intro.trim()) err({ code: 'MISSION_INTRO', message: `A missão "${label}" precisa dizer por que vale a pena (intro)`, nodeId: n.id });
      if (!n.action.trim()) err({ code: 'MISSION_ACTION', message: `A missão "${label}" precisa de uma ação concreta para fazer fora da plataforma`, nodeId: n.id });
      if (!n.alternative.trim()) err({ code: 'MISSION_ALTERNATIVE', message: `A missão "${label}" precisa de uma alternativa para quem ainda não trabalha`, nodeId: n.id });
      if (n.draftFromNodeId) {
        const src = nodeById.get(n.draftFromNodeId);
        if (!src) err({ code: 'MISSION_DRAFT_SOURCE', message: `A missão "${label}" usa a frase de "${n.draftFromNodeId}", que não existe nesta aula`, nodeId: n.id });
        else if (src.type !== 'reflection') err({ code: 'MISSION_DRAFT_SOURCE', message: `A missão "${label}" usa a frase de "${src.title ?? src.id}", que não é uma atividade "Na prática"`, nodeId: n.id });
      }
    }
    if (n.type === 'reflection' && n.scaffold) {
      for (const i of scaffoldIssues(n.scaffold, n.maxLength)) (i.level === 'error' ? err : warn)({ code: i.code, message: `"${n.title ?? n.id}": ${i.message}`, nodeId: n.id });
    }
    if (n.type === 'content' && n.reviewNodeIds?.length) {
      const seen = new Set<string>();
      for (const rid of n.reviewNodeIds) {
        if (seen.has(rid)) err({ code: 'REVIEW_DUPLICATE', message: `"${n.title ?? n.id}" revisa "${rid}" mais de uma vez`, nodeId: n.id });
        seen.add(rid);
        const target = nodeById.get(rid);
        if (!target) err({ code: 'REVIEW_SOURCE_MISSING', message: `"${n.title ?? n.id}" revisa "${rid}", que não existe nesta aula`, nodeId: n.id });
        else if (target.type !== 'choice') err({ code: 'REVIEW_SOURCE_MISSING', message: `"${n.title ?? n.id}" revisa "${target.title ?? rid}", que não é uma decisão`, nodeId: n.id });
        else if (!target.options.some((o) => o.quality)) warn({ code: 'REVIEW_NO_QUALITY', message: `A decisão "${target.title ?? rid}" não marca a qualidade das opções: a revisão não mostra "Forte" / "Pode melhorar"`, nodeId: n.id });
      }
    }
    // Estado da mídia (auditoria P1-1/P1-2): só avisos, nunca bloqueiam aqui; a
    // publicação decide o que aceita (simulada só em modo de demonstração ou com aceite explícito).
    if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence' || n.type === 'choice') {
      const label = n.title ?? n.id;
      const hasText = !!body && !isRichTextEmpty(body);
      const narrated = hasText || ('narration' in n && typeof n.narration === 'string' && n.narration.trim().length > 0);
      if (opts.openMediaNodeIds?.has(n.id)) {
        warn({ code: 'MEDIA_IN_PROGRESS', message: `O vídeo de "${label}" ainda está em produção`, nodeId: n.id });
      } else if (n.media?.stale) {
        warn({ code: 'MEDIA_STALE', message: `Mídia de "${label}" está desatualizada em relação ao texto`, nodeId: n.id });
      } else if (n.media && opts.presentation && mediaPresentationStale(n.media, opts.presentation, n)) {
        warn({ code: 'MEDIA_STALE', message: `Mídia de "${label}" está desatualizada: a apresentação (apresentador, voz, fundo ou posição) mudou depois do vídeo`, nodeId: n.id });
      } else if (!n.media && opts.missingMedia && narrated) {
        warn({ code: 'MEDIA_MISSING', message: `"${label}" tem texto para narrar mas ainda não tem vídeo`, nodeId: n.id });
      }
      if (n.media?.generatedFrom?.simulated) warn({ code: 'MEDIA_SIMULATED', message: `O vídeo de "${label}" é uma simulação (modo de demonstração), não um vídeo real`, nodeId: n.id });
    }
  }

  // Ponte vídeo → pergunta (bridge.ts): a instrutora chama o aluno no fim do vídeo antes da decisão. Só avisos.
  for (const st of callStatuses(graph)) {
    if (!st.hostId) continue;
    const q = nodeById.get(st.choiceId);
    const label = q?.title ?? st.choiceId;
    const host = nodeById.get(st.hostId);
    const hostLabel = host?.title ?? st.hostId;
    if (!st.call) warn({ code: 'CHOICE_NO_CALL', message: `A pergunta "${label}" não tem frase de chamada: o vídeo "${hostLabel}" termina sem chamar o aluno para responder`, nodeId: st.choiceId });
    else if (!st.spoken) warn({ code: 'CALL_NOT_SPOKEN', message: `A chamada da pergunta "${label}" ainda não está na fala do vídeo "${hostLabel}"`, nodeId: st.choiceId });
  }

  // Reação da instrutora a cada resposta (reaction.ts): texto por opção e o estado do vídeo. Só avisos.
  {
    const byChoice = new Map<string, ReturnType<typeof reactionStatuses>>();
    for (const r of reactionStatuses(graph)) byChoice.set(r.choiceId, [...(byChoice.get(r.choiceId) ?? []), r]);
    for (const [choiceId, list] of byChoice) {
      const label = nodeById.get(choiceId)?.title ?? choiceId;
      const noText = list.filter((r) => !r.text).length;
      if (noText) warn({ code: 'REACTION_MISSING', message: `A pergunta "${label}" tem ${noText} ${noText === 1 ? 'resposta sem reação' : 'respostas sem reação'} da instrutora`, nodeId: choiceId });
      const stale = list.filter((r) => r.text && r.hasVideo && r.stale).length;
      if (stale) warn({ code: 'MEDIA_STALE', message: `${stale} ${stale === 1 ? 'reação' : 'reações'} da pergunta "${label}" com vídeo desatualizado em relação ao texto`, nodeId: choiceId });
      const missing = list.filter((r) => r.text && !r.hasVideo && !opts.openMediaNodeIds?.has(r.targetId)).length;
      if (missing && opts.missingMedia) warn({ code: 'MEDIA_MISSING', message: `${missing} ${missing === 1 ? 'reação' : 'reações'} da pergunta "${label}" ainda sem vídeo`, nodeId: choiceId });
    }
  }

  // Recap ("Meu roteiro"): fontes de reflexão/decisão precisam existir e ter o tipo certo
  for (const n of graph.nodes) {
    if (n.type !== 'end' || !n.recap?.length) continue;
    const recapIds = new Set<string>();
    for (const item of n.recap) {
      if (recapIds.has(item.id)) err({ code: 'RECAP_DUPLICATE_ID', message: `Item de roteiro repetido "${item.id}" em "${n.title ?? n.id}"`, nodeId: n.id });
      recapIds.add(item.id);
      if (item.kind !== 'reflection' && item.kind !== 'choice' && item.kind !== 'mission') continue;
      const want = item.kind === 'reflection' ? 'reflexão' : item.kind === 'mission' ? 'missão' : 'decisão';
      // frases compostas (reflexões com molde) que têm prioridade sobre a escolha
      for (const sourceId of item.composedNodeIds ?? []) {
        const src = nodeById.get(sourceId) ?? opts.externalNodes?.get(sourceId);
        if (!src) {
          if (opts.externalNodes) err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro usa a frase de "${sourceId}", que não existe em nenhuma aula do curso`, nodeId: n.id });
          else warn({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro usa a frase de "${sourceId}", que não está nesta aula (será verificado no curso)`, nodeId: n.id });
        } else if (src.type !== 'reflection') err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro usa a frase de "${src.title ?? src.id}", que não é uma cena de reflexão`, nodeId: n.id });
      }
      if (!item.nodeId) {
        err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro precisa indicar a cena de ${want} de origem`, nodeId: n.id });
        continue;
      }
      // a cena principal e as alternativas (variantes da mesma atividade) seguem a mesma regra
      for (const sourceId of [item.nodeId, ...(item.nodeIds ?? [])]) {
        const local = nodeById.get(sourceId);
        if (local) {
          if (local.type !== item.kind) err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro aponta para "${local.title ?? local.id}", que não é uma cena de ${want}`, nodeId: n.id });
          continue;
        }
        if (!opts.externalNodes) {
          warn({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro aponta para "${sourceId}", que não está nesta aula (será verificado no curso)`, nodeId: n.id });
          continue;
        }
        const ext = opts.externalNodes.get(sourceId);
        if (!ext) err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro aponta para "${sourceId}", que não existe em nenhuma aula do curso`, nodeId: n.id });
        else if (ext.type !== item.kind) err({ code: 'RECAP_SOURCE_MISSING', message: `Item "${item.label}" do roteiro aponta para "${ext.title ?? ext.id}" (outra aula), que não é uma cena de ${want}`, nodeId: n.id });
      }
    }
  }

  // Alcançabilidade, término e ciclos (DFS a partir do início)
  const reachable = new Set<string>();
  const onStack = new Set<string>();
  let cycleReported = false;
  const reachesEnd = new Map<string, boolean>();
  const visit = (id: string): boolean => {
    if (onStack.has(id)) {
      if (!cycleReported) {
        err({ code: 'UNBOUNDED_CYCLE', message: `Há um ciclo passando por "${nodeById.get(id)?.title ?? id}". Ciclos irrestritos bloqueiam a publicação; use tentativas na avaliação.`, nodeId: id });
        cycleReported = true;
      }
      return false;
    }
    if (reachable.has(id)) return reachesEnd.get(id) ?? false;
    reachable.add(id);
    const n = nodeById.get(id);
    if (!n) return false;
    if (n.type === 'end') { reachesEnd.set(id, true); return true; }
    onStack.add(id);
    let any = false;
    for (const e of out.get(id) ?? []) if (nodeById.has(e.to) && visit(e.to)) any = true;
    onStack.delete(id);
    reachesEnd.set(id, any);
    return any;
  };
  if (nodeById.has(graph.startNodeId)) {
    const endOk = visit(graph.startNodeId);
    if (!endOk) err({ code: 'NO_END_REACHABLE', message: 'Nenhum caminho a partir do início chega a um encerramento' });
    if (!cycleReported) {
      for (const id of reachable) {
        const n = nodeById.get(id)!;
        if (n.type !== 'end' && reachesEnd.get(id) === false) err({ code: 'DEAD_END_PATH', message: `A partir de "${n.title ?? id}" não existe caminho até um encerramento`, nodeId: id });
      }
    }
  }
  for (const n of graph.nodes) if (!reachable.has(n.id)) warn({ code: 'UNREACHABLE', message: `"${n.title ?? n.id}" nunca será alcançado`, nodeId: n.id });
  if (!graph.nodes.some((n) => n.type === 'end')) err({ code: 'NO_END_NODE', message: 'A aula não tem bloco de encerramento' });

  return { ok: errors.length === 0, errors, warnings, reachable: [...reachable] };
}

export interface CompileCourseOptions {
  /**
   * Jobs de vídeo abertos (fila/produção), por aula e nó. O compilador é puro;
   * a validação e a publicação consultam a fila e passam aqui → `MEDIA_IN_PROGRESS`.
   */
  openMediaJobs?: Iterable<{ lessonId: string; nodeId: string }>;
}

export function compileCourse(doc: CourseDocument, copts: CompileCourseOptions = {}): CourseCompileResult {
  const openByLesson = new Map<string, Set<string>>();
  for (const j of copts.openMediaJobs ?? []) {
    const set = openByLesson.get(j.lessonId) ?? new Set<string>();
    set.add(j.nodeId);
    openByLesson.set(j.lessonId, set);
  }
  // vídeo é a intenção do curso quando há apresentador escolhido: cenas narradas sem vídeo viram aviso
  const missingMedia = !!doc.presentation.avatarId;
  const errors: CompileIssue[] = [];
  const warnings: CompileIssue[] = [];
  const lessons: Record<string, LessonCompileResult> = {};
  const objectiveIds = new Set(doc.objectives.map((o) => o.id));
  if (doc.objectives.length !== objectiveIds.size) errors.push({ code: 'DUPLICATE_OBJECTIVE', message: 'Há objetivos com o mesmo ID' });
  if (!doc.title.trim()) errors.push({ code: 'COURSE_NO_TITLE', message: 'O curso precisa de título' });
  if (!doc.brief.finalSkill.trim()) warnings.push({ code: 'BRIEF_NO_FINAL_SKILL', message: 'Briefing sem habilidade final observável' });
  if (!doc.brief.audience.trim()) warnings.push({ code: 'BRIEF_NO_AUDIENCE', message: 'Briefing sem público definido' });
  const lessonIds = new Set<string>();
  const moduleIds = new Set<string>();
  let lessonCount = 0;
  // nós de todas as aulas (para fontes de recap em outra aula); o id da aula dona vai junto
  const allNodes = new Map<string, { node: AnyNode; lessonId: string }>();
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) if (!allNodes.has(n.id)) allNodes.set(n.id, { node: n, lessonId: l.id });
  for (const m of doc.modules) {
    if (moduleIds.has(m.id)) errors.push({ code: 'DUPLICATE_MODULE_ID', message: `Módulo duplicado "${m.id}"` });
    moduleIds.add(m.id);
    for (const l of m.lessons) {
      lessonCount++;
      if (lessonIds.has(l.id)) errors.push({ code: 'DUPLICATE_LESSON_ID', message: `Aula duplicada "${l.id}"`, lessonId: l.id });
      lessonIds.add(l.id);
      for (const oid of l.objectiveIds) if (!objectiveIds.has(oid)) errors.push({ code: 'OBJECTIVE_MISSING', message: `Aula "${l.title}" referencia objetivo inexistente "${oid}"`, lessonId: l.id });
      const externalNodes = new Map<string, AnyNode>();
      for (const [id, v] of allNodes) if (v.lessonId !== l.id) externalNodes.set(id, v.node);
      const r = compileLesson(l.graph, { lessonId: l.id, objectiveIds, externalNodes, presentation: doc.presentation, missingMedia, openMediaNodeIds: openByLesson.get(l.id) });
      lessons[l.id] = r;
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
  }
  if (lessonCount === 0) errors.push({ code: 'COURSE_NO_LESSONS', message: 'O curso não tem aulas' });
  // variáveis de curso: o mesmo nome precisa ter o mesmo tipo em todas as aulas que o declaram
  const courseVars = new Map<string, { type: VariableType; lessonId: string; lessonTitle: string }>();
  const scopesByName = new Map<string, Map<VariableScope, string>>();
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      for (const v of l.graph.variables) {
        const scope = variableScope(v);
        const scopes = scopesByName.get(v.name) ?? new Map<VariableScope, string>();
        if (!scopes.has(scope)) scopes.set(scope, l.id);
        scopesByName.set(v.name, scopes);
        if (scope !== 'course') continue;
        const first = courseVars.get(v.name);
        if (!first) courseVars.set(v.name, { type: v.type, lessonId: l.id, lessonTitle: l.title });
        else if (first.type !== v.type)
          errors.push({
            code: 'COURSE_VARIABLE_TYPE_MISMATCH',
            message: `Variável de curso "${v.name}" é ${v.type} na aula "${l.title}", mas ${first.type} na aula "${first.lessonTitle}"`,
            lessonId: l.id,
          });
      }
    }
  }
  for (const [name, scopes] of scopesByName) {
    if (scopes.size > 1)
      warnings.push({
        code: 'COURSE_VARIABLE_SCOPE_MIXED',
        message: `Variável "${name}" é de curso em uma aula e da aula em outra: onde for da aula, o valor não vem das aulas anteriores`,
        lessonId: scopes.get('lesson'),
      });
  }
  for (const id of doc.completion.requiredLessonIds) if (!lessonIds.has(id)) errors.push({ code: 'REQUIRED_LESSON_MISSING', message: `Aula obrigatória "${id}" não existe` });
  // cobertura de objetivos obrigatórios: só blocos ALCANÇÁVEIS contam (um bloco fora do caminho nunca trabalha o objetivo)
  const covered = new Set<string>();
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      const reachable = new Set(lessons[l.id]?.reachable ?? []);
      for (const n of l.graph.nodes) if (reachable.has(n.id)) for (const oid of n.objectiveIds) covered.add(oid);
    }
  }
  for (const o of doc.objectives) if (o.required && !covered.has(o.id)) warnings.push({ code: 'OBJECTIVE_UNCOVERED', message: `Objetivo "${o.title}" não é trabalhado por nenhum bloco alcançável` });
  // extensão: aulas e curso longos demais são avisos editoriais (LESSON_TOO_LONG, COURSE_TOO_LONG), nunca bloqueiam
  warnings.push(...courseLengthReport(doc).warnings);
  warnings.push(...presentationSceneryWarnings(doc.presentation));
  return { ok: errors.length === 0, errors, warnings, lessons };
}

/** Tolerância (fração da altura) entre a base da apresentadora e a linha do balcão antes de avisar. */
export const DESK_GAP_TOLERANCE = 0.02;

/**
 * Cenário com balcão/mesa (`background.foregroundFrom`): avisa quando a base da
 * apresentadora (do curso ou de uma câmera à direita/esquerda) fica acima da
 * linha do balcão (ela "flutuaria"), e quando a faixa não tem efeito porque a
 * apresentadora não é montada por nós (centro). Só avisos: nada bloqueia.
 */
export function presentationSceneryWarnings(pres: CourseDocument['presentation']): CompileIssue[] {
  const out: CompileIssue[] = [];
  const bg = pres.background as { type: string; foregroundFrom?: number; frame?: { x: number; y: number; w: number; h: number } };
  if (bg.type === 'image' && bg.frame) {
    const f = bg.frame;
    if (f.x + f.w > 1.001 || f.y + f.h > 1.001) out.push({ code: 'BACKGROUND_FRAME_OUT_OF_BOUNDS', message: 'A janela de enquadramento do cenário sai da imagem; a montagem a encosta na borda' });
    // frações: numa imagem 16:9 a janela 16:9 tem w = h; a montagem sempre deriva a altura da largura (nunca distorce)
    const fixedH = frameAspectFix(f);
    if (fixedH !== undefined) out.push({ code: 'BACKGROUND_FRAME_ASPECT', message: `A janela de enquadramento do cenário não é 16:9 (altura ${Math.round(f.h * 100)}% para largura ${Math.round(f.w * 100)}%); a montagem usa altura ${Math.round(fixedH * 100)}%` });
  }
  const from = bg.type === 'image' ? bg.foregroundFrom : undefined;
  if (from === undefined) return out;
  const course = resolveCameraPlacement(pres, null);
  if (!course.transparent && !pres.cameras.some((c) => resolveCameraPlacement(pres, c).transparent)) {
    out.push({ code: 'FOREGROUND_WITHOUT_PLACEMENT', message: 'O cenário tem balcão/mesa na frente, mas a apresentadora está no centro (vídeo do provedor como sai): a faixa do balcão só é montada com a posição direita/esquerda' });
    return out;
  }
  const bottom = (r: { bottom?: number }) => r.bottom ?? 1;
  if (course.transparent && bottom(course) < from - DESK_GAP_TOLERANCE) {
    out.push({ code: 'PRESENTER_ABOVE_DESK', message: `A base da apresentadora (${Math.round(bottom(course) * 100)}% da altura) está acima da linha do balcão (${Math.round(from * 100)}%): ela ficaria flutuando. Aproxime a base da linha do balcão` });
  }
  for (const c of pres.cameras) {
    const r = resolveCameraPlacement(pres, c);
    if (!r.transparent || c.bottom === undefined) continue;
    if (bottom(r) < from - DESK_GAP_TOLERANCE) out.push({ code: 'PRESENTER_ABOVE_DESK', message: `Na câmera "${c.name || c.id}", a base da apresentadora (${Math.round(bottom(r) * 100)}%) está acima da linha do balcão (${Math.round(from * 100)}%): ela ficaria flutuando` });
  }
  return out;
}

/**
 * A janela respeita a proporção 16:9? Em frações da imagem (assumida 16:9), a
 * proporção em pixels é w/h; devolve a altura corrigida quando difere mais de
 * 1% (a montagem sempre deriva a altura da largura: nunca distorce).
 */
export function frameAspectFix(frame: { w: number; h: number }, image: { width: number; height: number } = { width: 16, height: 9 }): number | undefined {
  const wantH = (frame.w * image.width) / (16 / 9) / image.height;
  return Math.abs(wantH - frame.h) > 0.01 ? Number(Math.min(1, wantH).toFixed(4)) : undefined;
}

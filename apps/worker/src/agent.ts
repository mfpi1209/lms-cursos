import type { SceneDirection } from '@lms/course-schema';
import { aiConfigFromEnv, courseCastFor, createAdaptersFromEnv, directScenes, directionTargetsFromGraph, generateLesson, proposeOutline, proposeSceneVariations, reviseLesson, scorecardRationale, sourcesExcerpt, videoCapabilitiesText, EVALUATION_INSTRUCTIONS_VERSION, INSTRUCTIONS_VERSION, LlmError, RevisionFocusSchema } from '@lms/ai';
import { evaluateLessonInWorker } from './evaluate';
import { allLessons, briefProfileText, findLesson, zoneCamerasOf } from '@lms/course-schema';
import { and, eq } from 'drizzle-orm';
import { getDb, agent, authoring, schema, sources } from '@lms/db';

const log = (m: string) => console.log(m);

async function readySources(courseId: string) {
  const rows = await sources.listSourcesForCourse(getDb(), courseId);
  return rows.filter((r) => r.status === 'ready' && r.text).map((r) => ({ title: r.title, text: r.text! }));
}

type RunPatch = Partial<typeof schema.agentRuns.$inferInsert>;

/** Reivindica a execução atomicamente (só sai de `queued` uma vez; um cancelamento antes prevalece). */
export async function claimRun(runId: string): Promise<boolean> {
  const t = schema.agentRuns;
  const rows = await getDb().update(t).set({ status: 'running', startedAt: new Date() }).where(and(eq(t.id, runId), eq(t.status, 'queued'))).returning({ id: t.id });
  return rows.length > 0;
}

/** Fecha a execução só se ela ainda estiver `running` (nunca sobrescreve `canceled`). */
export async function finishRun(runId: string, patch: RunPatch): Promise<boolean> {
  const t = schema.agentRuns;
  const rows = await getDb().update(t).set(patch).where(and(eq(t.id, runId), eq(t.status, 'running'))).returning({ id: t.id });
  return rows.length > 0;
}

async function stillRunning(runId: string) {
  return (await agent.getRun(getDb(), runId))?.status === 'running';
}

/**
 * Executa uma tarefa do agente de construção. O provedor é chamado fora de
 * qualquer transação; a proposta é gravada e fica aguardando aprovação.
 */
export async function processAgentRun(runId: string) {
  const db = getDb();
  const run = await agent.getRun(db, runId);
  if (!run || run.status !== 'queued') return;
  if (!(await claimRun(runId))) return;
  const started = Date.now();
  try {
    // trava de gasto (auditoria P0-1): a execução foi criada pela web com um provedor; se este worker resolve outro
    // (trava ALLOW_PAID_PROVIDERS, .env diferente), falha sem chamar nenhuma API — nunca paga por engano nem simula um pedido real
    const workerCfg = aiConfigFromEnv();
    if (run.provider !== workerCfg.provider) {
      throw new Error(`provedor divergente entre web e worker: a execução pede "${run.provider}" e o worker resolve "${workerCfg.provider}"${workerCfg.blockedProvider ? ` (${workerCfg.guardReason})` : ''}. Alinhe AI_PROVIDER/ALLOW_PAID_PROVIDERS nos dois processos e peça de novo.`);
    }
    const set = createAdaptersFromEnv();
    const draft = await authoring.getDraft(db, run.courseId);
    if (!draft) throw new Error('rascunho não encontrado');
    const doc = draft.document;
    const instruction = (run.input as { instruction?: string | null }).instruction ?? undefined;
    const excerpt = sourcesExcerpt(await readySources(run.courseId));
    const briefForPrompt = { tema: doc.brief.topic, publico: doc.brief.audience, perfil_do_publico: briefProfileText(doc.brief), contexto: doc.brief.context, pre_requisitos: doc.brief.prerequisites, habilidade_final: doc.brief.finalSkill, tom: doc.brief.tone, duracao_alvo_min: doc.brief.targetMinutes, descricao: doc.description };

    if (run.task === 'outline') {
      // a IA recebe a estrutura ATUAL (ids, títulos, quais aulas já têm cenas) e, ao "pedir outra proposta", a proposta pendente
      const currentStructure = { modules: doc.modules.map((m) => ({ id: m.id, title: m.title, lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, hasScenes: !agent.isPlaceholderGraph(l.graph), sceneCount: agent.isPlaceholderGraph(l.graph) ? 0 : l.graph.nodes.filter((n) => n.type !== 'end').length })) })) };
      const previous = await agent.latestOpenOutlineProposal(db, run.courseId);
      const r = await proposeOutline(set, { title: doc.title, brief: briefForPrompt, sourcesExcerpt: excerpt, existingObjectives: doc.objectives.length ? doc.objectives : undefined, instruction, narrativeVoice: doc.brief.narrativeVoice, currentStructure, previousProposal: previous?.payload ?? undefined }, log);
      const payload = {
        cast: r.proposal.cast,
        objectives: r.proposal.objectives,
        modules: r.proposal.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, description: l.description, family: l.family, estimatedMinutes: l.estimatedMinutes, objectiveIds: l.objectiveIds, rationale: l.familyRationale, keyScenes: l.keyScenes })) })),
        removedLessonIds: r.proposal.removedLessonIds,
      };
      if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; proposta descartada`);
      // a proposta anterior pendente é substituída por esta
      if (previous) await agent.updateProposal(db, previous.id, { status: 'rejected', decidedAt: new Date() });
      const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'outline', baseRevision: draft.revision, payload, rationale: r.proposal.rationale, summary: { ...agent.proposalSummary('outline', payload, doc), ...(previous ? { replacesProposalId: previous.id } : {}) } });
      await finishRun(runId, { status: 'succeeded', finishedAt: new Date(), provider: r.meta.provider, model: r.meta.model, instructionsVersion: INSTRUCTIONS_VERSION, latencyMs: r.meta.latencyMs, usage: r.meta.usage, costUsd: r.meta.costUsd ?? null, fallbackUsed: r.meta.fallbackUsed, repairs: r.meta.repairs, proposalId: proposal.id, output: { proposalId: proposal.id } });
      log(`[agent] outline ${runId} ok (${r.meta.provider}/${r.meta.model}, ${r.meta.latencyMs} ms)`);
      return;
    }

    const found = run.lessonId ? findLesson(doc, run.lessonId) : undefined;
    if (!found) throw new Error(`aula ${run.lessonId} não existe no rascunho`);
    const others = allLessons(doc).filter((l) => l.id !== found.lesson.id).map((l) => ({ title: l.title, family: l.family, description: l.description }));
    const lessonArgs = {
      title: doc.title, brief: briefForPrompt, objectives: doc.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion })),
      // a verificação (assessment) só entra na última aula do curso
      // cenas previstas e justificativa vêm da estrutura aprovada; o elenco é o mesmo para todas as aulas (P1-4)
      lesson: { id: found.lesson.id, title: found.lesson.title, description: found.lesson.description, family: found.lesson.family, estimatedMinutes: found.lesson.estimatedMinutes, objectiveIds: found.lesson.objectiveIds, keyScenes: found.lesson.keyScenes, rationale: found.lesson.rationale, isLastLesson: allLessons(doc).at(-1)?.id === found.lesson.id },
      otherLessons: others, sourcesExcerpt: excerpt, instruction, narrativeVoice: doc.brief.narrativeVoice, cast: courseCastFor(doc),
    };
    // a versão registrada é a das instruções usadas (a direção tem a própria: DIRECTION_INSTRUCTIONS_VERSION)
    const finish = (proposalId: string, m: { provider: string; model: string; instructionsVersion?: string; latencyMs: number; usage: { inputTokens: number; outputTokens: number }; costUsd?: number; fallbackUsed: boolean; repairs: number }, output: Record<string, unknown>) =>
      finishRun(runId, { status: 'succeeded', finishedAt: new Date(), provider: m.provider, model: m.model, instructionsVersion: m.instructionsVersion ?? INSTRUCTIONS_VERSION, latencyMs: m.latencyMs, usage: m.usage, costUsd: m.costUsd ?? null, fallbackUsed: m.fallbackUsed, repairs: m.repairs, proposalId, output: { proposalId, ...output } });

    if (run.task === 'scene_direction') {
      const raw = run.input as { nodeIds?: unknown; instruction?: string | null };
      const nodeIds = Array.isArray(raw.nodeIds) ? raw.nodeIds.filter((x): x is string => typeof x === 'string') : null;
      const targets = directionTargetsFromGraph(found.lesson.graph, nodeIds);
      if (!targets.length) throw new Error(`a aula "${found.lesson.title}" não tem cenas com fala ou texto para dirigir`);
      const pres = doc.presentation;
      // câmeras ainda gerando (ou que falharam) não podem ser usadas em planos
      const readyCameras = pres.cameras.filter((c) => (c.status ?? 'ready') === 'ready' && c.lookId);
      // cenas em movimento: mudas, exigem narração ElevenLabs; o limite por aula conta as cenas que não estão sendo dirigidas agora
      const maxCinematic = pres.voiceProvider === 'heygen' ? 0 : pres.directionStyle.maxCinematicPerLesson;
      const targetIds = new Set(targets.map((t) => t.nodeId));
      const existingCinematicShots = found.lesson.graph.nodes
        .filter((n) => !targetIds.has(n.id))
        .reduce((a, n) => a + (((n as { direction?: { shots?: Array<{ layout?: string }> } }).direction?.shots ?? []).filter((s) => s.layout === 'cinematic').length), 0);
      const mediaTypes = new Set(['scenario', 'content', 'choice', 'consequence']);
      const mediaNodes = found.lesson.graph.nodes.filter((n) => mediaTypes.has(n.type));
      // cenas da aula já dirigidas (fora deste pedido): a IA contrasta as fronteiras e não repete padrões
      const previousDirections = mediaNodes
        .map((n, position) => ({ n, position }))
        .filter(({ n }) => !targetIds.has(n.id) && (n as { direction?: { shots?: unknown[] } }).direction?.shots?.length)
        .map(({ n, position }) => ({ nodeId: n.id, title: n.title, position, direction: { shots: (n as unknown as { direction: SceneDirection }).direction.shots } }));
      const r = await directScenes(set, {
        narrativeVoice: doc.brief.narrativeVoice,
        presenterPronoun: pres.presenterPronoun,
        placement: { presenterPlacement: pres.presenterPlacement, presenterScale: pres.presenterScale },
        previousDirections,
        course: { title: doc.title, brief: { publico: doc.brief.audience, tom: doc.brief.tone, fundo_da_apresentacao: pres.background.type === 'color' ? (pres.background.name ?? `cor ${pres.background.value}`) : (pres.background.name ?? 'imagem') } },
        lesson: { id: found.lesson.id, title: found.lesson.title, description: found.lesson.description },
        scenes: targets,
        cameras: readyCameras,
        style: { pace: pres.directionStyle.pace, useSlides: pres.directionStyle.useSlides, slideAccent: pres.directionStyle.slideAccent, maxCinematicPerLesson: maxCinematic, cameraMode: pres.directionStyle.cameraMode, cardsPerMinute: pres.directionStyle.cardsPerMinute, gestures: pres.directionStyle.gestures },
        capabilities: videoCapabilitiesText({ cameraCount: readyCameras.length, avatarType: pres.avatarType, maxCinematicPerLesson: Math.max(0, maxCinematic - existingCinematicShots), voiceProvider: pres.voiceProvider, cameraMode: pres.directionStyle.cameraMode, zones: !!zoneCamerasOf(readyCameras) }),
        existingCinematicShots,
        instruction,
      }, { log });
      if (!r.scenes.length) throw new Error(`nenhuma cena com direção válida: ${r.errors.map((e) => `${e.nodeId}: ${e.message}`).join(' | ').slice(0, 1500)}`);
      const payload = { lessonId: found.lesson.id, scenes: r.scenes };
      const titles = new Map(targets.map((t) => [t.nodeId, t.title]));
      const rationale = r.scenes.map((s) => `${titles.get(s.nodeId) ?? s.nodeId}: ${s.direction.intent}`).join('\n').slice(0, 4000);
      const cinematicShots = r.scenes.reduce((a, s) => a + s.direction.shots.filter((x) => x.layout === 'cinematic').length, 0);
      const summary = { ...agent.proposalSummary('scene_direction', payload, doc), targets: targets.length, errors: r.errors, warnings: r.warnings, cinematicShots };
      if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; proposta descartada`);
      const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'scene_direction', lessonId: found.lesson.id, baseRevision: draft.revision, payload, rationale, summary });
      await finish(proposal.id, r.meta, { scenes: r.scenes.length, dropped: r.errors.length });
      log(`[agent] scene_direction ${found.lesson.id} ok (${r.meta.provider}/${r.meta.model}, ${r.meta.latencyMs} ms, reparos ${r.meta.repairs}, ${r.scenes.length}/${targets.length} cenas)`);
      return;
    }

    if (run.task === 'revise_lesson' || run.task === 'scene_variations' || run.task === 'evaluate_lesson') {
      if (agent.isPlaceholderGraph(found.lesson.graph)) throw new Error(`a aula "${found.lesson.title}" ainda não tem cenas; gere a aula antes de ${run.task === 'evaluate_lesson' ? 'avaliar' : 'revisar'}`);
    }

    if (run.task === 'evaluate_lesson') {
      const includeVideo = (run.input as { includeVideo?: unknown }).includeVideo !== false;
      const r = await evaluateLessonInWorker({ set, courseId: run.courseId, doc, lesson: found.lesson, draftRevision: draft.revision, includeVideo, log });
      // proposta informativa (kind evaluate_lesson, payload.kind quality_scorecard): nunca é aplicada; o cache por aula é lesson_quality
      const payload = { kind: 'quality_scorecard', lessonId: found.lesson.id, scorecard: r.scorecard };
      const summary = { ...agent.proposalSummary('evaluate_lesson', payload), skipped: r.skipped, textSimulated: r.text.meta.simulated };
      if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; avaliação descartada`);
      const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'evaluate_lesson', lessonId: found.lesson.id, baseRevision: draft.revision, payload, rationale: scorecardRationale(r.scorecard), summary });
      await agent.upsertLessonQuality(db, { courseId: run.courseId, lessonId: found.lesson.id, draftRevision: draft.revision, scorecard: r.scorecard, overall: r.scorecard.overall, runId, proposalId: proposal.id });
      const costs = [r.text.meta.costUsd, ...r.videos.map((v) => v.meta.costUsd)].filter((c): c is number => typeof c === 'number');
      const usage = [r.text.meta, ...r.videos.map((v) => v.meta)].reduce((a, m) => ({ inputTokens: a.inputTokens + m.usage.inputTokens, outputTokens: a.outputTokens + m.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
      await finishRun(runId, { status: 'succeeded', finishedAt: new Date(), provider: r.text.meta.provider, model: r.text.meta.model, instructionsVersion: EVALUATION_INSTRUCTIONS_VERSION, latencyMs: r.scorecard.meta?.latencyMs ?? 0, usage, costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null, fallbackUsed: false, repairs: 0, proposalId: proposal.id, output: { proposalId: proposal.id, overall: r.scorecard.overall, videos: r.videos.length, skipped: r.skipped.length } });
      log(`[agent] evaluate_lesson ${found.lesson.id} ok (${r.text.meta.provider}/${r.text.meta.model}, nota geral ${r.scorecard.overall}/5, ${r.videos.length} vídeos${r.skipped.length ? `, ${r.skipped.length} pulados` : ''})`);
      return;
    }

    if (run.task === 'revise_lesson') {
      const focusRaw = (run.input as { focus?: unknown }).focus;
      const focus = RevisionFocusSchema.safeParse(focusRaw);
      if (!instruction && !focus.success) throw new Error('a revisão precisa de um pedido (instruction) ou de um foco (focus)');
      const nodeIdsRaw = (run.input as { nodeIds?: unknown }).nodeIds;
      const reviseNodeIds = Array.isArray(nodeIdsRaw) ? nodeIdsRaw.filter((x): x is string => typeof x === 'string') : null;
      const r = await reviseLesson(set, { ...lessonArgs, graph: found.lesson.graph, focus: focus.success ? focus.data : undefined, nodeIds: reviseNodeIds }, { log });
      const scoped = (reviseNodeIds ?? []).filter((id) => found.lesson.graph.nodes.some((n) => n.id === id));
      const payload = { lessonId: found.lesson.id, graph: r.graph, hasErrors: r.issues.errors > 0, issues: r.issueList, ...(scoped.length ? { nodeIds: scoped } : {}) };
      const diff = agent.graphDiffSummary(found.lesson.graph, r.graph);
      const summary = { ...agent.proposalSummary('revise_lesson', payload), ...diff, focus: focus.success ? focus.data : null, errors: r.issues.errors, warnings: r.issues.warnings, conversionWarnings: r.conversionWarnings };
      if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; proposta descartada`);
      const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'revise_lesson', lessonId: found.lesson.id, baseRevision: draft.revision, payload, rationale: r.rationale, summary });
      await finish(proposal.id, r.meta, { errors: r.issues.errors, changed: diff.changed });
      log(`[agent] revise_lesson ${found.lesson.id} ok (${r.meta.provider}/${r.meta.model}, ${r.meta.latencyMs} ms, reparos ${r.meta.repairs}, cenas alteradas ${diff.changed}, erros restantes ${r.issues.errors})`);
      return;
    }

    if (run.task === 'scene_variations') {
      const nodeId = (run.input as { nodeId?: string | null }).nodeId;
      if (!nodeId) throw new Error('variações exigem o id da cena (nodeId)');
      const r = await proposeSceneVariations(set, { ...lessonArgs, graph: found.lesson.graph, sceneId: nodeId }, { log });
      const payload = { lessonId: found.lesson.id, nodeId: r.sceneId, variations: r.variations.map((v) => ({ label: v.label, graph: v.graph })) };
      const summary = { ...agent.proposalSummary('scene_variations', payload), warnings: Math.max(0, ...r.variations.map((v) => v.issues.warnings)), conversionWarnings: r.conversionWarnings };
      if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; proposta descartada`);
      const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'scene_variations', lessonId: found.lesson.id, baseRevision: draft.revision, payload, rationale: r.rationale, summary });
      await finish(proposal.id, r.meta, { variations: r.variations.length });
      log(`[agent] scene_variations ${found.lesson.id}/${r.sceneId} ok (${r.meta.provider}/${r.meta.model}, ${r.meta.latencyMs} ms, ${r.variations.length} variações)`);
      return;
    }

    // Só a geração de aula chega aqui; qualquer outra tarefa é erro explícito (nunca gerar uma aula por engano,
    // ex.: worker com código antigo recebendo uma tarefa nova).
    if (run.task !== 'lesson') throw new Error(`tarefa "${run.task}" não é reconhecida por este worker; atualize e reinicie o worker`);
    const r = await generateLesson(set, lessonArgs, { log });
    // hasErrors: a proposta ainda tem erros depois dos reparos; aplicar exige "aplicar mesmo assim" (acceptErrors)
    const payload = { lessonId: found.lesson.id, graph: r.graph, hasErrors: r.issues.errors > 0, issues: r.issueList };
    if (!(await stillRunning(runId))) return log(`[agent] run ${runId} cancelada durante a execução; proposta descartada`);
    const diff = agent.graphDiffSummary(found.lesson.graph, r.graph);
    const replaces = agent.isPlaceholderGraph(found.lesson.graph) ? 0 : found.lesson.graph.nodes.filter((n) => n.type !== 'end').length;
    const proposal = await agent.createProposal(db, { runId, courseId: run.courseId, kind: 'lesson', lessonId: found.lesson.id, baseRevision: draft.revision, payload, rationale: r.rationale, summary: { ...agent.proposalSummary('lesson', payload), ...diff, errors: r.issues.errors, warnings: r.issues.warnings, hasErrors: r.issues.errors > 0, replacesScenes: replaces, replacesMedia: found.lesson.graph.nodes.filter((n) => 'media' in n && !!n.media).length } });
    await finishRun(runId, { status: 'succeeded', finishedAt: new Date(), provider: r.meta.provider, model: r.meta.model, instructionsVersion: r.meta.instructionsVersion ?? INSTRUCTIONS_VERSION, latencyMs: r.meta.latencyMs, usage: r.meta.usage, costUsd: r.meta.costUsd ?? null, fallbackUsed: r.meta.fallbackUsed, repairs: r.meta.repairs, proposalId: proposal.id, output: { proposalId: proposal.id, errors: r.issues.errors } });
    log(`[agent] lesson ${found.lesson.id} ok (${r.meta.provider}/${r.meta.model}, ${r.meta.latencyMs} ms, reparos ${r.meta.repairs}, erros restantes ${r.issues.errors})`);
  } catch (e) {
    const msg = e instanceof LlmError ? `${e.provider}: ${e.message}` : String(e instanceof Error ? e.message : e);
    await finishRun(runId, { status: 'failed', finishedAt: new Date(), latencyMs: Date.now() - started, error: msg.slice(0, 2000) });
    console.error(`[agent] run ${runId} falhou: ${msg}`);
  }
}

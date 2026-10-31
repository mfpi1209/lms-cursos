import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allLessons, compileLesson, richTextFromPlain, richTextToPlain, type AnyNode, type CourseDocument, type LessonGraph } from '@lms/course-schema';
import { resetDatabase } from './setup';
import type { Database } from '../src';
import { createCourse, getDraft, saveDraft } from '../src/repositories/authoring';
import { applyProposal, applyProposalsBatch, createProposal, createRun, getProposal, latestOpenOutlineProposal, mergeScenesIntoGraph, openRunsByLesson, outlineApplyPlan, placeholderGraph, proposalSummary } from '../src/repositories/agent';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let userId: string;
let workspaceId: string;
/** grafo com cenas de verdade (copiado da primeira aula do curso semeado) */
let richGraph: LessonGraph;

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  userId = seeded.users['autor@demo.local']!;
  workspaceId = seeded.workspaceId;
  const seedDraft = (await getDraft(db, seeded.courseId))!;
  // objetivos do curso semeado não existem nos cursos de teste: só a estrutura interessa aqui
  const g = allLessons(seedDraft.document)[0]!.graph;
  richGraph = { ...g, nodes: g.nodes.map((n) => ({ ...n, objectiveIds: [] })) };
});
afterAll(async () => {
  await close();
});

const lessonSpec = (id: string, title: string, extra: Partial<{ keyScenes: string[]; rationale: string }> = {}) => ({ id, title, description: 'd', family: 'decision_consequence' as const, estimatedMinutes: 3, objectiveIds: ['obj_a'], rationale: extra.rationale ?? '', keyScenes: extra.keyScenes ?? [] });
const outlinePayload = (lessons: Array<ReturnType<typeof lessonSpec>>, removedLessonIds: string[] = []) => ({
  cast: [{ name: 'Carla', role: 'recrutadora', details: '' }],
  objectives: [{ id: 'obj_a', title: 'Fazer a', criterion: 'c', required: true }],
  modules: [{ id: 'mod_1', title: 'Módulo 1', description: '', lessons }],
  removedLessonIds,
});

async function newCourse(title: string) {
  const { id } = await createCourse(db, { workspaceId, title, createdBy: userId });
  return id;
}

async function outlineProposal(courseId: string, payload: ReturnType<typeof outlinePayload>) {
  const draft = (await getDraft(db, courseId))!;
  const run = await createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'x', input: {}, createdBy: userId });
  const p = await createProposal(db, { runId: run.id, courseId, kind: 'outline', baseRevision: draft.revision, payload, rationale: 'r', summary: proposalSummary('outline', payload, draft.document) });
  return { proposal: p, draft };
}

function withLessonGraph(doc: CourseDocument, lessonId: string, graph: LessonGraph): CourseDocument {
  return { ...doc, modules: doc.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, graph } : l)) })) };
}

describe('estrutura: plano por aula e perda de conteúdo', () => {
  it('aplica a primeira estrutura guardando keyScenes e rationale; o resumo traz o plano (todas novas)', async () => {
    const courseId = await newCourse('Estrutura 1');
    const payload = outlinePayload([lessonSpec('aula_a', 'A', { keyScenes: ['Convite', 'Decisão', 'Dica'], rationale: 'Decidir sob pressão.' }), lessonSpec('aula_b', 'B')]);
    const { proposal, draft } = await outlineProposal(courseId, payload);
    expect(proposal.summary).toMatchObject({ lessons: 2, added: 2, kept: 0, removed: 0, lost: 0, lostScenes: 0 });
    expect((proposal.summary as { plan: Array<{ status: string }> }).plan.map((p) => p.status)).toEqual(['new', 'new']);
    const r = await applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: draft.revision });
    expect(r).toMatchObject({ lost: 0, lostScenes: 0 });
    const d1 = (await getDraft(db, courseId))!;
    const a = allLessons(d1.document).find((l) => l.id === 'aula_a')!;
    expect(a.keyScenes).toEqual(['Convite', 'Decisão', 'Dica']);
    expect(a.rationale).toBe('Decidir sob pressão.');
    expect(d1.document.completion.requiredLessonIds).toEqual(['aula_a', 'aula_b']);
  });

  it('outlineApplyPlan marca mantém / renomeada / nova / removida / perde N cenas, com cenas e vídeos', async () => {
    const courseId = await newCourse('Plano');
    const first = outlinePayload([lessonSpec('aula_a', 'A'), lessonSpec('aula_b', 'B'), lessonSpec('aula_c', 'C')]);
    const { proposal, draft } = await outlineProposal(courseId, first);
    await applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: draft.revision });
    // aula_a ganha cenas (com um vídeo anexado); aula_b continua vazia
    const d1 = (await getDraft(db, courseId))!;
    const spokenId = richGraph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')!.id;
    const withMedia: LessonGraph = { ...richGraph, nodes: richGraph.nodes.map((n): AnyNode => (n.id === spokenId ? ({ ...n, media: { assetId: 'ast_x', kind: 'video', stale: false } } as AnyNode) : n)) };
    const edited = withLessonGraph(d1.document, 'aula_a', withMedia);
    const saved = await saveDraft(db, { courseId, document: edited, expectedRevision: d1.revision, userId });
    const d2 = (await getDraft(db, courseId))!;
    expect(saved.revision).toBe(d2.revision);
    const second = outlinePayload([lessonSpec('aula_b', 'B renomeada'), lessonSpec('aula_d', 'D')], ['aula_a', 'aula_c']);
    const plan = outlineApplyPlan(d2.document, second);
    const by = Object.fromEntries(plan.lessons.map((p) => [p.lessonId, p]));
    expect(by.aula_b).toMatchObject({ status: 'retitled', previousTitle: 'B', sceneCount: 0 });
    expect(by.aula_d).toMatchObject({ status: 'new', sceneCount: 0 });
    expect(by.aula_c).toMatchObject({ status: 'removed', sceneCount: 0 });
    expect(by.aula_a).toMatchObject({ status: 'contentLost', sceneCount: richGraph.nodes.filter((n) => n.type !== 'end').length, mediaCount: 1 });
    expect(plan.lost.map((l) => l.lessonId)).toEqual(['aula_a']);
    expect(plan).toMatchObject({ kept: 0, retitled: 1, added: 1, removed: 2, lostScenes: by.aula_a!.sceneCount });
    // uma aula mantida com cenas
    const third = outlinePayload([lessonSpec('aula_a', 'A'), lessonSpec('aula_b', 'B')], ['aula_c']);
    expect(outlineApplyPlan(d2.document, third).lessons.find((p) => p.lessonId === 'aula_a')).toMatchObject({ status: 'kept', sceneCount: by.aula_a!.sceneCount });
  });

  it('aplicar uma estrutura que remove uma aula com cenas exige confirmLoss (409 CONTENT_LOSS com a lista); confirmada, aplica e preserva a aula mantida', async () => {
    const courseId = await newCourse('Perda');
    const first = outlinePayload([lessonSpec('aula_a', 'A'), lessonSpec('aula_b', 'B')]);
    const p1 = await outlineProposal(courseId, first);
    await applyProposal(db, { proposalId: p1.proposal.id, userId, expectedRevision: p1.draft.revision });
    const d1 = (await getDraft(db, courseId))!;
    await saveDraft(db, { courseId, document: withLessonGraph(withLessonGraph(d1.document, 'aula_a', richGraph), 'aula_b', richGraph), expectedRevision: d1.revision, userId });
    const second = outlinePayload([lessonSpec('aula_a', 'A')], ['aula_b']);
    const p2 = await outlineProposal(courseId, second);
    expect(p2.proposal.summary).toMatchObject({ lost: 1, kept: 1 });
    await expect(applyProposal(db, { proposalId: p2.proposal.id, userId, expectedRevision: p2.draft.revision })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'CONTENT_LOSS', contentLoss: true, lost: [{ lessonId: 'aula_b', status: 'contentLost' }] },
    });
    // a proposta continua pendente (não virou conflito): o autor só precisa confirmar
    expect((await getProposal(db, p2.proposal.id))!.status).toBe('proposed');
    const r = await applyProposal(db, { proposalId: p2.proposal.id, userId, expectedRevision: p2.draft.revision, confirmLoss: true });
    expect(r).toMatchObject({ lost: 1 });
    const d2 = (await getDraft(db, courseId))!;
    expect(allLessons(d2.document).map((l) => l.id)).toEqual(['aula_a']);
    expect(allLessons(d2.document)[0]!.graph.nodes.length).toBe(richGraph.nodes.length);
    expect((await getProposal(db, p2.proposal.id))!.summary).toMatchObject({ lossConfirmed: true, lost: 1 });
    expect(await latestOpenOutlineProposal(db, courseId)).toBeNull();
  });

  it('em conflito de revisão, force aplica; se também houver perda, confirmLoss continua obrigatório', async () => {
    const courseId = await newCourse('Conflito+perda');
    const p1 = await outlineProposal(courseId, outlinePayload([lessonSpec('aula_a', 'A'), lessonSpec('aula_b', 'B')]));
    await applyProposal(db, { proposalId: p1.proposal.id, userId, expectedRevision: p1.draft.revision });
    const d1 = (await getDraft(db, courseId))!;
    await saveDraft(db, { courseId, document: withLessonGraph(d1.document, 'aula_b', richGraph), expectedRevision: d1.revision, userId });
    const p2 = await outlineProposal(courseId, outlinePayload([lessonSpec('aula_a', 'A')], ['aula_b']));
    expect(await latestOpenOutlineProposal(db, courseId)).toMatchObject({ id: p2.proposal.id });
    // autor edita a estrutura depois da proposta
    const d2 = (await getDraft(db, courseId))!;
    const edited = { ...d2.document, modules: d2.document.modules.map((m) => ({ ...m, title: 'Editado' })) };
    const s = await saveDraft(db, { courseId, document: edited, expectedRevision: d2.revision, userId });
    await expect(applyProposal(db, { proposalId: p2.proposal.id, userId, expectedRevision: s.revision })).rejects.toMatchObject({ code: 'CONFLICT', details: { conflict: true } });
    expect((await getProposal(db, p2.proposal.id))!.status).toBe('conflict');
    await expect(applyProposal(db, { proposalId: p2.proposal.id, userId, expectedRevision: s.revision, force: true })).rejects.toMatchObject({ details: { contentLoss: true } });
    const r = await applyProposal(db, { proposalId: p2.proposal.id, userId, expectedRevision: s.revision, force: true, confirmLoss: true });
    expect(r.revision).toBe(s.revision + 1);
  });
});

describe('aplicar só as cenas-alvo sobre a aula ATUAL (variações e revisão restrita)', () => {
  async function courseWithLesson() {
    const courseId = await newCourse('Alvo');
    const p = await outlineProposal(courseId, outlinePayload([lessonSpec('aula_a', 'A')]));
    await applyProposal(db, { proposalId: p.proposal.id, userId, expectedRevision: p.draft.revision });
    const d = (await getDraft(db, courseId))!;
    const s = await saveDraft(db, { courseId, document: withLessonGraph(d.document, 'aula_a', richGraph), expectedRevision: d.revision, userId });
    return { courseId, revision: s.revision };
  }
  const retitle = (g: LessonGraph, id: string, title: string): LessonGraph => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, title } : n)) });

  it('mergeScenesIntoGraph troca só o nó-alvo (e suas saídas), mantém mídia quando a fala não muda e desatualiza quando muda', () => {
    const choice = richGraph.nodes.find((n) => n.type === 'choice')!;
    const other = richGraph.nodes.find((n) => n.id !== choice.id && n.type !== 'end')!;
    const current = retitle(richGraph, other.id, 'Minha edição');
    const proposed = retitle(richGraph, choice.id, 'Decisão variada');
    const merged = mergeScenesIntoGraph(current, proposed, [choice.id]);
    expect(merged.nodes.find((n) => n.id === choice.id)!.title).toBe('Decisão variada');
    expect(merged.nodes.find((n) => n.id === other.id)!.title).toBe('Minha edição');
    expect(merged.edges.filter((e) => e.from === choice.id).length).toBe(richGraph.edges.filter((e) => e.from === choice.id).length);
    // mídia na cena-alvo: fala igual -> continua; fala diferente -> stale
    const spoken = richGraph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')!;
    const withMedia: LessonGraph = { ...current, nodes: current.nodes.map((n): AnyNode => (n.id === spoken.id ? ({ ...n, media: { assetId: 'ast_1', kind: 'video', stale: false } } as AnyNode) : n)) };
    const same = mergeScenesIntoGraph(withMedia, retitle(richGraph, spoken.id, 'Só o título'), [spoken.id]);
    expect((same.nodes.find((n) => n.id === spoken.id) as { media?: { stale?: boolean } }).media).toMatchObject({ assetId: 'ast_1', stale: false });
    const changed: LessonGraph = { ...richGraph, nodes: richGraph.nodes.map((n): AnyNode => (n.id === spoken.id ? ({ ...n, body: richTextFromPlain('Texto totalmente novo da cena.'), narration: 'Fala nova.' } as AnyNode) : n)) };
    const stale = mergeScenesIntoGraph(withMedia, changed, [spoken.id]);
    expect((stale.nodes.find((n) => n.id === spoken.id) as { media?: { stale?: boolean } }).media).toMatchObject({ assetId: 'ast_1', stale: true });
  });

  it('variação aplicada com force (aula editada depois) mantém as edições nas outras cenas', async () => {
    const { courseId, revision } = await courseWithLesson();
    const choice = richGraph.nodes.find((n) => n.type === 'choice')!;
    const other = richGraph.nodes.find((n) => n.id !== choice.id && n.type !== 'end')!;
    const run = await createRun(db, { workspaceId, courseId, task: 'scene_variations', lessonId: 'aula_a', provider: 'fake', model: 'fake', instructionsVersion: 'x', input: {}, createdBy: userId });
    const payload = { lessonId: 'aula_a', nodeId: choice.id, variations: [{ label: 'v1', graph: retitle(richGraph, choice.id, 'Variação 1') }, { label: 'v2', graph: retitle(richGraph, choice.id, 'Variação 2') }] };
    const p = await createProposal(db, { runId: run.id, courseId, kind: 'scene_variations', lessonId: 'aula_a', baseRevision: revision, payload, rationale: 'r', summary: proposalSummary('scene_variations', payload) });
    // autor edita OUTRA cena depois da proposta
    const d = (await getDraft(db, courseId))!;
    const s = await saveDraft(db, { courseId, document: withLessonGraph(d.document, 'aula_a', retitle(richGraph, other.id, 'Editada por mim')), expectedRevision: d.revision, userId });
    await expect(applyProposal(db, { proposalId: p.id, userId, expectedRevision: s.revision, choice: 1 })).rejects.toMatchObject({ code: 'CONFLICT', details: { conflict: true, scoped: true, scopedNodeIds: [choice.id] } });
    const r = await applyProposal(db, { proposalId: p.id, userId, expectedRevision: s.revision, choice: 1, force: true });
    expect(r).toMatchObject({ compiled: { errors: 0 } });
    const after = allLessons((await getDraft(db, courseId))!.document)[0]!.graph;
    expect(after.nodes.find((n) => n.id === choice.id)!.title).toBe('Variação 2');
    expect(after.nodes.find((n) => n.id === other.id)!.title).toBe('Editada por mim');
    expect(compileLesson(after, {}).errors).toEqual([]);
    expect((await getProposal(db, p.id))!.summary).toMatchObject({ choice: 1, scopedNodeIds: [choice.id], compiled: { errors: 0 } });
  });

  it('revisão restrita (nodeIds) entra só nas cenas-alvo; proposta com erros exige acceptErrors; o resumo guarda a recompilação', async () => {
    const { courseId, revision } = await courseWithLesson();
    const [a, b] = richGraph.nodes.filter((n) => n.type !== 'end');
    const run = await createRun(db, { workspaceId, courseId, task: 'revise_lesson', lessonId: 'aula_a', provider: 'fake', model: 'fake', instructionsVersion: 'x', input: { nodeIds: [a!.id] }, createdBy: userId });
    const proposedGraph = retitle(retitle(richGraph, a!.id, 'Alvo revisado'), b!.id, 'Fora do alvo (não deve entrar)');
    const payload = { lessonId: 'aula_a', graph: proposedGraph, nodeIds: [a!.id], hasErrors: false, issues: { errors: [], warnings: [] } };
    const p = await createProposal(db, { runId: run.id, courseId, kind: 'revise_lesson', lessonId: 'aula_a', baseRevision: revision, payload, rationale: 'r', summary: proposalSummary('revise_lesson', payload) });
    const r = await applyProposal(db, { proposalId: p.id, userId, expectedRevision: revision });
    expect(r).toMatchObject({ compiled: { errors: 0 } });
    const after = allLessons((await getDraft(db, courseId))!.document)[0]!.graph;
    expect(after.nodes.find((n) => n.id === a!.id)!.title).toBe('Alvo revisado');
    expect(after.nodes.find((n) => n.id === b!.id)!.title).toBe(b!.title);

    // proposta de aula com erros: bloqueada sem acceptErrors
    const broken: LessonGraph = { ...richGraph, edges: richGraph.edges.slice(1) };
    const run2 = await createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'aula_a', provider: 'fake', model: 'fake', instructionsVersion: 'x', input: {}, createdBy: userId });
    const payload2 = { lessonId: 'aula_a', graph: broken, hasErrors: true, issues: { errors: [{ code: 'DEAD_END', message: 'cena sem saída' }], warnings: [] } };
    const d2 = (await getDraft(db, courseId))!;
    const p2 = await createProposal(db, { runId: run2.id, courseId, kind: 'lesson', lessonId: 'aula_a', baseRevision: d2.revision, payload: payload2, rationale: 'r', summary: { ...proposalSummary('lesson', payload2), hasErrors: true } });
    await expect(applyProposal(db, { proposalId: p2.id, userId, expectedRevision: d2.revision })).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'PROPOSAL_HAS_ERRORS', hasErrors: true, errors: [{ code: 'DEAD_END' }] } });
    await expect(applyProposalsBatch(db, { proposalIds: [p2.id], userId, expectedRevision: d2.revision })).rejects.toMatchObject({ details: { hasErrors: true } });
    const r2 = await applyProposal(db, { proposalId: p2.id, userId, expectedRevision: d2.revision, acceptErrors: true });
    expect((r2 as { compiled?: { errors: number } }).compiled!.errors).toBeGreaterThan(0);
    expect((await getProposal(db, p2.id))!.summary).toMatchObject({ errorsAccepted: true });
  });

  it('openRunsByLesson lista a execução aberta de cada aula (o lote pula as ocupadas); placeholderGraph é reconhecido no plano', async () => {
    const courseId = await newCourse('Ocupadas');
    const p = await outlineProposal(courseId, outlinePayload([lessonSpec('aula_a', 'A'), lessonSpec('aula_b', 'B')]));
    await applyProposal(db, { proposalId: p.proposal.id, userId, expectedRevision: p.draft.revision });
    const run = await createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'aula_a', provider: 'fake', model: 'fake', instructionsVersion: 'x', input: {}, createdBy: userId });
    const open = await openRunsByLesson(db, courseId);
    expect([...open.keys()]).toEqual(['aula_a']);
    expect(open.get('aula_a')!.id).toBe(run.id);
    const doc = (await getDraft(db, courseId))!.document;
    expect(outlineApplyPlan(doc, outlinePayload([lessonSpec('aula_b', 'B')], ['aula_a'])).lessons.find((x) => x.lessonId === 'aula_a')).toMatchObject({ status: 'removed', sceneCount: 0 });
    expect(richTextToPlain((placeholderGraph('x').nodes[0] as unknown as { body: Parameters<typeof richTextToPlain>[0] }).body)).toMatch(/ainda não tem cenas/);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { richTextToPlain, SceneDirectionSchema, type AnyNode, type CourseDocument, type SceneDirection } from '@lms/course-schema';
import { resetDatabase } from './setup';
import type { Database } from '../src';
import { getDraft, saveDraft } from '../src/repositories/authoring';
import { applyDirectionToDocument, applyProposal, authoredDirectionTargets, createProposal, createRun, proposalSummary } from '../src/repositories/agent';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
});
afterAll(async () => {
  await close();
});

const VIDEO = ['scenario', 'content', 'choice', 'consequence'];
function spoken(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

/** Duas cenas com vídeo da primeira aula (fala ou texto da tela não vazio). */
function pick(doc: CourseDocument) {
  const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.graph.nodes.filter((n) => VIDEO.includes(n.type) && spoken(n)).length >= 2)!;
  const [a, b] = lesson.graph.nodes.filter((n) => VIDEO.includes(n.type) && spoken(n));
  return { lesson, a: a!, b: b! };
}

const dir = (line: string, source: 'ai' | 'author' = 'ai', framing: 'medium' | 'close' = 'close'): SceneDirection => SceneDirectionSchema.parse({ source, shots: [{ id: 's1', line, framing }] });

function withDirection(doc: CourseDocument, lessonId: string, nodeId: string, direction: SceneDirection): CourseDocument {
  return { ...doc, modules: doc.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => (l.id !== lessonId ? l : { ...l, graph: { ...l.graph, nodes: l.graph.nodes.map((n) => (n.id === nodeId ? ({ ...n, direction } as AnyNode) : n)) } })) })) };
}

describe('aplicar direção (scene_direction)', () => {
  it('confere as falas contra o texto falado atual, mesmo forçado, e preserva direções do autor', () => {
    const doc = getDraftSync();
    const { lesson, a, b } = pick(doc);
    // b tem direção ajustada pelo autor
    const authored = dir(spoken(b), 'author', 'medium');
    const base = withDirection(doc, lesson.id, b.id, authored);
    const payload = { lessonId: lesson.id, scenes: [{ nodeId: a.id, direction: dir(`${spoken(a)} palavra a mais`) }, { nodeId: b.id, direction: dir(spoken(b)) }] };
    const r = applyDirectionToDocument(base, payload);
    expect(r.applied).toBe(0);
    expect(r.skippedMismatch).toEqual([a.id]);
    expect(r.skippedAuthored).toEqual([b.id]);
    // pontuação e caixa não contam; com overwriteAuthored a do autor é sobrescrita
    const ok = { lessonId: lesson.id, scenes: [{ nodeId: a.id, direction: dir(spoken(a).toUpperCase().replace(/[.,!?]/g, '')) }, { nodeId: b.id, direction: dir(spoken(b)) }] };
    const r2 = applyDirectionToDocument(base, ok, { overwriteAuthored: true });
    expect(r2.applied).toBe(2);
    expect(r2.skippedAuthored).toEqual([]);
    expect(authoredDirectionTargets(base, ok)).toEqual([b.id]);
    expect(proposalSummary('scene_direction', ok, base)).toMatchObject({ scenes: 2, authoredTargets: [b.id] });
    expect(proposalSummary('scene_direction', ok)).toMatchObject({ authoredTargets: [] });
  });

  it('banco real: pula cenas do autor (skippedAuthored) e só sobrescreve com overwriteAuthored', async () => {
    const userId = Object.values(seeded.users)[0]!;
    const draft = (await getDraft(db, seeded.courseId))!;
    const { lesson, a, b } = pick(draft.document);
    const saved = await saveDraft(db, { courseId: seeded.courseId, document: withDirection(draft.document, lesson.id, b.id, dir(spoken(b), 'author', 'medium')), expectedRevision: draft.revision, userId, origin: 'author', note: 'teste' });
    const mk = async () => {
      const run = await createRun(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, task: 'scene_direction', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'test', input: {}, createdBy: userId });
      const payload = { lessonId: lesson.id, scenes: [{ nodeId: a.id, direction: dir(spoken(a)) }, { nodeId: b.id, direction: dir(spoken(b)) }] };
      return createProposal(db, { runId: run.id, courseId: seeded.courseId, kind: 'scene_direction', lessonId: lesson.id, baseRevision: saved.revision, payload, rationale: '', summary: {} });
    };
    const p1 = await mk();
    const r1 = await applyProposal(db, { proposalId: p1.id, userId, expectedRevision: saved.revision });
    expect(r1).toMatchObject({ skippedAuthored: [b.id], skippedMismatch: [] });
    const after1 = (await getDraft(db, seeded.courseId))!;
    const nodeB = pick(after1.document).b as AnyNode & { direction?: SceneDirection };
    expect(nodeB.direction?.source).toBe('author');
    expect((pick(after1.document).a as AnyNode & { direction?: SceneDirection }).direction?.source).toBe('ai');

    // só a cena do autor sobrando: conflito explícito, depois sobrescrita
    const run = await createRun(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, task: 'scene_direction', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'test', input: {}, createdBy: userId });
    const p2 = await createProposal(db, { runId: run.id, courseId: seeded.courseId, kind: 'scene_direction', lessonId: lesson.id, baseRevision: after1.revision, payload: { lessonId: lesson.id, scenes: [{ nodeId: b.id, direction: dir(spoken(b)) }] }, rationale: '', summary: {} });
    await expect(applyProposal(db, { proposalId: p2.id, userId, expectedRevision: after1.revision })).rejects.toMatchObject({ code: 'CONFLICT', details: { authoredConflict: true, skippedAuthored: [b.id] } });
    const r2 = await applyProposal(db, { proposalId: p2.id, userId, expectedRevision: after1.revision, overwriteAuthored: true });
    expect(r2).toMatchObject({ skippedAuthored: [] });
    const after2 = (await getDraft(db, seeded.courseId))!;
    expect((pick(after2.document).b as AnyNode & { direction?: SceneDirection }).direction?.source).toBe('ai');
  });
});

let cachedDoc: CourseDocument | null = null;
function getDraftSync(): CourseDocument {
  if (!cachedDoc) throw new Error('draft not loaded');
  return cachedDoc;
}
beforeAll(async () => {
  cachedDoc = (await getDraft(db, seeded.courseId))!.document;
});

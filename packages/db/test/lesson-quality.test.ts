import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './setup';
import type { Database } from '../src';
import { getDraft } from '../src/repositories/authoring';
import { LESSON_TASKS, QUALITY_NOT_APPLICABLE_MESSAGE, applyProposal, courseQuality, createProposal, createRun, getLessonQuality, listLessonQuality, proposalSummary, upsertLessonQuality } from '../src/repositories/agent';
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

const scorecard = (lessonId: string, revision: number, overall: number) => ({
  lessonId, revision, overall, summary: 'resumo', findings: [{ dimension: 'voz_narrativa', severity: 'alta', scene: 'cons_aceita', evidence: '"Renata responde"', problem: 'Narra a gestora.', fix: 'Fale com você.' }],
  evaluatedAt: new Date().toISOString(),
  scores: { conteudo: overall, voz_narrativa: overall, perguntas: overall, decisoes: overall, realismo: overall, fala: overall, postura: null, aparencia: null, fundo: null, voz: null, realismo_visual: null },
  basis: { text: true, video: [], framesPerVideo: 0, skippedVideo: [], simulated: true },
});

describe('lesson_quality (cartão de qualidade por aula)', () => {
  it('upsert substitui o cartão da aula; get/list/courseQuality com stale pela revisão do rascunho', async () => {
    const courseId = seeded.courseId;
    const draft = (await getDraft(db, courseId))!;
    const lessons = draft.document.modules.flatMap((m) => m.lessons);
    const [l1, l2] = lessons as [typeof lessons[number], typeof lessons[number]];
    const a = await upsertLessonQuality(db, { courseId, lessonId: l1.id, draftRevision: draft.revision - 1, scorecard: scorecard(l1.id, draft.revision - 1, 2), overall: 2 });
    expect(a.lessonId).toBe(l1.id);
    const b = await upsertLessonQuality(db, { courseId, lessonId: l1.id, draftRevision: draft.revision, scorecard: scorecard(l1.id, draft.revision, 4), overall: 4 });
    expect(b.id).toBe(a.id); // mesma linha, substituída
    expect((await getLessonQuality(db, courseId, l1.id))!.overall).toBe(4);
    expect(await getLessonQuality(db, courseId, 'nao_existe')).toBeNull();
    await upsertLessonQuality(db, { courseId, lessonId: l2.id, draftRevision: draft.revision - 2, scorecard: scorecard(l2.id, draft.revision - 2, 3), overall: 3 });
    expect(await listLessonQuality(db, courseId)).toHaveLength(2);
    const q = await courseQuality(db, courseId, draft.document, draft.revision);
    expect(q.map((x) => x.lessonId)).toEqual(lessons.map((l) => l.id));
    expect(q[0]).toMatchObject({ lessonId: l1.id, stale: false, draftRevision: draft.revision });
    expect((q[0]!.scorecard as { overall: number }).overall).toBe(4);
    expect(q[1]).toMatchObject({ lessonId: l2.id, stale: true });
    expect(q.slice(2).every((x) => x.scorecard === null && x.stale === false)).toBe(true);
  });

  it('proposta evaluate_lesson: resumo com as notas e aplicação recusada com mensagem clara', async () => {
    const courseId = seeded.courseId;
    const draft = (await getDraft(db, courseId))!;
    const lessonId = draft.document.modules[0]!.lessons[0]!.id;
    expect(LESSON_TASKS).toContain('evaluate_lesson');
    const run = await createRun(db, { workspaceId: seeded.workspaceId, courseId, task: 'evaluate_lesson', lessonId, provider: 'fake', model: 'fake', instructionsVersion: 'x', input: { includeVideo: true }, createdBy: seeded.users['autor@demo.local']! });
    const payload = { kind: 'quality_scorecard', lessonId, scorecard: scorecard(lessonId, draft.revision, 3) };
    const summary = proposalSummary('evaluate_lesson', payload);
    expect(summary).toMatchObject({ overall: 3, findings: 1, videos: 0, simulated: true });
    const proposal = await createProposal(db, { runId: run.id, courseId, kind: 'evaluate_lesson', lessonId, baseRevision: draft.revision, payload, rationale: 'r', summary });
    await expect(applyProposal(db, { proposalId: proposal.id, userId: seeded.users['autor@demo.local']!, expectedRevision: draft.revision })).rejects.toMatchObject({ code: 'VALIDATION', message: QUALITY_NOT_APPLICABLE_MESSAGE, details: { kind: 'quality_scorecard' } });
    // o rascunho não mudou
    expect((await getDraft(db, courseId))!.revision).toBe(draft.revision);
  });
});

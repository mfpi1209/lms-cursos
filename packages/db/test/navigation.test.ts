import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { resetDatabase } from './setup';
import { DomainError, schema as s, type Database } from '../src';
import { applyLearnerEvent, navigateAttempt, startOrResumeAttempt } from '../src/repositories/learning';
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

describe('voltar cena no LMS (banco real)', () => {
  it('volta, troca a resposta e mantém o histórico de eventos (só inclusão)', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    const r1 = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: 'nav-1', nodeId: 'decisao_prazo', expectedRevision: attempt.revision, intent: { kind: 'choose', optionId: 'negocia' } });
    expect(r1.state.variables.confianca).toBe(1);

    const back = await navigateAttempt(db, { attemptId: attempt.id, eventId: 'nav-2', nodeId: 'cons_negocia', expectedRevision: r1.revision, target: { kind: 'back' } });
    expect(back.replayed).toBe(false);
    expect(back.toNodeId).toBe('decisao_prazo');
    expect(back.state.variables.confianca).toBe(0);
    expect(back.state.answers.decisao_prazo).toBeUndefined();
    expect(back.revision).toBe(r1.revision + 1);

    // mesmo eventId: mesmo resultado, sem voltar duas vezes
    const again = await navigateAttempt(db, { attemptId: attempt.id, eventId: 'nav-2', nodeId: 'cons_negocia', expectedRevision: r1.revision, target: { kind: 'back' } });
    expect(again.replayed).toBe(true);
    expect(again.revision).toBe(back.revision);

    const r2 = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: 'nav-3', nodeId: 'decisao_prazo', expectedRevision: back.revision, intent: { kind: 'choose', optionId: 'aceita' } });
    expect(r2.toNodeId).toBe('cons_aceita');
    expect(r2.state.variables.confianca).toBe(-1);

    const events = await db.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, attempt.id)).orderBy(asc(s.learnerEvents.resultingRevision));
    expect(events.map((e) => e.type)).toEqual(['choose', 'navigated_back', 'choose']);
    expect(events[1]!.payload).toMatchObject({ fromNodeId: 'cons_negocia', toNodeId: 'decisao_prazo', undone: 1 });
    // a evidência da primeira escolha continua registrada
    const evidence = await db.select().from(s.objectiveEvidence).where(eq(s.objectiveEvidence.attemptId, attempt.id));
    expect(evidence).toHaveLength(2);
    const [row] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, attempt.id));
    expect(row!.state.path.map((p) => p.nodeId)).toEqual(['decisao_prazo', 'cons_aceita']);
  });

  it('revisão desatualizada ou cena trocada → CONFLICT; primeira cena → erro do motor', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_corrigir_informacao' });
    await expect(navigateAttempt(db, { attemptId: attempt.id, eventId: 'nav-4', nodeId: attempt.state.currentNodeId, expectedRevision: attempt.revision + 5, target: { kind: 'back' } })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(navigateAttempt(db, { attemptId: attempt.id, eventId: 'nav-5', nodeId: 'outra_cena', expectedRevision: attempt.revision, target: { kind: 'back' } })).rejects.toMatchObject({ code: 'CONFLICT' });
    const err = await navigateAttempt(db, { attemptId: attempt.id, eventId: 'nav-6', nodeId: attempt.state.currentNodeId, expectedRevision: attempt.revision, target: { kind: 'back' } }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('ENGINE');
    expect(err.details).toMatchObject({ engineCode: 'NO_PREVIOUS_SCENE' });
  });
});

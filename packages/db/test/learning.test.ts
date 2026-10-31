import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { resetDatabase } from './setup';
import { DomainError, schema as s, type Database } from '../src';
import { applyLearnerEvent, enrollStudent, getEnrollmentReport, startOrResumeAttempt } from '../src/repositories/learning';
import { saveDraft, getDraft } from '../src/repositories/authoring';
import { publishCourse, getVersion } from '../src/repositories/publishing';
import type { SeedResult } from '../src/seed/seed';
import type { Intent } from '@lms/course-engine';

type Step = { nodeId: string; intent: Intent };

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
});
afterAll(async () => {
  await close();
});

describe('tentativas e eventos (banco real)', () => {
  it('inicia e retoma a mesma tentativa', async () => {
    const a = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    const b = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.attempt.id).toBe(a.attempt.id);
    expect(b.attempt.state.currentNodeId).toBe('decisao_prazo');
  });

  it('inícios concorrentes da mesma aula não criam tentativas duplicadas', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_corrigir_informacao' })),
    );
    expect(new Set(results.map((r) => r.attempt.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it('mesmo eventId devolve o mesmo resultado sem duplicar efeitos', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    const input = { attemptId: attempt.id, eventId: 'evt-1', nodeId: 'decisao_prazo', expectedRevision: attempt.revision, intent: { kind: 'choose', optionId: 'negocia' } as const };
    const r1 = await applyLearnerEvent(db, input);
    const r2 = await applyLearnerEvent(db, input);
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.toNodeId).toBe(r1.toNodeId);
    expect(r2.revision).toBe(r1.revision);
    const events = await db.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, attempt.id));
    expect(events).toHaveLength(1);
    const evidence = await db.select().from(s.objectiveEvidence).where(eq(s.objectiveEvidence.attemptId, attempt.id));
    expect(evidence).toHaveLength(1);
    const [row] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, attempt.id));
    expect(row!.revision).toBe(2);
    expect(row!.state.variables.confianca).toBe(1);
  });

  it('duas abas com a mesma revisão: só uma aplica, a outra recebe CONFLICT', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    expect(attempt.state.currentNodeId).toBe('cons_negocia');
    const mk = (eventId: string) => applyLearnerEvent(db, { attemptId: attempt.id, eventId, nodeId: 'cons_negocia', expectedRevision: attempt.revision, intent: { kind: 'advance' } });
    const results = await Promise.allSettled([mk('tab-a'), mk('tab-b')]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toBeInstanceOf(DomainError);
    expect((failed[0]!.reason as DomainError).code).toBe('CONFLICT');
    const [row] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, attempt.id));
    expect(row!.revision).toBe(3);
    expect(row!.state.path.filter((p) => p.nodeId === 'conteudo_negociar')).toHaveLength(1);
  });

  it('rejeita resposta para um nó que não é o atual', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    await expect(
      applyLearnerEvent(db, { attemptId: attempt.id, eventId: 'evt-wrong-node', nodeId: 'decisao_prazo', expectedRevision: attempt.revision, intent: { kind: 'choose', optionId: 'aceita' } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('percorre até o fim, conclui a aula e gera relatório por objetivo', async () => {
    let { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    const steps: Step[] = [
      { nodeId: 'conteudo_negociar', intent: { kind: 'advance' } },
      { nodeId: 'decisao_urgencia', intent: { kind: 'choose', optionId: 'manda_gestora' } },
      { nodeId: 'cons_manda_gestora', intent: { kind: 'advance' } },
      { nodeId: 'reflexao_prazo', intent: { kind: 'reflect', text: 'Eu avisaria cedo, mostraria o que falta e proporia uma entrega parcial.' } },
      { nodeId: 'avaliacao_prazo', intent: { kind: 'assess', optionIds: ['b'] } },
    ];
    let revision = attempt.revision;
    let last;
    for (const [i, st] of steps.entries()) {
      last = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `walk-${i}`, nodeId: st.nodeId, expectedRevision: revision, intent: st.intent });
      revision = last.revision;
    }
    expect(last!.lessonCompleted).toBe(true);
    expect(last!.courseCompleted).toBe(false);
    expect(last!.progress.percent).toBe(100);
    const report = await getEnrollmentReport(db, seeded.enrollmentId);
    const l1 = report.lessons.find((l) => l.lessonId === 'aula_negociar_prazo')!;
    expect(l1.attempts[0]!.status).toBe('completed');
    expect(l1.attempts[0]!.path.map((p) => p.nodeId)).toEqual([
      'decisao_prazo', 'cons_negocia', 'conteudo_negociar', 'decisao_urgencia', 'cons_manda_gestora', 'reflexao_prazo', 'avaliacao_prazo', 'fim_prazo',
    ]);
    const obj = Object.fromEntries(report.objectives.map((o) => [o.objectiveId, o.status]));
    expect(obj.obj_negociar_prazo).toBe('demonstrated');
    expect(obj.obj_comunicar_limites).toBe('attempted');
    expect(obj.obj_corrigir_erro).toBe('not_reached');
    const outbox = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.type, 'lesson.completed'));
    expect(outbox).toHaveLength(1);
  });

  it('não aceita eventos em tentativa concluída e permite nova tentativa explícita', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo' });
    expect(attempt.status).toBe('completed');
    await expect(applyLearnerEvent(db, { attemptId: attempt.id, eventId: 'after-end', nodeId: 'fim_prazo', expectedRevision: attempt.revision, intent: { kind: 'advance' } })).rejects.toMatchObject({ code: 'ENGINE' });
    const again = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_negociar_prazo', forceNew: true });
    expect(again.created).toBe(true);
    expect(again.attempt.attemptNumber).toBe(2);
  });

  it('concluir a segunda aula conclui o curso', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: 'aula_corrigir_informacao' });
    const steps: Step[] = [
      { nodeId: 'exemplo_mensagem', intent: { kind: 'advance' } },
      { nodeId: 'analise_problema', intent: { kind: 'choose', optionId: 'so_tom' } },
      { nodeId: 'cons_so_tom', intent: { kind: 'advance' } },
      { nodeId: 'situacao_voce', intent: { kind: 'advance' } },
      { nodeId: 'decisao_correcao', intent: { kind: 'choose', optionId: 'corrige_claro' } },
      { nodeId: 'cons_corrige_claro', intent: { kind: 'advance' } },
      { nodeId: 'avaliacao_correcao', intent: { kind: 'assess', optionIds: ['o_que', 'alternativa', 'desculpas'] } },
      { nodeId: 'reflexao_mensagem', intent: { kind: 'reflect', text: 'Olá, Marcos. Preciso corrigir uma informação: a entrega dos pisos não será sexta, e sim terça. Peço desculpas pelo transtorno. Posso enviar metade do material sexta ou ajudar a remarcar o pedreiro.' } },
    ];
    let revision = attempt.revision;
    let last;
    for (const [i, st] of steps.entries()) {
      last = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `l2-${i}`, nodeId: st.nodeId, expectedRevision: revision, intent: st.intent });
      revision = last.revision;
    }
    expect(last!.lessonCompleted).toBe(true);
    expect(last!.courseCompleted).toBe(true);
    const [enr] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, seeded.enrollmentId));
    expect(enr!.status).toBe('completed');
  });
});

describe('rascunho, publicação e versão fixada', () => {
  it('gravação com revisão desatualizada é rejeitada', async () => {
    const draft = (await getDraft(db, seeded.courseId))!;
    await saveDraft(db, { courseId: seeded.courseId, document: { ...draft.document, description: 'v2' }, expectedRevision: draft.revision, userId: seeded.users['autor@demo.local']! });
    await expect(
      saveDraft(db, { courseId: seeded.courseId, document: { ...draft.document, description: 'v3' }, expectedRevision: draft.revision, userId: seeded.users['autor@demo.local']! }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('editar e republicar não altera a versão da matrícula existente', async () => {
    const draft = (await getDraft(db, seeded.courseId))!;
    const doc = structuredClone(draft.document);
    doc.title = 'Comunicação no primeiro emprego (2ª edição)';
    await saveDraft(db, { courseId: seeded.courseId, document: doc, expectedRevision: draft.revision, userId: seeded.users['autor@demo.local']! });
    const pub = await publishCourse(db, { courseId: seeded.courseId, userId: seeded.users['autor@demo.local']! });
    expect(pub.versionNumber).toBe(2);
    const [enr] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, seeded.enrollmentId));
    expect(enr!.courseVersionId).toBe(seeded.versionId);
    const pinned = await getVersion(db, seeded.versionId);
    expect(pinned!.document.title).toBe('Comunicação no primeiro emprego');
    // nova matrícula pega a versão 2
    const { enrollment } = await enrollStudent(db, { courseId: seeded.courseId, userId: seeded.users['aluna@demo.local']!, createdBy: seeded.users['admin@demo.local']! });
    expect(enrollment.courseVersionId).toBe(pub.versionId);
  });

  it('destino inexistente bloqueia a publicação com mensagem útil', async () => {
    const draft = (await getDraft(db, seeded.courseId))!;
    const doc = structuredClone(draft.document);
    doc.modules[0]!.lessons[0]!.graph.edges[0]!.to = 'nao_existe';
    await saveDraft(db, { courseId: seeded.courseId, document: doc, expectedRevision: draft.revision, userId: seeded.users['autor@demo.local']! });
    const err = await publishCourse(db, { courseId: seeded.courseId, userId: seeded.users['autor@demo.local']! }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('PUBLISH_BLOCKED');
    expect(JSON.stringify(err.details)).toMatch(/nao_existe/);
    const versions = await db.select().from(s.courseVersions).where(and(eq(s.courseVersions.courseId, seeded.courseId), eq(s.courseVersions.versionNumber, 3)));
    expect(versions).toHaveLength(0);
  });
});

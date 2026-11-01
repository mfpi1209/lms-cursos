import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { TRAIL_CHECKS, TRAIL_FINAL_CHECK_MINUTES, allLessons } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { schema as s, type Database } from '../src';
import { startOrResumeAttempt, getEnrollmentWithVersion } from '../src/repositories/learning';
import { badgeWorkloadMinutes, getBadgeByCode, submitTrailCheck, trailStatus, trailWorkloadMinutes } from '../src/repositories/recognition';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
const TRAIL = 'Convivência';
const check = TRAIL_CHECKS['convivencia']!;
const right = Object.fromEntries(check.situations.map((x) => [x.id, x.options.find((o) => o.correct)!.id]));
const wrong = Object.fromEntries(check.situations.map((x) => [x.id, x.options.find((o) => !o.correct)!.id]));

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  await db.update(s.courses).set({ trail: TRAIL }).where(eq(s.courses.id, seeded.courseId));
});
afterAll(async () => {
  await close();
});

const base = () => ({ workspaceId: seeded.workspaceId, userId: seeded.users['aluno@demo.local']!, holderName: 'Aluna Teste', trail: TRAIL });

describe('selo por trilha (banco real)', () => {
  it('falta curso: aprovar na checagem não emite o selo', async () => {
    const r = await submitTrailCheck(db, { ...base(), answers: right });
    expect(r.result.passed).toBe(true);
    expect(r.badge).toBeNull();
    expect(r.status.eligibility.coursesMissing.map((c) => c.courseId)).toEqual([seeded.courseId]);
  });

  it('falta atividade: curso concluído sem as atividades salvas não emite', async () => {
    await db.update(s.enrollments).set({ status: 'completed', completedAt: new Date() }).where(eq(s.enrollments.id, seeded.enrollmentId));
    const enr = (await getEnrollmentWithVersion(db, seeded.enrollmentId))!;
    const activities = allLessons(enr.document).flatMap((l) => l.graph.nodes.filter((n) => n.type === 'reflection').map((n) => ({ lessonId: l.id, nodeId: n.id })));
    const st = await trailStatus(db, base());
    if (activities.length === 0) {
      // curso de exemplo sem atividade: nada a cobrar
      expect(st.eligibility.activitiesMissing).toEqual([]);
      return;
    }
    expect(st.eligibility.activitiesMissing).toHaveLength(1);
    expect(st.badge).toBeNull();
    // salva as atividades (resposta com texto, como o Meu roteiro)
    for (const a of activities) {
      const { attempt } = await startOrResumeAttempt(db, { enrollmentId: seeded.enrollmentId, lessonId: a.lessonId });
      const state = { ...attempt.state, answers: { ...(attempt.state.answers ?? {}), [a.nodeId]: { text: 'Minha resposta.', answeredAt: new Date().toISOString() } } };
      await db.update(s.lessonAttempts).set({ state: state as never }).where(eq(s.lessonAttempts.id, attempt.id));
    }
    expect((await trailStatus(db, base())).eligibility.activitiesMissing).toEqual([]);
  });

  it('reprovou: com tudo pronto, reprovar não emite; aprovar emite (e é idempotente)', async () => {
    const fail = await submitTrailCheck(db, { ...base(), answers: wrong });
    expect(fail.result.passed).toBe(false);
    // já houve uma aprovação antes (1º teste): a checagem conta como aprovada, então o selo sai agora
    expect(fail.status.checkPassed).toBe(true);
    const ok = await submitTrailCheck(db, { ...base(), answers: right });
    expect(ok.badge).not.toBeNull();
    expect(ok.badge!.code).toMatch(/^DNA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(ok.badge!.holderName).toBe('Aluna Teste');
    expect(ok.badge!.trailName).toBe(TRAIL);
    const again = await submitTrailCheck(db, { ...base(), answers: right });
    expect(again.badge!.id).toBe(ok.badge!.id);
    const all = await db.select().from(s.trailBadges).where(eq(s.trailBadges.userId, seeded.users['aluno@demo.local']!));
    expect(all).toHaveLength(1);
  });

  it('carga horária: gravada na emissão (aulas da versão publicada + checagem final); selo antigo recalcula', async () => {
    const [b] = await db.select().from(s.trailBadges).where(eq(s.trailBadges.userId, seeded.users['aluno@demo.local']!));
    const enr = (await getEnrollmentWithVersion(db, seeded.enrollmentId))!;
    const expected = allLessons(enr.document).reduce((n, l) => n + l.estimatedMinutes, 0) + TRAIL_FINAL_CHECK_MINUTES;
    expect(await trailWorkloadMinutes(db, { workspaceId: seeded.workspaceId, trail: TRAIL })).toBe(expected);
    expect(b!.workloadMinutes).toBe(expected);
    expect(await badgeWorkloadMinutes(db, b!)).toBe(expected);
    expect(await badgeWorkloadMinutes(db, { ...b!, workloadMinutes: null })).toBe(expected);
    expect(await badgeWorkloadMinutes(db, { ...b!, workloadMinutes: 77 })).toBe(77);
    expect(b!.competencies.length).toBeGreaterThan(0);
  });

  it('verificação pública: código válido, inexistente, malformado e revogado', async () => {
    const [b] = await db.select().from(s.trailBadges).where(eq(s.trailBadges.userId, seeded.users['aluno@demo.local']!));
    expect((await getBadgeByCode(db, b!.code.toLowerCase()))?.id).toBe(b!.id);
    expect(await getBadgeByCode(db, 'DNA-AAAA-AAAA')).toBeNull();
    expect(await getBadgeByCode(db, "x' or 1=1")).toBeNull();
    await db.update(s.trailBadges).set({ revokedAt: new Date() }).where(eq(s.trailBadges.id, b!.id));
    const revoked = await getBadgeByCode(db, b!.code);
    expect(revoked?.revokedAt).toBeTruthy();
    expect((await trailStatus(db, base())).badge).toBeNull();
  });
});

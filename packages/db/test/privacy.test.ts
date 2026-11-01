import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, missionRecords, saveMissionResponse, startOrResumeAttempt } from '../src/repositories/learning';
import { access, privacy, retention } from '../src';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let courseId: string;

const NOTE = 'Conversei com a Marta sobre o diagnóstico dela.';
const mission = { id: 'missao', type: 'mission', title: 'Leve para a vida real', intro: 'Para treinar de verdade.', action: 'Hoje, ofereça ajuda a um colega.', alternative: 'Se ainda não trabalha, treine com um colega de curso.' };
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso com missão',
  modules: [
    {
      id: 'm1',
      title: 'Módulo',
      lessons: [
        {
          id: 'aula_1',
          title: 'Aula 1',
          graph: {
            schemaVersion: 1,
            startNodeId: 'n1',
            nodes: [{ id: 'n1', type: 'content', body: richTextFromPlain('Conteúdo') }, mission, { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') }],
            edges: [{ id: 'e1', from: 'n1', to: 'missao' }, { id: 'e2', from: 'missao', to: 'fim' }],
          },
        },
      ],
    },
  ],
});

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title: 'Curso com missão', createdBy: authorId, document: doc });
  courseId = course.id;
  const draft = (await getDraft(db, courseId))!;
  await publishCourse(db, { courseId, userId: authorId, expectedRevision: draft.revision });
});
afterAll(async () => {
  await close();
});

let seq = 0;
/** conta descartável (única @demo.local em que uma escrita é permitida): usuário + senha + papel de aluno */
async function throwaway() {
  const id = newId('usr');
  const email = `lgpd-teste-${Date.now().toString(36)}${seq++}@demo.local`;
  await db.insert(s.user).values({ id, name: 'Pessoa de Teste', email, emailVerified: true });
  await db.insert(s.account).values({ id: newId('acc'), accountId: id, providerId: 'credential', userId: id, password: 'hash-que-nao-deve-sair' });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student' });
  return { id, email };
}

async function answerMission(enrollmentId: string, note: string) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId: 'aula_1' });
  let rev = attempt.revision;
  if (attempt.state.currentNodeId === 'n1') {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `adv-${attempt.id}`, nodeId: 'n1', expectedRevision: rev, intent: { kind: 'advance' } });
    rev = r.revision;
  }
  await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `m-${attempt.id}`, nodeId: 'missao', expectedRevision: rev, intent: { kind: 'mission', status: 'done', note } });
  return attempt.id;
}

describe('guarda de contas', () => {
  it('recusa aluno@demo.local em qualquer modo e escrita em @demo.local que não seja descartável', () => {
    expect(privacy.checkTargetEmail('aluno@demo.local', 'read').ok).toBe(false);
    expect(privacy.checkTargetEmail('ALUNO@demo.local ', 'write').ok).toBe(false);
    expect(privacy.checkTargetEmail('aluna@demo.local', 'write').ok).toBe(false);
    expect(privacy.checkTargetEmail('aluna@demo.local', 'read').ok).toBe(true);
    expect(privacy.checkTargetEmail('lgpd-teste-abc1@demo.local', 'write').ok).toBe(true);
    expect(privacy.checkTargetEmail('maria@exemplo.com', 'write').ok).toBe(true);
    expect(privacy.checkTargetEmail('sem-arroba', 'read').ok).toBe(false);
  });
  it('apagar com --apply recusa a conta do seed antes de tocar em qualquer coisa', async () => {
    await expect(privacy.eraseUser(db, { email: 'aluna@demo.local', apply: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [still] = await db.select().from(s.user).where(eq(s.user.email, 'aluna@demo.local'));
    expect(still).toBeTruthy();
  });
});

describe('nota da missão: apagar de verdade', () => {
  it('zera a nota, o histórico e as cópias do texto; mantém o estado e registra sem o texto', async () => {
    const u = await throwaway();
    const { enrollment } = await enrollStudent(db, { courseId, userId: u.id, createdBy: authorId });
    const attemptId = await answerMission(enrollment.id, NOTE);
    await saveMissionResponse(db, { enrollmentId: enrollment.id, nodeId: 'missao', status: 'done', note: `${NOTE} Segunda versão.`, expectedRevision: 1 });
    const before = JSON.stringify([
      await db.select().from(s.missionResponses),
      await db.select().from(s.missionResponseEvents),
      await db.select().from(s.lessonAttempts),
      await db.select().from(s.learnerEvents),
    ]);
    expect(before).toContain('Conversei com a Marta');

    const r = await privacy.deleteMissionNote(db, { enrollmentId: enrollment.id, nodeId: 'missao', userId: u.id });
    expect(r).toMatchObject({ deleted: true, status: 'done', revision: 3 });
    expect(r.copiesCleaned).toBeGreaterThan(0);

    const rows = await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, u.id));
    expect(rows[0]).toMatchObject({ note: null, status: 'done', revision: 3 });
    const events = await db.select().from(s.missionResponseEvents).where(eq(s.missionResponseEvents.responseId, rows[0]!.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ note: null, status: 'done', revision: 3, source: 'note_deleted' });
    // nenhuma cópia do texto sobra nas tentativas e nos eventos da aula
    const attempt = (await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, attemptId)))[0]!;
    expect(JSON.stringify(attempt.state)).not.toContain('Conversei');
    expect(attempt.state.answers['missao']).toMatchObject({ missionStatus: 'done' });
    const evs = await db.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, attemptId));
    expect(JSON.stringify(evs)).not.toContain('Conversei');
    // o registro lido pelo curso continua "Já experimentei", sem texto
    const recs = await missionRecords(db, { enrollmentId: enrollment.id });
    expect(recs['missao']).toMatchObject({ status: 'done', note: null, revision: 3 });
    // auditoria sem texto
    const audit = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'note.delete'))).find((a) => a.entityId === rows[0]!.id)!;
    expect(audit.data).toMatchObject({ userId: u.id, nodeId: 'missao', via: 'aluno' });
    expect(JSON.stringify(audit)).not.toContain('Marta');
    // idempotente: segunda chamada não muda nada
    const again = await privacy.deleteMissionNote(db, { enrollmentId: enrollment.id, nodeId: 'missao', userId: u.id });
    expect(again).toMatchObject({ deleted: false, revision: 3 });
  });

  it('só o dono da matrícula apaga (outro usuário recebe NOT_FOUND)', async () => {
    const owner = await throwaway();
    const other = await throwaway();
    const { enrollment } = await enrollStudent(db, { courseId, userId: owner.id, createdBy: authorId });
    await answerMission(enrollment.id, NOTE);
    await expect(privacy.deleteMissionNote(db, { enrollmentId: enrollment.id, nodeId: 'missao', userId: other.id })).rejects.toBeInstanceOf(DomainError);
    const [row] = await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, owner.id));
    expect(row!.note).toBe(NOTE);
  });

  it('dados:apagar-nota: simulação não altera; --apply apaga; recusa conta do seed', async () => {
    const u = await throwaway();
    const { enrollment } = await enrollStudent(db, { courseId, userId: u.id, createdBy: authorId });
    await answerMission(enrollment.id, NOTE);
    const dry = await privacy.eraseMissionNotesForUser(db, { email: u.email, target: enrollment.id, apply: false });
    expect(dry).toMatchObject({ applied: false });
    expect(dry.targets[0]).toMatchObject({ hasNote: true });
    expect((await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, u.id)))[0]!.note).toBe(NOTE);
    const done = await privacy.eraseMissionNotesForUser(db, { email: u.email, target: 'aula_1', apply: true });
    expect(done.results[0]).toMatchObject({ deleted: true });
    expect((await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, u.id)))[0]!.note).toBeNull();
    await expect(privacy.eraseMissionNotesForUser(db, { email: 'aluna@demo.local', target: 'aula_1', apply: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('exportação', () => {
  it('reúne os dados sem hash de senha nem token de sessão e resume em português simples', async () => {
    const u = await throwaway();
    const { enrollment } = await enrollStudent(db, { courseId, userId: u.id, createdBy: authorId });
    await answerMission(enrollment.id, NOTE);
    await db.insert(s.session).values({ id: newId('ses'), token: 'TOKEN-SECRETO-123', userId: u.id, expiresAt: new Date(Date.now() + 86_400_000), ipAddress: '203.0.113.7', userAgent: 'teste' });
    await access.recordAccessLog(db, { userId: u.id, ipAddress: '203.0.113.7', kind: 'login' });
    const data = (await privacy.collectUserData(db, u.email))!;
    expect(data.conta).toMatchObject({ id: u.id, email: u.email });
    expect(data.matriculas).toHaveLength(1);
    expect(data.missoes).toHaveLength(1);
    expect(data.sessoesAtivas).toHaveLength(1);
    expect(data.sessoesAtivas[0]).toMatchObject({ ipAddress: '203.0.113.7' });
    expect(data.registrosDeAcesso).toHaveLength(1);
    const json = JSON.stringify(data);
    expect(json).not.toContain('hash-que-nao-deve-sair');
    expect(json).not.toContain('TOKEN-SECRETO-123');
    const txt = privacy.summarizeUserData(data);
    expect(txt).toContain('1 curso em que você está matriculado');
    expect(txt).toContain('1 com nota escrita por você');
    expect(txt).not.toContain('Marta');
    expect(await privacy.collectUserData(db, 'ninguem@exemplo.com')).toBeNull();
  });
});

describe('exclusão da conta', () => {
  it('simulação não altera nada; --apply cancela e anonimiza o selo, apaga a conta e mantém auditoria e acesso', async () => {
    const u = await throwaway();
    const { enrollment } = await enrollStudent(db, { courseId, userId: u.id, createdBy: authorId });
    await answerMission(enrollment.id, NOTE);
    const code = `DNA-TSTE-${'ABCDEFGHJKLMNPQRSTUVWXYZ'[seq % 24]}${'23456789'[seq % 8]}KP`;
    await db.insert(s.trailBadges).values({ id: newId('bdg'), code, workspaceId: seeded.workspaceId, userId: u.id, trailKey: 'convivencia', trailName: 'Convivência', holderName: 'Pessoa de Teste', competencies: [], courses: [] });
    await db.insert(s.outboxEvents).values({ id: newId('obx'), type: 'course.completed', payload: { enrollmentId: enrollment.id, userId: u.id } });
    await access.recordAccessLog(db, { userId: u.id, ipAddress: '198.51.100.9', kind: 'login' });

    const dry = await privacy.eraseUser(db, { email: u.email, apply: false });
    expect(dry.applied).toBe(false);
    expect(dry.counts).toMatchObject({ matriculas: 1, missoes: 1, selosParaCancelarEAnonimizar: 1, registrosDeAcessoMantidos: 1 });
    expect(dry.counts.eventosPendentesDoOutbox).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(1);

    const done = await privacy.eraseUser(db, { email: u.email, apply: true, actorId: null });
    expect(done.applied).toBe(true);
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(0);
    expect(await db.select().from(s.enrollments).where(eq(s.enrollments.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(s.account).where(eq(s.account.userId, u.id))).toHaveLength(0);
    // selo: fica, cancelado, sem nome e sem dono
    const [badge] = await db.select().from(s.trailBadges).where(eq(s.trailBadges.code, code));
    expect(badge).toMatchObject({ userId: null, holderName: privacy.REMOVED_HOLDER_NAME });
    expect(badge!.revokedAt).toBeInstanceOf(Date);
    // outbox da pessoa foi embora
    expect((await db.select().from(s.outboxEvents).where(sql`${s.outboxEvents.payload}->>'userId' = ${u.id}`))).toHaveLength(0);
    // registro de acesso e auditoria ficam
    expect(await db.select().from(s.accessLogs).where(eq(s.accessLogs.userId, u.id))).toHaveLength(1);
    const actions = (await db.select().from(s.auditLogs)).filter((a) => JSON.stringify(a.data).includes(u.id) || a.entityId === u.id).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['badge.revoke', 'user.delete', 'enrollment.create']));
    // a página pública (leitura por código) mostra cancelado
    const { getBadgeByCode } = await import('../src/repositories/recognition');
    const pub = await getBadgeByCode(db, code);
    expect(pub?.revokedAt).toBeTruthy();
    expect(pub?.holderName).toBe(privacy.REMOVED_HOLDER_NAME);
    // sem a pessoa: nova tentativa avisa que não há conta
    await expect(privacy.eraseUser(db, { email: u.email, apply: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('recusa conta com papel de equipe', async () => {
    const staff = await throwaway();
    await db.update(s.workspaceMemberships).set({ role: 'author' }).where(eq(s.workspaceMemberships.userId, staff.id));
    await expect(privacy.eraseUser(db, { email: staff.email, apply: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.select().from(s.user).where(eq(s.user.id, staff.id))).toHaveLength(1);
  });

  it('--encerrar só marca; a rotina só apaga conta encerrada se a flag estiver ligada', async () => {
    const u = await throwaway();
    await privacy.closeAccount(db, { email: u.email, apply: true });
    expect((await db.select().from(s.accountClosures).where(eq(s.accountClosures.userId, u.id)))).toHaveLength(1);
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(1);
    // encerrada há 13 meses
    await db.update(s.accountClosures).set({ closedAt: access.monthsBefore(new Date(), 13) }).where(eq(s.accountClosures.userId, u.id));
    const off = await retention.runRetention(db, retention.retentionConfigFromEnv({}));
    expect(off.closedAccounts).toBeNull();
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(1);
    const dry = await retention.runRetention(db, retention.retentionConfigFromEnv({ RETENTION_CLOSED_ACCOUNTS_ENABLED: '1', RETENTION_DRY_RUN: '1' }));
    expect(dry.closedAccounts).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(1);
    const on = await retention.runRetention(db, retention.retentionConfigFromEnv({ RETENTION_CLOSED_ACCOUNTS_ENABLED: '1' }));
    expect(on.closedAccounts).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(s.user).where(eq(s.user.id, u.id))).toHaveLength(0);
  });
});

describe('registro de acesso (Marco Civil)', () => {
  it('grava login e renovação com IP', async () => {
    const u = await throwaway();
    await access.recordAccessLog(db, { userId: u.id, ipAddress: '203.0.113.10', kind: 'login' });
    await access.recordAccessLog(db, { userId: u.id, ipAddress: '203.0.113.10', kind: 'renew', sourcePort: 51234 });
    const rows = await db.select().from(s.accessLogs).where(eq(s.accessLogs.userId, u.id));
    expect(rows.map((r) => r.kind).sort()).toEqual(['login', 'renew']);
    expect(rows.find((r) => r.kind === 'renew')!.sourcePort).toBe(51234);
  });

  it('uma falha do banco NUNCA propaga: devolve false e avisa sem IP', async () => {
    const broken = { insert: () => ({ values: () => Promise.reject(new Error('relation "access_logs" does not exist')) }) } as unknown as Database;
    const warnings: string[] = [];
    await expect(access.recordAccessLogSafe(broken, { userId: 'u1', ipAddress: '203.0.113.99', kind: 'login' }, { onError: (m) => warnings.push(m) })).resolves.toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('conta u1');
    expect(warnings[0]).not.toContain('203.0.113.99');
    // mesmo se o aviso falhar
    await expect(access.recordAccessLogSafe(broken, { userId: 'u1', ipAddress: null, kind: 'renew' }, { onError: () => { throw new Error('log quebrado'); } })).resolves.toBe(false);
    // banco que não responde: o login segue depois do tempo limite
    const hung = { insert: () => ({ values: () => new Promise(() => {}) }) } as unknown as Database;
    const t0 = Date.now();
    await expect(access.recordAccessLogSafe(hung, { userId: 'u1', ipAddress: null, kind: 'login' }, { timeoutMs: 50, onError: () => {} })).resolves.toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('consulta exige motivo e deixa linha access_logs.read em audit_logs', async () => {
    const u = await throwaway();
    await access.recordAccessLog(db, { userId: u.id, ipAddress: '192.0.2.44', kind: 'login' });
    await expect(access.queryAccessLogs(db, { term: u.email, motivo: '  ', executor: 'teste' })).rejects.toThrow(/motivo/);
    const byEmail = await access.queryAccessLogs(db, { term: u.email, motivo: 'Processo 123', executor: 'teste' });
    expect(byEmail).toMatchObject({ by: 'email', userId: u.id });
    expect(byEmail.rows).toHaveLength(1);
    const byIp = await access.queryAccessLogs(db, { term: '192.0.2.44', motivo: 'Processo 123', executor: 'teste' });
    expect(byIp.by).toBe('ip');
    expect(byIp.rows.map((r) => r.userId)).toContain(u.id);
    const reads = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'access_logs.read'))).filter((r) => (r.data as { motivo?: string }).motivo === 'Processo 123');
    expect(reads).toHaveLength(2);
    expect(access.classifyAccessQuery('2001:db8::1')).toBe('ip');
    expect(access.classifyAccessQuery('a@b.c')).toBe('email');
    expect(access.classifyAccessQuery('usr_abc')).toBe('usuario');
  });
});

describe('rotina de retenção', () => {
  it('apaga o que passou do prazo (padrões da proposta) e deixa o resto; selos e contas encerradas ficam desligados', async () => {
    const u = await throwaway();
    const now = new Date();
    const day = 86_400_000;
    await db.insert(s.session).values([
      { id: newId('ses'), token: `old-${seq}`, userId: u.id, expiresAt: new Date(now.getTime() - 40 * day) },
      { id: newId('ses'), token: `recent-${seq}`, userId: u.id, expiresAt: new Date(now.getTime() - 10 * day) },
      { id: newId('ses'), token: `live-${seq}`, userId: u.id, expiresAt: new Date(now.getTime() + 5 * day) },
    ]);
    await db.insert(s.outboxEvents).values([
      { id: newId('obx'), type: 'x', payload: {}, processedAt: new Date(now.getTime() - 40 * day) },
      { id: newId('obx'), type: 'x', payload: {}, processedAt: new Date(now.getTime() - 5 * day) },
      { id: newId('obx'), type: 'x', payload: {}, processedAt: null, createdAt: new Date(now.getTime() - 90 * day) },
    ]);
    await db.insert(s.auditLogs).values([
      { id: newId('aud'), action: 'x.velho', entityType: 'x', entityId: 'x', data: {}, createdAt: new Date(now.getTime() - 800 * day) },
      { id: newId('aud'), action: 'x.novo', entityType: 'x', entityId: 'x', data: {}, createdAt: new Date(now.getTime() - 100 * day) },
    ]);
    await db.insert(s.accessLogs).values([
      { id: newId('acc'), userId: u.id, ipAddress: '1.1.1.1', kind: 'login', occurredAt: access.monthsBefore(now, 7) },
      { id: newId('acc'), userId: u.id, ipAddress: '1.1.1.1', kind: 'login', occurredAt: access.monthsBefore(now, 5) },
    ]);
    await db.insert(s.trailBadges).values({ id: newId('bdg'), code: `DNA-OLD-${seq}`, workspaceId: seeded.workspaceId, userId: u.id, trailKey: 'antigo', trailName: 'Antigo', holderName: 'X', competencies: [], courses: [], issuedAt: new Date(now.getTime() - 6 * 365 * day) });

    const runsBefore = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'retention.run'))).length;
    const cfg = retention.retentionConfigFromEnv({});
    expect(cfg).toMatchObject({ sessionsDays: 30, outboxDays: 30, auditDays: 730, accessLogMonths: 6, dryRun: false });
    expect(cfg.closedAccounts.enabled).toBe(false);
    expect(cfg.badgeExpiry.enabled).toBe(false);

    // dry-run: conta e não apaga
    const dry = await retention.runRetention(db, { ...cfg, dryRun: true }, now);
    expect(dry).toMatchObject({ dryRun: true });
    expect(dry.sessions).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(s.session).where(eq(s.session.userId, u.id))).toHaveLength(3);
    expect((await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'retention.run'))).length).toBe(runsBefore);

    const r = await retention.runRetention(db, cfg, now);
    expect(r.badgesExpired).toBeNull();
    expect(r.closedAccounts).toBeNull();
    const sessions = await db.select().from(s.session).where(eq(s.session.userId, u.id));
    expect(sessions.map((x) => x.token).sort()).toEqual([`live-${seq}`, `recent-${seq}`].sort());
    const outbox = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.type, 'x'));
    expect(outbox).toHaveLength(2); // o de 5 dias e o pendente
    expect((await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'x.velho')))).toHaveLength(0);
    expect((await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'x.novo')))).toHaveLength(1);
    const acc = await db.select().from(s.accessLogs).where(eq(s.accessLogs.userId, u.id));
    expect(acc).toHaveLength(1);
    expect(acc[0]!.occurredAt.getTime()).toBeGreaterThan(access.monthsBefore(now, 6).getTime());
    // selo antigo intacto com a flag desligada
    expect((await db.select().from(s.trailBadges).where(eq(s.trailBadges.code, `DNA-OLD-${seq}`)))[0]!.revokedAt).toBeNull();
    expect(await retention.lastRetentionRun(db)).toBeInstanceOf(Date);

    // flag ligada: expira o selo de mais de 5 anos
    const on = await retention.runRetention(db, retention.retentionConfigFromEnv({ RETENTION_BADGE_EXPIRY_ENABLED: 'true' }), now);
    expect(on.badgesExpired).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(s.trailBadges).where(eq(s.trailBadges.code, `DNA-OLD-${seq}`)))[0]!.revokedAt).toBeInstanceOf(Date);
  });

  it('o prazo do registro de acesso nunca fica abaixo de 6 meses, nem por configuração', () => {
    expect(retention.retentionConfigFromEnv({ RETENTION_ACCESS_LOG_MONTHS: '2' }).accessLogMonths).toBe(6);
    expect(retention.retentionConfigFromEnv({ RETENTION_ACCESS_LOG_MONTHS: '12' }).accessLogMonths).toBe(12);
    expect(retention.retentionConfigFromEnv({ RETENTION_SESSIONS_DAYS: 'abc' }).sessionsDays).toBe(30);
  });
});

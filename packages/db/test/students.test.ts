import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, students, integrationTokens, type Database } from '../src';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let adminId: string;
const SLUG = 'comunicacao-no-primeiro-emprego';

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  adminId = seeded.users['admin@demo.local']!;
  // curso em rascunho (existe, mas não está publicado)
  await db.insert(s.courses).values({ id: newId('crs'), workspaceId: seeded.workspaceId, slug: 'curso-rascunho', title: 'Rascunho', createdBy: adminId });
});
afterAll(async () => {
  await close();
});

const run = (rows: students.StudentInput[], extra: Partial<Parameters<typeof students.upsertStudents>[1]> = {}) =>
  students.upsertStudents(db, { workspaceId: seeded.workspaceId, actorId: adminId, rows, ...extra });

describe('upsertStudents', () => {
  it('cria conta sem senha, vínculo de aluno com RGM/telefone e matrícula; repetir não muda nada (idempotente)', async () => {
    const row = { nome: '  Ana   Souza ', email: ' Ana.Souza@Teste.Local ', rgm: ' 1001 ', telefone: '(11) 99999-0000', cursos: [SLUG] };
    const first = await run([row]);
    expect(first.summary).toMatchObject({ created: 1, error: 0, total: 1 });
    expect(first.results[0]).toMatchObject({ email: 'ana.souza@teste.local', status: 'created', enrolled: [SLUG] });

    const [u] = await db.select().from(s.user).where(eq(s.user.email, 'ana.souza@teste.local'));
    expect(u).toMatchObject({ name: 'Ana Souza', emailVerified: false });
    expect(await db.select().from(s.account).where(eq(s.account.userId, u!.id))).toHaveLength(0);
    const [m] = await db.select().from(s.workspaceMemberships).where(and(eq(s.workspaceMemberships.userId, u!.id), eq(s.workspaceMemberships.workspaceId, seeded.workspaceId)));
    expect(m).toMatchObject({ role: 'student', rgm: '1001', phone: '(11) 99999-0000' });
    expect(await db.select().from(s.enrollments).where(eq(s.enrollments.userId, u!.id))).toHaveLength(1);

    const second = await run([row]);
    expect(second.results[0]).toMatchObject({ status: 'unchanged', enrolled: [], alreadyEnrolled: [SLUG] });
    expect(await db.select().from(s.enrollments).where(eq(s.enrollments.userId, u!.id))).toHaveLength(1);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'ana.souza@teste.local'))).toHaveLength(1);
  });

  it('atualiza nome, RGM e telefone de quem já é aluno; telefone em branco não apaga', async () => {
    const r = await run([{ nome: 'Ana S. Souza', email: 'ana.souza@teste.local', rgm: '1001-B', telefone: '' }]);
    expect(r.results[0]!.status).toBe('updated');
    const [u] = await db.select().from(s.user).where(eq(s.user.email, 'ana.souza@teste.local'));
    expect(u!.name).toBe('Ana S. Souza');
    const [m] = await db.select().from(s.workspaceMemberships).where(eq(s.workspaceMemberships.userId, u!.id));
    expect(m).toMatchObject({ rgm: '1001-B', phone: '(11) 99999-0000' });
  });

  it('RGM repetido no workspace e no lote vira erro só naquela linha', async () => {
    const r = await run([
      { nome: 'Bia', email: 'bia@teste.local', rgm: '2001' },
      { nome: 'Caio', email: 'caio@teste.local', rgm: '2001' }, // repete a linha acima
      { nome: 'Duda', email: 'duda@teste.local', rgm: '1001-b' }, // já é da Ana (sem diferença de caixa)
      { nome: 'Edu', email: 'edu@teste.local', rgm: '2003' },
    ]);
    expect(r.results.map((x) => x.status)).toEqual(['created', 'error', 'error', 'created']);
    expect(r.results[1]!.reason).toMatch(/RGM repetido no lote/);
    expect(r.results[2]!.reason).toMatch(/outro aluno/);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'caio@teste.local'))).toHaveLength(0);
    expect(r.summary).toMatchObject({ created: 2, error: 2 });
  });

  it('e-mail inválido, nome ou RGM em branco, e e-mail repetido no lote', async () => {
    const r = await run([
      { nome: 'X', email: 'sem-arroba', rgm: '3001' },
      { nome: '', email: 'sem-nome@teste.local', rgm: '3002' },
      { nome: 'Sem RGM', email: 'sem-rgm@teste.local', rgm: '  ' },
      { nome: 'Fa', email: 'fa@teste.local', rgm: '3004' },
      { nome: 'Fa de novo', email: 'FA@teste.local', rgm: '3005' },
    ]);
    expect(r.results.map((x) => x.reason)).toEqual(['E-mail inválido', 'Nome em branco', 'RGM em branco', undefined, expect.stringMatching(/E-mail repetido/)]);
  });

  it('curso inexistente ou não publicado: erro na linha, nada é criado para ela', async () => {
    const r = await run([
      { nome: 'Gi', email: 'gi@teste.local', rgm: '4001', cursos: ['nao-existe'] },
      { nome: 'Hugo', email: 'hugo@teste.local', rgm: '4002', cursos: ['curso-rascunho'] },
      { nome: 'Ivo', email: 'ivo@teste.local', rgm: '4003', cursos: [SLUG] },
    ]);
    expect(r.results.map((x) => x.status)).toEqual(['error', 'error', 'created']);
    expect(r.results[0]!.reason).toContain('nao-existe');
    expect(r.results[1]!.reason).toContain('curso-rascunho');
    expect(await db.select().from(s.user).where(eq(s.user.email, 'gi@teste.local'))).toHaveLength(0);
  });

  it('equipe não é alterada: a linha volta com erro e papel, nome e RGM ficam como estavam', async () => {
    const r = await run([{ nome: 'Nome Trocado', email: 'AUTOR@demo.local', rgm: '9999', cursos: [SLUG] }]);
    expect(r.results[0]).toMatchObject({ status: 'error' });
    expect(r.results[0]!.reason).toMatch(/equipe/);
    const [m] = await db.select().from(s.workspaceMemberships).where(eq(s.workspaceMemberships.userId, seeded.users['autor@demo.local']!));
    expect(m).toMatchObject({ role: 'author', rgm: null });
    const [u] = await db.select().from(s.user).where(eq(s.user.email, 'autor@demo.local'));
    expect(u!.name).not.toBe('Nome Trocado');
  });

  it('enrollCourseSlugs vale para todas as linhas, somado ao cursos da linha, sem duplicar', async () => {
    const r = await run([{ nome: 'Jo', email: 'jo@teste.local', rgm: '5001', cursos: [SLUG] }, { nome: 'Kai', email: 'kai@teste.local', rgm: '5002' }], { enrollCourseSlugs: [SLUG] });
    expect(r.results.map((x) => x.enrolled)).toEqual([[SLUG], [SLUG]]);
  });

  it('dryRun só confere: não grava nada e não cria auditoria', async () => {
    const before = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'students.upsert'));
    const r = await run(
      [
        { nome: 'Lia', email: 'lia@teste.local', rgm: '6001', cursos: [SLUG] },
        { nome: 'Jo', email: 'jo@teste.local', rgm: '5001', cursos: [SLUG] },
        { nome: 'Ruim', email: 'ruim', rgm: '6003' },
      ],
      { dryRun: true },
    );
    expect(r.results.map((x) => x.status)).toEqual(['created', 'unchanged', 'error']);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'lia@teste.local'))).toHaveLength(0);
    expect(await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'students.upsert'))).toHaveLength(before.length);
  });

  it('lote em fatias: uma linha com falha no banco não derruba as outras da mesma fatia', async () => {
    // a corrida é simulada: o RGM é tomado por outro aluno entre a conferência e a gravação
    const rows = [
      { nome: 'M1', email: 'm1@teste.local', rgm: '7001' },
      { nome: 'M2', email: 'm2@teste.local', rgm: '7002' },
      { nome: 'M3', email: 'm3@teste.local', rgm: '7003' },
    ];
    const orig = db.transaction.bind(db);
    let raced = false;
    // injeta, dentro da transação da fatia, um aluno que fica com o RGM 7002 antes da linha 2 ser gravada
    (db as unknown as { transaction: typeof db.transaction }).transaction = (async (fn: Parameters<typeof db.transaction>[0], cfg: never) =>
      orig(async (tx) => {
        if (!raced) {
          raced = true;
          const uid = newId('usr');
          await tx.insert(s.user).values({ id: uid, email: 'corrida@teste.local', name: 'Corrida', emailVerified: false });
          await tx.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: uid, role: 'student', rgm: '7002' });
        }
        return fn(tx);
      }, cfg)) as typeof db.transaction;
    let r;
    try {
      r = await run(rows, { chunkSize: 10 });
    } finally {
      (db as unknown as { transaction: typeof db.transaction }).transaction = orig as typeof db.transaction;
    }
    expect(r.results.map((x) => x.status)).toEqual(['created', 'error', 'created']);
    expect(r.results[1]!.reason).toMatch(/RGM/);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'm1@teste.local'))).toHaveLength(1);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'm2@teste.local'))).toHaveLength(0);
    expect(await db.select().from(s.user).where(eq(s.user.email, 'm3@teste.local'))).toHaveLength(1);
  });

  it('grava uma auditoria por lote, sem e-mails nem RGMs', async () => {
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'students.upsert'));
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs.map((l) => l.data));
    expect(text).not.toContain('@teste.local');
    expect(logs[0]).toMatchObject({ workspaceId: seeded.workspaceId, actorId: adminId });
  });

  it('o banco recusa RGM repetido no workspace, mas aceita vários sem RGM', async () => {
    const mk = async (email: string, rgm: string | null) => {
      const id = newId('usr');
      await db.insert(s.user).values({ id, email, name: email, emailVerified: false });
      await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student', rgm });
    };
    await mk('sem1@teste.local', null);
    await mk('sem2@teste.local', null);
    await mk('com1@teste.local', 'UNICO-1');
    await expect(mk('com2@teste.local', 'UNICO-1')).rejects.toThrow();
  });

  it('lista cursos publicados', async () => {
    const list = await students.listPublishedCourseSlugs(db, seeded.workspaceId);
    expect(list.map((c) => c.slug)).toContain(SLUG);
    expect(list.map((c) => c.slug)).not.toContain('curso-rascunho');
  });
});

describe('tokens de integração', () => {
  it('guarda só o hash; o segredo vale uma vez e tem o prefixo', async () => {
    const t = await integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: ' DNA ', scopes: ['students:write', 'students:write'] });
    expect(t.secret).toMatch(/^lms_[A-Za-z0-9_-]{43}$/);
    expect(t.scopes).toEqual(['students:write']);
    const [row] = await db.select().from(s.integrationTokens).where(eq(s.integrationTokens.id, t.id));
    expect(row!.tokenHash).toBe(integrationTokens.hashToken(t.secret));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(t.secret);
    expect(row!.prefix).toBe(t.secret.slice(0, 10));
    expect((await integrationTokens.findActiveTokenByHash(db, integrationTokens.hashToken(t.secret)))?.id).toBe(t.id);
  });

  it('recusa nome vazio e escopo desconhecido; revogar tira o token de uso', async () => {
    await expect(integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: ' ', scopes: ['students:write'] })).rejects.toBeInstanceOf(DomainError);
    await expect(integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: 'x', scopes: ['admin:all'] })).rejects.toBeInstanceOf(DomainError);
    await expect(integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: 'x', scopes: [] })).rejects.toBeInstanceOf(DomainError);
    const t = await integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: 'a revogar', scopes: ['progress:read'] });
    await integrationTokens.revokeIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, tokenId: t.id });
    expect(await integrationTokens.findActiveTokenByHash(db, integrationTokens.hashToken(t.secret))).toBeNull();
    await expect(integrationTokens.revokeIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, tokenId: t.id })).rejects.toBeInstanceOf(DomainError);
  });

  it('last_used_at é atualizado com limite de frequência', async () => {
    const t = await integrationTokens.createIntegrationToken(db, { workspaceId: seeded.workspaceId, actorId: adminId, name: 'uso', scopes: ['students:write'] });
    await integrationTokens.touchTokenLastUsed(db, t.id);
    const [a] = await db.select().from(s.integrationTokens).where(eq(s.integrationTokens.id, t.id));
    expect(a!.lastUsedAt).toBeInstanceOf(Date);
    await integrationTokens.touchTokenLastUsed(db, t.id);
    const [b] = await db.select().from(s.integrationTokens).where(eq(s.integrationTokens.id, t.id));
    expect(b!.lastUsedAt!.getTime()).toBe(a!.lastUsedAt!.getTime());
  });
});

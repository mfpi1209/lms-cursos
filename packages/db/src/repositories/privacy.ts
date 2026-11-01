import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';

/**
 * Direitos do titular (LGPD, arts. 18 e 19): exportar, apagar a nota da missão, encerrar e apagar a conta.
 * Usado pelos scripts `dados:*` e, no caso da nota, pela API do aluno. Procedimento: docs/legal/procedimento-direitos-do-titular.md.
 */

/* ------------------------------------------------------------------------ */
/* Guarda de contas                                                          */
/* ------------------------------------------------------------------------ */

/** Conta que nenhuma ferramenta deste arquivo toca (nem para ler): é a conta de demonstração usada pela equipe. */
export const PROTECTED_EMAILS: readonly string[] = ['aluno@demo.local'];
/** Conta descartável criada só para teste: única `@demo.local` em que uma escrita (apagar/encerrar/apagar nota) é permitida. */
export const THROWAWAY_EMAIL = /^lgpd-teste-[a-z0-9-]+@demo\.local$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type TargetCheck = { ok: true } | { ok: false; reason: string };

/**
 * `read`: exportar e simular (dry-run). `write`: qualquer coisa que altere ou apague dados.
 * Contas `@demo.local` são do seed: leitura permitida (exceto a protegida), escrita só em conta descartável `lgpd-teste-*`.
 */
export function checkTargetEmail(email: string, mode: 'read' | 'write'): TargetCheck {
  const e = normalizeEmail(email);
  if (!e.includes('@')) return { ok: false, reason: `"${email}" não parece um e-mail` };
  if (PROTECTED_EMAILS.includes(e)) return { ok: false, reason: `${e} é uma conta protegida de demonstração: recusado em qualquer modo` };
  if (e.endsWith('@demo.local') && mode === 'write' && !THROWAWAY_EMAIL.test(e)) {
    return { ok: false, reason: `${e} é uma conta de demonstração do seed; escrita só em conta descartável (lgpd-teste-*@demo.local)` };
  }
  return { ok: true };
}

export function assertTargetEmail(email: string, mode: 'read' | 'write'): void {
  const c = checkTargetEmail(email, mode);
  if (!c.ok) throw new DomainError('FORBIDDEN', c.reason);
}

async function findUserByEmail(db: DbOrTx, email: string) {
  const [u] = await db.select().from(s.user).where(eq(s.user.email, normalizeEmail(email))).limit(1);
  return u ?? null;
}

/* ------------------------------------------------------------------------ */
/* Exportação                                                                */
/* ------------------------------------------------------------------------ */

export interface UserDataExport {
  versao: 1;
  geradoEm: string;
  conta: { id: string; nome: string; email: string; emailVerificado: boolean; criadaEm: string; atualizadaEm: string; credenciais: Array<{ provedor: string; criadaEm: string }> };
  vinculos: Array<{ workspaceId: string; papel: string; desde: string }>;
  sessoesAtivas: Array<Record<string, unknown>>;
  matriculas: Array<Record<string, unknown>>;
  tentativasDeAula: Array<Record<string, unknown>>;
  eventos: Array<Record<string, unknown>>;
  evidencias: Array<Record<string, unknown>>;
  missoes: Array<Record<string, unknown>>;
  historicoDeMissoes: Array<Record<string, unknown>>;
  checagensDeTrilha: Array<Record<string, unknown>>;
  selos: Array<Record<string, unknown>>;
  auditoria: Array<Record<string, unknown>>;
  registrosDeAcesso: Array<Record<string, unknown>>;
  eventosPendentes: Array<Record<string, unknown>>;
  contaEncerrada: { encerradaEm: string; motivo: string } | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Tudo o que está ligado à conta, sem hash de senha, tokens de sessão nem chaves de terceiros.
 * `null` se não existe conta com esse e-mail.
 */
export async function collectUserData(db: DbOrTx, email: string, now: Date = new Date()): Promise<UserDataExport | null> {
  const u = await findUserByEmail(db, email);
  if (!u) return null;
  const uid = u.id;
  const accounts = await db.select({ providerId: s.account.providerId, createdAt: s.account.createdAt }).from(s.account).where(eq(s.account.userId, uid));
  const memberships = await db.select().from(s.workspaceMemberships).where(eq(s.workspaceMemberships.userId, uid));
  const sessions = await db
    .select({ id: s.session.id, createdAt: s.session.createdAt, updatedAt: s.session.updatedAt, expiresAt: s.session.expiresAt, ipAddress: s.session.ipAddress, userAgent: s.session.userAgent })
    .from(s.session)
    .where(eq(s.session.userId, uid));
  const enrolls = await db
    .select({ e: s.enrollments, courseTitle: s.courses.title })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(eq(s.enrollments.userId, uid))
    .orderBy(asc(s.enrollments.createdAt));
  const enrollmentIds = enrolls.map((r) => r.e.id);
  const attempts = enrollmentIds.length ? await db.select().from(s.lessonAttempts).where(inArray(s.lessonAttempts.enrollmentId, enrollmentIds)).orderBy(asc(s.lessonAttempts.startedAt)) : [];
  const attemptIds = attempts.map((a) => a.id);
  const events = attemptIds.length ? await db.select().from(s.learnerEvents).where(inArray(s.learnerEvents.attemptId, attemptIds)).orderBy(asc(s.learnerEvents.createdAt)) : [];
  const evidence = enrollmentIds.length ? await db.select().from(s.objectiveEvidence).where(inArray(s.objectiveEvidence.enrollmentId, enrollmentIds)) : [];
  const missions = await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, uid)).orderBy(asc(s.missionResponses.createdAt));
  const missionIds = missions.map((m) => m.id);
  const missionEvents = missionIds.length ? await db.select().from(s.missionResponseEvents).where(inArray(s.missionResponseEvents.responseId, missionIds)).orderBy(asc(s.missionResponseEvents.createdAt)) : [];
  const checks = await db.select().from(s.trailCheckAttempts).where(eq(s.trailCheckAttempts.userId, uid)).orderBy(asc(s.trailCheckAttempts.createdAt));
  const badges = await db.select().from(s.trailBadges).where(eq(s.trailBadges.userId, uid)).orderBy(asc(s.trailBadges.issuedAt));
  const audit = await db
    .select()
    .from(s.auditLogs)
    .where(or(eq(s.auditLogs.actorId, uid), eq(s.auditLogs.entityId, uid), sql`${s.auditLogs.data}->>'userId' = ${uid}`))
    .orderBy(asc(s.auditLogs.createdAt));
  const access = await db.select().from(s.accessLogs).where(eq(s.accessLogs.userId, uid)).orderBy(asc(s.accessLogs.occurredAt));
  const outbox = await db.select().from(s.outboxEvents).where(sql`${s.outboxEvents.payload}->>'userId' = ${uid}`).orderBy(asc(s.outboxEvents.createdAt));
  const [closure] = await db.select().from(s.accountClosures).where(eq(s.accountClosures.userId, uid)).limit(1);

  return {
    versao: 1,
    geradoEm: now.toISOString(),
    conta: { id: uid, nome: u.name, email: u.email, emailVerificado: u.emailVerified, criadaEm: u.createdAt.toISOString(), atualizadaEm: u.updatedAt.toISOString(), credenciais: accounts.map((a) => ({ provedor: a.providerId, criadaEm: a.createdAt.toISOString() })) },
    vinculos: memberships.map((m) => ({ workspaceId: m.workspaceId, papel: m.role, desde: m.createdAt.toISOString() })),
    sessoesAtivas: sessions.filter((x) => x.expiresAt > now).map((x) => ({ ...x })),
    matriculas: enrolls.map((r) => ({ ...r.e, titulo: r.courseTitle })),
    tentativasDeAula: attempts,
    eventos: events,
    evidencias: evidence,
    missoes: missions,
    historicoDeMissoes: missionEvents,
    checagensDeTrilha: checks,
    selos: badges,
    auditoria: audit,
    registrosDeAcesso: access,
    eventosPendentes: outbox,
    contaEncerrada: closure ? { encerradaEm: closure.closedAt.toISOString(), motivo: closure.reason } : null,
  };
}

const dataBR = (isoDate: string | null | undefined) => (isoDate ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(isoDate)) : '-');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumo em português simples, para ir junto com o JSON (modelo C do procedimento). Não repete o texto das notas. */
export function summarizeUserData(d: UserDataExport): string {
  const completed = d.matriculas.filter((m) => m.status === 'completed').length;
  const notes = d.missoes.filter((m) => typeof m.note === 'string' && m.note).length;
  const lastAccess = d.registrosDeAcesso.length ? (d.registrosDeAcesso[d.registrosDeAcesso.length - 1]!.occurredAt as unknown as Date | string) : null;
  const lines = [
    'Resumo dos seus dados no portal DNA Work',
    `Gerado em ${dataBR(d.geradoEm)}.`,
    '',
    'Conta',
    `- Nome: ${d.conta.nome}`,
    `- E-mail: ${d.conta.email}`,
    `- Conta criada em ${dataBR(d.conta.criadaEm)}.`,
    ...(d.contaEncerrada ? [`- Conta encerrada em ${dataBR(d.contaEncerrada.encerradaEm)}.`] : []),
    '',
    'Seu percurso',
    `- ${plural(d.matriculas.length, 'curso em que você está matriculado', 'cursos em que você está matriculado')}, ${completed} concluído${completed === 1 ? '' : 's'}.`,
    `- ${plural(d.tentativasDeAula.length, 'tentativa de aula registrada', 'tentativas de aula registradas')}.`,
    `- ${plural(d.missoes.length, 'missão registrada', 'missões registradas')}, ${notes} com nota escrita por você.`,
    `- ${plural(d.checagensDeTrilha.length, 'checagem final de trilha feita', 'checagens finais de trilha feitas')}.`,
    `- ${plural(d.selos.length, 'selo', 'selos')}${d.selos.length ? ': ' + d.selos.map((b) => `${String(b.trailName)} (${b.revokedAt ? 'cancelado' : 'válido'}, código ${String(b.code)})`).join('; ') : ''}.`,
    '',
    'Registros técnicos',
    `- ${plural(d.sessoesAtivas.length, 'sessão ativa (entrada em um aparelho)', 'sessões ativas (entradas em aparelhos)')}, com endereço de IP e navegador.`,
    `- ${plural(d.registrosDeAcesso.length, 'registro de acesso', 'registros de acesso')} (data, hora e IP de cada entrada), guardados por 6 meses por obrigação legal${lastAccess ? `; o último é de ${dataBR(typeof lastAccess === 'string' ? lastAccess : lastAccess.toISOString())}` : ''}.`,
    `- ${plural(d.auditoria.length, 'registro de auditoria ligado a você', 'registros de auditoria ligados a você')}.`,
    '',
    'O arquivo dados.json tem tudo isso em detalhe, em formato que serve para levar a outro lugar.',
    'Não incluímos sua senha (guardamos só um código que não permite ver a senha) nem códigos internos de sessão.',
    '',
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------------ */
/* Nota da missão                                                            */
/* ------------------------------------------------------------------------ */

type Json = Record<string, any>;

/** Remove o texto da missão `nodeId` de um estado de tentativa (resposta atual e respostas de entrada nas revisitas). Devolve se mudou algo. */
export function scrubMissionTextFromState(state: Json | null | undefined, nodeId: string): boolean {
  if (!state || typeof state !== 'object') return false;
  let changed = false;
  const ans = state.answers?.[nodeId];
  if (ans && typeof ans === 'object' && 'text' in ans) {
    delete ans.text;
    changed = true;
  }
  if (Array.isArray(state.path)) {
    for (const step of state.path) {
      if (step?.nodeId === nodeId && step.entryAnswer && typeof step.entryAnswer === 'object' && 'text' in step.entryAnswer) {
        delete step.entryAnswer.text;
        changed = true;
      }
    }
  }
  return changed;
}

/** Remove o texto da missão `nodeId` de um evento do aluno (intenção enviada, resultado devolvido e o estado copiado nele). */
export function scrubMissionTextFromEvent(ev: { nodeId: string; payload: Json; result: Json }, nodeId: string): boolean {
  let changed = false;
  if (ev.nodeId === nodeId && ev.payload && ev.payload.kind === 'mission' && 'note' in ev.payload) {
    delete ev.payload.note;
    changed = true;
  }
  if (ev.nodeId === nodeId && ev.result?.mission && typeof ev.result.mission === 'object' && ev.result.mission.note) {
    ev.result.mission.note = null;
    changed = true;
  }
  if (scrubMissionTextFromState(ev.result?.state, nodeId)) changed = true;
  return changed;
}

export interface MissionNoteDeletion {
  deleted: boolean;
  responseId: string;
  lessonId: string;
  nodeId: string;
  /** revisão depois de apagar (a mesma de antes se não havia nada a apagar) */
  revision: number;
  status: 'later' | 'done';
  updatedAt: Date;
  /** quantas cópias do texto (histórico, estado das tentativas, eventos) foram limpas além da nota principal */
  copiesCleaned: number;
}

/**
 * Apaga a nota "O que você percebeu?" de uma missão: zera `mission_responses.note`, apaga o histórico
 * (`mission_response_events`, que guarda cada versão do texto) e deixa um único evento novo SEM texto; limpa também
 * as cópias do texto no estado das tentativas e nos eventos da aula. O estado ("Já experimentei" / "Vou fazer depois")
 * e o selo não mudam. Registra `note.delete` em `audit_logs` sem o texto. Idempotente.
 */
export async function deleteMissionNote(
  db: Database,
  input: { enrollmentId: string; nodeId: string; userId: string; actorId?: string | null; via?: 'aluno' | 'script' },
): Promise<MissionNoteDeletion> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select()
      .from(s.missionResponses)
      .where(and(eq(s.missionResponses.enrollmentId, input.enrollmentId), eq(s.missionResponses.nodeId, input.nodeId), eq(s.missionResponses.userId, input.userId)))
      .for('update')
      .limit(1);
    if (!prev) throw new DomainError('NOT_FOUND', 'Não há registro desta missão.');
    return scrubMissionResponse(tx, prev, { actorId: input.actorId ?? input.userId, via: input.via ?? 'aluno' });
  });
}

async function scrubMissionResponse(tx: DbOrTx, prev: typeof s.missionResponses.$inferSelect, o: { actorId: string | null; via: 'aluno' | 'script' }): Promise<MissionNoteDeletion> {
  // 1) cópias fora de mission_responses
  let copies = 0;
  const attempts = await tx.select().from(s.lessonAttempts).where(and(eq(s.lessonAttempts.enrollmentId, prev.enrollmentId), eq(s.lessonAttempts.lessonId, prev.lessonId)));
  for (const a of attempts) {
    const state = structuredClone(a.state) as unknown as Json;
    if (scrubMissionTextFromState(state, prev.nodeId)) {
      await tx.update(s.lessonAttempts).set({ state: state as never }).where(eq(s.lessonAttempts.id, a.id));
      copies++;
    }
    const evs = await tx.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, a.id));
    for (const ev of evs) {
      const copy = { nodeId: ev.nodeId, payload: structuredClone(ev.payload) as Json, result: structuredClone(ev.result) as Json };
      if (scrubMissionTextFromEvent(copy, prev.nodeId)) {
        await tx.update(s.learnerEvents).set({ payload: copy.payload, result: copy.result }).where(eq(s.learnerEvents.id, ev.id));
        copies++;
      }
    }
  }
  const history = await tx.select({ id: s.missionResponseEvents.id, note: s.missionResponseEvents.note }).from(s.missionResponseEvents).where(eq(s.missionResponseEvents.responseId, prev.id));
  const historyWithText = history.filter((h) => h.note !== null).length;
  if (prev.note === null && historyWithText === 0 && copies === 0) {
    return { deleted: false, responseId: prev.id, lessonId: prev.lessonId, nodeId: prev.nodeId, revision: prev.revision, status: prev.status, updatedAt: prev.updatedAt, copiesCleaned: 0 };
  }

  // 2) a nota e o histórico
  const now = new Date();
  const revision = prev.revision + 1;
  await tx.update(s.missionResponses).set({ note: null, revision, updatedAt: now }).where(eq(s.missionResponses.id, prev.id));
  await tx.delete(s.missionResponseEvents).where(eq(s.missionResponseEvents.responseId, prev.id));
  await tx.insert(s.missionResponseEvents).values({ id: newId('mie'), responseId: prev.id, revision, status: prev.status, note: null, source: 'note_deleted', createdAt: now });
  await tx.insert(s.auditLogs).values({
    id: newId('aud'),
    actorId: o.actorId,
    action: 'note.delete',
    entityType: 'mission_response',
    entityId: prev.id,
    data: { userId: prev.userId, enrollmentId: prev.enrollmentId, lessonId: prev.lessonId, nodeId: prev.nodeId, via: o.via },
  });
  return { deleted: true, responseId: prev.id, lessonId: prev.lessonId, nodeId: prev.nodeId, revision, status: prev.status, updatedAt: now, copiesCleaned: copies + historyWithText };
}

export interface NoteTarget {
  responseId: string;
  enrollmentId: string;
  lessonId: string;
  nodeId: string;
  hasNote: boolean;
  revisions: number;
}

/** Missões da pessoa que casam com `<enrollmentId|lessonId>` (para `dados:apagar-nota`). */
export async function findMissionTargets(db: DbOrTx, userId: string, target: string): Promise<NoteTarget[]> {
  const rows = await db
    .select()
    .from(s.missionResponses)
    .where(and(eq(s.missionResponses.userId, userId), or(eq(s.missionResponses.enrollmentId, target), eq(s.missionResponses.lessonId, target))));
  const out: NoteTarget[] = [];
  for (const r of rows) {
    const ev = await db.select({ id: s.missionResponseEvents.id }).from(s.missionResponseEvents).where(eq(s.missionResponseEvents.responseId, r.id));
    out.push({ responseId: r.id, enrollmentId: r.enrollmentId, lessonId: r.lessonId, nodeId: r.nodeId, hasNote: r.note !== null, revisions: ev.length });
  }
  return out;
}

/** `dados:apagar-nota`: apaga a nota de todas as missões de `target` (matrícula ou aula) da pessoa. */
export async function eraseMissionNotesForUser(db: Database, input: { email: string; target: string; apply: boolean }) {
  assertTargetEmail(input.email, input.apply ? 'write' : 'read');
  const u = await findUserByEmail(db, input.email);
  if (!u) throw new DomainError('NOT_FOUND', 'Não há conta com este e-mail.');
  const targets = await findMissionTargets(db, u.id, input.target);
  if (targets.length === 0) throw new DomainError('NOT_FOUND', 'Nenhuma missão da pessoa casa com esse identificador (use o id da matrícula ou da aula).');
  if (!input.apply) return { applied: false, userId: u.id, targets, results: [] as MissionNoteDeletion[] };
  const results: MissionNoteDeletion[] = [];
  for (const t of targets) results.push(await deleteMissionNote(db, { enrollmentId: t.enrollmentId, nodeId: t.nodeId, userId: u.id, actorId: null, via: 'script' }));
  return { applied: true, userId: u.id, targets, results };
}

/* ------------------------------------------------------------------------ */
/* Encerrar e apagar a conta                                                 */
/* ------------------------------------------------------------------------ */

export const REMOVED_HOLDER_NAME = 'Titular removido a pedido';

export interface ErasureCounts {
  sessoes: number;
  matriculas: number;
  tentativasDeAula: number;
  eventos: number;
  evidencias: number;
  missoes: number;
  historicoDeMissoes: number;
  checagensDeTrilha: number;
  selosParaCancelarEAnonimizar: number;
  eventosPendentesDoOutbox: number;
  /** ficam, sem chave para a pessoa (obrigação legal / prestação de contas) */
  registrosDeAcessoMantidos: number;
  registrosDeAuditoriaMantidos: number;
}

export async function countFootprint(db: DbOrTx, userId: string): Promise<ErasureCounts> {
  const n = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0);
  const enrollmentIds = (await db.select({ id: s.enrollments.id }).from(s.enrollments).where(eq(s.enrollments.userId, userId))).map((r) => r.id);
  const attemptIds = enrollmentIds.length ? (await db.select({ id: s.lessonAttempts.id }).from(s.lessonAttempts).where(inArray(s.lessonAttempts.enrollmentId, enrollmentIds))).map((r) => r.id) : [];
  const missionIds = (await db.select({ id: s.missionResponses.id }).from(s.missionResponses).where(eq(s.missionResponses.userId, userId))).map((r) => r.id);
  return {
    sessoes: await n(db.select({ n: sql<number>`count(*)` }).from(s.session).where(eq(s.session.userId, userId))),
    matriculas: enrollmentIds.length,
    tentativasDeAula: attemptIds.length,
    eventos: attemptIds.length ? await n(db.select({ n: sql<number>`count(*)` }).from(s.learnerEvents).where(inArray(s.learnerEvents.attemptId, attemptIds))) : 0,
    evidencias: enrollmentIds.length ? await n(db.select({ n: sql<number>`count(*)` }).from(s.objectiveEvidence).where(inArray(s.objectiveEvidence.enrollmentId, enrollmentIds))) : 0,
    missoes: missionIds.length,
    historicoDeMissoes: missionIds.length ? await n(db.select({ n: sql<number>`count(*)` }).from(s.missionResponseEvents).where(inArray(s.missionResponseEvents.responseId, missionIds))) : 0,
    checagensDeTrilha: await n(db.select({ n: sql<number>`count(*)` }).from(s.trailCheckAttempts).where(eq(s.trailCheckAttempts.userId, userId))),
    selosParaCancelarEAnonimizar: await n(db.select({ n: sql<number>`count(*)` }).from(s.trailBadges).where(eq(s.trailBadges.userId, userId))),
    eventosPendentesDoOutbox: await n(db.select({ n: sql<number>`count(*)` }).from(s.outboxEvents).where(outboxOf(userId, enrollmentIds))),
    registrosDeAcessoMantidos: await n(db.select({ n: sql<number>`count(*)` }).from(s.accessLogs).where(eq(s.accessLogs.userId, userId))),
    registrosDeAuditoriaMantidos: await n(db.select({ n: sql<number>`count(*)` }).from(s.auditLogs).where(or(eq(s.auditLogs.actorId, userId), eq(s.auditLogs.entityId, userId), sql`${s.auditLogs.data}->>'userId' = ${userId}`))),
  };
}

function outboxOf(userId: string, enrollmentIds: string[]) {
  const byUser = sql`${s.outboxEvents.payload}->>'userId' = ${userId}`;
  return enrollmentIds.length ? or(byUser, inArray(sql<string>`${s.outboxEvents.payload}->>'enrollmentId'`, enrollmentIds))! : byUser;
}

export interface ErasureResult {
  mode: 'apagar' | 'encerrar';
  applied: boolean;
  userId: string;
  counts: ErasureCounts;
  /** ids dos selos tratados (cancelados e sem nome) */
  badgeIds: string[];
}

/** Só alunos: conta com papel de equipe (admin/autor/revisor) não é apagada por aqui (tem autoria ligada ao id). */
async function assertStudentOnly(db: DbOrTx, userId: string) {
  const ms = await db.select({ role: s.workspaceMemberships.role }).from(s.workspaceMemberships).where(eq(s.workspaceMemberships.userId, userId));
  const staff = ms.find((m) => m.role !== 'student');
  if (staff) throw new DomainError('FORBIDDEN', `A conta tem papel de equipe (${staff.role}); apague-a pelo painel, não por este script.`);
}

/**
 * `dados:apagar` (docs/legal/procedimento-direitos-do-titular.md, seção 5), em ordem, numa transação:
 * (a) cancela os selos (`revokedAt`) e troca `holderName` por "Titular removido a pedido" (o selo fica, sem ligação com a pessoa:
 * `trail_badges.user_id` vira `null` na exclusão); (b) apaga eventos do outbox da pessoa; (c) apaga a conta (a cascata leva sessões,
 * senha, matrículas, tentativas, eventos, evidências, missões e checagens); (d) mantém `audit_logs` e `access_logs`; (e) devolve o resumo.
 * Sem `apply`, só conta o que faria.
 */
export async function eraseUser(db: Database, input: { email: string; apply: boolean; actorId?: string | null; via?: string }): Promise<ErasureResult> {
  assertTargetEmail(input.email, input.apply ? 'write' : 'read');
  const u = await findUserByEmail(db, input.email);
  if (!u) throw new DomainError('NOT_FOUND', 'Não há conta com este e-mail.');
  await assertStudentOnly(db, u.id);
  const counts = await countFootprint(db, u.id);
  const badges = await db.select({ id: s.trailBadges.id, revokedAt: s.trailBadges.revokedAt }).from(s.trailBadges).where(eq(s.trailBadges.userId, u.id));
  const base = { mode: 'apagar' as const, userId: u.id, counts, badgeIds: badges.map((b) => b.id) };
  if (!input.apply) return { ...base, applied: false };

  await db.transaction(async (tx) => {
    const now = new Date();
    const enrollmentIds = (await tx.select({ id: s.enrollments.id }).from(s.enrollments).where(eq(s.enrollments.userId, u.id))).map((r) => r.id);
    for (const b of badges) {
      await tx.update(s.trailBadges).set({ revokedAt: b.revokedAt ?? now, holderName: REMOVED_HOLDER_NAME }).where(eq(s.trailBadges.id, b.id));
      await tx.insert(s.auditLogs).values({ id: newId('aud'), actorId: input.actorId ?? null, action: 'badge.revoke', entityType: 'trail_badge', entityId: b.id, data: { userId: u.id, motivo: 'exclusão da conta a pedido do titular', via: input.via ?? 'dados:apagar' } });
    }
    await tx.delete(s.outboxEvents).where(outboxOf(u.id, enrollmentIds));
    await tx.insert(s.auditLogs).values({
      id: newId('aud'),
      actorId: input.actorId ?? null,
      action: 'user.delete',
      entityType: 'user',
      entityId: u.id,
      data: { motivo: 'pedido do titular', via: input.via ?? 'dados:apagar', selosCancelados: base.badgeIds.length, matriculas: counts.matriculas },
    });
    await tx.delete(s.user).where(eq(s.user.id, u.id));
  });
  return { ...base, applied: true };
}

/** `dados:apagar --encerrar`: só marca a conta como encerrada (a rotina de retenção apaga depois do prazo, se ligada). */
export async function closeAccount(db: Database, input: { email: string; apply: boolean; reason?: s.AccountClosureReason; actorId?: string | null }): Promise<ErasureResult> {
  assertTargetEmail(input.email, input.apply ? 'write' : 'read');
  const u = await findUserByEmail(db, input.email);
  if (!u) throw new DomainError('NOT_FOUND', 'Não há conta com este e-mail.');
  await assertStudentOnly(db, u.id);
  const counts = await countFootprint(db, u.id);
  const base = { mode: 'encerrar' as const, userId: u.id, counts, badgeIds: [] as string[] };
  if (!input.apply) return { ...base, applied: false };
  await db.transaction(async (tx) => {
    await tx.insert(s.accountClosures).values({ userId: u.id, reason: input.reason ?? 'pedido_do_titular' }).onConflictDoNothing();
    await tx.insert(s.auditLogs).values({ id: newId('aud'), actorId: input.actorId ?? null, action: 'user.close', entityType: 'user', entityId: u.id, data: { userId: u.id, motivo: input.reason ?? 'pedido_do_titular' } });
  });
  return { ...base, applied: true };
}

/**
 * Apaga uma conta já encerrada, pela rotina de retenção (mesmo caminho de `eraseUser`, mas sem a guarda de e-mail de demonstração
 * por e-mail: a seleção já é por `account_closures`). Contas de demonstração e de equipe nunca são apagadas pela rotina.
 */
export async function eraseClosedAccountById(db: Database, userId: string): Promise<boolean> {
  const [u] = await db.select().from(s.user).where(eq(s.user.id, userId)).limit(1);
  if (!u) return false;
  if (u.email.endsWith('@demo.local') && !THROWAWAY_EMAIL.test(u.email)) return false;
  try {
    await assertStudentOnly(db, userId);
  } catch {
    return false;
  }
  const r = await eraseUser(db, { email: u.email, apply: true, actorId: null, via: 'retencao' });
  return r.applied;
}

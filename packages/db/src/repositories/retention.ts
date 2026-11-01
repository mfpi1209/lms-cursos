import { and, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { newId } from '../ids';
import * as s from '../schema';
import { monthsBefore, purgeAccessLogs } from './access';
import { eraseClosedAccountById } from './privacy';

/**
 * Rotina de retenção (docs/legal/pendencias.md, seções 4 e 11, item 5). Os prazos são PROPOSTAS `[A CONFIRMAR]` pelo
 * advogado: ficam em variáveis de ambiente, com estes padrões, para mudar sem código novo.
 *
 * Ligados por padrão (nada além do prazo em lei ou da proposta): sessões vencidas, outbox processado, auditoria e registros de acesso.
 * DESLIGADOS por padrão (o advogado ainda não confirmou): apagar contas encerradas e expirar selos.
 */
export interface RetentionConfig {
  sessionsDays: number;
  outboxDays: number;
  auditDays: number;
  /** Marco Civil, art. 15: no mínimo 6 meses; valores menores são elevados a 6 */
  accessLogMonths: number;
  closedAccounts: { enabled: boolean; months: number };
  badgeExpiry: { enabled: boolean; years: number };
  /** só conta e registra no log; não apaga nada */
  dryRun: boolean;
}

export const ACCESS_LOG_MIN_MONTHS = 6;

const num = (v: string | undefined, fallback: number, min = 1) => {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};
const flag = (v: string | undefined) => v !== undefined && /^(1|true|yes|sim|on)$/i.test(v.trim());

export function retentionConfigFromEnv(env: Record<string, string | undefined> = process.env): RetentionConfig {
  return {
    sessionsDays: num(env.RETENTION_SESSIONS_DAYS, 30),
    outboxDays: num(env.RETENTION_OUTBOX_DAYS, 30),
    auditDays: num(env.RETENTION_AUDIT_DAYS, 730),
    accessLogMonths: Math.max(ACCESS_LOG_MIN_MONTHS, num(env.RETENTION_ACCESS_LOG_MONTHS, ACCESS_LOG_MIN_MONTHS)),
    closedAccounts: { enabled: flag(env.RETENTION_CLOSED_ACCOUNTS_ENABLED), months: num(env.RETENTION_CLOSED_ACCOUNTS_MONTHS, 12) },
    badgeExpiry: { enabled: flag(env.RETENTION_BADGE_EXPIRY_ENABLED), years: num(env.RETENTION_BADGE_YEARS, 5) },
    dryRun: flag(env.RETENTION_DRY_RUN),
  };
}

export interface RetentionReport {
  at: string;
  dryRun: boolean;
  sessions: number;
  outbox: number;
  audit: number;
  accessLogs: number;
  /** `null` = desligado */
  closedAccounts: number | null;
  badgesExpired: number | null;
}

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/**
 * Executa uma vez. Com `dryRun`, só conta. Cada etapa é independente: uma falha numa não impede as outras (o erro sobe no final).
 * O relatório (só números) vai para `audit_logs` (`retention.run`) fora do dry-run.
 */
export async function runRetention(db: Database, cfg: RetentionConfig, now: Date = new Date()): Promise<RetentionReport> {
  const dry = cfg.dryRun;
  const report: RetentionReport = { at: now.toISOString(), dryRun: dry, sessions: 0, outbox: 0, audit: 0, accessLogs: 0, closedAccounts: null, badgesExpired: null };
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const countOrDelete = async <T extends { id: string }>(table: any, where: any, idCol: any): Promise<number> => {
    if (dry) {
      const [r] = await db.select({ n: sql<number>`count(*)` }).from(table).where(where);
      return Number(r?.n ?? 0);
    }
    const gone = (await db.delete(table).where(where).returning({ id: idCol })) as T[];
    return gone.length;
  };

  await step('sessions', async () => {
    report.sessions = await countOrDelete(s.session, lt(s.session.expiresAt, daysBefore(now, cfg.sessionsDays)), s.session.id);
  });
  await step('outbox', async () => {
    report.outbox = await countOrDelete(s.outboxEvents, and(isNotNull(s.outboxEvents.processedAt), lt(s.outboxEvents.processedAt, daysBefore(now, cfg.outboxDays))), s.outboxEvents.id);
  });
  await step('audit', async () => {
    report.audit = await countOrDelete(s.auditLogs, lt(s.auditLogs.createdAt, daysBefore(now, cfg.auditDays)), s.auditLogs.id);
  });
  await step('accessLogs', async () => {
    report.accessLogs = await purgeAccessLogs(db, monthsBefore(now, cfg.accessLogMonths), dry);
  });
  if (cfg.badgeExpiry.enabled) {
    await step('badgeExpiry', async () => {
      const cutoff = new Date(now);
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - cfg.badgeExpiry.years);
      const where = and(isNull(s.trailBadges.revokedAt), lt(s.trailBadges.issuedAt, cutoff));
      if (dry) {
        const [r] = await db.select({ n: sql<number>`count(*)` }).from(s.trailBadges).where(where);
        report.badgesExpired = Number(r?.n ?? 0);
      } else {
        const done = await db.update(s.trailBadges).set({ revokedAt: now }).where(where).returning({ id: s.trailBadges.id });
        report.badgesExpired = done.length;
      }
    });
  }
  if (cfg.closedAccounts.enabled) {
    await step('closedAccounts', async () => {
      const cutoff = monthsBefore(now, cfg.closedAccounts.months);
      const due = await db.select({ userId: s.accountClosures.userId }).from(s.accountClosures).where(lt(s.accountClosures.closedAt, cutoff));
      if (dry) {
        report.closedAccounts = due.length;
        return;
      }
      let n = 0;
      for (const d of due) if (await eraseClosedAccountById(db, d.userId)) n++;
      report.closedAccounts = n;
    });
  }

  if (!dry) {
    try {
      await db.insert(s.auditLogs).values({ id: newId('aud'), actorId: null, action: 'retention.run', entityType: 'system', entityId: 'retention', data: { ...report } as unknown as Record<string, unknown> });
    } catch (e) {
      errors.push(`audit-line: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) throw Object.assign(new Error(`retenção com falhas: ${errors.join(' | ')}`), { report });
  return report;
}

/** Quando a rotina rodou pela última vez (de verdade, fora do dry-run), pela linha de auditoria. */
export async function lastRetentionRun(db: Database): Promise<Date | null> {
  const [r] = await db
    .select({ at: sql<Date | null>`max(${s.auditLogs.createdAt})` })
    .from(s.auditLogs)
    .where(sql`${s.auditLogs.action} = 'retention.run'`);
  return r?.at ? new Date(r.at) : null;
}

import { isIP } from 'node:net';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import * as s from '../schema';

/**
 * Registro de acesso a aplicação (Marco Civil da Internet, Lei 12.965/2014, art. 15; Decreto 8.771/2016, art. 13).
 * Uma linha por login e por renovação diária da sessão. Sem rota HTTP de leitura: só `acesso:consultar` lê, e grava
 * `access_logs.read` em `audit_logs` a cada uso. Entrega a terceiros só por ordem judicial (ver pendencias.md, seção 8).
 */

export interface AccessLogInput {
  userId: string;
  ipAddress: string | null;
  sourcePort?: number | null;
  kind: s.AccessLogKind;
  at?: Date;
}

export async function recordAccessLog(db: DbOrTx, input: AccessLogInput): Promise<void> {
  await db.insert(s.accessLogs).values({
    id: newId('acc'),
    userId: input.userId,
    ipAddress: input.ipAddress,
    sourcePort: input.sourcePort ?? null,
    kind: input.kind,
    ...(input.at ? { occurredAt: input.at } : {}),
  });
}

export interface SafeLogOptions {
  /** tempo máximo esperando o banco (ms); passado dele, o login segue sem o registro */
  timeoutMs?: number;
  /** destino do aviso de falha (padrão: console.error) */
  onError?: (message: string) => void;
}

/**
 * Grava o registro SEM nunca lançar nem travar: uma falha do registro não pode impedir o login. Em caso de erro ou
 * demora, devolve `false` e avisa no log do servidor (sem IP nem dados da pessoa: só o id da conta e o motivo).
 */
export async function recordAccessLogSafe(db: DbOrTx, input: AccessLogInput, opts: SafeLogOptions = {}): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const warn = opts.onError ?? ((m: string) => console.error(m));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`sem resposta do banco em ${timeoutMs}ms`)), timeoutMs);
    });
    await Promise.race([recordAccessLog(db, input), timeout]);
    return true;
  } catch (e) {
    try {
      warn(`[access-log] falha ao gravar o registro de acesso (${input.kind}, conta ${input.userId}): ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      /* nunca propaga */
    }
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type AccessQueryBy = 'email' | 'ip' | 'usuario';

/** `<email|ip>` (ou um id de conta) → o tipo de consulta. */
export function classifyAccessQuery(term: string): AccessQueryBy {
  const t = term.trim();
  if (isIP(t)) return 'ip';
  if (t.includes('@')) return 'email';
  return 'usuario';
}

export interface AccessQueryResult {
  by: AccessQueryBy;
  /** conta consultada (quando por e-mail ou id) ou `null` por IP */
  userId: string | null;
  rows: Array<{ id: string; userId: string; ipAddress: string | null; sourcePort: number | null; kind: s.AccessLogKind; occurredAt: Date }>;
}

/**
 * Consulta os registros e grava SEMPRE uma linha `access_logs.read` em `audit_logs` (inventário de acessos aos registros,
 * Decreto 8.771/2016, art. 13, III), com o motivo (número do processo/ordem). Sem motivo, recusa.
 */
export async function queryAccessLogs(
  db: Database,
  input: { term: string; motivo: string; executor: string; since?: Date; limit?: number },
): Promise<AccessQueryResult> {
  const motivo = input.motivo.trim();
  if (!motivo) throw new Error('informe --motivo "<processo ou ordem judicial>"');
  const by = classifyAccessQuery(input.term);
  let userId: string | null = null;
  if (by === 'email') {
    const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, input.term.trim().toLowerCase())).limit(1);
    userId = u?.id ?? null;
  } else if (by === 'usuario') userId = input.term.trim();
  const where =
    by === 'ip'
      ? eq(s.accessLogs.ipAddress, input.term.trim())
      : userId
        ? eq(s.accessLogs.userId, userId)
        : sql`false`;
  const rows = await db
    .select()
    .from(s.accessLogs)
    .where(input.since ? and(where, gte(s.accessLogs.occurredAt, input.since)) : where)
    .orderBy(desc(s.accessLogs.occurredAt))
    .limit(input.limit ?? 1000);
  await db.insert(s.auditLogs).values({
    id: newId('aud'),
    actorId: null,
    action: 'access_logs.read',
    entityType: 'access_logs',
    entityId: by === 'ip' ? 'por-ip' : 'por-conta',
    data: { motivo, executor: input.executor, consultaPor: by, alvo: by === 'ip' ? input.term.trim() : userId, resultados: rows.length, ...(input.since ? { desde: input.since.toISOString() } : {}) },
  });
  return { by, userId, rows };
}

/** Subtrai `months` meses civis (Marco Civil: 6 meses, não 180 dias). */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export async function purgeAccessLogs(db: DbOrTx, olderThan: Date, dryRun = false): Promise<number> {
  if (dryRun) {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(s.accessLogs).where(lt(s.accessLogs.occurredAt, olderThan));
    return Number(r?.n ?? 0);
  }
  const gone = await db.delete(s.accessLogs).where(lt(s.accessLogs.occurredAt, olderThan)).returning({ id: s.accessLogs.id });
  return gone.length;
}

import { getDb, retention } from '@lms/db';

/**
 * Rotina diária de retenção de dados (docs/legal/pendencias.md, seções 4 e 11, item 5).
 * Prazos por variável de ambiente (padrões = propostas `[A CONFIRMAR]` pelo advogado):
 *   RETENTION_ENABLED                         (padrão: ligada em produção, NODE_ENV=production; em desenvolvimento só com 1; 0 desliga)
 *   RETENTION_DRY_RUN=0                       (1 só conta e registra no log; não apaga nada)
 *   RETENTION_SESSIONS_DAYS=30                sessões vencidas há mais de N dias
 *   RETENTION_OUTBOX_DAYS=30                  eventos do outbox já processados há mais de N dias
 *   RETENTION_AUDIT_DAYS=730                  registros de auditoria com mais de N dias (2 anos)
 *   RETENTION_ACCESS_LOG_MONTHS=6             registro de acesso (Marco Civil, art. 15): nunca abaixo de 6
 * DESLIGADOS por padrão (o advogado ainda não confirmou):
 *   RETENTION_CLOSED_ACCOUNTS_ENABLED=0       apagar contas encerradas (`dados:apagar --encerrar`) há mais de N meses
 *   RETENTION_CLOSED_ACCOUNTS_MONTHS=12
 *   RETENTION_BADGE_EXPIRY_ENABLED=0          cancelar selos emitidos há mais de N anos
 *   RETENTION_BADGE_YEARS=5
 * Execução: uma vez a cada 24 horas (a última execução de verdade fica em audit_logs, ação `retention.run`; reiniciar o worker não
 * dispara de novo), a primeira cerca de 1 minuto depois da subida.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60_000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;

export interface RetentionJobState {
  bootAt: number;
  /** última tentativa (ms); 0 = ainda não consultou o banco */
  lastRun: number;
}

export interface RetentionJobDeps {
  now: () => number;
  enabled: () => boolean;
  config: () => retention.RetentionConfig;
  lastRealRun: () => Promise<Date | null>;
  run: (cfg: retention.RetentionConfig) => Promise<retention.RetentionReport>;
  log: (m: string) => void;
  warn: (m: string) => void;
}

/** Ligada por padrão só em produção (a imagem do worker define NODE_ENV=production); em desenvolvimento, só com RETENTION_ENABLED=1. */
export function retentionEnabled(env: Record<string, string | undefined>): boolean {
  const v = env.RETENTION_ENABLED?.trim();
  if (v === undefined || v === '') return env.NODE_ENV === 'production';
  return !/^(0|false|no|nao|não|off)$/i.test(v);
}

export function newRetentionState(now = Date.now()): RetentionJobState {
  return { bootAt: now, lastRun: 0 };
}

export function defaultRetentionDeps(): RetentionJobDeps {
  return {
    now: () => Date.now(),
    enabled: () => retentionEnabled(process.env),
    config: () => retention.retentionConfigFromEnv(process.env),
    lastRealRun: () => retention.lastRetentionRun(getDb()),
    run: (cfg) => retention.runRetention(getDb(), cfg),
    log: (m) => console.log(m),
    warn: (m) => console.warn(m),
  };
}

export function describeReport(r: retention.RetentionReport): string {
  const verb = r.dryRun ? 'apagaria' : 'apagou';
  return (
    `${r.dryRun ? '[dry-run] ' : ''}${verb}: ${r.sessions} sessão(ões) vencida(s), ${r.outbox} evento(s) do outbox, ${r.audit} registro(s) de auditoria, ${r.accessLogs} registro(s) de acesso` +
    (r.closedAccounts === null ? '; contas encerradas: desligado' : `; contas encerradas: ${r.closedAccounts}`) +
    (r.badgesExpired === null ? '; expiração de selos: desligada' : `; selos expirados: ${r.badgesExpired}`)
  );
}

/** Chamado a cada volta do laço do worker; só faz algo quando a rotina está vencida. Nunca lança. */
export async function runRetentionIfDue(state: RetentionJobState, deps: RetentionJobDeps = defaultRetentionDeps()): Promise<boolean> {
  try {
    if (!deps.enabled()) return false;
    const now = deps.now();
    if (now - state.bootAt < STARTUP_DELAY_MS) return false;
    if (state.lastRun !== 0 && now - state.lastRun < DAY_MS) return false;
    const cfg = deps.config();
    if (state.lastRun === 0 && !cfg.dryRun) {
      // primeira checagem depois da subida: se já rodou nas últimas 24 horas (outro processo ou antes do reinício), espera
      const last = await deps.lastRealRun();
      if (last && now - last.getTime() < DAY_MS) {
        state.lastRun = last.getTime();
        return false;
      }
    }
    state.lastRun = now;
    try {
      const report = await deps.run(cfg);
      deps.log(`[retention] ${describeReport(report)}`);
      return true;
    } catch (e) {
      // uma etapa falhou: tenta de novo em 1 hora (as outras etapas já rodaram)
      state.lastRun = now - DAY_MS + RETRY_AFTER_FAILURE_MS;
      deps.warn(`[retention] ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  } catch (e) {
    try {
      deps.warn(`[retention] erro ao agendar: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      /* nunca propaga */
    }
    return false;
  }
}

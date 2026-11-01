import { describe, expect, it } from 'vitest';
import { retention } from '@lms/db';
import { describeReport, newRetentionState, retentionEnabled, runRetentionIfDue, type RetentionJobDeps } from '../src/retention';

const report = (over: Partial<retention.RetentionReport> = {}): retention.RetentionReport => ({ at: 'x', dryRun: false, sessions: 3, outbox: 2, audit: 1, accessLogs: 4, closedAccounts: null, badgesExpired: null, ...over });

function deps(over: Partial<RetentionJobDeps> & { env?: NodeJS.ProcessEnv } = {}) {
  let t = 1_000_000;
  const logs: string[] = [];
  const warns: string[] = [];
  let runs = 0;
  const d: RetentionJobDeps = {
    now: () => t,
    enabled: () => true,
    config: () => retention.retentionConfigFromEnv(over.env ?? {}),
    lastRealRun: async () => null,
    run: async () => (runs++, report()),
    log: (m) => logs.push(m),
    warn: (m) => warns.push(m),
    ...over,
  };
  return { d, logs, warns, advance: (ms: number) => (t += ms), runs: () => runs };
}

describe('rotina de retenção do worker', () => {
  it('espera a subida, roda uma vez e só volta depois de 24 horas', async () => {
    const { d, advance, runs, logs } = deps();
    const state = newRetentionState(1_000_000);
    expect(await runRetentionIfDue(state, d)).toBe(false); // recém-subiu
    advance(61_000);
    expect(await runRetentionIfDue(state, d)).toBe(true);
    expect(logs[0]).toContain('apagou: 3 sessão(ões) vencida(s), 2 evento(s) do outbox, 1 registro(s) de auditoria, 4 registro(s) de acesso');
    expect(logs[0]).toContain('contas encerradas: desligado');
    advance(3600_000);
    expect(await runRetentionIfDue(state, d)).toBe(false);
    advance(24 * 3600_000);
    expect(await runRetentionIfDue(state, d)).toBe(true);
    expect(runs()).toBe(2);
  });

  it('se já rodou nas últimas 24 horas (antes do reinício), não roda de novo', async () => {
    const { d, advance, runs } = deps({ lastRealRun: async () => new Date(1_000_000 + 61_000 - 3600_000) });
    const state = newRetentionState(1_000_000);
    advance(61_000);
    expect(await runRetentionIfDue(state, d)).toBe(false);
    expect(runs()).toBe(0);
  });

  it('padrão: ligada em produção, desligada em desenvolvimento (não mexe no banco local) a menos que RETENTION_ENABLED=1', () => {
    expect(retentionEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(retentionEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(retentionEnabled({})).toBe(false);
    expect(retentionEnabled({ NODE_ENV: 'development', RETENTION_ENABLED: '1' })).toBe(true);
    expect(retentionEnabled({ NODE_ENV: 'production', RETENTION_ENABLED: '0' })).toBe(false);
  });

  it('RETENTION_ENABLED desligado: nada acontece', async () => {
    const { d, advance, runs } = deps({ enabled: () => false });
    advance(10 * 60_000);
    expect(await runRetentionIfDue(newRetentionState(1_000_000), d)).toBe(false);
    expect(runs()).toBe(0);
  });

  it('dry-run registra "apagaria" e não consulta nem grava a última execução', async () => {
    let consulted = false;
    const { d, advance, logs } = deps({ env: { RETENTION_DRY_RUN: '1' }, lastRealRun: async () => ((consulted = true), null), run: async () => report({ dryRun: true }) });
    advance(61_000);
    expect(await runRetentionIfDue(newRetentionState(1_000_000), d)).toBe(true);
    expect(consulted).toBe(false);
    expect(logs[0]).toContain('[dry-run] apagaria:');
  });

  it('falha numa etapa: avisa, não lança e tenta de novo em uma hora', async () => {
    let fail = true;
    const { d, advance, warns, runs } = deps({ run: async () => { if (fail) throw new Error('retenção com falhas: audit: x'); return report(); } });
    const state = newRetentionState(1_000_000);
    advance(61_000);
    expect(await runRetentionIfDue(state, d)).toBe(false);
    expect(warns[0]).toContain('retenção com falhas');
    advance(30 * 60_000);
    expect(await runRetentionIfDue(state, d)).toBe(false);
    fail = false;
    advance(31 * 60_000);
    expect(await runRetentionIfDue(state, d)).toBe(true);
    expect(runs()).toBe(0); // o contador só conta as execuções que chegaram ao fim
  });

  it('contas encerradas e selos aparecem no relatório só quando ligados; erro no banco nunca escapa', async () => {
    expect(describeReport(report({ closedAccounts: 2, badgesExpired: 1 }))).toContain('contas encerradas: 2; selos expirados: 1');
    const { d, advance } = deps({ lastRealRun: async () => { throw new Error('banco fora'); } });
    advance(61_000);
    await expect(runRetentionIfDue(newRetentionState(1_000_000), d)).resolves.toBe(false);
  });
});

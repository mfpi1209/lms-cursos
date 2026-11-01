import { access } from '@lms/db';
import { resolveClientIp, resolveClientPort, type ClientIpConfig } from './client-ip';

/**
 * Registro de acesso do Marco Civil (Lei 12.965/2014, art. 15), gravado pelo fluxo de autenticação:
 * `login` quando a sessão é criada e `renew` quando o Better Auth renova a sessão (no máximo uma vez por dia de uso).
 *
 * Regra de ouro: uma falha aqui NUNCA pode impedir o login. Os ganchos nunca lançam: erro ao resolver o IP, erro de banco
 * (tabela ausente, conexão caída) e demora são engolidos e avisados no log do servidor (`recordAccessLogSafe`).
 * Sem rota HTTP de leitura; a consulta é só pelo script `acesso:consultar`.
 */
type AccessLogInput = access.AccessLogInput;
type Ctx = { headers?: Headers; request?: { headers?: Headers } } | null | undefined;
type SessionRow = { userId?: unknown } & Record<string, unknown>;

export interface AccessLogHookDeps {
  config: ClientIpConfig;
  /** grava e devolve se gravou; precisa ser seguro (não lançar). Padrão: `access.recordAccessLogSafe` no banco do processo. */
  record: (input: AccessLogInput) => Promise<boolean>;
  warn?: (message: string) => void;
}

export function createAccessLogHooks(deps: AccessLogHookDeps) {
  const warn = deps.warn ?? ((m: string) => console.error(m));
  const make = (kind: AccessLogInput['kind']) => async (session: SessionRow, ctx: Ctx): Promise<void> => {
    try {
      const userId = typeof session?.userId === 'string' ? session.userId : null;
      if (!userId) return;
      const headers = ctx?.headers ?? ctx?.request?.headers ?? new Headers();
      const ip = resolveClientIp(headers, deps.config);
      if (!ip) warn(`[access-log] não foi possível determinar o IP do cliente (${kind}, conta ${userId}); confira TRUSTED_PROXIES e CLIENT_IP_HEADERS`);
      await deps.record({ userId, ipAddress: ip, sourcePort: resolveClientPort(headers, deps.config), kind });
    } catch (e) {
      try {
        warn(`[access-log] erro inesperado (${kind}): ${e instanceof Error ? e.message : String(e)}`);
      } catch {
        /* nunca propaga */
      }
    }
  };
  return { session: { create: { after: make('login') }, update: { after: make('renew') } } };
}

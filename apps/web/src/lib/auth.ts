import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { access, getDb, schema } from '@lms/db';
import { createAccessLogHooks } from './access-log';
import { clientIpConfigFromEnv, invalidTrustedProxies } from './client-ip';

/**
 * Better Auth com sessão em banco (Drizzle/PostgreSQL). Papéis não ficam no
 * usuário: vêm de workspace_memberships e são verificados no backend.
 */
// IP do cliente atrás do proxy (Traefik no EasyPanel): ver lib/client-ip.ts. A mesma configuração vale para
// `session.ip_address` (Better Auth) e para o registro de acesso do Marco Civil.
const ipConfig = clientIpConfigFromEnv();
const badProxies = invalidTrustedProxies(ipConfig);
if (badProxies.length) console.warn(`[auth] TRUSTED_PROXIES tem entradas inválidas (ignoradas): ${badProxies.join(', ')}`);

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // origens extras aceitas no login (ex.: o IP da máquina na rede local, para testar no celular); lista separada por vírgula
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ? { trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
  // cadastro público desligado: contas são criadas por administradores/seed (evita pré-registro de e-mails da equipe)
  emailAndPassword: { enabled: true, minPasswordLength: 8, disableSignUp: true },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  advanced: { ipAddress: { ipAddressHeaders: ipConfig.headers, ...(ipConfig.trustedProxies.length ? { trustedProxies: ipConfig.trustedProxies } : {}) } },
  // registro de acesso (Marco Civil, art. 15): uma linha por login e por renovação diária; falha aqui nunca bloqueia o login
  databaseHooks: createAccessLogHooks({ config: ipConfig, record: (input) => access.recordAccessLogSafe(getDb(), input) }),
  plugins: [nextCookies()],
});

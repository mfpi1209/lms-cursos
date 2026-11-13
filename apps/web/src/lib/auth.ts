import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins/magic-link';
import { magicLinkEmail, resetPasswordEmail, sendEmail } from '@lms/email';
import { access, getDb, schema } from '@lms/db';
import { createAccessLogHooks } from './access-log';
import { clientIpConfigFromEnv, invalidTrustedProxies } from './client-ip';
import { authRateLimit, emailLimits, magicLinkCapture, magicLinkTtlHours, RESET_TOKEN_TTL_SECONDS, toConfirmationUrl } from './auth-access';

/**
 * Better Auth com sessão em banco (Drizzle/PostgreSQL). Papéis não ficam no
 * usuário: vêm de workspace_memberships e são verificados no backend.
 */
// IP do cliente atrás do proxy (Traefik no EasyPanel): ver lib/client-ip.ts. A mesma configuração vale para
// `session.ip_address` (Better Auth) e para o registro de acesso do Marco Civil.
const ipConfig = clientIpConfigFromEnv();
const badProxies = invalidTrustedProxies(ipConfig);
if (badProxies.length) console.warn(`[auth] TRUSTED_PROXIES tem entradas inválidas (ignoradas): ${badProxies.join(', ')}`);

// limites por e-mail (memória do processo); o racional dos limites por IP está em auth-access.ts
const sendLimiter = emailLimits.send();
const signInLimiter = emailLimits.signIn();
const logFail = (what: string) => (e: unknown) => console.error(`[auth] falha ao enviar ${what}:`, e instanceof Error ? e.message : 'erro');

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
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    disableSignUp: true,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    // quem recupera a senha perde as sessões abertas (se o acesso foi roubado, o ladrão sai)
    revokeSessionsOnPasswordReset: true,
    // `user` só existe para e-mail cadastrado (o Better Auth não chama isto para os demais). Não esperamos o envio:
    // o tempo de resposta é o mesmo com ou sem conta, e a resposta nunca diz se o e-mail existe.
    sendResetPassword: async ({ user, url }) => {
      if (!sendLimiter.take(`reset:${user.email.toLowerCase()}`)) return;
      void sendEmail(resetPasswordEmail({ to: user.email, url, ttlMinutes: RESET_TOKEN_TTL_SECONDS / 60 })).catch(logFail('recuperação de senha'));
    },
  },
  rateLimit: authRateLimit,
  hooks: {
    // força bruta distribuída: a conta tem seu próprio limite, de qualquer IP (o limite por IP fica em auth-access.ts)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
      if (email && !signInLimiter.take(email)) throw new APIError('TOO_MANY_REQUESTS', { message: 'Muitas tentativas. Aguarde alguns minutos.' });
    }),
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  advanced: { ipAddress: { ipAddressHeaders: ipConfig.headers, ...(ipConfig.trustedProxies.length ? { trustedProxies: ipConfig.trustedProxies } : {}) } },
  // registro de acesso (Marco Civil, art. 15): uma linha por login e por renovação diária; falha aqui nunca bloqueia o login
  databaseHooks: createAccessLogHooks({ config: ipConfig, record: (input) => access.recordAccessLogSafe(getDb(), input) }),
  plugins: [
    magicLink({
      expiresIn: magicLinkTtlHours() * 3600,
      // só quem já tem conta: o link de um e-mail desconhecido é recusado na conferência (sem cadastro pelo login)
      disableSignUp: true,
      sendMagicLink: async ({ email, url: pluginUrl }, ctx) => {
        // o aluno recebe a página de confirmação, não o endereço que consome o token (scanners de e-mail abrem links)
        const url = toConfirmationUrl(pluginUrl);
        // auxiliar para a API de integração: guarda a URL e não envia nada (ver server/magic-link.ts)
        const capture = magicLinkCapture.getStore();
        if (capture) {
          capture.url = url;
          return;
        }
        // e-mail desconhecido: não envia e não avisa (a resposta é sempre "ok")
        const found = await ctx?.context.internalAdapter.findUserByEmail(email);
        if (!found?.user) return;
        if (!sendLimiter.take(`magic:${email.toLowerCase()}`)) return;
        void sendEmail(magicLinkEmail({ to: email, url, ttlHours: magicLinkTtlHours() })).catch(logFail('link de acesso'));
      },
    }),
    nextCookies(),
  ],
});

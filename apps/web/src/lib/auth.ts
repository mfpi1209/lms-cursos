import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb, schema } from '@lms/db';

/**
 * Better Auth com sessão em banco (Drizzle/PostgreSQL). Papéis não ficam no
 * usuário: vêm de workspace_memberships e são verificados no backend.
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // cadastro público desligado: contas são criadas por administradores/seed (evita pré-registro de e-mails da equipe)
  emailAndPassword: { enabled: true, minPasswordLength: 8, disableSignUp: true },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  plugins: [nextCookies()],
});

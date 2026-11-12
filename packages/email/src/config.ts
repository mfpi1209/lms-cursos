import type { EmailConfig, EmailTransportName } from './types';

const DEFAULT_FROM = 'DNA Work <nao-responda@localhost>';

/** Lê a configuração do ambiente. Transporte desconhecido cai em `log` (nunca derruba o app por causa de e-mail). */
export function emailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const raw = (env.EMAIL_TRANSPORT ?? 'log').trim().toLowerCase();
  const transport: EmailTransportName = raw === 'smtp' || raw === 'resend' ? raw : 'log';
  const production = env.NODE_ENV === 'production';
  return {
    transport,
    from: env.EMAIL_FROM?.trim() || DEFAULT_FROM,
    smtpUrl: env.SMTP_URL?.trim() || undefined,
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    production,
    // em produção o link inteiro nunca vai para o log, mesmo que a variável esteja ligada
    logFullLinks: !production && env.EMAIL_LOG_FULL_LINKS === '1',
  };
}

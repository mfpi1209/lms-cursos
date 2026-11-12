export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailTransportName = 'log' | 'smtp' | 'resend';

export interface EmailConfig {
  transport: EmailTransportName;
  from: string;
  smtpUrl?: string;
  resendApiKey?: string;
  production: boolean;
  /** só vale fora de produção: mostra o link inteiro no log para o desenvolvedor clicar */
  logFullLinks: boolean;
}

import nodemailer from 'nodemailer';
import { emailConfigFromEnv } from './config';
import { redactSecrets } from './redact';
import type { EmailConfig, EmailMessage } from './types';

const MAX_KEPT = 50;
const sent: EmailMessage[] = [];
let warnedLogInProduction = false;

/** Últimas mensagens do transporte `log` (para testes). Em produção nada é guardado em memória. */
export function getSentEmails(): readonly EmailMessage[] {
  return sent;
}
export function clearSentEmails(): void {
  sent.length = 0;
}

function keep(message: EmailMessage, config: EmailConfig) {
  if (config.production) return;
  sent.push(message);
  if (sent.length > MAX_KEPT) sent.shift();
}

async function sendResend(config: EmailConfig, m: EmailMessage): Promise<void> {
  if (!config.resendApiKey) throw new Error('RESEND_API_KEY não definida (EMAIL_TRANSPORT=resend)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend recusou o envio (HTTP ${res.status})`);
}

async function sendSmtp(config: EmailConfig, m: EmailMessage): Promise<void> {
  if (!config.smtpUrl) throw new Error('SMTP_URL não definida (EMAIL_TRANSPORT=smtp)');
  const transporter = nodemailer.createTransport(config.smtpUrl);
  try {
    await transporter.sendMail({ from: config.from, to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) });
  } finally {
    transporter.close();
  }
}

function sendLog(config: EmailConfig, m: EmailMessage): void {
  if (config.production && !warnedLogInProduction) {
    warnedLogInProduction = true;
    console.warn('[email] EMAIL_TRANSPORT=log em produção: as mensagens NÃO são entregues. Configure smtp ou resend.');
  }
  const body = config.logFullLinks ? m.text : redactSecrets(m.text);
  console.log(`[email] para=${m.to} assunto="${m.subject}"\n${body}`);
}

/**
 * Envia um e-mail pelo transporte escolhido em `EMAIL_TRANSPORT` (`log` padrão, `smtp` ou `resend`).
 * Erros de SMTP/Resend sobem para quem chamou; as mensagens de erro nunca levam o conteúdo do e-mail.
 */
export async function sendEmail(message: EmailMessage, config: EmailConfig = emailConfigFromEnv()): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+$/.test(message.to)) throw new Error('Destinatário inválido');
  if (config.transport === 'resend') await sendResend(config, message);
  else if (config.transport === 'smtp') await sendSmtp(config, message);
  else {
    sendLog(config, message);
    keep(message, config);
  }
}

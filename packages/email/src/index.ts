export { sendEmail, getSentEmails, clearSentEmails } from './transport';
export { emailConfigFromEnv } from './config';
export { redactSecrets } from './redact';
export { magicLinkEmail, resetPasswordEmail } from './templates';
export type { EmailMessage, EmailConfig, EmailTransportName } from './types';

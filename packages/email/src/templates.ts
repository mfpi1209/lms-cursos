import type { EmailMessage } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, intro: string, button: string, url: string, outro: string): { text: string; html: string } {
  const text = `${title}\n\n${intro}\n\n${button}: ${url}\n\n${outro}\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;line-height:1.5">
<h2 style="margin:0 0 12px">${esc(title)}</h2>
<p>${esc(intro)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${esc(button)}</a></p>
<p style="font-size:13px;color:#555">Se o botão não abrir, copie este endereço no navegador:<br>${esc(url)}</p>
<p style="font-size:13px;color:#555">${esc(outro)}</p>
</div>`;
  return { text, html };
}

function validade(horas: number): string {
  if (horas === 1) return '1 hora';
  if (horas % 24 === 0) return horas === 24 ? '1 dia' : `${horas / 24} dias`;
  return `${horas} horas`;
}

export function magicLinkEmail(input: { to: string; url: string; ttlHours: number }): EmailMessage {
  const { text, html } = layout(
    'Seu link de acesso',
    `Clique no botão para entrar na plataforma. O link vale por ${validade(input.ttlHours)} e só funciona uma vez.`,
    'Entrar agora',
    input.url,
    'Não foi você que pediu? É só ignorar este e-mail. Ninguém entra sem clicar no link.',
  );
  return { to: input.to, subject: 'Seu link para entrar', text, html };
}

export function resetPasswordEmail(input: { to: string; url: string; ttlMinutes: number }): EmailMessage {
  const { text, html } = layout(
    'Crie uma nova senha',
    `Clique no botão para escolher uma senha nova. O link vale por ${input.ttlMinutes} minutos e só funciona uma vez.`,
    'Criar nova senha',
    input.url,
    'Não foi você que pediu? Ignore este e-mail: sua senha continua a mesma.',
  );
  return { to: input.to, subject: 'Nova senha de acesso', text, html };
}

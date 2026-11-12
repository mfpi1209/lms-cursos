import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSentEmails, emailConfigFromEnv, getSentEmails, magicLinkEmail, redactSecrets, resetPasswordEmail, sendEmail } from '../src';

const link = 'https://app.exemplo.com/api/auth/magic-link/verify?token=SEGREDO123abc&callbackURL=%2Faprender';
const reset = 'https://app.exemplo.com/api/auth/reset-password/SEGREDO456xyz?callbackURL=%2Fredefinir-senha';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSentEmails();
});

describe('configuração', () => {
  it('padrão é log; valor desconhecido cai em log', () => {
    expect(emailConfigFromEnv({}).transport).toBe('log');
    expect(emailConfigFromEnv({ EMAIL_TRANSPORT: 'pombo' }).transport).toBe('log');
    expect(emailConfigFromEnv({ EMAIL_TRANSPORT: 'SMTP' }).transport).toBe('smtp');
    expect(emailConfigFromEnv({ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: 'a@b.c' })).toMatchObject({ transport: 'resend', from: 'a@b.c' });
  });
  it('link inteiro no log só fora de produção', () => {
    expect(emailConfigFromEnv({ EMAIL_LOG_FULL_LINKS: '1' }).logFullLinks).toBe(true);
    expect(emailConfigFromEnv({ EMAIL_LOG_FULL_LINKS: '1', NODE_ENV: 'production' }).logFullLinks).toBe(false);
  });
});

describe('transporte log', () => {
  it('não vaza a parte secreta do link e guarda a mensagem em memória', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail(magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 72 }), emailConfigFromEnv({}));
    const printed = out.mock.calls.flat().join('\n');
    expect(printed).toContain('a@b.com');
    expect(printed).not.toContain('SEGREDO123abc');
    expect(getSentEmails()[0]?.text).toContain('SEGREDO123abc');
  });
  it('recuperação de senha também sai sem o token', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail(resetPasswordEmail({ to: 'a@b.com', url: reset, ttlMinutes: 60 }), emailConfigFromEnv({}));
    expect(out.mock.calls.flat().join('\n')).not.toContain('SEGREDO456xyz');
  });
  it('em produção o link nunca vai ao log, mesmo com a variável ligada, e nada fica em memória', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await sendEmail(magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 72 }), emailConfigFromEnv({ NODE_ENV: 'production', EMAIL_LOG_FULL_LINKS: '1' }));
    expect(out.mock.calls.flat().join('\n')).not.toContain('SEGREDO123abc');
    expect(getSentEmails()).toHaveLength(0);
  });
  it('fora de produção com EMAIL_LOG_FULL_LINKS=1 mostra o link inteiro', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail(magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 72 }), emailConfigFromEnv({ EMAIL_LOG_FULL_LINKS: '1' }));
    expect(out.mock.calls.flat().join('\n')).toContain('SEGREDO123abc');
  });
  it('redactSecrets cobre os dois formatos', () => {
    expect(redactSecrets(`${link} ${reset}`)).not.toMatch(/SEGREDO/);
  });
});

describe('transporte resend', () => {
  it('faz POST HTTPS com a chave e o corpo certos', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cfg = emailConfigFromEnv({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: 'DNA <no@dna.com>' });
    await sendEmail(magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 24 }), cfg);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_x');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'DNA <no@dna.com>', to: ['a@b.com'] });
  });
  it('erro de HTTP sobe sem expor o conteúdo; sem chave também falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const m = magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 24 });
    await expect(sendEmail(m, emailConfigFromEnv({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'k' }))).rejects.toThrow(/403/);
    await expect(sendEmail(m, emailConfigFromEnv({ EMAIL_TRANSPORT: 'resend' }))).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe('transporte smtp e validações', () => {
  it('sem SMTP_URL falha com mensagem clara', async () => {
    await expect(sendEmail(magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 24 }), emailConfigFromEnv({ EMAIL_TRANSPORT: 'smtp' }))).rejects.toThrow(/SMTP_URL/);
  });
  it('destinatário inválido é recusado', async () => {
    await expect(sendEmail({ to: 'sem-arroba', subject: 's', text: 't' })).rejects.toThrow(/inválido/);
  });
});

describe('modelos', () => {
  it('texto simples, em português, com o link e a validade', () => {
    const m = magicLinkEmail({ to: 'a@b.com', url: link, ttlHours: 72 });
    expect(m.text).toContain(link);
    expect(m.text).toContain('3 dias');
    expect(m.html).toContain('href=');
    expect(resetPasswordEmail({ to: 'a@b.com', url: reset, ttlMinutes: 60 }).text).toContain('60 minutos');
  });
  it('escapa HTML na versão html', () => {
    const m = magicLinkEmail({ to: 'a@b.com', url: 'https://x.com/?a="><script>', ttlHours: 1 });
    expect(m.html).not.toContain('<script>');
  });
});

import { AsyncLocalStorage } from 'node:async_hooks';

/** Para onde o aluno vai depois de entrar pelo link mágico, e para onde voltam os links que falham. */
export const MAGIC_LINK_CALLBACK = '/aprender';
export const MAGIC_LINK_ERROR_CALLBACK = '/login?erro=link';
export const RESET_PASSWORD_PAGE = '/redefinir-senha';
/** Validade do link de recuperação de senha (padrão do Better Auth: 1 hora). */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

/** Validade do link mágico em horas (`MAGIC_LINK_TTL_HOURS`, padrão 72 h: quem chega pelo WhatsApp pode abrir dias depois). */
export function magicLinkTtlHours(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MAGIC_LINK_TTL_HOURS);
  return Number.isFinite(n) && n > 0 && n <= 24 * 30 ? n : 72;
}

/**
 * Captura do link: o auxiliar `createMagicLinkUrl` roda o endpoint do próprio plugin (mesmo token, mesma validade,
 * mesmo registro em `verification`) dentro deste contexto; `sendMagicLink` vê `capture` e guarda a URL em vez de enviar.
 */
export interface MagicLinkCapture {
  url?: string;
}
export const magicLinkCapture = new AsyncLocalStorage<MagicLinkCapture>();

/** Contador em memória por chave, janela deslizante simples. Uma instância do web basta; reinício zera (aceitável). */
export class KeyedLimiter {
  private hits = new Map<string, { count: number; start: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  /** Registra uma tentativa; devolve false quando passou do limite. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 20000) this.prune(now);
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      this.hits.set(key, { count: 1, start: now });
      return true;
    }
    if (h.count >= this.max) return false;
    h.count += 1;
    return true;
  }
  private prune(now: number) {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
  }
}

/** Limites por endereço de e-mail (independentes do IP, que o Better Auth já conta). */
export const emailLimits = {
  /** pedidos de link mágico ou de recuperação: 3 e-mails por endereço a cada 15 min (a vítima de spam recebe no máximo isso) */
  send: () => new KeyedLimiter(3, 15 * 60 * 1000),
  /** tentativas de senha por e-mail: 10 a cada 5 min, de qualquer IP (barra força bruta distribuída) */
  signIn: () => new KeyedLimiter(10, 5 * 60 * 1000),
};

/**
 * Limites do Better Auth por IP (chave = IP + caminho; só valem em produção, que é o padrão do Better Auth).
 *
 * Por que não os padrões: o Better Auth limita `/sign-in/*` a 3 por 10 s e a recuperação de senha a 3 por minuto, por IP.
 * Um laboratório de informática da instituição sai pelo mesmo IP, com dezenas de alunos entrando juntos no início da aula;
 * com o padrão, a partir do 4º aluno o login falharia com 429. Os valores abaixo comportam uma turma (30 a 40 alunos)
 * e continuam contra força bruta porque:
 *  - o que protege a conta é o limite POR E-MAIL (`emailLimits`, 10 senhas a cada 5 min, de qualquer IP);
 *  - o limite por IP só impede um único endereço de testar muitas contas por minuto (30 senhas/min);
 *  - links mágicos e de recuperação têm token aleatório longo (32 e 24 caracteres): adivinhar é inviável, então o
 *    limite deles existe só para segurar abuso e custo (e-mails em massa), não para proteger o token;
 *  - envio de e-mail: 20 pedidos/min por IP (uma turma pedindo link junta) e 3 por endereço a cada 15 min.
 * Armazenamento: memória (o web roda com 1 réplica; sem tabela extra, pois não há migration nesta entrega).
 */
export const authRateLimit = {
  customRules: {
    '/sign-in/email': { window: 60, max: 30 },
    '/sign-in/magic-link': { window: 60, max: 20 },
    '/magic-link/verify': { window: 60, max: 60 },
    '/request-password-reset': { window: 60, max: 20 },
    '/reset-password': { window: 60, max: 20 },
  },
} as const;

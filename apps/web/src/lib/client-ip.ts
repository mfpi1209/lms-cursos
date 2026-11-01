import { isIP } from 'node:net';

/**
 * IP do cliente atrás de proxy reverso (EasyPanel/Traefik). Mesma regra do Better Auth para `session.ip_address`
 * (a configuração abaixo também é passada a ele em `lib/auth.ts`), para o registro de acesso e a sessão concordarem.
 *
 * Por que importa: o cabeçalho `X-Forwarded-For` é escrito por quem fala com o servidor. Sem lista de proxies de confiança,
 * só um valor único é aceito (uma cadeia "a, b" é ambígua e vira `null`). Com `TRUSTED_PROXIES`, a cadeia é lida da direita
 * para a esquerda, pulando os proxies de confiança; o primeiro endereço que não é de proxy é o cliente. Nunca confie na
 * ponta esquerda sem isso: ela é falsificável pelo próprio cliente.
 *
 * Variáveis de ambiente:
 * - `TRUSTED_PROXIES`: IPs ou CIDRs dos proxies à frente do app (ex.: a rede do Traefik no EasyPanel), separados por vírgula.
 *   Use o endereço/sub-rede real do proxy, não uma faixa privada larga que inclua clientes.
 * - `CLIENT_IP_HEADERS`: cabeçalhos a consultar, em ordem (padrão `x-forwarded-for`; atrás do Cloudflare, `cf-connecting-ip,x-forwarded-for`).
 * - `CLIENT_PORT_HEADER`: cabeçalho com a porta de origem, se o proxy a repassar (vazio por padrão; `X-Forwarded-Port` NÃO serve:
 *   é a porta do servidor, não a do cliente).
 */
type Env = Record<string, string | undefined>;

export interface ClientIpConfig {
  headers: string[];
  trustedProxies: string[];
  portHeader: string | null;
}

export function clientIpConfigFromEnv(env: Env = process.env): ClientIpConfig {
  const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const headers = list(env.CLIENT_IP_HEADERS).map((h) => h.toLowerCase());
  return {
    headers: headers.length ? headers : ['x-forwarded-for'],
    trustedProxies: list(env.TRUSTED_PROXIES),
    portHeader: env.CLIENT_PORT_HEADER?.trim().toLowerCase() || null,
  };
}

/* --- IP/CIDR --- */

function expandV6(ip: string): number[] | null {
  if (isIP(ip) !== 6) return null;
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // ::ffff:a.b.c.d (e outros v4 embutidos) viram dois grupos hexadecimais
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[2]!.split('.').map(Number);
    s = `${v4[1]}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = b === null ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g, 16));
}

function toBytes(ip: string): Uint8Array | null {
  const kind = isIP(ip);
  if (kind === 4) return Uint8Array.from(ip.split('.').map(Number));
  const g = expandV6(ip);
  if (!g) return null;
  // v6 mapeado para v4 (::ffff:a.b.c.d) é tratado como v4
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return Uint8Array.from([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]);
  return Uint8Array.from(g.flatMap((x) => [x >> 8, x & 255]));
}

function parseCidr(entry: string): { bytes: Uint8Array; prefix: number } | null {
  const slash = entry.lastIndexOf('/');
  const bytes = toBytes(slash < 0 ? entry : entry.slice(0, slash));
  if (!bytes) return null;
  if (slash < 0) return { bytes, prefix: bytes.length * 8 };
  const p = entry.slice(slash + 1);
  if (!/^\d+$/.test(p)) return null;
  const prefix = Number(p);
  return prefix <= bytes.length * 8 ? { bytes, prefix } : null;
}

function inCidr(ip: Uint8Array, net: { bytes: Uint8Array; prefix: number }): boolean {
  if (ip.length !== net.bytes.length) return false;
  let bits = net.prefix;
  for (let i = 0; i < ip.length && bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 255 : (255 << (8 - bits)) & 255;
    if ((ip[i]! & mask) !== (net.bytes[i]! & mask)) return false;
  }
  return true;
}

/** Forma canônica para guardar e comparar: v4 puro; v6 em minúsculas (sem mapear sub-rede: o registro guarda o endereço inteiro). */
function canonical(ip: string): string {
  const b = toBytes(ip);
  if (b && b.length === 4) return Array.from(b).join('.');
  return ip.toLowerCase();
}

function fromChain(value: string, trusted: Array<{ bytes: Uint8Array; prefix: number }>): string | null {
  const chain = value.split(',').map((x) => x.trim()).filter(Boolean);
  if (chain.length === 0) return null;
  if (trusted.length === 0) {
    // sem proxies de confiança só um valor é confiável
    return chain.length === 1 && isIP(chain[0]!) ? canonical(chain[0]!) : null;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const bytes = toBytes(chain[i]!);
    if (!bytes) return null;
    if (trusted.some((t) => inCidr(bytes, t))) continue;
    return canonical(chain[i]!);
  }
  return null;
}

const get = (h: Headers | Record<string, string | string[] | undefined>, name: string): string | null => {
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name);
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v.join(',') : (v ?? null);
};

/**
 * IP do cliente, ou `null` se nenhum cabeçalho dá um valor confiável. Fora de produção, sem cabeçalho nenhum (acesso direto
 * ao servidor de desenvolvimento), devolve `127.0.0.1`, como o Better Auth faz.
 */
export function resolveClientIp(headers: Headers | Record<string, string | string[] | undefined>, cfg: ClientIpConfig, env: Env = process.env): string | null {
  const trusted = cfg.trustedProxies.map(parseCidr).filter((x): x is { bytes: Uint8Array; prefix: number } => x !== null);
  for (const name of cfg.headers) {
    const v = get(headers, name);
    if (typeof v === 'string' && v.trim()) {
      const ip = fromChain(v, trusted);
      if (ip) return ip;
    }
  }
  return env.NODE_ENV === 'production' ? null : '127.0.0.1';
}

export function resolveClientPort(headers: Headers | Record<string, string | string[] | undefined>, cfg: ClientIpConfig): number | null {
  if (!cfg.portHeader) return null;
  const v = get(headers, cfg.portHeader);
  const n = v ? Number(v.split(',')[0]!.trim()) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/** Entradas de `TRUSTED_PROXIES` que não são IP nem CIDR válidos (avisadas na subida; entradas inválidas são ignoradas). */
export function invalidTrustedProxies(cfg: ClientIpConfig): string[] {
  return cfg.trustedProxies.filter((e) => parseCidr(e) === null);
}

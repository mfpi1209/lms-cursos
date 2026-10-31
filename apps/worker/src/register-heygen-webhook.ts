/**
 * Gerencia o endpoint de webhook do HeyGen (API v3, https://api.heygen.com).
 *
 * Uso (sempre com HEYGEN_API_KEY no ambiente; a chave nunca é impressa):
 *   pnpm --filter @lms/worker heygen:webhooks                      # registra (POST /v3/webhooks/endpoints) usando HEYGEN_CALLBACK_URL
 *   pnpm --filter @lms/worker heygen:webhooks --list               # lista (GET /v3/webhooks/endpoints); o secret vem sempre null
 *   pnpm --filter @lms/worker heygen:webhooks --rotate <endpointId> # POST /v3/webhooks/endpoints/{id}/rotate-secret
 *
 * O secret só é devolvido pela API no registro e na rotação, e é impresso UMA vez
 * para ser colocado em HEYGEN_WEBHOOK_SECRET. A rotação invalida o secret antigo
 * imediatamente: atualize a variável do serviço web antes/logo após rodar.
 */
const BASE_URL = process.env.HEYGEN_API_BASE_URL ?? 'https://api.heygen.com';
const EVENTS = ['avatar_video.success', 'avatar_video.fail'];

interface WebhookEndpoint {
  endpoint_id: string;
  url: string;
  events?: string[];
  status?: string;
  created_at?: string;
  secret?: string | null;
}

interface ApiError {
  code?: string;
  message?: string;
}

type Mode = { kind: 'register' } | { kind: 'list' } | { kind: 'rotate'; endpointId: string } | { kind: 'help' };

function parseArgs(argv: string[]): Mode {
  const args = argv.filter((a) => a !== '--');
  if (args.length === 0) return { kind: 'register' };
  const [flag, value, ...rest] = args;
  if (flag === '--help' || flag === '-h') return { kind: 'help' };
  if (flag === '--list' && value === undefined) return { kind: 'list' };
  if (flag === '--register' && value === undefined) return { kind: 'register' };
  if (flag === '--rotate') {
    if (!value || value.startsWith('-') || rest.length > 0) fatal('Uso: --rotate <endpointId> (obtenha o id com --list)');
    return { kind: 'rotate', endpointId: value };
  }
  fatal(`Argumento desconhecido: ${flag}. Use --list, --rotate <endpointId> ou nenhum argumento para registrar.`);
}

function fatal(message: string): never {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`Uso:
  heygen:webhooks                     registra HEYGEN_CALLBACK_URL como endpoint (imprime o secret uma vez)
  heygen:webhooks --list              lista endpoints cadastrados
  heygen:webhooks --rotate <id>       gera novo secret para o endpoint (o antigo deixa de valer na hora)`);
}

async function api<T>(apiKey: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': apiKey, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    const err = (json as { error?: ApiError } | null)?.error;
    fatal(`HeyGen respondeu ${res.status} em ${method} ${path}: ${err?.code ?? 'erro'} — ${err?.message ?? (text ? text.slice(0, 300) : 'sem corpo')}`);
  }
  return json as T;
}

function printEndpoint(e: WebhookEndpoint) {
  console.log(`- ${e.endpoint_id}  ${e.status ?? '?'}  ${e.url}  [${(e.events ?? []).join(', ')}]${e.created_at ? `  criado em ${e.created_at}` : ''}`);
}

const apiKey = process.env.HEYGEN_API_KEY;
const mode = parseArgs(process.argv.slice(2));

if (mode.kind === 'help') {
  usage();
} else {
  if (!apiKey) fatal('Defina HEYGEN_API_KEY no ambiente (a chave não é impressa nem registrada em log).');

  if (mode.kind === 'list') {
    const res = await api<{ data?: WebhookEndpoint[] | { endpoints?: WebhookEndpoint[] }; has_more?: boolean }>(apiKey, 'GET', '/v3/webhooks/endpoints');
    const list = Array.isArray(res.data) ? res.data : (res.data?.endpoints ?? []);
    if (list.length === 0) console.log('Nenhum endpoint de webhook cadastrado.');
    else {
      console.log(`${list.length} endpoint(s):`);
      for (const e of list) printEndpoint(e);
      if (res.has_more) console.log('(há mais páginas; a listagem mostra só a primeira)');
    }
  } else if (mode.kind === 'rotate') {
    const res = await api<{ data?: { endpoint_id?: string; secret?: string } }>(apiKey, 'POST', `/v3/webhooks/endpoints/${encodeURIComponent(mode.endpointId)}/rotate-secret`);
    if (!res.data?.secret) fatal('A API não devolveu um secret novo; verifique o endpointId com --list.');
    console.log(`Secret rotacionado para o endpoint ${res.data.endpoint_id ?? mode.endpointId}. O secret anterior já não vale.`);
    console.log('HEYGEN_WEBHOOK_SECRET=' + res.data.secret);
    console.log('Atualize a variável no serviço web agora: este valor não é exibido de novo.');
  } else {
    const url = process.env.HEYGEN_CALLBACK_URL;
    if (!url) fatal('Defina HEYGEN_CALLBACK_URL (URL HTTPS pública de /api/webhooks/heygen) para registrar o endpoint.');
    if (!/^https:\/\//i.test(url)) fatal('HEYGEN_CALLBACK_URL precisa ser HTTPS público.');
    const res = await api<{ data?: WebhookEndpoint }>(apiKey, 'POST', '/v3/webhooks/endpoints', { url, events: EVENTS });
    if (!res.data?.endpoint_id) fatal('A API não devolveu endpoint_id; resposta inesperada.');
    console.log('Endpoint registrado:', res.data.endpoint_id, res.data.url);
    if (res.data.secret) {
      console.log('HEYGEN_WEBHOOK_SECRET=' + res.data.secret);
      console.log('Guarde o secret agora: ele não é exibido de novo (use --rotate <endpointId> se perder).');
    } else {
      console.log('A API não devolveu secret no registro; use --rotate ' + res.data.endpoint_id + ' para gerar um.');
    }
  }
}

export {};

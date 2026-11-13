import { auth } from '@/lib/auth';
import { MAGIC_LINK_CALLBACK, MAGIC_LINK_ERROR_CALLBACK, safeLocalPath } from '@/lib/auth-access';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * "Continuar" da página de confirmação: confere o link mágico de verdade (consome o token) chamando o endpoint do
 * próprio plugin por dentro, e repassa o cookie de sessão e o destino. Só roda em POST, que filtros de e-mail não fazem.
 * Token ou destino inválidos viram o mesmo redirecionamento de erro dos links que falham.
 */
export async function confirmMagicLink(req: Request): Promise<Response> {
  const origin = new URL(process.env.BETTER_AUTH_URL ?? new URL(req.url).origin).origin;
  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null;
  }
  const token = form?.get('token');
  const callbackURL = safeLocalPath(form?.get('callbackURL'), MAGIC_LINK_CALLBACK);
  const errorCallbackURL = safeLocalPath(form?.get('errorCallbackURL'), MAGIC_LINK_ERROR_CALLBACK);
  const redirect = (to: string, cookies: string[] = []) => {
    const h = new Headers({ location: to, 'cache-control': 'no-store' });
    for (const c of cookies) h.append('set-cookie', c);
    return new Response(null, { status: 303, headers: h });
  };
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return redirect(errorCallbackURL);

  const url = new URL('/api/auth/magic-link/verify', origin);
  url.searchParams.set('token', token);
  url.searchParams.set('callbackURL', callbackURL);
  url.searchParams.set('errorCallbackURL', errorCallbackURL);
  // repassa cabeçalhos do navegador (IP, user-agent, cookies) para o limite de taxa e o registro de acesso do plugin
  const headers = new Headers(req.headers);
  headers.delete('content-type');
  headers.delete('content-length');
  const res = await auth.handler(new Request(url, { method: 'GET', headers }));
  return redirect(res.headers.get('location') ?? errorCallbackURL, res.headers.getSetCookie());
}

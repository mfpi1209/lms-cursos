import { auth } from '@/lib/auth';
import { MAGIC_LINK_CALLBACK, MAGIC_LINK_ERROR_CALLBACK, magicLinkCapture, type MagicLinkCapture } from '@/lib/auth-access';

/**
 * Cria um link mágico para uma conta que JÁ existe e devolve a URL, sem enviar e-mail.
 * Pensado para a API de integração, que entrega o link a outro sistema (ex.: WhatsApp).
 *
 * Usa o endpoint do próprio plugin `magicLink` (mesmo token, mesma validade `MAGIC_LINK_TTL_HOURS`, uso único,
 * mesma linha em `verification`); o `sendMagicLink` do auth.ts vê o contexto de captura e só guarda a URL.
 * Devolve `null` quando não há conta com esse e-mail (quem chama decide o que mostrar; esta função não cria contas).
 * O token vale como senha por até a validade: quem chama não deve registrar a URL em log.
 */
export async function createMagicLinkUrl(email: string, opts: { callbackURL?: string } = {}): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(normalized);
  if (!found?.user) return null;
  const capture: MagicLinkCapture = {};
  await magicLinkCapture.run(capture, () =>
    auth.api.signInMagicLink({
      // a chamada de servidor exige cabeçalhos; não há requisição de navegador, então a checagem de origem não se aplica
      headers: new Headers(),
      body: { email: normalized, callbackURL: opts.callbackURL ?? MAGIC_LINK_CALLBACK, errorCallbackURL: MAGIC_LINK_ERROR_CALLBACK },
    }),
  );
  if (!capture.url) throw new Error('Não foi possível gerar o link de acesso');
  return capture.url;
}

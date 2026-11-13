import { confirmMagicLink } from '@/server/magic-link-confirm';

export const dynamic = 'force-dynamic';

/** Só POST: um GET (scanner de e-mail, pré-visualização) nunca consome o link. */
export async function POST(req: Request) {
  return confirmMagicLink(req);
}

/**
 * Textos públicos de privacidade e uso. Fonte da verdade: `src/content/legal/*.md` (dentro do app: a imagem do Docker
 * não leva `docs/`). Os demais documentos jurídicos (internos) ficam em `docs/legal/`.
 */

/** Enquanto for `true`, as páginas mostram o aviso de rascunho e pedem aos buscadores que não as indexem. Mudar aqui, em um só lugar. */
export const LEGAL_DRAFT = true;
export const LEGAL_DRAFT_LABEL = 'Rascunho em revisão jurídica';
export const LEGAL_DRAFT_NOTE = 'Este texto ainda está sendo revisado. Trechos entre colchetes ainda serão preenchidos ou confirmados.';

export type LegalDocId = 'privacidade' | 'cookies' | 'termos' | 'seguranca';

export interface LegalDoc {
  id: LegalDocId;
  route: `/${LegalDocId}`;
  file: string;
  /** título da aba e do link */
  title: string;
  /** rótulo curto dos links do rodapé */
  label: string;
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacidade: { id: 'privacidade', route: '/privacidade', file: 'politica-de-privacidade.md', title: 'Política de privacidade', label: 'Privacidade' },
  cookies: { id: 'cookies', route: '/cookies', file: 'politica-de-cookies.md', title: 'Política de cookies', label: 'Cookies' },
  termos: { id: 'termos', route: '/termos', file: 'termos-de-uso.md', title: 'Termos de uso', label: 'Termos de uso' },
  seguranca: { id: 'seguranca', route: '/seguranca', file: 'resumo-publico-avaliacao-de-impacto.md', title: 'Como cuidamos da sua segurança', label: 'Segurança' },
};

export const LEGAL_ORDER: LegalDocId[] = ['privacidade', 'termos', 'cookies', 'seguranca'];

/** `./politica-de-privacidade.md` → `/privacidade` (usado nos links entre os textos) */
export const LEGAL_LINK_MAP: Record<string, string> = Object.fromEntries(Object.values(LEGAL_DOCS).map((d) => [d.file, d.route]));

import type { Presentation } from './course';

/**
 * Privacidade do aluno: toda imagem que o navegador dele pede tem de sair do NOSSO domínio (`/api/assets/<id>`).
 * Retrato de apresentador com link do provedor (ex.: `files2.heygen.ai`, assinado e com prazo) mandaria o IP e o
 * navegador do aluno a um terceiro e deixaria de carregar quando o link vencesse.
 */

/** Caminho do próprio domínio (`/api/assets/…`, `/destaque/…`). `//host/…` e `/\host` são externos. */
export function isOwnPath(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

/** A URL só passa se for do próprio domínio; qualquer outra coisa vira `undefined` (o chamador usa o plano B ou nada). */
export function ownImageUrl(url: string | null | undefined): string | undefined {
  return isOwnPath(url) ? url : undefined;
}

/** Host de uma URL absoluta (`https://host/…`), ou `null` quando é caminho do próprio domínio / vazio. */
export function externalHostOf(url: string | null | undefined): string | null {
  if (!url || isOwnPath(url)) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return 'url-invalida';
  }
}

/** Imagens da apresentação do curso (retrato e câmeras) que apontam para fora do nosso domínio. */
export function externalImageRefs(p: Pick<Presentation, 'avatarPreviewUrl' | 'cameras'>): Array<{ field: string; host: string }> {
  const out: Array<{ field: string; host: string }> = [];
  const add = (field: string, url: string | undefined) => {
    const host = externalHostOf(url);
    if (host) out.push({ field, host });
  };
  add('avatarPreviewUrl', p.avatarPreviewUrl);
  (p.cameras ?? []).forEach((c, i) => add(`cameras[${i}].previewUrl`, c.previewUrl));
  return out;
}

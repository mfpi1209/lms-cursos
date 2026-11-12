/**
 * Esconde a parte secreta dos links antes de qualquer registro em log. O token do link mágico (`?token=`) e o da
 * recuperação de senha (`/reset-password/<token>`) dão acesso à conta: quem lê o log não pode usá-los.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/([?&]token=)[^&\s"'<>)]+/gi, '$1[oculto]')
    .replace(/(\/reset-password\/)[^/?\s"'<>)]+/gi, '$1[oculto]');
}

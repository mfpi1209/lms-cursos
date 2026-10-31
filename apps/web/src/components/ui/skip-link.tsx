/** Primeiro elemento focável da página: leva direto ao `<main id="conteudo" tabIndex={-1}>`. Só aparece com foco. */
export const MAIN_CONTENT_ID = 'conteudo';

export function SkipLink({ targetId = MAIN_CONTENT_ID }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only rounded-full bg-accent-fill px-5 text-sm font-semibold text-accent-fill-fg shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center"
    >
      Pular para o conteúdo
    </a>
  );
}

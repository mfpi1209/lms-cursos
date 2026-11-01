import type { PlatformSeries } from '../types';

/**
 * Trilha em série no player (só apresentação; o fim do curso e o selo seguem as regras de sempre):
 * - cabeçalho: "{trilha} · Parte N de 3" onde ficava só o nome do curso;
 * - fim da Parte 1 e 2: chip "Parte N concluída", botão principal "Ir para a Parte N+1: {título}" e o selo em segundo plano;
 * - fim da última parte (as outras já concluídas): "Você concluiu {trilha}" com o selo da trilha.
 */

/** "Respeito e diálogo · Parte 2 de 3" */
export function seriesHeaderLabel(s: Pick<PlatformSeries, 'trail' | 'part' | 'total'>): string {
  return `${s.trail} · Parte ${s.part} de ${s.total}`;
}

/** O fim do curso fecha a trilha inteira? (as outras partes já estão concluídas) */
export function seriesEndsTrail(s: PlatformSeries | undefined): boolean {
  return !!s && s.othersDone;
}

/** Chip da tela de fim do curso. */
export function seriesEndChip(s: PlatformSeries | undefined): string {
  if (!s) return 'Curso concluído';
  return s.othersDone ? 'Trilha concluída' : `Parte ${s.part} concluída`;
}

/** Botão principal que leva à próxima parte; null quando a trilha acabou ou não há parte liberada. */
export function seriesNextButton(s: PlatformSeries | undefined): { label: string; href: string } | null {
  if (!s || s.othersDone || !s.next) return null;
  return { label: `Ir para a Parte ${s.next.n}: ${s.next.title}`, href: s.next.href };
}

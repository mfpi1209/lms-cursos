/**
 * Estado da atividade "Na prática" (montagem de resposta por grupos): textos de
 * preenchimento e quando o botão de salvar fica disponível. Puro (testável sem DOM).
 */

/** "Falta escolher 1 opção." / "Faltam escolher 2 opções." / "2 de 2 escolhas feitas." */
export function composeProgressText(missing: number, total: number): string {
  if (missing <= 0) return `${total} de ${total} ${total === 1 ? 'escolha feita' : 'escolhas feitas'}.`;
  return missing === 1 ? 'Falta escolher 1 opção.' : `Faltam escolher ${missing} opções.`;
}

export interface SaveButtonInput {
  /** grupos ainda sem escolha válida */
  missing: number;
  /** frase montada passou do limite da cena */
  tooLong: boolean;
  /** frase montada abaixo do mínimo da cena */
  tooShort: boolean;
  /** envio em andamento */
  pending: boolean;
  /** já salva (confirmação na tela) */
  saved: boolean;
}

/** Salvar só com todos os grupos escolhidos, dentro dos limites, sem envio em andamento e ainda não salvo. */
export function saveButtonState(s: SaveButtonInput): { disabled: boolean; label: string } {
  return {
    disabled: s.saved || s.pending || s.missing > 0 || s.tooLong || s.tooShort,
    label: s.pending ? 'Salvando…' : 'Salvar no meu roteiro',
  };
}

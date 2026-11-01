import { describe, expect, it } from 'vitest';
import { composeProgressText, saveButtonState } from './compose-state';

const base = { missing: 0, tooLong: false, tooShort: false, pending: false, saved: false };

describe('atividade "Na prática": estado de preenchimento e do botão salvar', () => {
  it('textos de progresso dinâmicos pela quantidade real de grupos', () => {
    expect(composeProgressText(2, 2)).toBe('Faltam escolher 2 opções.');
    expect(composeProgressText(1, 3)).toBe('Falta escolher 1 opção.');
    expect(composeProgressText(0, 2)).toBe('2 de 2 escolhas feitas.');
    expect(composeProgressText(0, 4)).toBe('4 de 4 escolhas feitas.');
    expect(composeProgressText(0, 1)).toBe('1 de 1 escolha feita.');
  });

  it('salvar habilitado só com tudo escolhido, dentro dos limites, sem envio em andamento e não salvo', () => {
    expect(saveButtonState(base)).toEqual({ disabled: false, label: 'Salvar no meu roteiro' });
    expect(saveButtonState({ ...base, missing: 1 }).disabled).toBe(true);
    expect(saveButtonState({ ...base, tooLong: true }).disabled).toBe(true);
    expect(saveButtonState({ ...base, tooShort: true }).disabled).toBe(true);
    expect(saveButtonState({ ...base, saved: true }).disabled).toBe(true);
  });

  it('durante o envio: "Salvando…" e desabilitado (evita envio duplicado)', () => {
    expect(saveButtonState({ ...base, pending: true })).toEqual({ disabled: true, label: 'Salvando…' });
  });
});

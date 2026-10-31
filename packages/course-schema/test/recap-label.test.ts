import { describe, expect, it } from 'vitest';
import { recapLabel } from '../src/import/markdown-course';

/* "Meu roteiro:" — o código da cena liga o item à frase montada; o rótulo mostrado não pode ficar com o conector pendurado. */
describe('recapLabel', () => {
  it('tira o código e o conector que sobraria ("montada em .")', () => {
    expect(recapLabel('Minha confirmação de tarefa, montada em M01.')).toBe('Minha confirmação de tarefa');
    expect(recapLabel('Meu pedido de ajuda, montado em M02.')).toBe('Meu pedido de ajuda');
    expect(recapLabel('minha apresentação (frase montada em M03)')).toBe('Minha apresentação');
    expect(recapLabel('Meu plano de desenvolvimento, montado em M06, junto às frases M01 a M05.')).toBe('Meu plano de desenvolvimento');
    expect(recapLabel('Minha resposta escolhida em Q03')).toBe('Minha resposta');
  });

  it('não apaga "feito na/em" quando faz parte do texto', () => {
    expect(recapLabel('Projeto feito na escola, montado em M02')).toBe('Projeto feito na escola');
    expect(recapLabel('Checklist do dia')).toBe('Do dia');
  });
});

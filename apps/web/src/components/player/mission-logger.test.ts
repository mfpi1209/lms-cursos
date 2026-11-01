import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MissionLogger } from './mission-logger';

const html = (initial: Parameters<typeof MissionLogger>[0]['initial']) => renderToStaticMarkup(createElement(MissionLogger, { enrollmentId: 'enr_1', nodeId: 'missao', initial }));

describe('MissionLogger (estados fora da aula)', () => {
  it('missão que a pessoa ainda não alcançou: só o aviso, nenhum botão', () => {
    const h = html({ status: 'none', note: null });
    expect(h).toContain('data-state="none"');
    expect(h).toContain('Disponível quando você chegar a esta etapa na aula.');
    expect(h).not.toContain('<button');
  });

  it('"Vou fazer depois": mostra o estado e oferece "Já experimentei"', () => {
    const h = html({ status: 'later', note: null, revision: 1 });
    expect(h).toContain('data-state="later"');
    expect(h).toContain('Vou fazer depois');
    expect(h).toContain('data-testid="mission-open-missao"');
    expect(h).toContain('>Já experimentei</button>');
    expect(h).not.toContain('textarea'); // o campo só abre quando a pessoa toca
    expect(h).not.toContain('Salvo');
  });

  it('"Já experimentei" com texto: mostra "O que você percebeu?" e deixa editar', () => {
    const h = html({ status: 'done', note: 'Foi mais fácil do que eu pensava.', revision: 3 });
    expect(h).toContain('data-state="done"');
    expect(h).toContain('O que você percebeu?');
    expect(h).toContain('Foi mais fácil do que eu pensava.');
    expect(h).toContain('Editar o que percebi');
  });

  it('"Já experimentei" sem texto: convida a escrever (é opcional)', () => {
    const h = html({ status: 'done', note: null, revision: 2 });
    expect(h).toContain('Escrever o que percebi');
    expect(h).not.toContain('data-testid="mission-note-missao"');
  });

  it('a confirmação começa vazia: só aparece depois de o servidor responder', () => {
    const h = html({ status: 'done', note: null, revision: 2 });
    expect(h).toMatch(/data-testid="mission-confirmed-missao"[^>]*><\/p>/);
  });
});

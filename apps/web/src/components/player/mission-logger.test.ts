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
  it('"Apagar minha nota" só aparece quando há nota escrita; sem nota ou "Vou fazer depois", não', () => {
    expect(html({ status: 'done', note: 'Foi bom.', revision: 3 })).toContain('data-testid="mission-delete-missao"');
    expect(html({ status: 'done', note: 'Foi bom.', revision: 3 })).toContain('Apagar minha nota');
    expect(html({ status: 'done', note: null, revision: 2 })).not.toContain('mission-delete-missao');
    expect(html({ status: 'later', note: null, revision: 1 })).not.toContain('mission-delete-missao');
    // a confirmação só abre depois de tocar (não vem aberta)
    expect(html({ status: 'done', note: 'Foi bom.', revision: 3 })).not.toContain('mission-delete-confirm-missao');
  });

  it('o aviso de privacidade fica junto ao campo de texto (aparece ao abrir o campo)', async () => {
    const { NOTE_PRIVACY_HINT } = await import('./privacy-hint');
    expect(NOTE_PRIVACY_HINT).toBe('Não escreva nomes de outras pessoas nem dados sensíveis.');
  });
});

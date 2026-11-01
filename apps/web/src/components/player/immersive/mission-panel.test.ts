import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MissionNode } from '@lms/course-schema';
import { MissionPanel } from './immersive-player';

const node: MissionNode = {
  id: 'missao',
  type: 'mission',
  title: 'Peça um retorno hoje',
  objectiveIds: [],
  required: true,
  intro: 'Ensaiar na vida real faz a frase sair natural.',
  action: 'Hoje, peça um retorno curto a uma pessoa de confiança.',
  alternative: 'Se ainda não trabalha, treine com um colega de curso.',
  tip: 'Seja breve.',
  example: 'Pode olhar meu texto em 2 minutos?',
  draftFromNodeId: 'pratica',
};
const base = { headingRef: null, headingId: 'h1', pending: false, fieldError: null, onSend: vi.fn(), carry: null };
const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MissionPanel, { ...base, node, ...props } as never));

describe('MissionPanel (player)', () => {
  it('mostra o momento, a ação, a alternativa, a dica e o exemplo, com as duas saídas', () => {
    const h = render();
    expect(h).toContain('data-state="open"');
    expect(h).toContain('Leve para a vida real'); // eyebrow (o título é o da missão)
    expect(h).toContain('Peça um retorno hoje');
    expect(h).toContain('Hoje, peça um retorno curto a uma pessoa de confiança.');
    expect(h).toContain('Se você ainda não trabalha');
    expect(h).toContain('Se ainda não trabalha, treine com um colega de curso.');
    expect(h).toContain('Dica: ');
    expect(h).toContain('Exemplo: ');
    expect(h).toContain('data-testid="mission-done"');
    expect(h).toContain('data-testid="mission-later"');
    expect(h).toContain('Já experimentei');
    expect(h).toContain('Vou fazer depois');
    expect(h).toContain('Você termina a aula de qualquer jeito');
    expect(h).not.toContain('data-testid="mission-note"'); // o campo só abre depois de "Já experimentei"
    expect(h).not.toContain('data-testid="mission-draft"'); // sem frase montada, sem cartão
  });

  it('com a frase montada antes, mostra o cartão com "Copiar frase"', () => {
    const h = render({ draftText: 'Oi, tudo bem? Posso ajudar com isso?' });
    expect(h).toContain('data-testid="mission-draft"');
    expect(h).toContain('Oi, tudo bem? Posso ajudar com isso?');
    expect(h).toContain('Copiar frase');
  });

  it('a ação em passos ("1. …\n2. …") mantém as quebras de linha', () => {
    const h = render({ node: { ...node, action: '1. Escolha uma tarefa.\n2. Faça a tarefa.' } });
    expect(h).toContain('whitespace-pre-line');
    expect(h).toContain('1. Escolha uma tarefa.\n2. Faça a tarefa.');
  });

  it('título igual ao nome do momento não repete: vira só o título', () => {
    const h = render({ node: { ...node, title: 'Leve para a vida real' } });
    expect(h.match(/Leve para a vida real/g)).toHaveLength(1);
  });

  it('revisita de quem já experimentou: o campo "O que você percebeu?" já abre com o texto', () => {
    const h = render({ previous: { status: 'done', note: 'Foi bem.' } });
    expect(h).toContain('data-state="reporting"');
    expect(h).toContain('O que você percebeu?');
    expect(h).toContain('Foi bem.');
    expect(h).toContain('/500');
    expect(h).toContain('Você marcou: Já experimentei');
    expect(h).toContain('Salvar e continuar');
  });

  it('revisita de quem deixou para depois: lembra a marcação e ainda oferece as duas saídas', () => {
    const h = render({ previous: { status: 'later', note: null } });
    expect(h).toContain('Você marcou: Vou fazer depois');
    expect(h).toContain('data-testid="mission-done"');
  });

  it('falha ao salvar: o aviso fica à vista e o texto digitado continua no campo', () => {
    const h = render({ previous: { status: 'done', note: 'Meu texto' }, saveError: 'Falha de rede' });
    expect(h).toContain('data-testid="mission-save-error"');
    expect(h).toContain('O que você escreveu continua aqui.');
    expect(h).toContain('Meu texto');
  });

  it('registrada: a confirmação só existe no estado salvo e traz "Continuar aula" (e o texto, se houve)', () => {
    expect(render()).not.toContain('mission-saved');
    const feita = render({ saved: { status: 'done', note: 'Deu certo.' } });
    expect(feita).toContain('data-state="saved"');
    expect(feita).toContain('Missão registrada no Meu roteiro.');
    expect(feita).toContain('Deu certo.');
    expect(feita).toContain('data-testid="mission-continue"');
    expect(feita).not.toContain('data-testid="mission-done"');
    const depois = render({ saved: { status: 'later', note: '' } });
    expect(depois).toContain('Missões para depois');
    expect(depois).toContain('data-testid="mission-continue"');
  });

  it('enviando: os botões ficam travados', () => {
    const h = render({ pending: true });
    expect(h.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

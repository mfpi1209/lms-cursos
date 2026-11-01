import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EndNode, Lesson, MissionNode } from '@lms/course-schema';
import { EndPanel, MissionBridge, MissionPanel, lessonSteps } from './immersive-player';

const mission: MissionNode = {
  id: 'm03',
  type: 'mission',
  title: 'Cronometre o seu trajeto',
  objectiveIds: [],
  required: true,
  intro: 'Medir o caminho evita atraso.',
  action: 'Faça o caminho e anote quanto deu.',
  alternative: 'Peça a um colega para medir.',
};
const base = { headingRef: null, headingId: 'h1', pending: false, fieldError: null, onSend: vi.fn() };
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }) as never;
const end = { id: 'fim', type: 'end', title: 'Meu roteiro', summary: doc('Resumo.'), outcomeLabel: 'Curso concluído', closingLine: 'Margem não é chute.' } as unknown as EndNode;
const trail = { name: 'Primeiro emprego', href: '/aprender/trilhas/x', done: 2, total: 3, badge: false };

const endProps = { ...base, node: end, carry: null, exitHref: '/aprender/c', canRestart: true, onRestart: vi.fn(), hasRecap: true, onOpenRecap: vi.fn(), achievements: { choices: 2, practices: 0, skippedPractices: 0, reviews: 0, realLife: 'done' as const } };
const renderEnd = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(EndPanel, { ...endProps, ...props } as never));

describe('ponte antes da missão', () => {
  const h = renderToStaticMarkup(createElement(MissionBridge, { ...base, mission } as never));
  it('nomeia a missão e diz o que ela é, com o botão "Ver a missão"', () => {
    expect(h).toContain('data-testid="mission-bridge"');
    expect(h).toContain('Agora é com você');
    expect(h).toContain('Cronometre o seu trajeto');
    expect(h).toContain('prática para a vida real, fora da plataforma');
    expect(h).toContain('fazer depois');
    expect(h).toContain('Ver a missão');
    expect(h).toContain('data-testid="player-continue"');
  });
  it('não traz o cartão genérico: sem "A seguir", sem "Sua escolha", sem "Continuar"', () => {
    expect(h).not.toContain('A seguir');
    expect(h).not.toContain('Sua escolha');
    expect(h).not.toMatch(/>Continuar</);
  });
  it('o título tem foco programático (id e tabindex) para o leitor de tela', () => {
    expect(h).toContain('id="h1"');
    expect(h).toContain('tabindex="-1"');
  });
  it('enviando: o botão trava', () => {
    expect(renderToStaticMarkup(createElement(MissionBridge, { ...base, pending: true, mission } as never))).toContain('Enviando…');
  });
});

describe('fim do curso', () => {
  const h = renderEnd({
    courseEnd: { course: 'Que roupa eu uso?', closingLine: 'Margem não é chute.' },
    conquest: { name: 'Curso concluído · Que roupa eu uso?', trail },
  });
  it('título "Você concluiu {curso}" e um só chip, "Curso concluído"', () => {
    expect(h.replace(/<[^>]+>/g, '')).toContain('Você concluiu Que roupa eu uso?');
    expect(h.match(/Curso concluído/g)?.length).toBeGreaterThanOrEqual(1);
    expect(h).toContain('data-testid="end-chip"');
    expect(h).not.toContain('Aula concluída');
    expect(h).not.toContain('Meu roteiro</h2>'); // o título do nó "end" não vira manchete
  });
  it('a frase de fecho vem logo abaixo do título (antes do cartão do selo)', () => {
    expect(h).toContain('data-testid="end-closing-line"');
    expect(h.indexOf('end-title')).toBeLessThan(h.indexOf('end-closing-line'));
    expect(h.indexOf('end-closing-line')).toBeLessThan(h.indexOf('conquest-card'));
    expect(h.match(/Margem não é chute\./g)).toHaveLength(1);
  });
  it('o cartão do selo vem destacado e o botão principal é o do selo', () => {
    expect(h).toContain('data-highlight="true"');
    expect(h).toContain('im-badge-glow');
    expect(h).toContain('data-testid="end-badge-link"');
    expect(h).toContain('Ver o caminho até o Selo');
    expect(h.indexOf('end-badge-link')).toBeLessThan(h.indexOf('Voltar ao curso'));
  });
  it('com o selo já emitido, o botão é "Ver meu selo"', () => {
    const emitido = renderEnd({ courseEnd: { course: 'X' }, conquest: { name: 'Curso concluído · X', trail: { ...trail, badge: true } } });
    expect(emitido).toContain('Ver meu selo');
  });
  it('sem trilha, o principal é "Voltar ao curso"', () => {
    const sem = renderEnd({ courseEnd: { course: 'X' }, conquest: { name: 'Curso concluído · X' } });
    expect(sem).not.toContain('end-badge-link');
    expect(sem).toContain('Voltar ao curso');
  });
  it('o chip da vida real vem do estado que o servidor devolveu', () => {
    expect(h).toContain('Vida real: já experimentei');
  });
});

describe('fim de uma aula do meio (sem mudança)', () => {
  const h = renderEnd({ node: { ...end, title: 'Você terminou a aula 1', outcomeLabel: 'Aula concluída' }, nextLesson: { id: 'a2', title: 'Aula 2', href: '/aprender/c/aulas/a2' } });
  it('mantém "Aula concluída", o título do nó e "Próxima aula"', () => {
    expect(h).toContain('Aula concluída');
    expect(h).toContain('Você terminou a aula 1');
    expect(h).toContain('Próxima aula');
    expect(h).not.toContain('Você concluiu');
    expect(h).not.toContain('data-testid="end-chip"');
  });
  it('a frase de fecho do nó continua no fim do painel', () => {
    expect(h).toContain('Margem não é chute.');
    expect(h).not.toContain('end-closing-line');
  });
});

describe('chegada e confirmação da missão', () => {
  const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MissionPanel, { ...base, carry: null, node: mission, ...props } as never));
  it('chip "Última prática do curso" só quando é a última', () => {
    expect(render({ lastPractice: true })).toContain('Última prática do curso');
    expect(render()).not.toContain('Última prática do curso');
  });
  it('chega com fade de 200 ms (classe própria) e "Pode deixar para depois" fica ANTES dos botões', () => {
    const h = render();
    expect(h).toContain('im-mission-in');
    expect(h).toContain('Pode deixar para depois');
    expect(h.indexOf('Pode deixar para depois')).toBeLessThan(h.indexOf('data-testid="mission-done"'));
    expect(h.indexOf('Pode deixar para depois')).toBeLessThan(h.indexOf('data-testid="mission-later"'));
  });
  it('revisita: nenhum campo recebe foco por atributo e o chip lembra a marcação', () => {
    const h = render({ previous: { status: 'done', note: 'Foi bem.' } });
    expect(h).not.toContain('autofocus');
    expect(h).toContain('Você marcou: Já experimentei');
  });
  it('depois de "Já experimentei": acolhe; com o fechamento a seguir, avisa e o botão é "Ver o fechamento"', () => {
    const h = render({ saved: { status: 'done', note: '' }, farewell: true });
    expect(h).toContain('Boa! Missão registrada no Meu roteiro.');
    expect(h).toContain('Falta só o fechamento do curso.');
    expect(h).toContain('Ver o fechamento');
    expect(h).not.toContain('Continuar aula');
    expect(h).not.toContain('data-testid="mission-intro"'); // a missão em si já foi lida
  });
  it('depois de "Vou fazer depois": "Combinado." e o mesmo aviso de fechamento', () => {
    const h = render({ saved: { status: 'later', note: '' }, farewell: true });
    expect(h).toContain('Combinado. A missão fica em Missões para depois.');
    expect(h).toContain('Falta só o fechamento do curso.');
    expect(h).toContain('Ver o fechamento');
  });
  it('sem fechamento a seguir: o botão de sempre e nada de "Falta só"', () => {
    const h = render({ saved: { status: 'done', note: 'Deu certo.' } });
    expect(h).toContain('Continuar aula');
    expect(h).not.toContain('Falta só');
    expect(h).toContain('Deu certo.');
  });
  it('o servidor manteve "feita" mesmo com o toque em "depois": a tela diz o que ficou valendo', () => {
    const h = render({ saved: { status: 'done', note: 'Antes.', requested: 'later' } });
    expect(h).toContain('Você já tinha marcado “Já experimentei”');
    expect(h).not.toContain('Combinado');
    expect(h).toContain('Antes.');
  });
});

describe('etapa "Fechamento" na barra de etapas', () => {
  const lesson = {
    id: 'aula_03',
    graph: {
      startNodeId: 'v04',
      nodes: [{ id: 'v04', type: 'scenario' }, { id: 'm03', type: 'mission' }, { id: 'despedida', type: 'content' }, { id: 'fim', type: 'end' }],
      edges: [],
    },
  } as unknown as Lesson;
  it('o fechamento vira a etapa "closing" (bandeira); sem ele, a cena segue como vídeo', () => {
    expect(lessonSteps(lesson, 'despedida').map((s) => s.kind)).toEqual(['video', 'real', 'closing']);
    expect(lessonSteps(lesson).map((s) => s.kind)).toEqual(['video', 'real', 'video']);
  });
});

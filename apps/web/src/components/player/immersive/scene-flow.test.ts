import { describe, expect, it } from 'vitest';
import {
  BRIDGE_BUTTON,
  BRIDGE_EYEBROW,
  closingCardTitle,
  closingNodeId,
  farewellAfter,
  isClosingNode,
  isCourseEnd,
  isLastLessonOfCourse,
  isLastPractice,
  missionAckAnnouncement,
  missionAckText,
  missionAfter,
  missionContinueLabel,
  soleNext,
} from './scene-flow';

type N = { id: string; type: string; [k: string]: unknown };
const g = (nodes: N[], edges: Array<[string, string]>, startNodeId = nodes[0]!.id) => ({
  startNodeId,
  nodes: nodes as never,
  edges: edges.map(([from, to], i) => ({ id: `e${i}`, from, to })) as never,
});

// aula final típica: cena → decisão → explicação → missão → despedida → fim
const last = g(
  [
    { id: 'v04', type: 'scenario' },
    { id: 'q04', type: 'choice' },
    { id: 'v05', type: 'content' },
    { id: 'm03', type: 'mission', title: 'Cronometre o seu trajeto' },
    { id: 'despedida', type: 'content' },
    { id: 'fim', type: 'end' },
  ],
  [['v04', 'q04'], ['q04', 'v05'], ['q04', 'v05'], ['v05', 'm03'], ['m03', 'despedida'], ['despedida', 'fim']],
);

describe('cena que leva à missão (ponte)', () => {
  it('o vídeo cujo único destino é a missão devolve a missão', () => {
    expect(missionAfter(last, 'v05')?.id).toBe('m03');
  });
  it('quem leva a outra coisa não tem ponte', () => {
    expect(missionAfter(last, 'v04')).toBeNull(); // vai para uma decisão
    expect(missionAfter(last, 'm03')).toBeNull(); // a missão leva ao fechamento
    expect(missionAfter(last, 'inexistente')).toBeNull();
  });
  it('mais de um destino distinto: não há "o próximo"', () => {
    const two = g([{ id: 'a', type: 'content' }, { id: 'm', type: 'mission' }, { id: 'x', type: 'content' }], [['a', 'm'], ['a', 'x']]);
    expect(soleNext(two, 'a')).toBeUndefined();
    expect(missionAfter(two, 'a')).toBeNull();
  });
  it('textos da ponte', () => {
    expect(BRIDGE_EYEBROW).toBe('Agora é com você');
    expect(BRIDGE_BUTTON).toBe('Ver a missão');
  });
});

describe('fechamento do curso (despedida)', () => {
  it('é o conteúdo logo antes do fim, depois da missão, na última aula', () => {
    expect(isClosingNode(last, 'despedida', true)).toBe(true);
    expect(closingNodeId(last, true)).toBe('despedida');
  });
  it('não depende do id: vale para qualquer conteúdo antes do fim que vem depois de uma prática', () => {
    const other = g(
      [{ id: 'a', type: 'scenario' }, { id: 'r1', type: 'reflection' }, { id: 'adeus', type: 'content' }, { id: 'fim', type: 'end' }],
      [['a', 'r1'], ['r1', 'adeus'], ['adeus', 'fim']],
    );
    expect(isClosingNode(other, 'adeus', true)).toBe(true);
    expect(closingNodeId(other, true)).toBe('adeus');
  });
  it('em aula que não é a última, nada é fechamento', () => {
    expect(isClosingNode(last, 'despedida', false)).toBe(false);
    expect(closingNodeId(last, false)).toBeNull();
  });
  it('a explicação final sem prática antes não vira fechamento', () => {
    const plain = g([{ id: 'a', type: 'scenario' }, { id: 'v', type: 'content' }, { id: 'fim', type: 'end' }], [['a', 'v'], ['v', 'fim']]);
    expect(isClosingNode(plain, 'v', true)).toBe(false);
  });
  it('o "Resultado" (revisão de decisões) e cenas do meio não são fechamento', () => {
    const rev = g([{ id: 'a', type: 'scenario' }, { id: 'r1', type: 'reflection' }, { id: 'res', type: 'content', reviewNodeIds: ['q1'] }, { id: 'fim', type: 'end' }], [['a', 'r1'], ['r1', 'res'], ['res', 'fim']]);
    expect(isClosingNode(rev, 'res', true)).toBe(false);
    expect(isClosingNode(last, 'v05', true)).toBe(false);
    expect(isClosingNode(last, 'm03', true)).toBe(false);
    expect(isClosingNode(last, 'fim', true)).toBe(false);
  });
  it('depois da missão vem o fechamento: a confirmação diz "Falta só o fechamento"', () => {
    expect(farewellAfter(last, 'm03', true)).toBe(true);
    expect(farewellAfter(last, 'm03', false)).toBe(false);
    expect(farewellAfter(last, 'v05', true)).toBe(false);
  });
  it('título do cartão', () => {
    expect(closingCardTitle('Que roupa eu uso?')).toBe('Fechamento do curso · Que roupa eu uso?');
  });
});

describe('última prática do curso', () => {
  it('missão da última aula sem prática adiante', () => {
    expect(isLastPractice(last, 'm03', true)).toBe(true);
  });
  it('aula do meio, ou prática adiante: não é a última', () => {
    expect(isLastPractice(last, 'm03', false)).toBe(false);
    const more = g([{ id: 'm', type: 'mission' }, { id: 'r', type: 'reflection' }, { id: 'fim', type: 'end' }], [['m', 'r'], ['r', 'fim']]);
    expect(isLastPractice(more, 'm', true)).toBe(false);
  });
});

describe('posição da aula no curso', () => {
  const lessons = [
    { id: 'a1', status: 'completed' },
    { id: 'a2', status: 'completed' },
    { id: 'a3', status: 'in_progress' },
  ];
  it('última aula só quando está na lista, no fim', () => {
    expect(isLastLessonOfCourse(lessons, 'a3')).toBe(true);
    expect(isLastLessonOfCourse(lessons, 'a2')).toBe(false);
    expect(isLastLessonOfCourse(lessons, 'fora')).toBe(false); // prévia de uma aula só
  });
  it('fim de CURSO: última aula e as outras concluídas (a atual conta como concluída)', () => {
    expect(isCourseEnd(lessons, 'a3')).toBe(true);
    expect(isCourseEnd(lessons, 'a2')).toBe(false); // não é a última
    expect(isCourseEnd([{ id: 'a1', status: 'in_progress' }, { id: 'a3', status: 'in_progress' }], 'a3')).toBe(false); // falta uma aula
    expect(isCourseEnd(lessons, 'fora')).toBe(false);
  });
});

describe('reconhecimento depois da missão (por status)', () => {
  it('"Já experimentei": acolhe e diz onde ficou', () => {
    const a = missionAckText('done');
    expect(a.headline).toBe('Boa! Missão registrada no Meu roteiro.');
    expect(a.follow).toBeNull();
    expect(a.hint).toContain('editar');
  });
  it('"Vou fazer depois": combinado, sem tom de recibo', () => {
    const a = missionAckText('later');
    expect(a.headline).toBe('Combinado. A missão fica em Missões para depois.');
    expect(a.follow).toBeNull();
    expect(a.hint).toContain('Já experimentei');
  });
  it('com o fechamento a seguir, nos dois casos: "Falta só o fechamento do curso."', () => {
    expect(missionAckText('done', { farewell: true }).follow).toBe('Falta só o fechamento do curso.');
    expect(missionAckText('later', { farewell: true }).follow).toBe('Falta só o fechamento do curso.');
  });
  it('o servidor não rebaixa: tocou "depois", valeu "feita" → diz o que ficou valendo', () => {
    const a = missionAckText('done', { requested: 'later' });
    expect(a.headline).toContain('Você já tinha marcado “Já experimentei”');
    expect(a.headline).not.toContain('Combinado');
    expect(missionAckText('done', { requested: 'done' }).headline).toBe('Boa! Missão registrada no Meu roteiro.');
    expect(missionAckText('later', { requested: 'later' }).headline).toBe('Combinado. A missão fica em Missões para depois.');
  });
  it('a frase anunciada para leitores de tela é a mesma da tela (frase + fechamento)', () => {
    expect(missionAckAnnouncement('later', { farewell: true })).toBe('Combinado. A missão fica em Missões para depois. Falta só o fechamento do curso.');
    expect(missionAckAnnouncement('done')).toBe('Boa! Missão registrada no Meu roteiro.');
  });
  it('botão: "Ver o fechamento" quando a despedida vem a seguir; senão o rótulo de sempre', () => {
    expect(missionContinueLabel(true)).toBe('Ver o fechamento');
    expect(missionContinueLabel(false)).toBe('Continuar aula');
  });
});

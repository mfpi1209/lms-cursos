import { describe, expect, it } from 'vitest';
import { podeEntrar, allLessons, PODE_ENTRAR_NOTE_ID, type EndNode, type LessonGraph, type Scalar } from '@lms/course-schema';
import { applyIntent, createInitialState, mergeAnswers, resolveRecap, resolveReview, REVIEW_MARK_LABELS, type AttemptState, type CourseAnswer, type Intent } from '../src';

const lessons = allLessons(podeEntrar);
const graph = (idx: number): LessonGraph => lessons[idx]!.graph;
const now = new Date('2026-01-01T00:00:00Z');

/** Aplica intenções em sequência e devolve o estado final e os nós visitados. */
function run(g: LessonGraph, intents: Intent[], carried?: Record<string, Scalar>): { state: AttemptState; visited: string[] } {
  let state = createInitialState(g, { now, carried });
  for (const i of intents) state = applyIntent(g, state, i, now).state;
  return { state, visited: state.path.map((p) => p.nodeId) };
}

const choose = (optionId: string): Intent => ({ kind: 'choose', optionId });
const advance: Intent = { kind: 'advance' };
const reflect = (text = ''): Intent => ({ kind: 'reflect', text });

describe('Pode entrar — aula 1: abertura e preparação', () => {
  it('as três rotas de perfil chegam à sua cena P e à atividade guiada (escolha, sem escrever), gravando `perfil`', () => {
    const g = graph(0);
    const cases = [
      ['primeiro_emprego', 'p01_primeiro_emprego', 'at01_situacao_primeiro_emprego'],
      ['experiencia', 'p02_experiencia', 'at01_entrega_experiencia'],
      ['transicao', 'p03_transicao', 'at01_ponte_transicao'],
    ] as const;
    for (const [perfil, p, at] of cases) {
      const { state } = run(g, [advance, choose(perfil), advance]);
      expect(state.variables.perfil).toBe(perfil);
      expect(state.path.map((x) => x.nodeId)).toEqual(['v01_entrevista_comeca', 'q01_perfil', p, at]);
      const atNode = g.nodes.find((n) => n.id === at)!;
      expect(atNode.type).toBe('choice');
      if (atNode.type === 'choice') for (const o of atNode.options) expect(run(g, [advance, choose(perfil), advance, choose(o.id)]).state.currentNodeId).toBe('v02_o_que_preparar');
    }
  });

  it('Q02 B segue direto; A/C passam por R01 e pela nova tentativa', () => {
    const g = graph(0);
    const base: Intent[] = [advance, choose('primeiro_emprego'), advance, choose('colaborar'), advance];
    const b = run(g, [...base, choose('b')]);
    expect(b.state.currentNodeId).toBe('fim_abertura');
    expect(b.state.status).toBe('completed');

    const a = run(g, [...base, choose('a')]);
    expect(a.state.currentNodeId).toBe('r01_prepare_o_que_vai_usar');
    const a2 = run(g, [...base, choose('a'), advance]);
    expect(a2.state.currentNodeId).toBe('q02_bis_quinze_minutos');
    const c = run(g, [...base, choose('c'), advance, choose('revisar')]);
    expect(c.state.currentNodeId).toBe('fim_abertura');
    const c2 = run(g, [...base, choose('c'), advance, choose('memorizar')]);
    expect(c2.state.currentNodeId).toBe('c02_exemplo_checklist');
    expect(run(g, [...base, choose('c'), advance, choose('memorizar'), advance]).state.status).toBe('completed');
  });
});

describe('Pode entrar — aulas 2 e 4: variantes pelo perfil trazido da aula 1', () => {
  it('o perfil gravado na aula 1 chega às aulas 2 e 4 como variável de curso', () => {
    const a1 = run(graph(0), [advance, choose('transicao')]);
    expect(a1.state.variables.perfil).toBe('transicao');
    const carried = { perfil: a1.state.variables.perfil! };
    const a2 = run(graph(2), [], carried);
    expect(a2.state.currentNodeId).toBe('v03_apresentacao');
    expect(a2.state.variables.perfil).toBe('transicao');
    expect(run(graph(2), [advance], carried).state.currentNodeId).toBe('q03_transicao');
    expect(run(graph(4), [advance], carried).state.currentNodeId).toBe('q05_transicao');
  });

  it('Q03 muda conforme o perfil trazido; sem valor anterior cai em primeiro emprego', () => {
    const g = graph(2);
    expect(run(g, [advance], { perfil: 'primeiro_emprego' }).state.currentNodeId).toBe('q03_primeiro_emprego');
    expect(run(g, [advance], { perfil: 'experiencia' }).state.currentNodeId).toBe('q03_experiencia');
    expect(run(g, [advance], { perfil: 'transicao' }).state.currentNodeId).toBe('q03_transicao');
    expect(run(g, [advance]).state.currentNodeId).toBe('q03_primeiro_emprego');
    // valor de tipo errado é ignorado (fica o inicial)
    expect(run(g, [advance], { perfil: 3 }).state.currentNodeId).toBe('q03_primeiro_emprego');
  });

  it('Q03: B vai à atividade; A/C passam por R02 antes', () => {
    const g = graph(2);
    const exp = { perfil: 'experiencia' };
    expect(run(g, [advance, choose('b')], exp).state.currentNodeId).toBe('at03_experiencia');
    const viaR = run(g, [advance, choose('a'), advance], exp);
    expect(viaR.visited).toContain('r02_situacao_por_tras_da_qualidade');
    // o reforço volta à atividade do perfil
    expect(viaR.state.currentNodeId).toBe('at03_experiencia');
    expect(run(g, [advance, choose('a'), advance], { perfil: 'transicao' }).state.currentNodeId).toBe('at03_transicao');
    expect(run(g, [advance, choose('a'), advance]).state.currentNodeId).toBe('at03_primeiro_emprego');
    // depois da escolha vem a composição guiada (opcional) do perfil; pular encerra
    const atCompose = run(g, [advance, choose('c'), advance, choose('curso')], { perfil: 'transicao' });
    expect(atCompose.state.currentNodeId).toBe('mt03_transicao');
    const done = run(g, [advance, choose('c'), advance, choose('curso'), reflect('')], { perfil: 'transicao' });
    expect(done.state.status).toBe('completed');
    expect(done.state.answers.at03_transicao?.optionIds).toEqual(['curso']);
  });

  it('Q05 muda conforme o perfil trazido e R04 reencontra AT05', () => {
    const g = graph(4);
    expect(run(g, [advance], { perfil: 'primeiro_emprego' }).state.currentNodeId).toBe('q05_primeiro_emprego');
    expect(run(g, [advance], { perfil: 'experiencia' }).state.currentNodeId).toBe('q05_experiencia');
    expect(run(g, [advance], { perfil: 'transicao' }).state.currentNodeId).toBe('q05_transicao');
    expect(run(g, [advance]).state.currentNodeId).toBe('q05_primeiro_emprego');
    const viaR = run(g, [advance, choose('c'), advance], { perfil: 'experiencia' });
    expect(viaR.visited).toContain('r04_verdade_contexto_proximo_passo');
    expect(viaR.state.currentNodeId).toBe('at05_minha_resposta');
    expect(run(g, [advance, choose('b'), choose('comecar')]).state.status).toBe('completed');
  });
});

describe('Pode entrar — aula 3 e aula 5', () => {
  it('Q04: A/C passam por R03; AT04 encerra', () => {
    const g = graph(3);
    expect(run(g, [advance, choose('b')]).state.currentNodeId).toBe('at04_exemplo_real');
    const r = run(g, [advance, choose('a'), advance]);
    expect(r.visited).toContain('r03_complete_a_historia');
    expect(run(g, [advance, choose('c'), advance, choose('familia')]).state.currentNodeId).toBe('mt04_meu_exemplo');
    expect(run(g, [advance, choose('c'), advance, choose('familia'), reflect()]).state.status).toBe('completed');
  });

  it('Q06/Q07: nova tentativa sem ciclo; segunda tentativa segue com exemplo comentado', () => {
    const g = graph(5);
    const q06bis = run(g, [advance, choose('a'), advance]);
    expect(q06bis.state.currentNodeId).toBe('q06_bis_segunda_tentativa');
    const comentado = run(g, [advance, choose('c'), advance, choose('a'), advance]);
    expect(comentado.visited).toContain('c06_exemplo_comentado');
    expect(comentado.state.currentNodeId).toBe('at06_quando_nao_souber');
    const direto = run(g, [advance, choose('b')]);
    expect(direto.state.currentNodeId).toBe('at06_quando_nao_souber');

    const toQ07: Intent[] = [advance, choose('b'), choose('limite'), advance];
    expect(run(g, [...toQ07, choose('b')]).state.currentNodeId).toBe('v08_perguntas_que_ajudam_a_decidir');
    const q07bis = run(g, [...toQ07, choose('a'), advance]);
    expect(q07bis.state.currentNodeId).toBe('q07_bis_segunda_tentativa');
    const q07c = run(g, [...toQ07, choose('c'), advance, choose('c'), advance]);
    expect(q07c.visited).toContain('c07_exemplo_comentado');
    expect(q07c.state.currentNodeId).toBe('v08_perguntas_que_ajudam_a_decidir');
  });

  it('Q08: B passa pela escolha de uma pergunta útil; todos chegam às duas perguntas e ao fim', () => {
    const g = graph(5);
    const toQ08: Intent[] = [advance, choose('b'), choose('limite'), advance, choose('b'), advance];
    expect(run(g, toQ08).state.currentNodeId).toBe('q08_como_encerraria');
    expect(run(g, [...toQ08, choose('a')]).state.currentNodeId).toBe('at08_minhas_duas_perguntas');
    expect(run(g, [...toQ08, choose('b')]).state.currentNodeId).toBe('q08_bis_pergunta_util');
    const fim = run(g, [...toQ08, choose('b'), choose('rotina'), choose('treino_passos')]);
    expect(fim.state.status).toBe('completed');
    expect(fim.state.answers.at08_minhas_duas_perguntas?.optionIds).toEqual(['treino_passos']);
  });
});

describe('Pode entrar — aula 7: simulação final', () => {
  const g = graph(6);
  const simulate = (answers: [string, string, string, string]) => run(g, [advance, ...answers.map(choose), advance]);

  it('8 pontos → E01', () => {
    const r = simulate(['b', 'a', 'b', 'b']);
    expect(r.state.variables.pontos).toBe(8);
    expect(r.state.currentNodeId).toBe('e01_leve_a_pratica');
    const nota = applyIntent(g, r.state, advance, now);
    expect(nota.toNodeId).toBe(PODE_ENTRAR_NOTE_ID);
    const end = applyIntent(g, nota.state, reflect(), now);
    expect(end.toNodeId).toBe('fim_e01');
    expect(end.state.status).toBe('completed');
  });

  it('7 pontos → E01 (limite inferior da faixa)', () => {
    const r = simulate(['a', 'a', 'b', 'b']);
    expect(r.state.variables.pontos).toBe(7);
    expect(r.state.currentNodeId).toBe('e01_leve_a_pratica');
  });

  it('5 pontos → E02', () => {
    const r = simulate(['a', 'b', 'c', 'b']);
    expect(r.state.variables.pontos).toBe(5);
    expect(r.state.currentNodeId).toBe('e02_base_para_ajustar');
    expect(applyIntent(g, applyIntent(g, r.state, advance, now).state, reflect(), now).toNodeId).toBe('fim_e02');
  });

  it('4 e 6 pontos → E02 (limites da faixa)', () => {
    expect(simulate(['a', 'b', 'c', 'a']).state.currentNodeId).toBe('e02_base_para_ajustar');
    expect(simulate(['b', 'a', 'c', 'a']).state.currentNodeId).toBe('e02_base_para_ajustar');
  });

  it('2 pontos → E03; 0 e 3 pontos também', () => {
    const r = simulate(['c', 'b', 'a', 'a']);
    expect(r.state.variables.pontos).toBe(2);
    expect(r.state.currentNodeId).toBe('e03_vamos_por_partes');
    expect(applyIntent(g, applyIntent(g, r.state, advance, now).state, reflect(), now).toNodeId).toBe('fim_e03');
    expect(simulate(['c', 'c', 'a', 'c']).state.currentNodeId).toBe('e03_vamos_por_partes');
    expect(simulate(['a', 'b', 'c', 'c']).state.currentNodeId).toBe('e03_vamos_por_partes');
  });

  it('o recap dos encerramentos aponta para atividades que existem em outras aulas', () => {
    const allNodes = new Map(lessons.flatMap((l) => l.graph.nodes).map((n) => [n.id, n]));
    for (const end of g.nodes) {
      if (end.type !== 'end') continue;
      for (const item of end.recap ?? []) {
        if (!item.nodeId) continue;
        const src = allNodes.get(item.nodeId);
        expect(src, `${end.id}/${item.id}`).toBeDefined();
        expect(src!.type).toBe(item.kind);
      }
    }
  });
});

describe('Pode entrar — anotação opcional e "Meu roteiro" montado com escolhas', () => {
  const g6 = graph(6);
  const toNote: Intent[] = [advance, choose('b'), choose('a'), choose('b'), choose('b'), advance, advance];

  it('a anotação é opcional: pular (texto vazio) segue para o encerramento da faixa', () => {
    const atNote = run(g6, toNote).state;
    expect(atNote.currentNodeId).toBe(PODE_ENTRAR_NOTE_ID);
    const skipped = applyIntent(g6, atNote, reflect(''), now);
    expect(skipped.toNodeId).toBe('fim_e01');
    expect(skipped.state.status).toBe('completed');
    expect(skipped.state.answers[PODE_ENTRAR_NOTE_ID]?.text).toBe('');
    // faixas preservadas depois da anotação
    expect(run(g6, [advance, choose('a'), choose('b'), choose('c'), choose('b'), advance, advance, reflect()]).state.currentNodeId).toBe('fim_e02');
    expect(run(g6, [advance, choose('c'), choose('b'), choose('a'), choose('a'), advance, advance, reflect('Hoje eu estudo.')]).state.currentNodeId).toBe('fim_e03');
  });

  it('resolve o roteiro a partir das escolhas das outras aulas (variante do perfil) e mostra o texto vazio da anotação pulada', () => {
    const at = (idx: number, intents: Intent[], carried?: Record<string, Scalar>) => run(graph(idx), intents, carried).state;
    const s1 = at(0, [advance, choose('experiencia'), advance, choose('rotina')]);
    const s2 = at(2, [advance, choose('b'), choose('o_que')], { perfil: 'experiencia' });
    const s3 = at(3, [advance, choose('b'), choose('grupo')]);
    const s4 = at(4, [advance, choose('b'), choose('usar')], { perfil: 'experiencia' });
    const s5 = at(5, [advance, choose('b'), choose('exemplo'), advance, choose('b'), advance, choose('a'), choose('rotina_meses')]);
    const lessonIds = lessons.map((l) => l.id);
    const course: Record<string, CourseAnswer> = {};
    for (const [i, st] of [[0, s1], [2, s2], [3, s3], [4, s4], [5, s5]] as const)
      for (const [nodeId, a] of Object.entries(st.answers))
        course[nodeId] = { lessonId: lessonIds[i]!, kind: a.text !== undefined ? 'reflection' : 'choice', optionIds: a.optionIds, text: a.text, answeredAt: a.answeredAt };

    const fim = run(g6, [...toNote, reflect('')]).state;
    expect(fim.status).toBe('completed');
    const end = g6.nodes.find((n) => n.id === fim.currentNodeId) as EndNode;
    const allNodes = new Map(lessons.flatMap((l) => l.graph.nodes).map((n) => [n.id, n]));

    // só a tentativa atual: nada das outras aulas
    const sem = resolveRecap(g6, end, fim);
    expect(sem.filter((i) => i.kind === 'choice').every((i) => i.value === null)).toBe(true);

    const items = resolveRecap(g6, end, fim, { answers: course, lookupNode: (id) => allNodes.get(id) });
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i.value]));
    expect(byLabel['Minha apresentação']).toBe('“Cuidei de pedidos e prazos no meu último trabalho.”');
    expect(byLabel['O que minha história mostra']).toBe('Organizei uma rotina da equipe.');
    expect(byLabel['Meu exemplo']).toBe('Um trabalho em grupo em que ajudei a organizar.');
    expect(byLabel['Minha motivação']).toBe('“Quero usar o que já fiz numa equipe nova.”');
    expect(byLabel['Quando eu não souber']).toBe('“Pode me dar um exemplo do que espera?”');
    expect(byLabel['Minhas duas perguntas']).toBe('Como é a rotina + o que esperam nos primeiros meses');
    // anotação pulada: vazia → o player mostra o texto de vazio
    const nota = items.find((i) => i.label === 'Minha anotação')!;
    expect(nota.value).toBeNull();
    expect(nota.emptyText).toBe('Se quiser, escreva depois');
    expect(items.find((i) => i.label === 'Minha apresentação')?.source).toEqual({ nodeId: 'at03_experiencia', title: 'Seu começo' });
  });

  it('variantes da mesma atividade: vale a escolha mais recente', () => {
    const end = g6.nodes.find((n) => n.id === 'fim_e01') as EndNode;
    const allNodes = new Map(lessons.flatMap((l) => l.graph.nodes).map((n) => [n.id, n]));
    const state = run(g6, []).state;
    const items = resolveRecap(g6, end, state, {
      lookupNode: (id) => allNodes.get(id),
      answers: {
        at03_primeiro_emprego: { lessonId: 'x', kind: 'choice', optionIds: ['curso'], answeredAt: '2026-01-01T00:00:00Z' },
        at03_transicao: { lessonId: 'x', kind: 'choice', optionIds: ['estudo'], answeredAt: '2026-02-01T00:00:00Z' },
      },
    });
    expect(items.find((i) => i.id === 'minha_apresentacao')?.value).toBe('“Venho do comércio e estou estudando suporte técnico.”');
  });

  it('mergeAnswers: a tentativa atual vence as respostas do curso', () => {
    const merged = mergeAnswers(
      { at03_apresentacao: { text: 'nova', answeredAt: '2026-02-01T00:00:00Z' } },
      {
        at03_apresentacao: { lessonId: 'x', kind: 'reflection', text: 'antiga', answeredAt: '2026-01-01T00:00:00Z' },
        q04_entrega_atrasando: { lessonId: 'y', kind: 'choice', optionIds: ['b'], answeredAt: '2026-01-01T00:00:00Z' },
      },
    );
    expect(merged.at03_apresentacao?.text).toBe('nova');
    expect(merged.q04_entrega_atrasando?.optionIds).toEqual(['b']);
  });
});

describe('Pode entrar — composição guiada ("Monte sua apresentação" / "Monte seu exemplo")', () => {
  const allNodes = new Map(lessons.flatMap((l) => l.graph.nodes).map((n) => [n.id, n]));
  const g6 = graph(6);
  const end = g6.nodes.find((n) => n.id === 'fim_e01') as EndNode;
  const course = (entries: Array<[string, Partial<CourseAnswer>]>): Record<string, CourseAnswer> =>
    Object.fromEntries(entries.map(([id, a]) => [id, { lessonId: 'x', kind: a.text !== undefined ? 'reflection' : 'choice', answeredAt: '2026-01-01T00:00:00Z', ...a } as CourseAnswer]));

  it('cada perfil chega à sua composição depois da escolha; a frase montada vai pela intenção reflect', () => {
    for (const perfil of ['primeiro_emprego', 'experiencia', 'transicao'] as const) {
      const at = run(graph(2), [advance, choose('b')], { perfil });
      const atNode = graph(2).nodes.find((n) => n.id === `at03_${perfil}`);
      const first = atNode?.type === 'choice' ? atNode.options[0]!.id : '';
      const s = applyIntent(graph(2), at.state, choose(first), now).state;
      expect(s.currentNodeId).toBe(`mt03_${perfil}`);
      const node = graph(2).nodes.find((n) => n.id === s.currentNodeId)!;
      expect(node.type === 'reflection' && node.scaffold && node.minLength === 0).toBe(true);
    }
    const sentence = 'Estou no 1º ano de Administração. Organizei um trabalho em grupo. Quero começar em atendimento porque gosto de ajudar as pessoas.';
    const done = run(graph(2), [advance, choose('b'), choose('faculdade'), reflect(sentence)]);
    expect(done.state.status).toBe('completed');
    expect(done.state.answers.mt03_primeiro_emprego?.text).toBe(sentence);
    const ex = run(graph(3), [advance, choose('b'), choose('grupo'), reflect('Num trabalho em grupo da escola, eu dividi as tarefas e acompanhei os prazos. Entregamos no prazo.')]);
    expect(ex.state.status).toBe('completed');
    expect(ex.state.answers.mt04_meu_exemplo?.text).toMatch(/^Num trabalho em grupo/);
  });

  it('roteiro: a frase montada vence a escolha; composição pulada cai na escolha', () => {
    const state = run(g6, []).state;
    const resolve = (answers: Record<string, CourseAnswer>) =>
      Object.fromEntries(resolveRecap(g6, end, state, { answers, lookupNode: (id) => allNodes.get(id) }).map((i) => [i.id, i]));

    const composed = resolve(course([
      ['at03_primeiro_emprego', { optionIds: ['faculdade'] }],
      ['mt03_primeiro_emprego', { text: 'Estou no 1º ano de Administração. Fiz trabalho voluntário. Quero começar em vendas porque sou organizado com prazos.', answeredAt: '2026-01-01T00:01:00Z' }],
      ['at04_exemplo_real', { optionIds: ['familia'] }],
      ['mt04_meu_exemplo', { text: 'No negócio da minha família, eu atendi clientes e anotei os pedidos. Aprendi a lidar com pressa e com gente.' }],
    ]));
    expect(composed.minha_apresentacao?.value).toMatch(/^Estou no 1º ano de Administração\./);
    expect(composed.minha_apresentacao?.source).toEqual({ nodeId: 'mt03_primeiro_emprego', title: 'Monte sua apresentação' });
    expect(composed.meu_exemplo?.value).toMatch(/^No negócio da minha família/);

    const skipped = resolve(course([
      ['at03_primeiro_emprego', { optionIds: ['faculdade'] }],
      ['mt03_primeiro_emprego', { text: '' }],
      ['at04_exemplo_real', { optionIds: ['familia'] }],
    ]));
    expect(skipped.minha_apresentacao?.value).toBe('“Estou na faculdade e já organizei projetos da turma.”');
    expect(skipped.meu_exemplo?.value).toBe('Uma ajuda em casa ou no negócio da família.');

    // nada respondido: texto de vazio
    const empty = resolve({});
    expect(empty.minha_apresentacao?.value).toBeNull();
    expect(empty.minha_apresentacao?.emptyText).toBe('Monte na aula 3');
  });
});

describe('Pode entrar — resultado da simulação (revisão de respostas)', () => {
  const g = graph(6);
  const result = g.nodes.find((n) => n.id === 'resultado_simulacao')!;
  const ids = result.type === 'content' ? result.reviewNodeIds ?? [] : [];

  it('3 de 4 respostas fortes: pergunta, resposta escolhida, marca e dica', () => {
    const r = run(g, [advance, choose('b'), choose('a'), choose('a'), choose('b')]);
    expect(r.state.currentNodeId).toBe('resultado_simulacao');
    const review = resolveReview(g, ids, r.state);
    expect(review.headline).toBe('3 de 4 respostas fortes');
    expect(review.items.map((i) => i.mark)).toEqual(['strong', 'strong', 'improve', 'strong']);
    const s03 = review.items[2]!;
    expect(s03.question).toBe('Você não entendeu bem a pergunta. O que faz?');
    expect(s03.answer).toBe('Respondo o que acho que é, para não ficar em silêncio.');
    expect(s03.tip).toBe('Você evitou a pausa, mas pode ter respondido outra coisa; peça para explicar.');
    expect(REVIEW_MARK_LABELS[s03.mark!]).toBe('Pode melhorar');
  });

  it('nenhuma forte e decisões ainda sem resposta', () => {
    const all = resolveReview(g, ids, run(g, [advance, choose('c'), choose('c'), choose('a'), choose('c')]).state);
    expect(all.headline).toBe('0 de 4 respostas fortes');
    const partial = resolveReview(g, ids, run(g, [advance, choose('b')]).state);
    expect(partial.answered).toBe(1);
    expect(partial.items[1]).toMatchObject({ answer: null, mark: null, tip: null });
    expect(partial.headline).toBe('1 de 1 resposta forte');
  });
});

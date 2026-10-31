import { describe, expect, it } from 'vitest';
import { compileCourse } from '../src/compile';
import { courseLengthReport } from '../src/length';
import { podeEntrar, PODE_ENTRAR_LESSON_IDS, PODE_ENTRAR_NOTE_ID, PODE_ENTRAR_TITLE } from '../src/examples';
import { richTextToPlain } from '../src/richtext';
import { spokenWords } from '../src/direction';
import { allLessons } from '../src/course';
import type { AnyNode } from '../src/nodes';

const lessons = allLessons(podeEntrar);
const nodes = lessons.flatMap((l) => l.graph.nodes);
const byId = new Map(nodes.map((n) => [n.id, n]));

function screenText(n: AnyNode) {
  switch (n.type) {
    case 'scenario':
    case 'content':
    case 'consequence':
      return n.body;
    case 'choice':
    case 'reflection':
    case 'assessment':
      return n.prompt;
    case 'end':
      return n.summary;
    default:
      return undefined;
  }
}

describe('curso "Pode entrar"', () => {
  it('compila sem erros; só avisos de extensão (o roteiro define o tamanho das aulas) e a anotação opcional sem objetivo', () => {
    const r = compileCourse(podeEntrar);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    for (const w of r.warnings) {
      if (w.code === 'NO_OBJECTIVE') expect(w.nodeId).toBe(PODE_ENTRAR_NOTE_ID);
      // MEDIA_MISSING: o exemplo tem apresentador mas nenhum vídeo (estado da mídia, não do roteiro);
      // CHOICE_NO_CALL/REACTION_MISSING: o exemplo é anterior à ponte vídeo → pergunta e às reações
      else expect(['LESSON_TOO_LONG', 'COURSE_TOO_LONG', 'MEDIA_MISSING', 'CHOICE_NO_CALL', 'REACTION_MISSING']).toContain(w.code);
    }
    // extensão total dentro da tolerância da meta de 30 min
    expect(courseLengthReport(podeEntrar).warnings.some((w) => w.code === 'COURSE_TOO_LONG')).toBe(false);
  });

  it('tem título, 7 aulas obrigatórias, 5 objetivos e apresentação da mesma apresentadora', () => {
    expect(podeEntrar.title).toBe(PODE_ENTRAR_TITLE);
    expect(lessons.map((l) => l.id)).toEqual([...PODE_ENTRAR_LESSON_IDS]);
    expect(podeEntrar.completion.requiredLessonIds).toEqual([...PODE_ENTRAR_LESSON_IDS]);
    expect(podeEntrar.objectives).toHaveLength(5);
    expect(lessons[1]!.id).toBe('aula_dia_da_entrevista');
    expect(podeEntrar.brief.targetMinutes).toBe(30);
    expect(podeEntrar.brief.narrativeVoice).toBe('second_person');
    expect(podeEntrar.wizard.finished).toBe(true);
    expect(podeEntrar.presentation.avatarId).toBe('6ac78d9347a6b062051f6f0e9230e68b');
    expect(podeEntrar.presentation.voiceId).toBe('MZxV5lN3cv7hi1376O0m');
    for (const l of lessons) expect(l.estimatedMinutes).toBeGreaterThanOrEqual(4);
    for (const l of lessons) expect(l.estimatedMinutes).toBeLessThanOrEqual(6);
  });

  it('ids de nó são únicos no curso inteiro (o recap aponta por id entre aulas)', () => {
    expect(byId.size).toBe(nodes.length);
  });

  it('todas as cenas com "Fala para gravação" têm narração; perguntas e atividades não (exceto a Q03, gravada)', () => {
    const videos = ['v01', 'v02', 'd01', 'v03', 'v04', 'v05', 'v06', 'v07', 'v08', 'p01', 'p02', 'p03', 'r01', 'r02', 'r03', 'r04', 'e01', 'e02', 'e03'];
    for (const code of videos) {
      const n = nodes.find((x) => x.id.startsWith(`${code}_`));
      expect(n, code).toBeDefined();
      expect('narration' in n! && typeof n!.narration === 'string' && n!.narration.length > 50, code).toBe(true);
    }
    for (const n of nodes) if (n.type === 'choice' && !n.id.startsWith('q03_')) expect(n.narration, n.id).toBeUndefined();
    // trechos literais do roteiro
    expect((byId.get('v01_entrevista_comeca') as { narration?: string }).narration).toContain('Chegou o convite. Você abre a chamada');
    expect((byId.get('e03_vamos_por_partes') as { narration?: string }).narration).toContain('O objetivo aqui é sair com um próximo passo que você consiga realizar.');
  });

  it('pouco texto: palavras-chave nas cenas com fala; perguntas, opções e retornos curtos', () => {
    const words = (t: string | undefined) => spokenWords(t ?? '').length;
    for (const n of nodes) {
      if ((n.type === 'content' || n.type === 'scenario') && n.narration) {
        expect(words(richTextToPlain(n.body)), `${n.id}: tela`).toBeLessThanOrEqual(12);
        if (/^r0\d_/.test(n.id)) expect(words(n.narration), `${n.id}: fala do reforço`).toBeLessThanOrEqual(45);
      }
      if (n.type === 'consequence') expect(words(richTextToPlain(n.body)) + words(richTextToPlain(n.guidance)), n.id).toBeLessThanOrEqual(30);
      if (n.type === 'choice') {
        expect(words(richTextToPlain(n.prompt)), `${n.id}: pergunta`).toBeLessThanOrEqual(18);
        for (const o of n.options) {
          expect(words(o.label), `${n.id}/${o.id}: opção`).toBeLessThanOrEqual(14);
          expect(words(richTextToPlain(o.feedback)), `${n.id}/${o.id}: retorno`).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('sem escrita obrigatória: uma anotação livre opcional e composições guiadas (blocos para tocar), todas puláveis; voz só como treino opcional', () => {
    const reflections = nodes.filter((n) => n.type === 'reflection');
    // escrita livre: só a anotação final; as outras reflexões são composições com molde
    expect(reflections.filter((n) => n.type === 'reflection' && !n.scaffold).map((n) => n.id)).toEqual([PODE_ENTRAR_NOTE_ID]);
    expect(reflections.filter((n) => n.type === 'reflection' && n.scaffold).map((n) => n.id)).toEqual(['mt03_primeiro_emprego', 'mt03_experiencia', 'mt03_transicao', 'mt04_meu_exemplo']);
    for (const r of reflections) expect(r.type === 'reflection' && r.minLength, r.id).toBe(0);
    const choices = nodes.filter((n) => n.type === 'choice');
    for (const n of choices) if (n.type === 'choice' && n.openAnswer?.enabled) expect(n.openAnswer, n.id).toMatchObject({ voice: true, text: false });
    const voice = choices.filter((n) => n.type === 'choice' && n.openAnswer?.enabled).map((n) => n.id);
    expect(voice.length).toBeGreaterThanOrEqual(6);
    expect(voice.length).toBeLessThanOrEqual(10);
    // perguntas de rota/preparação ficam só na escolha
    for (const id of ['q01_perfil', 'q02_convite_amanha', 'q02_bis_quinze_minutos']) expect(voice).not.toContain(id);
  });

  it('perfil: variável de curso; só Q01 grava; aulas 2 e 4 não repetem a pergunta e ramificam com fallback', () => {
    const a1 = lessons[0]!.graph;
    for (const perfil of ['primeiro_emprego', 'experiencia', 'transicao']) {
      const e = a1.edges.find((x) => x.from === 'q01_perfil' && x.optionId === perfil);
      expect(e?.effects).toEqual([{ op: 'set', var: 'perfil', value: perfil }]);
    }
    // declarada como de curso, com o mesmo tipo, em todas as aulas que a usam
    for (const idx of [0, 2, 4]) {
      const v = lessons[idx]!.graph.variables.find((x) => x.name === 'perfil');
      expect(v, `aula ${idx + 1}`).toMatchObject({ type: 'string', scope: 'course', initial: 'primeiro_emprego' });
    }
    // perguntas de perfil repetidas removidas; ninguém além da Q01 grava `perfil`
    expect(byId.has('q03_perfil')).toBe(false);
    expect(byId.has('q05_perfil')).toBe(false);
    const writers = lessons.flatMap((l) => l.graph.edges.filter((e) => e.effects?.some((f) => f.var === 'perfil')).map((e) => e.from));
    expect(new Set(writers)).toEqual(new Set(['q01_perfil']));
    for (const [lessonIdx, from] of [[2, 'v03_apresentacao'], [4, 'v05_como_explicar_uma_mudanca']] as const) {
      const g = lessons[lessonIdx]!.graph;
      expect(g.startNodeId).toBe(from);
      const outs = g.edges.filter((e) => e.from === from);
      expect(outs).toHaveLength(3);
      expect(outs.filter((e) => e.isDefault)).toHaveLength(1);
      expect(outs.filter((e) => e.condition)).toHaveLength(2);
    }
  });

  it('simulação: cada opção vale 0, 1 ou 2 pontos e as faixas levam a E01/E02/E03', () => {
    const g = lessons[6]!.graph;
    const sims = ['s01_perfil_combina', 's02_algo_deu_errado', 's03_pergunta_confusa', 's04_sem_informacao_jornada'];
    for (const s of sims) {
      const pts = g.edges.filter((e) => e.from === s).map((e) => (e.effects?.[0] && e.effects[0].op === 'inc' ? e.effects[0].by : 0)).sort();
      expect(pts, s).toEqual([0, 1, 2]);
    }
    const outs = g.edges.filter((e) => e.from === 'resultado_simulacao');
    expect(outs.find((e) => e.to === 'e01_leve_a_pratica')?.condition).toEqual({ op: 'gte', var: 'pontos', value: 7 });
    expect(outs.find((e) => e.to === 'e03_vamos_por_partes')?.condition).toEqual({ op: 'lte', var: 'pontos', value: 3 });
    expect(outs.find((e) => e.to === 'e02_base_para_ajustar')?.isDefault).toBe(true);
  });

  it('recap: cada encerramento monta o roteiro com escolhas (nenhum item depende de escrever)', () => {
    const ends = lessons[6]!.graph.nodes.filter((n) => n.type === 'end');
    expect(ends).toHaveLength(3);
    for (const end of ends) {
      if (end.type !== 'end') continue;
      expect(end.recapTitle).toBe('Meu roteiro de entrevista');
      expect(end.closingLine).toBe('Você não precisa decorar sua história. Precisa conseguir explicá-la.');
      expect(end.recap?.map((r) => r.label)).toEqual([
        'Minha apresentação', 'O que minha história mostra', 'Meu exemplo', 'Minha motivação', 'Quando eu não souber', 'O que preciso esclarecer', 'Minhas duas perguntas', 'Minha anotação', 'Meu próximo treino', 'Dia da entrevista', 'Checklist',
      ]);
      for (const item of end.recap ?? []) {
        if (item.kind === 'reflection' || item.kind === 'choice') {
          for (const id of [item.nodeId, ...(item.nodeIds ?? [])]) {
            const src = byId.get(id ?? '');
            expect(src, `${end.id}/${item.id}/${id}`).toBeDefined();
            expect(src!.type, `${end.id}/${item.id}/${id}`).toBe(item.kind);
          }
        }
        if (item.kind === 'reflection') {
          expect(item.nodeId).toBe(PODE_ENTRAR_NOTE_ID);
          expect(item.emptyText).toBe('Se quiser, escreva depois');
        }
        if (item.kind === 'checklist') expect(item.items?.length ?? 0).toBeGreaterThan(0);
        if (item.kind === 'text') expect(item.text?.length ?? 0).toBeGreaterThan(0);
      }
      expect(end.recap?.find((r) => r.id === 'dia_da_entrevista')?.items).toEqual(['Horário e trajeto conferidos', 'Folga para o trânsito', 'Contato para avisar atraso', 'Roupa separada', '3 pontos para lembrar: apresentação, um exemplo real e uma pergunta para fazer']);
      expect(end.recap?.find((r) => r.id === 'minha_apresentacao')?.nodeIds).toEqual(['at03_experiencia', 'at03_transicao']);
      // a frase montada vence a escolha (composições guiadas das aulas 3 e 4)
      expect(end.recap?.find((r) => r.id === 'minha_apresentacao')?.composedNodeIds).toEqual(['mt03_primeiro_emprego', 'mt03_experiencia', 'mt03_transicao']);
      expect(end.recap?.find((r) => r.id === 'meu_exemplo')?.composedNodeIds).toEqual(['mt04_meu_exemplo']);
      for (const item of end.recap ?? []) for (const id of item.composedNodeIds ?? []) expect(byId.get(id)?.type, id).toBe('reflection');
    }
    const treinos = ends.map((e) => (e.type === 'end' ? e.recap?.find((r) => r.id === 'meu_proximo_treino')?.text : undefined));
    expect(new Set(treinos).size).toBe(3);
  });

  it('aula do dia: até 7 cenas, quatro decisões com três opções e a dica online, sem mídia', () => {
    const g = lessons[1]!.graph;
    expect(g.nodes.filter((n) => n.type !== 'end').length).toBeLessThanOrEqual(7);
    const decisions = g.nodes.filter((n) => n.type === 'choice');
    expect(decisions.map((n) => n.id)).toEqual(['d02_quando_sair', 'd03_onibus_atrasou', 'd04_o_que_vestir', 'd05_coracao_acelera']);
    for (const d of decisions) if (d.type === 'choice') expect(d.options).toHaveLength(3);
    for (const n of g.nodes) expect('media' in n && n.media, n.id).toBeFalsy();
    expect(g.nodes.some((n) => n.type === 'content' && /^Dica/.test(n.title ?? ''))).toBe(true);
  });

  it('reforços são nós distintos, sem ciclos: a segunda tentativa segue com exemplo comentado', () => {
    const a5 = lessons[5]!.graph;
    const to = (from: string, optionId: string) => a5.edges.find((e) => e.from === from && e.optionId === optionId)?.to;
    expect(to('q06_sistema_nunca_usou', 'a')).toBe('r06_refazer_com_apoio');
    expect(to('q06_sistema_nunca_usou', 'c')).toBe('r06_refazer_com_apoio');
    expect(to('q06_bis_segunda_tentativa', 'a')).toBe('c06_exemplo_comentado');
    expect(to('q06_bis_segunda_tentativa', 'b')).toBe('at06_quando_nao_souber');
    expect(to('q07_bis_segunda_tentativa', 'c')).toBe('c07_exemplo_comentado');
    expect(a5.edges.find((e) => e.from === 'c07_exemplo_comentado')?.to).toBe('v08_perguntas_que_ajudam_a_decidir');
  });

  it('"3 pontos" é definido antes de ser usado: na fala e na tela da D01, e no checklist do roteiro', () => {
    const d01 = byId.get('d01_chegar_bem')!;
    const def = /apresentação.*exemplo.*pergunta/i;
    expect(d01.type === 'content' && def.test(d01.narration ?? '')).toBe(true);
    expect(d01.type === 'content' && def.test(richTextToPlain(d01.body))).toBe(true);
    const d05 = byId.get('d05_coracao_acelera')!;
    if (d05.type === 'choice') expect(d05.options.find((o) => o.id === 'respirar')?.label).toMatch(/3 pontos/);
  });

  it('opções difíceis de adivinhar: primeira pessoa, sem descrições em 3ª pessoa, tamanhos parecidos; segunda tentativa reescreve a melhor', () => {
    const thirdPerson = /^(dizer|exigir|esconder|ensaiar|ler|pesquisar|decorar)\b|e mais nada/i;
    for (const n of nodes) {
      if (n.type !== 'choice') continue;
      const lens = n.options.map((o) => spokenWords(o.label).length);
      for (const o of n.options) expect(o.label, `${n.id}/${o.id}`).not.toMatch(thirdPerson);
      // a melhor (quality strong) não é a única entre aspas
      const quoted = n.options.map((o) => /^[“"]/.test(o.label));
      if (quoted.some(Boolean) && n.options.some((o) => o.quality === 'strong')) expect(quoted.every(Boolean), `${n.id}: todas entre aspas ou nenhuma`).toBe(true);
      if (n.options.every((o) => o.quality) && !n.id.startsWith('q01')) expect(Math.max(...lens) - Math.min(...lens), `${n.id}: tamanhos parecidos`).toBeLessThanOrEqual(5);
    }
    const best = (id: string) => {
      const n = byId.get(id);
      return n?.type === 'choice' ? n.options.find((o) => o.quality === 'strong')?.label : undefined;
    };
    for (const [first, second] of [['q06_sistema_nunca_usou', 'q06_bis_segunda_tentativa'], ['q07_pretensao_salarial', 'q07_bis_segunda_tentativa'], ['q02_convite_amanha', 'q02_bis_quinze_minutos']] as const) {
      expect(best(first), first).toBeDefined();
      expect(best(second), second).toBeDefined();
      expect(best(second), `${second}: melhor opção reescrita`).not.toBe(best(first));
    }
  });

  it('simulação: toda opção marca a qualidade (forte = 2 pontos) e o resultado revisa as 4 decisões', () => {
    const g = lessons[6]!.graph;
    const sims = ['s01_perfil_combina', 's02_algo_deu_errado', 's03_pergunta_confusa', 's04_sem_informacao_jornada'];
    for (const s of sims) {
      const n = g.nodes.find((x) => x.id === s)!;
      if (n.type !== 'choice') throw new Error(s);
      for (const o of n.options) {
        const e = g.edges.find((x) => x.from === s && x.optionId === o.id)!;
        const by = e.effects?.[0]?.op === 'inc' ? e.effects[0].by : 0;
        expect(o.quality, `${s}/${o.id}`).toBe(by === 2 ? 'strong' : by === 1 ? 'ok' : 'weak');
      }
    }
    const result = g.nodes.find((n) => n.id === 'resultado_simulacao')!;
    expect(result.type === 'content' && result.reviewNodeIds).toEqual(sims);
  });

  it('página do aluno: resumo em segunda pessoa, separado da descrição da equipe', () => {
    expect(podeEntrar.learnerSummary).toMatch(/^Você /);
    expect(podeEntrar.learnerSummary).not.toMatch(/\baluno\b/i);
  });
});

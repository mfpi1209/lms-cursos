import { describe, expect, it } from 'vitest';
import { TRAIL_CHECKS, TRAIL_ORDER, sortTrails, badgeEligibility, competencyFromObjective, gradeTrailCheck, isBadgeCode, publicTrailCheck, shuffleWithSeed, trailCheckFor, trailCheckSeed, trailSlug } from '../src/trails';

describe('trilhas: checagem final e selo', () => {
  it('chave da trilha estável', () => {
    expect(trailSlug('Rotina e combinados')).toBe('rotina-e-combinados');
    expect(trailSlug('Convivência')).toBe('convivencia');
    expect(trailCheckFor('Imagem e postura')?.trail).toBe('Imagem e postura');
    expect(trailCheckFor('Trilha nova')).toBeNull();
  });

  it('toda checagem tem 5 a 8 situações, cada uma com 3 opções e exatamente 1 correta', () => {
    for (const c of Object.values(TRAIL_CHECKS)) {
      expect(c.situations.length).toBeGreaterThanOrEqual(5);
      expect(c.situations.length).toBeLessThanOrEqual(8);
      for (const s of c.situations) {
        expect(s.options).toHaveLength(3);
        expect(s.options.filter((o) => o.correct)).toHaveLength(1);
        expect(s.situation.length).toBeGreaterThan(30);
      }
    }
    expect(JSON.stringify(TRAIL_CHECKS)).not.toMatch(/\bCIEE\b|\bIEL\b|agente de integração/);
  });

  it('a versão pública não revela a resposta', () => {
    const pub = publicTrailCheck(TRAIL_CHECKS['convivencia']!);
    expect(JSON.stringify(pub)).not.toMatch(/correct|feedback/);
  });

  it('nota: 80% de acerto para passar (5 de 6); sem resposta conta como erro', () => {
    const c = TRAIL_CHECKS['primeiro-emprego']!;
    const right = Object.fromEntries(c.situations.map((s) => [s.id, s.options.find((o) => o.correct)!.id]));
    expect(gradeTrailCheck(c, right)).toMatchObject({ total: 6, correct: 6, needed: 5, passed: true });
    const oneWrong = { ...right, [c.situations[0]!.id]: c.situations[0]!.options.find((o) => !o.correct)!.id };
    expect(gradeTrailCheck(c, oneWrong).passed).toBe(true);
    const twoMissing = { ...right, [c.situations[0]!.id]: undefined, [c.situations[1]!.id]: 'zzz' };
    const r = gradeTrailCheck(c, twoMissing);
    expect(r).toMatchObject({ correct: 4, passed: false });
    expect(r.results[0]).toMatchObject({ chosen: null, correct: false });
  });

  it('selo: falta curso, falta atividade, reprovou e aprovou', () => {
    const done = (id: string) => ({ courseId: id, title: id, done: true, enrolled: true, missingActivities: [] });
    const base = { courses: [done('a'), done('b')], checkPassed: true, hasCheck: true };
    expect(badgeEligibility(base).eligible).toBe(true);
    const missingCourse = badgeEligibility({ ...base, courses: [done('a'), { ...done('b'), done: false }] });
    expect(missingCourse).toMatchObject({ eligible: false, coursesMissing: [{ courseId: 'b' }] });
    const missingAct = badgeEligibility({ ...base, courses: [done('a'), { ...done('b'), missingActivities: ['Avise um imprevisto'] }] });
    expect(missingAct).toMatchObject({ eligible: false, activitiesMissing: [{ courseId: 'b', activities: ['Avise um imprevisto'] }] });
    expect(badgeEligibility({ ...base, checkPassed: false })).toMatchObject({ eligible: false, checkMissing: true });
    expect(badgeEligibility({ ...base, hasCheck: false }).eligible).toBe(false);
    expect(badgeEligibility({ ...base, courses: [] }).eligible).toBe(false);
  });

  it('competência e código', () => {
    expect(competencyFromObjective('Você pede um exemplo concreto.')).toBe('Pede um exemplo concreto.');
    expect(isBadgeCode('DNA-ABCD-2345')).toBe(true);
    expect(isBadgeCode('DNA-ABC0-2345')).toBe(false);
  });
});

/* Revisão pré-gravação (docs/novos-cursos/revisao-pre-gravacao.md, S1 e seção 4): as 4 checagens novas. */
const NOVAS = ['respeito-e-dialogo', 'tecnologia-com-criterio', 'autonomia-no-trabalho', 'pensar-e-resolver'] as const;
/** posição (0 = a, 1 = b, 2 = c) da correta no arquivo, na ordem das situações de cada trilha */
const POSICAO = { 'respeito-e-dialogo': [1, 2, 0, 1, 2, 0], 'tecnologia-com-criterio': [2, 0, 1, 2, 1, 0], 'autonomia-no-trabalho': [1, 0, 2, 1, 2, 0], 'pensar-e-resolver': [2, 1, 0, 2, 1, 0] } as const;
const palavras = (t: string) => t.replace(/[“”]/g, '').trim().split(/\s+/).length;

describe('checagens das 4 trilhas novas: a correta não tem lugar nem tamanho previsível', () => {
  it('a correta fica na posição definida pela revisão e os ids a/b/c seguem a ordem do arquivo', () => {
    for (const k of NOVAS) {
      const sit = TRAIL_CHECKS[k]!.situations;
      sit.forEach((s, i) => {
        expect(s.options.map((o) => o.id), `${k}/${s.id}`).toEqual(['a', 'b', 'c']);
        expect(s.options.findIndex((o) => o.correct), `${k}/${s.id}`).toBe(POSICAO[k][i]);
      });
    }
  });

  it('quem marca sempre "a" não passa (nem sempre "b", nem sempre "c")', () => {
    for (const k of NOVAS) {
      const c = TRAIL_CHECKS[k]!;
      for (const id of ['a', 'b', 'c']) {
        const r = gradeTrailCheck(c, Object.fromEntries(c.situations.map((s) => [s.id, id])));
        expect(r.passed, `${k} sempre ${id}`).toBe(false);
        expect(r.correct, `${k} sempre ${id}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('a correta é a mais longa em poucas situações (era em 21 de 24)', () => {
    let maisLonga = 0;
    for (const k of NOVAS)
      for (const s of TRAIL_CHECKS[k]!.situations) {
        const w = s.options.map((o) => palavras(o.label));
        const max = Math.max(...w);
        const c = s.options.findIndex((o) => o.correct);
        if (w[c] === max && w.filter((x) => x === max).length === 1) maisLonga++;
      }
    expect(maisLonga).toBeLessThanOrEqual(6);
  });

  it('os distratores caricatos foram trocados e não sobrou aspas curvas dentro de aspas curvas', () => {
    const todas = JSON.stringify(NOVAS.map((k) => TRAIL_CHECKS[k]));
    for (const caricata of ['mensagem de grupo nunca é verdadeira', 'não dá para fazer nenhuma das duas', 'não preciso aprender mais nada', 'aprender tudo de uma vez', 'Espero alguém me dizer', 'Entrego primeiro e confiro depois', 'balança nunca pode ser o motivo', 'Mudo todos e volto', 'Repito o envio várias vezes'])
      expect(todas, caricata).not.toContain(caricata);
    for (const k of NOVAS) for (const s of TRAIL_CHECKS[k]!.situations) for (const o of s.options) expect(o.label.slice(1, -1), `${k}/${s.id}/${o.id}`).not.toMatch(/[“”]/);
  });

  it('as situações trocadas por terem cópia literal do curso mudaram a condição (Tales, Hugo, Selma)', () => {
    const t = TRAIL_CHECKS['tecnologia-com-criterio']!.situations.find((s) => s.id === 'tc4')!;
    expect(t.situation).toMatch(/CPF e foto do documento/);
    expect(t.options.find((o) => o.correct)!.label).toBe('“Não envio nada e procuro a vaga na página oficial da empresa.”');
    const h = TRAIL_CHECKS['pensar-e-resolver']!.situations.find((s) => s.id === 'pr3')!;
    expect(h.situation).toMatch(/às 9h\. São 11h/);
    const p = TRAIL_CHECKS['pensar-e-resolver']!.situations.find((s) => s.id === 'pr6')!;
    expect(p.situation).toMatch(/gerente pergunta/);
  });
});

describe('checagem: ordem embaralhada das opções (estável por aluno e tentativa, sem gabarito)', () => {
  const check = TRAIL_CHECKS['respeito-e-dialogo']!;
  const seedDe = (userId: string, attempt: number) => trailCheckSeed({ userId, trailKey: 'respeito-e-dialogo', attempt });
  const ordem = (seed: string) => publicTrailCheck(check, seed).situations.map((s) => s.options.map((o) => o.id).join(''));

  it('mesma pessoa e mesma tentativa: mesma ordem, sempre', () => {
    expect(ordem(seedDe('usr_1', 0))).toEqual(ordem(seedDe('usr_1', 0)));
  });

  it('depois de cada envio a ordem muda; outra pessoa vê outra ordem', () => {
    expect(ordem(seedDe('usr_1', 1))).not.toEqual(ordem(seedDe('usr_1', 0)));
    expect(ordem(seedDe('usr_2', 0))).not.toEqual(ordem(seedDe('usr_1', 0)));
  });

  it('só muda a ordem: mesmas opções, mesmos ids e textos, em todas as situações', () => {
    const base = publicTrailCheck(check);
    const emb = publicTrailCheck(check, seedDe('usr_9', 3));
    expect(emb.situations.map((s) => s.id)).toEqual(base.situations.map((s) => s.id));
    emb.situations.forEach((s, i) => {
      expect([...s.options].sort((x, y) => x.id.localeCompare(y.id))).toEqual([...base.situations[i]!.options].sort((x, y) => x.id.localeCompare(y.id)));
    });
  });

  it('o gabarito não vai ao navegador: nem `correct` nem retorno, embaralhado ou não', () => {
    for (const seed of [undefined, seedDe('usr_1', 0)]) {
      const json = JSON.stringify(publicTrailCheck(check, seed));
      expect(json).not.toMatch(/correct|feedback/);
      for (const s of check.situations) for (const o of s.options) expect(json).not.toContain(o.feedback);
    }
  });

  it('a nota usa o id da opção: a ordem de exibição não muda o resultado', () => {
    const emb = publicTrailCheck(check, seedDe('usr_1', 0));
    // a pessoa marca a opção que ficou na posição em que a correta ficou em cada situação
    const certas = Object.fromEntries(check.situations.map((s) => [s.id, s.options.find((o) => o.correct)!.id]));
    expect(gradeTrailCheck(check, certas).passed).toBe(true);
    // marcar sempre a 1ª opção da tela não passa: a correta está espalhada
    const primeira = Object.fromEntries(emb.situations.map((s) => [s.id, s.options[0]!.id]));
    expect(gradeTrailCheck(check, primeira).passed).toBe(false);
  });

  it('a correta não fica presa a uma posição: em 300 alunos aparece nas três (cada uma entre 20% e 47%)', () => {
    for (const k of NOVAS) {
      const c = TRAIL_CHECKS[k]!;
      for (const s of c.situations) {
        const cont = [0, 0, 0];
        for (let u = 0; u < 300; u++) {
          const o = publicTrailCheck(c, trailCheckSeed({ userId: `usr_${u}`, trailKey: k, attempt: 0 })).situations.find((x) => x.id === s.id)!.options;
          cont[o.findIndex((x) => x.id === s.options.find((y) => y.correct)!.id)]!++;
        }
        for (const n of cont) {
          expect(n / 300, `${k}/${s.id} ${cont.join('/')}`).toBeGreaterThan(0.2);
          expect(n / 300, `${k}/${s.id} ${cont.join('/')}`).toBeLessThan(0.47);
        }
      }
    }
  });

  it('shuffleWithSeed é uma permutação, não mexe na lista original e a semente decide a ordem', () => {
    const lista = [1, 2, 3, 4, 5, 6];
    const a = shuffleWithSeed(lista, 'x');
    expect([...a].sort()).toEqual(lista);
    expect(lista).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shuffleWithSeed(lista, 'x')).toEqual(a);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((x) => shuffleWithSeed(lista, x).join(''))).size).toBeGreaterThan(3);
  });

  it('ordem de aprendizado: cobre todas as trilhas com checagem e ordena as desconhecidas por último, em ordem alfabética', () => {
    expect(TRAIL_ORDER.map(trailSlug)).toEqual(Object.keys(TRAIL_CHECKS));
    expect(sortTrails(['Pensar e resolver', 'Zebra', 'Primeiro emprego', 'Convivência', 'Alfa'])).toEqual(['Primeiro emprego', 'Convivência', 'Pensar e resolver', 'Alfa', 'Zebra']);
  });
});


describe('trilhas em série (um cartão por trilha)', () => {
  it('são 4 trilhas conhecidas, cada uma com 3 partes e sem curso repetido', async () => {
    const { TRAIL_SERIES } = await import('../src/trails');
    expect(TRAIL_SERIES.map((s) => s.trail)).toEqual(['Respeito e diálogo', 'Tecnologia com critério', 'Autonomia no trabalho', 'Pensar e resolver']);
    const all = TRAIL_SERIES.flatMap((s) => s.courses);
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
    for (const s of TRAIL_SERIES) {
      expect(s.courses).toHaveLength(3);
      expect(TRAIL_ORDER.map(trailSlug)).toContain(trailSlug(s.trail));
    }
  });

  it('ordem das partes confere com os cursos C15 a C26 (docs/novos-cursos/expansao/indice.md)', async () => {
    const { seriesForTrail } = await import('../src/trails');
    expect(seriesForTrail('Respeito e diálogo')?.courses).toEqual(['o-outro-so-e-diferente', 'discordar-sem-brigar', 'minha-ideia-tambem-conta']);
    expect(seriesForTrail('Tecnologia com critério')?.courses).toEqual(['seus-dados-tambem-trabalham', 'parece-verdade-sera', 'ia-como-aliada']);
    expect(seriesForTrail('Autonomia no trabalho')?.courses).toEqual(['tudo-e-urgente', 'errei-e-agora', 'aprender-faz-parte']);
    expect(seriesForTrail('Pensar e resolver')?.courses).toEqual(['por-onde-eu-comeco', 'faz-sentido', 'onde-esta-o-problema']);
  });

  it('acha a série pelo nome ou pela chave de URL; as outras trilhas não são série', async () => {
    const { seriesForTrail } = await import('../src/trails');
    expect(seriesForTrail('pensar-e-resolver')?.trail).toBe('Pensar e resolver');
    expect(seriesForTrail('Primeiro emprego')).toBeNull();
    expect(seriesForTrail('Convivência')).toBeNull();
    expect(seriesForTrail(null)).toBeNull();
  });

  it('parte do curso: número, total e a trilha precisa bater', async () => {
    const { seriesPartOf } = await import('../src/trails');
    expect(seriesPartOf('discordar-sem-brigar')).toMatchObject({ part: 2, total: 3 });
    expect(seriesPartOf('ia-como-aliada', 'Tecnologia com critério')).toMatchObject({ part: 3, total: 3 });
    expect(seriesPartOf('ia-como-aliada', 'Autonomia no trabalho')).toBeNull();
    expect(seriesPartOf('meu-primeiro-dia')).toBeNull();
    expect(seriesPartOf(undefined)).toBeNull();
  });

  it('ordena pelas partes sem alterar a entrada', async () => {
    const { seriesForTrail, sortBySeriesOrder } = await import('../src/trails');
    const s = seriesForTrail('Pensar e resolver')!;
    const input = [{ slug: 'onde-esta-o-problema' }, { slug: 'outro' }, { slug: 'por-onde-eu-comeco' }, { slug: 'faz-sentido' }];
    expect(sortBySeriesOrder(s, input, (x) => x.slug).map((x) => x.slug)).toEqual(['por-onde-eu-comeco', 'faz-sentido', 'onde-esta-o-problema', 'outro']);
    expect(input[0]!.slug).toBe('onde-esta-o-problema');
  });
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PresentationSchema, spokenWords } from '@lms/course-schema';
import { GESTOS_PROIBIDOS_RE, juntarCitacoes, lerPacote, objetivoVoce, validarPacote } from '../src/scripts/pacote-15/construir';
import { aula3Patricia, FABRICAS, FUNDIDOS, TRILHA_FINAL } from '../src/scripts/pacote-15/final';
import { construirCurso, validarCurso } from '../src/scripts/pacote-15/montagem';
import { TRAIL_CHECKS } from '@lms/course-schema';
import { INSTRUTORES } from '../src/scripts/pacote-15/dados';
import { ABERTURA_AULA_2, ATIVIDADES, DECISOES, FECHAMENTOS, opcoesEmOrdem, POSICAO_RECOMENDADA } from '../src/scripts/pacote-15/editorial';
import { stableJson } from '../src/scripts/import-markdown-course';

/* Importador do pacote-15: parte pura (sem banco, sem rede, nada pago). Estúdio com zonas simulado por três câmeras prontas. */
const PACOTE = path.resolve(__dirname, '../../../docs/novos-cursos/pacote-15');
const presentation = PresentationSchema.parse({
  avatarId: 'look_34',
  avatarName: 'Teste',
  presenterPronoun: 'she',
  cameras: [
    { id: 'cam_t_34', name: '3/4', lookId: 'look_34', placement: 'full_frame', zone: 'center' },
    { id: 'cam_t_esq', name: 'Esq', lookId: 'look_esq', placement: 'full_frame', zone: 'left' },
    { id: 'cam_t_dir', name: 'Dir', lookId: 'look_dir', placement: 'full_frame', zone: 'right' },
  ],
});
const instrutor = { nome: 'Teste', papel: 'Sua orientadora', pronome: 'she' as const };
const pacote = lerPacote(PACOTE);
const cursoDe = (slug: string) => pacote.cursos.find((x) => x.curso.slug_proposto === slug)!.curso;
const opcoes = { presentation, presenter: { name: 'Teste', role: 'Sua orientadora' }, direction: true };
const finais = Object.keys(FABRICAS);
const construir = (slug: string) => { const aulas = FABRICAS[slug]!(cursoDe); return { aulas, ...construirCurso(cursoDe(slug), aulas, instrutor, 'classica', opcoes, undefined, undefined, TRILHA_FINAL[slug]) }; };

describe('pacote-15: o pacote', () => {
  it('15 cursos, 30 aulas, 60 falas, 30 decisões, 90 retornos e 30 práticas, ligados e iguais ao roteiro.md', () => {
    expect(validarPacote(pacote)).toEqual([]);
    expect(pacote.cursos).toHaveLength(15);
  });
  it('todo instrutor sugerido tem kit mapeado', () => {
    for (const { curso } of pacote.cursos) expect(INSTRUTORES[curso.instructor_proposed], curso.instructor_proposed).toBeTruthy();
  });
  it('objetivo da aula vira "Você …" (competência), com verbo conhecido', () => {
    for (const { curso } of pacote.cursos) for (const a of curso.lessons) expect(objetivoVoce(curso, a)).toMatch(/^Você [a-zê]+/);
  });
});

describe('pacote-15: ajustes de padrão do motor', () => {
  it('a recomendada fica 10× em cada posição, nunca é a mais longa e a diferença de tamanho é pequena', () => {
    const pos = [0, 0, 0];
    for (const [k] of Object.entries(DECISOES)) {
      const o = opcoesEmOrdem(k);
      const i = o.findIndex((x) => x.q === 'strong');
      pos[i]!++;
      const w = o.map((x) => spokenWords(x.t).length);
      expect(w[i]!, k).toBeLessThanOrEqual(Math.max(...w.filter((_, j) => j !== i)));
      expect(Math.max(...w) - Math.min(...w), k).toBeLessThanOrEqual(5);
      expect(o.filter((x) => x.q === 'strong')).toHaveLength(1);
      for (const x of o) expect(x.f, k).toMatch(/Faça assim: /);
    }
    expect(pos).toEqual([10, 10, 10]);
    expect(POSICAO_RECOMENDADA).toHaveLength(30);
  });
  it('usa as três qualidades (strong, ok e weak) de verdade', () => {
    const q = new Set(Object.keys(DECISOES).flatMap((k) => opcoesEmOrdem(k).map((o) => o.q)));
    expect([...q].sort()).toEqual(['ok', 'strong', 'weak']);
  });
  it('30 fechamentos diferentes, sem o texto genérico do pacote', () => {
    const f = Object.values(FECHAMENTOS);
    expect(new Set(f).size).toBe(30);
    for (const t of f) expect(t).not.toMatch(/Guarde esse exemplo|ao que você sabe e ao que ainda precisa confirmar/);
  });
  it('30 atividades por grupos: 2 a 4 grupos, cada um com pergunta e 2 a 5 opções', () => {
    expect(Object.keys(ATIVIDADES)).toHaveLength(30);
    for (const [k, a] of Object.entries(ATIVIDADES)) {
      expect(a.grupos.length, k).toBeGreaterThanOrEqual(2);
      expect(a.grupos.length, k).toBeLessThanOrEqual(4);
      for (const g of a.grupos) {
        expect(g.q.trim(), k).not.toBe('');
        expect(g.opcoes.length, `${k}/${g.id}`).toBeGreaterThanOrEqual(2);
        expect(g.opcoes.length, `${k}/${g.id}`).toBeLessThanOrEqual(5);
      }
    }
  });
  it('abertura da aula 2: "Agora, vamos…", em todos os cursos', () => {
    expect(Object.keys(ABERTURA_AULA_2)).toHaveLength(15);
    for (const t of Object.values(ABERTURA_AULA_2)) expect(t).toMatch(/^Agora, vamos /);
  });
  it('juntarCitacoes une planos que cortam uma citação ao meio', () => {
    const r = juntarCitacoes([{ line: 'Pode dizer: ‘Entendi.' }, { line: 'Não vou repetir’. Pronto.' }, { line: 'Outra frase.' }]);
    expect(r.map((x) => x.line)).toEqual(['Pode dizer: ‘Entendi. Não vou repetir’. Pronto.', 'Outra frase.']);
  });
});

describe('pacote-15: documento gerado (os 12 cursos finais + a aula 3)', () => {
  it('12 cursos finais, 3 fundidos e todos os 15 do pacote contabilizados', () => {
    expect(finais).toHaveLength(12);
    expect(Object.keys(FUNDIDOS)).toHaveLength(3);
    expect(new Set([...finais, ...Object.keys(FUNDIDOS)]).size).toBe(15);
    expect(pacote.cursos.map((x) => x.curso.slug_proposto).sort()).toEqual([...finais, ...Object.keys(FUNDIDOS)].sort());
  });
  it('todos compilam e passam nas conferências (9 rotas por aula, chamada falada, fala = planos, 2 decisões por aula)', () => {
    let decisoes = 0;
    let aulasTotal = 0;
    const pos = [0, 0, 0];
    let maisLonga = 0;
    for (const slug of finais) {
      const { document, aulas } = construir(slug);
      const v = validarCurso(document, cursoDe(slug), aulas);
      expect(v.erros, slug).toEqual([]);
      expect(v.resumo.decisoes, slug).toBe(aulas.length * 2);
      decisoes += v.resumo.decisoes;
      aulasTotal += v.resumo.aulas;
      v.resumo.posicaoRecomendada.forEach((p) => pos[p]!++);
      maisLonga += v.resumo.recomendadaMaisLonga;
    }
    expect(aulasTotal).toBe(25);
    expect(decisoes).toBe(50);
    // a recomendada não fica sempre na mesma posição e quase nunca é a mais longa
    for (const n of pos) expect(n).toBeGreaterThanOrEqual(14);
    expect(maisLonga).toBeLessThanOrEqual(6);
  });
  it('tudo-e-urgente tem 3 vídeos na aula 2 (fusão) e onde-esta-o-problema tem 3 aulas', () => {
    expect(construir('tudo-e-urgente').document.modules[0]!.lessons[1]!.graph.nodes.filter((n) => n.type === 'content' || n.type === 'scenario')).toHaveLength(3);
    expect(construir('onde-esta-o-problema').document.modules[0]!.lessons).toHaveLength(3);
  });
  it('a aula 3 de "Liberdade e intimidade…" nasce com ids que não colidem com as aulas 1 e 2 (v00–v03, q01–q03, m01–m02)', () => {
    const a3 = aula3Patricia(cursoDe);
    const r = construirCurso(cursoDe('nem-toda-brincadeira'), [a3], instrutor, 'classica', opcoes, undefined, { cod: { v: 4, q: 4, a: 3 }, numeroPrimeiraAula: 3 });
    const v = validarCurso(r.document, cursoDe('nem-toda-brincadeira'), [a3], { primeiraAulaNoCurso: false, cod: { v: 4, q: 4, a: 3 } });
    expect(v.erros).toEqual([]);
    const l = r.document.modules[0]!.lessons[0]!;
    expect(l.id).toBe('aula_03');
    expect(l.graph.nodes.map((n) => n.id)).toEqual(['v04', 'q04', 'v05', 'q05', 'a03', 'fim_aula_03']);
  });
  it('nenhuma cena nasce com mídia, nem avaliação de fim de módulo, nem gesto de mãos', () => {
    for (const slug of finais) {
      const { document } = construir(slug);
      for (const l of document.modules[0]!.lessons) {
        expect(l.graph.nodes.some((n) => n.type === 'assessment')).toBe(false);
        for (const n of l.graph.nodes) {
          expect((n as { media?: unknown }).media).toBeUndefined();
          if (n.type === 'choice') for (const o of n.options) expect(o.reaction?.media).toBeUndefined();
          if ('direction' in n && n.direction) for (const s of n.direction.shots) expect(s.motionPrompt ?? '').not.toMatch(GESTOS_PROIBIDOS_RE);
        }
      }
    }
  });
  it('marca a origem do pacote, a trilha final e deixa produção e revisão pendentes', () => {
    const { document } = construir('o-outro-so-e-diferente');
    expect(document.brief.sourcesNote.startsWith('[pacote-15:dna-proposta-o-outro-so-e-diferente]')).toBe(true);
    expect(document.brief.sourcesNote).toContain('Respeito e diálogo');
    expect(document.wizard.completedSteps).not.toContain('producao');
    expect(document.wizard.completedSteps).not.toContain('revisao');
    expect(document.completion.requiredLessonIds).toEqual(['aula_01', 'aula_02']);
  });
  it('é determinístico: construir duas vezes dá o mesmo documento (base da reimportação sem duplicar)', () => {
    for (const slug of finais) expect(stableJson(construir(slug).document)).toBe(stableJson(construir(slug).document));
  });
});

describe('pacote-15: trilhas novas e checagem final', () => {
  const novas = ['Respeito e diálogo', 'Tecnologia com critério', 'Autonomia no trabalho', 'Pensar e resolver'];
  it('os cursos finais estão nas 4 trilhas novas (3 por trilha)', () => {
    for (const t of novas) expect(Object.values(TRILHA_FINAL).filter((x) => x === t), t).toHaveLength(3);
    expect(Object.keys(TRILHA_FINAL).sort()).toEqual([...finais].sort());
  });
  it('cada trilha nova tem checagem final com 6 situações, 3 opções e 1 correta', () => {
    for (const t of novas) {
      const c = Object.values(TRAIL_CHECKS).find((x) => x.trail === t);
      expect(c, t).toBeTruthy();
      expect(c!.situations).toHaveLength(6);
      for (const s of c!.situations) {
        expect(s.options).toHaveLength(3);
        expect(s.options.filter((o) => o.correct)).toHaveLength(1);
      }
    }
  });
});

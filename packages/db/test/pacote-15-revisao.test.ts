import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleScaffold, PresentationSchema, richTextToPlain, spokenWords, TRAIL_CHECKS, type AnyNode, type ChoiceNode, type CourseDocument } from '@lms/course-schema';
import { lerPacote } from '../src/scripts/pacote-15/construir';
import { aula3Patricia, CORRECOES_DE_FALA, FABRICAS, TRILHA_FINAL } from '../src/scripts/pacote-15/final';
import { construirCurso, validarCurso } from '../src/scripts/pacote-15/montagem';
import { PLANOS } from '../src/scripts/pacote-15/planos';

/**
 * Revisão pré-gravação (docs/novos-cursos/revisao-pre-gravacao.md): cada uma das correções do bloco JSON do relatório tem de estar,
 * palavra por palavra, no documento que o importador gera. O relatório é a fonte da conferência: o teste lê o próprio bloco ```json.
 */
const RAIZ = path.resolve(__dirname, '../../..');
const relatorio = readFileSync(path.join(RAIZ, 'docs/novos-cursos/revisao-pre-gravacao.md'), 'utf8');
interface Correcao { curso: string; aula: string; no: string; campo: string; texto_novo: string }
const CORRECOES = JSON.parse(relatorio.match(/```json\n([\s\S]*?)```/)![1]!) as Correcao[];

const SLUG: Record<string, string> = {
  crs_t303ykqfmhj3yb1g: 'o-outro-so-e-diferente', crs_m60hsx8on6ebcyqg: 'ia-como-aliada', crs_au1463izc386by27: 'parece-verdade-sera',
  crs_tg9iqz8wmmf5pw77: 'seus-dados-tambem-trabalham', crs_4jh683s5h351z2db: 'tudo-e-urgente', crs_njtlqq7y7fyfeqcr: 'errei-e-agora',
  crs_5k5upah2xphlfvi5: 'minha-ideia-tambem-conta', crs_2rt2rsoii8bpydp2: 'discordar-sem-brigar', crs_gl0hjkmqfgnnur9y: 'aprender-faz-parte',
  crs_dp9s7pdro9j6e3m0: 'por-onde-eu-comeco', crs_0ua5onij460lpzs0: 'faz-sentido', crs_d5rsi8gt36rv0qbq: 'onde-esta-o-problema',
  crs_b8zeh4b2gguseghq: 'nem-toda-brincadeira',
};

const presentation = PresentationSchema.parse({
  avatarId: 'look_34', avatarName: 'Teste', presenterPronoun: 'she',
  cameras: [
    { id: 'cam_t_34', name: '3/4', lookId: 'look_34', placement: 'full_frame', zone: 'center' },
    { id: 'cam_t_esq', name: 'Esq', lookId: 'look_esq', placement: 'full_frame', zone: 'left' },
    { id: 'cam_t_dir', name: 'Dir', lookId: 'look_dir', placement: 'full_frame', zone: 'right' },
  ],
});
const INSTRUTOR: Record<string, { nome: string; papel: string; pronome: 'she' | 'he' }> = {
  'seus-dados-tambem-trabalham': { nome: 'Thiago', papel: 'Seu orientador', pronome: 'he' },
  'aprender-faz-parte': { nome: 'Helena', papel: 'Sua orientadora', pronome: 'she' },
};
const instrutorDe = (slug: string) => INSTRUTOR[slug] ?? { nome: 'Teste', papel: 'Sua orientadora', pronome: 'she' as const };
const opcoesDe = (slug: string) => ({ presentation, presenter: { name: instrutorDe(slug).nome, role: instrutorDe(slug).papel }, direction: true });
const pacote = lerPacote(path.join(RAIZ, 'docs/novos-cursos/pacote-15'));
const cursoDe = (slug: string) => pacote.cursos.find((x) => x.curso.slug_proposto === slug)!.curso;
const COD3 = { v: 4, q: 4, a: 3 };

const construidos = new Map<string, { document: CourseDocument; aulas: ReturnType<(typeof FABRICAS)[string]> }>();
function curso(slug: string) {
  if (!construidos.has(slug)) {
    if (slug === 'nem-toda-brincadeira') {
      const a3 = aula3Patricia(cursoDe);
      const r = construirCurso(cursoDe(slug), [a3], instrutorDe(slug), 'classica', opcoesDe(slug), undefined, { cod: COD3, numeroPrimeiraAula: 3 });
      construidos.set(slug, { document: r.document, aulas: [a3] });
    } else {
      const aulas = FABRICAS[slug]!(cursoDe);
      const r = construirCurso(cursoDe(slug), aulas, instrutorDe(slug), 'classica', opcoesDe(slug), undefined, undefined, TRILHA_FINAL[slug]);
      construidos.set(slug, { document: r.document, aulas });
    }
  }
  return construidos.get(slug)!;
}
const lessonOf = (c: Correcao) => curso(SLUG[c.curso]!).document.modules.flatMap((m) => m.lessons).find((l) => l.id === c.aula)!;
const nodeOf = (c: Correcao): AnyNode => lessonOf(c).graph.nodes.find((n) => n.id === c.no)!;
const plain = (d: Parameters<typeof richTextToPlain>[0]) => richTextToPlain(d).replace(/\n+/g, '\n').trim();
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Onde o importador (ou a regra do motor) obriga a um texto diferente do JSON do relatório. Chave: `<curso> <aula>/<cena> <campo>`.
 * "O trabalho cabe no tempo" não é dito na fala (a fala diz "caiba no tempo"), e uma pílula tem de ser dita palavra por palavra.
 */
const EXCECOES: Record<string, string> = {
  'crs_4jh683s5h351z2db aula_02/v05 slide': 'Depois do pedido · **Quando será revisto** · Pergunte **quem pode ajudar** · O trabalho **caiba no tempo**',
};

describe('revisão pré-gravação: as correções do relatório estão no documento gerado', () => {
  it('o relatório traz as 141 correções e todas apontam para cursos e aulas que o importador gera', () => {
    expect(CORRECOES).toHaveLength(141);
    for (const c of CORRECOES) expect(SLUG[c.curso], c.curso).toBeTruthy();
  });

  for (const [i, c] of CORRECOES.entries()) {
    const nome = `${String(i + 1).padStart(3, '0')} ${SLUG[c.curso]} ${c.aula}/${c.no} ${c.campo}`;
    it(nome, () => {
      const [campo, arg] = c.campo.split(':') as [string, string | undefined];
      const nova = EXCECOES[`${c.curso} ${c.aula}/${c.no} ${c.campo}`] ?? c.texto_novo;
      const l = lessonOf(c);
      if (campo === 'shot') {
        const n = nodeOf(c) as Extract<AnyNode, { direction?: unknown }> & { direction: { shots: Array<{ id: string; line: string; layout: string; motionPrompt?: string }> } };
        const mais = arg!.endsWith('+');
        const id = mais ? arg!.slice(0, -1) : arg!;
        const plano = n.direction.shots.find((s) => s.id === id);
        expect(plano, `plano ${id}`).toBeTruthy();
        expect(norm(plano!.line)).toBe(norm(nova));
        if (mais) {
          // plano novo: gesto contido
          expect(['nods slowly, warm', 'hands relaxed at the waist, calm, small nods']).toContain(plano!.motionPrompt);
          expect(plano!.layout).toBe('presenter');
        }
        // a fala da cena é a soma dos planos
        expect(norm((n as { narration?: string }).narration ?? '')).toBe(norm(n.direction.shots.map((s) => s.line).join(' ')));
      } else if (campo === 'bridge_call') {
        expect((nodeOf(c) as ChoiceNode).bridge?.call).toBe(nova);
      } else if (campo === 'prompt') {
        expect(plain((nodeOf(c) as ChoiceNode).prompt!)).toBe(nova);
      } else if (campo === 'title') {
        if (c.no.startsWith('obj_')) expect(curso(SLUG[c.curso]!).document.objectives.find((o) => o.id === c.no)!.title).toBe(nova);
        else expect((nodeOf(c) as { title: string }).title).toBe(nova.replace(/[.]$/, ''));
      } else if (campo === 'description') {
        expect(l.description).toBe(nova);
      } else if (campo === 'intro') {
        expect((nodeOf(c) as { intro?: string }).intro).toBe(nova);
      } else if (campo === 'body') {
        expect(plain((nodeOf(c) as { body: Parameters<typeof richTextToPlain>[0] }).body)).toBe(nova);
      } else if (campo === 'slide') {
        const n = nodeOf(c) as { direction: { shots: Array<{ layout: string; slide?: { title: string; bullets: string[] } }> } };
        const chips = n.direction.shots.find((s) => s.layout === 'presenter_chips')!;
        expect([chips.slide!.title, ...chips.slide!.bullets].join(' · ')).toBe(nova);
      } else if (campo === 'end') {
        const n = nodeOf(c) as { summary: Parameters<typeof richTextToPlain>[0] };
        expect(plain(n.summary).split('\n')[0]).toBe(nova);
      } else if (campo === 'option_label' || campo === 'quality' || campo === 'feedback' || campo === 'reaction') {
        const n = nodeOf(c) as ChoiceNode;
        const o = n.options.find((x) => x.id === arg)!;
        if (campo === 'option_label') expect(o.label).toBe(nova);
        if (campo === 'quality') {
          expect(o.quality).toBe(nova);
          // os pontos da aresta acompanham a classificação (strong +2, ok +1, weak 0)
          const aresta = l.graph.edges.find((e) => e.from === n.id && e.optionId === o.id)!;
          const esperado = nova === 'strong' ? 2 : nova === 'ok' ? 1 : 0;
          const dado = aresta.effects?.find((e) => e.var === 'pontos');
          expect(dado && dado.op === 'inc' ? dado.by : 0, `pontos de ${aresta.id}`).toBe(esperado);
        }
        if (campo === 'feedback') expect(plain(o.feedback!)).toBe(nova);
        if (campo === 'reaction') expect(o.reaction?.text).toBe(nova);
      } else if (campo === 'scaffold') {
        const n = nodeOf(c) as { scaffold: { template: string; slots: Array<{ id: string; question?: string; label?: string; options: string[] }> } };
        const slot = (id: string) => n.scaffold.slots.find((s) => s.id === id)!;
        const chave = `${SLUG[c.curso]}/${c.aula}/${c.no}`;
        if (chave === 'o-outro-so-e-diferente/aula_02/a02') {
          expect(n.scaffold.template).toBe('{convite}? {saida}.');
          expect(slot('convite').options).toEqual(['Estamos indo almoçar. Quer vir', 'Vamos tomar um café depois do expediente. Pode ser', 'Sexta tem almoço da equipe. Quer ir com a gente']);
          // a frase montada fecha com a pergunta e a saída, sem "Quer vir. Sem problema"
          expect(assembleScaffold(n.scaffold as never, { convite: slot('convite').options[0], saida: slot('saida').options[0] })).toBe('Estamos indo almoçar. Quer vir? Sem problema se não puder.');
        } else if (chave === 'discordar-sem-brigar/aula_01/a01') expect(slot('proposta').options[0]).toBe('Podemos verificar isso antes do envio');
        else if (chave === 'seus-dados-tambem-trabalham/aula_01/a01') {
          expect(slot('c').question).toBe('O que mais pode sair?');
          expect(slot('c').label).toBe('O que mais pode sair');
        } else if (chave === 'errei-e-agora/aula_01/a01') expect(slot('passo').options[0]).toBe('Vou avisar quem recebeu e mandar a correção');
        else if (chave === 'por-onde-eu-comeco/aula_02/a02') expect(slot('e1').options[1]).toBe('Confirmar o prazo de entrega');
        else if (chave === 'nem-toda-brincadeira/aula_03/a03') {
          expect(slot('acolhe').options[1]).toBe('Que bom que você me contou');
          expect(slot('apoio').options).toEqual(['Como você quer que eu te apoie? Podemos procurar quem acompanha o seu trabalho', 'Como você quer que eu te apoie? Podemos procurar um adulto de confiança', 'Quer que eu te ajude a achar um canal seguro']);
        } else throw new Error(`scaffold sem conferência: ${chave}`);
      } else throw new Error(`campo sem conferência: ${c.campo}`);
    });
  }
});

describe('revisão pré-gravação: regras do motor continuam valendo', () => {
  const slugs = Object.keys(FABRICAS);
  it('os 12 cursos passam em todas as conferências do importador (fala = planos, chamada falada, 9 rotas, pontos pela classificação)', () => {
    for (const slug of slugs) {
      const { document, aulas } = curso(slug);
      expect(validarCurso(document, cursoDe(slug), aulas).erros, slug).toEqual([]);
    }
  });
  it('a aula 3 de "Liberdade e intimidade…" passa nas conferências', () => {
    const { document, aulas } = curso('nem-toda-brincadeira');
    expect(validarCurso(document, cursoDe('nem-toda-brincadeira'), aulas, { primeiraAulaNoCurso: false, cod: COD3 }).erros).toEqual([]);
  });
  it('todo plano novo tem gesto contido e nenhum plano pede mãos', () => {
    for (const [chave, p] of Object.entries(PLANOS)) {
      const [slug, aula, no] = chave.split('/') as [string, string, string];
      const n = curso(slug).document.modules.flatMap((m) => m.lessons).find((l) => l.id === aula)!.graph.nodes.find((x) => x.id === no) as { direction: { shots: Array<{ id: string; line: string; motionPrompt?: string }> } };
      const apres = n.direction.shots[0]!.line.match(/^Oi! Eu sou .*? neste curso da DNA Work\./)?.[0] ?? '';
      expect(n.direction.shots.map((s) => s.line), chave).toEqual(p.linhas.map((l) => l.replace('{apresentacao}', apres)));
      for (const s of n.direction.shots) expect(s.motionPrompt ?? '', `${chave}/${s.id}`).not.toMatch(/both|palms|hands(?! relaxed)/i);
    }
  });
  it('as correções de fala só valem se o trecho antigo está lá (o pacote não muda em silêncio)', () => {
    for (const k of CORRECOES_DE_FALA) expect(k.de.length).toBeGreaterThan(10);
  });
  it('as duas alternativas da revisão com duas recomendadas somam +2 cada (O outro só é diferente, aula 2, decisão 1)', () => {
    const l = curso('o-outro-so-e-diferente').document.modules[0]!.lessons[1]!;
    const q = l.graph.nodes.find((n) => n.id === 'q03') as ChoiceNode;
    expect(q.options.filter((o) => o.quality === 'strong').map((o) => o.id)).toHaveLength(2);
    for (const o of q.options.filter((x) => x.quality === 'strong')) expect(l.graph.edges.find((e) => e.from === 'q03' && e.optionId === o.id)!.effects).toEqual([{ op: 'inc', var: 'pontos', by: 2 }]);
  });
  it('a política de IA não é afirmada como fato nos cursos (a fala manda perguntar a regra do próprio trabalho)', () => {
    const { document } = curso('ia-como-aliada');
    const textos = JSON.stringify(document.modules);
    expect(textos).not.toMatch(/ferramenta autorizada|ferramenta (é )?permitida|idade mínima|política de (uso de )?IA/i);
    expect(textos).toMatch(/qual é a regra para uso de IA no seu trabalho/);
  });
  it('o canal de apoio não cita responsável pelo programa nem agente de integração', () => {
    for (const slug of [...slugs, 'nem-toda-brincadeira']) expect(JSON.stringify(curso(slug).document.modules), slug).not.toMatch(/respons[áa]vel pelo programa|agentes? de integra/i);
  });
  it('"missão" fica na fala e "Na prática" na tela', () => {
    for (const slug of slugs) {
      const l = curso(slug).document.modules[0]!.lessons[0]!;
      const abertura = l.graph.nodes.find((n) => n.type === 'scenario') as { narration: string };
      expect(abertura.narration, slug).toMatch(/tem uma missão para você: /);
      expect(l.graph.nodes.some((n) => n.type === 'reflection' && /miss[aã]o/i.test(n.title ?? ''))).toBe(false);
    }
  });
  it('a reação nunca passa de 26 palavras e as correções de reação cabem em 8 a 26', () => {
    for (const c of CORRECOES.filter((x) => x.campo.startsWith('reaction:'))) {
      const w = spokenWords(c.texto_novo).length;
      expect(w, c.texto_novo).toBeGreaterThanOrEqual(8);
      expect(w, c.texto_novo).toBeLessThanOrEqual(26);
    }
  });
  it('as quatro checagens novas existem (a correção das posições está em trails.test.ts)', () => {
    expect(Object.keys(TRAIL_CHECKS)).toEqual(expect.arrayContaining(['respeito-e-dialogo', 'tecnologia-com-criterio', 'autonomia-no-trabalho', 'pensar-e-resolver']));
  });
});

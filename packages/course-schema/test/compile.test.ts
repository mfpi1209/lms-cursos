import { describe, expect, it } from 'vitest';
import { compileLesson, compileCourse, presentationSceneryWarnings } from '../src/compile';
import { PresentationSchema } from '../src/course';
import { LessonGraphSchema } from '../src/graph';
import { comunicacaoPrimeiroEmprego } from '../src/examples';
import { richTextFromPlain as p } from '../src/richtext';
import { linearGraph } from './helpers';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('compileLesson', () => {
  it('aprova um grafo válido com bifurcação e reencontro', () => {
    const r = compileLesson(linearGraph());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.reachable.sort()).toEqual(['ca', 'cb', 'fim', 'intro', 'q']);
  });

  it('bloqueia destino inexistente com mensagem útil', () => {
    const g = linearGraph();
    g.edges[3] = { id: 'e4', from: 'ca', to: 'nao_existe' };
    const r = compileLesson(g);
    expect(r.ok).toBe(false);
    expect(codes(r.errors)).toContain('EDGE_TO_MISSING');
    expect(r.errors.find((e) => e.code === 'EDGE_TO_MISSING')?.message).toMatch(/nao_existe/);
    expect(codes(r.errors)).toContain('DEAD_END_PATH');
  });

  it('bloqueia opção sem destino', () => {
    const g = linearGraph();
    g.edges = g.edges.filter((e) => e.id !== 'e3');
    const r = compileLesson(g);
    expect(codes(r.errors)).toContain('OPTION_WITHOUT_DESTINATION');
  });

  it('bloqueia ciclo irrestrito', () => {
    const g = linearGraph();
    g.edges.push({ id: 'loop', from: 'ca', to: 'intro' });
    // ca agora tem 2 saídas sem condição: ambiguidade + ciclo
    const r = compileLesson(g);
    expect(r.ok).toBe(false);
    expect(codes(r.errors)).toContain('UNBOUNDED_CYCLE');
  });

  it('bloqueia saídas múltiplas sem fallback e empate de prioridade', () => {
    const g = linearGraph({ variables: [{ name: 'x', type: 'number', initial: 0 }] });
    g.edges = g.edges.filter((e) => e.id !== 'e4');
    g.edges.push(
      { id: 'e4a', from: 'ca', to: 'fim', condition: { op: 'gt', var: 'x', value: 1 }, priority: 1 },
      { id: 'e4b', from: 'ca', to: 'fim', condition: { op: 'lte', var: 'x', value: 1 }, priority: 1 },
    );
    const r = compileLesson(g);
    expect(codes(r.errors)).toContain('NO_FALLBACK');
    expect(codes(r.errors)).toContain('PRIORITY_TIE');
    g.edges.push({ id: 'e4c', from: 'ca', to: 'fim', isDefault: true });
    g.edges.find((e) => e.id === 'e4b')!.priority = 2;
    expect(compileLesson(g).ok).toBe(true);
  });

  it('bloqueia condição com variável não declarada ou tipo errado', () => {
    const g = linearGraph({ variables: [{ name: 'pontos', type: 'number', initial: 0 }] });
    g.edges[0] = { id: 'e1', from: 'intro', to: 'q', condition: { op: 'eq', var: 'pontos', value: 'dez' }, isDefault: true };
    const r = compileLesson(g);
    expect(codes(r.errors)).toContain('CONDITION_TYPE');
    g.edges[0] = { id: 'e1', from: 'intro', to: 'q', condition: { op: 'eq', var: 'nope', value: 1 }, isDefault: true };
    expect(codes(compileLesson(g).errors)).toContain('CONDITION_TYPE');
  });

  it('bloqueia nó inicial inexistente e bloco sem executor', () => {
    const g = linearGraph({ startNodeId: 'zzz' });
    expect(codes(compileLesson(g).errors)).toContain('START_NOT_FOUND');
    const g2 = linearGraph();
    g2.nodes.push({ id: 'd', type: 'dialogue', objectiveIds: [], required: true, character: { name: 'X', persona: 'y' }, authorizedFacts: [], goals: [], maxTurns: 3, exitNodeIds: ['fim'] });
    g2.edges[3] = { id: 'e4', from: 'ca', to: 'd' };
    g2.edges.push({ id: 'e6', from: 'd', to: 'fim' });
    expect(codes(compileLesson(g2).errors)).toContain('NODE_TYPE_NOT_EXECUTABLE');
  });

  it('avisa (não bloqueia) nó inalcançável e opção sem feedback', () => {
    const g = linearGraph();
    g.nodes.push({ id: 'orfao', type: 'content', body: p('x'), objectiveIds: [], required: true });
    g.edges.push({ id: 'e7', from: 'orfao', to: 'fim' });
    (g.nodes[1] as any).options[0].feedback = undefined;
    const r = compileLesson(g);
    expect(r.ok).toBe(true);
    expect(codes(r.warnings)).toContain('UNREACHABLE');
    expect(codes(r.warnings)).toContain('OPTION_NO_FEEDBACK');
  });

  it('valida avaliação: precisa de opção correta e modo coerente', () => {
    const g = linearGraph();
    g.nodes.splice(4, 0, { id: 'av', type: 'assessment', prompt: p('?'), objectiveIds: ['o1'], required: true, mode: 'single', maxAttempts: 2, passing: { kind: 'all_correct' }, options: [
      { id: 'x', label: 'x', correct: true }, { id: 'y', label: 'y', correct: true },
    ] });
    g.edges = g.edges.map((e) => (e.to === 'fim' ? { ...e, to: 'av' } : e));
    g.edges.push({ id: 'e8', from: 'av', to: 'fim' });
    expect(codes(compileLesson(g).errors)).toContain('ASSESSMENT_SINGLE_MULTI');
  });
});

describe('schema', () => {
  it('rejeita HTML arbitrário e nós desconhecidos', () => {
    const g = linearGraph();
    (g.nodes[0] as any).body = { type: 'doc', content: [{ type: 'html', html: '<script>' }] };
    expect(LessonGraphSchema.safeParse(g).success).toBe(false);
    const g2 = linearGraph();
    (g2.nodes[0] as any).type = 'iframe';
    expect(LessonGraphSchema.safeParse(g2).success).toBe(false);
  });
});

describe('curso seed', () => {
  it('compila sem erros', () => {
    const r = compileCourse(comunicacaoPrimeiroEmprego);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.lessons)).toEqual(['aula_negociar_prazo', 'aula_corrigir_informacao']);
  });
  it('cada aula tem ao menos uma decisão com 3 opções e consequências distintas', () => {
    for (const l of comunicacaoPrimeiroEmprego.modules[0]!.lessons) {
      const choices = l.graph.nodes.filter((n) => n.type === 'choice');
      expect(choices.some((c) => c.type === 'choice' && c.options.length >= 3)).toBe(true);
      const targets = new Set(l.graph.edges.filter((e) => e.from === choices[0]!.id).map((e) => e.to));
      expect(targets.size).toBe(3);
    }
  });
});

describe('achados da revisão', () => {
  it('opção com uma única saída condicional sem fallback é bloqueada (aluno ficaria preso)', () => {
    const g = linearGraph({ variables: [{ name: 'pts', type: 'number', initial: 0 }] });
    g.edges = g.edges.map((e) => (e.id === 'e2' ? { ...e, condition: { op: 'gte', var: 'pts', value: 1 } } : e));
    const r = compileLesson(g);
    expect(codes(r.errors)).toContain('NO_FALLBACK');
  });
  it('fallback com condição é erro (a condição seria ignorada)', () => {
    const g = linearGraph({ variables: [{ name: 'pts', type: 'number', initial: 0 }] });
    g.edges[0] = { id: 'e1', from: 'intro', to: 'q', isDefault: true, condition: { op: 'gte', var: 'pts', value: 1 } };
    expect(codes(compileLesson(g).errors)).toContain('DEFAULT_WITH_CONDITION');
  });
  it('ciclo não gera DEAD_END_PATH espúrio', () => {
    const g = linearGraph();
    g.nodes.push({ id: 'c', type: 'content', body: p('c'), objectiveIds: [], required: true });
    // intro -> q ; q(a) -> ca -> fim ; q(b) -> cb -> c -> intro (ciclo)
    g.edges = g.edges.map((e) => (e.id === 'e5' ? { ...e, to: 'c' } : e));
    g.edges.push({ id: 'loop', from: 'c', to: 'intro' });
    const r = compileLesson(g);
    expect(codes(r.errors)).toContain('UNBOUNDED_CYCLE');
    expect(codes(r.errors)).not.toContain('DEAD_END_PATH');
  });
});

describe('recap ("Meu roteiro")', () => {
  const withRecap = (recap: NonNullable<Extract<import('../src/nodes').AnyNode, { type: 'end' }>['recap']>) => {
    const g = linearGraph();
    g.nodes.push({ id: 'refl', type: 'reflection', prompt: p('?'), objectiveIds: ['o1'], required: true, minLength: 0, maxLength: 500 });
    g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'refl' } : e));
    g.edges.push({ id: 'e6', from: 'refl', to: 'fim' });
    const end = g.nodes.find((n) => n.id === 'fim')!;
    if (end.type === 'end') end.recap = recap;
    return g;
  };
  const only = (r: { errors: { code: string }[]; warnings: { code: string }[] }) => ({ e: codes(r.errors).filter((c) => c.startsWith('RECAP')), w: codes(r.warnings).filter((c) => c.startsWith('RECAP')) });

  it('aceita fontes locais com o tipo certo e itens fixos', () => {
    const g = withRecap([
      { id: 'a', label: 'Decisão', kind: 'choice', nodeId: 'q', emptyText: 'x' },
      { id: 'b', label: 'Frase', kind: 'reflection', nodeId: 'refl', emptyText: 'x' },
      { id: 'c', label: 'Lista', kind: 'checklist', items: ['um'], emptyText: 'x' },
      { id: 'd', label: 'Texto', kind: 'text', text: 'oi', emptyText: 'x' },
    ]);
    const r = compileLesson(g);
    expect(only(r)).toEqual({ e: [], w: [] });
    expect(r.ok).toBe(true);
  });

  it('bloqueia reflexão/decisão sem nodeId e com nó de tipo errado', () => {
    const g = withRecap([
      { id: 'a', label: 'Sem fonte', kind: 'reflection', emptyText: 'x' },
      { id: 'b', label: 'Tipo errado', kind: 'choice', nodeId: 'refl', emptyText: 'x' },
      { id: 'c', label: 'Tipo errado 2', kind: 'reflection', nodeId: 'intro', emptyText: 'x' },
    ]);
    const r = compileLesson(g);
    expect(r.ok).toBe(false);
    expect(only(r).e).toEqual(['RECAP_SOURCE_MISSING', 'RECAP_SOURCE_MISSING', 'RECAP_SOURCE_MISSING']);
    expect(r.errors.every((e) => e.code !== 'RECAP_SOURCE_MISSING' || e.nodeId === 'fim')).toBe(true);
  });

  it('fonte de outra aula: aviso na aula, erro/ok no curso conforme exista', () => {
    const g = withRecap([{ id: 'a', label: 'De fora', kind: 'reflection', nodeId: 'refl_outra', emptyText: 'x' }]);
    expect(only(compileLesson(g))).toEqual({ e: [], w: ['RECAP_SOURCE_MISSING'] });
    const other: import('../src/nodes').AnyNode = { id: 'refl_outra', type: 'reflection', prompt: p('?'), objectiveIds: [], required: true, minLength: 0, maxLength: 500 };
    expect(only(compileLesson(g, { externalNodes: new Map([[other.id, other]]) }))).toEqual({ e: [], w: [] });
    expect(only(compileLesson(g, { externalNodes: new Map() }))).toEqual({ e: ['RECAP_SOURCE_MISSING'], w: [] });
    const wrong: import('../src/nodes').AnyNode = { ...other, type: 'content', body: p('x') } as import('../src/nodes').AnyNode;
    expect(only(compileLesson(g, { externalNodes: new Map([[wrong.id, wrong]]) }))).toEqual({ e: ['RECAP_SOURCE_MISSING'], w: [] });
  });

  it('compileCourse enxerga nós das outras aulas', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    const l1 = doc.modules[0]!.lessons[0]!;
    const l2 = doc.modules[0]!.lessons[1]!;
    const reflOfL1 = l1.graph.nodes.find((n) => n.type === 'reflection')!;
    const endOfL2 = l2.graph.nodes.find((n) => n.type === 'end')!;
    if (endOfL2.type === 'end') endOfL2.recap = [{ id: 'a', label: 'Da aula 1', kind: 'reflection', nodeId: reflOfL1.id, emptyText: 'x' }];
    expect(only(compileCourse(doc))).toEqual({ e: [], w: [] });
    if (endOfL2.type === 'end') endOfL2.recap = [{ id: 'a', label: 'Inexistente', kind: 'reflection', nodeId: 'nao_existe', emptyText: 'x' }];
    const r = compileCourse(doc);
    expect(only(r)).toEqual({ e: ['RECAP_SOURCE_MISSING'], w: [] });
    expect(r.errors.find((e) => e.code === 'RECAP_SOURCE_MISSING')?.lessonId).toBe(l2.id);
  });

  it('bloqueia itens de roteiro com id repetido', () => {
    const g = withRecap([
      { id: 'a', label: 'Um', kind: 'text', text: 'x', emptyText: 'x' },
      { id: 'a', label: 'Dois', kind: 'text', text: 'y', emptyText: 'x' },
    ]);
    expect(only(compileLesson(g)).e).toEqual(['RECAP_DUPLICATE_ID']);
  });
});

describe('variáveis de curso (scope: course)', () => {
  const withCourseVar = (type: 'string' | 'number') => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    const [l1, l2] = doc.modules.flatMap((m) => m.lessons);
    l1!.graph.variables.push({ name: 'perfil_x', type: 'string', initial: 'a', scope: 'course' });
    l2!.graph.variables.push(type === 'string' ? { name: 'perfil_x', type: 'string', initial: 'b', scope: 'course' } : { name: 'perfil_x', type: 'number', initial: 0, scope: 'course' });
    return { doc, l2: l2! };
  };

  it('mesmo nome com o mesmo tipo em várias aulas: ok', () => {
    const { doc } = withCourseVar('string');
    const r = compileCourse(doc);
    expect(codes(r.errors)).not.toContain('COURSE_VARIABLE_TYPE_MISMATCH');
  });

  it('mesmo nome com tipos diferentes: COURSE_VARIABLE_TYPE_MISMATCH', () => {
    const { doc, l2 } = withCourseVar('number');
    const r = compileCourse(doc);
    const e = r.errors.find((x) => x.code === 'COURSE_VARIABLE_TYPE_MISMATCH');
    expect(e?.lessonId).toBe(l2.id);
    expect(e?.message).toMatch(/perfil_x/);
  });

  it('escopos misturados para o mesmo nome geram aviso', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    const [l1, l2] = doc.modules.flatMap((m) => m.lessons);
    l1!.graph.variables.push({ name: 'perfil_x', type: 'string', initial: 'a', scope: 'course' });
    l2!.graph.variables.push({ name: 'perfil_x', type: 'string', initial: 'a' });
    const r = compileCourse(doc);
    expect(codes(r.warnings)).toContain('COURSE_VARIABLE_SCOPE_MIXED');
  });

  it('condição que só lê uma variável de curso (nunca atribuída na aula) compila sem erro nem aviso de variável', () => {
    const g = linearGraph({ variables: [{ name: 'perfil', type: 'string', initial: 'x', scope: 'course' }] });
    g.edges = g.edges.filter((e) => e.from !== 'intro');
    g.edges.push(
      { id: 'c1', from: 'intro', to: 'q', condition: { op: 'eq', var: 'perfil', value: 'y' }, priority: 1 },
      { id: 'c2', from: 'intro', to: 'q', isDefault: true },
    );
    const r = compileLesson(g);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => /vari/i.test(w.message))).toEqual([]);
  });

  it('escopo ausente continua válido (documentos antigos) e o parse preserva "course"', () => {
    const parsed = LessonGraphSchema.parse({ ...linearGraph(), variables: [{ name: 'a', type: 'number', initial: 0 }, { name: 'b', type: 'number', initial: 0, scope: 'course' }] });
    expect(parsed.variables[0]!.scope).toBeUndefined();
    expect(parsed.variables[1]!.scope).toBe('course');
    expect(() => LessonGraphSchema.parse({ ...linearGraph(), variables: [{ name: 'a', type: 'number', initial: 0, scope: 'global' }] })).toThrow();
  });
});

describe('avisos do cenário com balcão (presentationSceneryWarnings)', () => {
  const pres = (over: Record<string, unknown>, bg: Record<string, unknown> = {}) => PresentationSchema.parse({ presenterPlacement: 'right', background: { type: 'image', assetId: 'ast_1', foregroundFrom: 0.85, ...bg }, ...over });
  it('sem balcão ou com a base na linha: nenhum aviso', () => {
    expect(presentationSceneryWarnings(PresentationSchema.parse({ presenterPlacement: 'right', presenterBottom: 0.7 }))).toEqual([]);
    expect(presentationSceneryWarnings(pres({ presenterBottom: 0.85 }))).toEqual([]);
    expect(presentationSceneryWarnings(pres({ presenterBottom: 0.84 }))).toEqual([]);
    expect(presentationSceneryWarnings(pres({}))).toEqual([]);
  });
  it('base acima da linha do balcão (> 2%): apresentadora flutuando — no curso e na câmera', () => {
    expect(codes(presentationSceneryWarnings(pres({ presenterBottom: 0.8 })))).toEqual(['PRESENTER_ABOVE_DESK']);
    const withCam = pres({ cameras: [{ id: 'c', name: 'Lateral', lookId: 'l', bottom: 0.7 }] });
    const w = presentationSceneryWarnings(withCam);
    expect(codes(w)).toEqual(['PRESENTER_ABOVE_DESK']);
    expect(w[0]!.message).toMatch(/Lateral/);
  });
  it('balcão sem montagem nossa (centro): aviso de que a faixa não tem efeito', () => {
    expect(codes(presentationSceneryWarnings(pres({ presenterPlacement: 'center' })))).toEqual(['FOREGROUND_WITHOUT_PLACEMENT']);
    // uma câmera à direita basta para a faixa valer
    expect(presentationSceneryWarnings(pres({ presenterPlacement: 'center', cameras: [{ id: 'c', name: 'C', lookId: 'l', placement: 'right' }] }))).toEqual([]);
  });
  it('enquadramento fora da imagem ou fora de 16:9: avisos (a montagem corrige a altura)', () => {
    expect(codes(presentationSceneryWarnings(pres({}, { frame: { x: 0.5, y: 0, w: 0.8, h: 0.8 } })))).toContain('BACKGROUND_FRAME_OUT_OF_BOUNDS');
    const w = presentationSceneryWarnings(pres({}, { frame: { x: 0, y: 0, w: 0.8, h: 0.5 } }));
    expect(codes(w)).toContain('BACKGROUND_FRAME_ASPECT');
    expect(w.find((i) => i.code === 'BACKGROUND_FRAME_ASPECT')!.message).toMatch(/80%/);
    expect(presentationSceneryWarnings(pres({}, { frame: { x: 250 / 1920, y: 0, w: 1529 / 1920, h: 860 / 1080 } }))).toEqual([]);
  });
  it('compileCourse inclui os avisos do cenário', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    doc.presentation = pres({ presenterBottom: 0.7 });
    expect(codes(compileCourse(doc).warnings)).toContain('PRESENTER_ABOVE_DESK');
  });
});

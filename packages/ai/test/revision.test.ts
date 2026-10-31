import { describe, expect, it } from 'vitest';
import { allLessons, compileLesson, comunicacaoPrimeiroEmprego, richTextToPlain } from '@lms/course-schema';
import {
  FakeLlmAdapter, applyScriptToGraph, createTemplateFakeAdapter, graphToScript, graphToScriptWithWarnings, proposeSceneVariations, reviseLesson, scriptToGraph, swapScene,
  type LessonScene, type LessonScript, type SceneVariations, type StructuredRequest,
} from '../src';

const course = comunicacaoPrimeiroEmprego;
const lesson1 = allLessons(course)[0]!;
const objectiveIds = new Set(course.objectives.map((o) => o.id));
const baseArgs = {
  title: course.title, brief: { tema: course.brief.topic }, objectives: course.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion })),
  lesson: { id: lesson1.id, title: lesson1.title, description: lesson1.description, family: lesson1.family, estimatedMinutes: lesson1.estimatedMinutes, objectiveIds: lesson1.objectiveIds },
  otherLessons: [], sourcesExcerpt: '',
};

describe('graphToScript (inverso de scriptToGraph)', () => {
  it('ida e volta das aulas do curso-exemplo: mesmos ids/tipos, compila sem erros', () => {
    for (const l of allLessons(course)) {
      const script = graphToScript(l.graph);
      expect(script.scenes[0]!.id).toBe(l.graph.startNodeId);
      const back = scriptToGraph(script);
      expect(back.nodes.map((n) => [n.id, n.type])).toEqual(l.graph.nodes.map((n) => [n.id, n.type]));
      expect(back.startNodeId).toBe(l.graph.startNodeId);
      const c = compileLesson(back, { objectiveIds });
      expect(c.errors).toEqual([]);
      // destinos preservados aresta a aresta (ids de aresta são regenerados)
      const key = (e: { from: string; to: string; optionId?: string }) => `${e.from}>${e.optionId ?? ''}>${e.to}`;
      expect(back.edges.map(key).sort()).toEqual(l.graph.edges.map(key).sort());
    }
  });

  it('converte texto rico (listas, títulos) em texto puro e preserva avaliação e reflexão', () => {
    const script = graphToScript(lesson1.graph);
    const conteudo = script.scenes.find((s) => s.id === 'conteudo_negociar')!;
    expect(conteudo.text).toMatch(/Quatro passos que funcionam/);
    const aval = script.scenes.find((s) => s.type === 'assessment')!;
    expect(aval.assessment).toMatchObject({ mode: 'single', passing: 'all_correct' });
    expect(aval.options!.some((o) => o.correct)).toBe(true);
    const refl = script.scenes.find((s) => s.type === 'reflection')!;
    expect(refl.reflection).toMatchObject({ minLength: 40, maxLength: 1200 });
  });

  it('relata o que o roteiro não carrega (variáveis, efeitos, arestas condicionais)', () => {
    const { warnings } = graphToScriptWithWarnings(lesson1.graph);
    expect(warnings.some((w) => /variáveis/.test(w))).toBe(true);
    expect(warnings.some((w) => /efeitos/.test(w))).toBe(true);
    const g = structuredClone(lesson1.graph);
    g.edges.push({ id: 'e_cond', from: 'conteudo_negociar', to: 'fim_prazo', condition: { op: 'gte', left: { var: 'confianca' }, right: 2 } as never, priority: 1 });
    const idx = g.edges.findIndex((e) => e.from === 'conteudo_negociar' && e.id !== 'e_cond');
    g.edges[idx] = { ...g.edges[idx]!, isDefault: true };
    const r = graphToScriptWithWarnings(g);
    expect(r.warnings.some((w) => /condicional/.test(w))).toBe(true);
    expect(r.script.scenes.find((s) => s.id === 'conteudo_negociar')!.next).toBe(lesson1.graph.edges.find((e) => e.from === 'conteudo_negociar')!.to);
  });

  it('applyScriptToGraph preserva variáveis, efeitos, mídia e layout dos nós mantidos', () => {
    const original = structuredClone(lesson1.graph);
    original.layout.positions['decisao_prazo'] = { x: 10, y: 20 };
    (original.nodes.find((n) => n.id === 'decisao_prazo') as { media?: unknown }).media = { assetId: 'ast_1', kind: 'image', alt: 'x' };
    const script = graphToScript(original);
    const next = applyScriptToGraph(original, script);
    expect(next.variables).toEqual(original.variables);
    expect(next.layout.positions['decisao_prazo']).toEqual({ x: 10, y: 20 });
    expect((next.nodes.find((n) => n.id === 'decisao_prazo') as { media?: unknown }).media).toMatchObject({ assetId: 'ast_1' });
    expect((next.nodes.find((n) => n.id === 'cons_negocia') as { effects?: unknown[] }).effects).toHaveLength(1);
    expect(compileLesson(next, { objectiveIds }).errors).toEqual([]);
  });
});

describe('reviseLesson', () => {
  it('envia o roteiro atual, o foco e o pedido; devolve grafo revisado com extras preservados', async () => {
    const fake = new FakeLlmAdapter({
      revise_lesson: (req: StructuredRequest<unknown>) => {
        const script = JSON.parse(/<roteiro_atual>\n([\s\S]*?)\n<\/roteiro_atual>/.exec(req.input)![1]!) as LessonScript;
        return { ...script, rationale: 'Encurtei.', scenes: script.scenes.map((s) => (s.id === 'conteudo_negociar' ? { ...s, text: 'Texto curto.' } : s)) };
      },
    });
    const r = await reviseLesson({ primary: fake }, { ...baseArgs, graph: lesson1.graph, instruction: 'deixe mais curto', focus: 'tone' });
    expect(fake.calls[0]!.task).toBe('revise_lesson');
    expect(fake.calls[0]!.input).toMatch(/<foco>\ntone/);
    expect(fake.calls[0]!.input).toMatch(/deixe mais curto/);
    expect(fake.calls[0]!.input).toMatch(/REVISAR o roteiro/);
    expect(r.issues.errors).toBe(0);
    expect(r.rationale).toBe('Encurtei.');
    expect(r.conversionWarnings.length).toBeGreaterThan(0);
    const node = r.graph.nodes.find((n) => n.id === 'conteudo_negociar')!;
    expect(node.type === 'content' && richTextToPlain(node.body)).toBe('Texto curto.');
    expect(r.graph.variables).toEqual(lesson1.graph.variables);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(lesson1.graph.nodes.map((n) => n.id));
  });

  it('pede reparo com a tarefa revise_lesson_repair quando a revisão quebra o grafo', async () => {
    const good = graphToScript(lesson1.graph);
    const broken: LessonScript = { ...good, scenes: good.scenes.map((s) => (s.id === 'cons_recusa' ? { ...s, next: 'nao_existe' } : s)) };
    const fake = new FakeLlmAdapter({ revise_lesson: broken, revise_lesson_repair: good });
    const r = await reviseLesson({ primary: fake }, { ...baseArgs, graph: lesson1.graph, instruction: 'x' });
    expect(fake.calls.map((c) => c.task)).toEqual(['revise_lesson', 'revise_lesson_repair']);
    expect(fake.calls[1]!.input).toMatch(/falhou na validação/);
    expect(r.meta.repairs).toBe(1);
    expect(r.issues.errors).toBe(0);
  });

  it('recusa aulas sem cenas (placeholder)', async () => {
    const placeholder = scriptToGraph({ rationale: '', scenes: [
      { id: 'inicio', type: 'scenario', title: 'a', text: 'a', narration: '', motionPrompt: '', objectiveIds: [], next: 'fim', options: null, tone: null, guidance: null, assessment: null, reflection: null },
      { id: 'fim', type: 'end', title: 'f', text: 'f', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null },
    ] } as LessonScript);
    await expect(reviseLesson({ primary: new FakeLlmAdapter({}) }, { ...baseArgs, graph: placeholder })).rejects.toThrow(/gere a aula/);
  });
});

describe('proposeSceneVariations', () => {
  const script = graphToScript(lesson1.graph);
  const target = script.scenes.find((s) => s.id === 'decisao_prazo')!;
  const variation = (label: string, patch: Partial<LessonScene>): SceneVariations['variations'][number] => ({ label, scene: { ...target, ...patch } });

  it('devolve variações válidas com o grafo completo aplicado; normaliza o id da cena', async () => {
    const fake = new FakeLlmAdapter({ scene_variations: { rationale: 'ok', variations: [
      variation('Mais pressão', { title: 'Sexta às 17h' }),
      variation('Id trocado', { id: 'outro_id', title: 'Outro título' }),
    ] } });
    const r = await proposeSceneVariations({ primary: fake }, { ...baseArgs, graph: lesson1.graph, sceneId: 'decisao_prazo' });
    expect(fake.calls[0]!.input).toMatch(/<cena_alvo>\nid: decisao_prazo\ntipo: choice/);
    expect(r.variations).toHaveLength(2);
    expect(r.variations.every((v) => v.scene.id === 'decisao_prazo')).toBe(true);
    expect(r.variations[1]!.graph.nodes.find((n) => n.id === 'decisao_prazo')!.title).toBe('Outro título');
    // demais nós intactos e grafo compila
    for (const v of r.variations) {
      expect(v.issues.errors).toBe(0);
      expect(v.graph.nodes.filter((n) => n.id !== 'decisao_prazo')).toEqual(applyScriptToGraph(lesson1.graph, script).nodes.filter((n) => n.id !== 'decisao_prazo'));
    }
  });

  it('variação com destino inexistente motiva reparo; se persistir, é descartada', async () => {
    const bad = variation('Quebrada', { options: target.options!.map((o, i) => (i === 0 ? { ...o, next: 'nao_existe' } : o)) });
    const ok = variation('Boa', { title: 'Boa' });
    const fake = new FakeLlmAdapter({ scene_variations: { rationale: 'r', variations: [bad, ok] }, scene_variations_repair: { rationale: 'r2', variations: [bad, ok] } });
    const r = await proposeSceneVariations({ primary: fake }, { ...baseArgs, graph: lesson1.graph, sceneId: 'decisao_prazo' });
    expect(fake.calls.map((c) => c.task)).toEqual(['scene_variations', 'scene_variations_repair']);
    expect(fake.calls[1]!.input).toMatch(/OPTION_WITHOUT_DESTINATION/);
    expect(r.variations.map((v) => v.label)).toEqual(['Boa']);
    expect(r.meta.repairs).toBe(1);
  });

  it('recusa cenas que não são decisão nem consequência e tipo trocado', async () => {
    await expect(proposeSceneVariations({ primary: new FakeLlmAdapter({}) }, { ...baseArgs, graph: lesson1.graph, sceneId: 'conteudo_negociar' })).rejects.toThrow(/decisões e consequências/);
    const wrongType = { rationale: 'r', variations: [variation('a', { type: 'content', options: null }), variation('b', { type: 'content', options: null })] };
    const fake = new FakeLlmAdapter({ scene_variations: wrongType, scene_variations_repair: wrongType });
    await expect(proposeSceneVariations({ primary: fake }, { ...baseArgs, graph: lesson1.graph, sceneId: 'decisao_prazo' })).rejects.toThrow(/Nenhuma variação válida/);
  });

  it('swapScene substitui apenas a cena de mesmo id', () => {
    const swapped = swapScene(script, { ...target, title: 'Novo' });
    expect(swapped.scenes.find((s) => s.id === 'decisao_prazo')!.title).toBe('Novo');
    expect(swapped.scenes.filter((s) => s.id !== 'decisao_prazo')).toEqual(script.scenes.filter((s) => s.id !== 'decisao_prazo'));
  });
});

describe('modelos de demonstração (revisão e variações)', () => {
  const set = { primary: createTemplateFakeAdapter() };
  it('revisão devolve o roteiro com títulos "(revisado)" e estrutura intacta', async () => {
    const r = await reviseLesson(set, { ...baseArgs, graph: lesson1.graph, focus: 'more_plausible_options' });
    expect(r.issues.errors).toBe(0);
    expect(r.graph.nodes.every((n) => n.title?.endsWith('(revisado)'))).toBe(true);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(lesson1.graph.nodes.map((n) => n.id));
    expect(r.rationale).toMatch(/more_plausible_options/);
  });
  it('variações devolvem 2 alternativas válidas para decisão e para consequência', async () => {
    const d = await proposeSceneVariations(set, { ...baseArgs, graph: lesson1.graph, sceneId: 'decisao_prazo' });
    expect(d.variations).toHaveLength(2);
    expect(d.variations[0]!.scene.options![0]!.label).toMatch(/^Em poucas palavras:/);
    const c = await proposeSceneVariations(set, { ...baseArgs, graph: lesson1.graph, sceneId: 'cons_aceita' });
    expect(c.variations).toHaveLength(2);
    expect(c.variations[1]!.scene.tone).toBe('neutral');
    expect(c.variations.every((v) => v.issues.errors === 0)).toBe(true);
  });
});

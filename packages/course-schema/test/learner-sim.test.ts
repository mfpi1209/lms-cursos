import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEARNERS,
  emptyCourseDocument,
  LearnerProfileDataSchema,
  podeEntrarLight,
  richTextFromPlain as p,
  simulateLearner,
  summarizeOpinions,
  unexplainedJargon,
  walkLesson,
  type CourseDocument,
  type LearnerProfileData,
} from '../src';
import { linearGraph } from './helpers';

const profile = (over: Partial<LearnerProfileData> = {}): LearnerProfileData => LearnerProfileDataSchema.parse({ name: 'Ana Clara', age: 17, city: 'Belém (PA)', traits: ['shy'], ...over });

function course(graph = linearGraph()): CourseDocument {
  const doc = emptyCourseDocument('Teste');
  doc.modules = [{ id: 'm1', title: 'M1', description: '', lessons: [{ id: 'l1', title: 'Aula 1', description: '', estimatedMinutes: 3, family: 'decision_consequence', objectiveIds: [], graph }] }];
  return doc;
}

describe('alunos de teste: caminho', () => {
  it('segue a aresta da opção escolhida pelo estilo', () => {
    const g = linearGraph();
    const choice = g.nodes.find((n) => n.type === 'choice')!;
    if (choice.type === 'choice') {
      choice.options[0]!.quality = 'weak';
      choice.options[1]!.quality = 'strong';
    }
    const lesson = course(g).modules[0]!.lessons[0]!;
    const best = walkLesson(lesson, 'best');
    expect(best.choices[0]!.answer).toBe('B');
    expect(best.nodes.map((n) => n.id)).toContain('cb');
    const impulsive = walkLesson(lesson, 'impulsive');
    expect(impulsive.nodes.map((n) => n.id)).toContain('ca');
    expect(impulsive.nodes.at(-1)!.type).toBe('end');
  });
});

describe('alunos de teste: opinião', () => {
  it('perfis padrão validam e cada um opina sobre um curso real', () => {
    const ops = DEFAULT_LEARNERS.map((l) => simulateLearner(podeEntrarLight, l.key, l.data));
    for (const o of ops) {
      expect(o.rating).toBeGreaterThanOrEqual(1);
      expect(o.rating).toBeLessThanOrEqual(5);
      expect(o.quote).toMatch(new RegExp(`^Sou ${o.name}`));
      expect(o.lessonsTotal).toBeGreaterThan(0);
    }
    const sum = summarizeOpinions(ops);
    expect(sum.total).toBe(5);
    expect(sum.average).not.toBeNull();
  });

  it('é determinística', () => {
    const a = simulateLearner(podeEntrarLight, 'x', profile());
    const b = simulateLearner(podeEntrarLight, 'x', profile());
    expect(a).toEqual(b);
  });

  it('pouco tempo: para no meio e reclama', () => {
    const doc = course();
    const lesson = doc.modules[0]!.lessons[0]!;
    doc.modules[0]!.lessons = [lesson, { ...structuredClone(lesson), id: 'l2', title: 'Aula 2' }, { ...structuredClone(lesson), id: 'l3', title: 'Aula 3' }];
    const content = lesson.graph.nodes.find((n) => n.id === 'intro')!;
    if (content.type === 'content') content.narration = Array.from({ length: 300 }, () => 'palavra').join(' ');
    for (const l of doc.modules[0]!.lessons) l.graph = structuredClone(lesson.graph);
    const o = simulateLearner(doc, 'diego', profile({ name: 'Diego', traits: ['low_time'], minutesAvailable: 3 }));
    expect(o.stoppedAt).toBeDefined();
    expect(o.issues.map((i) => i.code)).toContain('NO_TIME');
    expect(o.issues.map((i) => i.code)).toContain('LONG_SPEECH');
    expect(o.wouldRecommend).toBe(false);
  });

  it('tímida: escrita obrigatória pesa; frase com blocos agrada', () => {
    const g = linearGraph();
    g.nodes.splice(1, 0, { id: 'refl', type: 'reflection', prompt: p('Escreva sobre você'), objectiveIds: [], required: true, minLength: 20, maxLength: 500 });
    g.edges = g.edges.map((e) => (e.from === 'intro' ? { ...e, to: 'refl' } : e));
    g.edges.push({ id: 'e_refl', from: 'refl', to: 'q' });
    const o = simulateLearner(course(g), 'ana', profile());
    expect(o.issues.find((i) => i.code === 'MUST_WRITE')?.text).toMatch(/travei/);
  });

  it('muito texto na tela para quem lê pouco', () => {
    const g = linearGraph();
    const intro = g.nodes[0]!;
    if (intro.type === 'content') intro.body = p(Array.from({ length: 90 }, () => 'texto').join(' '));
    const o = simulateLearner(course(g), 'bia', profile({ name: 'Beatriz', traits: ['low_reading', 'accessibility'], readingTolerance: 50 }));
    expect(o.issues.map((i) => i.code)).toContain('TOO_MUCH_TEXT');
    expect(o.liked.map((i) => i.code)).toContain('CAPTIONS');
  });

  it('jargão sem explicação', () => {
    const g = linearGraph();
    const intro = g.nodes[0]!;
    if (intro.type === 'content') intro.narration = 'Mostre seu fit cultural na conversa.';
    expect(unexplainedJargon(intro)).toEqual(['fit cultural']);
    if (intro.type === 'content') intro.narration = 'Mostre seu fit cultural, ou seja, que combina com o jeito da equipe.';
    expect(unexplainedJargon(intro)).toEqual([]);
  });

  it('retorno que explica o erro conta a favor', () => {
    const g = linearGraph();
    const q = g.nodes.find((n) => n.type === 'choice')!;
    if (q.type === 'choice') {
      q.options[0] = { ...q.options[0]!, quality: 'weak', feedback: p('Você pareceu inseguro. Faça assim: diga o seu nome e a vaga.') };
      q.options[1] = { ...q.options[1]!, quality: 'strong' };
    }
    const o = simulateLearner(course(g), 'x', profile({ answerStyle: 'impulsive' }));
    expect(o.liked.map((l) => l.code)).toContain('FEEDBACK');
  });
});

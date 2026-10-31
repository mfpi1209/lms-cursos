import { describe, expect, it } from 'vitest';
import { CameraSchema, SceneDirectionSchema, comunicacaoPrimeiroEmprego, compileCourse, type CourseDocument } from '@lms/course-schema';
import { computeNextSteps, directionTargetsFromGraph, promptSuggestions, scriptToGraph, templateLesson, type NextStep, type StructuredRequest } from '../src';
import * as client from '../src/client';

const COURSE = 'crs_1';
const L1 = 'aula_negociar_prazo';
const L2 = 'aula_corrigir_informacao';
const clone = (): CourseDocument => structuredClone(comunicacaoPrimeiroEmprego);
const rank = { blocker: 0, recommended: 1, optional: 2 } as const;
const ids = (steps: NextStep[]) => steps.map((s) => s.id);

function lessonNode(doc: CourseDocument, lessonId: string, nodeId: string) {
  const l = doc.modules.flatMap((m) => m.lessons).find((x) => x.id === lessonId)!;
  return l.graph.nodes.find((n) => n.id === nodeId)! as any;
}

/** Aula curta de demonstração (7 cenas + encerramento) no lugar do grafo de uma aula do curso-exemplo. */
function shortGraph(lesson: { id: string; objectiveIds: string[] }) {
  const req = { task: 'lesson', input: `<aula>\ntítulo: ${lesson.id}\nobjetivos: ${lesson.objectiveIds[0]}\nverificação permitida: não\n</aula>` } as unknown as StructuredRequest<unknown>;
  return scriptToGraph(templateLesson(req));
}

/**
 * Curso sem pendências: apresentador, falas e direção em todas as cenas com
 * vídeo. Com `short`, as aulas viram aulas curtas (o curso-exemplo é longo pelo
 * padrão atual e receberia o passo "Encurtar").
 */
function completeDoc(short = false): CourseDocument {
  const doc = clone();
  if (short) for (const l of doc.modules.flatMap((m) => m.lessons)) l.graph = shortGraph(l);
  doc.presentation.avatarId = 'sim_avatar_ana';
  doc.presentation.voiceId = 'sim_voice_ana';
  for (const l of doc.modules.flatMap((m) => m.lessons)) {
    for (const t of directionTargetsFromGraph(l.graph)) {
      const n = l.graph.nodes.find((x) => x.id === t.nodeId)! as any;
      n.narration = t.narration.slice(0, 1000);
      n.direction = SceneDirectionSchema.parse({ shots: [{ id: 's1', line: n.narration }] });
    }
  }
  return doc;
}

describe('computeNextSteps', () => {
  it('no curso de exemplo: apresentador ausente é bloqueio e as recomendações seguem a ordem do curso', () => {
    const steps = computeNextSteps(comunicacaoPrimeiroEmprego, { courseId: COURSE });
    expect(compileCourse(comunicacaoPrimeiroEmprego).ok).toBe(true);
    // as duas aulas do exemplo passam de 9 cenas: "Encurtar" vem antes de escrever falas e dirigir
    expect(ids(steps)).toEqual(['presenter-missing', `shorten-${L1}`, `narration-${L1}`, `direction-${L1}`, `shorten-${L2}`, `narration-${L2}`, `direction-${L2}`]);
    expect(steps[0]!.severity).toBe('blocker');
    expect(steps[0]!.action).toMatchObject({ kind: 'open', params: { href: `/estudio/cursos/${COURSE}/montar?passo=apresentacao` } });
    const shorten = steps[1]!;
    expect(shorten).toMatchObject({ severity: 'recommended', title: 'Encurtar a aula "Negociar um prazo"', action: { kind: 'revise_lesson', cost: 'ai', params: { lessonId: L1, focus: 'shorten' } } });
    expect(shorten.detail).toMatch(/11 cenas \(recomendado até 9\)/);
    const narration = steps[2]!;
    expect(narration.action).toMatchObject({ kind: 'revise_lesson', cost: 'ai', params: { lessonId: L1 } });
    expect(narration.action!.kind === 'revise_lesson' && narration.action!.params.instruction).toMatch(/2ª pessoa/);
    // aula inteira sem direção => sem nodeIds (todas as cenas)
    expect(steps[3]!.action).toMatchObject({ kind: 'direct_lesson', cost: 'ai', params: { lessonId: L1 } });
    expect(steps[3]!.action!.kind === 'direct_lesson' && steps[3]!.action!.params.nodeIds).toBeUndefined();
    expect(steps.some((s) => s.id === 'publish-new-version')).toBe(false);
  });

  it('ordena por severidade e depois pela ordem do curso; erros de compilação viram bloqueios com link para o editor', () => {
    const doc = clone();
    const l2 = doc.modules[0]!.lessons[1]!;
    l2.graph.edges = l2.graph.edges.filter((e) => e.id !== 'c16'); // reflexão sem saída
    const steps = computeNextSteps(doc, { courseId: COURSE });
    const sev = steps.map((s) => rank[s.severity]);
    expect([...sev].sort((a, b) => a - b)).toEqual(sev);
    const blocker = steps.find((s) => s.id === `publish-${L2}`)!;
    expect(blocker.severity).toBe('blocker');
    expect(blocker.action).toMatchObject({ kind: 'open', params: { href: `/estudio/cursos/${COURSE}/aulas/${L2}` } });
    expect(ids(steps).slice(0, 2)).toEqual(['presenter-missing', `publish-${L2}`]);
    expect(ids(steps)).toContain(`shorten-${L1}`);
  });

  it('vídeos desatualizados => generate_videos marcado como pago, com aviso de custo', () => {
    const doc = clone();
    lessonNode(doc, L1, 'cons_aceita').media = { assetId: 'ast_1', kind: 'video', stale: true };
    lessonNode(doc, L1, 'cons_recusa').media = { assetId: 'ast_2', kind: 'video', stale: false };
    const step = computeNextSteps(doc, { courseId: COURSE }).find((s) => s.id === `stale-${L1}`)!;
    expect(step.severity).toBe('recommended');
    expect(step.action).toMatchObject({ kind: 'generate_videos', cost: 'paid', params: { lessonId: L1, nodeIds: ['cons_aceita'] } });
    expect(step.action!.description).toMatch(/paga/i);
    expect(step.detail).toMatch(/pago/);
  });

  it('aulas longas (completas) recebem só o passo "Encurtar"; aulas curtas sem pendências sugerem publicar', () => {
    expect(ids(computeNextSteps(completeDoc(), { courseId: COURSE }))).toEqual([`shorten-${L1}`, `shorten-${L2}`]);
    const steps = computeNextSteps(completeDoc(true), { courseId: COURSE });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ id: 'publish-new-version', severity: 'optional', action: { kind: 'open', params: { href: `/estudio/cursos/${COURSE}/revisao` } } });
  });

  it('câmeras com falha (recomendado) e em geração (opcional)', () => {
    const doc = completeDoc(true);
    doc.presentation.cameras = [
      CameraSchema.parse({ id: 'frente', name: 'Frente', lookId: 'look_1' }),
      CameraSchema.parse({ id: 'perfil', name: 'Perfil', lookId: '', status: 'failed' }),
      CameraSchema.parse({ id: 'alto', name: 'Alto', lookId: '', status: 'generating' }),
    ];
    const steps = computeNextSteps(doc, { courseId: COURSE });
    expect(ids(steps)).toEqual(['cameras-failed', 'cameras-generating']);
    expect(steps.map((s) => s.severity)).toEqual(['recommended', 'optional']);
  });

  it('vídeos com falha na fila e filtro por aula', () => {
    const doc = completeDoc(true);
    const steps = computeNextSteps(doc, { courseId: COURSE, lessonId: L2, mediaQueue: [{ lessonId: L1, nodeId: 'cons_adiar', status: 'failed' }, { lessonId: L2, nodeId: 'cons_adiar', status: 'failed' }] });
    expect(ids(steps)).toEqual([`media-failed-${L2}`]);
    expect(steps[0]!.action).toMatchObject({ kind: 'open', params: { href: `/estudio/cursos/${COURSE}/producao` } });
  });

  it('no máximo 8 passos', () => {
    const doc = clone();
    const base = doc.modules[0]!.lessons[0]!;
    doc.modules[0]!.lessons = Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(base), id: `aula_${i}` }));
    doc.completion.requiredLessonIds = [];
    expect(computeNextSteps(doc, { courseId: COURSE })).toHaveLength(8);
  });

  it('é exportado pelo ponto de entrada do cliente', () => {
    expect(client.computeNextSteps).toBe(computeNextSteps);
    expect(client.promptSuggestions).toBe(promptSuggestions);
  });
});

describe('promptSuggestions', () => {
  const labels = (s: { label: string }[]) => s.map((x) => x.label);

  it('aula no storyboard', () => {
    const s = promptSuggestions({ screen: 'storyboard', lessonId: L1 }, comunicacaoPrimeiroEmprego);
    expect(labels(s)).toEqual(['Deixe esta aula mais dinâmica', 'Use close nas perguntas ao aluno', 'Coloque slides nas listas', 'Fale mais em segunda pessoa', 'Encurte as falas longas']);
    const doc = clone();
    lessonNode(doc, L1, 'cons_aceita').media = { assetId: 'ast_1', kind: 'video', stale: true };
    expect(labels(promptSuggestions({ screen: 'storyboard', lessonId: L1 }, doc))).toContain('Gere os vídeos desatualizados');
    // sem documento: lista completa
    expect(promptSuggestions({ screen: 'storyboard', lessonId: L1 })).toHaveLength(6);
  });

  it('cena em foco: variações só em decisão/consequência, animatic só com direção', () => {
    const choice = labels(promptSuggestions({ screen: 'storyboard', lessonId: L1, nodeId: 'decisao_prazo' }, comunicacaoPrimeiroEmprego));
    expect(choice).toEqual(['Reescreva esta fala mais pessoal', 'Reescreva esta fala mais curta', 'Dirija esta cena', 'Crie variações desta cena', 'Use close nas perguntas ao aluno', 'Reescreva esta fala mais acolhedora']);
    const content = labels(promptSuggestions({ screen: 'storyboard', lessonId: L1, nodeId: 'conteudo_negociar' }, completeDoc()));
    expect(content).toContain('Ver animatic');
    expect(content).not.toContain('Crie variações desta cena');
  });

  it('passos do assistente de montagem', () => {
    expect(labels(promptSuggestions({ screen: 'wizard', step: 'tema' }))).toEqual(expect.arrayContaining(['Sugira um público mais específico', 'Que tom combina com estagiários?']));
    expect(labels(promptSuggestions({ screen: 'wizard', step: 'apresentacao' }))).toEqual(expect.arrayContaining(['Gere um ângulo de perfil', 'Deixe o ritmo calmo']));
  });

  it('produção e revisão', () => {
    expect(labels(promptSuggestions({ screen: 'production' }, comunicacaoPrimeiroEmprego))).toEqual(['Por que estes vídeos falharam?', 'Quanto falta para terminar?']);
    expect(labels(promptSuggestions({ screen: 'review' }))).toEqual(expect.arrayContaining(['O que impede publicar?', 'Resuma o que mudou desde a última versão']));
  });

  it('nunca mais de 6 e ids únicos', () => {
    for (const ctx of [{ screen: 'course' as const }, { screen: 'storyboard' as const, lessonId: L1 }, { screen: 'storyboard' as const, lessonId: L1, nodeId: 'x' }, { screen: 'wizard' as const, step: 'apresentacao' }]) {
      const s = promptSuggestions(ctx);
      expect(s.length).toBeLessThanOrEqual(6);
      expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
    }
  });
});

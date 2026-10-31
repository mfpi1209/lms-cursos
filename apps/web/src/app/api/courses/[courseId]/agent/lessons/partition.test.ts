import { describe, expect, it } from 'vitest';
import { LessonGraphSchema, richTextFromPlain, type Lesson } from '@lms/course-schema';
import { agent } from '@lms/db';
import { partitionLessonsForGeneration } from './partition';

const lesson = (id: string, graph = agent.placeholderGraph(id)): Lesson => ({ id, title: `Aula ${id}`, description: '', estimatedMinutes: 3, family: 'decision_consequence', objectiveIds: [], graph });
const written = LessonGraphSchema.parse({
  schemaVersion: 1,
  startNodeId: 'a',
  nodes: [
    { id: 'a', type: 'scenario', title: 'A', body: richTextFromPlain('Situação.') },
    { id: 'b', type: 'content', title: 'B', body: richTextFromPlain('Dica.') },
    { id: 'fim', type: 'end', title: 'Fim', summary: richTextFromPlain('Fim.') },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'fim' }],
});

describe('lote de geração: aulas ocupadas não param o lote', () => {
  it('pula a aula com execução aberta (relatando o run) e enfileira as outras', () => {
    const lessons = [lesson('l1'), lesson('l2'), lesson('l3')];
    const { toRun, skipped } = partitionLessonsForGeneration(lessons, new Map([['l2', { id: 'run_2' }]]));
    expect(toRun.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(skipped).toEqual([{ lessonId: 'l2', title: 'Aula l2', reason: 'open_run', runId: 'run_2' }]);
  });

  it('com onlyEmpty, aulas que já têm cenas ficam de fora (has_scenes); as vazias entram', () => {
    const lessons = [lesson('l1', written), lesson('l2')];
    const { toRun, skipped } = partitionLessonsForGeneration(lessons, new Map(), { onlyEmpty: true });
    expect(toRun.map((l) => l.id)).toEqual(['l2']);
    expect(skipped).toEqual([{ lessonId: 'l1', title: 'Aula l1', reason: 'has_scenes' }]);
    // sem onlyEmpty, a aula escrita entra (o aviso de sobrescrita é da tela)
    expect(partitionLessonsForGeneration(lessons, new Map()).toRun.map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});

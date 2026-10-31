import { agent } from '@lms/db';
import type { Lesson } from '@lms/course-schema';

export interface SkippedLesson {
  lessonId: string;
  title: string;
  reason: 'open_run' | 'has_scenes';
  runId?: string;
}

/**
 * Divide as aulas pedidas entre as que entram na fila e as que ficam de fora
 * (já têm uma execução aberta; ou, com `onlyEmpty`, já têm cenas). Pura, para
 * o lote nunca parar no meio por causa de uma aula ocupada.
 */
export function partitionLessonsForGeneration(lessons: readonly Lesson[], openByLesson: ReadonlyMap<string, { id: string }>, opts: { onlyEmpty?: boolean } = {}): { toRun: Lesson[]; skipped: SkippedLesson[] } {
  const toRun: Lesson[] = [];
  const skipped: SkippedLesson[] = [];
  for (const l of lessons) {
    const open = openByLesson.get(l.id);
    if (open) skipped.push({ lessonId: l.id, title: l.title, reason: 'open_run', runId: open.id });
    else if (opts.onlyEmpty && !agent.isPlaceholderGraph(l.graph)) skipped.push({ lessonId: l.id, title: l.title, reason: 'has_scenes' });
    else toRun.push(l);
  }
  return { toRun, skipped };
}

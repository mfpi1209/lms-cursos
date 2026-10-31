'use client';

import type { AssessmentOutcome, AttemptState, ProgressSummary } from '@lms/course-engine';
import type { RichTextDocument } from '@lms/course-schema';
import { api } from '@/lib/api';
import type { PlayerDriver, PlayerStart, PlayerStepResult } from './types';

interface AttemptResponse {
  attempt: { id: string; revision: number; status: string; attemptNumber: number; state: AttemptState };
  created: boolean;
  progress: ProgressSummary;
}

interface EventResponse {
  replayed: boolean;
  revision: number;
  state: AttemptState;
  feedback?: RichTextDocument;
  assessment?: AssessmentOutcome;
  transitioned: boolean;
  fromNodeId: string;
  toNodeId: string;
  progress: ProgressSummary;
  lessonCompleted: boolean;
  courseCompleted: boolean;
}

/**
 * Driver do LMS: tentativas persistidas via /api. O servidor decide toda
 * transição; aqui só traduzimos chamadas. `restart` força uma nova tentativa
 * (o servidor só aceita após a conclusão).
 */
export function createLmsDriver({ enrollmentId, lessonId, fresh = false }: { enrollmentId: string; lessonId: string; /** "Reiniciar": a primeira entrada já abre uma tentativa nova (abandona a aberta) */ fresh?: boolean }): PlayerDriver {
  let attemptId: string | null = null;
  let attemptNumber = 1;

  async function begin(forceNew: boolean, abandonOpen = false): Promise<PlayerStart> {
    const res = await api<AttemptResponse>(`/api/enrollments/${enrollmentId}/lessons/${lessonId}/attempts`, {
      json: forceNew ? (abandonOpen ? { forceNew: true, abandonOpen: true } : { forceNew: true }) : {},
    });
    attemptId = res.attempt.id;
    attemptNumber = res.attempt.attemptNumber;
    return { state: res.attempt.state, revision: res.attempt.revision, progress: res.progress, attemptNumber };
  }

  return {
    mode: 'lms',
    start: () => {
      const f = fresh;
      fresh = false; // só a primeira entrada; recarregar a página depois volta a retomar
      return f ? begin(true, true) : begin(false);
    },
    restart: () => begin(true),
    restartNow: () => begin(true, true),
    async navigate(input): Promise<PlayerStepResult> {
      if (!attemptId) throw new Error('A tentativa ainda não foi iniciada');
      // mesmo endpoint dos passos: `intent` back/goto (validação, dono e revisão no servidor)
      const { target, ...rest } = input;
      return toResult(await api<EventResponse>(`/api/attempts/${attemptId}/events`, { json: { ...rest, intent: target } }));
    },
    async step(input): Promise<PlayerStepResult> {
      if (!attemptId) throw new Error('A tentativa ainda não foi iniciada');
      const res = await api<EventResponse>(`/api/attempts/${attemptId}/events`, { json: input });
      return {
        state: res.state,
        revision: res.revision,
        feedback: res.feedback,
        assessment: res.assessment,
        transitioned: res.transitioned,
        fromNodeId: res.fromNodeId,
        toNodeId: res.toNodeId,
        progress: res.progress,
        lessonCompleted: res.lessonCompleted,
        courseCompleted: res.courseCompleted,
      };
    },
  };
}

function toResult(res: EventResponse): PlayerStepResult {
  return {
    state: res.state,
    revision: res.revision,
    feedback: res.feedback,
    assessment: res.assessment,
    transitioned: res.transitioned,
    fromNodeId: res.fromNodeId,
    toNodeId: res.toNodeId,
    progress: res.progress,
    lessonCompleted: res.lessonCompleted,
    courseCompleted: res.courseCompleted,
  };
}

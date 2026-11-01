import { MISSION_NOTE_MAX, type MissionStatus } from '@lms/course-schema';

/** Texto de "O que você percebeu?": sem espaços nas pontas; vazio = sem registro (`null`). */
export function normalizeMissionNote(note: string | null | undefined): string | null {
  const t = (note ?? '').trim();
  return t ? t : null;
}

export interface MissionState {
  status: MissionStatus;
  note: string | null;
}

/**
 * Resultado de responder a missão DENTRO da aula (player) quando já existe um registro (a aula foi refeita ou o aluno
 * voltou uma cena): nunca desfaz o que o aluno já tinha.
 *  - já "Já experimentei": "Vou fazer depois" não rebaixa; um novo "Já experimentei" só troca o texto se veio texto;
 *  - já "Vou fazer depois": "Vou fazer depois" não muda nada; "Já experimentei" promove.
 * Sem registro, vale o que veio.
 */
export function mergeLessonMission(prev: MissionState | null | undefined, incoming: { status: MissionStatus; note?: string | null }): MissionState {
  const note = incoming.status === 'done' ? normalizeMissionNote(incoming.note) : null;
  if (!prev) return { status: incoming.status, note };
  if (prev.status === 'done') return { status: 'done', note: incoming.status === 'done' && note ? note : prev.note };
  return incoming.status === 'done' ? { status: 'done', note } : prev;
}

export type MissionEditProblem = 'NOTE_TOO_LONG' | 'LATER_AFTER_DONE';

/**
 * Edição explícita fora da aula (Meu roteiro / página do curso). Só avança: "Vou fazer depois" → "Já experimentei", ou
 * editar o texto de quem já experimentou (texto vazio apaga). Voltar de "Já experimentei" para "Vou fazer depois" não existe.
 */
export function editMission(prev: MissionState, input: { status: MissionStatus; note?: string | null }): { ok: true; next: MissionState } | { ok: false; problem: MissionEditProblem } {
  const note = normalizeMissionNote(input.note);
  if (note && note.length > MISSION_NOTE_MAX) return { ok: false, problem: 'NOTE_TOO_LONG' };
  if (input.status === 'later') {
    if (prev.status === 'done') return { ok: false, problem: 'LATER_AFTER_DONE' };
    return { ok: true, next: { status: 'later', note: null } };
  }
  return { ok: true, next: { status: 'done', note } };
}

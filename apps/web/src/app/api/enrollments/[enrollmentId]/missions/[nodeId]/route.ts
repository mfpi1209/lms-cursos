import { z } from 'zod';
import { MISSION_NOTE_MAX } from '@lms/course-schema';
import { getDb, learning, privacy } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';

const Body = z.object({
  status: z.enum(['later', 'done']),
  /** "O que você percebeu?"; vazio apaga */
  note: z.string().max(MISSION_NOTE_MAX * 2).nullish(),
  /** a versão do registro que o aluno estava vendo (outra aba pode ter mudado) */
  expectedRevision: z.number().int().min(1),
});

/**
 * Missão "Leve para a vida real" fora da aula ("Meu roteiro", "Missões para depois"): marcar "Já experimentei" e/ou
 * escrever "O que você percebeu?" (até 500 caracteres). Só o aluno dono da matrícula; só avança (ver
 * `learning.saveMissionResponse`); nunca mexe na aula, no curso concluído nem no selo.
 * Resposta: o registro salvo (a confirmação só vem depois de gravado).
 */
export async function PUT(req: Request, ctx: { params: Promise<{ enrollmentId: string; nodeId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId, nodeId } = await ctx.params;
    await requireOwnEnrollment(viewer, enrollmentId);
    const body = await parseBody(req, Body);
    const row = await learning.saveMissionResponse(getDb(), { enrollmentId, nodeId, status: body.status, note: body.note ?? null, expectedRevision: body.expectedRevision });
    return { mission: { nodeId, lessonId: row.lessonId, status: row.status, note: row.note, revision: row.revision, updatedAt: row.updatedAt.toISOString() } };
  });
}

/**
 * "Apagar minha nota": apaga o texto de "O que você percebeu?" desta missão, com o histórico de versões e as cópias do texto
 * nas tentativas da aula (ver `privacy.deleteMissionNote`). O estado da missão ("Já experimentei" / "Vou fazer depois"), o curso e
 * o selo não mudam. Só o aluno dono da matrícula. Sem texto na resposta nem na auditoria (`note.delete`). Idempotente.
 * Resposta: o registro como ficou (sem nota) e a nova `revision` (a próxima gravação usa essa).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ enrollmentId: string; nodeId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId, nodeId } = await ctx.params;
    await requireOwnEnrollment(viewer, enrollmentId);
    const r = await privacy.deleteMissionNote(getDb(), { enrollmentId, nodeId, userId: viewer.user.id, actorId: viewer.user.id, via: 'aluno' });
    return { deleted: r.deleted, mission: { nodeId, lessonId: r.lessonId, status: r.status, note: null, revision: r.revision, updatedAt: r.updatedAt.toISOString() } };
  });
}

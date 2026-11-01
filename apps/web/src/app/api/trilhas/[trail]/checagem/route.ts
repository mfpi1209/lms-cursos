import { z } from 'zod';
import { publicTrailCheck, trailCheckFor, trailCheckSeed, trailSlug } from '@lms/course-schema';
import { getDb, recognition, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';

const Body = z.object({ answers: z.record(z.string().min(1).max(16), z.string().min(1).max(16)) });

/**
 * A checagem final da trilha para a PRÓXIMA tentativa da pessoa: as situações sem a marca de correta e sem retorno, com as opções
 * embaralhadas de forma estável por aluno e tentativa (a mesma ordem ao recarregar; outra depois de cada envio). O gabarito nunca
 * sai daqui: a nota é calculada no envio, pelo id da opção.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ trail: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { trail: key } = await ctx.params;
    const db = getDb();
    const trail = await recognition.trailByKey(db, viewer.workspace.id, key);
    if (!trail) throw new DomainError('NOT_FOUND', 'Trilha não encontrada');
    const check = trailCheckFor(trail);
    if (!check) throw new DomainError('NOT_FOUND', 'Esta trilha ainda não tem checagem final');
    const attempt = await recognition.trailCheckAttemptCount(db, { userId: viewer.user.id, trail });
    return { check: publicTrailCheck(check, trailCheckSeed({ userId: viewer.user.id, trailKey: trailSlug(trail), attempt })), attempt };
  });
}

/**
 * Envio da checagem final da trilha: nota, retorno por situação e, se tudo estiver pronto (cursos
 * concluídos, atividades salvas, aprovação), o Selo DNA Work. Pode refazer quantas vezes quiser.
 */
export async function POST(req: Request, ctx: { params: Promise<{ trail: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { trail: key } = await ctx.params;
    const body = await parseBody(req, Body);
    const db = getDb();
    const trail = await recognition.trailByKey(db, viewer.workspace.id, key);
    if (!trail) throw new DomainError('NOT_FOUND', 'Trilha não encontrada');
    const { result, badge, status } = await recognition.submitTrailCheck(db, { workspaceId: viewer.workspace.id, userId: viewer.user.id, holderName: viewer.user.name, trail, answers: body.answers });
    return {
      result,
      badge: badge ? { code: badge.code, issuedAt: badge.issuedAt } : null,
      eligibility: status.eligibility,
    };
  });
}

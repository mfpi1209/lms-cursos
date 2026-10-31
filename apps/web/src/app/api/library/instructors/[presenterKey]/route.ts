import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, library } from '@lms/db';
import { TEMPLATE_KEY_RE } from '@lms/course-schema';
import { HttpError, requireEditor, requireStaff } from '@/server/viewer';
import { advanceInstructorTemplate, instructorStatus } from '@/server/new-instructor';
import { getLooksProvider, unavailable } from '../../../media/looks/_lib/looks';
import { instructorDeps, instructorError } from '../_lib/instructors';

type Ctx = { params: Promise<{ presenterKey: string }> };

async function keyOf(ctx: Ctx) {
  const { presenterKey } = await ctx.params;
  if (!TEMPLATE_KEY_RE.test(presenterKey)) throw new HttpError(400, 'Chave de instrutor inválida');
  return presenterKey;
}

/** Situação gravada (não chama provedor). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const viewer = await requireStaff();
    const key = await keyOf(ctx);
    const row = await library.getTemplate(getDb(), viewer.workspace.id, key);
    if (!row || row.kind !== 'presenter') throw new HttpError(404, 'Instrutor não encontrado');
    return NextResponse.json({ status: instructorStatus(row) });
  } catch (e) {
    return instructorError(e);
  }
}

const BodySchema = z.object({ retryFailed: z.boolean().default(false) });

/**
 * Próximo passo da geração já aprovada (consulta o que está gerando e pede o que falta, sempre com
 * a mesma Idempotency-Key: repetir não paga de novo). `retryFailed` pede de novo o que falhou.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const viewer = await requireEditor();
    const key = await keyOf(ctx);
    const body = BodySchema.parse(await req.json().catch(() => ({})));
    const provider = getLooksProvider();
    if (provider.kind === 'unavailable') return unavailable();
    const db = getDb();
    const status = await advanceInstructorTemplate(db, { workspaceId: viewer.workspace.id, userId: viewer.user.id, presenterKey: key, retryFailed: body.retryFailed }, instructorDeps(db, viewer.workspace.id, provider, body.retryFailed ? `${key}:retry:${Date.now()}` : key));
    return NextResponse.json({ status });
  } catch (e) {
    return instructorError(e);
  }
}

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, reports, schema as s } from '@lms/db';
import { HttpError } from './viewer';
import type { IntegrationContext } from './integration-auth';

/*
 * `GET /api/integracao/v1/progresso?curso=<slug>&desde=<ISO>&limite=<1..500>&cursor=<opaco>` (escopo progress:read).
 * Uma linha por matrícula do workspace do token. Contrato e campos: docs/integracao/api-v1.md.
 */

const query = z.object({
  curso: z.string().trim().min(1).max(200).optional(),
  desde: z.string().trim().min(1).max(40).optional(),
  limite: z
    .string()
    .regex(/^\d+$/, 'limite deve ser um número inteiro')
    .transform(Number)
    .refine((n) => n >= 1 && n <= reports.PROGRESS_LIMIT_MAX, `limite deve estar entre 1 e ${reports.PROGRESS_LIMIT_MAX}`)
    .optional(),
  cursor: z.string().trim().min(1).max(200).optional(),
});

const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const BAD_SINCE = 'desde deve ser uma data ISO 8601, como 2026-03-10T12:00:00Z';

/** Aceita `2026-03-10` e `2026-03-10T12:00:00Z`; sem fuso, vale UTC. */
export function parseSince(raw: string): Date {
  if (!ISO_RE.test(raw)) throw new HttpError(422, BAD_SINCE);
  const t = raw.replace(' ', 'T');
  const hasTime = t.includes('T');
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(t);
  const d = new Date(hasTime && !hasZone ? `${t}Z` : t);
  if (Number.isNaN(d.getTime())) throw new HttpError(422, BAD_SINCE);
  return d;
}

export async function getProgress(ctx: IntegrationContext, url: string) {
  const q = query.parse(Object.fromEntries(new URL(url).searchParams.entries()));
  const since = q.desde ? parseSince(q.desde) : undefined;
  const db = getDb();
  let courseId: string | undefined;
  if (q.curso) {
    const [c] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, ctx.workspaceId), eq(s.courses.slug, q.curso))).limit(1);
    if (!c) throw new HttpError(404, `Curso "${q.curso}" não encontrado`);
    courseId = c.id;
  }
  return reports.progressRows(db, { workspaceId: ctx.workspaceId, courseId, since, limit: q.limite ?? reports.PROGRESS_LIMIT_DEFAULT, cursor: q.cursor });
}

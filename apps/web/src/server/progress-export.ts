import { and, eq } from 'drizzle-orm';
import { getDb, newId, reports, schema as s } from '@lms/db';
import { progressToCsv } from '@/lib/progresso-csv';
import { HttpError } from './viewer';

/** Máximo de linhas por exportação (a planilha é montada em memória). Acima disso: filtre por curso. */
export const EXPORT_MAX_ROWS = 50_000;

export interface ExportInput {
  workspaceId: string;
  actorId: string;
  /** slug do curso; vazio = todos */
  courseSlug?: string | null;
}

/**
 * Monta o CSV de progresso do workspace (com BOM, `;`, protegido contra fórmulas) e grava UM registro de auditoria
 * (`report.export_progress`) só com números: quantidade de linhas e o curso do filtro. Nunca nomes, e-mails ou RGM.
 */
export async function exportProgressCsv(input: ExportInput): Promise<{ csv: string; filename: string; rows: number }> {
  const db = getDb();
  let courseId: string | undefined;
  if (input.courseSlug) {
    const [c] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, input.workspaceId), eq(s.courses.slug, input.courseSlug))).limit(1);
    if (!c) throw new HttpError(404, 'Curso não encontrado');
    courseId = c.id;
  }
  const rows: reports.ProgressRow[] = [];
  for await (const chunk of reports.progressRowsAll(db, { workspaceId: input.workspaceId, courseId })) {
    rows.push(...chunk);
    if (rows.length > EXPORT_MAX_ROWS) throw new HttpError(422, `Mais de ${EXPORT_MAX_ROWS} matrículas. Exporte um curso por vez.`);
  }
  await db.insert(s.auditLogs).values({
    id: newId('aud'),
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'report.export_progress',
    entityType: 'report',
    entityId: 'progress',
    data: { formato: 'csv', linhas: rows.length, curso: input.courseSlug ?? null },
  });
  const day = new Date().toISOString().slice(0, 10);
  return { csv: progressToCsv(rows), filename: `progresso-${input.courseSlug ?? 'todos-os-cursos'}-${day}.csv`, rows: rows.length };
}

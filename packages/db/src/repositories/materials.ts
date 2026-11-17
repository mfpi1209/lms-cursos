import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import * as s from '../schema';

/**
 * Material de apoio (PDF de curso, `metadata.courseMaterial`) é do curso: a aluna lê se tem matrícula (ativa ou
 * concluída) no curso dono do arquivo E a versão da matrícula lista o asset em `materials`. Assim um PDF removido do
 * curso continua com quem já tinha a versão antiga e não vaza para quem nunca o recebeu.
 */
export function isCourseMaterialAsset(asset: { kind: string; metadata: s.AssetMetadata | null }): asset is { kind: string; metadata: s.AssetMetadata & { courseMaterial: s.CourseMaterialMetadata } } {
  return asset.kind === 'document' && !!asset.metadata?.courseMaterial?.courseId;
}

export async function materialReadableBy(db: DbOrTx, input: { assetId: string; courseId: string; userId: string }): Promise<boolean> {
  const listed = JSON.stringify([{ assetId: input.assetId }]);
  const [row] = await db
    .select({ id: s.enrollments.id })
    .from(s.enrollments)
    .innerJoin(s.courseVersions, eq(s.courseVersions.id, s.enrollments.courseVersionId))
    .where(
      and(
        eq(s.enrollments.userId, input.userId),
        eq(s.enrollments.courseId, input.courseId),
        sql`${s.enrollments.status} <> 'canceled'`,
        sql`coalesce(${s.courseVersions.document}->'materials', '[]'::jsonb) @> ${listed}::jsonb`,
      ),
    )
    .limit(1);
  return !!row;
}

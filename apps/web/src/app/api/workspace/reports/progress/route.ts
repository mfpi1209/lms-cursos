import { NextResponse } from 'next/server';
import { handleError } from '@/server/http';
import { exportProgressCsv } from '@/server/progress-export';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** Exporta o progresso em CSV (só administração). `?curso=<slug>` filtra por curso. Cada exportação gera um registro de auditoria. */
export async function GET(req: Request) {
  try {
    const viewer = await requireAdmin();
    const curso = new URL(req.url).searchParams.get('curso')?.trim() || null;
    const out = await exportProgressCsv({ workspaceId: viewer.workspace.id, actorId: viewer.user.id, courseSlug: curso });
    return new NextResponse(out.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${out.filename}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

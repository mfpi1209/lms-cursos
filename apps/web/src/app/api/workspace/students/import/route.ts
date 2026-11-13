import { identity } from '@lms/db';
import { route } from '@/server/http';
import { HttpError, requireViewer } from '@/server/viewer';
import { importStudentsFromCsv } from '@/server/student-import';

export const dynamic = 'force-dynamic';

/** Importação do CSV do estúdio: `dryRun: true` devolve a prévia sem gravar. Só quem pode matricular (administração). */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireViewer();
    if (!identity.canEnroll(viewer.role)) throw new HttpError(403, 'Apenas administradores importam alunos');
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new HttpError(400, 'Corpo da requisição inválido');
    }
    return importStudentsFromCsv(viewer, json);
  });
}

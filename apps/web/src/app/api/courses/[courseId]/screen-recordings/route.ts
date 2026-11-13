import { DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { storeScreenRecording } from '@/server/screen-recordings';

export const runtime = 'nodejs';
/** O envio é em fluxo e pode demorar (arquivos de centenas de MB). */
export const maxDuration = 3600;

/**
 * Envio de UMA gravação de tela (MP4) do curso, já ligada ao rascunho.
 *
 * `POST /api/courses/[courseId]/screen-recordings?fileName=tela-01.mp4`, com o MP4 como corpo bruto
 * (`Content-Type: video/mp4`), não multipart: o corpo é gravado no storage em fluxo, sem carregar o arquivo inteiro
 * na memória (o `formData()` bufferizaria até 1 GB). Só a equipe que edita cursos (admin e autor).
 *
 * O servidor refaz o casamento pelo nome: sem gravação com esse nome no rascunho, 404 antes de ler o corpo. Ligou:
 * `{ assetId, sizeBytes, linked, revision }`. Limite por arquivo: `SCREEN_RECORDING_MAX_MB` (padrão 1024).
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const fileName = new URL(req.url).searchParams.get('fileName');
    if (!fileName) throw new DomainError('VALIDATION', 'Informe o nome do arquivo em "fileName".');
    const len = req.headers.get('content-length');
    return storeScreenRecording({
      viewer,
      courseId,
      fileName,
      contentType: req.headers.get('content-type'),
      contentLength: len !== null && /^\d+$/.test(len) ? Number(len) : null,
      body: req.body,
    });
  });
}

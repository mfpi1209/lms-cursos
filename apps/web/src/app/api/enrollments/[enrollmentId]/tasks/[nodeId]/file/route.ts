import { createHash } from 'node:crypto';
import { TASK_FILE_MAX_BYTES, taskAcceptedMime } from '@lms/course-schema';
import { DomainError, getDb, media, newId, submissions } from '@lms/db';
import { checkTaskFile, getStorage } from '@lms/media';
import { route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';

export const runtime = 'nodejs';

/**
 * Envio do ARQUIVO de uma entrega de tarefa pelo aluno (multipart, campo "file"). O arquivo só entra na entrega quando
 * o aluno envia a tarefa (intenção `submit` com `fileAssetId`, ou o reenvio).
 *
 * Regras, todas no servidor:
 *  - só o aluno dono da matrícula, e só em tarefa que aceita arquivo ("link e arquivo");
 *  - limite de envios por matrícula (`submissions.TASK_UPLOAD_LIMITS`), conferido antes de ler o corpo;
 *  - PDF, PNG ou JPEG, conferidos pelos bytes (`checkTaskFile`), até 10 MB, e só os tipos que a tarefa aceita;
 *  - gravado como asset `document` (que só a equipe lê), marcado com a matrícula e a tarefa (`metadata.taskUpload`):
 *    é por essa marca e por `createdBy` que o próprio aluno consegue ler o seu arquivo, e mais ninguém;
 *  - chave própria no storage (não é endereçada pelo conteúdo): apagar o arquivo de um aluno nunca apaga o de outro.
 */
export async function POST(req: Request, ctx: { params: Promise<{ enrollmentId: string; nodeId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId, nodeId } = await ctx.params;
    const enr = await requireOwnEnrollment(viewer, enrollmentId);
    if (enr.enrollment.status === 'canceled') throw new DomainError('FORBIDDEN', 'Esta matrícula foi cancelada.');
    const task = submissions.findTask(enr.document, nodeId);
    if (!task) throw new DomainError('NOT_FOUND', 'Esta tarefa não existe na versão do seu curso');
    const accepted = taskAcceptedMime(task.node);
    if (!accepted.length) throw new DomainError('VALIDATION', 'Esta tarefa recebe só o link.');

    const declared = Number(req.headers.get('content-length') ?? 0);
    // folga para os limites do multipart; o tamanho real do arquivo é conferido depois
    if (declared > TASK_FILE_MAX_BYTES + 64 * 1024) throw new DomainError('VALIDATION', 'O arquivo passa de 10 MB.');
    const db = getDb();
    await submissions.assertTaskUploadAllowed(db, { userId: viewer.user.id, enrollmentId });

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DomainError('VALIDATION', 'Envie um arquivo no campo "file"');
    if (file.size > TASK_FILE_MAX_BYTES) throw new DomainError('VALIDATION', 'O arquivo passa de 10 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkTaskFile(bytes, { maxBytes: TASK_FILE_MAX_BYTES, accepted });
    if (!check.ok) throw new DomainError('VALIDATION', check.message, { reason: check.reason });

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storage = await getStorage();
    const key = `${enr.course.workspaceId}/entregas/${enrollmentId}/${newId('arq')}.${check.ext}`;
    await storage.putObject(key, bytes, check.mime);
    const asset = await media.createAsset(db, {
      workspaceId: enr.course.workspaceId,
      kind: 'document',
      source: 'upload',
      mimeType: check.mime,
      sizeBytes: bytes.byteLength,
      storageProvider: storage.provider,
      storageKey: key,
      originalName: safeName(file.name),
      sha256,
      createdBy: viewer.user.id,
      metadata: { taskUpload: { enrollmentId, nodeId } },
    });
    return { file: { assetId: asset.id, name: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes } };
  });
}

/** Nome do arquivo só para mostrar: sem caminho, sem caracteres de controle, até 120 caracteres. */
function safeName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'arquivo').slice(0, 120);
}

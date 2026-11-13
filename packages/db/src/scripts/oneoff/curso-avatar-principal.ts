/** Troca o avatar principal (lookId) do rascunho de um curso. Sem custo.  tsx …/curso-avatar-principal.ts <curso> <cameraId> */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
async function main() {
  const [courseId, cameraId] = process.argv.slice(2);
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId!))!;
    const doc = structuredClone(draft.document) as unknown as { presentation: { avatarId?: string; cameras: Array<{ id: string; lookId: string }> } };
    const cam = doc.presentation.cameras.find((c) => c.id === cameraId);
    if (!cam) throw new Error('câmera não encontrada');
    doc.presentation.avatarId = cam.lookId;
    const r = await saveDraft(db, { courseId: courseId!, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `avatar principal → ${cameraId}` });
    console.log(`[principal] ${courseId} revisão ${draft.revision} → ${r.revision}: ${cameraId}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });

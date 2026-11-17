/** Troca previewUrl (e avatarPreviewUrl) externos das câmeras pelo asset local. tsx …/previas-locais.ts <curso> <camId=ast_…> … */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
async function main() {
  const [courseId, ...pairs] = process.argv.slice(2);
  const map = new Map(pairs.map((p) => p.split('=') as [string, string]));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId!))!;
    const doc = structuredClone(draft.document) as unknown as { presentation: { avatarId?: string; avatarPreviewUrl?: string; cameras: Array<{ id: string; lookId: string; previewUrl?: string }> } };
    let n = 0;
    for (const c of doc.presentation.cameras) { const a = map.get(c.id); if (a && c.previewUrl !== `/api/assets/${a}`) { c.previewUrl = `/api/assets/${a}`; n++; } }
    const main = doc.presentation.cameras.find((c) => c.lookId === doc.presentation.avatarId);
    if (main?.previewUrl?.startsWith('/api/assets/') && doc.presentation.avatarPreviewUrl !== main.previewUrl) { doc.presentation.avatarPreviewUrl = main.previewUrl; n++; }
    if (!n) { console.log('[previas] nada a trocar'); return; }
    const r = await saveDraft(db, { courseId: courseId!, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'prévias das câmeras no armazenamento local' });
    console.log(`[previas] ${n} troca(s); revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Teste aprovado: fala + direção (1 plano, câmera sentada) na S01 do Pode entrar (só rascunho). */
import { createDb, authoring } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
const COURSE_ID = 'crs_7vbrb49jkq23ibiw';
const NARRATION = 'Legal. Agora me conta: por que você acha que o seu perfil combina com essa função de assistente de atendimento?';
async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await authoring.getDraft(db, COURSE_ID))!;
    const doc = structuredClone(draft.document) as CourseDocument;
    const node = doc.modules.flatMap((m) => m.lessons).flatMap((l) => l.graph.nodes).find((n) => n.id === 's01_perfil_combina') as any;
    if (!node) throw new Error('s01 não encontrado');
    if (!doc.presentation?.cameras?.some((c) => c.id === 'cam_sentada' && c.status === 'ready')) throw new Error('câmera sentada não está pronta');
    node.narration = NARRATION;
    node.motionPrompt = 'leans slightly forward, attentive and friendly, small encouraging nod';
    node.direction = { version: 1, source: 'author', intent: 'Entrevistadora sentada à mesa faz a pergunta da simulação', shots: [{ id: 's1', line: NARRATION, cameraId: 'cam_sentada', framing: 'medium', layout: 'presenter', cameraMove: 'push_in', transitionIn: 'cut' }] };
    const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'S01: fala e plano com a câmera sentada (teste aprovado)' });
    console.log(`rascunho ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

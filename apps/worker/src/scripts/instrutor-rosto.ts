/**
 * Passo 1 do instrutor novo, PAGO (~1 crédito HeyGen): gera só o ROSTO (personagem por texto) e para,
 * para o autor conferir a imagem antes de pagar as 3 câmeras. Grava a câmera-base no rascunho do curso
 * com a mesma Idempotency-Key de `novo-instrutor.ts` (que depois continua daqui, sem pagar de novo).
 * Mesmas variáveis do `gerar-instrutor.sh` (COURSE_ID, INSTRUTOR, BASE_PROMPT). `BASE_VARIANT` acrescenta
 * uma frase ao prompt (nova geração, só quando o rosto saiu ruim e o autor aprovou tentar outra vez).
 */
import { createDb, authoring } from '@lms/db';
import { HeyGenLooksAdapter, instructorBaseId, lookIdempotencyKey } from '@lms/media';
import type { CourseDocument } from '@lms/course-schema';

const COURSE_ID = process.env.COURSE_ID ?? '';
const NAME = process.env.INSTRUTOR ?? '';
const BASE_PROMPT = process.env.BASE_PROMPT ?? '';
if (!COURSE_ID || !NAME || !BASE_PROMPT) throw new Error('Informe COURSE_ID, INSTRUTOR e BASE_PROMPT');
const VARIANT = process.env.BASE_VARIANT ?? '';
const PROMPT = VARIANT ? `${BASE_PROMPT} ${VARIANT}` : BASE_PROMPT;
const tag = '[rosto]';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY ausente');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const gen = new HeyGenLooksAdapter(key);
  const getDraft = async () => (await authoring.getDraft(db, COURSE_ID))!;
  const save = async (mut: (d: CourseDocument) => void, note: string) => {
    const draft = await getDraft();
    const doc = structuredClone(draft.document) as CourseDocument;
    mut(doc);
    const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note });
    console.log(`${tag} rascunho ${draft.revision} → ${r.revision} (${note})`);
  };
  try {
    const course = await authoring.getCourse(db, COURSE_ID);
    if (!course) throw new Error(`curso ${COURSE_ID} não encontrado`);
    const baseId = instructorBaseId(NAME);
    let base = (await getDraft()).document.presentation?.cameras?.find((c) => c.id === baseId);
    if (!base) {
      const baseName = `${NAME} · base`.slice(0, 60);
      const idempotencyKey = lookIdempotencyKey(course.workspaceId, `novo_personagem:${NAME}`, PROMPT);
      console.log(`${tag} pedindo o personagem (${PROMPT.length} chars)`);
      const { generationId } = await gen.createCharacterFromPrompt({ prompt: PROMPT, name: baseName, aspectRatio: '16:9', idempotencyKey });
      const cam = { id: baseId, name: baseName, lookId: generationId, generationId, status: 'generating', nativeFraming: 'medium', angle: 'front', placement: 'center', generationPrompt: `Personagem novo (${NAME}), só texto` } as const;
      await save((d) => { d.presentation!.cameras = [...(d.presentation!.cameras ?? []).filter((c) => c.id !== baseId), { ...cam }]; }, `rosto "${baseName}" (generating)`);
      base = (await getDraft()).document.presentation!.cameras!.find((c) => c.id === baseId)!;
    } else console.log(`${tag} câmera-base já existe (${base.status}); só consulto`);
    for (let i = 0; i < 120 && base!.status === 'generating'; i++) {
      const r = await gen.getLookGeneration(base!.generationId!);
      if (r.status === 'completed') {
        await save((d) => {
          const c = d.presentation!.cameras!.find((x) => x.id === baseId)!;
          c.status = 'ready'; c.lookId = r.lookId ?? c.lookId; if (r.previewUrl) c.previewUrl = r.previewUrl;
        }, `rosto "${NAME}" pronto`);
        base = (await getDraft()).document.presentation!.cameras!.find((c) => c.id === baseId)!;
        break;
      }
      if (r.status === 'failed') throw new Error(`geração do rosto falhou: ${r.error}`);
      await sleep(5000);
    }
    console.log(`${tag} ${NAME}: base ${base!.status}, lookId ${base!.lookId}`);
    console.log(`${tag} previewUrl: ${base!.previewUrl ?? '(sem)'}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(`${tag} erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

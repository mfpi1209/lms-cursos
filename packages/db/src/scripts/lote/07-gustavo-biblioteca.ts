/**
 * Lote 12 cursos · curso 07 (Como conversar com colegas e gestores): instrutor Gustavo na biblioteca.
 * Só grava modelos (nada pago, nada gerado).
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/07-gustavo-biblioteca.ts voz
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/07-gustavo-biblioteca.ts instrutor --course crs_…
 *
 * `voz`: registra a voz escolhida (reserva para o lote; nenhuma outra sessão usa a mesma).
 * `instrutor --course`: lê as câmeras PRONTAS do Gustavo no rascunho (geradas por novo-instrutor.ts)
 *   e grava o instrutor `instrutor-gustavo` (kit de câmeras do estúdio 7) e o kit `estudio7-gustavo`.
 */
import { eq } from 'drizzle-orm';
import { PresenterTemplateDataSchema, type Camera } from '@lms/course-schema';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { getTemplate, resolveKit, upsertTemplate } from '../../repositories/library';

const WORKSPACE = 'wsp_eogwtp01f358wyof';
export const VOICE = {
  key: 'voz-cirilo',
  voiceId: '1DXriIY2zhyCt1cj8onn',
  voiceName: 'Cirilo (ElevenLabs)',
  ownerId: '8b8db7fc00f354bc3e93dd010233654ac3003616fc78013901409afebf2c89ca',
  sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/037a3487496742edbb4790b938b027f6/voices/1DXriIY2zhyCt1cj8onn/084a86f3-dcd1-40f3-b935-a92b2e225833.mp3',
};
export const GUSTAVO_BASE_PROMPT = [
  'Photorealistic video presenter, a fictional Black Brazilian man about 30 years old,',
  'deep brown skin, short black hair closely cropped, short well-groomed full beard,',
  'calm, steady and approachable expression, gentle natural smile with mouth closed.',
  'Outfit: light blue button-up dress shirt with collar open, no tie, no jacket, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');
const CAMS = ['cam_gustavo7_esq', 'cam_gustavo7_dir', 'cam_gustavo7_34'];

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const course = rest[rest.indexOf('--course') + 1];
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const createdBy = author!.id;
    if (mode === 'voz') {
      const taken = await db.select({ key: s.libraryTemplates.key, data: s.libraryTemplates.data }).from(s.libraryTemplates).where(eq(s.libraryTemplates.kind, 'voice'));
      const clash = taken.find((t) => (t.data as { voiceId?: string }).voiceId === VOICE.voiceId && t.key !== VOICE.key);
      if (clash) throw new Error(`voz ${VOICE.voiceId} já é de ${clash.key}`);
      const r = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy,
        template: {
          kind: 'voice',
          key: VOICE.key,
          name: VOICE.voiceName,
          description: 'Masculina, calma e firme, tom médio-grave, conversa natural sem jeito de locutor. Voz do Gustavo (curso 07, Como conversar com colegas e gestores).',
          data: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName, language: 'pt-BR', pronoun: 'he', sampleUrl: VOICE.sampleUrl, libraryOwnerId: VOICE.ownerId, notes: 'Biblioteca pública ElevenLabs. Adicionar à conta é grátis (ocupa 1 vaga de voz). Reservada para o Gustavo no lote de 12 cursos.' },
        },
      });
      console.log(`[07] voz ${VOICE.key}: ${r.created ? 'criada' : r.changed ? 'atualizada' : 'já estava igual'}`);
      return;
    }
    if (mode === 'instrutor') {
      if (!course?.startsWith('crs_')) throw new Error('informe --course crs_…');
      const draft = await getDraft(db, course);
      if (!draft) throw new Error(`rascunho de ${course} não encontrado`);
      const byId = new Map(draft.document.presentation.cameras.map((c) => [c.id, c]));
      const cameras = CAMS.map((id) => {
        const c = byId.get(id);
        if (!c || c.status !== 'ready' || !c.lookId) throw new Error(`câmera ${id} não está pronta no rascunho (${c?.status ?? 'ausente'})`);
        const out = structuredClone(c) as Camera;
        delete out.previewUrl; // link assinado: expira
        return out;
      });
      const base = byId.get('cam_gustavo_base');
      const data = PresenterTemplateDataSchema.parse({
        name: 'Gustavo',
        role: 'Seu orientador',
        pronoun: 'he',
        ...(base?.lookId ? { baseLookId: base.lookId } : {}),
        baseLookPrompt: GUSTAVO_BASE_PROMPT,
        ...(draft.document.presentation.avatarType ? { avatarType: draft.document.presentation.avatarType } : {}),
        voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
        voiceKey: VOICE.key,
        cameraKits: [{ studioKey: 'estudio-jovem-7', cameras }],
        castDetails: 'Conduz todas as falas dos vídeos com calma e firmeza, em conversa com o aluno; nunca julga.',
      });
      const p = await upsertTemplate(db, { workspaceId: WORKSPACE, createdBy, template: { kind: 'presenter', key: 'instrutor-gustavo', name: 'Gustavo · Seu orientador', description: 'Instrutor fictício criado por texto (homem negro, 30, barba curta, camisa social sem gravata) para o curso 07. Câmeras no estúdio 7 (esquerda, direita, 3/4).', data } });
      console.log(`[07] instrutor-gustavo: ${p.created ? 'criado' : p.changed ? 'atualizado' : 'igual'}`);
      const rafaelKit = await getTemplate(db, WORKSPACE, 'estudio7-rafael');
      const kd = rafaelKit!.data as Record<string, unknown>;
      const k = await upsertTemplate(db, { workspaceId: WORKSPACE, createdBy, template: { kind: 'kit', key: 'estudio7-gustavo', name: 'Estúdio 7 · Gustavo', description: 'Gustavo no estúdio 7 (cam_gustavo7_esq, cam_gustavo7_dir, cam_gustavo7_34), voz Cirilo, pílulas.', data: { ...kd, presenterKey: 'instrutor-gustavo', voiceKey: VOICE.key } } });
      console.log(`[07] kit estudio7-gustavo: ${k.created ? 'criado' : k.changed ? 'atualizado' : 'igual'}`);
      const resolved = await resolveKit(db, WORKSPACE, 'estudio7-gustavo');
      console.log(`[07] kit resolvido: ${resolved.presenter.data.name}, ${resolved.studio.name}, voz ${resolved.voice?.data.voiceName}`);
      return;
    }
    throw new Error('modo: voz | instrutor --course crs_…');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

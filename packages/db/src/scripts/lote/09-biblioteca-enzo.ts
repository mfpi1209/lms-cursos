/**
 * Lote 09 (Redes sociais): registra o instrutor Enzo na biblioteca de modelos.
 *  --voz      grava só o modelo de voz (grátis; reserva a voz para este curso)
 *  --kit      grava o instrutor (presenter, com as câmeras PRONTAS do rascunho do curso) e o kit estudio8-enzo
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/09-biblioteca-enzo.ts --voz|--kit [--course crs_…]
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { getTemplate, upsertTemplate } from '../../repositories/library';

const WS = 'wsp_eogwtp01f358wyof';
const VOICE = {
  kind: 'voice' as const,
  key: 'voz-matheus',
  name: 'Matheus (ElevenLabs)',
  description: 'Masculina jovem e animada, pt-BR. Escolhida para o Enzo (curso 09 Redes sociais).',
  data: {
    provider: 'elevenlabs' as const,
    voiceId: 'NQmLEqxcRTkWYIYZSYod',
    voiceName: 'Matheus (ElevenLabs)',
    language: 'pt-BR',
    pronoun: 'he' as const,
    libraryOwnerId: '64cbc624eb5aab4e95a968e1f41d75402277cca6e549036ed17e56ea33bbbc9e',
    sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/NQmLEqxcRTkWYIYZSYod/2c21ed83-e82f-4ee7-b42f-65295291fb11.mp3',
    notes: 'Biblioteca pública ElevenLabs "Matheus - Energetic and Dynamic" (jovem, animada). Lote 2026-10-30, curso 09 Redes sociais (Enzo). Adicionar à conta é grátis.',
  },
};
export const ENZO_PROMPT = [
  'Photorealistic video presenter, a fictional young Brazilian man about 24 years old,',
  'fair skin, medium-length wavy dark brown hair, clean-shaven,',
  'upbeat and friendly expression, relaxed natural smile with mouth closed.',
  'Casual outfit: plain white crew-neck t-shirt under a light open olive-green jacket, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const argv = process.argv.slice(2);
  const courseId = argv[argv.indexOf('--course') + 1] ?? '';
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const createdBy = author!.id;
    if (argv.includes('--voz')) {
      const r = await upsertTemplate(db, { workspaceId: WS, template: VOICE, createdBy });
      console.log(`[09] voz ${VOICE.key}: ${r.created ? 'criada' : r.changed ? 'atualizada' : 'já estava'} (${r.row.id})`);
    }
    if (argv.includes('--kit')) {
      if (!courseId.startsWith('crs_')) throw new Error('informe --course crs_…');
      const draft = await getDraft(db, courseId);
      const cams = (draft!.document.presentation.cameras ?? []).filter((c) => /^cam_enzo8_(esq|dir|34)$/.test(c.id));
      const base = (draft!.document.presentation.cameras ?? []).find((c) => c.id === 'cam_enzo_base');
      if (cams.length !== 3 || cams.some((c) => c.status !== 'ready')) throw new Error(`câmeras do Enzo não estão prontas: ${cams.map((c) => `${c.id}:${c.status}`).join(', ') || 'nenhuma'}`);
      const order = { center: 0, left: 1, right: 2 } as const;
      cams.sort((a, b) => order[a.zone!] - order[b.zone!]);
      const presenter = {
        kind: 'presenter' as const,
        key: 'instrutor-enzo',
        name: 'Enzo · Seu orientador',
        description: 'Homem branco, 24, cabelo ondulado, camiseta + jaqueta leve. Personagem fictício criado só por texto (HeyGen). Curso 09 Redes sociais.',
        data: {
          name: 'Enzo',
          role: 'Seu orientador',
          pronoun: 'he' as const,
          ...(base?.lookId ? { baseLookId: base.lookId } : {}),
          baseLookPrompt: ENZO_PROMPT,
          voice: { provider: 'elevenlabs' as const, voiceId: VOICE.data.voiceId, voiceName: VOICE.data.voiceName },
          voiceKey: VOICE.key,
          cameraKits: [{ studioKey: 'estudio-jovem-8', cameras: cams }],
          castDetails: 'Conduz todas as falas dos vídeos, em conversa com o aluno, com leveza e energia; nunca julga.',
          ...(cams[0]!.previewUrl ? { previewUrl: cams[0]!.previewUrl } : {}),
        },
      };
      const p = await upsertTemplate(db, { workspaceId: WS, template: presenter, createdBy });
      console.log(`[09] instrutor ${presenter.key}: ${p.created ? 'criado' : p.changed ? 'atualizado' : 'já estava'}`);
      const ref = await getTemplate(db, WS, 'estudio7-rafael');
      const refData = ref!.data as { knowledgeKeys: string[]; learnerKeys: string[] };
      const kit = {
        kind: 'kit' as const,
        key: 'estudio8-enzo',
        name: 'Estúdio 8 · Enzo',
        description: 'Enzo no estúdio 8 (cam_enzo8_esq/dir/34), voz Matheus, pílulas. Curso 09 Redes sociais.',
        data: { studioKey: 'estudio-jovem-8', presenterKey: 'instrutor-enzo', voiceKey: VOICE.key, brandingKey: 'marca-dnawork', directionKey: 'direcao-estudio-zonas', knowledgeKeys: refData.knowledgeKeys, learnerKeys: refData.learnerKeys },
      };
      const k = await upsertTemplate(db, { workspaceId: WS, template: kit, createdBy });
      console.log(`[09] kit ${kit.key}: ${k.created ? 'criado' : k.changed ? 'atualizado' : 'já estava'}`);
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

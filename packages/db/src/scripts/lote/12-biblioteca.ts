/**
 * Lote 12 (Correção de postura): registra na biblioteca a voz da Helena e, quando
 * as câmeras do estúdio 8 estiverem prontas no rascunho do curso, o presenter e o kit.
 * Só grava dados (nada pago). Uso:
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/12-biblioteca.ts [voz|tudo] [--course crs_…]
 */
import { createDb } from '../../client';
import { upsertTemplate } from '../../repositories/library';
import { getDraft } from '../../repositories/authoring';

const WSP = 'wsp_eogwtp01f358wyof';
const AUTHOR = 'usr_eiyr3114rz3pjgsn';
const VOICE = {
  provider: 'elevenlabs' as const,
  voiceId: 'lxZ1N0qzmAGjqcuEctoH',
  voiceName: 'Ádria Freitas (ElevenLabs)',
  language: 'pt-BR',
  pronoun: 'she' as const,
  libraryOwnerId: '10b0f198da7ab8bd207b7eae61da9af2993ba71e7c32dffeaf85ca2bbc8268ac',
  sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b7699959bf0e4e828aadc0e508ab9457/voices/lxZ1N0qzmAGjqcuEctoH/47ac7abc-8aec-4fa5-ac6a-c4447a4dff31.mp3',
  notes: 'Helena (curso 12, Correção de postura). Feminina madura, acolhedora, educacional (catálogo: "gentle yet strong, direct yet welcoming"). Adicionar à conta é grátis (1 vaga de voz).',
};
export const BASE_PROMPT = [
  'Photorealistic video presenter, a fictional Black Brazilian woman about 45 years old,',
  'deep brown skin, short natural gray hair (salt-and-pepper, close-cropped afro),',
  'warm, calm and welcoming expression, gentle natural smile with mouth closed.',
  'Smart-casual outfit: plain soft terracotta knit blouse under an open light beige linen blazer, small simple stud earrings, no logos.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const mode = process.argv[2] ?? 'voz';
  const ci = process.argv.indexOf('--course');
  const courseId = ci > 0 ? process.argv[ci + 1] : undefined;
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const v = await upsertTemplate(db, { workspaceId: WSP, createdBy: AUTHOR, template: { kind: 'voice', key: 'voz-adria-freitas', name: 'Ádria Freitas (ElevenLabs)', description: 'Feminina madura e acolhedora (Helena).', data: VOICE } });
    console.log(`voz: ${v.created ? 'criada' : v.changed ? 'atualizada' : 'igual'}`);
    if (mode !== 'tudo') return;
    if (!courseId) throw new Error('--course obrigatório para "tudo"');
    const draft = await getDraft(db, courseId);
    const cams = (draft!.document.presentation?.cameras ?? []).filter((c) => ['cam_helena8_esq', 'cam_helena8_dir', 'cam_helena8_34'].includes(c.id));
    if (cams.length !== 3 || cams.some((c) => c.status !== 'ready')) throw new Error(`câmeras da Helena não estão prontas (${cams.map((c) => `${c.id}:${c.status}`).join(', ')})`);
    const base = draft!.document.presentation!.cameras!.find((c) => c.id === 'cam_helena_base');
    const p = await upsertTemplate(db, { workspaceId: WSP, createdBy: AUTHOR, template: { kind: 'presenter', key: 'instrutor-helena', name: 'Helena · Sua orientadora', description: 'Mulher negra, 45, cabelo grisalho curto; madura e acolhedora.', data: {
      name: 'Helena', role: 'Sua orientadora', pronoun: 'she', baseLookId: base?.lookId, baseLookPrompt: BASE_PROMPT,
      voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName }, voiceKey: 'voz-adria-freitas',
      cameraKits: [{ studioKey: 'estudio-jovem-8', cameras: ['cam_helena8_esq', 'cam_helena8_dir', 'cam_helena8_34'].map((id) => cams.find((c) => c.id === id)!) }],
      castDetails: 'Conduz todas as falas dos vídeos com calma e acolhimento, em conversa com o aluno; nunca julga nem repreende.',
    } } });
    console.log(`presenter: ${p.created ? 'criado' : p.changed ? 'atualizado' : 'igual'}`);
    const k = await upsertTemplate(db, { workspaceId: WSP, createdBy: AUTHOR, template: { kind: 'kit', key: 'estudio8-helena', name: 'Estúdio 8 · Helena', description: 'Helena no estúdio 8, voz Ádria Freitas, pílulas.', data: {
      studioKey: 'estudio-jovem-8', presenterKey: 'instrutor-helena', voiceKey: 'voz-adria-freitas', brandingKey: 'marca-dnawork', directionKey: 'direcao-estudio-zonas',
      knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
      learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
    } } });
    console.log(`kit: ${k.created ? 'criado' : k.changed ? 'atualizado' : 'igual'}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

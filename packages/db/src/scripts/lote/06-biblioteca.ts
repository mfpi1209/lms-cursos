/**
 * Lote 2026-10-30, curso 06 (Limites e intimidade): registra a Patrícia na biblioteca de modelos.
 *   voz         → `voz-luciana-cadar` (grátis; só grava o modelo)
 *   instrutora  → `instrutor-patricia` + kit `estudio8-patricia` (lê as câmeras PRONTAS do rascunho do curso)
 * Uso (raiz do monorepo):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/06-biblioteca.ts voz
 *   COURSE_ID=crs_… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/06-biblioteca.ts instrutora
 * Nada é pago.
 */
import { createDb } from '../../client';
import { getDraft } from '../../repositories/authoring';
import { getTemplate, upsertTemplate } from '../../repositories/library';

const WS = 'wsp_eogwtp01f358wyof';
const USER = 'usr_eiyr3114rz3pjgsn';
const VOICE = {
  voiceId: 'fUAUU80st9SqdYx319Zk',
  voiceName: 'Luciana Cadar (ElevenLabs)',
  libraryOwnerId: '60810c04271cce7062b143985b41f1c6840190b31e003216712feaa4bd3c3bff',
  sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7f419fc80fc74c53a01468cb1b8587c8/voices/fUAUU80st9SqdYx319Zk/uoIIWDDd3JL5s85NzPB8.mp3',
};
export const BASE_PROMPT = [
  'Photorealistic video presenter, a fictional Brazilian woman about 38 years old,',
  'warm medium-brown skin, short natural dark hair in a neat pixie cut, small stud earrings,',
  'serene and kind expression, calm gentle smile with mouth closed.',
  'Smart-casual outfit: plain soft terracotta blouse with a simple round neckline, no logos, no other accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const stage = process.argv[2];
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    if (stage === 'voz') {
      const r = await upsertTemplate(db, {
        workspaceId: WS,
        createdBy: USER,
        template: {
          kind: 'voice',
          key: 'voz-luciana-cadar',
          name: 'Luciana Cadar (ElevenLabs)',
          description: 'Feminina madura, calma, voz de professora (Patrícia, curso 06).',
          data: {
            provider: 'elevenlabs', language: 'pt-BR', pronoun: 'she', ...VOICE,
            notes: 'Patrícia (curso 06, Limites e intimidade). Catálogo: "a teacher\'s voice—calm, with moderate intonation". Adicionar à conta é grátis (1 vaga de voz).',
          },
        },
      });
      console.log('voz', r.created ? 'criada' : r.changed ? 'atualizada' : 'igual', r.row.key);
    } else if (stage === 'instrutora') {
      const courseId = process.env.COURSE_ID!;
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`curso ${courseId} sem rascunho`);
      const cams = (draft.document.presentation?.cameras ?? []).filter((c) => /^cam_patricia8_/.test(c.id));
      if (cams.length !== 3 || cams.some((c) => c.status !== 'ready')) throw new Error(`câmeras da Patrícia ainda não estão prontas: ${cams.map((c) => `${c.id}:${c.status}`).join(', ')}`);
      const base = (draft.document.presentation?.cameras ?? []).find((c) => /_base$/.test(c.id) && /patr/i.test(c.id));
      const p = await upsertTemplate(db, {
        workspaceId: WS,
        createdBy: USER,
        template: {
          kind: 'presenter',
          key: 'instrutor-patricia',
          name: 'Patrícia · Sua orientadora',
          description: 'Mulher parda, ~38 anos, cabelo curto, serena. Criada para o curso 06 (Limites e intimidade).',
          data: {
            name: 'Patrícia', role: 'Sua orientadora', pronoun: 'she',
            voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
            voiceKey: 'voz-luciana-cadar',
            ...(base?.lookId ? { baseLookId: base.lookId } : {}),
            baseLookPrompt: BASE_PROMPT,
            castDetails: 'Conduz todas as falas dos vídeos com calma e acolhimento; nunca julga nem culpa quem sofre constrangimento.',
            cameraKits: [{ studioKey: 'estudio-jovem-8', cameras: cams }],
          },
        },
      });
      console.log('instrutora', p.created ? 'criada' : p.changed ? 'atualizada' : 'igual', p.row.key);
      const ref = (await getTemplate(db, WS, 'estudio7-marina'))!;
      const k = await upsertTemplate(db, {
        workspaceId: WS,
        createdBy: USER,
        template: {
          kind: 'kit',
          key: 'estudio8-patricia',
          name: 'Estúdio 8 · Patrícia',
          description: 'Patrícia no estúdio 8 (cam_patricia8_esq/dir/34), voz Luciana Cadar, pílulas.',
          data: { ...(ref.data as Record<string, unknown>), studioKey: 'estudio-jovem-8', presenterKey: 'instrutor-patricia', voiceKey: 'voz-luciana-cadar' },
        },
      });
      console.log('kit', k.created ? 'criado' : k.changed ? 'atualizado' : 'igual', k.row.key);
    } else {
      throw new Error('uso: 06-biblioteca.ts voz|instrutora');
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

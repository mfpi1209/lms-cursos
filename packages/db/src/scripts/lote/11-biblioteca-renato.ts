/**
 * Lote 12 cursos · curso 11 ("Não entendi a regra. Como pergunto?"): Renato na biblioteca de modelos.
 * Nada é pago nem gerado aqui; só grava modelos no banco (idempotente pela chave).
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/11-biblioteca-renato.ts voz
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/11-biblioteca-renato.ts instrutor --course crs_…
 *
 * `voz`: grava `voz-campanholi` (voz pública do ElevenLabs escolhida para o Renato).
 * `instrutor`: lê do rascunho do curso as câmeras do Renato no estúdio 6 (geradas por novo-instrutor.ts, já
 * prontas) e grava `instrutor-renato` (presenter) + `estudio6-renato` (kit).
 */
import { eq } from 'drizzle-orm';
import type { Camera } from '@lms/course-schema';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { upsertTemplate } from '../../repositories/library';

export const VOICE = {
  voiceId: 'AaeZyyi87RCxtFnHPS3e',
  voiceName: 'Campanholi (ElevenLabs)',
  libraryOwnerId: '481e049fb3789f6e1f9916099ea6d880e1edf7a872923f89cac04ba1142be06a',
  sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/payXHLehzMeYonJJcNuaLib9Ddc2/voices/AaeZyyi87RCxtFnHPS3e/7GA695QrUUVKuzyyaS1g.mp3',
};

export const BASE_PROMPT = [
  'Photorealistic video presenter, a fictional Brazilian man about 34 years old,',
  'warm light-brown (pardo) skin, short dark wavy hair neatly combed, clean-shaven,',
  'thin dark rectangular glasses, calm and patient expression, gentle natural smile with mouth closed.',
  'Smart-casual outfit: soft gray knit cardigan over a plain white crew-neck t-shirt, no logos, no other accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, glasses without glare, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const courseIdx = rest.indexOf('--course');
  const courseId = courseIdx >= 0 ? rest[courseIdx + 1] : undefined;
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const workspaces = await db.select({ id: s.workspaces.id }).from(s.workspaces);
    if (workspaces.length !== 1) throw new Error('esperava um único workspace');
    const workspaceId = workspaces[0]!.id;
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    if (!author) throw new Error('autor@demo.local não encontrado');
    const put = async (template: unknown) => {
      const r = await upsertTemplate(db, { workspaceId, template, createdBy: author.id });
      console.log(`[biblioteca] ${r.row.kind} ${r.row.key}: ${r.created ? 'criado' : r.changed ? 'atualizado' : 'sem mudança'}`);
    };

    if (mode === 'voz') {
      await put({
        kind: 'voice',
        key: 'voz-campanholi',
        name: 'Campanholi (ElevenLabs)',
        description: 'Masculina clara e paciente, didática. Escolhida para o Renato (curso 11, lote de 12).',
        data: {
          provider: 'elevenlabs',
          voiceId: VOICE.voiceId,
          voiceName: VOICE.voiceName,
          language: 'pt-BR',
          pronoun: 'he',
          sampleUrl: VOICE.sampleUrl,
          libraryOwnerId: VOICE.libraryOwnerId,
          notes: 'Biblioteca pública do ElevenLabs ("Professor, 40 anos, voz clara e didática"). Adicionar à conta é grátis (ocupa 1 vaga de voz). Usada pelo Renato.',
        },
      });
      return;
    }

    if (mode === 'instrutor') {
      if (!courseId) throw new Error('informe --course crs_…');
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`rascunho de ${courseId} não encontrado`);
      const cams = (draft.document.presentation?.cameras ?? []) as Camera[];
      const base = cams.find((c) => c.id === 'cam_renato_base');
      const studioCams = ['cam_renato6_esq', 'cam_renato6_dir', 'cam_renato6_34'].map((id) => cams.find((c) => c.id === id));
      if (!base || base.status !== 'ready') throw new Error('personagem base do Renato ainda não está pronto no rascunho');
      if (studioCams.some((c) => !c || c.status !== 'ready')) throw new Error('as 3 câmeras do Renato no estúdio 6 ainda não estão prontas');
      const main34 = studioCams[2]!;
      await put({
        kind: 'presenter',
        key: 'instrutor-renato',
        name: 'Renato · Seu orientador',
        description: 'Homem pardo, 34 anos, óculos, cardigã. Fala clara e paciente. Criado no curso 11 do lote.',
        data: {
          name: 'Renato',
          role: 'Seu orientador',
          pronoun: 'he',
          baseLookId: base.lookId,
          baseLookPrompt: BASE_PROMPT,
          voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
          voiceKey: 'voz-campanholi',
          cameraKits: [{ studioKey: 'estudio-jovem-6', cameras: studioCams }],
          castDetails: 'Conduz todas as falas dos vídeos com calma e paciência, em conversa com o aluno; nunca julga.',
          ...(main34.previewUrl ? { previewUrl: main34.previewUrl } : {}),
        },
      });
      await put({
        kind: 'kit',
        key: 'estudio6-renato',
        name: 'Estúdio 6 · Renato',
        description: 'Renato no estúdio 6 (cam_renato6_esq, cam_renato6_dir, cam_renato6_34), voz Campanholi, pílulas.',
        data: {
          studioKey: 'estudio-jovem-6',
          presenterKey: 'instrutor-renato',
          voiceKey: 'voz-campanholi',
          brandingKey: 'marca-dnawork',
          directionKey: 'direcao-estudio-zonas',
          knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
          learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
        },
      });
      return;
    }
    throw new Error('modo: voz | instrutor --course crs_…');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[biblioteca] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

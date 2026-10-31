/**
 * Lote 02 (Que roupa eu uso para trabalhar?): grava na biblioteca a voz e a
 * instrutora Camila (e o kit estudio6-camila quando as câmeras estiverem prontas
 * no rascunho do curso). Só grava dados; nada é gerado nem pago.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/02-roupa-biblioteca.ts [voz|instrutora|kit] [--course crs_…]
 */
import { eq } from 'drizzle-orm';
import type { LibraryTemplateInput } from '@lms/course-schema';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { upsertTemplate } from '../../repositories/library';

import { BASE_PROMPT, VOICE } from './02-roupa-biblioteca-dados';

const mode = process.argv[2] ?? 'voz';
const courseArg = process.argv.indexOf('--course');
const COURSE_ID = courseArg > 0 ? process.argv[courseArg + 1] : undefined;

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const ws = await db.select({ id: s.workspaces.id }).from(s.workspaces);
    if (ws.length !== 1) throw new Error('mais de um workspace');
    const workspaceId = ws[0]!.id;
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const createdBy = author!.id;
    const put = async (t: LibraryTemplateInput) => {
      const r = await upsertTemplate(db, { workspaceId, template: t, createdBy });
      console.log(`[lote02] ${t.kind} ${t.key}: ${r.created ? 'criado' : r.changed ? 'atualizado' : 'sem mudança'}`);
    };
    const voice: LibraryTemplateInput = {
      kind: 'voice', key: VOICE.key, name: VOICE.voiceName,
      description: 'Feminina jovem e acolhedora (biblioteca pública ElevenLabs). Reservada para Camila (curso 02 · roupa no trabalho).',
      data: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName, language: 'pt-BR', pronoun: 'she', sampleUrl: VOICE.sampleUrl, libraryOwnerId: VOICE.ownerId, notes: 'Camila · Sua orientadora. Escolhida em 2026-10-30 (lote 12 cursos).' },
    };
    if (mode === 'voz' || mode === 'instrutora' || mode === 'kit') await put(voice);
    if (mode === 'instrutora' || mode === 'kit') {
      const cams = COURSE_ID ? ((await getDraft(db, COURSE_ID))?.document.presentation.cameras ?? []).filter((c) => /^cam_camila6_/.test(c.id) && c.status === 'ready') : [];
      const base = COURSE_ID ? (await getDraft(db, COURSE_ID))?.document.presentation.cameras.find((c) => c.id === 'cam_camila_base') : undefined;
      await put({
        kind: 'presenter', key: 'instrutor-camila', name: 'Camila · Sua orientadora',
        description: 'Mulher negra, 27, cabelo cacheado, blazer leve claro. Personagem fictício criado só por texto.',
        data: {
          name: 'Camila', role: 'Sua orientadora', pronoun: 'she',
          ...(base?.lookId && base.status === 'ready' ? { baseLookId: base.lookId } : {}),
          baseLookPrompt: BASE_PROMPT,
          voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
          voiceKey: VOICE.key,
          cameraKits: cams.length === 3 ? [{ studioKey: 'estudio-jovem-6', cameras: cams }] : [],
          castDetails: 'Conduz todas as falas dos vídeos, em conversa com o aluno; próxima, leve, nunca julga.',
        },
      } as LibraryTemplateInput);
      if (mode === 'kit') {
        if (cams.length !== 3) throw new Error(`câmeras cam_camila6_* prontas no rascunho: ${cams.length}/3`);
        await put({
          kind: 'kit', key: 'estudio6-camila', name: 'Estúdio 6 · Camila', description: 'Camila no estúdio 6, voz Juliana, pílulas.',
          data: {
            studioKey: 'estudio-jovem-6', presenterKey: 'instrutor-camila', voiceKey: VOICE.key, brandingKey: 'marca-dnawork', directionKey: 'direcao-estudio-zonas',
            knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
            learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
          },
        });
      }
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error('[lote02] erro:', e instanceof Error ? e.message : e); process.exit(1); });

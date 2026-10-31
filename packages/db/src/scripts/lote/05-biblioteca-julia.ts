/**
 * Curso 05 "Horário é combinado": instrutora Júlia na biblioteca de modelos (só dados, nada pago).
 *   etapa "voz"   → modelo de voz voz-malu (ElevenLabs, biblioteca pública)
 *   etapa "kit"   → presenter instrutora-julia (+ câmeras do estúdio 6 lidas do rascunho do curso) e kit estudio6-julia
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/05-biblioteca-julia.ts voz|kit [crs_…]
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { getTemplate, upsertTemplate } from '../../repositories/library';

const WS = 'wsp_eogwtp01f358wyof';
const VOICE = {
  provider: 'elevenlabs' as const,
  voiceId: 'fhtZMBwha5du5OxuvexO',
  voiceName: 'Malu (ElevenLabs)',
  language: 'pt-BR',
  pronoun: 'she' as const,
  libraryOwnerId: '30aedf93b0a7df2ada0f523496ca9fe63f94737575ba68485eed3792db2e73af',
  sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/da057dc7a61341ac9b96edd1f3d92bef/voices/fhtZMBwha5du5OxuvexO/0Nb5DNek7ir0SEKh6NcU.mp3',
  notes: 'Júlia (curso 05 Horário é combinado). "Casual Explainer": clara, objetiva, sem tom formal. Biblioteca pública ElevenLabs.',
};
export const JULIA_PROMPT = [
  'Photorealistic video presenter, a fictional young Brazilian woman about 26 years old,',
  'fair skin, straight dark brown hair neatly tied back in a low ponytail, natural light makeup,',
  'clear, friendly and focused expression, relaxed natural smile with mouth closed.',
  'Outfit: a button-up shirt with thin vertical navy and white stripes, sleeves slightly rolled, no logos, small stud earrings only.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const [step, courseId] = process.argv.slice(2);
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const createdBy = author!.id;
    if (step === 'voz') {
      const taken = (await db.select().from(s.libraryTemplates).where(eq(s.libraryTemplates.kind, 'voice'))).find((t) => (t.data as { voiceId?: string }).voiceId === VOICE.voiceId && t.key !== 'voz-malu');
      if (taken) throw new Error(`voz já usada por ${taken.key}`);
      const r = await upsertTemplate(db, { workspaceId: WS, createdBy, template: { kind: 'voice', key: 'voz-malu', name: 'Malu (ElevenLabs) · clara e objetiva', description: 'Voz da Júlia: feminina jovem, clara, explica passo a passo sem formalidade.', data: VOICE } });
      console.log('voz registrada', JSON.stringify(r).slice(0, 200));
    } else if (step === 'kit') {
      if (!courseId) throw new Error('informe o curso');
      const draft = await getDraft(db, courseId);
      const cams = (draft!.document.presentation.cameras ?? []).filter((c) => /^cam_julia6_/.test(c.id));
      const base = (draft!.document.presentation.cameras ?? []).find((c) => c.id === 'cam_julia_base');
      if (cams.length !== 3 || cams.some((c) => c.status !== 'ready')) throw new Error(`câmeras da Júlia não estão prontas: ${cams.map((c) => `${c.id}:${c.status}`).join(', ')}`);
      const p = await upsertTemplate(db, { workspaceId: WS, createdBy, template: { kind: 'presenter', key: 'instrutora-julia', name: 'Júlia · Sua orientadora', description: 'Mulher branca, 26, cabelo liso preso, camisa listrada. Criada por texto (personagem fictício) para o curso 05.', data: {
        name: 'Júlia', role: 'Sua orientadora', pronoun: 'she', baseLookId: base?.lookId, baseLookPrompt: JULIA_PROMPT,
        voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName }, voiceKey: 'voz-malu',
        cameraKits: [{ studioKey: 'estudio-jovem-6', cameras: cams }],
        castDetails: 'Conduz todas as falas dos vídeos com clareza e leveza, em conversa com o aluno; nunca julga.',
        ...(cams.find((c) => c.zone === 'center')?.previewUrl ? { previewUrl: cams.find((c) => c.zone === 'center')!.previewUrl } : {}),
      } } });
      console.log('presenter', p.row.key, p.changed);
      const marina = await getTemplate(db, WS, 'estudio7-marina');
      const kd = marina!.data as Record<string, unknown>;
      const k = await upsertTemplate(db, { workspaceId: WS, createdBy, template: { kind: 'kit', key: 'estudio6-julia', name: 'Estúdio 6 · Júlia', description: 'Júlia no estúdio 6 (cam_julia6_esq/dir/34), voz Malu, pílulas.', data: { ...kd, studioKey: 'estudio-jovem-6', presenterKey: 'instrutora-julia', voiceKey: 'voz-malu' } } });
      console.log('kit', k.row.key, k.changed);
    } else throw new Error('etapa: voz | kit');
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

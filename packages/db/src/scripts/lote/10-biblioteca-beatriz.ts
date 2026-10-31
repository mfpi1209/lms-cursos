/**
 * Curso 10 (lote): grava na biblioteca a voz, a instrutora Beatriz e o kit estudio7-beatriz.
 * Só dados, nada pago. Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/10-biblioteca-beatriz.ts voz
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/10-biblioteca-beatriz.ts instrutora <courseId>
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { applyTemplateToCourse, upsertTemplate } from '../../repositories/library';

const WORKSPACE = 'wsp_eogwtp01f358wyof';
const VOICE = {
  kind: 'voice' as const,
  key: 'voz-bea',
  name: 'Bea · calma e acolhedora (ElevenLabs)',
  description: 'Voz feminina jovem, calma, conversacional (pt-BR). Escolhida para a Beatriz, curso 10 do lote.',
  data: {
    provider: 'elevenlabs' as const,
    voiceId: 'cabLxBh81HurPAAJfEHo',
    voiceName: 'Bea (ElevenLabs)',
    language: 'pt-BR',
    pronoun: 'she' as const,
    libraryOwnerId: '8b7a43b9f8f073d90263975bacb46e8e50bc994359806f332bd2891b792eb35b',
    sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/65cf60de9a9743c1aabceecc6e99fdb3/voices/cabLxBh81HurPAAJfEHo/d387118d-3229-4d7f-909d-873977a53e11.mp3',
    notes: 'Curso 10 "Acabou minha tarefa. E agora?" (lote 2026-10-30). Adicionar à conta é grátis (ocupa 1 vaga de voz).',
  },
};
export const BEATRIZ_PROMPT = [
  'Photorealistic video presenter, a fictional young Brazilian Indigenous woman about 28 years old,',
  'warm brown skin, long straight black hair falling past the shoulders, neatly combed,',
  'calm and welcoming expression, gentle natural smile with mouth closed.',
  'Smart-casual outfit: plain soft beige blouse, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const [cmd, courseId] = process.argv.slice(2);
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const [author] = await db.select().from(s.user).where(eq(s.user.email, 'autor@demo.local'));
    if (!author) throw new Error('autor@demo.local não existe');
    if (cmd === 'voz') {
      const r = await upsertTemplate(db, { workspaceId: WORKSPACE, template: VOICE, createdBy: author.id });
      console.log(`voz ${VOICE.key}: ${r.created ? 'criada' : r.changed ? 'atualizada' : 'igual'}`);
      return;
    }
    if (cmd === 'instrutora') {
      if (!courseId) throw new Error('informe o courseId');
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error('rascunho não encontrado');
      const p = draft.document.presentation!;
      const cams = (p.cameras ?? []).filter((c) => /^cam_beatriz7_(esq|dir|34)$/.test(c.id));
      const base = (p.cameras ?? []).find((c) => c.id === 'cam_beatriz_base');
      if (cams.length !== 3 || cams.some((c) => c.status !== 'ready')) throw new Error(`câmeras da Beatriz não estão prontas: ${cams.map((c) => `${c.id}=${c.status}`).join(', ') || 'nenhuma'}`);
      const order = { center: 0, left: 1, right: 2 } as const;
      cams.sort((a, b) => order[a.zone ?? 'center'] - order[b.zone ?? 'center']);
      const presenter = {
        kind: 'presenter' as const,
        key: 'instrutor-beatriz',
        name: 'Beatriz · Sua orientadora',
        description: 'Instrutora fictícia (mulher indígena, 28, cabelo longo liso), criada só por texto no HeyGen. Curso 10 do lote.',
        data: {
          name: 'Beatriz',
          role: 'Sua orientadora',
          pronoun: 'she' as const,
          ...(base?.lookId ? { baseLookId: base.lookId } : {}),
          baseLookPrompt: BEATRIZ_PROMPT,
          voice: { provider: 'elevenlabs' as const, voiceId: VOICE.data.voiceId, voiceName: VOICE.data.voiceName },
          voiceKey: VOICE.key,
          cameraKits: [{ studioKey: 'estudio-jovem-7', cameras: cams }],
          castDetails: 'Conduz todas as falas dos vídeos, em conversa com o aluno, com calma e leveza; nunca julga.',
          ...(cams[0]!.previewUrl ? { previewUrl: cams[0]!.previewUrl } : {}),
        },
      };
      const kit = {
        kind: 'kit' as const,
        key: 'estudio7-beatriz',
        name: 'Estúdio 7 · Beatriz',
        description: 'Beatriz no estúdio 7 (cam_beatriz7_esq, cam_beatriz7_dir, cam_beatriz7_34), voz Bea, pílulas.',
        data: {
          studioKey: 'estudio-jovem-7',
          presenterKey: 'instrutor-beatriz',
          voiceKey: VOICE.key,
          brandingKey: 'marca-dnawork',
          directionKey: 'direcao-estudio-zonas',
          knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
          learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
        },
      };
      for (const t of [presenter, kit]) {
        const r = await upsertTemplate(db, { workspaceId: WORKSPACE, template: t, createdBy: author.id });
        console.log(`${t.kind} ${t.key}: ${r.created ? 'criado' : r.changed ? 'atualizado' : 'igual'}`);
      }
      return;
    }
    if (cmd === 'aplicar') {
      if (!courseId) throw new Error('informe o courseId');
      const r = await applyTemplateToCourse(db, { workspaceId: WORKSPACE, courseId, templateIdOrKey: 'estudio7-beatriz', userId: author.id });
      console.log(JSON.stringify({ revision: (r as { revision?: number }).revision, changes: (r as { changes?: string[] }).changes }, null, 1));
      return;
    }
    if (cmd === 'paleta') {
      if (!courseId) throw new Error('informe o courseId');
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error('rascunho não encontrado');
      const doc = structuredClone(draft.document);
      const pal = { base: '#1D1E4C', accent: '#FF7A08' };
      if (JSON.stringify((doc.branding as { videoPalette?: unknown }).videoPalette) === JSON.stringify(pal)) { console.log('paleta já aplicada'); return; }
      (doc.branding as { videoPalette?: unknown }).videoPalette = pal;
      const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: author.id, origin: 'script', note: 'paleta clássica (lote, curso 10)' });
      console.log(`paleta clássica: revisão ${draft.revision} → ${r.revision}`);
      return;
    }
    if (cmd === 'marca') {
      if (!courseId) throw new Error('informe o courseId');
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error('rascunho não encontrado');
      const doc = structuredClone(draft.document);
      if (doc.branding.wordmark === 'Terminei a tarefa') { console.log('marca já ajustada'); return; }
      doc.branding.wordmark = 'Terminei a tarefa';
      const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: author.id, origin: 'script', note: 'marca curta no cabeçalho (lote, curso 10)' });
      console.log(`marca: revisão ${draft.revision} → ${r.revision}`);
      return;
    }
    throw new Error('uso: voz | instrutora <courseId> | aplicar <courseId> | paleta <courseId> | marca <courseId>');
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

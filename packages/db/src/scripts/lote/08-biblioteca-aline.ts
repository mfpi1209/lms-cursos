/**
 * Curso 08 (Espaços compartilhados): grava a instrutora Aline na biblioteca de modelos.
 * Não chama provedor pago nenhum: só lê o rascunho do curso e grava `library_templates`.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/08-biblioteca-aline.ts voz
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/08-biblioteca-aline.ts instrutor crs_…
 *
 * `voz`: modelo `voz-ana-alice` (reserva a voz para este curso).
 * `instrutor <curso>`: modelos `instrutor-aline` (câmeras prontas do estúdio 6 lidas do rascunho) e kit `estudio6-aline`.
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { applyTemplateToCourse, stableJson, upsertTemplate } from '../../repositories/library';
import { getDraft, saveDraft } from '../../repositories/authoring';

const WORKSPACE = 'wsp_eogwtp01f358wyof';
const PALETTE = { base: '#1D1E4C', accent: '#FF7A08' };
const VOICE = {
  provider: 'elevenlabs' as const,
  voiceId: 'ORgG8rwdAiMYRug8RJwR',
  voiceName: 'Ana Alice (ElevenLabs)',
  libraryOwnerId: 'c6b5b17b1c22a279d69e71dd86da01e8ad40f328d3cb725b62e7c8f8c7b5e066',
};
export const ALINE_PROMPT = [
  'Photorealistic video presenter, a fictional Brazilian woman of East Asian descent, about 29 years old,',
  'light warm skin, straight black hair in a neat chin-length bob haircut (chanel), natural light makeup,',
  'friendly and approachable expression, relaxed natural smile with mouth closed.',
  'Smart-casual outfit: soft off-white blouse with a light coral open cardigan, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

async function main() {
  const [stage, courseId] = process.argv.slice(2);
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const author = (await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')))[0];
    if (!author) throw new Error('autor@demo.local não encontrado');
    if (stage === 'voz') {
      const r = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: author.id,
        template: {
          kind: 'voice',
          key: 'voz-ana-alice',
          name: 'Ana Alice (ElevenLabs)',
          description: 'Feminina jovem, simpática e clara. Voz da Aline (curso 08 Espaços compartilhados).',
          data: {
            ...VOICE,
            language: 'pt-BR',
            pronoun: 'she',
            sampleUrl: 'https://api.elevenlabs.io/v1/voices/ORgG8rwdAiMYRug8RJwR/previews/audio',
            notes: 'Biblioteca pública ElevenLabs ("Ana Alice - Friendly & Clear", pt-BR). Reservada para a Aline (lote 12, curso 08).',
          },
        },
      });
      console.log(`voz-ana-alice: ${r.created ? 'criada' : r.changed ? 'atualizada' : 'sem mudança'} (${r.row.id})`);
      return;
    }
    if (stage === 'instrutor') {
      if (!courseId) throw new Error('informe o curso: instrutor crs_…');
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`rascunho de ${courseId} não encontrado`);
      const p = draft.document.presentation!;
      const cams = (p.cameras ?? []).filter((c) => /^cam_aline6_(esq|dir|34)$/.test(c.id));
      if (cams.length !== 3 || cams.some((c) => c.status !== 'ready' || !c.lookId)) throw new Error(`câmeras da Aline no estúdio 6 não estão prontas: ${cams.map((c) => `${c.id}=${c.status}`).join(', ') || 'nenhuma'}`);
      const base = (p.cameras ?? []).find((c) => c.id === 'cam_aline_base');
      const pres = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: author.id,
        template: {
          kind: 'presenter',
          key: 'instrutor-aline',
          name: 'Aline · Sua orientadora',
          description: 'Mulher de ascendência asiática, 29, cabelo chanel. Personagem fictícia criada por texto (curso 08).',
          data: {
            name: 'Aline',
            role: 'Sua orientadora',
            pronoun: 'she',
            ...(base?.lookId ? { baseLookId: base.lookId } : {}),
            baseLookPrompt: ALINE_PROMPT,
            voice: { provider: VOICE.provider, voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
            voiceKey: 'voz-ana-alice',
            cameraKits: [{ studioKey: 'estudio-jovem-6', cameras: cams.map(({ previewUrl: _p, ...c }) => c) }],
            castDetails: 'Conduz todas as falas dos vídeos com leveza e proximidade; fala com o aluno, nunca julga.',
          },
        },
      });
      console.log(`instrutor-aline: ${pres.created ? 'criado' : pres.changed ? 'atualizado' : 'sem mudança'}`);
      const kit = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: author.id,
        template: {
          kind: 'kit',
          key: 'estudio6-aline',
          name: 'Estúdio 6 · Aline',
          description: 'Aline no estúdio 6 (câmeras esquerda, direita e 3/4), voz Ana Alice, pílulas.',
          data: {
            studioKey: 'estudio-jovem-6',
            presenterKey: 'instrutor-aline',
            voiceKey: 'voz-ana-alice',
            brandingKey: 'marca-dnawork',
            directionKey: 'direcao-estudio-zonas',
            knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
            learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
          },
        },
      });
      console.log(`estudio6-aline: ${kit.created ? 'criado' : kit.changed ? 'atualizado' : 'sem mudança'}`);
      return;
    }
    if (stage === 'aplicar') {
      if (!courseId) throw new Error('informe o curso: aplicar crs_…');
      // 1. kit no rascunho (estúdio 6, câmeras, voz, letreiro, marca d'água)
      const before = (await getDraft(db, courseId))!;
      const oldZone = new Map((before.document.presentation.cameras ?? []).map((c) => [c.id, c.zone] as const));
      const r = await applyTemplateToCourse(db, { workspaceId: WORKSPACE, courseId, templateIdOrKey: 'estudio6-aline', userId: author.id, expectedRevision: before.revision });
      console.log(`kit estudio6-aline: ${r.changed ? `revisão ${before.revision} → ${r.revision}` : 'sem mudança'}; ${r.changes.join(' | ')}`);
      // 2. planos: o kit troca as câmeras mas não os planos já dirigidos; troca pela câmera da mesma zona
      const draft = (await getDraft(db, courseId))!;
      const doc = structuredClone(draft.document);
      const byZone = new Map((doc.presentation.cameras ?? []).map((c) => [c.zone, c.id] as const));
      const valid = new Set((doc.presentation.cameras ?? []).map((c) => c.id));
      let remapped = 0;
      for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
        const dir = 'direction' in n ? n.direction : undefined;
        for (const s of dir?.shots ?? []) {
          if (!s.cameraId || valid.has(s.cameraId)) continue;
          // o novo-instrutor tira as câmeras antigas do rascunho; aí a zona sai do sufixo do id
          const suffix = /_(esq|dir|34)$/.exec(s.cameraId)?.[1];
          const zone = oldZone.get(s.cameraId) ?? (suffix === 'esq' ? 'left' : suffix === 'dir' ? 'right' : suffix === '34' ? 'center' : undefined);
          const to = byZone.get(zone);
          if (!to) throw new Error(`plano ${n.id}/${s.id}: câmera ${s.cameraId} sem equivalente`);
          s.cameraId = to;
          remapped++;
        }
      }
      // 3. paleta clássica nos vídeos
      doc.branding = { ...doc.branding, videoPalette: PALETTE };
      if (stableJson(doc) === stableJson(draft.document)) return console.log('planos e paleta já certos; nada gravado');
      const s2 = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: author.id, origin: 'script', note: `Aline: ${remapped} planos nas câmeras do estúdio 6; paleta clássica (lote 08)` });
      console.log(`planos trocados: ${remapped}; paleta clássica; revisão ${draft.revision} → ${s2.revision}`);
      return;
    }
    throw new Error('uso: voz | instrutor crs_… | aplicar crs_…');
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

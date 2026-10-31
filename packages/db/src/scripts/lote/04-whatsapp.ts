/**
 * Curso 04 do lote — "WhatsApp profissional sem passar vergonha" (instrutor Thiago, estúdio 8, paleta clássica).
 * Nada aqui é pago nem chama provedor de mídia: só grava na biblioteca e no rascunho.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/04-whatsapp.ts voz
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/04-whatsapp.ts instrutor --course crs_…   (depois das câmeras prontas)
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/04-whatsapp.ts paleta --course crs_…
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { applyTemplateToCourse, upsertTemplate } from '../../repositories/library';
import type { Camera, CourseDocument } from '@lms/course-schema';

const WORKSPACE = 'wsp_eogwtp01f358wyof';
const AUTHOR = 'usr_eiyr3114rz3pjgsn';

export const VOICE = {
  key: 'voz-davi-andrei',
  voiceId: '2CECaLAGTS5NRGxgbcxr',
  voiceName: 'Davi Andrei (ElevenLabs)',
  libraryOwnerId: 'ed7d4eb1c7a13c5467247589fd317f4ac181df7796bba465a75cca65526678bc',
  sampleUrl:
    'https://storage.googleapis.com/eleven-public-prod/database/workspace/8c188f4b492b480a9c6baa423848672a/voices/2CECaLAGTS5NRGxgbcxr/Ty4QmHdwZ0YfO9dIknF0.mp3',
};

export const THIAGO_BASE_PROMPT = [
  'Photorealistic video presenter, a fictional young Brazilian man about 25 years old, mixed-race (pardo),',
  'light-brown skin, short dark wavy hair with a clean fade, clean-shaven,',
  'warm and approachable expression, easy natural smile with mouth closed.',
  'Casual outfit: light blue short-sleeve button-up shirt, open collar, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

const PALETTE = { base: '#1D1E4C', accent: '#FF7A08' };

const argv = process.argv.slice(2);
const cmd = argv[0];
const val = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    if (cmd === 'voz') {
      const r = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: AUTHOR,
        template: {
          kind: 'voice',
          key: VOICE.key,
          name: VOICE.voiceName,
          description: 'Masculina jovem e leve (20 e poucos, fala natural). Escolhida para o Thiago, curso 04 WhatsApp profissional.',
          data: {
            provider: 'elevenlabs',
            voiceId: VOICE.voiceId,
            voiceName: VOICE.voiceName,
            language: 'pt-BR',
            pronoun: 'he',
            sampleUrl: VOICE.sampleUrl,
            libraryOwnerId: VOICE.libraryOwnerId,
            notes: 'Lote 12 cursos · curso 04 (Thiago). Adicionar à conta é grátis.',
          },
        },
      });
      console.log(`[04] voz ${VOICE.key}: ${r.created ? 'criada' : r.changed ? 'atualizada' : 'sem mudança'} (${r.row.id})`);
      return;
    }
    const courseId = val('course');
    if (!courseId) throw new Error('informe --course crs_…');
    const draft = (await getDraft(db, courseId))!;
    if (cmd === 'instrutor') {
      const cams = (draft.document.presentation?.cameras ?? []) as Camera[];
      const base = cams.find((c) => c.id === 'cam_thiago_base');
      const studioCams = ['cam_thiago8_esq', 'cam_thiago8_dir', 'cam_thiago8_34'].map((id) => cams.find((c) => c.id === id));
      if (!base || studioCams.some((c) => !c || c.status !== 'ready')) throw new Error('câmeras do Thiago ainda não estão prontas no rascunho');
      const p = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: AUTHOR,
        template: {
          kind: 'presenter',
          key: 'instrutor-thiago',
          name: 'Thiago · Seu orientador',
          description: 'Homem pardo, 25, camisa casual, sorriso fácil. Criado só por texto (personagem fictício).',
          data: {
            name: 'Thiago',
            role: 'Seu orientador',
            pronoun: 'he',
            baseLookId: base.lookId,
            baseLookPrompt: THIAGO_BASE_PROMPT,
            voice: { provider: 'elevenlabs', voiceId: VOICE.voiceId, voiceName: VOICE.voiceName },
            voiceKey: VOICE.key,
            cameraKits: [{ studioKey: 'estudio-jovem-8', cameras: studioCams as Camera[] }],
            castDetails: 'Conduz todas as falas dos vídeos, em conversa com o aluno, com leveza; nunca julga.',
            ...(studioCams[2]!.previewUrl ? { previewUrl: studioCams[2]!.previewUrl } : {}),
          },
        },
      });
      console.log(`[04] instrutor-thiago: ${p.created ? 'criado' : p.changed ? 'atualizado' : 'sem mudança'}`);
      const k = await upsertTemplate(db, {
        workspaceId: WORKSPACE,
        createdBy: AUTHOR,
        template: {
          kind: 'kit',
          key: 'estudio8-thiago',
          name: 'Estúdio 8 · Thiago',
          description: 'Thiago no estúdio 8 (cam_thiago8_esq/dir/34), voz Davi Andrei, pílulas.',
          data: {
            studioKey: 'estudio-jovem-8',
            presenterKey: 'instrutor-thiago',
            voiceKey: VOICE.key,
            brandingKey: 'marca-dnawork',
            directionKey: 'direcao-estudio-zonas',
            knowledgeKeys: ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo'],
            learnerKeys: ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'],
          },
        },
      });
      console.log(`[04] estudio8-thiago: ${k.created ? 'criado' : k.changed ? 'atualizado' : 'sem mudança'}`);
      if (argv.includes('--aplicar')) {
        const r = await applyTemplateToCourse(db, { workspaceId: WORKSPACE, courseId, templateIdOrKey: 'estudio8-thiago', userId: AUTHOR, expectedRevision: draft.revision });
        console.log('[04] kit aplicado ao curso', JSON.stringify(r).slice(0, 300));
      }
      return;
    }
    if (cmd === 'paleta') {
      const doc = structuredClone(draft.document) as CourseDocument;
      // letreiro: o título inteiro passa de 40 caracteres e o importador corta com "…"
      doc.branding = { ...(doc.branding ?? {}), videoPalette: PALETTE, wordmark: 'WhatsApp profissional' } as CourseDocument['branding'];
      const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: AUTHOR, origin: 'script', note: 'paleta clássica (lote 04)' });
      console.log(`[04] paleta clássica: rascunho ${draft.revision} → ${r.revision}`);
      return;
    }
    if (cmd === 'textos') {
      // menos texto na tela em Q01/Q02 (a frase da pergunta fica igual: o cartão "pergunta a seguir" dos vídeos não muda)
      const doc = structuredClone(draft.document) as CourseDocument;
      const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
      const docOf = (...ts: string[]) => ({ type: 'doc', content: ts.map(para) });
      const edits: Record<string, { situation: string; question: string; feedback: Record<string, string> }> = {
        q01: {
          situation: 'Iara recebeu o contato de quem orienta o acesso ao sistema. Elas ainda não conversaram.',
          question: 'Como você começa o primeiro contato?',
          feedback: {
            strong: 'Você dá contexto para a pessoa responder. Faça assim: identificação, assunto e pedido na mesma mensagem.',
            ok: 'Você faz o pedido, mas falta dizer de onde vem. Faça assim: conte também sua equipe ou que começou agora.',
            weak: 'Um oi sozinho não diz o assunto. Faça assim: mande o contexto e o pedido junto com o cumprimento.',
          },
        },
        q02: {
          situation: 'Pedro tem uma dúvida com vários detalhes e não sabe se a pessoa pode ouvir áudio agora.',
          question: 'Você precisa mandar um áudio longo. Como procede?',
          feedback: {
            strong: 'Você consulta o formato e facilita para a pessoa. Faça assim: espere o combinado ou organize o pedido por texto.',
            ok: 'Você explica, mas escolheu o formato pela pessoa. Faça assim: confirme antes se áudio funciona para ela.',
            weak: 'Vários áudios escondem a dúvida principal. Faça assim: resuma o assunto e confirme o melhor formato.',
          },
        },
      };
      for (const l of doc.modules.flatMap((m) => m.lessons)) {
        for (const n of l.graph.nodes) {
          const e = n.type === 'choice' ? edits[n.id] : undefined;
          if (!e || n.type !== 'choice') continue;
          n.prompt = docOf(e.situation, e.question) as typeof n.prompt;
          for (const o of n.options) if (o.quality && e.feedback[o.quality]) o.feedback = docOf(e.feedback[o.quality]!) as typeof o.feedback;
        }
      }
      const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: AUTHOR, origin: 'script', note: 'menos texto em Q01/Q02 (lote 04)' });
      console.log(`[04] textos Q01/Q02: rascunho ${draft.revision} → ${r.revision}`);
      return;
    }
    throw new Error('comando: voz | instrutor | paleta | textos');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error('[04] erro:', e instanceof Error ? e.message : e);
  process.exit(1);
});

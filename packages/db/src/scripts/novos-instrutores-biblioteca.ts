/**
 * Pacote-15: registra na biblioteca de modelos os 4 instrutores novos (Mauro, Laís, Vinícius, Flávia):
 * voz, instrutor (presenter) e kit. Só grava dados (nada pago); idempotente pela chave.
 * Lê do rascunho do 1º curso da trilha as câmeras já PRONTAS (geradas por `gerar-instrutor.sh`).
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/novos-instrutores-biblioteca.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { Camera } from '@lms/course-schema';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft } from '../repositories/authoring';
import { upsertTemplate } from '../repositories/library';

const DOC = 'docs/novos-cursos/instrutores-novos.md';
const dry = process.argv.includes('--dry-run');
const KNOWLEDGE = ['regras-produto', 'regras-roteiro', 'regras-fala', 'regras-video', 'regras-camera', 'regras-cartoes', 'regras-marca', 'regras-custo', 'regras-producao'];
const LEARNERS = ['aluno-ana-clara', 'aluno-diego', 'aluno-beatriz', 'aluno-kaua', 'aluno-jessica'];

interface Spec {
  slug: string; name: string; pronoun: 'he' | 'she'; studio: string; courseId: string; promptIndex: number;
  voice: { key: string; id: string; name: string; owner: string; sampleUrl: string; desc: string; notes: string };
  card: string; castDetails: string; kitKey: string; presenterKey: string; presenterDesc: string;
}
const SPECS: Spec[] = [
  { slug: 'mauro', name: 'Mauro', pronoun: 'he', studio: '7', courseId: 'crs_t303ykqfmhj3yb1g', promptIndex: 0,
    voice: { key: 'voz-jose-pininga', id: 'o5SEF8ldKBWn7OBNDti3', name: 'José Pininga (ElevenLabs)', owner: 'c4d2c131fa309a316dee3325e85d15a6644a649ea45961f61d1e06585c36022c',
      sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f7bc57e7a9a04f79a9a33d57a461140c/voices/o5SEF8ldKBWn7OBNDti3/c5dceefd-dc7e-4e82-b7c7-a2ad79deb4c0.mp3',
      desc: 'Masculina madura, timbre grave, acolhedora e firme (Mauro).', notes: 'Biblioteca pública do ElevenLabs ("mature and welcoming, deep timbre, authority, serenity and confidence", educacional, pt-BR). Adicionar à conta é grátis. Usada pelo Mauro (trilha Respeito e diálogo).' },
    card: 'Mauro · Seu orientador', castDetails: 'Conduz todas as falas dos vídeos com calma e firmeza acolhedora, em conversa com o aluno; escuta antes de responder e nunca ridiculariza.',
    kitKey: 'estudio7-mauro', presenterKey: 'instrutor-mauro', presenterDesc: 'Homem negro, 48, careca, barba grisalha, corpo largo; acolhedor e firme. Trilha Respeito e diálogo.' },
  { slug: 'lais', name: 'Laís', pronoun: 'she', studio: '8', courseId: 'crs_tg9iqz8wmmf5pw77', promptIndex: 1,
    voice: { key: 'voz-muriell', id: 'JcRcOH4TrCX2WZ3MNBts', name: 'Muriell (ElevenLabs)', owner: '8f86dfb0a74f011ea8784089ec7d615c270ea445213591e04116ac86ad762409',
      sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1327813d135f47ee885e597cc3ce384e/voices/JcRcOH4TrCX2WZ3MNBts/4e148dd8-a337-4a48-8e0e-f63d80f3e44d.mp3',
      desc: 'Feminina jovem-adulta, clara e confiante, tom profissional e próximo (Laís).', notes: 'Biblioteca pública do ElevenLabs ("natural, confident, welcoming; clear speech, balanced pace, gentle pauses; corporate and training", pt-BR). Adicionar à conta é grátis. Usada pela Laís (trilha Tecnologia com critério).' },
    card: 'Laís · Sua orientadora', castDetails: 'Conduz todas as falas dos vídeos com curiosidade e precisão, em conversa com o aluno; diz de onde vem cada resposta e desconfia com bom humor.',
    kitKey: 'estudio8-lais', presenterKey: 'instrutor-lais', presenterDesc: 'Mulher de ascendência libanesa, 33, coque baixo, óculos redondos; curiosa e precisa. Trilha Tecnologia com critério.' },
  { slug: 'vinicius', name: 'Vinícius', pronoun: 'he', studio: '6', courseId: 'crs_4jh683s5h351z2db', promptIndex: 2,
    voice: { key: 'voz-guilherme', id: 'GnDrTQvdzZ7wqAKfLzVQ', name: 'Guilherme (ElevenLabs)', owner: 'ef0ee9a647de39255875b528f69f8ea02f7358a76f164b79e89d0e3933bd5ce1',
      sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/GZklFJ99hoVAJzGbYaE5B6J9XfC3/voices/GnDrTQvdzZ7wqAKfLzVQ/26e3c089-5039-4c91-81a4-fcf2f6696edb.mp3',
      desc: 'Masculina jovem (30 anos), direta e neutra, conversacional (Vinícius).', notes: 'Biblioteca pública do ElevenLabs ("Direct and Neutral", homem brasileiro de 30 anos, conversacional, pt-BR). Adicionar à conta é grátis. Usada pelo Vinícius (trilha Autonomia no trabalho).' },
    card: 'Vinícius · Seu orientador', castDetails: 'Conduz todas as falas dos vídeos de forma direta e encorajadora, em conversa com o aluno; fala de erro como quem já errou e consertou, e dá o próximo passo.',
    kitKey: 'estudio6-vinicius', presenterKey: 'instrutor-vinicius', presenterDesc: 'Homem de ascendência japonesa, 31, cabelo liso curto; direto e encorajador. Trilha Autonomia no trabalho.' },
  { slug: 'flavia', name: 'Flávia', pronoun: 'she', studio: '6', courseId: 'crs_dp9s7pdro9j6e3m0', promptIndex: 3,
    voice: { key: 'voz-scheila', id: 'cyD08lEy76q03ER1jZ7y', name: 'Scheila (ElevenLabs)', owner: '1202a8d7d6d6dbee4425ff3daf90a728ea70ebc1597bf799cc724cae835a00e0',
      sampleUrl: 'https://storage.googleapis.com/eleven-public-prod/UfR91GZFReU9KE7HWeOrpPEKpG73/voices/cyD08lEy76q03ER1jZ7y/4cb10850-1932-48bf-a88d-600839c19c80.mp3',
      desc: 'Feminina de meia-idade, nítida e articulada, calma e direta (Flávia).', notes: 'Biblioteca pública do ElevenLabs ("middle aged Brazilian female, crisp, carefully articulated, smooth cadence", calma, conversacional, pt-BR). Adicionar à conta é grátis. Usada pela Flávia (trilha Pensar e resolver).' },
    card: 'Flávia · Sua orientadora', castDetails: 'Conduz todas as falas dos vídeos com calma analítica e leveza, em conversa com o aluno; desmonta o problema em partes e faz a pergunta certa em vez de dar a resposta pronta.',
    kitKey: 'estudio6-flavia', presenterKey: 'instrutor-flavia', presenterDesc: 'Mulher de pele clara com sardas, 41, cabelo castanho com fios grisalhos; analítica e leve. Trilha Pensar e resolver.' },
];

function prompts(): string[] {
  const t = readFileSync(DOC, 'utf8');
  return [...t.matchAll(/`BASE_PROMPT` \(inglês\):\n\n```\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
}

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const ws = await db.select({ id: s.workspaces.id }).from(s.workspaces);
    if (ws.length !== 1) throw new Error('esperava um único workspace');
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    if (!author) throw new Error('autor@demo.local não encontrado');
    const P = prompts();
    if (P.length !== 4) throw new Error(`esperava 4 BASE_PROMPT em ${DOC}, achei ${P.length}`);
    const put = async (template: any) => {
      if (dry) { console.log(`[biblioteca] (dry-run) ${template.kind} ${template.key}`); return; }
      const r = await upsertTemplate(db, { workspaceId: ws[0]!.id, template, createdBy: author.id });
      console.log(`[biblioteca] ${r.row.kind} ${r.row.key}: ${r.created ? 'criado' : r.changed ? 'atualizado' : 'sem mudança'}`);
    };
    for (const sp of SPECS) {
      const draft = await getDraft(db, sp.courseId);
      if (!draft) throw new Error(`rascunho de ${sp.courseId} não encontrado`);
      const cams = (draft.document.presentation?.cameras ?? []) as Camera[];
      const base = cams.find((c) => c.id === `cam_${sp.slug}_base`);
      const ids = ['esq', 'dir', '34'].map((x) => `cam_${sp.slug}${sp.studio}_${x}`);
      const studioCams = ids.map((id) => cams.find((c) => c.id === id));
      if (!base || base.status !== 'ready') throw new Error(`${sp.name}: personagem base não está pronto no rascunho`);
      if (studioCams.some((c) => !c || c.status !== 'ready')) throw new Error(`${sp.name}: as 3 câmeras do estúdio ${sp.studio} não estão prontas`);
      const main34 = studioCams[2]!;
      await put({ kind: 'voice', key: sp.voice.key, name: sp.voice.name, description: sp.voice.desc, data: {
        provider: 'elevenlabs', voiceId: sp.voice.id, voiceName: sp.voice.name, language: 'pt-BR', pronoun: sp.pronoun,
        sampleUrl: sp.voice.sampleUrl, libraryOwnerId: sp.voice.owner, notes: sp.voice.notes } });
      await put({ kind: 'presenter', key: sp.presenterKey, name: sp.card, description: sp.presenterDesc, data: {
        name: sp.name, role: sp.pronoun === 'she' ? 'Sua orientadora' : 'Seu orientador', pronoun: sp.pronoun,
        baseLookId: base.lookId, baseLookPrompt: P[sp.promptIndex],
        voice: { provider: 'elevenlabs', voiceId: sp.voice.id, voiceName: sp.voice.name }, voiceKey: sp.voice.key,
        cameraKits: [{ studioKey: `estudio-jovem-${sp.studio}`, cameras: studioCams }],
        castDetails: sp.castDetails, ...(main34.previewUrl ? { previewUrl: main34.previewUrl } : {}) } });
      await put({ kind: 'kit', key: sp.kitKey, name: `Estúdio ${sp.studio} · ${sp.name}`,
        description: `${sp.name} no estúdio ${sp.studio} (${ids.join(', ')}), voz ${sp.voice.name.replace(' (ElevenLabs)', '')}, pílulas.`, data: {
          studioKey: `estudio-jovem-${sp.studio}`, presenterKey: sp.presenterKey, voiceKey: sp.voice.key, brandingKey: 'marca-dnawork',
          directionKey: 'direcao-estudio-zonas', knowledgeKeys: KNOWLEDGE, learnerKeys: LEARNERS } });
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(`[biblioteca] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

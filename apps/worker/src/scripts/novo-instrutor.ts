/**
 * Instrutor NOVO para um curso (PAGO — só rodar com aprovação explícita do autor):
 *  1. voz: garante que a voz da biblioteca pública do ElevenLabs está na conta (adicionar é grátis) e grava o voiceId;
 *  2. rosto: cria um personagem sintético novo no HeyGen só com texto (POST /v3/avatars sem avatar_id, ~1 crédito);
 *  3. estúdio: gera 3 câmeras dentro do estúdio a partir desse personagem (esquerda, direita, 3/4; ~3 créditos).
 * Tudo fica gravado no RASCUNHO do curso (câmeras com generationId), então rodar de novo só continua o que falta,
 * sem pagar de novo (Idempotency-Key estável). Ao final, a 3/4 vira o avatar principal e as câmeras herdadas de
 * outro apresentador saem do rascunho.
 *
 * Uso (raiz do monorepo):
 *   zsh apps/worker/src/scripts/gerar-instrutor.sh
 */
import { readFileSync } from 'node:fs';
import { createDb, authoring } from '@lms/db';
import { advanceInstructor, HeyGenLooksAdapter, instructorBaseId, instructorCameraSpecs, type InstructorState } from '@lms/media';
import type { Camera, CourseDocument } from '@lms/course-schema';

// obrigatórios: sem padrão, para nunca mexer no rascunho de outro curso
const COURSE_ID = process.env.COURSE_ID ?? '';
const NAME = process.env.INSTRUTOR ?? '';
if (!COURSE_ID || !NAME) throw new Error('Informe COURSE_ID e INSTRUTOR (ex.: COURSE_ID=crs_… INSTRUTOR=Helena)');
const STUDIO = process.env.ESTUDIO ?? '7';
const STUDIO_REF = `docs/brand/cenario/estudio-jovem-${STUDIO}.png`;
/** descrição curta de cada estúdio aprovado (a mesma de `gerar-estudios.sh`); `ESTUDIO_DESC` sobrescreve */
const STUDIO_DESCS: Record<string, string> = {
  '6': 'studio: clean wall, navy pegboard and orange arch left, navy shelf with DW logo right',
  '7': 'studio: clean wall, wooden arch with LED left, orange curved wall with DW logo right',
  '8': 'studio: clean wall, navy panels with wood slats and LED both sides, DW logo right',
};
const STUDIO_TEXT = process.env.ESTUDIO_DESC ?? STUDIO_DESCS[STUDIO] ?? STUDIO_DESCS['7']!;
/** pronome do instrutor nos pedidos de câmera (`he` | `she`); padrão `he` */
const PRONOUN: 'he' | 'she' = process.env.PRONOUN === 'she' ? 'she' : 'he';
const VOICE_ID = process.env.VOICE_ID ?? 'lvkgCBi6spByiTZMPJEK';
const VOICE_OWNER = process.env.VOICE_OWNER ?? '695123f7b1a8ef0f0869ac6e3ffd5b2be1af46d4f9be19f5847178865912c795';
const VOICE_NAME = process.env.VOICE_NAME ?? 'Gabriel (ElevenLabs)';

/** Personagem fictício: descrição só em texto (sem pessoa real). */
export const BASE_PROMPT = process.env.BASE_PROMPT ?? [
  'Photorealistic video presenter, a fictional young Brazilian man about 27 years old,',
  'warm medium-brown skin, short dark curly hair neatly trimmed, light stubble,',
  'friendly and confident expression, relaxed natural smile with mouth closed.',
  'Smart-casual outfit: plain navy blue knit polo shirt, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

/**
 * prefixo das câmeras: o nome sem acento (ex.: `cam_julia6_esq`), para não colidir entre instrutores com a
 * mesma inicial; `CAM_PREFIX` sobrescreve (o Rafael do Comece bem usou `r`: `cam_r7_*`).
 * A geração (personagem → 3 câmeras, Idempotency-Key estável) é a mesma da tela "Novo instrutor":
 * `advanceInstructor` (@lms/media); aqui o estado fica no rascunho do curso.
 */
const CAM_PREFIX = process.env.CAM_PREFIX || undefined;
const BASE_ID = instructorBaseId(NAME);
const SPEC = { name: NAME, pronoun: PRONOUN, characterPrompt: BASE_PROMPT, studioLabel: STUDIO, sceneryPrompt: STUDIO_TEXT, ...(CAM_PREFIX ? { camPrefix: CAM_PREFIX } : {}) };
const SCENES = instructorCameraSpecs(SPEC);
const tag = '[instrutor]';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureVoice(): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY ausente');
  const own = await fetch(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}`, { headers: { 'xi-api-key': key } });
  if (own.ok) {
    console.log(`${tag} voz ${VOICE_ID} já está na conta`);
    return VOICE_ID;
  }
  // voz da biblioteca pública: adicionar à conta (grátis; ocupa 1 vaga de voz)
  const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${VOICE_OWNER}/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ new_name: VOICE_NAME }),
  });
  if (!add.ok) throw new Error(`não consegui adicionar a voz (${add.status}): ${(await add.text()).slice(0, 200)}`);
  const r = (await add.json()) as { voice_id?: string };
  console.log(`${tag} voz adicionada à conta: ${r.voice_id ?? VOICE_ID}`);
  return r.voice_id ?? VOICE_ID;
}

async function main() {
  const heygenKey = process.env.HEYGEN_API_KEY;
  if (!heygenKey) throw new Error('HEYGEN_API_KEY ausente');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const gen = new HeyGenLooksAdapter(heygenKey);
  const getDraft = async () => (await authoring.getDraft(db, COURSE_ID))!;
  const save = async (mut: (d: CourseDocument) => void, note: string) => {
    const draft = await getDraft();
    const doc = structuredClone(draft.document) as CourseDocument;
    mut(doc);
    const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note });
    console.log(`${tag} rascunho ${draft.revision} → ${r.revision} (${note})`);
  };
  const upsertCam = (cam: Camera) => save((d) => {
    const p = d.presentation!;
    p.cameras = [...(p.cameras ?? []).filter((c) => c.id !== cam.id), cam];
  }, `câmera "${cam.name}" (${cam.status})`);

  try {
    const draft = await getDraft();
    const course = await authoring.getCourse(db, COURSE_ID);
    if (!course) throw new Error(`curso ${COURSE_ID} não encontrado`);
    const workspaceId = course.workspaceId;
    console.log(`${tag} curso ${COURSE_ID} "${draft.document.title}", instrutor ${NAME}, estúdio ${STUDIO}`);

    // trava contra pagar de novo: as 3 câmeras do estúdio já prontas (no rascunho, p.ex. depois de aplicar o kit,
    // que tira a câmera-base) = instrutor pronto; não cria personagem nem câmera nenhuma
    const readyIds = new Set((draft.document.presentation?.cameras ?? []).filter((c) => (c.status ?? 'ready') === 'ready' && c.lookId).map((c) => c.id));
    if (SCENES.every((sc) => readyIds.has(sc.id))) {
      console.log(`${tag} ${NAME} já tem as 3 câmeras prontas (${SCENES.map((sc) => sc.id).join(', ')}): nada a fazer, sem custo`);
      console.log(`${tag} pronto`);
      return;
    }

    // 1. voz
    const voiceId = await ensureVoice();
    const pres0 = draft.document.presentation!;
    if (pres0.voiceId !== voiceId || pres0.voiceName !== VOICE_NAME) {
      await save((d) => { d.presentation!.voiceId = voiceId; d.presentation!.voiceName = VOICE_NAME; }, `voz ${VOICE_NAME}`);
    }

    // 2+3. personagem base (só texto) e as 3 câmeras no estúdio, um passo por vez; cada passo grava no rascunho
    const ref = { base64: readFileSync(STUDIO_REF).toString('base64'), mediaType: 'image/png' as const };
    console.log(`${tag} prompt do personagem (${BASE_PROMPT.length} chars): ${BASE_PROMPT}`);
    let ready: InstructorState['cameras'] = [];
    for (let i = 0; i < 400; i++) {
      const cams = (await getDraft()).document.presentation?.cameras ?? [];
      const state: InstructorState = { ...(cams.find((c) => c.id === BASE_ID) ? { base: cams.find((c) => c.id === BASE_ID) as InstructorState['base'] } : {}), cameras: SCENES.map((sc) => cams.find((c) => c.id === sc.id)).filter((c): c is Camera => !!c) as InstructorState['cameras'] };
      const r = await advanceInstructor({ spec: SPEC, state, workspaceId, referenceImage: ref }, gen);
      for (const id of r.started) console.log(`${tag} geração pedida: ${id}`);
      for (const n of r.notes) console.log(`${tag} ATENÇÃO: ${n}`);
      if (r.changed) {
        for (const cam of [r.state.base, ...r.state.cameras]) {
          if (!cam) continue;
          const prev = [state.base, ...state.cameras].find((c) => c?.id === cam.id);
          if (JSON.stringify(prev) !== JSON.stringify(cam)) await upsertCam(cam as Camera);
        }
      }
      if (r.step === 'failed') throw new Error(r.error ?? 'geração falhou');
      if (r.done) { ready = r.state.cameras; break; }
      if (!r.started.length) await sleep(5000);
    }
    if (!ready.length) throw new Error('ainda processando após ~35 min; rode de novo para continuar (sem novo custo)');

    // 4. o 3/4 vira o principal; câmeras de outro apresentador saem
    const keep = new Set([BASE_ID, ...SCENES.map((s) => s.id)]);
    const main34 = ready.find((c) => c.zone === 'center') ?? ready[2]!;
    await save((d) => {
      const p = d.presentation!;
      p.cameras = (p.cameras ?? []).filter((c) => keep.has(c.id));
      p.avatarId = main34.lookId;
      p.avatarName = NAME;
      if (main34.previewUrl) p.avatarPreviewUrl = main34.previewUrl;
    }, `${NAME} no estúdio ${STUDIO}`);
    console.log(`${tag} pronto. Câmeras: ${SCENES.map((s) => s.id).join(',')}. Peça ao Claude para reaplicar a direção.`);
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(`${tag} erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

import { DomainError, library, media as mediaRepo, type DbOrTx } from '@lms/db';
import { parseTemplateData, type Camera, type PresenterCreation, type PresenterTemplateData, type TemplateDataByKind } from '@lms/course-schema';
import {
  advanceInstructor,
  buildCharacterPrompt,
  ElevenLabsAdapter,
  instructorCameraSpecs,
  instructorSlug,
  mediaPriceTable,
  NEW_INSTRUCTOR_LOOKS,
  studioLabelOf,
  type CharacterLookGenerator,
  type InstructorState,
  type ReferenceImage,
} from '@lms/media';

/**
 * Tela "Novo instrutor" (/estudio/modelos): personagem fictício só por texto + 3 câmeras num
 * estúdio com zonas + voz da biblioteca → modelo de instrutor + kit. O ESTADO da geração fica no
 * próprio modelo de instrutor (`data.creation` + `cameraKits`), gravado a cada passo: retomar
 * (recarregar a página, outro clique) nunca paga de novo. A máquina de estados é a mesma do script
 * `novo-instrutor.ts` (`advanceInstructor`, @lms/media).
 */

export interface NewInstructorInput {
  name: string;
  role: string;
  pronoun: 'she' | 'he' | 'they';
  description: string;
  studioKey: string;
  voiceKey: string;
  castDetails?: string;
}

type Row = library.LibraryTemplateRow;

function fail(code: 'VALIDATION' | 'CONFLICT' | 'NOT_FOUND', message: string): never {
  throw new DomainError(code, message);
}

/** créditos de API do HeyGen → US$ (estimativa: 1 crédito ≈ 1 min de avatar) */
function usdPerCredit(): number {
  return mediaPriceTable().heygenUsdPerSecond * 60;
}

async function studioOf(db: DbOrTx, workspaceId: string, key: string) {
  const row = await library.getTemplate(db, workspaceId, key);
  if (!row || row.archivedAt || row.kind !== 'studio') fail('NOT_FOUND', `Estúdio "${key}" não está na biblioteca`);
  const data = parseTemplateData('studio', row.data);
  if (data.mode !== 'zones') fail('VALIDATION', `"${row.name}" é um cenário composto; o instrutor novo é gerado só em estúdios com zonas (esquerda, direita e 3/4).`);
  if (!data.imageAssetId) fail('VALIDATION', `"${row.name}" não tem imagem no workspace para servir de referência.`);
  return { row, data };
}

async function voiceOf(db: DbOrTx, workspaceId: string, key: string) {
  const row = await library.getTemplate(db, workspaceId, key);
  if (!row || row.archivedAt || row.kind !== 'voice') fail('NOT_FOUND', `Voz "${key}" não está na biblioteca`);
  return { row, data: parseTemplateData('voice', row.data) };
}

/** Chaves do instrutor e do kit (`instrutor-julia`, `estudio8-julia`). */
export function instructorKeys(name: string, studioKey: string) {
  const slug = instructorSlug(name);
  if (slug.length < 2) fail('VALIDATION', 'O nome precisa ter ao menos 2 letras.');
  const label = studioLabelOf(studioKey);
  const kit = /^\d+$/.test(label) ? `estudio${label}-${slug}` : `${studioKey}-${slug}`;
  return { slug, presenterKey: `instrutor-${slug}`.slice(0, 60), kitKey: kit.slice(0, 60), studioLabel: label };
}

/** Kit de onde vêm marca, direção, regras e alunos de teste: o mais recente do mesmo estúdio, senão qualquer um. */
async function baseKitFor(db: DbOrTx, workspaceId: string, studioKey: string, excludeKey?: string) {
  const kits = (await library.listTemplates(db, workspaceId, { kind: 'kit' })).filter((k) => k.key !== excludeKey);
  const sorted = [...kits].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const same = sorted.find((k) => (k.data as { studioKey?: string }).studioKey === studioKey);
  const row = same ?? sorted[0];
  return row ? { row, data: parseTemplateData('kit', row.data) } : null;
}

export interface InstructorStatus {
  presenterKey: string;
  kitKey: string;
  name: string;
  status: PresenterCreation['status'];
  step: 'character' | 'cameras' | 'done' | 'failed';
  simulated: boolean;
  error?: string;
  notes: string[];
  base?: { status: string; previewUrl?: string };
  cameras: Array<{ id: string; name: string; zone?: string; status: string; previewUrl?: string }>;
}

function statusOf(row: Row): InstructorStatus {
  const d = parseTemplateData('presenter', row.data);
  const c = d.creation;
  if (!c) fail('VALIDATION', `"${row.name}" não foi criado pela tela de instrutor novo.`);
  const specs = instructorCameraSpecs({ name: d.name, studioLabel: studioLabelOf(c.studioKey) });
  const cams = d.cameraKits.find((k) => k.studioKey === c.studioKey)?.cameras ?? [];
  const step: InstructorStatus['step'] = c.status === 'ready' ? 'done' : c.status === 'failed' ? 'failed' : c.base?.status === 'ready' ? 'cameras' : 'character';
  return {
    presenterKey: row.key,
    kitKey: c.kitKey ?? instructorKeys(d.name, c.studioKey).kitKey,
    name: d.name,
    status: c.status,
    step,
    simulated: c.simulated,
    ...(c.error ? { error: c.error } : {}),
    notes: c.notes,
    ...(c.base ? { base: { status: c.base.status, ...(c.base.previewUrl ? { previewUrl: c.base.previewUrl } : {}) } } : {}),
    cameras: specs.map((sp) => {
      const cam = cams.find((x) => x.id === sp.id);
      return { id: sp.id, name: sp.name, zone: sp.zone, status: cam?.status ?? 'waiting', ...(cam?.previewUrl ? { previewUrl: cam.previewUrl } : {}) };
    }),
  };
}

/**
 * Orçamento (sem chamar provedor): o que será gerado, as chaves e o custo estimado.
 * Recusa nome já usado por um instrutor que não veio desta tela.
 */
export async function quoteInstructor(db: DbOrTx, workspaceId: string, input: NewInstructorInput, simulated: boolean) {
  const studio = await studioOf(db, workspaceId, input.studioKey);
  const voice = await voiceOf(db, workspaceId, input.voiceKey);
  const keys = instructorKeys(input.name, input.studioKey);
  const characterPrompt = (() => {
    try {
      return buildCharacterPrompt(input.description);
    } catch (e) {
      return fail('VALIDATION', e instanceof Error ? e.message : 'Descrição inválida');
    }
  })();
  const existing = await library.getTemplate(db, workspaceId, keys.presenterKey);
  let resume: InstructorStatus | null = null;
  if (existing) {
    const d = existing.kind === 'presenter' ? (existing.data as PresenterTemplateData) : null;
    if (!d?.creation) fail('CONFLICT', `Já existe "${existing.name}" na biblioteca (${keys.presenterKey}). Escolha outro nome.`);
    resume = statusOf(existing);
  }
  const kitRow = await library.getTemplate(db, workspaceId, keys.kitKey);
  if (kitRow && !resume) fail('CONFLICT', `A chave do kit "${keys.kitKey}" já está em uso. Escolha outro nome.`);
  const base = await baseKitFor(db, workspaceId, input.studioKey, keys.kitKey);
  const credits = NEW_INSTRUCTOR_LOOKS;
  return {
    simulated,
    presenterKey: keys.presenterKey,
    kitKey: keys.kitKey,
    studio: studio.row.name,
    voice: voice.row.name,
    characterPrompt,
    cameras: instructorCameraSpecs({ name: input.name, studioLabel: keys.studioLabel }).map((c) => ({ id: c.id, name: c.name, zone: c.zone })),
    looks: NEW_INSTRUCTOR_LOOKS,
    estimate: {
      provider: 'heygen',
      credits,
      usd: simulated ? 0 : Math.round(credits * usdPerCredit() * 100) / 100,
      note: simulated
        ? 'Modo de demonstração: nada será cobrado.'
        : `${NEW_INSTRUCTOR_LOOKS} visuais no HeyGen (personagem + 3 câmeras), cobrados em créditos de API (≈ 1 crédito cada; o valor exato não é documentado). A voz da biblioteca entra na conta sem custo.`,
    },
    copiesFrom: base ? { key: base.row.key, name: base.row.name } : null,
    resume,
  };
}

/** Aprovado: grava o instrutor com o estado de geração (se ainda não existe). Não chama provedor. */
export async function startInstructor(db: DbOrTx, workspaceId: string, userId: string, input: NewInstructorInput, simulated: boolean) {
  const q = await quoteInstructor(db, workspaceId, input, simulated);
  if (q.resume) return q.presenterKey;
  const voice = await voiceOf(db, workspaceId, input.voiceKey);
  const creation: PresenterCreation = {
    status: 'generating',
    studioKey: input.studioKey,
    description: input.description.trim().slice(0, 600),
    kitKey: q.kitKey,
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
    simulated,
    notes: [],
  };
  const data: PresenterTemplateData = {
    name: input.name.trim(),
    role: input.role.trim(),
    pronoun: input.pronoun,
    baseLookPrompt: q.characterPrompt,
    voice: { provider: voice.data.provider, voiceId: voice.data.voiceId, ...(voice.data.voiceName ? { voiceName: voice.data.voiceName } : {}) },
    voiceKey: voice.row.key,
    cameraKits: [],
    castDetails: input.castDetails?.trim() || 'Conduz todas as falas dos vídeos, em conversa com o aluno; nunca julga.',
    creation,
  };
  await library.upsertTemplate(db, {
    workspaceId,
    createdBy: userId,
    template: { kind: 'presenter', key: q.presenterKey, name: `${data.name} · ${data.role}`.slice(0, 80), description: input.description.trim().slice(0, 600), data },
  });
  return q.presenterKey;
}

/**
 * Um passo da geração (consulta o que está gerando; pede o que falta). Ao terminar: câmeras
 * prontas no instrutor, voz na conta (grátis) e o kit novo na biblioteca.
 * `wouldSpend` é chamado antes de qualquer passo que peça geração nova (freio de taxa).
 */
export async function advanceInstructorTemplate(
  db: DbOrTx,
  input: { workspaceId: string; userId: string; presenterKey: string; retryFailed?: boolean },
  deps: { generator: CharacterLookGenerator; simulated: boolean; referenceImageFor: (assetId: string) => Promise<ReferenceImage>; wouldSpend: (phase: string) => void; elevenLabsKey?: string | null },
): Promise<InstructorStatus> {
  const row = await library.getTemplate(db, input.workspaceId, input.presenterKey);
  if (!row || row.kind !== 'presenter') fail('NOT_FOUND', 'Instrutor não encontrado na biblioteca');
  const d = parseTemplateData('presenter', row.data);
  const c = d.creation;
  if (!c) fail('VALIDATION', `"${row.name}" não foi criado pela tela de instrutor novo.`);
  if (c.status === 'ready') return statusOf(row);
  if (c.status === 'failed' && !input.retryFailed) return statusOf(row);
  if (c.simulated !== deps.simulated) fail('CONFLICT', c.simulated ? 'Este instrutor foi criado em modo de demonstração; o servidor agora está no modo real. Crie de novo para gerar de verdade.' : 'Este instrutor está sendo gerado no HeyGen real, mas o servidor está em modo de demonstração.');

  const studio = await studioOf(db, input.workspaceId, c.studioKey);
  const label = studioLabelOf(c.studioKey);
  const camsNow = d.cameraKits.find((k) => k.studioKey === c.studioKey)?.cameras ?? [];
  const state: InstructorState = { ...(c.base ? { base: c.base as InstructorState['base'] } : {}), cameras: camsNow as InstructorState['cameras'] };
  const willStart = input.retryFailed || !state.base || (state.base.status === 'ready' && state.cameras.length < 3);
  if (willStart) deps.wouldSpend(state.base?.status === 'ready' ? 'cameras' : 'character');

  const r = await advanceInstructor(
    {
      spec: { name: d.name, pronoun: d.pronoun, characterPrompt: d.baseLookPrompt ?? buildCharacterPrompt(c.description), studioLabel: label, sceneryPrompt: studio.data.sceneryPrompt },
      state,
      workspaceId: input.workspaceId,
      referenceImage: await deps.referenceImageFor(studio.data.imageAssetId!),
      ...(input.retryFailed ? { retryFailed: true } : {}),
    },
    deps.generator,
  );

  const notes = [...new Set([...c.notes, ...r.notes])].slice(-10);
  const next: PresenterTemplateData = {
    ...d,
    cameraKits: [...d.cameraKits.filter((k) => k.studioKey !== c.studioKey), ...(r.state.cameras.length ? [{ studioKey: c.studioKey, cameras: r.state.cameras as Camera[] }] : [])],
    creation: {
      ...c,
      ...(r.state.base ? { base: r.state.base as Camera } : {}),
      status: r.step === 'failed' ? 'failed' : r.done ? 'ready' : 'generating',
      notes,
    },
  };
  if (r.error) next.creation!.error = r.error.slice(0, 500);
  else delete next.creation!.error;
  if (!r.state.base) delete next.creation!.base;

  if (r.done) {
    const cams = r.state.cameras;
    const main = cams.find((x) => x.zone === 'center') ?? cams[0]!;
    next.baseLookId = r.state.base!.lookId;
    if (main.previewUrl) next.previewUrl = main.previewUrl;
    // voz da biblioteca pública na conta (grátis); falha aqui não perde nada pago
    const voice = d.voiceKey ? await voiceOf(db, input.workspaceId, d.voiceKey).catch(() => null) : null;
    if (!deps.simulated && voice?.data.provider === 'elevenlabs' && voice.data.libraryOwnerId && deps.elevenLabsKey) {
      try {
        const v = await new ElevenLabsAdapter(deps.elevenLabsKey).ensureLibraryVoice({ voiceId: voice.data.voiceId, ownerId: voice.data.libraryOwnerId, name: voice.data.voiceName || voice.row.name });
        if (v.added) next.creation!.notes = [...next.creation!.notes, `voz ${voice.row.name} adicionada à conta do ElevenLabs`].slice(-10);
      } catch (e) {
        next.creation!.notes = [...next.creation!.notes, `voz: ${e instanceof Error ? e.message : 'não adicionada'}; adicione pela conta do ElevenLabs`].slice(-10);
      }
    }
    const kitKey = c.kitKey ?? instructorKeys(d.name, c.studioKey).kitKey;
    const base = await baseKitFor(db, input.workspaceId, c.studioKey, kitKey);
    const kitData: TemplateDataByKind['kit'] = {
      studioKey: c.studioKey,
      presenterKey: row.key,
      ...(d.voiceKey ? { voiceKey: d.voiceKey } : {}),
      ...(base?.data.brandingKey ? { brandingKey: base.data.brandingKey } : {}),
      ...(base?.data.directionKey ? { directionKey: base.data.directionKey } : {}),
      knowledgeKeys: base?.data.knowledgeKeys ?? [],
      learnerKeys: base?.data.learnerKeys ?? [],
    } as TemplateDataByKind['kit'];
    // o instrutor pronto primeiro (o kit valida as peças pela chave ao ser aplicado)
    await library.upsertTemplate(db, { workspaceId: input.workspaceId, createdBy: input.userId, template: { kind: 'presenter', key: row.key, name: row.name, description: row.description, data: next } });
    await library.upsertTemplate(db, {
      workspaceId: input.workspaceId,
      createdBy: input.userId,
      template: { kind: 'kit', key: kitKey, name: `Estúdio ${label} · ${d.name}`.slice(0, 80), description: `${d.name} no ${studio.row.name}${voice ? `, voz ${voice.row.name}` : ''}${base ? `; marca, direção e regras de "${base.row.name}"` : ''}.`.slice(0, 600), data: kitData },
    });
  } else if (r.changed || c.status !== next.creation!.status) {
    await library.upsertTemplate(db, { workspaceId: input.workspaceId, createdBy: input.userId, template: { kind: 'presenter', key: row.key, name: row.name, description: row.description, data: next } });
  }
  const after = await library.getTemplate(db, input.workspaceId, row.key);
  return statusOf(after!);
}

/** imagem do estúdio no workspace (para o pedido de câmera) */
export async function studioAsset(db: DbOrTx, workspaceId: string, assetId: string) {
  const a = await mediaRepo.getAsset(db, assetId);
  if (!a || a.workspaceId !== workspaceId) fail('NOT_FOUND', 'Imagem do estúdio não encontrada neste workspace');
  return a;
}

export { statusOf as instructorStatus };

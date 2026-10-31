/**
 * Monta a BIBLIOTECA DE MODELOS do workspace a partir do que já foi aprovado,
 * sem gerar nada pago e sem mudar curso nenhum:
 *  1. estúdios jovens 6/7/8: envia as imagens (docs/brand/cenario/estudio-jovem-N.png)
 *     como imagens do workspace (storage local, idempotente por sha256) e grava o
 *     estúdio com a descrição usada nos pedidos de câmera e as zonas;
 *     recepção DNA Work: usa a imagem de cenário que já existe no workspace;
 *  2. instrutores: EXTRAI do rascunho de cada curso (só leitura) a Marina (Pode
 *     entrar) e o Rafael (Comece bem): nome, papel, pronome, look base, voz e o
 *     kit de câmeras por estúdio (lookIds prontos);
 *  3. vozes (amostra = um trecho de narração já produzida no workspace, quando houver),
 *     marca d'água + vinheta sem slogan (a vinheta padrão do workspace), direção
 *     visual, base de conhecimento do motor, alunos de teste e os kits
 *     (`estudio7-marina`, `estudio7-rafael`, `recepcao-marina`).
 * Rodar de novo só atualiza o que mudou.
 *
 * Uso (raiz do monorepo, com DATABASE_URL no ambiente; aplique a migração 0012 antes):
 *   set -a; . ./.env; set +a
 *   pnpm db:migrate
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/biblioteca-modelos.ts [--dry-run] [--skip-upload] [--workspace wsp_…]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_BRANDING,
  DEFAULT_STUDIOS,
  DEFAULT_VOICES,
  defaultLibraryTemplates,
  PresenterTemplateDataSchema,
  RECEPTION_STUDIO,
  type Camera,
  type CourseDocument,
  type LibraryTemplateInput,
  type PresenterTemplateData,
  type PresenterPronoun,
} from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import { getDraft } from '../repositories/authoring';
import { createAsset } from '../repositories/media';
import { resolveKit, upsertTemplate } from '../repositories/library';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tag = '[biblioteca]';

/** Descrição só em texto do personagem fictício do Rafael (a mesma de apps/worker/src/scripts/novo-instrutor.ts). */
export const RAFAEL_BASE_PROMPT = [
  'Photorealistic video presenter, a fictional young Brazilian man about 27 years old,',
  'warm medium-brown skin, short dark curly hair neatly trimmed, light stubble,',
  'friendly and confident expression, relaxed natural smile with mouth closed.',
  'Smart-casual outfit: plain navy blue knit polo shirt, no logos, no accessories.',
  'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible.',
  'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
  'No text, no logos, no other people.',
].join(' ');

/** De onde vem cada instrutor e quais câmeras do rascunho formam o kit de cada estúdio. */
export const PRESENTER_SOURCES = [
  {
    key: 'instrutor-marina',
    courseId: 'crs_7vbrb49jkq23ibiw',
    name: 'Marina',
    role: 'Sua orientadora',
    pronoun: 'she' as PresenterPronoun,
    voiceKey: 'voz-ana-dias',
    baseCameraId: 'cam_principal',
    kits: { 'estudio-jovem-7': ['cam_j7_esq', 'cam_j7_dir', 'cam_j7_34'], 'recepcao-dnawork': ['cam_principal', 'cam_cenario_34'] } as Record<string, string[]>,
    description: 'Instrutora dos cursos Pode entrar: acolhedora, direta. Câmeras no estúdio 7 (esquerda, direita, 3/4) e na recepção.',
  },
  {
    key: 'instrutor-rafael',
    courseId: 'crs_gujuaiykqcsl2n31',
    name: 'Rafael',
    role: 'Seu orientador',
    pronoun: 'he' as PresenterPronoun,
    voiceKey: 'voz-gabriel',
    baseLookPrompt: RAFAEL_BASE_PROMPT,
    kits: { 'estudio-jovem-7': ['cam_r7_esq', 'cam_r7_dir', 'cam_r7_34'] } as Record<string, string[]>,
    description: 'Instrutor fictício criado por texto para o curso Comece bem. Câmeras no estúdio 7 (esquerda, direita, 3/4).',
  },
] as const;

/**
 * Instrutor extraído do rascunho (pura): as câmeras pedidas de cada estúdio
 * (precisam existir; dados de geração ficam, a prévia assinada não — expira),
 * a voz da apresentação e o look base.
 */
export function presenterFromDocument(
  doc: CourseDocument,
  src: { name: string; role: string; pronoun: PresenterPronoun; voiceKey?: string; baseCameraId?: string; baseLookPrompt?: string; kits: Record<string, readonly string[]> },
): PresenterTemplateData {
  const pres = doc.presentation;
  const byId = new Map(pres.cameras.map((c) => [c.id, c]));
  const cameraKits = Object.entries(src.kits).map(([studioKey, ids]) => {
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`${src.name}: câmera(s) ${missing.join(', ')} não existem no rascunho "${doc.title}"`);
    const cameras = ids.map((id) => {
      const c = structuredClone(byId.get(id)!) as Camera;
      delete c.previewUrl; // link assinado do provedor: expira
      return c;
    });
    return { studioKey, cameras };
  });
  const all = cameraKits.flatMap((k) => k.cameras);
  const baseLookId = (src.baseCameraId ? byId.get(src.baseCameraId)?.lookId : undefined) ?? all.find((c) => c.sourceLookId)?.sourceLookId;
  if (!pres.voiceId || !pres.voiceProvider) throw new Error(`${src.name}: o rascunho "${doc.title}" não tem voz definida`);
  return PresenterTemplateDataSchema.parse({
    name: src.name,
    role: src.role,
    pronoun: src.pronoun,
    ...(baseLookId ? { baseLookId } : {}),
    ...(src.baseLookPrompt ? { baseLookPrompt: src.baseLookPrompt } : {}),
    ...(pres.avatarType ? { avatarType: pres.avatarType } : {}),
    voice: { provider: pres.voiceProvider, voiceId: pres.voiceId, ...(pres.voiceName ? { voiceName: pres.voiceName } : {}) },
    ...(src.voiceKey ? { voiceKey: src.voiceKey } : {}),
    cameraKits,
    castDetails: 'Conduz todas as falas dos vídeos, em conversa com o aluno; nunca julga.',
  });
}

function parseArgs(argv: readonly string[]) {
  const val = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--')) return argv[i + 1];
    return argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  };
  return { dryRun: argv.includes('--dry-run'), skipUpload: argv.includes('--skip-upload'), workspace: val('workspace') };
}

async function uploadImage(db: Database, workspaceId: string, file: string, name: string, createdBy: string, dryRun: boolean): Promise<string | undefined> {
  const bytes = new Uint8Array(await readFile(path.join(ROOT, file)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const [existing] = await db.select({ id: s.assets.id }).from(s.assets).where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.sha256, sha256))).limit(1);
  if (existing) return existing.id;
  if (dryRun) {
    console.log(`${tag} ${name}: imagem seria enviada (${bytes.byteLength} bytes)`);
    return undefined;
  }
  const provider = (process.env.STORAGE_PROVIDER ?? (process.env.S3_BUCKET ? 's3' : 'local')).trim().toLowerCase();
  if (provider !== 'local') {
    console.log(`${tag} ${name}: storage ${provider}; envie a imagem pelo estúdio (sem imagem no modelo por enquanto)`);
    return undefined;
  }
  const key = `${workspaceId}/image/${sha256.slice(0, 2)}/${sha256}.png`;
  const full = path.resolve(process.env.STORAGE_DIR ?? '.data/storage', key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  const asset = await createAsset(db, { workspaceId, kind: 'image', source: 'upload', mimeType: 'image/png', sizeBytes: bytes.byteLength, storageProvider: 'local', storageKey: key, originalName: name, sha256, createdBy });
  console.log(`${tag} ${name}: imagem enviada → ${asset.id}`);
  return asset.id;
}

/** Trecho de narração já produzida (job real concluído) com a voz do curso: a amostra da voz. */
async function narrationSample(db: Database, courseId: string) {
  const [row] = await db
    .select({ input: s.mediaJobs.input })
    .from(s.mediaJobs)
    .where(and(eq(s.mediaJobs.courseId, courseId), eq(s.mediaJobs.status, 'succeeded'), eq(s.mediaJobs.simulated, 0), sql`${s.mediaJobs.input} ? 'voiceAssetId'`))
    .orderBy(desc(s.mediaJobs.finishedAt))
    .limit(1);
  const input = row?.input as { voiceAssetId?: string; narration?: string } | undefined;
  if (!input?.voiceAssetId) return undefined;
  return { assetId: input.voiceAssetId, text: (input.narration ?? '').slice(0, 600) };
}

/** Vinheta padrão do workspace SEM frase (assinatura): 16:9 + 9:16. */
async function signatureBumper(db: Database, workspaceId: string) {
  const vids = await db.select({ id: s.assets.id, metadata: s.assets.metadata }).from(s.assets).where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.kind, 'video'))).orderBy(desc(s.assets.createdAt));
  const b = vids.find((v) => v.metadata?.bumper?.default && v.metadata.bumper.aspect === '16:9' && !String((v.metadata.bumper.spec as { tagline?: string }).tagline ?? '').trim());
  if (!b) return undefined;
  return { assetId: b.id, ...(b.metadata!.bumper!.verticalAssetId ? { assetIdVertical: b.metadata!.bumper!.verticalAssetId } : {}) };
}

export async function run(db: Database, args: ReturnType<typeof parseArgs>) {
  const workspaces = await db.select({ id: s.workspaces.id }).from(s.workspaces);
  const workspaceId = args.workspace ?? (workspaces.length === 1 ? workspaces[0]!.id : undefined);
  if (!workspaceId) throw new Error('mais de um workspace: informe --workspace wsp_…');
  const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
  const [anyMember] = await db.select({ userId: s.workspaceMemberships.userId }).from(s.workspaceMemberships).where(eq(s.workspaceMemberships.workspaceId, workspaceId)).limit(1);
  const createdBy = author?.id ?? anyMember?.userId;
  if (!createdBy) throw new Error('nenhum usuário no workspace para assinar os modelos');

  const templates: Array<{ t: LibraryTemplateInput; previewAssetId?: string }> = [];
  const defaults = defaultLibraryTemplates();
  const byKey = new Map(defaults.map((t) => [t.key, t]));

  // 1. estúdios
  for (const st of DEFAULT_STUDIOS) {
    const assetId = args.skipUpload ? undefined : await uploadImage(db, workspaceId, st.data.imagePath!, `Estúdio · ${st.name}`, createdBy, args.dryRun);
    templates.push({ t: { ...st, data: { ...st.data, ...(assetId ? { imageAssetId: assetId } : {}) } }, ...(assetId ? { previewAssetId: assetId } : {}) });
    byKey.delete(st.key);
  }
  const [reception] = await db.select({ id: s.assets.id }).from(s.assets).where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.originalName, 'Cenário · Recepção DNA Work'))).limit(1);
  if (reception) {
    templates.push({
      t: { ...RECEPTION_STUDIO, data: { ...RECEPTION_STUDIO.data, imageAssetId: reception.id, background: { assetId: reception.id, name: 'Cenário · Recepção DNA Work', foregroundFrom: 0.85, blur: false } } },
      previewAssetId: reception.id,
    });
  } else console.log(`${tag} recepção: imagem "Cenário · Recepção DNA Work" não encontrada no workspace; o estúdio entra sem fundo (rode pode-entrar-cenario-recepcao.ts)`);
  byKey.delete(RECEPTION_STUDIO.key);

  // 2. instrutores (extraídos) + 3. vozes com amostra
  for (const src of PRESENTER_SOURCES) {
    const draft = await getDraft(db, src.courseId);
    if (!draft) {
      console.log(`${tag} ${src.name}: rascunho ${src.courseId} não encontrado; instrutor fica de fora`);
      continue;
    }
    const data = presenterFromDocument(draft.document, src);
    templates.push({ t: { kind: 'presenter', key: src.key, name: `${src.name} · ${src.role}`, description: src.description, data } });
    const voice = DEFAULT_VOICES.find((v) => v.key === src.voiceKey);
    if (voice) {
      const sample = await narrationSample(db, src.courseId);
      templates.push({ t: { ...voice, data: { ...voice.data, ...(sample ? { sampleAssetId: sample.assetId, sampleText: sample.text } : {}) } }, ...(sample ? { previewAssetId: sample.assetId } : {}) });
      byKey.delete(voice.key);
    }
  }

  // 4. marca (a vinheta padrão do workspace, sem frase)
  const bumper = await signatureBumper(db, workspaceId);
  templates.push({ t: { ...DEFAULT_BRANDING, data: { ...DEFAULT_BRANDING.data, bumper: { ...DEFAULT_BRANDING.data.bumper!, ...(bumper ?? {}) } } } });
  byKey.delete(DEFAULT_BRANDING.key);

  // 5. o resto como está (direção, base de conhecimento, alunos de teste, vozes sem curso, kits por último)
  const rest = [...byKey.values()];
  templates.push(...rest.filter((t) => t.kind !== 'kit').map((t) => ({ t })), ...rest.filter((t) => t.kind === 'kit').map((t) => ({ t })));

  let created = 0;
  let changed = 0;
  for (const { t, previewAssetId } of templates) {
    if (args.dryRun) {
      console.log(`${tag} ${t.kind.padEnd(9)} ${t.key} — ${t.name}`);
      continue;
    }
    const r = await upsertTemplate(db, { workspaceId, template: t, createdBy, ...(previewAssetId ? { previewAssetId } : {}) });
    if (r.created) created++;
    else if (r.changed) changed++;
    console.log(`${tag} ${t.kind.padEnd(9)} ${t.key} — ${r.created ? 'criado' : r.changed ? 'atualizado' : 'sem mudança'}`);
  }
  if (args.dryRun) {
    console.log(`${tag} --dry-run: ${templates.length} modelos; nada gravado`);
    return;
  }
  console.log(`${tag} ${templates.length} modelos: ${created} criados, ${changed} atualizados`);
  // confere os kits (só leitura: monta e mostra, não aplica em curso nenhum)
  for (const k of templates.filter((x) => x.t.kind === 'kit')) {
    try {
      const resolved = await resolveKit(db, workspaceId, k.t.key);
      const { kitSummary, presentationFromKit } = await import('@lms/course-schema');
      presentationFromKit(resolved);
      console.log(`${tag} kit ${k.t.key} pronto:\n  ${kitSummary(resolved).join('\n  ')}`);
    } catch (e) {
      console.log(`${tag} kit ${k.t.key} ainda não aplicável: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    await run(db, parseArgs(process.argv.slice(2)));
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

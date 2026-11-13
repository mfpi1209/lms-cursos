/**
 * Refaz as câmeras de um instrutor da biblioteca com os pulsos DENTRO do quadro (sem relógio, pulseira ou objetos).
 * Três modos, o mesmo script:
 *
 *  --seco (padrão)   lê a biblioteca (só leitura) e mostra o que seria pedido: prompts, ids, custo. Não chama provedor.
 *  --confirmar       PAGO (US$ 1 por imagem, HeyGen): gera as câmeras novas a partir do MESMO personagem base e da imagem
 *                    de referência do estúdio, espera terminar, guarda a prévia como asset e grava o JSON em --out.
 *                    Exige ALLOW_PAID_PROVIDERS=1, HEYGEN_API_KEY e --max-usd. Não altera kit, biblioteca nem curso.
 *                    Rodar de novo continua do JSON (generationId gravado) e usa Idempotency-Key estável: não paga de novo.
 *  --aplicar         SEM custo: no RASCUNHO do curso (--course), adiciona as câmeras novas prontas, troca na direção cada
 *                    câmera antiga pela nova (mesma zona) e põe a 3/4 nova como avatar principal. Com --kit <chave do kit>
 *                    também troca as câmeras do instrutor na biblioteca (só afeta FUTURAS importações do kit).
 *
 * Uso (raiz do monorepo): veja `docs/novos-cursos/instrutores-gerados.md` (seção "Refazer câmeras").
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { authoring, createDb, library, media as mediaRepo, schema } from '@lms/db';
import { parseTemplateData, type CourseDocument } from '@lms/course-schema';
import { HeyGenLooksAdapter, studioLabelOf, type ReferenceImage } from '@lms/media';
import { getStorage } from '@lms/media';
import { storeGeneratedAsset } from '../media';
import {
  applyResultToDocument,
  buildRegenPrompt,
  cameraFromResult,
  checkSpend,
  parseArgs,
  planCameras,
  regenIdempotencyKey,
  replaceKitCameras,
  type RegenArgs,
  type RegenCameraResult,
  type RegenResultFile,
} from '../regerar-cameras';

const tag = '[regerar-cameras]';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

type Db = ReturnType<typeof createDb>['db'];

/** Instrutor, kit e estúdio lidos da biblioteca (só leitura). */
async function loadContext(db: Db, args: RegenArgs) {
  const rows = await db.select().from(schema.libraryTemplates).where(and(eq(schema.libraryTemplates.key, args.presenter), eq(schema.libraryTemplates.kind, 'presenter'), isNull(schema.libraryTemplates.archivedAt)));
  const matches = args.workspace ? rows.filter((r) => r.workspaceId === args.workspace) : rows;
  if (matches.length !== 1) throw new Error(`instrutor "${args.presenter}": ${matches.length} encontrados (use --workspace se houver mais de um workspace)`);
  const row = matches[0]!;
  const workspaceId = row.workspaceId;
  const p = parseTemplateData('presenter', row.data);
  // instrutor antigo sem look-base registrado: usa o `sourceLookId` comum às câmeras do kit (o mesmo personagem)
  const kitSources = [...new Set(p.cameraKits.flatMap((k) => k.cameras.map((c) => c.sourceLookId)).filter((x): x is string => !!x))];
  const baseLookId = p.baseLookId ?? p.creation?.base?.lookId ?? (kitSources.length === 1 ? kitSources[0] : undefined);
  if (!baseLookId) throw new Error(`"${args.presenter}" não tem look-base (baseLookId) na biblioteca; sem ele não dá para manter o mesmo personagem`);
  const studioKey = p.creation?.studioKey ?? p.cameraKits[0]?.studioKey;
  if (!studioKey) throw new Error(`"${args.presenter}" não tem estúdio (cameraKits vazio)`);
  const studioRow = await library.getTemplate(db, workspaceId, studioKey);
  if (!studioRow || studioRow.kind !== 'studio') throw new Error(`estúdio "${studioKey}" não está na biblioteca`);
  const studio = parseTemplateData('studio', studioRow.data);
  if (studio.mode !== 'zones') throw new Error(`"${studioKey}" não é um estúdio com zonas`);
  const kitCameras = p.cameraKits.find((k) => k.studioKey === studioKey)?.cameras ?? [];
  return { row, workspaceId, presenter: p, baseLookId, studioKey, studioLabel: studioLabelOf(studioKey), studio, kitCameras };
}

/** Imagem de referência do estúdio: o asset do workspace; senão o arquivo do repositório. */
async function loadReference(db: Db, studio: { imageAssetId?: string | undefined; imagePath?: string | undefined }, workspaceId: string): Promise<ReferenceImage> {
  if (studio.imageAssetId) {
    const a = await mediaRepo.getAsset(db, studio.imageAssetId);
    if (!a || a.workspaceId !== workspaceId) throw new Error('imagem do estúdio não encontrada neste workspace');
    if (!/^image\/(png|jpeg)$/i.test(a.mimeType)) throw new Error('o estúdio precisa ser PNG ou JPEG para servir de referência');
    const storage = await getStorage();
    const chunks: Buffer[] = [];
    for await (const c of storage.getStream(a.storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return { base64: Buffer.concat(chunks).toString('base64'), mediaType: a.mimeType.toLowerCase() };
  }
  if (studio.imagePath) {
    const bytes = await readFile(path.resolve(repoRoot, studio.imagePath));
    return { base64: bytes.toString('base64'), mediaType: /\.jpe?g$/i.test(studio.imagePath) ? 'image/jpeg' : 'image/png' };
  }
  throw new Error('o estúdio não tem imagem de referência (imageAssetId/imagePath)');
}

function resultPath(args: RegenArgs) {
  return path.resolve(args.out, `cameras-${args.presenter}-${args.sufixo}.json`);
}

async function readResult(file: string): Promise<RegenResultFile | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as RegenResultFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

function sniffImage(bytes: Uint8Array): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return { mime: 'image/webp', ext: 'webp' };
  throw new Error('a prévia baixada não é PNG, JPEG nem WebP');
}

async function gerar(db: Db, args: RegenArgs) {
  const ctx = await loadContext(db, args);
  const { presenter: p } = ctx;
  const plan = planCameras({ name: p.name, studioLabel: ctx.studioLabel, sufixo: args.sufixo, cameras: args.cameras });
  const file = resultPath(args);
  const prev = await readResult(file);
  if (prev && (prev.baseLookId !== ctx.baseLookId || prev.workspaceId !== ctx.workspaceId)) throw new Error(`${file} é de outro look-base/workspace; use outro --sufixo`);
  const ref = await loadReference(db, ctx.studio, ctx.workspaceId);
  const prompts = plan.map((c) => ({ c, ...buildRegenPrompt({ angle: c.angle, position: c.position, scenery: ctx.studio.sceneryPrompt, pronoun: p.pronoun }) }));

  // o que já foi pedido (JSON anterior) não se paga de novo; prompt diferente do gravado = refação, que exige outro sufixo
  const existing = new Map((prev?.cameras ?? []).map((c) => [c.id, c]));
  for (const x of prompts) {
    const e = existing.get(x.c.id);
    if (e?.generationId && e.prompt !== x.prompt) throw new Error(`${x.c.id}: já existe geração com outro pedido em ${file}; para refazer use outro --sufixo (nada foi pedido)`);
  }
  const toCreate = prompts.filter((x) => !existing.get(x.c.id)?.generationId);
  const { usd } = checkSpend({ images: toCreate.length, maxUsd: args.maxUsd, confirmar: args.confirmar, env: process.env });

  console.log(`${tag} instrutor ${args.presenter} (${p.name}), workspace ${ctx.workspaceId}, estúdio ${ctx.studioKey}`);
  console.log(`${tag} look-base ${ctx.baseLookId}; estúdio: ${ctx.studio.sceneryPrompt}`);
  console.log(`${tag} câmeras atuais no kit: ${ctx.kitCameras.map((c) => c.id).join(', ') || '—'}`);
  for (const x of prompts) {
    const key = regenIdempotencyKey({ workspaceId: ctx.workspaceId, presenterKey: args.presenter, cameraId: x.c.id, baseLookId: ctx.baseLookId, prompt: x.prompt, referenceImage: ref });
    const have = ctx.kitCameras.some((c) => c.id === x.c.oldId);
    console.log(`\n${tag} ${x.c.oldId}${have ? '' : ' (NÃO está no kit)'} → ${x.c.id} · zona ${x.c.zone} · ${x.c.angle}/${x.c.position}${existing.get(x.c.id)?.generationId ? ' · JÁ PEDIDA (sem custo)' : ''}`);
    console.log(`${tag} idempotency-key ${key}`);
    console.log(`${tag} prompt (${x.prompt.length}/1000${x.sceneryShortened ? ', estúdio encurtado' : ''}):\n${x.prompt}`);
  }
  console.log(`\n${tag} imagens novas: ${toCreate.length} × US$ 1 = US$ ${usd} (teto ${args.maxUsd})`);
  if (!args.confirmar) {
    console.log(`${tag} ENSAIO (--seco): nada foi pedido, nada foi gravado.`);
    return;
  }

  const gen = new HeyGenLooksAdapter(process.env.HEYGEN_API_KEY!);
  await mkdir(args.out, { recursive: true });
  const result: RegenResultFile = prev ?? { version: 1, presenter: args.presenter, workspaceId: ctx.workspaceId, sufixo: args.sufixo, baseLookId: ctx.baseLookId, studioKey: ctx.studioKey, createdAt: new Date().toISOString(), cameras: [] };
  const save = () => writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  const entry = (id: string) => result.cameras.find((c) => c.id === id);

  // 1. pedir (gravando o generationId ANTES de qualquer outro passo: nunca perde um resultado pago)
  for (const x of prompts) {
    if (entry(x.c.id)?.generationId) continue;
    const idempotencyKey = regenIdempotencyKey({ workspaceId: ctx.workspaceId, presenterKey: args.presenter, cameraId: x.c.id, baseLookId: ctx.baseLookId, prompt: x.prompt, referenceImage: ref });
    const { generationId } = await gen.generateLookFromPrompt({ sourceLookId: ctx.baseLookId, prompt: x.prompt, aspectRatio: '16:9', idempotencyKey, name: x.c.name, referenceImages: [ref] });
    const r: RegenCameraResult = { key: x.c.key, id: x.c.id, oldId: x.c.oldId, name: x.c.name, zone: x.c.zone, angle: x.c.angle, prompt: x.prompt, generationId, status: 'generating' };
    result.cameras = [...result.cameras.filter((c) => c.id !== r.id), r];
    await save();
    console.log(`${tag} geração pedida: ${x.c.id} → ${generationId}`);
  }

  // 2. esperar (completed/failed), baixar a prévia e guardar como asset
  const ids = new Set(plan.map((c) => c.id));
  for (let i = 0; i < 360; i++) {
    let pending = 0;
    for (const r of result.cameras.filter((c) => ids.has(c.id) && c.status === 'generating')) {
      const g = await gen.getLookGeneration(r.generationId!);
      if (g.status === 'completed') {
        r.status = 'completed';
        r.lookId = g.lookId ?? r.generationId!;
        if (g.previewUrl) {
          r.previewUrl = g.previewUrl;
          const res = await fetch(g.previewUrl, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok) throw new Error(`${r.id}: download da prévia falhou (${res.status}); rode de novo (sem novo custo)`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const img = sniffImage(bytes);
          const asset = await storeGeneratedAsset({ workspaceId: ctx.workspaceId, kind: 'image', mime: img.mime, bytes, createdBy: ctx.row.createdBy });
          r.previewAssetId = asset.id;
          const storage = await getStorage();
          r.previewPath = storage.provider === 'local' ? path.resolve(process.env.STORAGE_DIR ?? '.data/storage', asset.storageKey) : asset.storageKey;
          await writeFile(path.resolve(args.out, `${r.id}.${img.ext}`), bytes);
        }
        console.log(`${tag} pronta: ${r.id} look ${r.lookId}${g.supportedEngines?.length && !g.supportedEngines.includes('avatar_iv') ? ` ATENÇÃO: sem avatar_iv (${g.supportedEngines.join(',')})` : ''}`);
      } else if (g.status === 'failed') {
        r.status = 'failed';
        r.error = (g.error ?? 'falha na geração').slice(0, 500);
        console.log(`${tag} FALHOU: ${r.id}: ${r.error}`);
      } else pending++;
      await save();
    }
    if (!pending) break;
    await sleep(5000);
  }
  const left = result.cameras.filter((c) => ids.has(c.id) && c.status === 'generating');
  if (left.length) console.log(`${tag} ainda processando: ${left.map((c) => c.id).join(', ')}; rode de novo para continuar (sem novo custo)`);
  console.log(`${tag} resultado: ${file}`);
}

async function aplicar(db: Db, args: RegenArgs) {
  const result = JSON.parse(await readFile(path.resolve(args.deArquivo!), 'utf8')) as RegenResultFile;
  if (result.version !== 1 || !Array.isArray(result.cameras)) throw new Error('arquivo de resultado inválido');
  const course = await authoring.getCourse(db, args.course!);
  if (!course) throw new Error(`curso ${args.course} não encontrado`);
  if (course.workspaceId !== result.workspaceId) throw new Error('o curso é de outro workspace que o das câmeras');
  const draft = (await authoring.getDraft(db, args.course!))!;
  const { document, changes, skipped } = applyResultToDocument(structuredClone(draft.document) as CourseDocument, result);
  if (skipped.length) console.log(`${tag} ignoradas (não prontas): ${skipped.join(', ')}`);
  if (!changes.length) throw new Error('nenhuma câmera pronta no arquivo; nada a aplicar');
  const r = await authoring.saveDraft(db, { courseId: args.course!, document, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `câmeras novas (${result.sufixo}) com pulsos no quadro` });
  console.log(`${tag} rascunho ${draft.revision} → ${r.revision}: ${changes.join('; ')}`);

  if (args.kit) {
    const kit = await library.getTemplate(db, result.workspaceId, args.kit);
    if (!kit || kit.kind !== 'kit') throw new Error(`kit "${args.kit}" não encontrado`);
    const k = parseTemplateData('kit', kit.data);
    const pRow = await library.getTemplate(db, result.workspaceId, k.presenterKey);
    if (!pRow || pRow.kind !== 'presenter') throw new Error(`instrutor "${k.presenterKey}" do kit não encontrado`);
    const pd = parseTemplateData('presenter', pRow.data);
    const novas = result.cameras.filter((c) => c.status === 'completed' && c.lookId).map((c) => cameraFromResult(c, result.baseLookId));
    const main = novas.find((c) => c.zone === 'center');
    const next = {
      ...pd,
      cameraKits: pd.cameraKits.map((ck) => (ck.studioKey === k.studioKey ? { ...ck, cameras: replaceKitCameras(ck.cameras, novas) } : ck)),
      ...(main?.previewUrl ? { previewUrl: main.previewUrl } : {}),
    };
    await library.upsertTemplate(db, { workspaceId: result.workspaceId, createdBy: pRow.createdBy, template: { kind: 'presenter', key: pRow.key, name: pRow.name, description: pRow.description, data: next } });
    console.log(`${tag} biblioteca: "${pRow.key}" agora usa ${novas.map((c) => c.id).join(', ')} no estúdio ${k.studioKey} (só afeta FUTURAS importações; cursos já montados não mudam)`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    if (args.aplicar) await aplicar(db, args);
    else await gerar(db, args);
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then(() => process.exit(0), (e) => {
    console.error(`${tag} erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}

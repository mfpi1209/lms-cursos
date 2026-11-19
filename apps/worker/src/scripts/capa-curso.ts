/**
 * Capa própria de um curso: mesmo instrutor, OUTRA roupa e OUTRA pose, no estúdio dele (fundo do kit), em quadro 16:9.
 * O vídeo do curso não muda; só a imagem do cartão (`courses.poster_asset_id`).
 *
 *  --seco (padrão)   lê a biblioteca (só leitura) e mostra o pedido: prompt, look-base, chave, custo. Não chama provedor.
 *  --confirmar       PAGO (US$ 1 por imagem, HeyGen): gera a capa a partir do MESMO personagem base e da imagem de
 *                    referência do estúdio, espera terminar, guarda a imagem como asset e grava o JSON em --out.
 *                    Exige ALLOW_PAID_PROVIDERS=1, HEYGEN_API_KEY e --max-usd. Rodar de novo continua do JSON
 *                    (generationId gravado) e usa Idempotency-Key estável: não paga de novo.
 *  --aplicar         SEM custo: grava `courses.poster_asset_id` do curso com a imagem do JSON (--de-arquivo). Só isso.
 *
 * Uso (raiz do monorepo): veja `docs/roteiros/telas/capas-leva1.md`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { authoring, createDb, schema } from '@lms/db';
import { parseTemplateData } from '@lms/course-schema';
import { getStorage, HeyGenLooksAdapter } from '@lms/media';
import { storeGeneratedAsset } from '../media';
import { buildCoverPrompt, checkCoverSpend, coverIdempotencyKey, parseArgs, posterFromResult, type CoverArgs, type CoverResultFile } from '../capa-curso';
import { loadContext, loadReference, sniffImage } from './regerar-cameras-instrutor';

const tag = '[capa-curso]';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Db = ReturnType<typeof createDb>['db'];

/** Chave do instrutor: --presenter, ou o único instrutor da biblioteca (do workspace do curso) com o nome da apresentação. */
async function presenterKeyFor(db: Db, args: CoverArgs, course: { workspaceId: string }, avatarName: string | undefined): Promise<string> {
  if (args.presenter) return args.presenter;
  if (!avatarName) throw new Error('o curso não tem instrutor (presentation.avatarName); informe --presenter <chave>');
  const rows = await db.select().from(schema.libraryTemplates).where(and(eq(schema.libraryTemplates.workspaceId, course.workspaceId), eq(schema.libraryTemplates.kind, 'presenter'), isNull(schema.libraryTemplates.archivedAt)));
  const same = rows.filter((r) => parseTemplateData('presenter', r.data).name === avatarName);
  if (same.length !== 1) throw new Error(`instrutor "${avatarName}": ${same.length} na biblioteca; informe --presenter <chave>`);
  return same[0]!.key;
}

const resultPath = (args: CoverArgs) => path.resolve(args.out, `capa-${args.course}-${args.sufixo}.json`);

async function readResult(file: string): Promise<CoverResultFile | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as CoverResultFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

async function gerar(db: Db, args: CoverArgs) {
  const course = await authoring.getCourse(db, args.course);
  if (!course) throw new Error(`curso ${args.course} não encontrado`);
  const draft = await authoring.getDraft(db, args.course);
  const presenterKey = await presenterKeyFor(db, args, course, draft?.document.presentation?.avatarName);
  const ctx = await loadContext(db, { presenter: presenterKey, workspace: course.workspaceId });
  const ref = await loadReference(db, ctx.studio, ctx.workspaceId);
  const { prompt, sceneryShortened } = buildCoverPrompt({ roupa: args.roupa, pose: args.pose, lado: args.lado, scenery: ctx.studio.sceneryPrompt });
  const file = resultPath(args);
  const prev = await readResult(file);
  if (prev && (prev.baseLookId !== ctx.baseLookId || prev.workspaceId !== ctx.workspaceId)) throw new Error(`${file} é de outro look-base/workspace; use outro --sufixo`);
  if (prev?.generationId && prev.prompt !== prompt) throw new Error(`já existe geração com outro pedido em ${file}; para refazer use outro --sufixo (nada foi pedido)`);
  const key = coverIdempotencyKey({ workspaceId: ctx.workspaceId, courseId: args.course, sufixo: args.sufixo, baseLookId: ctx.baseLookId, prompt, referenceImage: ref });
  const images = prev?.generationId ? 0 : 1;
  const { usd } = checkCoverSpend({ images, maxUsd: args.maxUsd, confirmar: args.confirmar, env: process.env });

  console.log(`${tag} curso ${course.title} (${args.course}), instrutor ${presenterKey} (${ctx.presenter.name}), estúdio ${ctx.studioKey}`);
  console.log(`${tag} look-base ${ctx.baseLookId}; lado ${args.lado === 'esq' ? 'esquerdo' : 'direito'}${prev?.generationId ? ' · JÁ PEDIDA (sem custo)' : ''}`);
  console.log(`${tag} idempotency-key ${key}`);
  console.log(`${tag} prompt (${prompt.length}/1000${sceneryShortened ? ', estúdio encurtado' : ''}):\n${prompt}`);
  console.log(`${tag} imagens novas: ${images} × US$ 1 = US$ ${usd}${args.maxUsd !== undefined ? ` (teto ${args.maxUsd})` : ''}`);
  if (!args.confirmar) {
    console.log(`${tag} ENSAIO (--seco): nada foi pedido, nada foi gravado.`);
    return;
  }

  const gen = new HeyGenLooksAdapter(process.env.HEYGEN_API_KEY!);
  await mkdir(args.out, { recursive: true });
  const result: CoverResultFile = prev ?? { version: 1, courseId: args.course, workspaceId: ctx.workspaceId, presenter: presenterKey, sufixo: args.sufixo, baseLookId: ctx.baseLookId, studioKey: ctx.studioKey, roupa: args.roupa, pose: args.pose, lado: args.lado, prompt, createdAt: new Date().toISOString(), status: 'generating' };
  const save = () => writeFile(file, `${JSON.stringify(result, null, 2)}\n`);

  // 1. pedir (grava o generationId ANTES de qualquer outro passo: nunca perde um resultado pago)
  if (!result.generationId) {
    const { generationId } = await gen.generateLookFromPrompt({ sourceLookId: ctx.baseLookId, prompt, aspectRatio: '16:9', idempotencyKey: key, name: `capa ${args.course} ${args.sufixo}`.slice(0, 60), referenceImages: [ref] });
    result.generationId = generationId;
    result.status = 'generating';
    await save();
    console.log(`${tag} geração pedida: ${generationId}`);
  }

  // 2. esperar, baixar a imagem e guardar como asset
  for (let i = 0; i < 360 && result.status === 'generating'; i++) {
    const g = await gen.getLookGeneration(result.generationId!);
    if (g.status === 'completed') {
      result.status = 'completed';
      result.lookId = g.lookId ?? result.generationId!;
      if (g.previewUrl) {
        result.previewUrl = g.previewUrl;
        const res = await fetch(g.previewUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`download da imagem falhou (${res.status}); rode de novo (sem novo custo)`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const img = sniffImage(bytes);
        const asset = await storeGeneratedAsset({ workspaceId: ctx.workspaceId, kind: 'image', mime: img.mime, bytes, createdBy: course.createdBy });
        result.previewAssetId = asset.id;
        const storage = await getStorage();
        result.previewPath = storage.provider === 'local' ? path.resolve(process.env.STORAGE_DIR ?? '.data/storage', asset.storageKey) : asset.storageKey;
        await writeFile(path.resolve(args.out, `capa-${args.course}-${args.sufixo}.${img.ext}`), bytes);
      }
      console.log(`${tag} pronta: look ${result.lookId}`);
    } else if (g.status === 'failed') {
      result.status = 'failed';
      result.error = (g.error ?? 'falha na geração').slice(0, 500);
      console.log(`${tag} FALHOU: ${result.error}`);
    }
    await save();
    if (result.status === 'generating') await sleep(5000);
  }
  if (result.status === 'generating') console.log(`${tag} ainda processando; rode de novo para continuar (sem novo custo)`);
  console.log(`${tag} resultado: ${file}`);
}

async function aplicar(db: Db, args: CoverArgs) {
  const result = JSON.parse(await readFile(path.resolve(args.deArquivo!), 'utf8')) as CoverResultFile;
  const course = await authoring.getCourse(db, args.course);
  if (!course) throw new Error(`curso ${args.course} não encontrado`);
  const assetId = posterFromResult(result, course);
  await authoring.setCoursePoster(db, args.course, assetId);
  console.log(`${tag} ${course.title}: poster_asset_id = ${assetId}`);
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

/**
 * Privacidade do aluno: traz para a plataforma os retratos de apresentador que ainda apontam para o provedor
 * (`files2.heygen.ai/talking_photo/…`, links ASSINADOS que vencem em poucos dias). Cada imagem é baixada UMA vez
 * (servidor, de graça: é uma imagem pública, nenhum job pago), guardada no storage como asset (`/api/assets/<id>`,
 * o mesmo caminho das outras mídias) e o endereço é trocado no documento.
 *
 * Onde mexe (só estes campos, nada mais no documento):
 *   - rascunhos dos cursos PUBLICADOS: `presentation.avatarPreviewUrl` e `presentation.cameras[].previewUrl`;
 *   - biblioteca de modelos (instrutores): `data.previewUrl` e `data.cameraKits[].cameras[].previewUrl`
 *     (é de lá que um kit novo copia o retrato para o curso, então precisa estar limpo também).
 * Não publica (use `packages/db/src/scripts/publicar-e-matricular.ts <curso> --dry-run` e depois sem o `--dry-run`), não
 * mexe em versões já publicadas, em cursos arquivados nem em rascunhos com outro motivo de atenção.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/localizar-retratos.ts [--apply]
 * Sem `--apply` só baixa para conferir (nada é gravado no banco nem no storage) e diz o que faria. Repetir é seguro.
 */
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema as s, media, authoring } from '@lms/db';
import { CourseDocumentSchema, externalHostOf } from '@lms/course-schema';
import { getStorage, sniffMime, ALLOWED_MEDIA, MAX_UPLOAD_BYTES } from '@lms/media';

const APPLY = process.argv.includes('--apply');
/** hosts de onde se aceita baixar (imagem de apresentador do provedor). Qualquer outro é só relatado. */
const ALLOWED_HOSTS = (h: string) => h === 'heygen.ai' || h.endsWith('.heygen.ai');

const chave = (url: string) => new URL(url).pathname; // a mesma imagem pode ter várias assinaturas; o caminho é a identidade
const expira = (url: string) => Number(new URL(url).searchParams.get('Expires') ?? 0);

type Ref = { where: string; url: string };
/** Strings externas nos campos de retrato (não mexe em mais nada). */
function mapPresentation(doc: Record<string, unknown>, f: (url: string) => string, refs?: Ref[], where = ''): void {
  const pres = doc.presentation as { avatarPreviewUrl?: string; cameras?: Array<{ previewUrl?: string }> } | undefined;
  if (!pres) return;
  const one = (holder: Record<string, unknown>, key: string, path: string) => {
    const v = holder[key];
    if (typeof v !== 'string' || !externalHostOf(v)) return;
    refs?.push({ where: `${where}${path}`, url: v });
    holder[key] = f(v);
  };
  one(pres as Record<string, unknown>, 'avatarPreviewUrl', 'presentation.avatarPreviewUrl');
  (pres.cameras ?? []).forEach((c, i) => one(c as Record<string, unknown>, 'previewUrl', `presentation.cameras[${i}].previewUrl`));
}
function mapLibrary(data: Record<string, unknown>, f: (url: string) => string, refs?: Ref[], where = ''): void {
  const one = (holder: Record<string, unknown>, key: string, path: string) => {
    const v = holder[key];
    if (typeof v !== 'string' || !externalHostOf(v) || !/\.(webp|png|jpe?g)(\?|$)/i.test(v)) return;
    refs?.push({ where: `${where}${path}`, url: v });
    holder[key] = f(v);
  };
  one(data, 'previewUrl', 'previewUrl');
  const kits = (data.cameraKits ?? []) as Array<{ cameras?: Array<Record<string, unknown>> }>;
  kits.forEach((k, i) => (k.cameras ?? []).forEach((c, j) => one(c, 'previewUrl', `cameraKits[${i}].cameras[${j}].previewUrl`)));
}

async function baixar(urls: string[]): Promise<{ bytes: Uint8Array; mime: string } | { erro: string }> {
  let ultimo = 'sem link';
  for (const url of [...urls].sort((a, b) => expira(b) - expira(a))) {
    const host = new URL(url).hostname;
    if (url.startsWith('https://') === false || !ALLOWED_HOSTS(host)) return { erro: `host não permitido: ${host}` };
    try {
      const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        ultimo = `HTTP ${res.status}${expira(url) && expira(url) * 1000 < Date.now() ? ' (link vencido)' : ''}`;
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_UPLOAD_BYTES.image) {
        ultimo = 'imagem acima de 10 MB';
        continue;
      }
      const mime = sniffMime(bytes.subarray(0, 32));
      if (!mime || ALLOWED_MEDIA[mime]?.kind !== 'image') {
        ultimo = 'o arquivo não é PNG, JPEG nem WebP';
        continue;
      }
      return { bytes, mime };
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
  }
  return { erro: ultimo };
}

async function main() {
  const db = getDb();
  // 1) o que existe
  const courses = await db.select({ id: s.courses.id, title: s.courses.title, status: s.courses.status, workspaceId: s.courses.workspaceId }).from(s.courses);
  const drafts = await db.select().from(s.courseDrafts);
  const draftOf = new Map(drafts.map((d) => [d.courseId, d]));
  const published = courses.filter((c) => c.status === 'published');
  const archivedWithExternal = courses.filter((c) => c.status !== 'published' && JSON.stringify(draftOf.get(c.id)?.document ?? {}).includes('heygen.ai'));
  const templates = await db.select().from(s.libraryTemplates);

  const urlsByKey = new Map<string, { urls: Set<string>; workspaceId: string }>();
  const note = (url: string, workspaceId: string) => {
    const k = chave(url);
    const e = urlsByKey.get(k) ?? { urls: new Set<string>(), workspaceId };
    e.urls.add(url);
    urlsByKey.set(k, e);
  };
  for (const c of published) {
    const d = draftOf.get(c.id);
    if (!d) continue;
    const refs: Ref[] = [];
    mapPresentation(structuredClone(d.document) as unknown as Record<string, unknown>, (u) => u, refs);
    refs.forEach((r) => note(r.url, c.workspaceId));
  }
  for (const t of templates) {
    const refs: Ref[] = [];
    mapLibrary(structuredClone(t.data), (u) => u, refs);
    refs.forEach((r) => note(r.url, t.workspaceId));
  }
  console.log(`[retratos] ${urlsByKey.size} imagem(ns) distinta(s) para trazer (${published.length} cursos publicados, ${templates.length} modelos da biblioteca)`);
  if (archivedWithExternal.length) console.log(`[retratos] deixados como estão (curso arquivado, o aluno não os vê): ${archivedWithExternal.map((c) => `${c.title} [${c.id}]`).join('; ')}`);

  // 2) baixar uma vez cada imagem e guardar como asset
  const storage = await getStorage();
  const novoUrl = new Map<string, string>(); // caminho da imagem -> /api/assets/<id>
  const falhas: string[] = [];
  const admin = (await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'admin@demo.local')))[0]?.id;
  let baixadas = 0;
  let reaproveitadas = 0;
  for (const [k, v] of urlsByKey) {
    const r = await baixar([...v.urls]);
    if ('erro' in r) {
      falhas.push(`${k.slice(-48)}: ${r.erro}`);
      continue;
    }
    const sha256 = createHash('sha256').update(r.bytes).digest('hex');
    const [ja] = await db.select().from(s.assets).where(and(eq(s.assets.workspaceId, v.workspaceId), eq(s.assets.kind, 'image'), eq(s.assets.sha256, sha256))).limit(1);
    let assetId = ja?.id;
    if (ja) reaproveitadas++;
    else if (APPLY) {
      const ext = ALLOWED_MEDIA[r.mime]!.ext;
      const key = `${v.workspaceId}/image/${sha256.slice(0, 2)}/${sha256}.${ext}`;
      await storage.putObject(key, r.bytes, r.mime);
      const row = await media.createAsset(db, {
        workspaceId: v.workspaceId,
        kind: 'image',
        source: 'generated',
        mimeType: r.mime,
        sizeBytes: r.bytes.byteLength,
        storageProvider: storage.provider,
        storageKey: key,
        originalName: `retrato-${k.split('/').pop()!.toLowerCase()}`.slice(0, 200),
        sha256,
        ...(admin ? { createdBy: admin } : {}),
      });
      assetId = row.id;
      baixadas++;
    } else baixadas++;
    novoUrl.set(k, assetId ? `/api/assets/${assetId}` : `/api/assets/(novo)`);
  }
  console.log(`[retratos] baixadas ${baixadas}, já guardadas ${reaproveitadas}${APPLY ? '' : ' (sem --apply: nada foi gravado)'}; sem conseguir: ${falhas.length}`);
  for (const f of falhas) console.log(`  ✗ ${f}`);
  const trocar = (u: string) => novoUrl.get(chave(u)) ?? u;

  // 3) rascunhos dos cursos publicados
  let nDrafts = 0;
  for (const c of published) {
    const d = draftOf.get(c.id);
    if (!d) continue;
    const doc = structuredClone(d.document) as unknown as Record<string, unknown>;
    const refs: Ref[] = [];
    mapPresentation(doc, trocar, refs);
    const trocados = refs.filter((r) => novoUrl.has(chave(r.url))).length;
    if (!refs.length) continue;
    // o salvamento passa o documento pelo esquema: confere que isso, sozinho, não muda nada além das URLs
    const before = CourseDocumentSchema.safeParse(d.document);
    const after = CourseDocumentSchema.safeParse(doc);
    if (!before.success || !after.success) {
      console.log(`  ✗ ${c.title}: documento não passa no esquema; não mexi`);
      continue;
    }
    const neutro = structuredClone(before.data) as unknown as Record<string, unknown>;
    mapPresentation(neutro, trocar);
    if (JSON.stringify(neutro) !== JSON.stringify(after.data)) {
      console.log(`  ✗ ${c.title}: a troca mudaria mais do que as URLs; não mexi`);
      continue;
    }
    nDrafts++;
    if (APPLY && trocados) {
      const out = await authoring.saveDraft(db, { courseId: c.id, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'retratos do apresentador guardados na plataforma' });
      console.log(`  ✓ ${c.title}: ${trocados}/${refs.length} imagem(ns); rascunho ${d.revision} → ${out.revision}`);
    } else console.log(`  · ${c.title}: ${trocados}/${refs.length} imagem(ns)${APPLY ? '' : ' (dry-run)'}`);
  }

  // 4) biblioteca de modelos
  let nTpl = 0;
  for (const t of templates) {
    const data = structuredClone(t.data);
    const refs: Ref[] = [];
    mapLibrary(data, trocar, refs);
    const trocados = refs.filter((r) => novoUrl.has(chave(r.url))).length;
    if (!trocados) continue;
    nTpl++;
    if (APPLY) await db.update(s.libraryTemplates).set({ data, updatedAt: new Date() }).where(eq(s.libraryTemplates.id, t.id));
    console.log(`  ${APPLY ? '✓' : '·'} modelo ${t.kind}/${t.key}: ${trocados} imagem(ns)`);
  }
  console.log(`[retratos] ${APPLY ? 'gravado' : 'faria'}: ${nDrafts} rascunho(s), ${nTpl} modelo(s) da biblioteca${APPLY ? '. Falta publicar (publicar-e-matricular.ts).' : ''}`);
  if (falhas.length) process.exitCode = 2;
}
main().then(() => process.exit(), (e) => { console.error(`[retratos] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

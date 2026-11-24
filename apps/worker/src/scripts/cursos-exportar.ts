/**
 * Empacota cursos publicados para levar a outro ambiente (ex.: produção), com `cursos-importar.ts` do outro lado.
 *
 * Gera `<saida>/manifest.json` + `<saida>/files/<storage_key>`: a versão publicada mais recente de cada curso (o
 * documento inteiro), os dados do curso (slug, trilha, capa) e SÓ as mídias que essas versões usam (vídeos, áudios,
 * imagens, legendas, materiais; mais as que essas mídias citam no metadata). Ids preservados, para as referências de
 * dentro das aulas continuarem valendo. Não leva matrículas, alunos, rascunhos antigos nem jobs de geração.
 *
 *   pnpm --filter @lms/worker exec tsx src/scripts/cursos-exportar.ts --saida /caminho/pacote crs_a crs_b
 */
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema as s } from '@lms/db';
import { getStorage } from '@lms/media';
import { COURSE_PACKAGE_VERSION, type CoursePackageManifest } from './cursos-pacote';

const ASSET_ID_RE = /ast_[a-z0-9]{8,}/g;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg('saida');
  if (!out) throw new Error('informe --saida <pasta>');
  const ids = process.argv.slice(2).filter((a, i, all) => a.startsWith('crs_') && all[i - 1] !== '--saida');
  if (!ids.length) throw new Error('informe os ids dos cursos (crs_...)');
  const root = resolve(out);
  mkdirSync(join(root, 'files'), { recursive: true });
  const db = getDb();

  const manifest: CoursePackageManifest = { version: COURSE_PACKAGE_VERSION, createdAt: new Date().toISOString(), courses: [], assets: [] };
  const wanted = new Set<string>();
  for (const id of ids) {
    const [c] = await db.select().from(s.courses).where(eq(s.courses.id, id));
    if (!c) throw new Error(`${id}: curso não encontrado`);
    const [v] = await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, id)).orderBy(desc(s.courseVersions.versionNumber)).limit(1);
    if (!v) throw new Error(`${id}: curso sem versão publicada`);
    manifest.courses.push({ id: c.id, slug: c.slug, title: c.title, trail: c.trail, posterAssetId: c.posterAssetId, versionNumber: v.versionNumber, document: v.document });
    for (const m of JSON.stringify(v.document).matchAll(ASSET_ID_RE)) wanted.add(m[0]);
    if (c.posterAssetId) wanted.add(c.posterAssetId);
  }

  // mídias citadas no metadata das mídias (legenda de um vídeo, quadro de uma cena…): uma volta basta
  const first = wanted.size ? await db.select().from(s.assets).where(inArray(s.assets.id, [...wanted])) : [];
  for (const a of first) for (const m of JSON.stringify(a.metadata ?? {}).matchAll(ASSET_ID_RE)) wanted.add(m[0]);
  const rows = wanted.size ? await db.select().from(s.assets).where(inArray(s.assets.id, [...wanted])) : [];
  const missingRows = [...wanted].filter((id) => !rows.some((r) => r.id === id));

  const storage = await getStorage();
  let bytes = 0;
  for (const a of rows) {
    const dest = join(root, 'files', a.storageKey);
    mkdirSync(dirname(dest), { recursive: true });
    const hash = createHash('sha256');
    const src = storage.getStream(a.storageKey);
    src.on('data', (chunk: Buffer) => hash.update(chunk));
    await pipeline(src, createWriteStream(dest));
    const sha = hash.digest('hex');
    if (a.sha256 && a.sha256 !== sha) throw new Error(`${a.id}: arquivo no storage não confere com o sha256 gravado`);
    bytes += a.sizeBytes ?? 0;
    manifest.assets.push({
      id: a.id,
      kind: a.kind,
      source: a.source,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      storageKey: a.storageKey,
      originalName: a.originalName,
      sha256: sha,
      durationSeconds: a.durationSeconds,
      transcript: a.transcript,
      metadata: a.metadata ?? {},
    });
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  console.log(`[exportar] ${manifest.courses.length} curso(s): ${manifest.courses.map((c) => `${c.title} (v${c.versionNumber})`).join('; ')}`);
  console.log(`[exportar] ${manifest.assets.length} mídia(s), ${(bytes / 1024 / 1024).toFixed(0)} MB em ${root}`);
  if (missingRows.length) console.warn(`[exportar] atenção: ${missingRows.length} id(s) citados sem mídia no banco (ficam de fora): ${missingRows.slice(0, 10).join(', ')}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[exportar] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  },
);

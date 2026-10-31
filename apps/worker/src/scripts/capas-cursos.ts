/**
 * Capas em pé da vitrine: guarda cada imagem (JPEG 3:4) como asset do workspace do curso e liga em
 * `courses.poster_asset_id`. Grátis; idempotente (mesmo arquivo = mesmo asset pelo SHA-256 do storage).
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/capas-cursos.ts <curso>=<arquivo.jpg> […]
 */
import { readFile } from 'node:fs/promises';
import { authoring, getDb } from '@lms/db';
import { storeGeneratedAsset } from '../media';

async function main() {
  const pairs = process.argv.slice(2).map((a) => a.split('='));
  if (!pairs.length || pairs.some((p) => p.length !== 2)) throw new Error('uso: capas-cursos.ts <curso>=<arquivo.jpg> […]');
  const db = getDb();
  for (const [courseId, file] of pairs) {
    const course = await authoring.getCourse(db, courseId!);
    if (!course) throw new Error(`curso ${courseId} não encontrado`);
    const bytes = new Uint8Array(await readFile(file!));
    const asset = await storeGeneratedAsset({ workspaceId: course.workspaceId, kind: 'image', mime: 'image/jpeg', bytes, createdBy: course.createdBy });
    await authoring.setCoursePoster(db, courseId!, asset.id);
    console.log(`[capa] ${course.title}: ${asset.id}`);
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[capa] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

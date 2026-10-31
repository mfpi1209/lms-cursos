import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { podeEntrar, PODE_ENTRAR_TITLE, presentationFingerprint } from '@lms/course-schema';
import { createDb, type Database } from '../client';
import { runMigrations } from '../migrate';
import { assertDisposableDatabaseUrl } from '../test-guard';
import * as s from '../schema';
import { createCourse, getDraft, setNodeMedia } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';
import { createAsset } from '../repositories/media';
import { seed, type SeedResult } from './seed';

export const E2E_PODE_ENTRAR_SLUG = 'pode-entrar';
/** cena do "Pode entrar" que recebe um vídeo SIMULADO no e2e (lista de vídeos, confirmação de publicação, "apresentação mudou") */
export const E2E_SIMULATED_SCENE = { lessonId: 'aula_conte_sobre_voce', nodeId: 'q03_primeiro_emprego' } as const;

export interface SeedE2EResult extends SeedResult {
  podeEntrarId: string;
  podeEntrarVersionId: string;
}

/**
 * Seed ADICIONAL do e2e (auditoria P1-9): o exemplo "Pode entrar" publicado,
 * matrículas das duas alunas e um vídeo simulado (com impressão da apresentação)
 * numa cena, para os testes de navegação, da lista de vídeos e da publicação
 * não dependerem de ids do banco de desenvolvimento. Idempotente.
 */
export async function seedE2E(db: Database, base: SeedResult, opts: { log?: (m: string) => void } = {}): Promise<SeedE2EResult> {
  const log = opts.log ?? (() => {});
  const adminId = base.users['admin@demo.local']!;
  const authorId = base.users['autor@demo.local']!;
  let [course] = await db.select().from(s.courses).where(eq(s.courses.slug, E2E_PODE_ENTRAR_SLUG)).limit(1);
  if (!course) {
    const created = await createCourse(db, { workspaceId: base.workspaceId, title: PODE_ENTRAR_TITLE, createdBy: authorId, document: podeEntrar, slug: E2E_PODE_ENTRAR_SLUG });
    [course] = await db.select().from(s.courses).where(eq(s.courses.id, created.id)).limit(1);
    log(`curso "Pode entrar" criado: ${created.id}`);
  }
  const courseId = course!.id;
  const draft = (await getDraft(db, courseId))!;
  const target = draft.document.modules.flatMap((m) => m.lessons).find((l) => l.id === E2E_SIMULATED_SCENE.lessonId)?.graph.nodes.find((n) => n.id === E2E_SIMULATED_SCENE.nodeId);
  if (target && !('media' in target && target.media)) {
    const asset = await createAsset(db, {
      workspaceId: base.workspaceId, kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: 0, storageProvider: 'local', storageKey: `e2e/${courseId}/${E2E_SIMULATED_SCENE.nodeId}.mp4`, sha256: 'e2e-simulated', createdBy: authorId,
    });
    await setNodeMedia(db, {
      courseId, lessonId: E2E_SIMULATED_SCENE.lessonId, nodeId: E2E_SIMULATED_SCENE.nodeId, userId: authorId, note: 'e2e: vídeo simulado',
      media: {
        assetId: asset.id, kind: 'video', stale: false, transcript: 'e2e',
        generatedFrom: { jobId: 'job_e2e_sim', sceneHash: 'e2e', provider: 'heygen', simulated: true, presentationFingerprint: presentationFingerprint(draft.document.presentation) },
      },
    });
    log(`vídeo simulado anexado a ${E2E_SIMULATED_SCENE.nodeId}`);
  }
  let version = await getLatestVersion(db, courseId);
  if (!version) {
    const published = await publishCourse(db, { courseId, userId: authorId, allowSimulatedMedia: true });
    version = await getLatestVersion(db, courseId);
    log(`"Pode entrar" publicado: v${published.versionNumber}`);
  }
  for (const email of ['aluno@demo.local', 'aluna@demo.local']) {
    const { created } = await enrollStudent(db, { courseId, userId: base.users[email]!, createdBy: adminId });
    if (created) log(`matrícula de ${email} no "Pode entrar"`);
  }
  return { ...base, podeEntrarId: courseId, podeEntrarVersionId: version!.id };
}

/**
 * CLI do e2e: `DATABASE_URL=postgres://.../lms_cursos_e2e tsx src/seed/e2e.ts`.
 * Recusa qualquer banco que não seja *_e2e/*_test (guarda), zera o schema,
 * migra, roda o seed base e o seed do e2e. Imprime o resultado em JSON na
 * última linha (o globalSetup do Playwright lê).
 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida');
    process.exit(1);
  }
  (async () => {
    // a guarda compara com o DATABASE_URL "de verdade" do ambiente: aqui ele já é o e2e, então passamos o do .env (se houver) à parte
    assertDisposableDatabaseUrl(url, { DATABASE_URL: process.env.E2E_GUARD_DEV_DATABASE_URL });
    const reset = process.env.E2E_DB_RESET !== '0';
    if (reset) {
      const conn = createDb(url, { max: 1 });
      await conn.sql`drop schema public cascade`;
      await conn.sql`drop schema if exists drizzle cascade`;
      await conn.sql`create schema public`;
      await conn.close();
    }
    await runMigrations(url);
    const { db, close } = createDb(url, { max: 4 });
    try {
      const base = await seed(db, { log: (m) => console.error(`[seed:e2e] ${m}`) });
      const r = await seedE2E(db, base, { log: (m) => console.error(`[seed:e2e] ${m}`) });
      console.log(JSON.stringify({ courseId: r.courseId, podeEntrarId: r.podeEntrarId, workspaceId: r.workspaceId }));
    } finally {
      await close();
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

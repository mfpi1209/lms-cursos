/**
 * Importa um pacote de cursos gerado por `cursos-exportar.ts` (ex.: levar os cursos de desenvolvimento para produção).
 * Roda no console do serviço worker, depois das migrações e de existir uma conta de administrador (`criar-admin.ts`).
 *
 * De onde vem o pacote:
 *  - `--release <tag>`: baixa da release do repositório privado (`--repo`, padrão mfpi1209/lms-cursos-dados). Pede um
 *    token do GitHub só de leitura (digitado sem eco; ou `GITHUB_TOKEN`). As partes são conferidas pelo SHA256SUMS da
 *    release e extraídas em `--baixar-em` (padrão /tmp/lms-pacote-cursos), sem guardar as partes.
 *  - `--pasta <dir>`: um pacote já extraído (manifest.json + files/).
 *
 * O que faz (com `--gravar`; sem ele, só mostra o plano):
 *  1. mídias: confere o sha256 de cada arquivo, grava no storage do ambiente e cria o registro com o MESMO id
 *     (mídia que já existe com o mesmo conteúdo é pulada; com conteúdo diferente, para tudo);
 *  2. cursos: cria com o mesmo id no workspace do administrador e publica a versão do pacote. Curso que já existe só
 *     ganha versão nova se o documento mudou. Vídeo simulado bloqueia (`--aceitar-simulado` para publicar assim mesmo).
 * Não apaga nada, não mexe em matrículas e pode rodar de novo sem duplicar.
 *
 *   pnpm --filter @lms/worker exec tsx src/scripts/cursos-importar.ts --release v2-cursos --admin voce@empresa.com
 *   pnpm --filter @lms/worker exec tsx src/scripts/cursos-importar.ts --release v2-cursos --admin voce@empresa.com --gravar
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { authoring, getDb, newId, publishing, schema as s } from '@lms/db';
import { CourseDocumentSchema, migrateCourseDocument } from '@lms/course-schema';
import { getStorage } from '@lms/media';
import { parseManifest, type CoursePackageManifest } from './cursos-pacote';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _e, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((res) => {
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      res(a.trim());
    });
    muted = true;
  });
}

/* ------------------------------------------------------------------------ */
/* Download da release                                                       */
/* ------------------------------------------------------------------------ */

interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

async function downloadRelease(repo: string, tag: string, dest: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim() || (process.stdin.isTTY ? await askHidden('Token do GitHub (só leitura; não aparece na tela): ') : '');
  if (!token) throw new Error('sem token: defina GITHUB_TOKEN ou rode num terminal interativo');
  const gh = (url: string, accept = 'application/vnd.github+json') => fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'lms-cursos-importar' } });
  const rel = await gh(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (!rel.ok) throw new Error(`release ${tag} de ${repo}: HTTP ${rel.status} (confira o token e o acesso ao repositório)`);
  const assets = ((await rel.json()) as { assets: ReleaseAsset[] }).assets;
  const sums = assets.find((a) => a.name === 'SHA256SUMS');
  const parts = assets.filter((a) => /\.tar\.part-[a-z]{2}$/.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!sums || !parts.length) throw new Error('a release não tem SHA256SUMS e partes .tar.part-xx');
  const expected = new Map(
    (await (await gh(sums.url, 'application/octet-stream')).text())
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length === 2)
      .map(([h, n]) => [n!, h!] as const),
  );
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const tar = spawn('tar', ['-x', '-C', dest], { stdio: ['pipe', 'inherit', 'inherit'] });
  const tarDone = new Promise<void>((res, rej) => tar.on('close', (code) => (code === 0 ? res() : rej(new Error(`tar terminou com código ${code}`)))));
  const total = parts.reduce((n, p) => n + p.size, 0);
  let got = 0;
  try {
    for (const p of parts) {
      const want = expected.get(p.name);
      if (!want) throw new Error(`${p.name} não está no SHA256SUMS`);
      const res = await gh(p.url, 'application/octet-stream');
      if (!res.ok || !res.body) throw new Error(`${p.name}: HTTP ${res.status}`);
      const hash = createHash('sha256');
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        got += chunk.byteLength;
        if (!tar.stdin.write(chunk)) await new Promise((r) => tar.stdin.once('drain', r));
      }
      if (hash.digest('hex') !== want) throw new Error(`${p.name}: o conteúdo baixado não confere com o SHA256SUMS`);
      console.log(`[importar] baixado ${p.name} (${Math.round((got / total) * 100)}%)`);
    }
    tar.stdin.end();
    await tarDone;
  } catch (e) {
    tar.kill();
    throw e;
  }
}

/* ------------------------------------------------------------------------ */
/* Importação                                                                */
/* ------------------------------------------------------------------------ */

function sha256File(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej);
  });
}

async function main() {
  const email = (arg('admin') ?? '').trim().toLowerCase();
  if (!email) throw new Error('informe --admin <e-mail da conta de administrador>');
  const write = flag('gravar');
  const release = arg('release');
  let dir = arg('pasta');
  if (!dir && !release) throw new Error('informe --release <tag> ou --pasta <pacote extraído>');
  if (release) {
    dir = resolve(arg('baixar-em') ?? '/tmp/lms-pacote-cursos');
    await downloadRelease(arg('repo') ?? 'mfpi1209/lms-cursos-dados', release, dir);
  }
  // o tar da exportação traz uma pasta-raiz; aceita o pacote nela ou um nível abaixo
  let root = resolve(dir!);
  if (!existsSync(join(root, 'manifest.json'))) {
    const inner = join(root, 'pacote-cursos');
    if (existsSync(join(inner, 'manifest.json'))) root = inner;
    else throw new Error(`não achei manifest.json em ${root}`);
  }
  const manifest: CoursePackageManifest = parseManifest(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));

  const db = getDb();
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email)).limit(1);
  if (!u) throw new Error(`não há conta com ${email}; crie com criar-admin.ts`);
  const members = await db
    .select({ workspaceId: s.workspaceMemberships.workspaceId, role: s.workspaceMemberships.role, slug: s.workspaces.slug })
    .from(s.workspaceMemberships)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.workspaceMemberships.workspaceId))
    .where(eq(s.workspaceMemberships.userId, u.id));
  const wsSlug = arg('workspace');
  const member = (wsSlug ? members.filter((m) => m.slug === wsSlug) : members).find((m) => m.role === 'admin' || m.role === 'author');
  if (!member) throw new Error(`${email} não é administradora/autora${wsSlug ? ` no workspace ${wsSlug}` : ''}`);
  const workspaceId = member.workspaceId;

  // plano
  const existingAssets = new Map(
    (manifest.assets.length ? await db.select({ id: s.assets.id, sha256: s.assets.sha256, workspaceId: s.assets.workspaceId }).from(s.assets).where(inArray(s.assets.id, manifest.assets.map((a) => a.id))) : []).map((a) => [a.id, a]),
  );
  const conflicts = manifest.assets.filter((a) => {
    const e = existingAssets.get(a.id);
    return e && e.sha256 && e.sha256 !== a.sha256;
  });
  if (conflicts.length) throw new Error(`${conflicts.length} mídia(s) já existem com conteúdo diferente (ex.: ${conflicts[0]!.id}); nada foi gravado`);
  const newAssets = manifest.assets.filter((a) => !existingAssets.has(a.id));
  const mb = newAssets.reduce((n, a) => n + a.sizeBytes, 0) / 1024 / 1024;
  console.log(`[importar] workspace ${member.slug}; ${manifest.courses.length} curso(s), ${newAssets.length} mídia(s) novas (${mb.toFixed(0)} MB), ${manifest.assets.length - newAssets.length} já presentes`);

  const docs = manifest.courses.map((c) => ({ c, doc: CourseDocumentSchema.parse(migrateCourseDocument(c.document)) }));
  for (const { c } of docs) {
    const [cur] = await db.select({ workspaceId: s.courses.workspaceId }).from(s.courses).where(eq(s.courses.id, c.id));
    if (cur && cur.workspaceId !== workspaceId) throw new Error(`${c.id} já existe em outro workspace; nada foi gravado`);
    console.log(`[importar]   ${c.title}: ${cur ? 'já existe (nova versão só se mudou)' : 'novo'}`);
  }
  if (!write) {
    console.log('[importar] a seco: nada foi gravado. Rode de novo com --gravar.');
    return;
  }

  // 1. mídias
  const storage = await getStorage();
  let n = 0;
  for (const a of newAssets) {
    const file = join(root, 'files', a.storageKey);
    if (!existsSync(file)) throw new Error(`${a.id}: arquivo ausente no pacote (${a.storageKey})`);
    if ((await sha256File(file)) !== a.sha256) throw new Error(`${a.id}: arquivo do pacote não confere com o sha256`);
    await storage.putObject(a.storageKey, createReadStream(file), a.mimeType);
    await db
      .insert(s.assets)
      .values({
        id: a.id,
        workspaceId,
        kind: a.kind as typeof s.assets.$inferInsert.kind,
        source: a.source as typeof s.assets.$inferInsert.source,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storageProvider: storage.provider,
        storageKey: a.storageKey,
        originalName: a.originalName,
        sha256: a.sha256,
        durationSeconds: a.durationSeconds,
        transcript: a.transcript,
        createdBy: u.id,
        metadata: (a.metadata ?? {}) as typeof s.assets.$inferInsert.metadata,
      })
      .onConflictDoNothing();
    if (++n % 100 === 0) console.log(`[importar] mídias: ${n}/${newAssets.length}`);
  }
  console.log(`[importar] mídias gravadas: ${n}`);

  // 2. cursos
  for (const { c, doc } of docs) {
    const [cur] = await db.select().from(s.courses).where(eq(s.courses.id, c.id));
    if (!cur) {
      let slug = c.slug;
      for (let i = 2; ; i++) {
        const [taken] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, workspaceId), eq(s.courses.slug, slug))).limit(1);
        if (!taken) break;
        slug = `${c.slug}-${i}`;
      }
      await db.transaction(async (tx) => {
        await tx.insert(s.courses).values({ id: c.id, workspaceId, slug, title: doc.title || c.title, createdBy: u.id, trail: c.trail, posterAssetId: c.posterAssetId });
        await tx.insert(s.courseDrafts).values({ courseId: c.id, document: doc, revision: 1, updatedBy: u.id });
        await tx.insert(s.draftRevisions).values({ id: newId('rev'), courseId: c.id, revision: 1, document: doc, authorId: u.id, origin: 'import', note: `pacote de cursos (${manifest.createdAt})` });
      });
    } else {
      const [latest] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.courseId, c.id)).orderBy(desc(s.courseVersions.versionNumber)).limit(1);
      await db.update(s.courses).set({ trail: c.trail, posterAssetId: c.posterAssetId, updatedAt: new Date() }).where(eq(s.courses.id, c.id));
      if (latest && JSON.stringify(migrateCourseDocument(latest.document)) === JSON.stringify(doc)) {
        console.log(`[importar] ${c.title}: igual à versão publicada; sem mudança`);
        continue;
      }
      const draft = (await authoring.getDraft(db, c.id))!;
      await authoring.saveDraft(db, { courseId: c.id, document: doc, expectedRevision: draft.revision, userId: u.id, origin: 'import', note: `pacote de cursos (${manifest.createdAt})` });
    }
    try {
      const r = await publishing.publishCourse(db, { courseId: c.id, userId: u.id, allowSimulatedMedia: flag('aceitar-simulado') });
      console.log(`[importar] ${c.title}: publicado (versão ${r.versionNumber}, ${r.warnings.length} aviso(s))`);
    } catch (e) {
      console.error(`[importar] ${c.title}: NÃO publicado — ${e instanceof Error ? e.message : e}. O rascunho ficou gravado; publique pelo estúdio.`);
    }
  }
  if (release) rmSync(dir!, { recursive: true, force: true });
  console.log('[importar] pronto.');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[importar] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  },
);

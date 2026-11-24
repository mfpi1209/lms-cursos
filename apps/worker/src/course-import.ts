/**
 * Importação de pacotes de cursos (formato de `scripts/cursos-exportar.ts`): download da release do GitHub, conferência
 * e gravação das mídias, criação e publicação dos cursos. Usada pelo comando `scripts/cursos-importar.ts` e pela
 * importação automática do worker (`autoImportCourses`).
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { authoring, getDb, newId, publishing, schema as s, type Database } from '@lms/db';
import { CourseDocumentSchema, migrateCourseDocument } from '@lms/course-schema';
import { getStorage } from '@lms/media';
import { parseManifest, type CoursePackageManifest } from './scripts/cursos-pacote';

type Log = (msg: string) => void;

/* ------------------------------------------------------------------------ */
/* Download                                                                  */
/* ------------------------------------------------------------------------ */

interface ReleaseAsset {
  name: string;
  url: string;
  browser_download_url: string;
  size: number;
}

/**
 * Baixa a release (`repo`, `tag`) e extrai em `dest`, sem guardar as partes: cada parte passa pelo SHA256SUMS da release
 * enquanto vai para o `tar`. Repositório privado: precisa de `token` (só leitura); público: sem token.
 */
export async function downloadRelease(opts: { repo: string; tag: string; dest: string; token?: string; log: Log }): Promise<void> {
  const { repo, tag, dest, token, log } = opts;
  const headers = (accept: string): Record<string, string> => ({ Accept: accept, 'User-Agent': 'lms-cursos-importar', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { headers: headers('application/vnd.github+json') });
  if (!rel.ok) throw new Error(`release ${tag} de ${repo}: HTTP ${rel.status}${token ? ' (confira o token e o acesso)' : ' (repositório privado precisa de token)'}`);
  const assets = ((await rel.json()) as { assets: ReleaseAsset[] }).assets;
  // com token: endpoint da API (funciona em repositório privado); sem token: o link público de download
  const get = (a: ReleaseAsset) => (token ? fetch(a.url, { headers: headers('application/octet-stream') }) : fetch(a.browser_download_url, { headers: { 'User-Agent': 'lms-cursos-importar' } }));
  const sums = assets.find((a) => a.name === 'SHA256SUMS');
  const parts = assets.filter((a) => /\.tar\.part-[a-z]{2}$/.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!sums || !parts.length) throw new Error('a release não tem SHA256SUMS e partes .tar.part-xx');
  const sumsRes = await get(sums);
  if (!sumsRes.ok) throw new Error(`SHA256SUMS: HTTP ${sumsRes.status}`);
  const expected = new Map(
    (await sumsRes.text())
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
      const res = await get(p);
      if (!res.ok || !res.body) throw new Error(`${p.name}: HTTP ${res.status}`);
      const hash = createHash('sha256');
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        got += chunk.byteLength;
        if (!tar.stdin.write(chunk)) await new Promise((r) => tar.stdin.once('drain', r));
      }
      if (hash.digest('hex') !== want) throw new Error(`${p.name}: o conteúdo baixado não confere com o SHA256SUMS`);
      log(`baixado ${p.name} (${Math.round((got / total) * 100)}%)`);
    }
    tar.stdin.end();
    await tarDone;
  } catch (e) {
    tar.kill();
    throw e;
  }
}

/** Pasta do pacote: o tar da exportação traz `pacote-cursos/`; aceita a pasta ou um nível acima. */
export function packageRoot(dir: string): string {
  const root = resolve(dir);
  if (existsSync(join(root, 'manifest.json'))) return root;
  const inner = join(root, 'pacote-cursos');
  if (existsSync(join(inner, 'manifest.json'))) return inner;
  throw new Error(`não achei manifest.json em ${root}`);
}

export function readPackage(root: string): CoursePackageManifest {
  return parseManifest(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
}

/* ------------------------------------------------------------------------ */
/* Dono dos cursos                                                           */
/* ------------------------------------------------------------------------ */

export interface CourseOwner {
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
}

/** Dono pela conta de administrador/autor com este e-mail (no workspace indicado, se houver). */
export async function ownerByEmail(db: Database, email: string, workspaceSlug?: string): Promise<CourseOwner> {
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email.trim().toLowerCase())).limit(1);
  if (!u) throw new Error(`não há conta com ${email}; crie com criar-admin.ts`);
  const members = await db
    .select({ workspaceId: s.workspaceMemberships.workspaceId, role: s.workspaceMemberships.role, slug: s.workspaces.slug })
    .from(s.workspaceMemberships)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.workspaceMemberships.workspaceId))
    .where(eq(s.workspaceMemberships.userId, u.id));
  const m = (workspaceSlug ? members.filter((x) => x.slug === workspaceSlug) : members).find((x) => x.role === 'admin' || x.role === 'author');
  if (!m) throw new Error(`${email} não é administradora/autora${workspaceSlug ? ` no workspace ${workspaceSlug}` : ''}`);
  return { userId: u.id, workspaceId: m.workspaceId, workspaceSlug: m.slug };
}

export const SYSTEM_OWNER_EMAIL = 'importacao-cursos@sistema.invalid';

/**
 * Dono automático: o administrador mais antigo; sem nenhum, uma conta interna SEM senha (ninguém entra com ela) no
 * workspace existente, ou num workspace "DNA Work" novo quando não há nenhum. `criar-admin.ts` cria depois o acesso real.
 */
export async function autoOwner(db: Database, log: Log): Promise<CourseOwner> {
  const [admin] = await db
    .select({ userId: s.workspaceMemberships.userId, workspaceId: s.workspaceMemberships.workspaceId, slug: s.workspaces.slug })
    .from(s.workspaceMemberships)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.workspaceMemberships.workspaceId))
    .where(eq(s.workspaceMemberships.role, 'admin'))
    .orderBy(asc(s.workspaceMemberships.createdAt))
    .limit(1);
  if (admin) return { userId: admin.userId, workspaceId: admin.workspaceId, workspaceSlug: admin.slug };
  return db.transaction(async (tx) => {
    let [ws] = await tx.select({ id: s.workspaces.id, slug: s.workspaces.slug }).from(s.workspaces).orderBy(asc(s.workspaces.createdAt)).limit(1);
    if (!ws) {
      [ws] = await tx.insert(s.workspaces).values({ id: newId('wsp'), slug: 'dna-work', name: 'DNA Work', branding: { name: 'DNA Work' } }).returning({ id: s.workspaces.id, slug: s.workspaces.slug });
      log('workspace "DNA Work" criado');
    }
    let [u] = await tx.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, SYSTEM_OWNER_EMAIL)).limit(1);
    if (!u) {
      [u] = await tx.insert(s.user).values({ id: newId('usr'), email: SYSTEM_OWNER_EMAIL, name: 'Importação de cursos (sistema)', emailVerified: false }).returning({ id: s.user.id });
      log('conta interna de importação criada (sem senha; não entra no site)');
    }
    await tx.insert(s.workspaceMemberships).values({ workspaceId: ws!.id, userId: u!.id, role: 'author' }).onConflictDoNothing();
    return { userId: u!.id, workspaceId: ws!.id, workspaceSlug: ws!.slug };
  });
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

export interface ImportResult {
  assetsWritten: number;
  published: string[];
  unchanged: string[];
  failed: Array<{ title: string; error: string }>;
}

/**
 * Grava mídias e cursos do pacote em `root`. Mídia existente com o mesmo sha256 é pulada; com outro conteúdo, para tudo
 * antes de gravar. Curso novo: criado com o mesmo id e publicado; existente: versão nova só se o documento mudou.
 * Com storage local, os arquivos extraídos dentro do STORAGE_DIR são MOVIDOS (sem ocupar o disco em dobro).
 */
export async function importPackage(db: Database, opts: { root: string; owner: CourseOwner; write: boolean; allowSimulated?: boolean; log: Log }): Promise<ImportResult | null> {
  const { root, owner, write, log } = opts;
  const manifest = readPackage(root);
  const existing = new Map(
    (manifest.assets.length ? await db.select({ id: s.assets.id, sha256: s.assets.sha256 }).from(s.assets).where(inArray(s.assets.id, manifest.assets.map((a) => a.id))) : []).map((a) => [a.id, a]),
  );
  const conflicts = manifest.assets.filter((a) => existing.get(a.id)?.sha256 && existing.get(a.id)!.sha256 !== a.sha256);
  if (conflicts.length) throw new Error(`${conflicts.length} mídia(s) já existem com conteúdo diferente (ex.: ${conflicts[0]!.id}); nada foi gravado`);
  const newAssets = manifest.assets.filter((a) => !existing.has(a.id));
  log(`workspace ${owner.workspaceSlug}; ${manifest.courses.length} curso(s), ${newAssets.length} mídia(s) novas (${(newAssets.reduce((n, a) => n + a.sizeBytes, 0) / 1024 / 1024).toFixed(0)} MB), ${manifest.assets.length - newAssets.length} já presentes`);
  const docs = manifest.courses.map((c) => ({ c, doc: CourseDocumentSchema.parse(migrateCourseDocument(c.document)) }));
  for (const { c } of docs) {
    const [cur] = await db.select({ workspaceId: s.courses.workspaceId }).from(s.courses).where(eq(s.courses.id, c.id));
    if (cur && cur.workspaceId !== owner.workspaceId) throw new Error(`${c.id} já existe em outro workspace; nada foi gravado`);
    log(`  ${c.title}: ${cur ? 'já existe (nova versão só se mudou)' : 'novo'}`);
  }
  if (!write) return null;

  const storage = await getStorage();
  const localRoot = storage.provider === 'local' ? resolve(process.env.STORAGE_DIR ?? '.data/storage') : null;
  const out: ImportResult = { assetsWritten: 0, published: [], unchanged: [], failed: [] };
  for (const a of newAssets) {
    const file = join(root, 'files', a.storageKey);
    if (!existsSync(file)) throw new Error(`${a.id}: arquivo ausente no pacote (${a.storageKey})`);
    if ((await sha256File(file)) !== a.sha256) throw new Error(`${a.id}: arquivo do pacote não confere com o sha256`);
    const target = localRoot ? resolve(localRoot, a.storageKey) : null;
    if (target && target.startsWith(localRoot + '/') && file.startsWith(localRoot + '/')) {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(file, target);
    } else {
      await storage.putObject(a.storageKey, createReadStream(file), a.mimeType);
    }
    await db
      .insert(s.assets)
      .values({
        id: a.id,
        workspaceId: owner.workspaceId,
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
        createdBy: owner.userId,
        metadata: (a.metadata ?? {}) as typeof s.assets.$inferInsert.metadata,
      })
      .onConflictDoNothing();
    if (++out.assetsWritten % 200 === 0) log(`mídias: ${out.assetsWritten}/${newAssets.length}`);
  }
  log(`mídias gravadas: ${out.assetsWritten}`);

  for (const { c, doc } of docs) {
    const [cur] = await db.select().from(s.courses).where(eq(s.courses.id, c.id));
    if (!cur) {
      let slug = c.slug;
      for (let i = 2; ; i++) {
        const [taken] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, owner.workspaceId), eq(s.courses.slug, slug))).limit(1);
        if (!taken) break;
        slug = `${c.slug}-${i}`;
      }
      await db.transaction(async (tx) => {
        await tx.insert(s.courses).values({ id: c.id, workspaceId: owner.workspaceId, slug, title: doc.title || c.title, createdBy: owner.userId, trail: c.trail, posterAssetId: c.posterAssetId });
        await tx.insert(s.courseDrafts).values({ courseId: c.id, document: doc, revision: 1, updatedBy: owner.userId });
        await tx.insert(s.draftRevisions).values({ id: newId('rev'), courseId: c.id, revision: 1, document: doc, authorId: owner.userId, origin: 'import', note: `pacote de cursos (${manifest.createdAt})` });
      });
    } else {
      const [latest] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.courseId, c.id)).orderBy(desc(s.courseVersions.versionNumber)).limit(1);
      await db.update(s.courses).set({ trail: c.trail, posterAssetId: c.posterAssetId, updatedAt: new Date() }).where(eq(s.courses.id, c.id));
      if (latest && JSON.stringify(migrateCourseDocument(latest.document)) === JSON.stringify(doc)) {
        out.unchanged.push(c.title);
        log(`${c.title}: igual à versão publicada; sem mudança`);
        continue;
      }
      const draft = (await authoring.getDraft(db, c.id))!;
      await authoring.saveDraft(db, { courseId: c.id, document: doc, expectedRevision: draft.revision, userId: owner.userId, origin: 'import', note: `pacote de cursos (${manifest.createdAt})` });
    }
    try {
      const r = await publishing.publishCourse(db, { courseId: c.id, userId: owner.userId, allowSimulatedMedia: opts.allowSimulated === true });
      out.published.push(c.title);
      log(`${c.title}: publicado (versão ${r.versionNumber}, ${r.warnings.length} aviso(s))`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      out.failed.push({ title: c.title, error });
      log(`${c.title}: NÃO publicado — ${error}. O rascunho ficou gravado; publique pelo estúdio.`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Importação automática (worker)                                            */
/* ------------------------------------------------------------------------ */

/**
 * Pacote que o worker importa sozinho ao subir: repositório PÚBLICO (sem token), uma vez só. Pula quando todos os
 * cursos do pacote já existem, ou quando já houve uma importação concluída desta release (registro em audit_logs).
 * `AUTO_IMPORT_COURSES=0` desliga.
 */
export const AUTO_IMPORT = { repo: 'mfpi1209/lms-cursos-pacotes', tag: 'v2-cursos-producao', courseIds: ['crs_g3vzc9kcvbkt284c', 'crs_jjixvm66gvte13uh', 'crs_jkfzh199gekcu2hy', 'crs_k56estb8rf34g6s2', 'crs_j1pnhyikua4s5yiy'] };

export async function autoImportCourses(): Promise<void> {
  if (process.env.AUTO_IMPORT_COURSES === '0') return;
  const log: Log = (m) => console.log(`[importar-cursos] ${m}`);
  const db = getDb();
  try {
    const present = await db.select({ id: s.courses.id }).from(s.courses).where(inArray(s.courses.id, AUTO_IMPORT.courseIds));
    if (present.length === AUTO_IMPORT.courseIds.length) return;
    const [done] = await db
      .select({ id: s.auditLogs.id })
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.action, 'courses.auto_import'), eq(s.auditLogs.entityId, AUTO_IMPORT.tag)))
      .limit(1);
    if (done) return;
    log(`baixando ${AUTO_IMPORT.repo}@${AUTO_IMPORT.tag} (${AUTO_IMPORT.courseIds.length - present.length} curso(s) faltando)…`);
    const storage = await getStorage();
    const base = storage.provider === 'local' ? resolve(process.env.STORAGE_DIR ?? '.data/storage') : '/tmp';
    const dest = join(base, '.importacao-cursos');
    try {
      await downloadRelease({ repo: AUTO_IMPORT.repo, tag: AUTO_IMPORT.tag, dest, log });
      const owner = await autoOwner(db, log);
      const r = await importPackage(db, { root: packageRoot(dest), owner, write: true, log });
      await db.insert(s.auditLogs).values({
        id: newId('aud'),
        workspaceId: owner.workspaceId,
        actorId: null,
        action: 'courses.auto_import',
        entityType: 'release',
        entityId: AUTO_IMPORT.tag,
        data: { repo: AUTO_IMPORT.repo, published: r?.published ?? [], unchanged: r?.unchanged ?? [], failed: r?.failed ?? [], assets: r?.assetsWritten ?? 0 },
      });
      log(`pronto: ${r?.published.length ?? 0} publicado(s), ${r?.failed.length ?? 0} com erro`);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('[importar-cursos] FALHA (tenta de novo no próximo início do worker):', e instanceof Error ? e.message : e);
  }
}

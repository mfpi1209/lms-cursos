/**
 * Cria (ou promove) uma conta de ADMINISTRADOR. É o caminho para o primeiro acesso em um ambiente novo, já que o
 * cadastro público é desligado (`disableSignUp`) e o seed de demonstração não deve rodar em produção.
 *
 * A senha é digitada por quem roda o comando (sem aparecer na tela) e nunca é impressa. Sem terminal interativo,
 * lê de `ADMIN_PASSWORD` (apague a variável depois). Mínimo de 12 caracteres.
 *
 * Uso (no console do serviço worker, onde também rodam as migrações):
 *   pnpm --filter @lms/db exec tsx src/scripts/criar-admin.ts --email voce@empresa.com --nome "Seu Nome"
 *
 * - Workspace: usa o único existente; se não houver nenhum, cria "DNA Work" (`--workspace-nome` para outro nome);
 *   com mais de um, informe `--workspace <slug>`.
 * - Conta que já existe: vira administradora no workspace; a senha só muda com `--trocar-senha`.
 * - `--a-seco`: só mostra o que faria.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createDb } from '../client';
import { newId } from '../ids';
import * as s from '../schema';

const MIN_PASSWORD = 12;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Pergunta sem ecoar o que é digitado. */
async function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const p = process.env.ADMIN_PASSWORD ?? '';
    if (!p) throw new Error('sem terminal interativo: defina ADMIN_PASSWORD para este comando (e apague depois)');
    return p;
  }
  const a = await askHidden(`Senha (mínimo ${MIN_PASSWORD} caracteres; não aparece na tela): `);
  const b = await askHidden('Repita a senha: ');
  if (a !== b) throw new Error('as senhas não conferem');
  return a;
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

async function main() {
  const email = (arg('email') ?? '').trim().toLowerCase();
  const name = (arg('nome') ?? '').trim();
  const dry = flag('a-seco');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('informe --email com um e-mail válido');
  if (email.endsWith('@demo.local')) throw new Error('contas @demo.local são do seed de demonstração; use um e-mail real');
  if (!name) throw new Error('informe --nome "Seu Nome"');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida');

  const { db, close } = createDb(process.env.DATABASE_URL, { max: 2 });
  try {
    // workspace
    const slugArg = arg('workspace');
    const all = await db.select({ id: s.workspaces.id, slug: s.workspaces.slug, name: s.workspaces.name }).from(s.workspaces);
    let ws = slugArg ? all.find((w) => w.slug === slugArg) : all.length === 1 ? all[0] : undefined;
    if (slugArg && !ws) throw new Error(`workspace "${slugArg}" não existe; existentes: ${all.map((w) => w.slug).join(', ') || 'nenhum'}`);
    if (!ws && all.length > 1) throw new Error(`há ${all.length} workspaces; escolha um com --workspace <slug>: ${all.map((w) => w.slug).join(', ')}`);
    const wsName = arg('workspace-nome') ?? 'DNA Work';

    const [existing] = await db.select({ id: s.user.id, name: s.user.name }).from(s.user).where(eq(s.user.email, email)).limit(1);
    const changePassword = !existing || flag('trocar-senha');

    console.log(`[criar-admin] e-mail: ${email}`);
    console.log(`[criar-admin] workspace: ${ws ? `${ws.name} (${ws.slug})` : `novo: ${wsName}`}`);
    console.log(`[criar-admin] conta: ${existing ? 'já existe (vira administradora)' : 'nova'}${existing && !changePassword ? '; senha mantida' : ''}`);
    if (dry) {
      console.log('[criar-admin] a seco: nada foi gravado');
      return;
    }

    let passwordHash: string | null = null;
    if (changePassword) {
      const password = await readPassword();
      if (password.length < MIN_PASSWORD) throw new Error(`a senha precisa ter pelo menos ${MIN_PASSWORD} caracteres`);
      passwordHash = await hashPassword(password);
    }

    await db.transaction(async (tx) => {
      if (!ws) {
        const base = slugify(wsName);
        const taken = new Set(all.map((w) => w.slug));
        let slug = base;
        for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
        [ws] = await tx.insert(s.workspaces).values({ id: newId('wsp'), slug, name: wsName, branding: { name: wsName } }).returning({ id: s.workspaces.id, slug: s.workspaces.slug, name: s.workspaces.name });
      }
      let userId = existing?.id;
      if (!userId) {
        userId = newId('usr');
        await tx.insert(s.user).values({ id: userId, email, name, emailVerified: true });
      }
      if (passwordHash) {
        const [acc] = await tx.select({ id: s.account.id }).from(s.account).where(and(eq(s.account.userId, userId), eq(s.account.providerId, 'credential'))).limit(1);
        if (acc) await tx.update(s.account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(s.account.id, acc.id));
        else await tx.insert(s.account).values({ id: newId('acc'), accountId: userId, providerId: 'credential', userId, password: passwordHash });
      }
      await tx
        .insert(s.workspaceMemberships)
        .values({ workspaceId: ws!.id, userId, role: 'admin' })
        .onConflictDoUpdate({ target: [s.workspaceMemberships.workspaceId, s.workspaceMemberships.userId], set: { role: 'admin' } });
      await tx.insert(s.auditLogs).values({ id: newId('aud'), actorId: null, action: 'admin.create', entityType: 'user', entityId: userId, data: { email, workspaceId: ws!.id, via: 'criar-admin' } });
    });
    console.log(`[criar-admin] pronto: ${email} é administradora em ${ws!.name}. Entre pelo site com esse e-mail e a senha digitada.`);
  } finally {
    await close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[criar-admin] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  },
);

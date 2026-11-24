/**
 * Importa um pacote de cursos gerado por `cursos-exportar.ts` (ex.: levar os cursos de desenvolvimento para produção).
 * Roda no console do serviço worker. O worker também importa sozinho o pacote público de `AUTO_IMPORT` ao subir
 * (ver `course-import.ts`); este comando serve para outros pacotes ou para refazer à mão.
 *
 * De onde vem o pacote:
 *  - `--release <tag>` (`--repo`, padrão mfpi1209/lms-cursos-pacotes, público): baixa e confere pelo SHA256SUMS.
 *    Repositório privado: `--privado` pede um token do GitHub só de leitura (sem eco; ou `GITHUB_TOKEN`).
 *  - `--pasta <dir>`: um pacote já extraído (manifest.json + files/).
 * Dono dos cursos: `--admin <e-mail>` (conta de administrador/autor); sem ele, o dono automático (o administrador
 * mais antigo, ou a conta interna de importação).
 * Sem `--gravar`, só mostra o plano. Não apaga nada, não mexe em matrículas e pode rodar de novo sem duplicar.
 *
 *   pnpm --filter @lms/worker exec tsx src/scripts/cursos-importar.ts --release v2-cursos-producao --admin voce@empresa.com --gravar
 */
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { Writable } from 'node:stream';
import { getDb } from '@lms/db';
import { autoOwner, downloadRelease, importPackage, ownerByEmail, packageRoot } from '../course-import';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const log = (m: string) => console.log(`[importar] ${m}`);

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

async function main() {
  const release = arg('release');
  let dir = arg('pasta');
  if (!dir && !release) throw new Error('informe --release <tag> ou --pasta <pacote extraído>');
  if (release) {
    let token = process.env.GITHUB_TOKEN?.trim();
    if (flag('privado') && !token) {
      if (!process.stdin.isTTY) throw new Error('repositório privado: defina GITHUB_TOKEN');
      token = await askHidden('Token do GitHub (só leitura; não aparece na tela): ');
    }
    dir = resolve(arg('baixar-em') ?? '/tmp/lms-pacote-cursos');
    await downloadRelease({ repo: arg('repo') ?? 'mfpi1209/lms-cursos-pacotes', tag: release, dest: dir, ...(token ? { token } : {}), log });
  }
  const db = getDb();
  const email = arg('admin');
  const owner = email ? await ownerByEmail(db, email, arg('workspace')) : await autoOwner(db, log);
  const r = await importPackage(db, { root: packageRoot(dir!), owner, write: flag('gravar'), allowSimulated: flag('aceitar-simulado'), log });
  if (!r) log('a seco: nada foi gravado. Rode de novo com --gravar.');
  else log(`pronto: ${r.published.length} publicado(s), ${r.unchanged.length} sem mudança, ${r.failed.length} com erro`);
  if (release) rmSync(dir!, { recursive: true, force: true });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[importar] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  },
);

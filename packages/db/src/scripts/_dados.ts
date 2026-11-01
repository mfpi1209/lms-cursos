import { createDb } from '../client';

/** Apoio dos scripts de direitos do titular (`dados:*`) e de `acesso:consultar`. */
export function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  const withValue = new Set(['--saida', '--motivo', '--desde', '--limite', '--motivo-encerramento']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (withValue.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} pede um valor`);
      values.set(a, v);
    } else if (a.startsWith('--')) flags.add(a);
    else positional.push(a);
  }
  return { flags, values, positional };
}

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida (carregue o .env ou defina a variável)');
  return createDb(url, { max: 2 });
}

/** Roda `fn` com a conexão e sai com código 1 em erro, com mensagem curta (sem stack, sem dados pessoais). */
export async function runScript(fn: (ctx: ReturnType<typeof connect>) => Promise<void>) {
  let ctx: ReturnType<typeof connect> | null = null;
  try {
    ctx = connect();
    await fn(ctx);
  } catch (e) {
    console.error(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    await ctx?.close();
  }
}

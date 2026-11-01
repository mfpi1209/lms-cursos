import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LegalDoc } from './documents';

/** Só no servidor (usa o disco). As constantes e os links, que também vão ao navegador, ficam em `documents.ts`. */
/**
 * Lê o markdown. Caminhos tentados: a pasta do app em desenvolvimento e no build (cwd = apps/web) e a raiz do monorepo
 * (cwd = raiz). No servidor de produção (standalone), `next.config.ts` inclui `src/content/legal/**` no rastreamento.
 */
export function readLegalSource(doc: LegalDoc, cwd: string = process.cwd()): string {
  const candidates = [path.join(cwd, 'src/content/legal', doc.file), path.join(cwd, 'apps/web/src/content/legal', doc.file)];
  let last: unknown;
  for (const p of candidates) {
    try {
      return readFileSync(p, 'utf8');
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`texto legal não encontrado (${doc.file}): ${last instanceof Error ? last.message : String(last)}`);
}

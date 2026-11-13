/**
 * Aplica um arquivo de telas simuladas (`docs/roteiros/telas/<roteiro>.telas.md`) num rascunho EXISTENTE, sem
 * reimportar: para cada gravação de tela do rascunho, troca o `mock` pelo da seção `gravacao_x@CENA` ou `gravacao_x`;
 * se o mock mudou, zera `assetId`/`durationSec`/`fit` da gravação gerada (`source: 'mock'`) para ser gerada de novo.
 * Gravação enviada à mão (`source: 'upload'`) não é tocada. Sem custo.
 *   tsx packages/db/src/scripts/aplicar-telas.ts --course <id> --file docs/roteiros/telas/<roteiro>.telas.md [--seco]
 */
import { readFileSync } from 'node:fs';
import { parseScreenMocksMarkdown } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const courseId = get('--course'); const file = get('--file'); const seco = argv.includes('--seco');
  if (!courseId || !file) throw new Error('uso: --course <id> --file <arquivo.telas.md> [--seco]');
  const { mocks, issues } = parseScreenMocksMarkdown(readFileSync(file, 'utf8'));
  if (issues.length) { for (const i of issues) console.log(`[aplicar-telas] aviso ${i.code}${i.line ? ` (linha ${i.line})` : ''}: ${i.message}`); }
  const lookup = new Map([...mocks].map(([k, v]) => [k.toLowerCase(), v]));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId))!;
    const doc = structuredClone(draft.document) as unknown as { modules: Array<{ lessons: Array<{ id: string; graph: { nodes: Array<{ id: string; screenRecordings?: Array<Record<string, unknown>> }> } }> }> };
    let changed = 0, same = 0, missing = 0, skipped = 0;
    for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) for (const r of n.screenRecordings ?? []) {
      if (r.source === 'upload') { skipped++; continue; }
      const base = String(r.fileName ?? '').replace(/\.mp4$/i, '').toLowerCase();
      const mock = lookup.get(`${base}@${n.id.toLowerCase()}`) ?? lookup.get(base);
      if (!mock) { missing++; console.log(`[aplicar-telas]   sem tela: ${l.id}/${n.id} ${r.fileName}`); continue; }
      if (stable(mock) === stable(r.mock)) { same++; continue; }
      r.mock = mock; r.source = 'mock'; delete r.assetId; delete r.durationSec; delete r.fit; changed++;
      console.log(`[aplicar-telas]   atualizada ${l.id}/${n.id} ${r.fileName}`);
    }
    console.log(`[aplicar-telas] resumo: ${changed} atualizada(s), ${same} igual(is), ${missing} sem tela, ${skipped} enviada(s) à mão`);
    if (seco || changed === 0) { console.log('[aplicar-telas] nada gravado'); return; }
    const r = await saveDraft(db, { courseId, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `telas simuladas: ${file}` });
    console.log(`[aplicar-telas] revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });

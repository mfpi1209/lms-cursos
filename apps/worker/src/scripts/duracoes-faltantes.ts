/**
 * Pendências de duração: vídeos usados nas versões publicadas sem `assets.duration_seconds`. Lê a duração do arquivo
 * (ffprobe, no backend; storage local) e grava no asset. Sem arquivo ou sem leitura: lista como pendente (a tela
 * mostra "Duração indisponível" até resolver). Grátis.
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/duracoes-faltantes.ts [--apply]
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@lms/db';

const APPLY = process.argv.includes('--apply');
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');

async function main() {
  const db = getDb();
  const rows = (await db.execute(sql`
    with v as (select v.document d from course_versions v join courses c on c.id = v.course_id and v.version_number = c.latest_version_number),
    n as (select nd from v, jsonb_path_query(v.d, 'lax $.modules[*].lessons[*].graph.nodes[*]') nd),
    ids as (
      select nd->'media'->>'assetId' a from n where nd->'media'->>'kind' = 'video'
      union select o->'reaction'->'media'->>'assetId' from n, jsonb_array_elements(case when jsonb_typeof(nd->'options') = 'array' then nd->'options' else '[]'::jsonb end) o where o->'reaction'->'media'->>'kind' = 'video')
    select ids.a as id, a.storage_key as key from ids left join assets a on a.id = ids.a where a.duration_seconds is null`)) as unknown as Array<{ id: string; key: string | null }>;
  const list = Array.isArray(rows) ? rows : ((rows as unknown as { rows: Array<{ id: string; key: string | null }> }).rows ?? []);
  if (!list.length) return console.log('[duração] nenhuma pendência: todos os vídeos publicados têm duração');
  for (const r of list) {
    const file = r.key ? path.join(STORAGE, r.key) : '';
    if (!file || !existsSync(file)) { console.log(`[duração] PENDENTE ${r.id}: arquivo não encontrado no storage local`); continue; }
    try {
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
      if (!(d > 0)) throw new Error('duração inválida');
      if (APPLY) await db.execute(sql`update assets set duration_seconds = ${d} where id = ${r.id}`);
      console.log(`[duração] ${r.id}: ${d.toFixed(2)} s${APPLY ? ' (gravado)' : ''}`);
    } catch (e) {
      console.log(`[duração] PENDENTE ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(`[duração] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

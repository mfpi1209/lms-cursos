/**
 * Escopo do dono (01/11): C15, C16, C18, C19, C21, C22 NÃO levam a fala de fecho (partes 1 e 2 das trilhas).
 * Grátis: copia o nó `despedida` da versão publicada ANTERIOR à do fecho (mídia, sceneHash, direção e fala iguais)
 * para o rascunho, só esse nó. Confere que o resto do rascunho == versão publicada atual e que o nó restaurado == versão anterior.
 *   set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/fecho-reverter.ts [--apply]
 */
import { authoring, getDb, schema } from '@lms/db';
import { and, desc, eq } from 'drizzle-orm';
import type { CourseDocument } from '@lms/course-schema';

const ALVOS: Record<string, { id: string; lesson: string }> = {
  C15: { id: 'crs_t303ykqfmhj3yb1g', lesson: 'aula_03' }, C16: { id: 'crs_2rt2rsoii8bpydp2', lesson: 'aula_03' },
  C18: { id: 'crs_tg9iqz8wmmf5pw77', lesson: 'aula_03' }, C19: { id: 'crs_au1463izc386by27', lesson: 'aula_03' },
  C21: { id: 'crs_4jh683s5h351z2db', lesson: 'aula_03' }, C22: { id: 'crs_njtlqq7y7fyfeqcr', lesson: 'aula_03' },
};
const APPLY = process.argv.includes('--apply');
const node = (doc: CourseDocument, lesson: string) => doc.modules.flatMap((m) => m.lessons).find((l) => l.id === lesson)!.graph.nodes.find((n) => n.id === 'despedida') as unknown as Record<string, any>;
const estavel = (v: unknown): unknown => Array.isArray(v) ? v.map(estavel) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, estavel((v as any)[k])])) : v;
const sem = (doc: CourseDocument, lesson: string) => { const d = structuredClone(doc); const n = node(d, lesson); for (const k of Object.keys(n)) delete n[k]; return JSON.stringify(estavel(d)); };

async function main() {
  const db = getDb();
  for (const [cod, { id, lesson }] of Object.entries(ALVOS)) {
    const vs = await db.select().from(schema.courseVersions).where(eq(schema.courseVersions.courseId, id)).orderBy(desc(schema.courseVersions.versionNumber)).limit(2);
    const [cur, prev] = vs;
    if (!cur || !prev) throw new Error(`${cod}: sem versão anterior`);
    const d = (await authoring.getDraft(db, id))!;
    const dn = node(d.document as CourseDocument, lesson);
    const pn = node(prev.document as CourseDocument, lesson);
    const cn = node(cur.document as CourseDocument, lesson);
    if (!dn.direction.shots.some((s: any) => s.id === 'fecho')) { console.log(`${cod}: rascunho já sem fecho`); continue; }
    if (pn.direction.shots.some((s: any) => s.id === 'fecho')) throw new Error(`${cod}: a versão ${prev.versionNumber} já tem fecho`);
    if (sem(d.document as CourseDocument, lesson) !== sem(cur.document as CourseDocument, lesson)) throw new Error(`${cod}: o resto do rascunho difere da versão ${cur.versionNumber}`);
    if (sem(prev.document as CourseDocument, lesson) !== sem(cur.document as CourseDocument, lesson)) throw new Error(`${cod}: o resto da versão ${prev.versionNumber} difere da ${cur.versionNumber}`);
    console.log(`${cod}: v${cur.versionNumber} (fecho, asset ${cn.media.assetId}) -> restaura nó da v${prev.versionNumber} (asset ${pn.media.assetId}, hash ${String(pn.media.generatedFrom?.sceneHash).slice(0, 10)}, stale=${pn.media.stale})`);
    if (!APPLY) continue;
    const doc = structuredClone(d.document) as CourseDocument;
    const alvo = node(doc, lesson);
    for (const k of Object.keys(alvo)) delete alvo[k];
    Object.assign(alvo, structuredClone(pn));
    const saved = await authoring.saveDraft(db, { courseId: id, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `fecho removido (escopo do dono: parte 1/2 de trilha): despedida da v${prev.versionNumber}` } as never);
    console.log(`${cod}: rascunho ${d.revision} -> ${saved.revision}`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

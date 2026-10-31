/**
 * A15: nivela o VOLUME dos vídeos já anexados a cursos (nada pago, nenhum provedor) em −16 LUFS,
 * o mesmo alvo que o compositor passou a usar em todo vídeo novo (`normalizeLoudnessInPlace`).
 *
 * Para cada vídeo do rascunho (cenas e reações às respostas):
 *  - já em −16 LUFS (metadata.loudness, ou medido): pula;
 *  - cópia antiga do curso 12 (metadata.loudnorm, −20 LUFS): refaz a partir do ORIGINAL dela;
 *  - senão: copia o asset, normaliza (vídeo copiado sem recodificar), cria um asset novo e troca no rascunho.
 * Legendas, transcrição e `generatedFrom` ficam como estão. Idempotente.
 *
 * Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/normalizar-volume.ts <curso> [<curso>…] [--dry-run]
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, authoring, media } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { LOUDNESS_TARGET, LOUDNESS_TOLERANCE_LU, measureLoudness, normalizeLoudnessInPlace } from '@lms/media/compose';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const COURSES = args.filter((a) => !a.startsWith('--'));
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');

type Ref = { where: string; media: { assetId: string; kind: string } };

function videoRefs(doc: CourseDocument): Ref[] {
  const out: Ref[] = [];
  for (const m of doc.modules)
    for (const l of m.lessons)
      for (const n of l.graph.nodes) {
        const node = n as unknown as { id: string; media?: Ref['media']; options?: { id: string; reaction?: { media?: Ref['media'] } }[] };
        if (node.media?.kind === 'video') out.push({ where: `${l.id}/${node.id}`, media: node.media });
        for (const o of node.options ?? []) if (o.reaction?.media?.kind === 'video') out.push({ where: `${l.id}/${node.id}~${o.id}`, media: o.reaction.media });
      }
  return out;
}

const atTarget = (i: number | null | undefined) => typeof i === 'number' && Math.abs(i - LOUDNESS_TARGET.I) <= LOUDNESS_TOLERANCE_LU;

async function course(db: ReturnType<typeof createDb>['db'], courseId: string, tmp: string) {
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) throw new Error(`rascunho de ${courseId} não encontrado`);
  const refs = videoRefs(draft.document as CourseDocument);
  const swaps = new Map<string, string>();
  let ok = 0;
  const lows: string[] = [];
  for (const ref of refs) {
    if (swaps.has(ref.media.assetId)) continue;
    const cur = await media.getAsset(db, ref.media.assetId);
    if (!cur) { console.log(`[vol] ${courseId} ${ref.where}: asset ${ref.media.assetId} não existe; pulado`); continue; }
    const meta = (cur.metadata ?? {}) as Record<string, any>;
    if (atTarget(meta.loudness?.outputI)) { ok++; continue; }
    // cópia do 12-normalizar (−20): volta ao original para não recodificar o áudio duas vezes
    const src = meta.loudnorm?.from ? ((await media.getAsset(db, meta.loudnorm.from)) ?? cur) : cur;
    const file = path.join(tmp, `${src.id}.mp4`);
    await copyFile(path.join(STORAGE, src.storageKey), file);
    if (!meta.loudnorm) {
      const m = await measureLoudness(file);
      if (atTarget(Number(m?.input_i))) { ok++; await rm(file, { force: true }); continue; }
    }
    if (DRY) { const m = await measureLoudness(file); console.log(`[vol] ${courseId} ${ref.where}: ${m?.input_i} LUFS → ${LOUDNESS_TARGET.I}`); swaps.set(cur.id, cur.id); continue; }
    const r = await normalizeLoudnessInPlace(file);
    if (!r.changed) { ok++; continue; }
    if (r.low) lows.push(`${ref.where} (${r.outputI})`);
    const buf = await readFile(file);
    const sha = createHash('sha256').update(buf).digest('hex');
    const key = `${src.workspaceId}/video/${sha.slice(0, 2)}/${sha}.mp4`;
    await mkdir(path.dirname(path.join(STORAGE, key)), { recursive: true });
    await rename(file, path.join(STORAGE, key));
    const { loudnorm: _old, loudness: _l, ...rest } = (src.metadata ?? {}) as Record<string, unknown>;
    void _old; void _l;
    const row = await media.createAsset(db, {
      workspaceId: src.workspaceId, kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: (await stat(path.join(STORAGE, key))).size,
      storageProvider: src.storageProvider, storageKey: key, sha256: sha,
      ...(src.durationSeconds != null ? { durationSeconds: src.durationSeconds } : {}),
      ...(src.transcript ? { transcript: src.transcript } : {}),
      ...(src.createdBy ? { createdBy: src.createdBy } : {}),
      ...(src.originalName ? { originalName: src.originalName } : {}),
      metadata: { ...rest, loudness: { ...r, from: src.id } } as never,
    });
    swaps.set(cur.id, row.id);
  }
  const n = [...swaps.entries()].filter(([a, b]) => a !== b).length;
  if (DRY) return console.log(`[vol] ${courseId}: ${refs.length} vídeos, ${ok} já no alvo, ${swaps.size} a nivelar (--dry-run)`);
  if (!n) return console.log(`[vol] ${courseId}: ${refs.length} vídeos, todos já em ${LOUDNESS_TARGET.I} LUFS`);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const d = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d.document) as CourseDocument;
    let k = 0;
    for (const ref of videoRefs(doc)) {
      const to = swaps.get(ref.media.assetId);
      if (to && to !== ref.media.assetId) { ref.media.assetId = to; k++; }
    }
    try {
      const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `volume nivelado (${LOUDNESS_TARGET.I} LUFS) em ${k} vídeo(s)` });
      console.log(`[vol] ${courseId}: ${refs.length} vídeos, ${k} nivelados, ${ok} já no alvo; rascunho ${d.revision} → ${saved.revision}${lows.length ? ` | ainda baixos: ${lows.join(', ')}` : ''}`);
      return;
    } catch (e) {
      console.log(`[vol] ${courseId}: conflito na revisão ${d.revision}; tentando de novo (${String(e).slice(0, 80)})`);
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
  throw new Error(`${courseId}: não consegui gravar o rascunho após 5 tentativas`);
}

async function main() {
  if (!COURSES.length) throw new Error('uso: normalizar-volume.ts <curso> [<curso>…] [--dry-run]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const tmp = await mkdtemp(path.join(tmpdir(), 'lms-vol-'));
  try {
    for (const c of COURSES) await course(db, c, tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await close();
  }
}

main().catch((e) => { console.error(`[vol] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

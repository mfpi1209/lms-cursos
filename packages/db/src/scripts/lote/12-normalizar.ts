/**
 * Lote 12 (Helena): normaliza o VOLUME dos vídeos do curso (nada pago, nenhum provedor).
 * Para cada vídeo no rascunho (cenas e reações às respostas) cujo asset ainda não foi normalizado:
 *   ffmpeg loudnorm em 2 passadas (−20 LUFS, pico −1,5 dBTP, LRA 11), sempre a partir do ORIGINAL, vídeo copiado sem recodificar;
 *   cria um asset novo (mesma transcrição/duração, metadata.loudnorm = origem e medidas) e troca o
 *   assetId no rascunho, mantendo legendas, transcrição e `generatedFrom`.
 * Idempotente: asset já no alvo é pulado; normalizado com outro alvo é refeito do original. Reações ainda sem vídeo ficam para a próxima rodada.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/12-normalizar.ts [--dry-run]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { createAsset, getAsset } from '../../repositories/media';

const COURSE = 'crs_5vccpfypr6fmxojb';
/** −20 LUFS: o nível dos outros 13 cursos (o alvo único de todos fica para o item A15) */
const TARGET = { I: -20, TP: -1.5, LRA: 11 };
const DRY = process.argv.includes('--dry-run');
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');
const TMP = path.resolve(process.env.TMPDIR ?? '/tmp');

type Ref = { where: string; media: { assetId: string; kind: string } };

/** todos os vídeos do rascunho: mídia de nós e reações das alternativas */
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

function analyze(file: string): Record<string, string> {
  const proc = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-i', file, '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt: string = proc.stderr ?? '';
  const j = txt.slice(txt.lastIndexOf('{'), txt.lastIndexOf('}') + 1);
  if (!j) throw new Error(`não consegui medir o volume de ${file}`);
  return JSON.parse(j) as Record<string, string>;
}

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE))!;
    const refs = videoRefs(draft.document as CourseDocument);
    const swaps = new Map<string, string>(); // assetId antigo → novo
    for (const ref of refs) {
      if (swaps.has(ref.media.assetId)) continue;
      const cur = await getAsset(db, ref.media.assetId);
      if (!cur) throw new Error(`asset ${ref.media.assetId} (${ref.where}) não existe`);
      const curNorm = ((cur.metadata ?? {}) as Record<string, any>).loudnorm as { from: string; target: { I: number } } | undefined;
      if (curNorm?.target?.I === TARGET.I) { console.log(`[vol] ${ref.where}: já em ${TARGET.I} LUFS (${cur.id})`); continue; }
      // normalizado com outro alvo: refaz a partir do ORIGINAL
      const a = curNorm ? await getAsset(db, curNorm.from) : cur;
      if (!a) throw new Error(`original ${curNorm?.from} de ${cur.id} não existe`);
      const { loudnorm: _old, ...meta } = (a.metadata ?? {}) as Record<string, unknown>;
      void _old;
      // a mesma origem pode já ter sido normalizada com este alvo numa rodada anterior
      const [prev] = await db.select().from(s.assets).where(eq(s.assets.workspaceId, a.workspaceId)).then((rows) => rows.filter((r) => { const l = ((r.metadata ?? {}) as Record<string, any>).loudnorm; return l?.from === a.id && l?.target?.I === TARGET.I; }));
      if (prev) { swaps.set(cur.id, prev.id); console.log(`[vol] ${ref.where}: reaproveita ${prev.id}`); continue; }
      const src = path.join(STORAGE, a.storageKey);
      const m1 = analyze(src);
      console.log(`[vol] ${ref.where}: ${a.id} entrada ${m1.input_i} LUFS, pico ${m1.input_tp} dBTP`);
      if (DRY) continue;
      const tmp = path.join(TMP, `vol-${a.id}.mp4`);
      const af = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true:print_format=json`;
      execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-i', src, '-map', '0', '-c:v', 'copy', '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp], { stdio: 'inherit' });
      const m2 = analyze(tmp);
      const buf = readFileSync(tmp);
      const sha = createHash('sha256').update(buf).digest('hex');
      const key = `${a.workspaceId}/video/${sha.slice(0, 2)}/${sha}.mp4`;
      mkdirSync(path.dirname(path.join(STORAGE, key)), { recursive: true });
      execFileSync('mv', [tmp, path.join(STORAGE, key)]);
      const row = await createAsset(db, {
        workspaceId: a.workspaceId, kind: 'video', source: 'generated', mimeType: a.mimeType, sizeBytes: statSync(path.join(STORAGE, key)).size,
        storageProvider: a.storageProvider, storageKey: key, sha256: sha,
        ...(a.durationSeconds != null ? { durationSeconds: a.durationSeconds } : {}),
        ...(a.transcript ? { transcript: a.transcript } : {}),
        ...(a.createdBy ? { createdBy: a.createdBy } : {}),
        ...(a.originalName ? { originalName: a.originalName } : {}),
        metadata: { ...meta, loudnorm: { from: a.id, target: TARGET, inputI: Number(m1.input_i), inputTP: Number(m1.input_tp), outputI: Number(m2.input_i), outputTP: Number(m2.input_tp) } } as never,
      });
      swaps.set(cur.id, row.id);
      console.log(`[vol] ${ref.where}: ${a.id} → ${row.id} (${m2.input_i} LUFS, pico ${m2.input_tp} dBTP)`);
    }
    if (DRY || !swaps.size) return console.log(`[vol] ${DRY ? '--dry-run: nada gravado' : 'nada a trocar'}`);
    // troca no rascunho (tenta de novo se outra sessão/worker gravou no meio)
    for (let attempt = 1; attempt <= 5; attempt++) {
      const d = (await getDraft(db, COURSE))!;
      const doc = structuredClone(d.document) as CourseDocument;
      let n = 0;
      for (const ref of videoRefs(doc)) {
        const to = swaps.get(ref.media.assetId);
        if (to) { ref.media.assetId = to; n++; }
      }
      if (!n) return console.log('[vol] rascunho já usa os assets normalizados');
      try {
        const r = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `volume normalizado (${TARGET.I} LUFS) em ${n} vídeo(s)` });
        return console.log(`[vol] rascunho ${d.revision} → ${r.revision}: ${n} vídeo(s) trocados`);
      } catch (e) {
        console.log(`[vol] conflito na revisão ${d.revision} (${String(e).slice(0, 80)}); tentando de novo`);
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    throw new Error('não consegui gravar o rascunho após 5 tentativas');
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(`[vol] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

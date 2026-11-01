/**
 * Acabamento de áudio e vídeo dos cursos (grátis, local; nada pago):
 *  1. CENAS COM AJUSTE FINO: remonta com as emendas novas (fusão onde algo foi tirado, micro-fades nas junções)
 *     e a limpeza de voz do compositor. Tira os cortes NO MEIO de frase (`cut[plano].skip`), devolvendo as
 *     palavras, exceto quando o trecho tirado é uma FRASE INTEIRA (pontuação final antes e no fim dele).
 *  2. DEMAIS VÍDEOS (cenas sem ajuste, vídeo próprio das perguntas, reações): só o áudio, limpeza de voz +
 *     volume −16 LUFS; a imagem é copiada sem recodificar, legendas e tempos ficam. Pula o que já foi limpo
 *     (`metadata.loudness.voiceClean`).
 *  3. Fala da cena = soma dos planos (cenas remontadas).
 *
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/acabamento-lote.ts <curso>… [--so=aula/no,…] [--dry-run] [--log=arquivo]
 */
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import { SceneDirectionSchema, type CourseDocument } from '@lms/course-schema';
import type { AdjustState } from '@lms/media';
import { unpackWords, type PackedWords } from '../narration';
import { VOICE_CLEANUP_VERSION, normalizeLoudnessInPlace } from '@lms/media/compose';
import { adjustScene } from '../adjust';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[acabamento] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (o lote é local e grátis)');
  process.exit(1);
}
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = new Set((args.find((a) => a.startsWith('--so='))?.slice(5) ?? '').split(',').filter(Boolean));
const LOG = args.find((a) => a.startsWith('--log='))?.slice(6);
/** corta a última frase do plano `boasvindas` quando ela é a promessa do Selo (decisão do usuário: o Selo passa a ser por trilha) */
const SELO = args.includes('--selo');
const SELO_RE = /^e ainda ganha o selo de competencia dna work/;
const COURSES = args.filter((a) => !a.startsWith('--'));
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');
const log = (m: string) => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  if (LOG) appendFileSync(LOG, line + '\n');
};

type MediaRef = { kind?: string; assetId?: string; adjust?: AdjustState & { baseLines?: unknown }; generatedFrom?: { jobId?: string } };
type NodeLike = { id: string; type: string; narration?: string; direction?: { shots: Array<{ id: string; line: string }> }; media?: MediaRef | null; options?: Array<{ id: string; reaction?: { media?: MediaRef } }> };
const words = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const want = (lessonId: string, nodeId: string) => !ONLY.size || ONLY.has(`${lessonId}/${nodeId}`);

/** O trecho [a, b] é uma frase inteira? (a palavra antes termina em . ! ? e a última do trecho também) */
function wholeSentence(ws: ReadonlyArray<{ text: string }>, a: number, b: number): boolean {
  const ends = (t: string | undefined) => !!t && /[.!?…]["”»]?$/.test(t.trim());
  return (a === 0 || ends(ws[a - 1]?.text)) && ends(ws[b]?.text);
}

async function skipPlan(courseId: string, lessonId: string, n: NodeLike) {
  const adj = n.media?.adjust;
  const out: Array<{ shotId: string; text: string; keep: boolean }> = [];
  if (!adj) return out;
  const job = n.media?.generatedFrom?.jobId ? await media.getJob(getDb(), n.media.generatedFrom.jobId) : null;
  const input = job?.input as { units?: Array<{ id: string; shotIds: string[] }>; shots?: Record<string, { words?: unknown }> } | undefined;
  for (const [shotId, c] of Object.entries(adj.cut ?? {})) {
    for (const [a, b] of c.skip ?? []) {
      const u = input?.units?.find((x) => x.shotIds.length === 1 && x.shotIds[0] === shotId);
      const ws = u ? unpackWords(input?.shots?.[u.id]?.words as PackedWords | undefined) ?? [] : [];
      const text = ws.slice(a, b + 1).map((w: { text: string }) => w.text).join(' ');
      out.push({ shotId, text: text || `${a}–${b}`, keep: ws.length > 0 && wholeSentence(ws, a, b) });
    }
  }
  void courseId; void lessonId;
  return out;
}

/** O plano `boasvindas` termina com a frase do Selo? (confere pelas palavras da gravação, já com os cortes atuais) */
async function seloCut(n: NodeLike): Promise<boolean> {
  const adj = n.media?.adjust;
  if (!adj || !n.direction?.shots.some((s) => s.id === 'boasvindas')) return false;
  const c = adj.cut?.boasvindas;
  const job = n.media?.generatedFrom?.jobId ? await media.getJob(getDb(), n.media.generatedFrom.jobId) : null;
  const input = job?.input as { units?: Array<{ id: string; shotIds: string[] }>; shots?: Record<string, { words?: unknown }> } | undefined;
  const u = input?.units?.find((x) => x.shotIds.length === 1 && x.shotIds[0] === 'boasvindas');
  const ws = u ? unpackWords(input?.shots?.[u.id]?.words as PackedWords | undefined) ?? [] : [];
  if (!ws.length || (c?.last ?? 0) > 0) return false;
  // frases da gravação; a última precisa ser a do Selo e precisa sobrar pelo menos uma antes dela
  const text = ws.map((w: { text: string }) => w.text).join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.length >= 2 && SELO_RE.test(words(sentences[sentences.length - 1]!));
}

async function cleanAudioAsset(assetId: string, tmp: string): Promise<string | null> {
  const db = getDb();
  const cur = await media.getAsset(db, assetId);
  if (!cur) return null;
  const meta = (cur.metadata ?? {}) as { loudness?: { voiceClean?: string } };
  if (meta.loudness?.voiceClean) return null;
  const file = path.join(tmp, `${cur.id}.mp4`);
  await copyFile(path.join(STORAGE, cur.storageKey), file);
  const r = await normalizeLoudnessInPlace(file);
  if (!r.changed) { await rm(file, { force: true }); return null; }
  const buf = await readFile(file);
  const sha = createHash('sha256').update(buf).digest('hex');
  const key = `${cur.workspaceId}/video/${sha.slice(0, 2)}/${sha}.mp4`;
  await mkdir(path.dirname(path.join(STORAGE, key)), { recursive: true });
  await rename(file, path.join(STORAGE, key));
  const row = await media.createAsset(db, {
    workspaceId: cur.workspaceId, kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: (await stat(path.join(STORAGE, key))).size,
    storageProvider: cur.storageProvider, storageKey: key, sha256: sha,
    ...(cur.durationSeconds != null ? { durationSeconds: cur.durationSeconds } : {}),
    ...(cur.transcript ? { transcript: cur.transcript } : {}),
    ...(cur.createdBy ? { createdBy: cur.createdBy } : {}),
    metadata: { ...((cur.metadata ?? {}) as Record<string, unknown>), loudness: { inputI: r.inputI, outputI: r.outputI, outputTP: r.outputTP, voiceClean: VOICE_CLEANUP_VERSION, from: cur.id } },
  } as never);
  return row.id;
}

async function course(courseId: string, tmp: string, report: string[]) {
  const db = getDb();
  let draft = (await authoring.getDraft(db, courseId))!;
  const doc0 = draft.document as CourseDocument;
  // 1. cenas com ajuste fino: remontar (sem os cortes no meio de frase, exceto frase inteira)
  const remounted = new Set<string>();
  for (const m of doc0.modules)
    for (const l of m.lessons)
      for (const n0 of l.graph.nodes) {
        const n = n0 as unknown as NodeLike;
        if (!n.media?.adjust || !n.direction || !want(l.id, n.id)) continue;
        const skips = await skipPlan(courseId, l.id, n);
        const selo = SELO && (await seloCut(n));
        if (selo) report.push(`${courseId} ${l.id}/${n.id} boasvindas: corta a última frase (Selo)`);
        for (const k of skips) report.push(`${courseId} ${l.id}/${n.id} ${k.shotId}: corte no meio "${k.text}" → ${k.keep ? 'MANTIDO (frase inteira)' : 'devolvido'}`);
        if (DRY) { log(`[remontar] ${courseId} ${l.id}/${n.id}${skips.length ? ` (cortes no meio: ${skips.length})` : ''}`); continue; }
        try {
          const r = await adjustScene({
            courseId, lessonId: l.id, nodeId: n.id, request: {},
            remount: {
              state: (cur) => ({
                ...cur,
                cut: Object.fromEntries(Object.entries(selo ? { ...cur.cut, boasvindas: { first: 0, ...(cur.cut.boasvindas ?? {}), last: 1 } } : cur.cut).map(([id, c]) => {
                  const whole = skips.filter((k) => k.shotId === id && k.keep).length;
                  const { skip, ...rest } = c;
                  // frase inteira: fica; meio de frase: sai (as palavras voltam)
                  return [id, whole && skip ? { ...rest, skip: skip.filter((_, i) => skips.filter((k) => k.shotId === id)[i]?.keep) } : rest];
                })),
              }),
            },
          });
          remounted.add(`${l.id}/${n.id}`);
          log(`[remontar] ${courseId} ${l.id}/${n.id}: ${r.durationSeconds.toFixed(1)} s, ${r.loudness?.outputI ?? '?'} LUFS`);
        } catch (e) {
          log(`[remontar] ${courseId} ${l.id}/${n.id}: FALHOU (${e instanceof Error ? e.message : String(e)})`);
        }
      }
  // 2. demais vídeos: só o áudio
  draft = (await authoring.getDraft(db, courseId))!;
  const doc = structuredClone(draft.document) as CourseDocument;
  const swaps = new Map<string, string | null>();
  let changed = 0;
  for (const m of doc.modules)
    for (const l of m.lessons)
      for (const n0 of l.graph.nodes) {
        const n = n0 as unknown as NodeLike;
        const refs: MediaRef[] = [];
        if (n.media?.kind === 'video' && n.media.assetId && !remounted.has(`${l.id}/${n.id}`) && !n.media.adjust) refs.push(n.media);
        for (const o of n.options ?? []) if (o.reaction?.media?.kind === 'video' && o.reaction.media.assetId) refs.push(o.reaction.media);
        if (!want(l.id, n.id)) continue;
        for (const ref of refs) {
          const id = ref.assetId!;
          if (!swaps.has(id)) {
            if (DRY) { swaps.set(id, null); log(`[áudio] ${courseId} ${l.id}/${n.id}: ${id}`); continue; }
            try {
              swaps.set(id, await cleanAudioAsset(id, tmp));
            } catch (e) {
              swaps.set(id, null);
              log(`[áudio] ${courseId} ${l.id}/${n.id}: FALHOU ${id} (${e instanceof Error ? e.message : String(e)})`);
            }
          }
          const to = swaps.get(id);
          if (to) { ref.assetId = to; changed++; }
        }
        // 3. fala da cena = planos (remontadas)
        if (remounted.has(`${l.id}/${n.id}`) && n.direction?.shots.length) {
          const joined = n.direction.shots.map((s) => s.line.trim()).join(' ');
          if (words(n.narration ?? '') !== words(joined)) { n.narration = joined; changed++; }
        }
      }
  const cleaned = [...swaps.values()].filter(Boolean).length;
  if (!DRY && changed) {
    const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `acabamento: ${remounted.size} cena(s) remontada(s), ${cleaned} vídeo(s) com áudio limpo` } as never);
    log(`[acabamento] ${courseId}: ${remounted.size} remontada(s), ${cleaned} áudio(s) limpo(s); rascunho ${draft.revision} → ${(saved as { revision: number }).revision}`);
  } else log(`[acabamento] ${courseId}: ${remounted.size} remontada(s), ${DRY ? swaps.size + ' áudio(s) a limpar' : cleaned + ' áudio(s) limpo(s)'}${DRY ? ' (só a lista)' : ''}`);
}

async function main() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'lms-acabamento-'));
  const report: string[] = [];
  try {
    for (const c of COURSES) await course(c, tmp, report);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  if (report.length) {
    log('[cortes no meio de frase]\n  ' + report.join('\n  '));
    if (LOG) writeFileSync(LOG.replace(/\.log$/, '') + '-cortes.txt', report.join('\n') + '\n');
  }
  void SceneDirectionSchema;
}

main().then(() => process.exit(0), (e) => {
  console.error(`[acabamento] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

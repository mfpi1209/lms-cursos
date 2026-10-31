/**
 * Ajuste fino SEM CUSTO de uma cena dirigida já gravada: remonta com os clipes guardados (ffmpeg local,
 * nenhum provedor) e anexa o resultado ao nó, com legendas refeitas.
 *
 *   --drop s2,s3         tira planos inteiros (frases) do vídeo; some também da direção do rascunho
 *   --cut s2:last,s3:first  apara a ÚLTIMA ou a PRIMEIRA frase de um plano (corte por palavra; áudio e vídeo
 *                        juntos, boca sincronizada); o texto do plano no rascunho acompanha
 *   --teaser "texto"     troca o cartão "Pergunta a seguir" do fim do vídeo (vazio = sem cartão)
 *   --out arquivo.mp4    só gera o MP4 (prévia), sem anexar
 *
 * Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/ajuste-fino.ts <curso> <aula>/<nó> [--drop …] [--teaser …] [--out …]
 */
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import { SceneDirectionSchema, type CourseDocument, type SceneDirection } from '@lms/course-schema';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { attachToNode, readAsset, storeGeneratedAsset } from '../media';
import { packWords, unpackWords, type PackedWords } from '../narration';
import { renderDirectedScene, sceneCaptions, type DirectedInput } from '../compose-scene';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

type NodeLike = { id: string; media?: { generatedFrom?: { jobId?: string } }; direction?: SceneDirection };

function findNode(doc: CourseDocument, lessonId: string, nodeId: string): NodeLike | undefined {
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === lessonId) return l.graph.nodes.find((n) => n.id === nodeId) as unknown as NodeLike | undefined;
  return undefined;
}

/** índices [ini, fim] (inclusivos) das frases, pela pontuação final das palavras */
function sentences(words: { text: string }[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  words.forEach((w, i) => {
    if (/[.!?…]["”']?$/.test(w.text) || i === words.length - 1) {
      out.push([start, i]);
      start = i + 1;
    }
  });
  return out;
}

async function main() {
  const [courseId, where] = process.argv.slice(2);
  const [lessonId, nodeId] = (where ?? '').split('/');
  if (!courseId || !lessonId || !nodeId) throw new Error('uso: ajuste-fino.ts <curso> <aula>/<nó> [--drop s2] [--teaser "…"] [--out prévia.mp4]');
  const drop = new Set((arg('--drop') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const cuts = new Map((arg('--cut') ?? '').split(',').map((c) => c.trim()).filter(Boolean).map((c) => { const [id, side] = c.split(':'); if (side !== 'first' && side !== 'last') throw new Error(`--cut ${c}: use <plano>:first ou <plano>:last`); return [id!, side] as const; }));
  const teaser = arg('--teaser');
  const out = arg('--out');
  const db = getDb();
  const draft = (await authoring.getDraft(db, courseId))!;
  const node = findNode(draft.document as CourseDocument, lessonId, nodeId);
  const jobId = node?.media?.generatedFrom?.jobId;
  if (!jobId) throw new Error(`${where}: sem vídeo gerado por job`);
  const job = (await media.getJob(db, jobId))!;
  const input = structuredClone(job.input) as unknown as DirectedInput;
  if (!input.direction || !input.units || !input.shots) throw new Error(`${where}: não é cena dirigida com itens gravados`);
  if (input.appendOutro) throw new Error(`${where}: cena com vinheta no fim; ajuste fino ainda não cobre esse caso`);
  const base = SceneDirectionSchema.parse(input.direction);
  for (const id of drop) if (!base.shots.some((s) => s.id === id)) throw new Error(`plano ${id} não existe (${base.shots.map((s) => s.id).join(', ')})`);
  for (const u of input.units) {
    const n = u.shotIds.filter((id) => drop.has(id)).length;
    if (n && n !== u.shotIds.length) throw new Error(`o item ${u.id} junta ${u.shotIds.join('+')}; só dá para tirar todos juntos`);
  }
  const direction: SceneDirection = { ...base, shots: base.shots.filter((s) => !drop.has(s.id)) };
  if (!direction.shots.length) throw new Error('não sobra nenhum plano');
  input.units = input.units.filter((u) => !u.shotIds.every((id) => drop.has(id)));
  // o primeiro plano que sobra entra com corte seco (sem transição de entrada)
  if (drop.has(base.shots[0]!.id)) direction.shots[0] = { ...direction.shots[0]!, transitionIn: 'cut' };
  if (teaser !== undefined) input.nextQuestion = teaser;
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-ajuste-'));
  const clipFiles = new Map<string, string>();
  const newLines = new Map<string, string>();
  for (const [shotId, side] of cuts) {
    const u = input.units.find((x) => x.shotIds.length === 1 && x.shotIds[0] === shotId && x.kind === 'clip');
    const st = u ? input.shots[u.id] : undefined;
    const words = unpackWords(st?.words as PackedWords | undefined);
    if (!u || !st?.clipAssetId || !words?.length) throw new Error(`--cut ${shotId}: só em plano sozinho com clipe e palavras guardadas`);
    const sents = sentences(words);
    if (sents.length < 2) throw new Error(`--cut ${shotId}: o plano tem uma frase só; use --drop`);
    const [a, b] = side === 'first' ? [sents[1]![0], words.length - 1] : [0, sents[sents.length - 2]![1]];
    const clip = await media.getAsset(db, st.clipAssetId);
    if (!clip) throw new Error(`clipe ${st.clipAssetId} não encontrado`);
    const src = path.join(dir, `src-${u.id}.mp4`);
    await writeFile(src, await readAsset(clip.storageKey));
    const total = (await ffprobe(src)).durationSeconds;
    const t0 = side === 'first' ? Math.max(0, words[a]!.start - 0.12) : 0;
    const t1 = side === 'last' ? Math.min(total, words[b]!.end + 0.3) : total;
    const trimmed = path.join(dir, `cut-${u.id}.mp4`);
    await runFfmpeg(['-ss', t0.toFixed(3), '-to', t1.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', trimmed]);
    clipFiles.set(u.id, trimmed);
    const kept = words.slice(a, b + 1);
    st.words = packWords(kept, t0) as never;
    newLines.set(shotId, kept.map((w) => w.text).join(' '));
  }
  if (newLines.size) direction.shots = direction.shots.map((sh) => (newLines.has(sh.id) ? { ...sh, line: newLines.get(sh.id)! } : sh));
  if (draft.document.branding?.videoPalette) input.videoPalette = draft.document.branding.videoPalette;
  input.direction = direction as never;

  try {
    const scene = await renderDirectedScene(job, input, direction, dir, { clipFiles });
    const transcript = direction.shots.map((s) => s.line.trim()).join(' ');
    console.log(`[ajuste] ${courseId} ${where}: ${scene.durationSeconds.toFixed(1)} s${drop.size ? `; sem ${[...drop].join(', ')}` : ''}${newLines.size ? `; aparado ${[...cuts].map(([k, v]) => `${k}:${v}`).join(', ')}` : ''}${teaser !== undefined ? `; cartão: "${teaser}"` : ''}; volume ${scene.loudness?.outputI ?? '?'} LUFS`);
    if (out) {
      await copyFile(scene.output, out);
      console.log(`[ajuste] prévia em ${out} (nada anexado)`);
      return;
    }
    const captions = await sceneCaptions(job, direction, scene.timeline, scene.wordSources);
    const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(scene.output)), durationSeconds: scene.durationSeconds, transcript, createdBy: job.createdBy, ...(scene.loudness ? { metadata: { loudness: scene.loudness } } : {}) });
    // direção do rascunho = a montada (o plano tirado não volta numa gravação futura)
    if (drop.size || newLines.size) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const d = (await authoring.getDraft(db, courseId))!;
        const doc = structuredClone(d.document) as CourseDocument;
        const n = findNode(doc, lessonId, nodeId)!;
        if (n.direction) n.direction = { ...n.direction, shots: n.direction.shots.filter((s) => !drop.has(s.id)).map((s, i) => ({ ...s, ...(newLines.has(s.id) ? { line: newLines.get(s.id)! } : {}), ...(i === 0 && drop.has(base.shots[0]!.id) ? { transitionIn: 'cut' as const } : {}) })) } as SceneDirection;
        try {
          await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `ajuste fino ${where}: ${[...drop].map((x) => `sem ${x}`).concat([...cuts].map(([k, v]) => `${k} aparado (${v})`)).join(', ')}` });
          break;
        } catch (e) {
          if (attempt === 5) throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    await attachToNode(job, asset.id, false, transcript, captions);
    console.log(`[ajuste] anexado: ${asset.id} (sem custo)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[ajuste] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

/**
 * Ajuste fino SEM CUSTO das reações às respostas: apara a interjeição de abertura repetida
 * ("Boa escolha!", "Isso mesmo!", "Exatamente!", "Quase lá.") quando ela já apareceu antes no
 * mesmo curso. A primeira vez de cada uma fica (a instrutora não perde o calor); as repetições
 * começam direto no conteúdo. Corte pelo alinhamento por letra da narração (áudio e vídeo juntos),
 * legendas refeitas, texto da reação no rascunho acompanha. Nenhum provedor é chamado.
 *
 * Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/aparar-reacoes.ts <curso> [<curso>…] [--dry-run]
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { ffprobe, normalizeLoudnessInPlace, runFfmpeg, wordsFromAlignment, type CharAlignment } from '@lms/media/compose';
import { readAsset, storeGeneratedAsset } from '../media';
import { storeCaptions } from '../narration';

const OPENERS = ['Boa escolha!', 'Isso mesmo!', 'Exatamente!', 'Quase lá.'];
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const COURSES = args.filter((a) => !a.startsWith('--'));

type Reaction = { text: string; media?: { kind: string; assetId: string; transcript?: string; captions?: { assetId: string; lang?: string; format?: string; approx?: boolean }; generatedFrom?: { jobId?: string } } };
type Opt = { id: string; reaction?: Reaction };

async function course(courseId: string) {
  const db = getDb();
  const draft = (await authoring.getDraft(db, courseId))!;
  const seen = new Set<string>();
  const changes = new Map<string, { text: string; assetId: string; captions?: { assetId: string; lang: string; format: 'vtt'; approx?: boolean } }>();
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-reacao-'));
  try {
    for (const m of (draft.document as CourseDocument).modules)
      for (const l of m.lessons)
        for (const n of l.graph.nodes) {
          if (n.type !== 'choice') continue;
          for (const o of n.options as unknown as Opt[]) {
            const r = o.reaction;
            const opener = r ? OPENERS.find((x) => r.text.startsWith(x + ' ')) : undefined;
            if (!r || !opener || r.media?.kind !== 'video') continue;
            if (!seen.has(opener)) { seen.add(opener); continue; }
            const key = `${l.id}/${n.id}~${o.id}`;
            const rest = r.text.slice(opener.length).trim();
            const job = r.media.generatedFrom?.jobId ? await media.getJob(db, r.media.generatedFrom.jobId) : null;
            const al = (job?.input as { alignment?: CharAlignment; script?: string } | undefined)?.alignment;
            const script = String((job?.input as { script?: string } | undefined)?.script ?? '');
            if (!al?.characters?.length || !script.startsWith(opener)) { console.log(`[reação] ${courseId} ${key}: sem alinhamento; fica como está`); continue; }
            // primeira letra depois da interjeição e dos espaços
            let idx = opener.length;
            while (idx < al.characters.length && /\s/.test(al.characters[idx]!)) idx++;
            const t0 = Math.max(al.endTimes[opener.length - 1] ?? 0, (al.startTimes[idx] ?? 0) - 0.12);
            if (DRY) { console.log(`[reação] ${courseId} ${key}: tira "${opener}" (corta ${t0.toFixed(2)} s)`); continue; }
            const asset = await media.getAsset(db, r.media.assetId);
            if (!asset) continue;
            const src = path.join(dir, `${o.id}-in.mp4`);
            const out = path.join(dir, `${o.id}-out.mp4`);
            await writeFile(src, await readAsset(asset.storageKey));
            await runFfmpeg(['-ss', t0.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
            const loudness = await normalizeLoudnessInPlace(out);
            const seconds = (await ffprobe(out)).durationSeconds;
            const stored = await storeGeneratedAsset({ workspaceId: asset.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(out)), durationSeconds: seconds, transcript: rest, createdBy: asset.createdBy ?? draft.updatedBy, metadata: { loudness: { ...loudness, from: asset.id } } });
            const words = wordsFromAlignment(al).filter((w) => w.start >= t0 - 0.01).map((w) => ({ ...w, start: Math.max(0, w.start - t0), end: Math.max(0, w.end - t0) }));
            const cap = await storeCaptions({ workspaceId: asset.workspaceId, createdBy: asset.createdBy ?? draft.updatedBy }, words, false);
            changes.set(key, { text: rest, assetId: stored.id, ...(cap ? { captions: { assetId: cap.assetId, lang: 'pt-BR', format: 'vtt' as const } } : {}) });
            console.log(`[reação] ${courseId} ${key}: sem "${opener}" (${seconds.toFixed(1)} s)`);
          }
        }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  if (DRY || !changes.size) return console.log(`[reação] ${courseId}: ${DRY ? '--dry-run' : 'nada a aparar'}`);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const d = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d.document) as CourseDocument;
    let k = 0;
    for (const m of doc.modules)
      for (const l of m.lessons)
        for (const n of l.graph.nodes) {
          if (n.type !== 'choice') continue;
          for (const o of n.options as unknown as Opt[]) {
            const c = changes.get(`${l.id}/${n.id}~${o.id}`);
            if (!c || !o.reaction?.media) continue;
            o.reaction = { ...o.reaction, text: c.text, media: { ...o.reaction.media, assetId: c.assetId, transcript: c.text, ...(c.captions ? { captions: c.captions } : {}) } };
            k++;
          }
        }
    try {
      const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `reações: interjeição repetida aparada em ${k}` });
      return console.log(`[reação] ${courseId}: ${k} aparadas; rascunho ${d.revision} → ${saved.revision}`);
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function main() {
  if (!COURSES.length) throw new Error('uso: aparar-reacoes.ts <curso> [<curso>…] [--dry-run]');
  for (const c of COURSES) await course(c);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[reação] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

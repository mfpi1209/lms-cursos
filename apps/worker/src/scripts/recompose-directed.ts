/**
 * Remontagem SEM CUSTO de um vídeo dirigido já pago: refaz a montagem (ffmpeg
 * local) a partir dos clipes, trechos de áudio e palavras guardados no job, com
 * as regras ATUAIS da montagem (câmera em tela cheia sem zoom digital, marca
 * d'água do logo, cartões novos, painel). Nenhum provedor é chamado e nada é
 * gravado no banco nem anexado ao nó: só escreve o MP4 e os quadros pedidos.
 *
 *   pnpm --filter @lms/worker exec tsx src/scripts/recompose-directed.ts <jobId> <saída.mp4> [--frames 3,13,24]
 *   … [--panel <shotId> --video-from <itemId>]
 *   … [--attach]   guarda o MP4 como novo asset e o anexa ao nó do job (troca o vídeo da cena; legendas do job de origem)
 *
 * `--panel`: prévia do layout presenter_panel num plano que era cartão (sem
 * clipe pago): o vídeo da apresentadora vem do clipe do item `--video-from`
 * (mudo, cortado na duração do trecho; a boca NÃO acompanha esta fala — é só
 * prévia de layout) e o áudio é o trecho guardado do plano. Os quadros saem
 * nos instantes em que cada tópico acende (`<saída>-1.png`, `-2.png`, …).
 */
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import { SceneDirectionSchema, type SceneDirection } from '@lms/course-schema';
import { resolveWatermark } from '@lms/media';
import { ffprobe, panelBullets, panelRevealTimes, runFfmpeg } from '@lms/media/compose';
import { attachToNode, readAsset, storeGeneratedAsset } from '../media';
import { renderDirectedScene, type DirectedInput } from '../compose-scene';
import { unpackWords, type CaptionsRef, type PackedWords } from '../narration';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function frame(video: string, t: number, out: string) {
  await runFfmpeg(['-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-y', out]);
  console.log(`[recompose] quadro ${t.toFixed(2)} s -> ${out}`);
}

async function main() {
  const [jobId, outFile] = process.argv.slice(2);
  if (!jobId || !outFile || outFile.startsWith('--')) throw new Error('uso: recompose-directed.ts <jobId> <saída.mp4> [--frames 3,13,24] [--panel <shotId> --video-from <itemId>]');
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job) throw new Error(`job ${jobId} não encontrado`);
  const input = structuredClone(job.input) as unknown as DirectedInput;
  if (!input.direction || !input.units || !input.shots) throw new Error('o job não é um vídeo dirigido com itens gravados');
  let direction: SceneDirection = SceneDirectionSchema.parse(input.direction);
  const draft = await authoring.getDraft(db, job.courseId);
  // marca d'água: a do curso (branding.watermark) + preset da plataforma, como num pedido novo
  const watermark = resolveWatermark(draft?.document.branding?.watermark, process.env.PLATFORM_BRAND);
  // cores dos gráficos: as do curso hoje (permite trocar a paleta e remontar sem custo)
  if (draft?.document.branding?.videoPalette) input.videoPalette = draft.document.branding.videoPalette;
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-recompose-'));
  try {
    const clipFiles = new Map<string, string>();
    const panelShot = arg('--panel');
    if (panelShot) {
      const from = arg('--video-from');
      const unit = input.units.find((u) => u.shotIds.includes(panelShot));
      const src = input.units.find((u) => u.id === from && u.kind === 'clip');
      const st = unit ? input.shots[unit.id] : undefined;
      if (!unit || !src || !st?.segmentAssetId || unit.shotIds.length !== 1) throw new Error('--panel exige um plano sozinho num item de áudio (cartão) e --video-from com um item de clipe');
      const seg = await media.getAsset(db, st.segmentAssetId);
      const clip = await media.getAsset(db, input.shots[src.id]!.clipAssetId!);
      if (!seg || !clip) throw new Error('mídia guardada não encontrada');
      const segFile = path.join(dir, `seg.${seg.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`);
      const clipFile = path.join(dir, 'src-clip.mp4');
      await writeFile(segFile, await readAsset(seg.storageKey));
      await writeFile(clipFile, await readAsset(clip.storageKey));
      const segSeconds = (await ffprobe(segFile)).durationSeconds;
      const preview = path.join(dir, `panel-${unit.id}.mp4`);
      // vídeo do outro clipe (mudo) + o trecho de áudio deste plano, na duração do trecho
      await runFfmpeg(['-i', clipFile, '-i', segFile, '-map', '0:v', '-map', '1:a', '-t', segSeconds.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-y', preview]);
      clipFiles.set(unit.id, preview);
      unit.kind = 'clip';
      unit.cameraId = src.cameraId;
      input.shots[unit.id] = { ...st, kind: 'clip', offsets: { [panelShot]: { start: 0 } } };
      direction = { ...direction, shots: direction.shots.map((s) => (s.id === panelShot ? { ...s, layout: 'presenter_panel', ...(src.cameraId ? { cameraId: src.cameraId } : {}), cameraMove: 'static', slide: s.slide ? { ...s.slide, variant: undefined } : s.slide } : s)) };
    }
    const scene = await renderDirectedScene(job, input, direction, dir, { watermark, clipFiles });
    await copyFile(scene.output, outFile);
    console.log(`[recompose] ${outFile} (${scene.durationSeconds.toFixed(2)} s; marca d'água ${watermark ? `${watermark.position} ${watermark.opacity}` : 'desligada'}; tela cheia sem zoom: ${scene.adjustedShots.join(', ') || 'nenhum plano mudou'})`);
    if (process.argv.includes('--attach')) {
      if (panelShot) throw new Error('--attach não combina com --panel (prévia de layout)');
      // mesma linha do tempo do job de origem: as legendas guardadas continuam valendo
      const caps = (job.input as { captions?: CaptionsRef }).captions;
      // a narração é a mesma do vídeo anterior do job
      const prev = job.outputAssetId ? await media.getAsset(db, job.outputAssetId) : null;
      const transcript = prev?.transcript ?? undefined;
      const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(scene.output)), durationSeconds: scene.durationSeconds, transcript, createdBy: job.createdBy });
      await attachToNode(job, asset.id, false, transcript, caps);
      console.log(`[recompose] anexado ao nó ${job.lessonId}/${job.nodeId}: asset ${asset.id} (sem custo; remontagem local)`);
    }
    const base = outFile.replace(/\.mp4$/, '');
    for (const t of (arg('--frames') ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)) await frame(outFile, t, `${base}-${t}.png`);
    if (panelShot) {
      const t = scene.timeline.find((x) => x.id === panelShot)!;
      const shot = direction.shots.find((s) => s.id === panelShot)!;
      const unit = input.units.find((u) => u.shotIds.includes(panelShot))!;
      const words = unpackWords(input.shots[unit.id]!.words as PackedWords | undefined);
      const reveal = panelRevealTimes(panelBullets(shot.slide), words, t.duration);
      console.log(`[recompose] painel ${panelShot}: início ${t.start.toFixed(2)} s; tópicos acendem em ${reveal.map((r) => (t.start + r).toFixed(2)).join(', ')} s`);
      for (const [i, r] of reveal.entries()) await frame(outFile, Math.min(t.start + t.duration - 0.05, t.start + r + 0.4), `${base}-${i + 1}.png`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

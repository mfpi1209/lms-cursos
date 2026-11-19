/**
 * Prévia do PAINEL DA CENA (estúdio com zonas; `zone-panel.ts` em @lms/media) sem provedor nenhum nem banco: monta,
 * com o compositor de verdade (`composeScene`), uma cena a partir do clipe do apresentador JÁ gerado (sem painel) e
 * de um JSON com os dados do job, e mede o descompasso tópico × palavra nos PIXELS do vídeo pronto.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/zone-panel-preview.ts <cena.json> <clipe.mp4> <saida.mp4> [zona] [eyebrow]
 *
 * `cena.json`: { shots: [{ id, line, layout, framing, cameraId, cameraMove, transitionIn }], offsets: { [id]: { start, duration? } },
 *   words: [[texto, início, fim]], screenText, screenTopics: [{ text, cue }], watermark?, lowerThird?, background? }
 * `zona` = onde o apresentador está no quadro (`left` | `right`; padrão `left`).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { panelIconFor } from '@lms/course-schema';
import { composeScene, ffprobe, runFfmpeg, zonePanelDrift, type ComposeShot, type ShotClip } from '@lms/media/compose';

interface SceneFile {
  shots: Array<ComposeShot & { id: string }>;
  offsets: Record<string, { start: number; duration?: number }>;
  words: Array<[string, number, number]>;
  screenText?: string;
  screenTopics?: Array<{ text: string; cue?: string }>;
  watermark?: { brand: string; position: 'bottom-right' | 'bottom-left'; opacity: number };
  lowerThird?: { name: string; role?: string; brand?: string };
  background?: string;
}

/** Luminância média (0–255) de cada quadro de `video` num recorte, entre `from` e `to` (s). */
async function lumaSeries(video: string, crop: { x: number; y: number; w: number; h: number }, from: number, to: number): Promise<Array<{ t: number; y: number }>> {
  const { stderr } = await runFfmpeg(['-ss', from.toFixed(3), '-t', (to - from).toFixed(3), '-i', video, '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-an', '-f', 'null', '-'], { loglevel: 'info', timeoutMs: 120_000 });
  const out: Array<{ t: number; y: number }> = [];
  let t = 0;
  for (const line of stderr.split('\n')) {
    const pt = /pts_time:([\d.]+)/.exec(line);
    if (pt) t = Number(pt[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y) out.push({ t: from + t, y: Number(y[1]) });
  }
  return out;
}

async function main() {
  const [sceneFile, clip, output, zoneArg, eyebrow] = process.argv.slice(2);
  if (!sceneFile || !clip || !output) throw new Error('uso: zone-panel-preview.ts <cena.json> <clipe.mp4> <saida.mp4> [left|right] [eyebrow]');
  const scene = JSON.parse(await readFile(sceneFile, 'utf8')) as SceneFile;
  const zone = zoneArg === 'right' ? 'right' : 'left';
  const clipSeconds = (await ffprobe(clip)).durationSeconds;
  const clips = new Map<string, ShotClip>();
  const words = new Map<string, Array<{ text: string; start: number }>>();
  for (const s of scene.shots) {
    const o = scene.offsets[s.id] ?? { start: 0 };
    const duration = o.duration ?? clipSeconds - o.start;
    clips.set(s.id, { videoPath: clip, cameraNativeFraming: 'medium', startSeconds: o.start, durationSeconds: duration, zone, words: scene.words.map(([, start, end]) => ({ start, end })) });
    words.set(s.id, scene.words.map(([text, start]) => ({ text, start: start - o.start })).filter((w) => w.start >= -0.05));
  }
  const r = await composeScene({
    shots: scene.shots, clips, output, background: scene.background ?? '#000000',
    ...(scene.screenText ? { screenText: scene.screenText } : {}),
    ...(scene.screenTopics?.length ? { screenTopics: { topics: scene.screenTopics.map((t) => ({ ...t, icon: panelIconFor(t.text) })), words } } : {}),
    ...(eyebrow ? { screenEyebrow: eyebrow } : {}),
    ...(scene.lowerThird ? { lowerThird: scene.lowerThird } : {}),
    ...(scene.watermark ? { watermark: { ...scene.watermark, accent: '#1a66d1' } } : {}),
  });
  console.log(`[painel] ${output}: ${r.durationSeconds.toFixed(2)} s, janela ${JSON.stringify(r.overlays.screenText)}`);
  const steps = r.zonePanel ?? [];
  const planned = new Map(zonePanelDrift(steps).map((d) => [d.topic, d.drift]));
  // medição nos pixels: a faixa do painel fica mais clara quando um tópico acende; o instante "meio aceso" é o
  // quadro em que a luminância cruza a metade entre antes e depois da fusão
  const info = await ffprobe(output);
  const W = info.width ?? 1920;
  const H = info.height ?? 1080;
  const crop = { x: zone === 'left' ? Math.round(W * 0.6) : Math.round(W * 0.04), y: Math.round(H * 0.3), w: Math.round(W * 0.36), h: Math.round(H * 0.56) };
  for (const s of steps) {
    if (s.topic === undefined) continue;
    const series = await lumaSeries(output, crop, s.at - 0.2, s.at + s.fade + 0.2);
    const before = series.filter((p) => p.t < s.at - 0.02).map((p) => p.y);
    const after = series.filter((p) => p.t > s.at + s.fade + 0.02).map((p) => p.y);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const mid = (mean(before) + mean(after)) / 2;
    const up = mean(after) > mean(before);
    const hit = series.find((p) => p.t >= s.at - 0.02 && (up ? p.y >= mid : p.y <= mid));
    const measured = hit && s.wordAt !== undefined ? Number((hit.t - s.wordAt).toFixed(3)) : undefined;
    console.log(`[painel] tópico ${s.topic + 1} (página ${s.page + 1}): fusão ${s.at.toFixed(2)}–${(s.at + s.fade).toFixed(2)} s, palavra ${s.wordAt?.toFixed(2) ?? '—'} s, descompasso planejado ${planned.get(s.topic) ?? '—'} s, medido ${measured ?? '—'} s`);
  }
  for (const s of steps) if (s.topic === undefined && s.fade > 0) console.log(`[painel] troca para a página ${s.page + 1}: ${s.at.toFixed(2)}–${(s.at + s.fade).toFixed(2)} s`);
  console.log(`[painel] pasta: ${path.dirname(output)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

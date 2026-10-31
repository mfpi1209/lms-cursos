/**
 * Prévia do ESTÚDIO COM ZONAS sem provedor nenhum (nem banco): monta, com o
 * compositor de verdade (`composeScene`), um "clipe" feito de uma imagem
 * parada — o cenário aprovado `docs/brand/cenario/estudio-zonas-1920.png` com
 * a apresentadora recortada (`docs/brand/cenario/presenter.png`) no terço da
 * zona — e grava:
 *   - `zonas-chips.mp4`: 5 s, apresentadora à esquerda, pílulas surgindo à
 *     direita + letreiro com o nome (0,6–4,5 s) + marca d'água;
 *   - `zonas-chips.png`: o quadro com a 2ª pílula no meio do pop;
 *   - `zonas-pergunta.png`: apresentadora à direita (parede livre à esquerda)
 *     com o cartão "A seguir" nos últimos 3 s.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/zones-preview.ts [pasta de saída]
 *   (padrão: docs/qa/screens)
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chipLabel, panelIconFor } from '@lms/course-schema';
import { chipTimeline, composeScene, panelRevealTimes, renderShotGraphics, runFfmpeg, type ComposeShot, type ShotClip } from '@lms/media/compose';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const STUDIO = path.join(ROOT, 'docs/brand/cenario/estudio-zonas-1920.png');
const PRESENTER = path.join(ROOT, 'docs/brand/cenario/presenter.png');

/** Clipe de `seconds` s: cenário + apresentadora recortada centrada em `cx` (fração da largura), com áudio mudo. */
async function stillClip(out: string, cx: number, seconds: number, still?: string) {
  // quadro real de uma câmera de zona (opcional): usa a imagem inteira, sem recortar a apresentadora
  if (still) {
    await runFfmpeg(['-loop', '1', '-framerate', '25', '-t', String(seconds), '-i', still, '-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-vf', 'scale=1920:1080,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-shortest', '-y', out]);
    return out;
  }
  await runFfmpeg([
    '-loop', '1', '-framerate', '25', '-t', String(seconds), '-i', STUDIO,
    '-loop', '1', '-framerate', '25', '-t', String(seconds), '-i', PRESENTER,
    '-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', `[1:v]scale=-1:1000[p];[0:v][p]overlay=x=${Math.round(1920 * cx)}-w/2:y=H-h,format=yuv420p[v]`,
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-shortest', '-y', out,
  ]);
  return out;
}

async function frame(video: string, t: number, out: string) {
  await runFfmpeg(['-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-y', out]);
  console.log(`[zonas] quadro ${t.toFixed(2)} s -> ${out}`);
}

async function main() {
  const outDir = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs/qa/screens'));
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-zonas-'));
  try {
    const bullets = ['Ajudar no **negócio da família**', 'Organizar **eventos da escola**', '**Voluntariado** no bairro', 'Fazer **cursos online**'];
    // palavras ditas (tempos relativos ao plano): cada pílula surge na palavra-chave
    const words = [['Ajudar', 0.3], ['no', 0.6], ['negócio', 0.75], ['da', 1.05], ['família,', 1.15], ['organizar', 1.75], ['eventos', 2.0], ['da', 2.35], ['escola,', 2.45], ['voluntariado', 3.0], ['e', 3.5], ['cursos', 3.65], ['online.', 4.0]].map(([text, start]) => ({ text: text as string, start: start as number }));
    const slide = { title: 'Isso também é experiência', bullets, style: 'checklist' as const };

    // 1) pílulas: apresentadora à ESQUERDA (zona left), pílulas na parede da direita
    const chipsShot: ComposeShot = { id: 's1', layout: 'presenter_chips', framing: 'medium', slide };
    const left = await stillClip(path.join(dir, 'left.mp4'), 0.25, 7, process.env.ZONES_STILL_LEFT);
    const palette = process.env.ZONES_PALETTE ? { base: process.env.ZONES_PALETTE.split(',')[0]!, accent: process.env.ZONES_PALETTE.split(',')[1]! } : undefined;
    const gfx = await renderShotGraphics({ palette, shots: [chipsShot], outDir: dir, panelEyebrow: 'Aula 1 · Você tem mais experiência do que imagina', panelIconFor, chipLabelFor: chipLabel, zones: new Map([['s1', 'left']]) });
    const clips = new Map<string, ShotClip>([['s1', { videoPath: left, zone: 'left' }]]);
    const mp4 = path.join(outDir, 'zonas-chips.mp4');
    const r = await composeScene({
      shots: [chipsShot], clips, output: mp4,
      chips: new Map([['s1', { graphics: gfx.chips.get('s1')!, words }]]),
      lowerThird: { name: 'Marina', role: 'Sua orientadora', brand: 'DNA Work' },
      teaser: { question: 'Isso entra no seu currículo?' },
      palette,
      watermark: { brand: 'dnawork', position: 'bottom-right', opacity: 0.7 },
    });
    const times = chipTimeline(panelRevealTimes(bullets, words, r.durationSeconds), r.durationSeconds);
    console.log(`[zonas] ${mp4}: ${r.durationSeconds.toFixed(2)} s; pílulas em ${times.map((t) => t.at.toFixed(2)).join(', ')} s; letreiro ${JSON.stringify(r.overlays.lowerThird)}`);
    // 2ª pílula no meio do pop (escala ≈ 1,06)
    await frame(mp4, times[1]!.at + 0.13, path.join(outDir, 'zonas-chips.png'));
    // fim da cena: todas as pílulas + a pergunta a seguir abaixo delas (o modelo aprovado)
    await frame(mp4, r.durationSeconds - 0.5, path.join(outDir, 'zonas-chips-fim.png'));

    // 2) pergunta a seguir: apresentadora à DIREITA (zona right), cartão na parede da esquerda
    const talk: ComposeShot = { id: 't1', layout: 'presenter', framing: 'medium' };
    const right = await stillClip(path.join(dir, 'right.mp4'), 0.75, 5);
    const q = await composeScene({
      shots: [talk], clips: new Map([['t1', { videoPath: right, zone: 'right' }]]), output: path.join(dir, 'pergunta.mp4'),
      teaser: { question: 'Você coloca o negócio da família no currículo?' },
      watermark: { brand: 'dnawork', position: 'bottom-right', opacity: 0.7 },
    });
    console.log(`[zonas] pergunta: ${JSON.stringify(q.overlays.teaser)}`);
    await frame(q.output, q.durationSeconds - 1, path.join(outDir, 'zonas-pergunta.png'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

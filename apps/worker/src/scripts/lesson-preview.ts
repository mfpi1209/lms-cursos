/**
 * Prévia VISUAL de uma aula, sem provedor nenhum e sem gravar nada no banco: para cada cena de vídeo
 * dirigida da aula, monta com o compositor de verdade (`composeScene`) um vídeo mudo em que o "clipe"
 * de cada plano é a imagem parada da câmera do plano (preview do look). Saem as mesmas camadas do
 * vídeo final: pílulas/painel surgindo na palavra-chave (tempos estimados pela fala), letreiro com o
 * nome na abertura da aula, pergunta a seguir nos últimos ≈ 3 s e marca d'água do logo.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/lesson-preview.ts <curso> <aula> <pasta de saída>
 *
 * Grava `<no>.mp4` (vídeo mudo) e quadros `<no>-<plano>.png` (meio de cada plano; pílulas: quando
 * todas já surgiram; último plano: com a pergunta a seguir).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, authoring } from '@lms/db';
import { allLessons, chipLabel, panelIconFor, type CourseDocument } from '@lms/course-schema';
import { composeScene, renderShotGraphics, runFfmpeg, type ComposeShot, type ShotClip } from '@lms/media/compose';
import { estimateLineSeconds } from '../compose-plan';

const [COURSE_ID, LESSON_ID, OUT] = process.argv.slice(2);
const tag = '[previa]';

async function stillClip(out: string, image: string, seconds: number) {
  await runFfmpeg(['-loop', '1', '-framerate', '25', '-t', seconds.toFixed(2), '-i', image, '-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-vf', 'scale=1920:1080,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-shortest', '-y', out]);
  return out;
}

const frame = (video: string, t: number, out: string) => runFfmpeg(['-ss', Math.max(0, t).toFixed(3), '-i', video, '-frames:v', '1', '-y', out]);

/** palavras da fala espalhadas no tempo do plano (sem narração real; o compositor usa para acender os tópicos) */
function wordsOver(line: string, seconds: number) {
  const ws = line.split(/\s+/).filter(Boolean);
  return ws.map((text, i) => ({ text, start: (i / ws.length) * seconds * 0.95 }));
}

async function main() {
  if (!COURSE_ID || !LESSON_ID || !OUT) throw new Error('uso: lesson-preview.ts <curso> <aula> <pasta>');
  const outDir = path.resolve(OUT);
  await mkdir(outDir, { recursive: true });
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-previa-aula-'));
  try {
    const draft = await authoring.getDraft(db, COURSE_ID);
    if (!draft) throw new Error(`rascunho de ${COURSE_ID} não encontrado`);
    const doc = draft.document as CourseDocument;
    const lessons = allLessons(doc);
    const li = lessons.findIndex((l) => l.id === LESSON_ID);
    const lesson = lessons[li];
    if (!lesson) throw new Error(`aula ${LESSON_ID} não encontrada`);
    const pres = doc.presentation!;
    const brand = process.env.PLATFORM_BRAND ?? 'dnawork';
    const wm = doc.branding?.watermark;
    const watermark = wm?.enabled === false ? null : { brand, position: wm?.position ?? 'bottom-right', opacity: wm?.opacity ?? 0.7 };

    // imagem parada de cada câmera (preview do look), convertida para PNG
    const stills = new Map<string, string>();
    for (const c of pres.cameras ?? []) {
      if (!c.previewUrl) continue;
      const res = await fetch(c.previewUrl);
      if (!res.ok) throw new Error(`preview da câmera ${c.id}: HTTP ${res.status}`);
      const raw = path.join(dir, `${c.id}.img`);
      await writeFile(raw, new Uint8Array(await res.arrayBuffer()));
      const png = path.join(dir, `${c.id}.png`);
      await runFfmpeg(['-i', raw, '-y', png]);
      stills.set(c.id, png);
    }
    const mainCam = (pres.cameras ?? []).find((c) => c.lookId === pres.avatarId)?.id ?? pres.cameras?.[0]?.id;
    const zoneOf = (id?: string) => (pres.cameras ?? []).find((c) => c.id === id)?.zone;

    const nodes = lesson.graph.nodes;
    let firstVideo = true;
    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni]! as { id: string; type: string; title?: string; direction?: { shots: Array<ComposeShot & { line?: string; cameraId?: string }> } };
      const shots = node.direction?.shots;
      if (!shots?.length) continue;
      // próxima cena (pela aresta padrão) é decisão? vira a "pergunta a seguir"
      const nextEdge = lesson.graph.edges.find((e) => e.from === node.id);
      const next = nextEdge ? (nodes.find((n) => n.id === nextEdge.to) as { type: string; title?: string; prompt?: string } | undefined) : undefined;
      const question = next?.type === 'choice' ? (next.title ?? next.prompt) : undefined;

      const clips = new Map<string, ShotClip>();
      const zones = new Map<string, 'left' | 'right' | 'center'>();
      const durations = new Map<string, number>();
      for (const s of shots) {
        const cam = s.cameraId ?? mainCam;
        const img = cam ? stills.get(cam) : undefined;
        if (!img) throw new Error(`câmera ${cam ?? '—'} sem imagem de prévia`);
        const sec = Math.max(2.5, estimateLineSeconds(s.line ?? ''));
        durations.set(s.id, sec);
        const zone = zoneOf(cam);
        if (zone) zones.set(s.id, zone);
        clips.set(s.id, { videoPath: await stillClip(path.join(dir, `${node.id}-${s.id}.mp4`), img, sec), ...(zone ? { zone } : {}) });
      }
      const gfx = await renderShotGraphics({
        shots, outDir: dir, brand, panelEyebrow: `Aula ${li + 1} · ${lesson.title}`, panelIconFor, chipLabelFor: chipLabel, zones,
        ...(watermark ? { cardWatermark: false as const } : {}),
      });
      const chips = new Map([...gfx.chips].map(([id, graphics]) => [id, { graphics, words: wordsOver(shots.find((s) => s.id === id)!.line ?? '', durations.get(id)!) }]));
      const panels = new Map([...gfx.panels].map(([id, states]) => [id, { states, words: wordsOver(shots.find((s) => s.id === id)!.line ?? '', durations.get(id)!) }]));
      const output = path.join(outDir, `${node.id}.mp4`);
      const r = await composeScene({
        shots, clips, slides: gfx.slides, captions: gfx.captions, output,
        ...(chips.size ? { chips } : {}),
        ...(panels.size ? { panels } : {}),
        ...(question ? { teaser: { question } } : {}),
        ...(firstVideo && doc.branding?.presenterName ? { lowerThird: { name: doc.branding.presenterName, role: doc.branding.presenterRole, brand: 'DNA Work' } } : {}),
        watermark,
      });
      console.log(`${tag} ${node.id}: ${r.durationSeconds.toFixed(1)} s, ${shots.length} planos${question ? `, pergunta a seguir "${question}"` : ''}`);
      // quadros: meio de cada plano (pílulas/painel: perto do fim, com tudo aceso); 1º plano com o letreiro
      for (const t of r.timeline) {
        const s = shots.find((x) => x.id === t.id)!;
        const rich = s.layout === 'presenter_chips' || s.layout === 'presenter_panel';
        const at = firstVideo && t === r.timeline[0] ? Math.min(t.start + 2.5, t.start + t.duration - 0.2) : rich ? t.start + t.duration - 0.4 : t.start + t.duration / 2;
        await frame(output, at, path.join(outDir, `${node.id}-${t.id}.png`));
      }
      if (question) await frame(output, r.durationSeconds - 0.6, path.join(outDir, `${node.id}-pergunta.png`));
      firstVideo = false;
    }
    console.log(`${tag} pronto: ${outDir}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await close();
  }
}

main().catch((e) => { console.error(`${tag} erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

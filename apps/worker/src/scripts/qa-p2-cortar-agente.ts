/**
 * Revisão pedagógica da Fable, P2 (C06·A2·v03, plano s2): regra fixa do dono = nunca citar "agente de integração". O áudio gravado diz
 * "…ao canal indicado pela empresa, à escola ou ao agente de integração do seu contrato." Este script CORTA o final ("ou ao agente de
 * integração do seu contrato") com o ajuste fino existente (`skip` do meio/fim do plano, por palavras; o ponto de corte cai no ponto de
 * menor volume entre "escola" e "ou", `quietestPoint`), sem regravar nada: a frase termina em "…à escola."
 *  - acha as palavras do final do s2 pela gravação guardada e confere o texto antes de cortar (se não bater, não corta);
 *  - `--out=arquivo.mp4` só gera a prévia (nada anexado, nada gravado);
 *  - sem `--out`, anexa o vídeo novo (custo 0, nenhum provedor), grava `media.adjust` (com `skipText`), a direção do plano e
 *    `media.transcript`; depois ajusta `narration` (= soma das falas que ficam) no rascunho, só esse campo.
 * Idempotente: se o s2 já tem o corte, não faz nada. Rode DEPOIS dele o desengasgo (uma remontagem refaz a imagem a partir dos clipes).
 *
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/qa-p2-cortar-agente.ts [--dry-run] [--out=prévia.mp4]
 */
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { skipTextOf, soloShotWords } from '@lms/media';
import { adjustScene, loadSceneAdjust } from '../adjust';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[p2] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (o ajuste é local e grátis)');
  process.exit(1);
}

const COURSE = 'crs_b8zeh4b2gguseghq';
const AULA = 'aula_02';
const NO = 'v03';
const SHOT = 's2';
/** o que sai (normalizado, palavra a palavra) e a palavra que fica antes dele */
const SAI = ['ou', 'ao', 'agente', 'de', 'integracao', 'do', 'seu', 'contrato'];
const FICA_ANTES = 'escola';
const NARRACAO_DE = 'à escola ou ao agente de integração do seu contrato.';
const NARRACAO_PARA = 'à escola.';

const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6);

async function main() {
  const ctx = await loadSceneAdjust(COURSE, AULA, NO);
  const shotWords = soloShotWords(ctx.input.units!, ctx.wordsByUnit);
  const words = shotWords.get(SHOT);
  if (!words?.length) throw new Error(`${SHOT} sem clipe sozinho com palavras guardadas`);
  const ja = ctx.current.cut[SHOT]?.skip?.length;
  if (ja) {
    console.log(`[p2] ${SHOT} já tem corte no meio/fim (${JSON.stringify(ctx.current.cut[SHOT])}); nada a fazer`);
    return;
  }
  const n = SAI.length;
  const to = words.length - 1;
  const from = to - n + 1;
  const norms = words.map((w) => norm(w.text));
  if (from < 1 || norms.slice(from, to + 1).join(' ') !== SAI.join(' ') || norms[from - 1] !== FICA_ANTES) {
    throw new Error(`o final do ${SHOT} não é o esperado ("${words.slice(Math.max(0, from - 1)).map((w) => w.text).join(' ')}"); não cortei`);
  }
  const text = skipTextOf(words, from, to)!;
  const t = (i: number) => `${words[i]!.text} [${words[i]!.start.toFixed(2)}–${words[i]!.end.toFixed(2)}]`;
  console.log(`[p2] fica: ${t(from - 1)} | sai: ${words.slice(from, to + 1).map((_, i) => t(from + i)).join(' ')}`);
  if (DRY) {
    console.log('[p2] dry-run: nada feito');
    return;
  }
  const r = await adjustScene({ courseId: COURSE, lessonId: AULA, nodeId: NO, request: { skip: [{ shotId: SHOT, from, to, text }] }, ...(OUT ? { out: OUT } : {}) });
  console.log(`[p2] ${OUT ? `prévia em ${OUT} (nada anexado)` : `anexado ${r.assetId}`}: ${r.durationSeconds.toFixed(1)} s; ${JSON.stringify(r.state.cut[SHOT])}; volume ${r.loudness?.outputI ?? '?'} LUFS`);
  console.log(`[p2] fala depois: ${r.transcript}`);
  if (OUT) return;
  // narração = soma do que fica (só esse campo)
  const db = getDb();
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const d = (await authoring.getDraft(db, COURSE))!;
    const doc = structuredClone(d.document) as CourseDocument;
    const node = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === AULA)!.graph.nodes.find((x) => x.id === NO) as unknown as { narration?: string };
    if (!node.narration?.includes(NARRACAO_DE)) {
      console.log(`[p2] narração ${node.narration?.includes(NARRACAO_PARA) ? 'já' : 'NÃO'} está no texto novo; nada a trocar`);
      return;
    }
    node.narration = node.narration.replace(NARRACAO_DE, NARRACAO_PARA);
    try {
      const salvo = await authoring.saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'QA revisão pedagógica P2: narração do C06·A2·v03 sem o agente de integração (áudio cortado)' });
      console.log(`[p2] narração ajustada; rascunho ${d.revision} → ${salvo.revision}`);
      return;
    } catch (e) {
      if (tentativa === 5) throw e;
      await new Promise((res) => setTimeout(res, 1200));
    }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[p2] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

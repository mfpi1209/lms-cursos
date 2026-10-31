/**
 * Ajuste fino SEM CUSTO de uma cena dirigida já gravada (o mesmo do estúdio, A17): remonta com os clipes
 * guardados (ffmpeg local, nenhum provedor) e anexa o resultado ao nó, com legendas refeitas. O pedido SOMA
 * ao ajuste já aplicado (`media.adjust`).
 *
 *   --drop s2,s3            tira planos inteiros (frases) do vídeo; some também da direção do rascunho
 *   --cut s2:last,s3:first  tira a ÚLTIMA ou a PRIMEIRA frase (que sobrou) de um plano (corte por palavra;
 *                           áudio e vídeo juntos, boca sincronizada); o texto do plano no rascunho acompanha
 *   --teaser "texto"        troca o cartão "Pergunta a seguir" do fim do vídeo (--teaser "" = sem cartão)
 *   --out arquivo.mp4       só gera o MP4 (prévia), sem anexar
 *
 * Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/ajuste-fino.ts <curso> <aula>/<nó> [--drop …] [--cut …] [--teaser …] [--out …]
 */
import type { AdjustRequest } from '@lms/media';
import { adjustScene } from '../adjust';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const [courseId, where] = process.argv.slice(2);
  const [lessonId, nodeId] = (where ?? '').split('/');
  if (!courseId || !lessonId || !nodeId) throw new Error('uso: ajuste-fino.ts <curso> <aula>/<nó> [--drop s2] [--cut s2:last] [--teaser "…"] [--out prévia.mp4]');
  const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const cut = list(arg('--cut')).map((c) => {
    const [shotId, side] = c.split(':');
    if (!shotId || (side !== 'first' && side !== 'last')) throw new Error(`--cut ${c}: use <plano>:first ou <plano>:last`);
    return { shotId, side } as const;
  });
  const teaser = arg('--teaser');
  const request: AdjustRequest = { drop: list(arg('--drop')), cut, ...(teaser !== undefined ? { teaser: teaser.trim() ? teaser : null } : {}) };
  const out = arg('--out');
  const r = await adjustScene({ courseId, lessonId, nodeId, request, ...(out ? { out } : {}) });
  console.log(`[ajuste] ${courseId} ${where}: ${r.durationSeconds.toFixed(1)} s; ${JSON.stringify(r.state)}; volume ${r.loudness?.outputI ?? '?'} LUFS`);
  console.log(out ? `[ajuste] prévia em ${out} (nada anexado)` : `[ajuste] anexado: ${r.assetId} (sem custo)`);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[ajuste] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

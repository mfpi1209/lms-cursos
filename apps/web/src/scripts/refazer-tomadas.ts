/**
 * Refaz SÓ as tomadas marcadas de cenas dirigidas (ex.: o HeyGen inventou um relógio no pulso de trás).
 * Incrementa a variação `direction.retake[<id do 1º plano da tomada>]` no RASCUNHO (revisão otimista) e dispara o
 * lote só dessas cenas com as mesmas guardas do `gerar-curso`: o worker reaproveita as tomadas iguais (custo 0)
 * e pede de novo apenas a marcada; o orçamento cobra só os segundos dela.
 *
 * Uso (a partir de apps/web; o `.env` da raiz carregado no shell):
 *   tsx src/scripts/refazer-tomadas.ts --course crs_xxx --tomadas aula_01/v09#s3,aula_02/v05#s1 --max-usd 5          # a seco (padrão)
 *   ALLOW_PAID_PROVIDERS=1 tsx src/scripts/refazer-tomadas.ts --course crs_xxx --tomadas aula_01/v09#s3 --max-usd 5 --confirmar
 *
 * Tomada: `aula/cena#<id do 1º plano>` (o painel de pulsos imprime esse rótulo em tomadas.txt) ou `aula/cena#<n>`
 * (índice da tomada na cena, a partir de 1). Um id de plano do meio da tomada refaz a tomada inteira.
 *
 * `--seco` (padrão): mostra as tomadas, segundos e US$ e NÃO grava nada. `--confirmar`: grava o rascunho e enfileira.
 * Recusa (nada gravado) por: simulação ativa, total > --max-usd, erros de cena, teto diário, jobs abertos do curso.
 * Este script só ENFILEIRA; quem chama o HeyGen é o worker (com ALLOW_PAID_PROVIDERS=1).
 */
import { authoring, getDb } from '@lms/db';
import { mediaPriceTable } from '@lms/media';
import { rodarLote, usd } from './gerar-curso-lote';
import { applyRetakes, parseArgs } from './refazer-tomadas-calc';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const draft = await authoring.getDraft(db, args.course);
  if (!draft) throw new Error(`rascunho de ${args.course} não existe`);
  const { doc, applied, scenes } = applyRetakes(draft.document, args.tomadas);
  const price = mediaPriceTable().heygenUsdPerSecond;
  const lines = ['Tomadas a refazer (variação nova entra só na chave delas; as demais tomadas da cena são reaproveitadas):'];
  for (const a of applied) lines.push(`  ${a.lessonId}/${a.nodeId}#${a.firstShotId} (tomada ${a.index}, câmera ${a.cameraId ?? 'principal'}, planos ${a.shotIds.join('+')}): ~${a.seconds.toFixed(1)} s ≈ ${usd(a.seconds * price)} de HeyGen; variação ${a.from} -> ${a.to}`);
  const lessonIds = [...new Set(scenes.map((s) => s.lessonId))];
  await rodarLote({
    courseId: args.course, maxUsd: args.maxUsd, confirmar: args.confirmar,
    cenas: [...new Set(scenes.map((s) => s.nodeId))], lessonIds, docOverride: doc, extraLines: lines, origin: 'cli-retake',
    persist: async ({ userId, revision }) => {
      await authoring.saveDraft(db, { courseId: args.course, document: doc, expectedRevision: revision, userId, origin: 'media', note: `Refazer tomadas: ${applied.map((a) => `${a.lessonId}/${a.nodeId}#${a.firstShotId}`).join(', ')}` });
      console.log(`Rascunho gravado com as variações (revisão ${revision + 1}).`);
    },
  });
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

/**
 * Gera a mídia (avatar + voz) de UM curso fora do estúdio, com as mesmas regras da rota de orçamento
 * (`POST /api/courses/:id/media-jobs/quote`, via `buildQuoteItems`) e da rota de lote (`.../batch`).
 * O aprovador registrado é o criador do curso (`courses.created_by`); a origem fica como "cli" nos parâmetros do orçamento.
 *
 * Uso (a partir de apps/web; o `.env` da raiz precisa estar carregado no shell):
 *   set -a; . ../../.env; set +a
 *   tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55            # a seco (padrão): calcula e imprime, NÃO grava
 *   ALLOW_PAID_PROVIDERS=1 tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55 --confirmar
 *   tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 10 --cenas v01,v02,q01~a   # só essas cenas (ids de nó), mesmo com vídeo atualizado
 *
 * Modo --confirmar: cria o orçamento e o lote de jobs (outbox `media_job.queued`) e anexa os reaproveitados.
 * Recusa (nada gravado) se: simulação ativa (provedores pagos não liberados NESTE processo), total > --max-usd,
 * erros de cena, teto diário do workspace estourado, ou jobs abertos do curso.
 *
 * IMPORTANTE: este script só ENFILEIRA. Quem chama os provedores é o worker, que precisa estar rodando com o
 * mesmo `.env` carregado e `ALLOW_PAID_PROVIDERS=1`; sem ele os jobs ficam na fila (ou rodam simulados).
 * A lógica vive em `gerar-curso-lote.ts` (compartilhada com `refazer-tomadas.ts`).
 */
import { parseArgs } from './gerar-curso-guardas';
import { rodarLote } from './gerar-curso-lote';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await rodarLote({ courseId: args.course, maxUsd: args.maxUsd, confirmar: args.confirmar, ...(args.cenas ? { cenas: args.cenas } : {}), origin: 'cli' });
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

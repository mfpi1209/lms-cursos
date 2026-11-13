/**
 * Gera a mídia (avatar + voz) de UM curso fora do estúdio, com as mesmas regras da rota de orçamento
 * (`POST /api/courses/:id/media-jobs/quote`, via `buildQuoteItems`) e da rota de lote (`.../batch`).
 * O aprovador registrado é o criador do curso (`courses.created_by`); a origem fica como "cli" nos parâmetros do orçamento.
 *
 * Uso (a partir de apps/web; o `.env` da raiz precisa estar carregado no shell):
 *   set -a; . ../../.env; set +a
 *   tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55            # a seco (padrão): calcula e imprime, NÃO grava
 *   ALLOW_PAID_PROVIDERS=1 tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55 --confirmar
 *
 * Modo --confirmar: cria o orçamento e o lote de jobs (outbox `media_job.queued`) e anexa os reaproveitados.
 * Recusa (nada gravado) se: simulação ativa (provedores pagos não liberados NESTE processo), total > --max-usd,
 * erros de cena, teto diário do workspace estourado, ou jobs abertos do curso.
 *
 * IMPORTANTE: este script só ENFILEIRA. Quem chama os provedores é o worker, que precisa estar rodando com o
 * mesmo `.env` carregado e `ALLOW_PAID_PROVIDERS=1`; sem ele os jobs ficam na fila (ou rodam simulados).
 */
import { eq } from 'drizzle-orm';
import { getDb, authoring, media, schema } from '@lms/db';
import { mediaPriceTable } from '@lms/media';
import { draftFingerprint, getMediaConfig, reusedMediaFor } from '@/server/media';
import { buildQuoteItems } from '@/server/media-quote';
import { mediaBudgetCheck } from '@/server/spend';
import { maskEmail, parseArgs, refusalReasons } from './gerar-curso-guardas';

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const cfg = getMediaConfig();
  const course = await authoring.getCourse(db, args.course);
  if (!course) throw new Error(`curso ${args.course} não existe`);
  const draft = await authoring.getDraft(db, args.course);
  if (!draft) throw new Error(`rascunho de ${args.course} não existe`);
  const doc = draft.document;
  const workspaceId = course.workspaceId;
  const [author] = await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, course.createdBy)).limit(1);
  if (!author) throw new Error('autor do curso não encontrado');
  if (!doc.presentation.avatarId) throw new Error('sem apresentador (avatarId) na apresentação: a rota recusaria o orçamento');
  if (doc.presentation.background.type !== 'color' && doc.presentation.background.assetId) {
    const bg = await media.getAsset(db, doc.presentation.background.assetId);
    if (!bg || bg.workspaceId !== workspaceId || bg.kind !== 'image') throw new Error('a imagem de fundo da apresentação é inválida');
  }

  const { items, errors } = await buildQuoteItems(db, { doc, workspaceId, courseId: args.course, includeStale: true, cfg });
  const totals = media.quoteTotals(items);
  const prices = mediaPriceTable();
  const live = items.filter((i) => !i.reused && !i.open);
  const heygenUsd = live.filter((i) => (i.jobInput as { kind?: string } | undefined)?.kind !== 'screen').reduce((a, i) => a + i.seconds * prices.heygenUsdPerSecond, 0);
  const voiceUsd = totals.estimatedUsd - heygenUsd;
  const budget = await mediaBudgetCheck(workspaceId, totals.estimatedUsd);
  const openJobs = (await media.listJobsForCourse(db, args.course)).filter((j) => j.status === 'queued' || j.status === 'running');

  console.log(`Curso ${course.id} "${course.title}" (workspace ${workspaceId}); aprovador = autor ${maskEmail(author.email)}`);
  console.log(`Modo de mídia: ${cfg.mode} (simulação: ${cfg.simulation}); revisão do rascunho ${draft.revision}`);
  console.log(`Cenas: ${items.length} resolvidas; a produzir ${totals.toProduce}; reaproveitadas ${totals.reused}; com job aberto ${totals.open}; erros ${errors.length}`);
  console.log(`Minutos a produzir: ${(totals.seconds / 60).toFixed(2)} (${totals.chars} caracteres)`);
  console.log(`US$ por provedor: HeyGen ${usd(heygenUsd)} + voz (ElevenLabs/outros) ${usd(voiceUsd)}; TOTAL ${usd(totals.estimatedUsd)} (teto desta execução ${usd(args.maxUsd)})`);
  console.log(`Teto diário do workspace: ${budget.limitUsd === null ? 'sem teto' : usd(budget.limitUsd)}; comprometido 24 h ${usd(budget.spentUsd)}; restante ${budget.remainingUsd === null ? 'n/a' : usd(budget.remainingUsd)}; ${budget.exceeded ? 'NÃO CABE' : 'CABE'}`);
  for (const e of errors) console.log(`  ERRO em ${e.lessonId}/${e.nodeId}: ${e.message}`);
  if (openJobs.length) console.log(`  Jobs abertos do curso: ${openJobs.length}`);

  const reasons = refusalReasons({ simulation: cfg.simulation, totalUsd: totals.estimatedUsd, maxUsd: args.maxUsd, sceneErrors: errors.length, openJobs: openJobs.length, budget, toProduce: totals.toProduce });
  if (!args.confirmar) {
    console.log(reasons.length ? `\n[A SECO] nada gravado. Em --confirmar seria RECUSADO por: ${reasons.join('; ')}` : '\n[A SECO] nada gravado. Em --confirmar seria ACEITO.');
    return;
  }
  if (reasons.length) throw new Error(`RECUSADO (nada gravado): ${reasons.join('; ')}`);

  media.assertWithinBudget(budget);
  const quote = await media.createQuote(db, {
    workspaceId, courseId: args.course, draftRevision: draft.revision, draftHash: draftFingerprint(doc), simulated: cfg.simulation, items,
    params: { lessonIds: null, nodeIds: null, includeStale: true, errors: 0, origin: 'cli', maxUsd: args.maxUsd }, createdBy: author.id,
  });
  const result = await media.createJobsFromQuote(db, {
    quoteId: quote.id, workspaceId, courseId: args.course, userId: author.id,
    currentDraftRevision: draft.revision, currentDraftHash: draftFingerprint(doc), simulated: cfg.simulation,
  });
  let reusedOk = 0;
  for (const it of result.reused) {
    const job = it.reusedJobId ? await media.getJob(db, it.reusedJobId) : null;
    if (!job?.outputAssetId) { console.log(`  reaproveitado sem vídeo: ${it.lessonId}/${it.nodeId}`); continue; }
    try {
      await authoring.setNodeMedia(db, { courseId: args.course, lessonId: it.lessonId, nodeId: it.nodeId, userId: author.id, note: `Mídia reaproveitada (orçamento ${quote.id}, cli)`, media: reusedMediaFor(job, it.sceneHash, String((job.input as { script?: unknown }).script ?? '')) });
      reusedOk++;
    } catch (e) { console.log(`  falha ao anexar ${it.lessonId}/${it.nodeId}: ${e instanceof Error ? e.message : e}`); }
  }
  const approved = result.created.reduce((a, j) => a + Number(j.costEstimatedUsd ?? 0), 0);
  console.log(`\nORÇAMENTO ${quote.id}: ${result.created.length} jobs criados (${result.skippedOpen.length} pulados por job aberto); ${reusedOk}/${result.reused.length} reaproveitados anexados; total aprovado ${usd(approved)}.`);
  console.log('O worker (com ALLOW_PAID_PROVIDERS=1 e o .env carregado) vai processar a fila.');
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

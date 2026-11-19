/**
 * Núcleo compartilhado dos scripts `gerar-curso` e `refazer-tomadas`: orçamento (mesmas regras da rota de cotação),
 * guardas (simulação, teto desta execução, erros de cena, teto diário, jobs abertos) e, em `confirmar`, criação do
 * orçamento + lote de jobs. Só ENFILEIRA; quem chama os provedores é o worker.
 */
import { eq } from 'drizzle-orm';
import { getDb, authoring, media, schema } from '@lms/db';
import { mediaPriceTable } from '@lms/media';
import type { CourseDocument } from '@lms/course-schema';
import { draftFingerprint, getMediaConfig, reusedMediaFor } from '@/server/media';
import { buildQuoteItems } from '@/server/media-quote';
import { mediaBudgetCheck } from '@/server/spend';
import { maskEmail, refusalReasons } from './gerar-curso-guardas';

export const usd = (n: number) => `US$ ${n.toFixed(2)}`;

export interface LoteOptions {
  courseId: string;
  maxUsd: number;
  confirmar: boolean;
  /** ids de nó: só essas cenas (entram mesmo com vídeo atualizado) */
  cenas?: string[];
  /** restringe às aulas (ids): evita pegar um nó de mesmo id em outra aula */
  lessonIds?: string[];
  /** documento a orçar (padrão: o rascunho gravado); a refação orça o rascunho JÁ com as variações, antes de gravá-las */
  docOverride?: CourseDocument;
  /** chamado só em `confirmar`, depois das guardas e antes do orçamento: grava o rascunho (revisão atual = `revision`) */
  persist?: (ctx: { userId: string; revision: number }) => Promise<void>;
  /** linhas extras impressas antes do resumo */
  extraLines?: string[];
  origin: string;
}

export async function rodarLote(opts: LoteOptions) {
  const db = getDb();
  const cfg = getMediaConfig();
  const course = await authoring.getCourse(db, opts.courseId);
  if (!course) throw new Error(`curso ${opts.courseId} não existe`);
  let draft = await authoring.getDraft(db, opts.courseId);
  if (!draft) throw new Error(`rascunho de ${opts.courseId} não existe`);
  let doc = opts.docOverride ?? draft.document;
  const workspaceId = course.workspaceId;
  const [author] = await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, course.createdBy)).limit(1);
  if (!author) throw new Error('autor do curso não encontrado');
  if (!doc.presentation.avatarId) throw new Error('sem apresentador (avatarId) na apresentação: a rota recusaria o orçamento');
  if (doc.presentation.background.type !== 'color' && doc.presentation.background.assetId) {
    const bg = await media.getAsset(db, doc.presentation.background.assetId);
    if (!bg || bg.workspaceId !== workspaceId || bg.kind !== 'image') throw new Error('a imagem de fundo da apresentação é inválida');
  }

  const { items, errors } = await buildQuoteItems(db, { doc, workspaceId, courseId: opts.courseId, ...(opts.cenas ? { nodeIds: opts.cenas } : {}), ...(opts.lessonIds ? { lessonIds: opts.lessonIds } : {}), includeStale: true, cfg });
  const totals = media.quoteTotals(items);
  const prices = mediaPriceTable();
  const live = items.filter((i) => !i.reused && !i.open);
  const heygenUsd = live.filter((i) => (i.jobInput as { kind?: string } | undefined)?.kind !== 'screen').reduce((a, i) => a + i.seconds * prices.heygenUsdPerSecond, 0);
  const voiceUsd = totals.estimatedUsd - heygenUsd;
  const budget = await mediaBudgetCheck(workspaceId, totals.estimatedUsd);
  const openJobs = (await media.listJobsForCourse(db, opts.courseId)).filter((j) => j.status === 'queued' || j.status === 'running');

  console.log(`Curso ${course.id} "${course.title}" (workspace ${workspaceId}); aprovador = autor ${maskEmail(author.email)}`);
  if (opts.cenas) console.log(`Só as cenas: ${opts.cenas.join(', ')} (entram mesmo com vídeo atualizado)`);
  for (const l of opts.extraLines ?? []) console.log(l);
  console.log(`Modo de mídia: ${cfg.mode} (simulação: ${cfg.simulation}); revisão do rascunho ${draft.revision}`);
  console.log(`Cenas: ${items.length} resolvidas; a produzir ${totals.toProduce}; reaproveitadas ${totals.reused}; com job aberto ${totals.open}; erros ${errors.length}`);
  console.log(`Minutos a produzir: ${(totals.seconds / 60).toFixed(2)} (${totals.chars} caracteres)`);
  console.log(`US$ por provedor: HeyGen ${usd(heygenUsd)} + voz (ElevenLabs/outros) ${usd(voiceUsd)}; TOTAL ${usd(totals.estimatedUsd)} (teto desta execução ${usd(opts.maxUsd)})`);
  console.log(`Teto diário do workspace: ${budget.limitUsd === null ? 'sem teto' : usd(budget.limitUsd)}; comprometido 24 h ${usd(budget.spentUsd)}; restante ${budget.remainingUsd === null ? 'n/a' : usd(budget.remainingUsd)}; ${budget.exceeded ? 'NÃO CABE' : 'CABE'}`);
  for (const e of errors) console.log(`  ERRO em ${e.lessonId}/${e.nodeId}: ${e.message}`);
  if (openJobs.length) console.log(`  Jobs abertos do curso: ${openJobs.length}`);

  const reasons = refusalReasons({ simulation: cfg.simulation, totalUsd: totals.estimatedUsd, maxUsd: opts.maxUsd, sceneErrors: errors.length, openJobs: openJobs.length, budget, toProduce: totals.toProduce });
  if (!opts.confirmar) {
    console.log(reasons.length ? `\n[A SECO] nada gravado. Em --confirmar seria RECUSADO por: ${reasons.join('; ')}` : '\n[A SECO] nada gravado. Em --confirmar seria ACEITO.');
    return { items, totals, reasons, estimatedHeygenUsd: heygenUsd };
  }
  if (reasons.length) throw new Error(`RECUSADO (nada gravado): ${reasons.join('; ')}`);

  media.assertWithinBudget(budget);
  let quoteItems = items;
  if (opts.persist) {
    await opts.persist({ userId: author.id, revision: draft.revision });
    draft = (await authoring.getDraft(db, opts.courseId))!;
    doc = draft.document;
    // reorça o rascunho gravado (mesma entrada dos jobs e da impressão do rascunho)
    quoteItems = (await buildQuoteItems(db, { doc, workspaceId, courseId: opts.courseId, ...(opts.cenas ? { nodeIds: opts.cenas } : {}), ...(opts.lessonIds ? { lessonIds: opts.lessonIds } : {}), includeStale: true, cfg })).items;
  }
  const quote = await media.createQuote(db, {
    workspaceId, courseId: opts.courseId, draftRevision: draft.revision, draftHash: draftFingerprint(doc), simulated: cfg.simulation, items: quoteItems,
    params: { lessonIds: opts.lessonIds ?? null, nodeIds: opts.cenas ?? null, includeStale: true, errors: 0, origin: opts.origin, maxUsd: opts.maxUsd }, createdBy: author.id,
  });
  const result = await media.createJobsFromQuote(db, {
    quoteId: quote.id, workspaceId, courseId: opts.courseId, userId: author.id,
    currentDraftRevision: draft.revision, currentDraftHash: draftFingerprint(doc), simulated: cfg.simulation,
  });
  let reusedOk = 0;
  for (const it of result.reused) {
    const job = it.reusedJobId ? await media.getJob(db, it.reusedJobId) : null;
    if (!job?.outputAssetId) { console.log(`  reaproveitado sem vídeo: ${it.lessonId}/${it.nodeId}`); continue; }
    try {
      await authoring.setNodeMedia(db, { courseId: opts.courseId, lessonId: it.lessonId, nodeId: it.nodeId, userId: author.id, note: `Mídia reaproveitada (orçamento ${quote.id}, ${opts.origin})`, media: reusedMediaFor(job, it.sceneHash, String((job.input as { script?: unknown }).script ?? '')) });
      reusedOk++;
    } catch (e) { console.log(`  falha ao anexar ${it.lessonId}/${it.nodeId}: ${e instanceof Error ? e.message : e}`); }
  }
  const approved = result.created.reduce((a, j) => a + Number(j.costEstimatedUsd ?? 0), 0);
  console.log(`\nORÇAMENTO ${quote.id}: ${result.created.length} jobs criados (${result.skippedOpen.length} pulados por job aberto); ${reusedOk}/${result.reused.length} reaproveitados anexados; total aprovado ${usd(approved)}.`);
  console.log('O worker (com ALLOW_PAID_PROVIDERS=1 e o .env carregado) vai processar a fila.');
  return { items: quoteItems, totals, reasons, estimatedHeygenUsd: heygenUsd };
}

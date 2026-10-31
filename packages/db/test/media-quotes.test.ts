import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './setup';
import { DomainError, httpStatusFor, type Database } from '../src';
import { getDraft, saveDraft } from '../src/repositories/authoring';
import { assertWithinBudget, checkBudget, createAsset, createJob, createJobsFromQuote, createQuote, getQuote, mediaSpendSince, aiSpendSince, parseBudgetUsd, quoteTotals, updateJob, type MediaQuoteItem } from '../src/repositories/media';
import { createRun, updateRun } from '../src/repositories/agent';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let userId: string;
let courseId: string;
let workspaceId: string;
let lessonId: string;
let nodeIds: string[];

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  userId = Object.values(seeded.users)[0]!;
  courseId = seeded.courseId;
  workspaceId = seeded.workspaceId;
  const draft = (await getDraft(db, courseId))!;
  const lesson = draft.document.modules.flatMap((m) => m.lessons).find((l) => l.graph.nodes.filter((n) => ['scenario', 'content', 'choice', 'consequence'].includes(n.type)).length >= 3)!;
  lessonId = lesson.id;
  nodeIds = lesson.graph.nodes.filter((n) => ['scenario', 'content', 'choice', 'consequence'].includes(n.type)).map((n) => n.id);
});
afterAll(async () => {
  await close();
});

const item = (nodeId: string, over: Partial<MediaQuoteItem> = {}): MediaQuoteItem => ({
  lessonId, nodeId, title: `Cena ${nodeId}`, chars: 400, seconds: 20, reused: false, estimatedUsd: 0.45, sceneHash: `hash_${nodeId}`,
  adapterVersion: 'heygen-v3.2', jobInput: { script: 'texto', avatarId: 'look_real', voiceProvider: 'heygen', voiceId: null, params: { aspectRatio: '16:9' } }, ...over,
});

async function currentDraft() {
  const d = (await getDraft(db, courseId))!;
  return { revision: d.revision, hash: `h${d.revision}` };
}

describe('orçamento → lote (media_quotes)', () => {
  it('totais: cenas reaproveitadas custam 0 e não entram em caracteres/segundos; abertas ficam de fora', () => {
    const t = quoteTotals([item('a'), item('b', { reused: true, estimatedUsd: 0 }), item('c', { open: true })]);
    expect(t).toEqual({ scenes: 3, reused: 1, open: 1, toProduce: 1, chars: 400, seconds: 20, estimatedUsd: 0.45 });
  });

  it('caminho feliz: cria todos os jobs numa transação com aprovação registrada, pula a cena com job aberto e devolve as reaproveitadas', async () => {
    const [n1, n2, n3] = nodeIds as [string, string, string];
    // n3 já tem um job aberto (pedido avulso anterior)
    const open = await createJob(db, { workspaceId, courseId, lessonId, nodeId: n3, kind: 'video', provider: 'heygen', adapterVersion: 'heygen-v3.2', sceneHash: 'hash_open', input: { script: 'x' }, createdBy: userId, simulated: false });
    // n2 reaproveita um job bem-sucedido
    const asset = await createAsset(db, { workspaceId, kind: 'video', mimeType: 'video/mp4', sizeBytes: 10, storageProvider: 'local', storageKey: 'k', sha256: 's', createdBy: userId });
    const done = await createJob(db, { workspaceId, courseId, lessonId, nodeId: n2, kind: 'video', provider: 'heygen', adapterVersion: 'heygen-v3.2', sceneHash: 'hash_reused', input: { script: 'y' }, createdBy: userId, simulated: false });
    await updateJob(db, done.id, { status: 'succeeded', outputAssetId: asset.id, finishedAt: new Date() });

    const cur = await currentDraft();
    const quote = await createQuote(db, {
      workspaceId, courseId, draftRevision: cur.revision, draftHash: cur.hash, simulated: false, createdBy: userId,
      items: [item(n1), item(n2, { reused: true, reusedJobId: done.id, sceneHash: 'hash_reused', estimatedUsd: 0 }), item(n3, { sceneHash: 'hash_n3' })],
    });
    expect(quote.status).toBe('open');
    expect(quote.totals.toProduce).toBe(2);
    expect(quote.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const r = await createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: cur.revision, currentDraftHash: cur.hash, simulated: false });
    expect(r.created.map((j) => j.nodeId)).toEqual([n1]);
    expect(r.created[0]).toMatchObject({ quoteId: quote.id, approvedBy: userId, costEstimatedUsd: 0.45, simulated: 0, status: 'queued' });
    expect(r.created[0]!.approvedAt).toBeInstanceOf(Date);
    expect(r.reused.map((i) => i.nodeId)).toEqual([n2]);
    expect(r.skippedOpen).toEqual([{ lessonId, nodeId: n3, jobId: open.id }]);
    expect(r.quote.status).toBe('consumed');
    expect(r.quote.consumedBy).toBe(userId);

    // o mesmo orçamento não cria um segundo lote
    await expect(createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: cur.revision, currentDraftHash: cur.hash, simulated: false }))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'consumed' } });
  });

  it('orçamento vencido é recusado (409) sem criar job e fica marcado como expirado', async () => {
    const cur = await currentDraft();
    const quote = await createQuote(db, { workspaceId, courseId, draftRevision: cur.revision, draftHash: cur.hash, simulated: false, createdBy: userId, items: [item('x1', { nodeId: 'x1' })], ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await expect(createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: cur.revision, currentDraftHash: cur.hash, simulated: false }))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'expired' } });
    expect((await getQuote(db, quote.id))!.status).toBe('expired');
  });

  it('rascunho alterado depois da cotação é recusado (409) com as revisões', async () => {
    const before = await currentDraft();
    const quote = await createQuote(db, { workspaceId, courseId, draftRevision: before.revision, draftHash: before.hash, simulated: false, createdBy: userId, items: [item('x2', { nodeId: 'x2' })] });
    const d = (await getDraft(db, courseId))!;
    await saveDraft(db, { courseId, document: { ...d.document, description: `${d.document.description ?? ''} (editado)` }, expectedRevision: d.revision, userId });
    const after = await currentDraft();
    expect(after.revision).toBe(before.revision + 1);
    const err = await createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: after.revision, currentDraftHash: after.hash, simulated: false }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ code: 'CONFLICT', details: { reason: 'revision_changed', quotedRevision: before.revision, currentRevision: after.revision } });
    expect(httpStatusFor[err.code as 'CONFLICT']).toBe(409);
    // mesma revisão mas documento diferente (impressão) também recusa
    await expect(createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: before.revision, currentDraftHash: 'outra-impressao', simulated: false }))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'revision_changed' } });
  });

  it('modo diferente (simulado × real) e outro workspace são recusados', async () => {
    const cur = await currentDraft();
    const quote = await createQuote(db, { workspaceId, courseId, draftRevision: cur.revision, draftHash: cur.hash, simulated: true, createdBy: userId, items: [item('x3', { nodeId: 'x3' })] });
    await expect(createJobsFromQuote(db, { quoteId: quote.id, workspaceId, courseId, userId, currentDraftRevision: cur.revision, currentDraftHash: cur.hash, simulated: false }))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'mode_changed' } });
    await expect(createJobsFromQuote(db, { quoteId: quote.id, workspaceId: 'ws_outro', courseId, userId, currentDraftRevision: cur.revision, currentDraftHash: cur.hash, simulated: true }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('teto diário de gasto', () => {
  it('parseBudgetUsd: vazio = padrão, -1/unlimited = sem teto, número = teto', () => {
    expect(parseBudgetUsd(undefined, 50)).toBe(50);
    expect(parseBudgetUsd('', 50)).toBe(50);
    expect(parseBudgetUsd('abc', 50)).toBe(50);
    expect(parseBudgetUsd('-1', 50)).toBeNull();
    expect(parseBudgetUsd('unlimited', 50)).toBeNull();
    expect(parseBudgetUsd('0', 50)).toBe(0);
    expect(parseBudgetUsd('12.5', 50)).toBe(12.5);
    expect(parseBudgetUsd(7, 50)).toBe(7);
  });

  it('checkBudget/assertWithinBudget: comprometido + pedido > teto => 402 com os valores', () => {
    expect(checkBudget({ kind: 'media', limitUsd: null, spentUsd: 999, addUsd: 999 })).toMatchObject({ exceeded: false, remainingUsd: null });
    expect(checkBudget({ kind: 'media', limitUsd: 50, spentUsd: 40, addUsd: 10 })).toMatchObject({ exceeded: false, remainingUsd: 10 });
    const over = checkBudget({ kind: 'media', limitUsd: 50, spentUsd: 40.004, addUsd: 10.01 });
    expect(over).toMatchObject({ exceeded: true, spentUsd: 40, addUsd: 10.01, remainingUsd: 10 });
    const err = (() => { try { assertWithinBudget(over); return null; } catch (e) { return e as DomainError; } })()!;
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(httpStatusFor.BUDGET_EXCEEDED).toBe(402);
    expect(err.details).toMatchObject({ kind: 'media', limitUsd: 50, spentUsd: 40, addUsd: 10.01 });
    expect(err.message).toMatch(/US\$ 40\.00/);
    expect(checkBudget({ kind: 'ai', limitUsd: 0, spentUsd: 0, addUsd: 0.5 }).exceeded).toBe(true);
  });

  it('gasto de mídia na janela: jobs abertos contam pelo estimado, concluídos pelo real; simulados e cancelados não contam', async () => {
    const since = new Date(Date.now() - 60_000);
    const mk = (nodeId: string, over: Parameters<typeof createJob>[1] extends infer T ? Partial<T> : never) =>
      createJob(db, { workspaceId, courseId, lessonId: 'l_spend', nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'v', sceneHash: `sh_${nodeId}`, input: {}, createdBy: userId, simulated: false, ...over });
    const open = await mk('s1', { costEstimatedUsd: 30 });
    const done = await mk('s2', { costEstimatedUsd: 20 });
    await updateJob(db, done.id, { status: 'succeeded', costActualUsd: 25, finishedAt: new Date() });
    const canceled = await mk('s3', { costEstimatedUsd: 100 });
    await updateJob(db, canceled.id, { status: 'canceled' });
    await mk('s4', { costEstimatedUsd: 100, simulated: true });
    const t = await mediaSpendSince(db, { workspaceId, courseId, since });
    // s1 (aberto, estimado 30) + s2 (real 25); s3 cancelado e s4 simulado fora; mais o job do lote do teste anterior (0.45) e o "open" (null)
    expect(t.openEstimatedUsd).toBeCloseTo(30.45, 6);
    expect(t.actualUsd).toBe(25);
    expect(t.committedUsd).toBeCloseTo(55.45, 6);
    expect(t.openItems).toBe(3);
    const check = checkBudget({ kind: 'media', limitUsd: 50, spentUsd: t.committedUsd, addUsd: 1 });
    expect(check.exceeded).toBe(true);
    expect(() => assertWithinBudget(check)).toThrowError(DomainError);
    expect(open.costEstimatedUsd).toBe(30);
  });

  it('gasto de IA na janela: execuções pagas somam cost_usd e as abertas contam pelo valor estimado; fake não conta', async () => {
    const since = new Date(Date.now() - 60_000);
    const r1 = await createRun(db, { workspaceId, courseId, task: 'outline', lessonId: null, provider: 'openai', model: 'gpt-5', instructionsVersion: 'v', input: {}, createdBy: userId });
    await updateRun(db, r1.id, { status: 'succeeded', costUsd: 1.25 });
    await createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'l1', provider: 'openai', model: 'gpt-5', instructionsVersion: 'v', input: {}, createdBy: userId });
    await createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'l2', provider: 'fake', model: 'fake-deterministic', instructionsVersion: 'v', input: {}, createdBy: userId });
    const t = await aiSpendSince(db, { workspaceId, courseId, since, openRunEstimateUsd: 0.5 });
    expect(t.actualUsd).toBe(1.25);
    expect(t.openItems).toBe(1);
    expect(t.committedUsd).toBe(1.75);
    expect(t.items).toBe(2);
  });
});

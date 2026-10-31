import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileCourse, compileLesson, allLessons, directionNarration, richTextToPlain, SceneDirectionSchema } from '@lms/course-schema';
import { assertDisposableDatabaseUrl, createDb, runMigrations, seed, authoring, agent, sources, media, type Database } from '@lms/db';
import { getStorage } from '@lms/media';
import { claimRun, finishRun, processAgentRun } from '../src/agent';
import { ingestSource } from '../src/sources';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let seededCourseId: string;

function tinyPdf(text: string): Uint8Array {
  const stream = Buffer.from(`BT /F1 12 Tf 40 750 Td (${text}) Tj ET`, 'latin1');
  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  let out = Buffer.from('%PDF-1.4\n');
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]); });
  const xref = out.length;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) tail += `${String(o).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(tail)]));
}

beforeAll(async () => {
  // guarda (auditoria P2): só apaga um banco *_test/*_e2e diferente do DATABASE_URL do ambiente
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'lms-storage-'));
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  userId = seeded.users['autor@demo.local']!;
  workspaceId = seeded.workspaceId;
  seededCourseId = seeded.courseId;
});
afterAll(async () => {
  await close();
});

describe('assistente de montagem (modo demo, banco real)', () => {
  it('fontes: texto colado fica pronto; PDF textual é extraído; PDF sem texto exige OCR', async () => {
    const { id: courseId } = await authoring.createCourse(db, { workspaceId, title: 'Atendimento', createdBy: userId });
    const pasted = await sources.createSource(db, { workspaceId, courseId, title: 'Manual', kind: 'paste', status: 'ready', text: 'Ouvir, confirmar, propor, registrar.', chars: 36, createdBy: userId, processedAt: new Date() });
    expect(pasted.status).toBe('ready');
    const storage = await getStorage();
    const pdf = tinyPdf('Negociar prazos: avise cedo, mostre fatos, proponha alternativa. '.repeat(3));
    await storage.putObject('t/a.pdf', pdf, 'application/pdf');
    const asset = await media.createAsset(db, { workspaceId, kind: 'document', mimeType: 'application/pdf', sizeBytes: pdf.byteLength, storageProvider: 'local', storageKey: 't/a.pdf', sha256: 'x', createdBy: userId });
    const src = await sources.createSource(db, { workspaceId, courseId, title: 'PDF', kind: 'pdf', status: 'processing', assetId: asset.id, createdBy: userId });
    await ingestSource(src.id);
    const after = await sources.getSource(db, src.id);
    expect(after!.status).toBe('ready');
    expect(after!.text).toMatch(/Negociar prazos/);
    expect(after!.pages).toBe(1);
    expect((await sources.listChunks(db, src.id)).length).toBeGreaterThan(0);
    // PDF "digitalizado": sem texto
    const blank = tinyPdf('');
    await storage.putObject('t/b.pdf', blank, 'application/pdf');
    const asset2 = await media.createAsset(db, { workspaceId, kind: 'document', mimeType: 'application/pdf', sizeBytes: blank.byteLength, storageProvider: 'local', storageKey: 't/b.pdf', sha256: 'y', createdBy: userId });
    const src2 = await sources.createSource(db, { workspaceId, courseId, title: 'Scan', kind: 'pdf', status: 'processing', assetId: asset2.id, createdBy: userId });
    await ingestSource(src2.id);
    expect((await sources.getSource(db, src2.id))!.status).toBe('needs_ocr');
  });

  it('estrutura proposta → aplicada → aulas geradas → aplicadas em lote → curso compila', async () => {
    const { id: courseId } = await authoring.createCourse(db, { workspaceId, title: 'Atendimento ao cliente', createdBy: userId });
    const draft0 = (await authoring.getDraft(db, courseId))!;
    const run = await agent.createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await processAgentRun(run.id);
    const done = (await agent.getRun(db, run.id))!;
    expect(done.status).toBe('succeeded');
    expect(done.proposalId).toBeTruthy();
    const proposal = (await agent.getProposal(db, done.proposalId!))!;
    expect(proposal.kind).toBe('outline');
    // duração alvo padrão (15 min) => 4 aulas curtas de demonstração
    expect(proposal.summary).toMatchObject({ lessons: 4 });
    // revisão errada -> CONFLICT
    await expect(agent.applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: 99 })).rejects.toMatchObject({ code: 'CONFLICT' });
    const applied = await agent.applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: draft0.revision });
    expect(applied.revision).toBe(draft0.revision + 1);
    const draft1 = (await authoring.getDraft(db, courseId))!;
    const lessons = allLessons(draft1.document);
    expect(lessons).toHaveLength(4);
    expect(lessons.every((l) => agent.isPlaceholderGraph(l.graph) && l.estimatedMinutes === 3)).toBe(true);
    expect(draft1.document.wizard.completedSteps).toContain('estrutura');
    // aplicar de novo -> já aplicada
    await expect(agent.applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: draft1.revision })).rejects.toMatchObject({ code: 'CONFLICT' });

    const runs = [];
    for (const l of lessons) runs.push(await agent.createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: l.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId }));
    for (const r of runs) await processAgentRun(r.id);
    const proposals = [];
    for (const r of runs) {
      const rr = (await agent.getRun(db, r.id))!;
      expect(rr.status).toBe('succeeded');
      proposals.push(rr.proposalId!);
    }
    const batch = await agent.applyProposalsBatch(db, { proposalIds: proposals, userId, expectedRevision: draft1.revision });
    expect(batch.applied).toBe(4);
    const draft2 = (await authoring.getDraft(db, courseId))!;
    const result = compileCourse(draft2.document);
    expect(result.errors).toEqual([]);
    // aulas curtas: nenhum aviso de extensão; verificação só na última aula
    expect(result.warnings.filter((w) => w.code === 'LESSON_TOO_LONG' || w.code === 'COURSE_TOO_LONG')).toEqual([]);
    const generated = allLessons(draft2.document);
    expect(generated.every((l) => l.graph.nodes.some((n) => n.type === 'choice') && l.graph.nodes.filter((n) => n.type !== 'end').length <= 7)).toBe(true);
    expect(generated.map((l) => l.graph.nodes.some((n) => n.type === 'assessment'))).toEqual([false, false, false, true]);
    const revs = await authoring.listDraftRevisions(db, courseId);
    expect(revs.filter((r) => r.origin === 'agent')).toHaveLength(5);
  });

  it('proposta de aula vira conflito se a aula foi editada depois da proposta', async () => {
    const { id: courseId } = await authoring.createCourse(db, { workspaceId, title: 'Conflito', createdBy: userId });
    const d0 = (await authoring.getDraft(db, courseId))!;
    const outline = await agent.createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await processAgentRun(outline.id);
    await agent.applyProposal(db, { proposalId: (await agent.getRun(db, outline.id))!.proposalId!, userId, expectedRevision: d0.revision });
    const d1 = (await authoring.getDraft(db, courseId))!;
    const lessonId = allLessons(d1.document)[0]!.id;
    const run = await agent.createRun(db, { workspaceId, courseId, task: 'lesson', lessonId, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await processAgentRun(run.id);
    // autor edita a aula enquanto a proposta esperava
    const edited = structuredClone(d1.document);
    const lesson = allLessons(edited).find((l) => l.id === lessonId)!;
    lesson.graph.nodes[0]!.title = 'Editado pelo autor';
    const saved = await authoring.saveDraft(db, { courseId, document: edited, expectedRevision: d1.revision, userId });
    const pid = (await agent.getRun(db, run.id))!.proposalId!;
    await expect(agent.applyProposal(db, { proposalId: pid, userId, expectedRevision: saved.revision })).rejects.toMatchObject({ code: 'CONFLICT', details: { conflict: true } });
    expect((await agent.getProposal(db, pid))!.status).toBe('conflict');
    const forced = await agent.applyProposal(db, { proposalId: pid, userId, expectedRevision: saved.revision, force: true });
    expect(forced.revision).toBe(saved.revision + 1);
  });

  it('revisar aula (demo) → proposta revise_lesson aplicada → compila; variações → apply com choice: 1 troca só a cena-alvo', async () => {
    const courseId = seededCourseId;
    const d0 = (await authoring.getDraft(db, courseId))!;
    const lesson = allLessons(d0.document)[0]!;
    const objectiveIds = new Set(d0.document.objectives.map((o) => o.id));

    // --- revisão da aula 1 ---
    const revise = await agent.createRun(db, { workspaceId, courseId, task: 'revise_lesson', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: { instruction: 'deixe as alternativas mais plausíveis', focus: 'more_plausible_options', nodeId: null }, createdBy: userId });
    await processAgentRun(revise.id);
    const reviseRun = (await agent.getRun(db, revise.id))!;
    expect(reviseRun.status, reviseRun.error ?? '').toBe('succeeded');
    const reviseProposal = (await agent.getProposal(db, reviseRun.proposalId!))!;
    expect(reviseProposal.kind).toBe('revise_lesson');
    expect(reviseProposal.lessonId).toBe(lesson.id);
    expect(reviseProposal.baseRevision).toBe(d0.revision);
    expect(reviseProposal.summary).toMatchObject({ focus: 'more_plausible_options', errors: 0, scenes: lesson.graph.nodes.length });
    expect((reviseProposal.summary as { changed: number }).changed).toBeGreaterThan(0);
    expect((reviseProposal.summary as { conversionWarnings: string[] }).conversionWarnings.length).toBeGreaterThan(0);
    const applied = await agent.applyProposal(db, { proposalId: reviseProposal.id, userId, expectedRevision: d0.revision });
    expect(applied.revision).toBe(d0.revision + 1);
    const d1 = (await authoring.getDraft(db, courseId))!;
    const revised = allLessons(d1.document).find((l) => l.id === lesson.id)!;
    expect(compileLesson(revised.graph, { objectiveIds }).errors).toEqual([]);
    expect(revised.graph.nodes.every((n) => n.title?.endsWith('(revisado)'))).toBe(true);
    expect(revised.graph.nodes.map((n) => n.id)).toEqual(lesson.graph.nodes.map((n) => n.id));
    // o que o roteiro não carrega foi preservado
    expect(revised.graph.variables).toEqual(lesson.graph.variables);
    expect(compileCourse(d1.document).errors).toEqual([]);
    // mesma aula: segunda proposta pendente não pode ser aplicada com a revisão antiga
    await expect(agent.applyProposal(db, { proposalId: reviseProposal.id, userId, expectedRevision: d1.revision })).rejects.toMatchObject({ code: 'CONFLICT' });

    // --- variações de uma decisão ---
    const choiceNode = revised.graph.nodes.find((n) => n.type === 'choice')!;
    const vrun = await agent.createRun(db, { workspaceId, courseId, task: 'scene_variations', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: { instruction: null, focus: null, nodeId: choiceNode.id }, createdBy: userId });
    await processAgentRun(vrun.id);
    const vRun = (await agent.getRun(db, vrun.id))!;
    expect(vRun.status, vRun.error ?? '').toBe('succeeded');
    const vProposal = (await agent.getProposal(db, vRun.proposalId!))!;
    expect(vProposal.kind).toBe('scene_variations');
    expect(vProposal.summary).toMatchObject({ nodeId: choiceNode.id, nodeType: 'choice', variations: 2 });
    const payload = vProposal.payload as { lessonId: string; nodeId: string; variations: Array<{ label: string; graph: { nodes: Array<{ id: string; title?: string }> } }> };
    expect(payload.nodeId).toBe(choiceNode.id);
    expect(payload.variations.map((v) => v.label)).toHaveLength(2);
    // sem choice -> VALIDATION; choice fora do intervalo -> VALIDATION
    await expect(agent.applyProposal(db, { proposalId: vProposal.id, userId, expectedRevision: d1.revision })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(agent.applyProposal(db, { proposalId: vProposal.id, userId, expectedRevision: d1.revision, choice: 5 })).rejects.toMatchObject({ code: 'VALIDATION' });
    const vApplied = await agent.applyProposal(db, { proposalId: vProposal.id, userId, expectedRevision: d1.revision, choice: 1 });
    expect(vApplied.revision).toBe(d1.revision + 1);
    expect((await agent.getProposal(db, vProposal.id))!.summary).toMatchObject({ choice: 1 });
    const d2 = (await authoring.getDraft(db, courseId))!;
    const after = allLessons(d2.document).find((l) => l.id === lesson.id)!;
    const target = after.graph.nodes.find((n) => n.id === choiceNode.id)!;
    expect(target.title).toBe(payload.variations[1]!.graph.nodes.find((n) => n.id === choiceNode.id)!.title);
    expect(target.title).not.toBe(choiceNode.title);
    expect(target.type === 'choice' && richTextToPlain(target.prompt)).toMatch(/^Para situar melhor:/);
    expect(target.type === 'choice' && target.options.map((o) => o.id)).toEqual(choiceNode.type === 'choice' ? choiceNode.options.map((o) => o.id) : []);
    // demais nós intactos
    expect(after.graph.nodes.filter((n) => n.id !== choiceNode.id)).toEqual(revised.graph.nodes.filter((n) => n.id !== choiceNode.id));
    expect(compileLesson(after.graph, { objectiveIds }).errors).toEqual([]);
    const revs = await authoring.listDraftRevisions(db, courseId);
    expect(revs.filter((r) => r.origin === 'agent' && /revise_lesson|scene_variations/.test(r.note ?? ''))).toHaveLength(2);
  });
  it('IA diretora (demo): narração em 2 cenas → scene_direction → aplicada → nós com direção cujas falas reproduzem a narração', async () => {
    const courseId = seededCourseId;
    const d0 = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d0.document);
    const lessons = allLessons(doc);
    const lesson = lessons[1] ?? lessons[0]!;
    const capable = lesson.graph.nodes.filter((n) => n.type === 'scenario' || n.type === 'content' || n.type === 'consequence' || n.type === 'choice');
    expect(capable.length).toBeGreaterThanOrEqual(2);
    const [a, b] = capable as [typeof capable[number], typeof capable[number]];
    const narrations: Record<string, string> = {
      [a.id]: 'Terça, dez horas. Você entra na chamada e a recrutadora sorri. Ela pergunta: “por que esta vaga?”',
      [b.id]: 'Vamos ver como responder. Leve três coisas: o que você sabe, o que já fez e o que quer aprender. Agora é com você.',
    };
    for (const n of lesson.graph.nodes) if (narrations[n.id]) (n as { narration?: string }).narration = narrations[n.id];
    // a cena A já tem vídeo: a direção nova deve marcá-lo como desatualizado
    (lesson.graph.nodes.find((n) => n.id === a.id) as { media?: unknown }).media = { assetId: 'asset_demo_video', kind: 'video' };
    doc.presentation.cameras = [
      { id: 'frente', name: 'Frente', lookId: 'look_frente', nativeFraming: 'medium', angle: 'front', status: 'ready' },
      { id: 'lado', name: 'Lado', lookId: 'look_lado', nativeFraming: 'medium', angle: 'left', status: 'ready' },
    ];
    const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d0.revision, userId });
    const before = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === lesson.id)!;

    const run = await agent.createRun(db, { workspaceId, courseId, task: 'scene_direction', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: { instruction: null, nodeIds: [a.id, b.id] }, createdBy: userId });
    await processAgentRun(run.id);
    const done = (await agent.getRun(db, run.id))!;
    expect(done.status, done.error ?? '').toBe('succeeded');
    const proposal = (await agent.getProposal(db, done.proposalId!))!;
    expect(proposal.kind).toBe('scene_direction');
    expect(proposal.lessonId).toBe(lesson.id);
    expect(proposal.baseRevision).toBe(saved.revision);
    expect(proposal.summary).toMatchObject({ scenes: 2, slides: 1, cameras: 1, errors: [] }); // câmera: só a principal (o painel mostra a apresentadora)
    const payload = proposal.payload as { lessonId: string; scenes: Array<{ nodeId: string; direction: unknown }> };
    expect(payload.lessonId).toBe(lesson.id);
    expect(payload.scenes.map((s) => s.nodeId)).toEqual([a.id, b.id]);

    const applied = await agent.applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: saved.revision });
    expect(applied.revision).toBe(saved.revision + 1);
    expect((await agent.getProposal(db, proposal.id))!.summary).toMatchObject({ applied: 2, staled: 1 });
    const after = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === lesson.id)!;
    for (const id of [a.id, b.id]) {
      const n = after.graph.nodes.find((x) => x.id === id)! as { direction?: unknown; narration?: string };
      const direction = SceneDirectionSchema.parse(n.direction);
      expect(direction.source).toBe('ai');
      expect(direction.shots.length).toBeGreaterThanOrEqual(2);
      expect(directionNarration(direction)).toBe(narrations[id]);
      // câmera única (padrão do estilo): todo plano com apresentador (inclusive o painel) na câmera principal
      expect(direction.shots.every((s) => s.cameraId === 'frente')).toBe(true);
    }
    const nb = after.graph.nodes.find((x) => x.id === b.id)! as { direction?: { shots: Array<{ layout: string; slide?: { bullets: string[]; variant?: string } }> } };
    // a lista vira a apresentadora com o painel de tópicos (cartão padrão), com as palavras-chave em negrito
    expect(nb.direction!.shots[1]!.layout).toBe('presenter_panel');
    expect(nb.direction!.shots[1]!.slide?.variant).toBeUndefined();
    expect(nb.direction!.shots[1]!.slide?.bullets).toEqual(['o que **você sabe**', 'o que **já fez**', 'o que **quer aprender**']);
    expect((after.graph.nodes.find((x) => x.id === a.id) as { media?: { stale?: boolean } }).media?.stale).toBe(true);
    // resto da aula intacto
    const strip = (n: object) => { const { direction, media, ...rest } = n as Record<string, unknown>; return rest; };
    expect(after.graph.nodes.map(strip)).toEqual(before.graph.nodes.map(strip));
    expect(after.graph.edges).toEqual(before.graph.edges);
    expect(after.graph.nodes.filter((n) => n.id !== a.id && n.id !== b.id)).toEqual(before.graph.nodes.filter((n) => n.id !== a.id && n.id !== b.id));
  });
  it('execução do agente: reivindicação atômica (só sai de queued uma vez) e cancelamento nunca é sobrescrito', async () => {
    const { id: courseId } = await authoring.createCourse(db, { workspaceId, title: 'Cancelamento do agente', createdBy: userId });
    const r1 = await agent.createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    expect(await claimRun(r1.id)).toBe(true);
    expect(await claimRun(r1.id)).toBe(false);
    // cancelada durante a execução: o fim da execução não volta para succeeded/failed
    await agent.cancelRun(db, r1.id);
    expect(await finishRun(r1.id, { status: 'succeeded', finishedAt: new Date() })).toBe(false);
    expect((await agent.getRun(db, r1.id))!.status).toBe('canceled');
    // cancelada antes de começar: o worker não executa nem cria proposta
    const r2 = await agent.createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await agent.cancelRun(db, r2.id);
    await processAgentRun(r2.id);
    const after = (await agent.getRun(db, r2.id))!;
    expect(after.status).toBe('canceled');
    expect(after.proposalId).toBeNull();
  });
});

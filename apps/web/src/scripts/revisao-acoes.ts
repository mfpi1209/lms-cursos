/**
 * Plano de ações e prompts da revisão "Assistir e marcar" (estúdio → curso → Assistir e marcar). Nenhum provedor,
 * nenhum job: só lê (exceto `--executada`, que muda o status das marcas).
 *
 *   (padrão)      marcas ABERTAS agrupadas em ações: tomadas a refazer (lista pronta para `--tomadas` e o comando A SECO
 *                 para cotar), emendas, tela simulada (`*.telas.md`, seção, passo, linha e o `(na fala: "…")` sugerido),
 *                 painel de tópicos (`*.topicos.md`), fala/legenda (roteiro) e outros;
 *   --prompts     um PROMPT DE CORREÇÃO consolidado por grupo (um por arquivo de telas com todas as marcas dele; as
 *                 tomadas numa lista com o custo total cotado; tópicos; fala; emendas; outros), pronto para um agente;
 *   --pendentes   marcas "aguardando correção" / "aguardando aprovação de gasto": o prompt gravado e os comandos exatos
 *                 (a seco e `--confirmar`) para o operador executar;
 *   --executada   ids das marcas que o operador já executou: "aguardando correção" → "em reprocessamento" (quando o
 *                 vídeo novo da cena chegar, a página mostra "pronta para conferir").
 *
 * Uso (a partir de apps/web; o `.env` da raiz carregado no shell):
 *   tsx src/scripts/revisao-acoes.ts --course crs_xxx [--aula aula_01] [--json] [--prompts | --pendentes | --executada vrm_a,vrm_b]
 */
import { authoring, getDb, reviewMarks } from '@lms/db';
import { buildBrief, renderGroupBrief, type BriefInput } from '@/lib/video-review/brief';
import { maxUsdFor } from '@/lib/video-review/fix';
import { categoryLabel, fmtTime, type ReviewCategory, type SceneReviewContext } from '@/lib/video-review/resolve';
import { STATUS_LABEL, transition, type MarkStatus } from '@/lib/video-review/status';
import { lessonSceneContexts, resolveSaved } from '@/server/video-review';
import { briefInputFor, loadReviewSpecs, reconcileMarks, retakeQuote, storedPlan } from '@/server/video-review-fix';
import { buildActionPlan, groupBriefs, parseArgs, type ActionItem, type PlannedMark } from './revisao-acoes-calc';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const course = await authoring.getCourse(db, args.course);
  if (!course) throw new Error(`curso ${args.course} não existe`);
  const draft = await authoring.getDraft(db, args.course);
  if (!draft) throw new Error(`rascunho de ${args.course} não existe`);
  const doc = draft.document;
  const ws = course.workspaceId;
  const info = { id: course.id, title: doc.title };

  if (args.executada.length) {
    for (const id of args.executada) {
      const m = await reviewMarks.getMark(db, { workspaceId: ws, markId: id });
      if (!m || m.courseId !== args.course) { console.log(`${id}: não encontrada neste curso`); continue; }
      try {
        const to = transition(m.status as MarkStatus, { type: 'executed' });
        await reviewMarks.updateMark(db, { workspaceId: ws, markId: id, actorId: null, patch: { status: to }, note: 'executada pelo operador' });
        console.log(`${id}: ${STATUS_LABEL[m.status as MarkStatus]} → ${STATUS_LABEL[to]}`);
      } catch (e) {
        console.log(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return;
  }

  // prompts: o que ainda não foi executado (abertas e aguardando correção/aprovação); pendentes: tudo que o operador acompanha
  const statuses: MarkStatus[] = args.pendentes ? ['awaiting_fix', 'awaiting_approval', 'reprocessing', 'ready_to_check'] : args.prompts ? ['open', 'awaiting_fix', 'awaiting_approval'] : ['open'];
  const listed = await reviewMarks.listMarks(db, { workspaceId: ws, courseId: args.course, status: statuses, ...(args.aula ? { lessonId: args.aula } : {}) });
  const scenesByLesson = new Map<string, SceneReviewContext[]>();
  for (const lessonId of [...new Set(listed.map((m) => m.lessonId))]) scenesByLesson.set(lessonId, await lessonSceneContexts(ws, doc, lessonId));
  // pendentes cujo vídeo novo já chegou viram "pronta para conferir"
  const marks = args.pendentes ? (await Promise.all([...scenesByLesson].map(([l, sc]) => reconcileMarks(ws, listed.filter((m) => m.lessonId === l), sc)))).flat() : listed;
  const specs = loadReviewSpecs(doc);
  const inputs = new Map<string, BriefInput>(marks.map((m) => [m.id, briefInputFor(info, m, scenesByLesson.get(m.lessonId) ?? [], specs)]));

  if (args.pendentes) {
    const rows = marks.map((m) => {
      const plan = storedPlan(m);
      const approval = (m.fix as { approval?: { usd?: number; at?: string } } | null)?.approval;
      return { id: m.id, where: `${m.lessonId}/${m.nodeId} ${fmtTime(m.sceneTimeSec)}`, category: categoryLabel(m.category), status: m.status, statusLabel: STATUS_LABEL[m.status as MarkStatus], fixKind: m.fixKind, plan, approvalUsd: m.approvalUsd, approved: approval ?? null, brief: m.brief ?? buildBrief(inputs.get(m.id)!) };
    });
    if (args.json) { console.log(JSON.stringify({ course: args.course, draftRevision: draft.revision, pendentes: rows }, null, 2)); return; }
    const out = [`Pendentes — ${doc.title} (${args.course}) · rascunho rev. ${draft.revision}: ${rows.length}`];
    for (const r of rows) {
      out.push('', `## ${r.id} · ${r.where} · ${r.category} · ${r.statusLabel}${r.plan ? ` · ${r.plan.label}` : ''}`);
      if (r.plan?.reason) out.push(`motivo: ${r.plan.reason}`);
      if (r.status === 'awaiting_approval') out.push(`GASTO A APROVAR: US$ ${(r.approvalUsd ?? 0).toFixed(2)} — aprove na página (Aprovar) antes de executar; não rode --confirmar sem aprovação.`);
      if (r.approved) out.push(`gasto aprovado: US$ ${(r.approved.usd ?? 0).toFixed(2)} em ${r.approved.at ?? '?'}`);
      if (r.plan?.commands.apply?.length) out.push('aplicar e remontar:', ...r.plan.commands.apply.map((c) => `  ${c}`));
      if (r.plan?.commands.dryRun) out.push(`a seco:     ${r.plan.commands.dryRun}`);
      if (r.plan?.commands.confirm && (r.plan.kind !== 'paid' || r.approved)) out.push(`confirmar:  ${r.plan.commands.confirm}`);
      else if (r.plan?.commands.confirm) out.push(`confirmar:  (só depois da aprovação) ${r.plan.commands.confirm}`);
      if (r.status === 'awaiting_fix') out.push(`depois de executar: tsx src/scripts/revisao-acoes.ts --course ${args.course} --executada ${r.id}`);
      out.push('', '````markdown', r.brief.trim(), '````');
    }
    console.log(out.join('\n'));
    return;
  }

  if (args.prompts) {
    const groups = groupBriefs([...inputs.values()]);
    const rendered: Array<{ title: string; marks: string[]; prompt: string }> = [];
    for (const g of groups) {
      const header: string[] = [];
      if (g.key === 'retake') {
        const tomadas = [...new Set(g.items.map((i) => i.resolution?.take?.id).filter((x): x is string => !!x))];
        const usd = await retakeQuote(doc, ws, args.course, tomadas);
        header.push(`Tomadas: --tomadas ${tomadas.join(',')}`, `Custo total cotado (HeyGen + voz, mesmo orçamento do estúdio): US$ ${usd.toFixed(2)} — só execute depois de aprovação explícita deste valor.`, `A seco: cd apps/web && tsx src/scripts/refazer-tomadas.ts --course ${args.course} --tomadas ${tomadas.join(',')} --max-usd ${maxUsdFor(usd)}`);
      }
      rendered.push({ title: g.title, marks: g.items.map((i) => i.mark.id), prompt: renderGroupBrief(g.title, g.items, header) });
    }
    if (args.json) { console.log(JSON.stringify({ course: args.course, draftRevision: draft.revision, prompts: rendered }, null, 2)); return; }
    console.log(rendered.length ? rendered.map((r) => r.prompt).join('\n\n---\n\n') : 'Nenhuma marca aberta.');
    return;
  }

  const planned: PlannedMark[] = marks.map((m) => {
    const scenes = scenesByLesson.get(m.lessonId) ?? [];
    const { resolution, stale } = resolveSaved(m, scenes);
    const scene = scenes.find((s) => s.nodeId === m.nodeId);
    return { id: m.id, lessonId: m.lessonId, nodeId: m.nodeId, sceneTimeSec: m.sceneTimeSec, category: m.category as ReviewCategory, note: m.note, expected: m.expected, resolution, stale, ...(scene ? { scene } : {}) };
  });
  const plan = buildActionPlan(args.course, planned, specs);
  const usd = await retakeQuote(doc, ws, args.course, plan.retakes.tomadas);
  const command = plan.retakes.tomadas.length ? `cd apps/web && tsx src/scripts/refazer-tomadas.ts --course ${args.course} --tomadas ${plan.retakes.tomadas.join(',')} --max-usd ${maxUsdFor(usd)}` : null;

  if (args.json) {
    console.log(JSON.stringify({ ...plan, stem: specs.stem ?? null, aula: args.aula ?? null, draftRevision: draft.revision, retakes: { ...plan.retakes, estimate: { usd }, dryRunCommand: command } }, null, 2));
    return;
  }

  const out: string[] = [];
  out.push(`Plano de ações — ${doc.title} (${args.course})${args.aula ? ` · ${args.aula}` : ''} · rascunho rev. ${draft.revision}`);
  out.push(`${marks.length} marca(s) aberta(s)${specs.stem ? ` · roteiro ${specs.stem}` : ''}`);
  const section = (title: string, items: ActionItem[]) => {
    if (!items.length) return;
    out.push('', `## ${title} (${items.length})`);
    for (const it of items) {
      out.push(`- ${it.where}`);
      out.push(`    ${it.what}`);
      if (it.file) out.push(`    arquivo: ${it.file}`);
      if (it.suggestion) out.push(`    sugestão: ${it.suggestion}`);
      for (const m of it.marks) out.push(`    · marca ${m.id} [${m.category}] ${m.at}: ${m.note || '(sem nota)'}${m.expected ? ` → deveria: ${m.expected}` : ''}`);
    }
  };
  if (plan.retakes.items.length) {
    section('Refazer tomadas', plan.retakes.items);
    out.push('', `  --tomadas ${plan.retakes.tomadas.join(',')}`);
    out.push(`  cotação (mesmo orçamento do estúdio, HeyGen + voz): US$ ${usd.toFixed(2)}`);
    out.push(`  cotar (a seco, não grava nada): ${command}`);
  }
  section('Emendas e cortes', plan.cuts);
  section('Tela simulada (arquivo de telas)', plan.screens);
  section('Painel de tópicos (arquivo de tópicos)', plan.topics);
  section('Fala e legenda (roteiro)', plan.speech);
  section('Outros (decisão manual)', plan.others);
  if (!marks.length) out.push('', 'Nada aberto. Marque problemas em Estúdio → curso → Assistir e marcar.');
  console.log(out.join('\n'));
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

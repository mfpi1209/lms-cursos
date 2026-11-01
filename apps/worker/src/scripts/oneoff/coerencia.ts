/**
 * Revisão de coerência (31/10, grátis, sem regravar): perguntas e atividades contam a história inteira na tela.
 *  - perguntas: "A situação" apresenta o caso sem depender do vídeo e não repete o título; títulos com o nome da
 *    pessoa; trocas pontuais de título/situação/opção (docs/qa/coerencia/spec.json);
 *  - cartão do fim do vídeo: sai quando só repete a chamada que a instrutora acabou de falar (fato + pergunta);
 *  - atividades "Na prática": ponte (`intro`) no topo, título sem "Missão:", enunciado antigo ("Monte sua frase…") apagado.
 * `bridge.call` e as falas não mudam (o player pula o vídeo da pergunta quando a cena anterior já fez a chamada).
 *
 *   MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0 ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/coerencia.ts [--dry-run]
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { adjustScene } from '../../adjust';

const ROOT = new URL('../../../../../', import.meta.url).pathname;
const DRY = process.argv.includes('--dry-run');
const LOG = `${ROOT}docs/qa/coerencia/aplicado.log`;
const COURSES = ['crs_99hpdsc8w88osiuh', 'crs_arbeohlw3xp5v3zx', 'crs_hd4jnnpx3oj0xf14', 'crs_4z17p0m6d43qxmmo', 'crs_4tj8a3q3g9gudgb7', 'crs_b8zeh4b2gguseghq', 'crs_bmf11akamtxoti28', 'crs_8g0csi2hflfztfge', 'crs_gjn468p3y6hwua4f', 'crs_q52zsimeeahpa9bq', 'crs_u4nfw88a4n2n0ubv', 'crs_5vccpfypr6fmxojb', 'crs_gujuaiykqcsl2n31', 'crs_hvvgkvtd1rb2um0l'];
type Spec = {
  pontes: Record<string, string>;
  titulos_atividade: Record<string, string>;
  perguntas: Record<string, { title?: string; sit?: string; options?: Record<string, string> }>;
};
const spec = JSON.parse(readFileSync(`${ROOT}docs/qa/coerencia/spec.json`, 'utf8')) as Spec;

const log = (s: string) => {
  console.log(s);
  if (!DRY) appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`);
};
const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
type Rich = { type: string; text?: string; content?: Rich[] };
const plain = (d: unknown): string => {
  const out: string[] = [];
  const walk = (n: Rich) => {
    if (n.type === 'text') out.push(n.text ?? '');
    for (const c of n.content ?? []) walk(c);
    if (n.type === 'paragraph' || n.type === 'listItem') out.push(' ');
  };
  if (d && typeof d === 'object') walk(d as Rich);
  return out.join('').replace(/\s+/g, ' ').trim();
};
const doc = (text: string) => ({ type: 'doc' as const, content: text ? [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] : [] });
/** tira do fim da situação a pergunta que já está no título logo acima */
function dropTitle(sit: string, title: string): string {
  const t = title.trim();
  if (t && sit.trimEnd().endsWith(t)) return sit.trimEnd().slice(0, -t.length).trim();
  if (norm(sit).endsWith(norm(t))) {
    const parts = sit.split(/(?<=[.!?:])\s+/);
    while (parts.length > 1 && norm(t).endsWith(norm(parts[parts.length - 1]!))) parts.pop();
    return parts.join(' ').trim();
  }
  return sit;
}

type Node = { id: string; type: string; title?: string; prompt?: unknown; intro?: string; bridge?: { call?: string }; options?: Array<{ id: string; label: string }>; media?: { kind?: string; assetId?: string; transcript?: string; adjust?: { teaser?: string | null } } };

async function main() {
  const db = getDb();
  const cards: Array<{ key: string; courseId: string; lessonId: string; nodeId: string }> = [];
  const report: string[] = ['# Revisão de coerência: antes e depois', '', 'Só textos de tela e cartões; nenhuma fala mudou. Pontes: novo campo `intro` da atividade.', ''];
  for (const [ci, courseId] of COURSES.entries()) {
    const d = (await authoring.getDraft(db, courseId))!;
    const draft = structuredClone(d.document) as CourseDocument;
    const lessons = draft.modules.flatMap((m) => m.lessons);
    let n = 0;
    report.push(`## C${String(ci + 1).padStart(2, '0')} · ${draft.title}`, '');
    for (const [li, l] of lessons.entries()) {
      const nodes = l.graph.nodes as unknown as Node[];
      const byId = new Map(nodes.map((x) => [x.id, x]));
      for (const node of nodes) {
        const key = `C${String(ci + 1).padStart(2, '0')}·A${li + 1}·${node.id}`;
        if (node.type === 'choice') {
          const o = spec.perguntas[key] ?? {};
          const beforeTitle = node.title ?? '';
          const beforeSit = plain(node.prompt);
          const title = o.title ?? beforeTitle;
          const sit = dropTitle(o.sit ?? beforeSit, title);
          const lines: string[] = [];
          if (title !== beforeTitle) { node.title = title; lines.push(`- título: “${beforeTitle}” → “${title}”`); n++; }
          if (sit !== beforeSit) { node.prompt = doc(sit); lines.push(`- situação: “${beforeSit}” → “${sit}”`); n++; }
          for (const [optId, label] of Object.entries(o.options ?? {})) {
            const opt = node.options?.find((x) => x.id === optId);
            if (opt && opt.label !== label) { lines.push(`- opção ${optId.toUpperCase()}: ${opt.label} → ${label}`); opt.label = label; n++; }
          }
          // cartão do fim do vídeo anterior: sai se só repete a chamada falada (fato + pergunta)
          const call = node.bridge?.call?.trim() ?? '';
          const preds = [...new Set(l.graph.edges.filter((e) => e.to === node.id).map((e) => e.from))];
          const prev = preds.length === 1 ? byId.get(preds[0]!) : undefined;
          const teaser = prev?.media?.adjust?.teaser;
          const spoken = norm(prev?.media?.transcript ?? '');
          const callFact = call.replace(/\s*Agora, responda:\s*/i, ' ');
          if (prev && prev.type !== 'choice' && typeof teaser === 'string' && call && spoken.endsWith(norm(call)) && /Agora, responda:/i.test(call) && !/^Agora, responda:/i.test(call) && norm(teaser) === norm(callFact)) {
            cards.push({ key: `${key.replace(node.id, prev.id)} (antes de ${node.id})`, courseId, lessonId: l.id, nodeId: prev.id });
            lines.push(`- cartão do fim de ${prev.id}: sai (repetia a chamada falada: “${teaser}”)`);
          }
          if (lines.length) report.push(`**${key}** · ${title}`, ...lines, '');
        }
        if (node.type === 'reflection') {
          const lines: string[] = [];
          const ponte = spec.pontes[key];
          if (ponte && node.intro !== ponte) { lines.push(`- ponte: “${ponte}”`); node.intro = ponte; n++; }
          const t0 = node.title ?? '';
          const t1 = spec.titulos_atividade[key] ?? t0.replace(/^miss[aã]o\s*:\s*/i, '').trim();
          if (t1 && t1 !== t0) { lines.push(`- título: “${t0}” → “${t1}”`); node.title = t1; n++; }
          if (/^monte sua frase/i.test(plain(node.prompt))) { lines.push(`- enunciado antigo apagado: “${plain(node.prompt)}”`); node.prompt = doc(''); n++; }
          if (lines.length) report.push(`**${key}** · ${node.title}`, ...lines, '');
        }
      }
    }
    if (!DRY && n) {
      const saved = await authoring.saveDraft(db, { courseId, document: draft, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `coerência: ${n} texto(s) de tela (perguntas, pontes, títulos)` });
      log(`[texto] C${String(ci + 1).padStart(2, '0')} ${courseId}: ${n} mudança(s); rascunho ${d.revision} → ${saved.revision}`);
    } else log(`[texto] C${String(ci + 1).padStart(2, '0')} ${courseId}: ${n} mudança(s)${DRY ? ' (simulação)' : ''}`);
  }
  for (const c of cards) {
    if (DRY) { log(`[cartão] ${c.key}: sai (simulação)`); continue; }
    try {
      const r = await adjustScene({ courseId: c.courseId, lessonId: c.lessonId, nodeId: c.nodeId, request: { teaser: null } });
      log(`[cartão] ${c.key}: sai · ${r.durationSeconds.toFixed(1)} s`);
    } catch (e) {
      log(`[cartão] ${c.key}: falhou (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  writeFileSync(`${ROOT}docs/qa/coerencia/revisao.md`, report.join('\n'));
  log(`[fim] ${cards.length} cartão(ões) redundante(s)`);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[coerência] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

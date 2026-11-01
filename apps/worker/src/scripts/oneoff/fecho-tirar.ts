/**
 * Escopo do dono (01/11): C24 e C25 (partes 1 e 2 de trilha) NÃO levam a fala de fecho. Tira o plano `fecho` da despedida
 * com o ajuste fino existente (`media.adjust.drop`), remontando a cena a partir dos clipes JÁ pagos (ffmpeg local, nenhum provedor).
 * Mesma técnica de fase0-cortes.ts (copiado dele).
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/fecho-tirar.ts [--dry-run | --apply]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { authoring, getDb } from '@lms/db';
import { syncNarrationFromShots, type CourseDocument } from '@lms/course-schema';
import { adjustOptions } from '@lms/media';
import { adjustScene, loadSceneAdjust } from '../../adjust';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[fecho-tirar] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (a remontagem é local e grátis)');
  process.exit(1);
}
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
if (APPLY && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply');
const PREVIA = args.find((a) => a.startsWith('--previa='))?.slice(9);
const ONLY = new Set((args.find((a) => a.startsWith('--so='))?.slice(5) ?? '').split(',').filter(Boolean));
const SAIDA = args.find((a) => a.startsWith('--saida='))?.slice(8) ?? 'docs/qa/missao-fluxo/fecho-tirar.json';
const SHOT = 'fecho';

interface Cand { course: string; courseId: string; lesson: string; node: string; shot: string; text: string; status: string; id: string; segundosEconomizados: number }
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

async function main() {
  const todos: Cand[] = [
    { course: 'C24', courseId: 'crs_dp9s7pdro9j6e3m0', lesson: 'aula_03', node: 'despedida', shot: SHOT, text: '', status: 'a', id: 'C24', segundosEconomizados: 0 },
    { course: 'C25', courseId: 'crs_0ua5onij460lpzs0', lesson: 'aula_03', node: 'despedida', shot: SHOT, text: '', status: 'a', id: 'C25', segundosEconomizados: 0 },
  ];
  const alvos = todos.filter((c) => !ONLY.size || ONLY.has(`${c.course}/${c.lesson}/${c.node}`));
  console.log(`[fecho-tirar] ${alvos.length} alvo(s) (${APPLY ? 'APPLY' : PREVIA ? 'prévia' : 'dry-run'})`);
  const db = getDb();
  const reg: Array<Record<string, unknown>> = [];
  for (const c of alvos) {
    const chave = `${c.course}/${c.lesson}/${c.node}`;
    const r: Record<string, unknown> = { alvo: chave, courseId: c.courseId, esperadoS: c.segundosEconomizados };
    reg.push(r);
    try {
      const ctx = await loadSceneAdjust(c.courseId, c.lesson, c.node);
      const shots = ctx.node.direction?.shots ?? [];
      const shot = shots.find((s) => s.id === SHOT);
      const jaTirado = (ctx.current.drop ?? []).includes(SHOT);
      if (jaTirado) { r.estado = 'ja-aplicado'; console.log(`[fecho-tirar] ${chave}: já aplicado`); continue; }
      if (!shot) throw new Error(`o nó não tem o plano ${SHOT} na direção (${shots.map((s) => s.id).join(',')})`);
      r.aberturaEm = [];
      const opt = adjustOptions(ctx.base.shots, ctx.input.units!, ctx.wordsByUnit, ctx.current).find((o) => o.id === SHOT);
      if (!opt?.canDrop) throw new Error('adjustOptions: o plano não pode sair sozinho');
      const ordem = ctx.base.shots.map((s) => s.id);
      r.planosAntes = ordem; r.planoAnterior = ordem[ordem.indexOf(SHOT) - 1] ?? null; r.planoSeguinte = ordem[ordem.indexOf(SHOT) + 1] ?? null;
      r.ultimoPlano = ordem.indexOf(SHOT) === ordem.length - 1;
      r.duracaoAntesS = (ctx as unknown as { node: { media?: { durationSeconds?: number } } }).node.media?.durationSeconds ?? null;
      if (!APPLY && !PREVIA) { r.estado = 'aplicaria'; console.log(`[fecho-tirar] ${chave}: ok (${r.ultimoPlano ? 'último plano' : `entre ${r.planoAnterior} e ${r.planoSeguinte}`}); abertura em ${r.aberturaEm}`); continue; }
      if (PREVIA) {
        mkdirSync(PREVIA, { recursive: true });
        const out = path.join(PREVIA, `${c.course}_${c.lesson}_${c.node}.mp4`);
        const rr = await adjustScene({ courseId: c.courseId, lessonId: c.lesson, nodeId: c.node, request: { drop: [SHOT] }, out });
        r.estado = 'previa'; r.arquivo = out; r.duracaoDepoisS = rr.durationSeconds; r.timeline = rr.timeline; r.joins = rr.joins;
        console.log(`[fecho-tirar] ${chave}: prévia ${rr.durationSeconds.toFixed(2)} s`);
        continue;
      }
      const rr = await adjustScene({ courseId: c.courseId, lessonId: c.lesson, nodeId: c.node, request: { drop: [SHOT] } });
      r.estado = 'aplicado'; r.assetId = rr.assetId; r.duracaoDepoisS = rr.durationSeconds; r.timeline = rr.timeline; r.joins = rr.joins; r.transcricao = rr.transcript;
      console.log(`[fecho-tirar] ${chave}: aplicado, ${rr.durationSeconds.toFixed(2)} s (asset ${rr.assetId})`);
    } catch (e) {
      r.estado = 'erro'; r.erro = e instanceof Error ? e.message : String(e);
      console.log(`[fecho-tirar] ${chave}: ERRO ${r.erro}`);
    }
  }
  // fala da cena = soma dos planos que ficam (por curso, com retry de revisão)
  if (APPLY) {
    const porCurso = new Map<string, Array<{ lesson: string; node: string }>>();
    for (const c of alvos) if (reg.find((r) => r.alvo === `${c.course}/${c.lesson}/${c.node}`)?.estado === 'aplicado') porCurso.set(c.courseId, [...(porCurso.get(c.courseId) ?? []), { lesson: c.lesson, node: c.node }]);
    for (const [courseId, itens] of porCurso) {
      for (let t = 1; t <= 8; t++) {
        const d = (await authoring.getDraft(db, courseId))!;
        const doc = structuredClone(d.document) as CourseDocument;
        let n = 0;
        for (const it of itens) {
          const node = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === it.lesson)!.graph.nodes.find((x) => x.id === it.node) as unknown as { narration?: string; direction?: { shots: Array<{ line: string }> } };
          const novo = syncNarrationFromShots(node);
          if (novo !== node) { (node as { narration?: string }).narration = novo.narration; n++; }
        }
        if (!n) break;
        try {
          const s = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `Fecho tirado: fala da cena = planos que ficam (${n})` });
          console.log(`[fecho-tirar] ${courseId}: narração sincronizada em ${n} cena(s); rascunho ${d.revision} → ${s.revision}`);
          break;
        } catch (e) {
          if (t === 8) throw e;
          await new Promise((res) => setTimeout(res, 700 * t));
        }
      }
    }
  }
  writeFileSync(SAIDA, JSON.stringify({ geradoEm: new Date().toISOString(), modo: APPLY ? 'apply' : PREVIA ? 'previa' : 'dry-run', registros: reg }, null, 1));
  const cont = (e: string) => reg.filter((r) => r.estado === e).length;
  console.log(`[fecho-tirar] aplicado ${cont('aplicado')}, prévia ${cont('previa')}, aplicaria ${cont('aplicaria')}, já ${cont('ja-aplicado')}, erro ${cont('erro')}; relatório ${SAIDA}`);
}

main().then(() => process.exit(0), (e) => { console.error(`[fecho-tirar] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

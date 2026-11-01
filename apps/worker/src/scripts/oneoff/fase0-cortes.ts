/**
 * Fase 0 da expansão (grátis): tira o plano `missao_fim` (anúncio repetido da missão no fim do vídeo) dos 28 vídeos
 * "status a" de docs/qa/expansao-analise/cortes.json (C03–C14; C01 fica de fora de propósito) com o ajuste fino
 * existente (`media.adjust.drop`), remontando a cena a partir dos clipes JÁ pagos (ffmpeg local, nenhum provedor).
 * A abertura da aula (`missao`) NUNCA é tocada. Depois do corte, a fala da cena (`narration`) passa a ser a soma dos
 * planos que ficam (padrão de revisao-final), só esse campo.
 *
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/fase0-cortes.ts [--dry-run | --apply] [--so=C03/aula_01/v01,…] [--previa=<pasta>] [--saida=arq.json]
 *
 *   --dry-run (padrão)  confere cada alvo e diz o que faria
 *   --previa=<pasta>    gera só o MP4 de prévia de cada alvo (não anexa nem grava)
 *   --apply             corta de verdade (anexa o vídeo novo, grava o rascunho)
 * Idempotente: alvo cujo plano já está em `media.adjust.drop` é pulado.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { authoring, getDb } from '@lms/db';
import { syncNarrationFromShots, type CourseDocument } from '@lms/course-schema';
import { adjustOptions } from '@lms/media';
import { adjustScene, loadSceneAdjust } from '../../adjust';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[fase0-cortes] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (a remontagem é local e grátis)');
  process.exit(1);
}
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
if (APPLY && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply');
const PREVIA = args.find((a) => a.startsWith('--previa='))?.slice(9);
const ONLY = new Set((args.find((a) => a.startsWith('--so='))?.slice(5) ?? '').split(',').filter(Boolean));
const SAIDA = args.find((a) => a.startsWith('--saida='))?.slice(8) ?? 'docs/qa/expansao-analise/fase0.cortes.json';
const SHOT = 'missao_fim';

interface Cand { course: string; courseId: string; lesson: string; node: string; shot: string; text: string; status: string; id: string; segundosEconomizados: number }
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

async function main() {
  const todos = (JSON.parse(readFileSync('docs/qa/expansao-analise/cortes.json', 'utf8')).candidatos as Cand[]).filter((c) => c.status === 'a' && c.shot === SHOT && c.course !== 'C01');
  const alvos = todos.filter((c) => !ONLY.size || ONLY.has(`${c.course}/${c.lesson}/${c.node}`));
  console.log(`[fase0-cortes] ${alvos.length} alvo(s) (${APPLY ? 'APPLY' : PREVIA ? 'prévia' : 'dry-run'})`);
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
      if (jaTirado) { r.estado = 'ja-aplicado'; console.log(`[fase0-cortes] ${chave}: já aplicado`); continue; }
      if (!shot) throw new Error(`o nó não tem o plano ${SHOT} na direção (${shots.map((s) => s.id).join(',')})`);
      if (norm(shot.line) !== norm(c.text)) throw new Error(`fala do ${SHOT} mudou: "${shot.line}" ≠ "${c.text}"`);
      // a abertura da aula (qualquer nó dela) continua anunciando a missão
      const doc = ctx.draft.document as CourseDocument;
      const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === c.lesson)!;
      const aberturas = (lesson.graph.nodes as unknown as Array<{ id: string; direction?: { shots: Array<{ id: string }> }; media?: { adjust?: { drop?: string[] } } }>)
        .filter((n) => n.direction?.shots.some((s) => s.id === 'missao') && !(n.media?.adjust?.drop ?? []).includes('missao'));
      if (!aberturas.length) throw new Error('a aula ficaria sem o plano de abertura `missao`; não cortei');
      r.aberturaEm = aberturas.map((n) => n.id);
      const opt = adjustOptions(ctx.base.shots, ctx.input.units!, ctx.wordsByUnit, ctx.current).find((o) => o.id === SHOT);
      if (!opt?.canDrop) throw new Error('adjustOptions: o plano não pode sair sozinho');
      const ordem = ctx.base.shots.map((s) => s.id);
      r.planosAntes = ordem; r.planoAnterior = ordem[ordem.indexOf(SHOT) - 1] ?? null; r.planoSeguinte = ordem[ordem.indexOf(SHOT) + 1] ?? null;
      r.ultimoPlano = ordem.indexOf(SHOT) === ordem.length - 1;
      r.duracaoAntesS = (ctx as unknown as { node: { media?: { durationSeconds?: number } } }).node.media?.durationSeconds ?? null;
      if (!APPLY && !PREVIA) { r.estado = 'aplicaria'; console.log(`[fase0-cortes] ${chave}: ok (${r.ultimoPlano ? 'último plano' : `entre ${r.planoAnterior} e ${r.planoSeguinte}`}); abertura em ${r.aberturaEm}`); continue; }
      if (PREVIA) {
        mkdirSync(PREVIA, { recursive: true });
        const out = path.join(PREVIA, `${c.course}_${c.lesson}_${c.node}.mp4`);
        const rr = await adjustScene({ courseId: c.courseId, lessonId: c.lesson, nodeId: c.node, request: { drop: [SHOT] }, out });
        r.estado = 'previa'; r.arquivo = out; r.duracaoDepoisS = rr.durationSeconds; r.timeline = rr.timeline; r.joins = rr.joins;
        console.log(`[fase0-cortes] ${chave}: prévia ${rr.durationSeconds.toFixed(2)} s`);
        continue;
      }
      const rr = await adjustScene({ courseId: c.courseId, lessonId: c.lesson, nodeId: c.node, request: { drop: [SHOT] } });
      r.estado = 'aplicado'; r.assetId = rr.assetId; r.duracaoDepoisS = rr.durationSeconds; r.timeline = rr.timeline; r.joins = rr.joins; r.transcricao = rr.transcript;
      console.log(`[fase0-cortes] ${chave}: aplicado, ${rr.durationSeconds.toFixed(2)} s (asset ${rr.assetId})`);
    } catch (e) {
      r.estado = 'erro'; r.erro = e instanceof Error ? e.message : String(e);
      console.log(`[fase0-cortes] ${chave}: ERRO ${r.erro}`);
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
          const s = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `Fase 0: fala da cena = planos que ficam (${n})` });
          console.log(`[fase0-cortes] ${courseId}: narração sincronizada em ${n} cena(s); rascunho ${d.revision} → ${s.revision}`);
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
  console.log(`[fase0-cortes] aplicado ${cont('aplicado')}, prévia ${cont('previa')}, aplicaria ${cont('aplicaria')}, já ${cont('ja-aplicado')}, erro ${cont('erro')}; relatório ${SAIDA}`);
}

main().then(() => process.exit(0), (e) => { console.error(`[fase0-cortes] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });

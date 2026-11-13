/**
 * Orçamento SÓ-LEITURA de geração (avatar + voz) de cursos em rascunho.
 * Replica a lógica da rota `POST /api/courses/:id/media-jobs/quote` (sem criar cotação, job, nem chamar provedor).
 *
 * Uso (a partir de apps/web):
 *   set -a; . ../../.env; set +a
 *   tsx src/scripts/orcamento-cursos.ts crs_a crs_b ...        # imprime Markdown
 *   BRL_PER_USD=5.5 tsx src/scripts/orcamento-cursos.ts ...    # opcional: converte para R$ (o pricing não tem câmbio)
 *
 * Diferenças para a rota: sem autenticação/viewer (workspace vem do curso); não grava cotação; não valida
 * o asset de fundo; o teto usa `mediaBudgetCheck` (leitura) sobre o total geral dos cursos.
 */
import { getDb, authoring, media } from '@lms/db';
import { allLessons, findLesson, mediaSceneOf, reactionScenes, mediaPresentationStale, type MediaRef } from '@lms/course-schema';
import { mediaPriceTable } from '@lms/media';
import { MEDIA_NODE_TYPES, backgroundExtras, directedPartialReuse, getMediaConfig, recomposeAlphaKey, resolveSceneProduction, sceneRequestFromPresentation, scenePresentationFingerprint, spokenTextOfNode } from '@/server/media';
import { mediaBudgetCheck, workspaceSpendLimits, dailyBudgetUsd } from '@/server/spend';
import { summarize, type QuoteLine } from './orcamento-calc';

const reactionNode = (nodeId: string) => nodeId.includes('~');

async function quoteCourse(courseId: string) {
  const db = getDb();
  const cfg = getMediaConfig();
  const course = await authoring.getCourse(db, courseId);
  if (!course) throw new Error(`curso ${courseId} não existe`);
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) throw new Error(`rascunho de ${courseId} não existe`);
  const doc = draft.document;
  const workspaceId = course.workspaceId;
  const blockers: string[] = [];
  if (!doc.presentation.avatarId) blockers.push('sem apresentador (avatarId) na apresentação: a rota recusaria o orçamento');

  const candidates: Array<{ lessonId: string; nodeId: string; title: string }> = [];
  for (const l of allLessons(doc)) {
    for (const n of [...l.graph.nodes, ...reactionScenes(l.graph)]) {
      if (!MEDIA_NODE_TYPES.has(n.type)) continue;
      const text = 'narration' in n && typeof n.narration === 'string' && n.narration.trim() ? n.narration : spokenTextOfNode(n as never);
      if (!text.trim()) continue;
      const m = (n as { media?: MediaRef }).media;
      const stale = !!m && (m.stale === true || mediaPresentationStale(m, doc.presentation, n));
      if (m && !stale) continue; // vídeo atual: nada a gerar (includeStale=true: desatualizados entram)
      candidates.push({ lessonId: l.id, nodeId: n.id, title: n.title ?? n.id });
    }
  }

  const errors: Array<{ nodeId: string; message: string }> = [];
  const resolved: Array<ReturnType<typeof resolveSceneProduction>> = [];
  if (!blockers.length) {
    for (const c of candidates) {
      try { resolved.push(resolveSceneProduction(doc, sceneRequestFromPresentation(doc, c.lessonId, c.nodeId), cfg)); }
      catch (e) { errors.push({ nodeId: c.nodeId, message: (e as Error).message }); }
    }
  }

  const reusable = await media.findSucceededJobsByHashes(db, { workspaceId, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: cfg.simulation });
  const alphaKeys = new Map(resolved.map((r) => [r.sceneHash, recomposeAlphaKey(r)] as const));
  const recomposable = await media.findRecomposeSourcesByAlphaKeys(db, { workspaceId, alphaKeys: [...alphaKeys.values()].filter((k): k is string => !!k) });
  const realDone = cfg.simulation ? await media.findSucceededJobsByHashes(db, { workspaceId, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: false }) : reusable;

  const partial = new Map<string, NonNullable<ReturnType<typeof directedPartialReuse>>>();
  for (const r of resolved) {
    if (reusable.get(r.sceneHash) ?? realDone.get(r.sceneHash)) continue;
    const lessonGraph = findLesson(doc, r.lessonId)?.lesson.graph;
    const node = lessonGraph ? mediaSceneOf(lessonGraph, r.nodeId) : null;
    const prevJobId = node && 'media' in node ? node.media?.generatedFrom?.jobId : undefined;
    if (!prevJobId) continue;
    const prev = await media.getJob(db, prevJobId);
    if (!prev || prev.status !== 'succeeded' || prev.workspaceId !== workspaceId) continue;
    const prevInput = (prev.input ?? {}) as Record<string, unknown>;
    const prevCameraIds = ((prevInput.direction as { shots?: Array<{ cameraId?: string }> } | undefined)?.shots ?? []).map((s) => s.cameraId).filter((x): x is string => !!x);
    const req = sceneRequestFromPresentation(doc, r.lessonId, r.nodeId);
    const fp = scenePresentationFingerprint(doc.presentation, req, backgroundExtras(doc.presentation, req), prevCameraIds);
    const p = directedPartialReuse({ jobId: prev.id, input: prevInput, adapterVersion: prev.adapterVersion, simulated: prev.simulated === 1 }, r, cfg.simulation, fp);
    if (p) partial.set(`${r.lessonId}:${r.nodeId}`, p);
  }

  const lines: QuoteLine[] = resolved.map((r) => {
    const kind = (r.jobInput as { kind?: string }).kind === 'screen' ? 'screen' : 'avatar';
    const base = { lessonId: r.lessonId, nodeId: r.nodeId, title: r.title, kind: kind as 'avatar' | 'screen', reaction: reactionNode(r.nodeId) };
    const reuse = reusable.get(r.sceneHash) ?? realDone.get(r.sceneHash);
    const reused = !!reuse?.outputAssetId;
    const alphaKey = alphaKeys.get(r.sceneHash) ?? null;
    if (!reused && alphaKey && recomposable.get(alphaKey)) return { ...base, seconds: r.estimate.narrationSeconds, chars: r.estimate.characters, usd: 0, reused: true };
    const part = !reused ? partial.get(`${r.lessonId}:${r.nodeId}`) : undefined;
    if (part) return { ...base, seconds: part.seconds, chars: part.chars, usd: part.estimatedUsd, reused: false };
    return { ...base, seconds: r.estimate.narrationSeconds, chars: r.estimate.characters, usd: reused ? 0 : r.estimate.estimatedUsd, reused };
  });
  return { courseId, title: String(course.title), workspaceId, lines, totals: summarize(lines), errors, blockers, candidates: candidates.length };
}

const fmt = (n: number) => n.toFixed(2);
const usd = (n: number) => `US$ ${n.toFixed(2)}`;

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('informe os ids dos cursos');
  const brl = Number(process.env.BRL_PER_USD ?? NaN);
  const cfg = getMediaConfig();
  const prices = mediaPriceTable();
  const rs = [];
  for (const id of ids) rs.push(await quoteCourse(id));
  const rUsd = (n: number) => (Number.isFinite(brl) ? ` / R$ ${fmt(n * brl)}` : '');

  console.log(`Modo de mídia: ${cfg.mode} (simulação: ${cfg.simulation}). Preços: ElevenLabs US$ ${prices.elevenLabsUsdPer1kChars}/1k caracteres; HeyGen US$ ${prices.heygenUsdPerSecond.toFixed(5)}/s (US$ ${(prices.heygenUsdPerSecond * 60).toFixed(2)}/min); cinematic US$ ${prices.heygenCinematicUsdPerSecond}/s.\n`);
  console.log('| Curso | Avatar cenas | Avatar min | Avatar US$ | Tela cenas | Tela min | Tela US$ | Reaç. cenas | Reaç. US$ | Reaprov. cenas | Total US$ |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const sum = { a: 0, am: 0, au: 0, s: 0, sm: 0, su: 0, r: 0, ru: 0, re: 0, t: 0 };
  rs.forEach((r, i) => {
    const t = r.totals;
    console.log(`| C${i + 1} ${r.courseId} | ${t.avatar.scenes} | ${fmt(t.avatar.minutes)} | ${fmt(t.avatar.usd)} | ${t.screen.scenes} | ${fmt(t.screen.minutes)} | ${fmt(t.screen.usd)} | ${t.reactions.scenes} | ${fmt(t.reactions.usd)} | ${t.reused.scenes} | ${fmt(t.totalUsd)}${rUsd(t.totalUsd)} |`);
    sum.a += t.avatar.scenes; sum.am += t.avatar.minutes; sum.au += t.avatar.usd; sum.s += t.screen.scenes; sum.sm += t.screen.minutes; sum.su += t.screen.usd; sum.r += t.reactions.scenes; sum.ru += t.reactions.usd; sum.re += t.reused.scenes; sum.t += t.totalUsd;
  });
  console.log(`| **Total** | ${sum.a} | ${fmt(sum.am)} | ${fmt(sum.au)} | ${sum.s} | ${fmt(sum.sm)} | ${fmt(sum.su)} | ${sum.r} | ${fmt(sum.ru)} | ${sum.re} | **${fmt(sum.t)}${rUsd(sum.t)}** |`);
  console.log('\n(Reações já estão incluídas nas colunas Avatar; "Reaprov." = cenas com vídeo já pago, custo 0.)\n');
  // decomposição por provedor (mesma fórmula de estimateMediaCostUsd): HeyGen = segundos de avatar; ElevenLabs = caracteres de todas as cenas com voz ElevenLabs
  const pr = prices;
  const split = rs.map((r) => {
    const live = r.lines.filter((l) => !l.reused);
    const heygen = live.filter((l) => l.kind === 'avatar').reduce((a, l) => a + l.seconds * pr.heygenUsdPerSecond, 0);
    return { heygen, voice: r.totals.totalUsd - heygen, chars: live.reduce((a, l) => a + l.chars, 0) };
  });
  console.log('\nDecomposição por provedor (US$): ' + rs.map((r, i) => `C${i + 1} HeyGen ${fmt(split[i]!.heygen)} + voz ${fmt(split[i]!.voice)} (${split[i]!.chars} car.)`).join('; ') + `; TOTAL HeyGen ${fmt(split.reduce((a, s) => a + s.heygen, 0))} + voz ${fmt(split.reduce((a, s) => a + s.voice, 0))}.`);
  console.log(Number.isFinite(brl) ? `Câmbio usado: R$ ${brl}/US$ (parâmetro BRL_PER_USD; o pricing não tem conversão).` : 'Sem conversão para R$: o pricing não tem câmbio (passe BRL_PER_USD para ver).');
  for (const r of rs) {
    console.log(`\n${r.courseId} "${r.title}": ${r.candidates} cenas elegíveis, ${r.lines.length} resolvidas.`);
    for (const b of r.blockers) console.log(`  BLOQUEIO: ${b}`);
    for (const e of r.errors) console.log(`  ERRO em ${e.nodeId}: ${e.message}`);
  }
  for (const w of [...new Set(rs.map((r) => r.workspaceId))]) {
    const limits = await workspaceSpendLimits(w);
    const limit = dailyBudgetUsd('media', limits);
    const chk = await mediaBudgetCheck(w, sum.t);
    console.log(`\nWorkspace ${w}: spend_limits=${JSON.stringify(limits)}; teto diário de mídia efetivo = ${limit === null ? 'sem teto' : usd(limit)}; já comprometido nas últimas 24 h = ${usd(chk.spentUsd)}; este orçamento = ${usd(sum.t)}; restante = ${chk.remainingUsd === null ? 'n/a' : usd(chk.remainingUsd)}; ${chk.exceeded ? 'NÃO CABE em 24 h (estoura o teto)' : 'CABE'}.`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

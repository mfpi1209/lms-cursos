#!/usr/bin/env -S apps/worker/node_modules/.bin/tsx
/**
 * RAIO-X dos 26 cursos (C01…C26) para o pente-fino do dono: lê do banco o RASCUNHO e a VERSÃO PUBLICADA de cada
 * curso (só leitura) e escreve
 *   docs/qa/raio-x/raio-x.json     um objeto por curso (meta, aulas, nós na ordem do caminho principal, alertas)
 *   docs/qa/raio-x/resumo.md       contagens por curso e por tipo de alerta + os 30 alertas mais graves
 *   docs/qa/raio-x/asr-cache.json  transcrição real (whisper.cpp) por id de asset: só o que falta é rodado
 *
 * Gerar / regerar (idempotente; roda o ASR só do que ainda não está no cache, no máximo 2 whisper, prioridade baixa):
 *   apps/worker/node_modules/.bin/tsx tools/raio-x/gerar.mjs
 * Opções:
 *   --sem-asr        não roda whisper (usa só o cache); --so-asr roda o ASR e não gera o JSON
 *   --refinar        refaz com whisper os itens herdados do qa-rascunhos (texto normalizado, sem tempos)
 *   --cursos C01,C06 limita os cursos (ASR e saída); --limite N  roda no máximo N vídeos novos de ASR
 *
 * Raio-X por plano (cada fala, enquadramento, zoom, câmera, gesto, cartão, transição, status gravado/novo/cortado, tempo no vídeo
 * final por alinhamento das falas com as palavras do whisper, desengasgo) e "o que mudou no rascunho" (vs. a versão publicada).
 *
 * Não escreve no banco, não chama provedor de mídia, não toca em apps/worker, packages/media nem apps/web.
 * As regras vêm do código real: título da pergunta = splitPrompt do player, duração = video-runtime.ts,
 * chamada = bridge.ts, trilhas = trails.ts, nome curto = short-titles.ts.
 */
import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURSOS, RAIZ, sql } from '../robo-aluno/dados.mjs';
import { richTextToPlain } from '../../packages/course-schema/src/richtext.ts';
import { spokenWords, sameWords, CAMERA_ZONE_LABELS, CAMERA_PLACEMENT_LABELS, CINEMATIC_ACTION_LABELS } from '../../packages/course-schema/src/direction.ts';
import { keptSegments } from '../../packages/media/src/adjust.ts';
import { framingPunchPlan, JOIN } from '../../packages/media/src/compose/join.ts';
import { framingCropRatio } from '../../packages/media/src/compose/compose.ts';
import { assembleScaffold } from '../../packages/course-schema/src/scaffold.ts';
import { callStatuses } from '../../packages/course-schema/src/bridge.ts';
import { courseVideoRange, lessonVideoRange, formatCourseVideo, formatLessonVideo, questionVideoSkipped, formatClock } from '../../packages/course-schema/src/video-runtime.ts';
import { TRAIL_CHECKS, trailSlug } from '../../packages/course-schema/src/trails.ts';
import { shortTitleFor } from '../../apps/web/src/app/(lms)/aprender/_lib/short-titles.ts';
import { MODELO, MODELO_NOME, comparar, gravarCache, importarQaRascunhos, lerCache, rodarFila } from './asr.mjs';
import { escreverResumo } from './resumo.mjs';
import { planoDeAnuncio, marcadoresDasPropostas } from '../robo-aluno/anuncio.mjs';

const MARCADORES_ANUNCIO = marcadoresDasPropostas(RAIZ);

const SAIDA = process.env.RAIOX_SAIDA ? resolve(process.env.RAIOX_SAIDA) : resolve(RAIZ, 'docs/qa/raio-x');
const CACHE = process.env.RAIOX_CACHE ? resolve(process.env.RAIOX_CACHE) : resolve(SAIDA, 'asr-cache.json');
const QA_RASCUNHOS = '/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/asr/qa-rascunhos.json';
const arg = (n) => process.argv.includes(n);
const argv = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};

/* ---------------------------------------------------------------------------------------------------------
 * Regra do título da pergunta: a MESMA do player (splitPrompt, apps/web/src/components/player/immersive/theme.ts).
 * Se o import falhar (o arquivo é de outro agente e pode mudar), usa a cópia abaixo e avisa no JSON.
 * ------------------------------------------------------------------------------------------------------- */
let splitPrompt;
let chipFor = null;
let regraTitulo = 'player';
try {
  const t = await import('../../apps/web/src/components/player/immersive/theme.ts');
  splitPrompt = t.splitPrompt;
  chipFor = t.chipFor;
} catch (e) {
  regraTitulo = `copia (import do player falhou: ${e instanceof Error ? e.message.slice(0, 80) : e})`;
  splitPrompt = (prompt, fallbackTitle) => {
    const plain = richTextToPlain(prompt).replace(/\s+/g, ' ').trim();
    if (!plain) return { heading: fallbackTitle, lead: null, leadDoc: null };
    const sentences = plain.split(/(?<=[.!?…]["”»)]?)\s+(?=[A-ZÀ-Ý“"(¿¡0-9])/u).filter(Boolean);
    const qi = sentences.findIndex((x) => /\?["”»)]?$/.test(x) && x.length <= 120);
    if (qi >= 0 && (sentences.length > 1 || plain.length <= 120)) {
      const rest = [...sentences.slice(0, qi), ...sentences.slice(qi + 1)].join(' ').trim();
      return { heading: sentences[qi], lead: rest || null, leadDoc: null };
    }
    if (plain.length <= 110) return { heading: plain, lead: null, leadDoc: null };
    return { heading: fallbackTitle, lead: null, leadDoc: prompt };
  };
}

/* ------------------------------------------------------------------------------------------------------- */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const plano = (doc) => richTextToPlain(doc).replace(/[ \t]+/g, ' ').trim();
const contar = (t) => spokenWords(t || '').length;
const semAspas = (t) => (t || '').replace(/^["“”«»\s]+|["“”«»\s]+$/g, '').trim();
const frases = (t) => (t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”»)]?)\s+/u).filter(Boolean);
const normTxt = (t) => spokenWords(t).join(' ');

const GRAVIDADE = { alta: 3, media: 2, baixa: 1, info: 0 };
const QUALIDADE = { strong: 'forte', ok: 'média', weak: 'fraca' };
const ROTULO_TIPO = {
  scenario: 'Cena',
  content: 'Explicação',
  consequence: 'Consequência',
  choice: 'Pergunta',
  reflection: 'Missão (Na prática)',
  assessment: 'Avaliação',
  end: 'Fim da aula',
};
const nomeSituacao = { published: 'publicado', draft: 'rascunho', archived: 'arquivado' };

/* ----------------------------------- rótulos em português (direção) ----------------------------------- */
const ROTULO_ENQUADRAMENTO = { wide: 'plano aberto', medium: 'plano médio', close: 'plano fechado', extreme_close: 'plano muito fechado' };
const NIVEL_ENQUADRAMENTO = { wide: 0, medium: 1, close: 2, extreme_close: 3 };
const ROTULO_MOVIMENTO = { static: 'parada', push_in: 'zoom in (aproxima)', pull_out: 'zoom out (afasta)', pan_left: 'panorâmica para a esquerda', pan_right: 'panorâmica para a direita', drift: 'deriva lenta' };
const ROTULO_TRANSICAO = { cut: 'corte seco', crossfade: 'fusão (crossfade)', whip: 'giro rápido (whip)', dip_to_color: 'mergulho na cor (fade pela cor)' };
const ROTULO_LAYOUT = {
  presenter: 'apresentador(a) em tela cheia',
  presenter_slide_right: 'apresentador(a) à esquerda + slide à direita',
  presenter_slide_left: 'slide à esquerda + apresentador(a) à direita',
  slide_with_pip: 'slide em tela cheia + apresentador(a) em janela no canto',
  slide: 'só o slide (a voz continua)',
  lower_third: 'apresentador(a) com letreiro embaixo',
  cinematic: 'cena em movimento (caminha/age sem falar; a narração toca por cima)',
  card: 'cartão de marca em tela cheia (voz continua)',
  presenter_panel: 'apresentador(a) + painel de tópicos',
  presenter_chips: 'apresentador(a) + palavras-chave em pílulas',
};
const ROTULO_ESTILO_SLIDE = { clean: 'limpo', bold: 'destaque', quote: 'citação', checklist: 'lista de verificação' };
const ROTULO_ANGULO = { front: 'de frente', left: 'ângulo da esquerda', right: 'ângulo da direita', high: 'de cima', low: 'de baixo' };
const rot = (mapa, k) => (k == null ? null : { codigo: k, rotulo: mapa[k] ?? k });

/* ----------------------------------- alinhamento das falas com as palavras do áudio ----------------------------------- */
const normPalavra = (w) => String(w ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function distAte1(a, b) {
  if (a.length === b.length) {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
    return true;
  }
  const [c, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < c.length && c[i] === l[i]) i++;
  return c.slice(i) === l.slice(i + 1);
}
const mesmaPalavra = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && Math.abs(a.length - b.length) <= 1 && distAte1(a, b));

/**
 * Alinha as falas dos planos (na ordem) com a lista de palavras do áudio [texto, início, fim] por maior subsequência comum.
 * Para cada plano devolve início/fim da fala no vídeo FINAL (primeira e última palavra casadas no maior grupo contíguo) e a cobertura
 * (palavras casadas / palavras da fala). Nunca inventa tempo: plano sem palavras casadas fica sem tempo.
 */
function alinharPlanos(falas, palavras) {
  const esp = [];
  falas.forEach((f, k) => spokenWords(f).forEach((w) => { const t = normPalavra(w); if (t) esp.push({ k, t }); }));
  const aud = [];
  palavras.forEach((p, idx) => { const t = normPalavra(p[0]); if (t) aud.push({ idx, t }); });
  const n = esp.length;
  const m = aud.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = mesmaPalavra(esp[i].t, aud[j].t) ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const casadas = falas.map(() => []);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (mesmaPalavra(esp[i].t, aud[j].t) && dp[i * W + j] === dp[(i + 1) * W + j + 1] + 1) { casadas[esp[i].k].push(aud[j].idx); i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  return falas.map((f, k) => {
    const total = spokenWords(f).filter((w) => normPalavra(w)).length;
    const ms = casadas[k];
    // maior grupo contíguo (salto de até 8 palavras do áudio): descarta casamentos soltos de palavras comuns ("de", "a")
    let melhor = [];
    let atual = [];
    for (const x of ms) {
      if (atual.length && x - atual[atual.length - 1] > 8) { if (atual.length > melhor.length) melhor = atual; atual = []; }
      atual.push(x);
    }
    if (atual.length > melhor.length) melhor = atual;
    const cobertura = total ? Math.round((melhor.length / total) * 100) / 100 : 0;
    const temTempo = melhor.length >= 2 && palavras[melhor[0]][1] != null;
    return { cobertura, casadas: melhor.length, total, indices: melhor, inicioS: temTempo ? palavras[melhor[0]][1] : null, fimS: temTempo ? palavras[melhor[melhor.length - 1]][2] : null };
  });
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/* ----------------------------------- zoom da montagem (emendas / join.ts) ----------------------------------- */
const ARQ_JOIN = resolve(RAIZ, 'packages/media/src/compose/join.ts');
const FAZ_ZOOM_DE_ENQUADRAMENTO = new Set(['presenter', 'lower_third', 'presenter_slide_left', 'presenter_slide_right', 'slide_with_pip']);
/**
 * O vídeo foi montado com o motor de emendas (join.ts: aperto das bordas + punch-in alternado)? Não há marca no banco; só a data:
 * asset criado antes do join.ts existir = não; depois da última edição do arquivo = sim (se o worker rodou o código novo); no meio = desconhecido.
 * Vídeo tratado pelo desengasgo vale a data do vídeo ORIGINAL (o desengasgo recodifica, não remonta).
 */
function emendasDoVideo(ctx, assetId) {
  const dg = ctx.desengasgo.tratado.get(assetId);
  const quando = ctx.criadoEm.get(dg?.deAsset ?? assetId) ?? ctx.criadoEm.get(assetId) ?? null;
  if (quando == null) return { codigo: 'desconhecido', rotulo: 'desconhecido', motivo: 'data de criação do vídeo não encontrada' };
  const iso = new Date(quando * 1000).toISOString();
  if (quando < ctx.joinNasceu) return { codigo: 'nao', rotulo: 'não', motivo: 'vídeo montado antes de existir o motor de emendas (join.ts)', montadoEm: iso };
  if (quando < ctx.joinEditado) return { codigo: 'desconhecido', rotulo: 'desconhecido', motivo: 'montado enquanto o join.ts ainda estava sendo escrito', montadoEm: iso };
  return { codigo: 'sim', rotulo: 'provavelmente sim', motivo: 'montado depois da última edição do join.ts (supõe que o worker já rodava o código novo; o banco não guarda uma marca)', montadoEm: iso };
}

/* ----------------------------------- desengasgo (imagens paradas tratadas) ----------------------------------- */
const PASTA_DESENGASGO = resolve(RAIZ, 'docs/qa/lancamento/desengasgo');
function carregarDesengasgo() {
  const tratado = new Map(); // assetId novo -> { deAsset, trechos[] }
  const pendente = new Map(); // assetId -> n trechos >= 200 ms que ficaram de fora
  const fontes = [];
  for (const f of ['resultado.json', 'resultado-novos.json', 'resultado-missao.json']) {
    const p = resolve(PASTA_DESENGASGO, f);
    if (!existsSync(p)) continue;
    fontes.push(f);
    let d;
    try { d = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
    for (const c of d.cursos ?? []) {
      for (const l of c.linhas ?? []) {
        if (l.estado === 'trocado' && l.para) tratado.set(l.para, { deAsset: l.de, trechos: (l.trechos ?? []).map((t) => ({ inicioS: t.inicio, ms: t.ms, metodo: t.metodo === 'fluxo' ? 'fluxo óptico + deriva' : t.metodo === 'mistura' ? 'mistura de quadros + deriva' : t.metodo, zoomPct: t.amp != null ? Math.round(t.amp * 1000) / 10 : null, cortou: !!t.corte })) });
      }
      for (const x of c.excluidasComTrecho ?? []) if (x.asset) pendente.set(x.asset, x.trechos ?? 1);
    }
  }
  for (const id of tratado.keys()) pendente.delete(id);
  return { tratado, pendente, fontes };
}

/* ----------------------------------- diferenças rascunho × publicada ----------------------------------- */
const estavel = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v));
const ROTULO_CAMPO = {
  title: 'título', body: 'texto na tela', narration: 'narração', motionPrompt: 'gesto', tone: 'tom', guidance: 'orientação', reviewNodeIds: 'revisão de respostas',
  prompt: 'enunciado/instruções', bridge: 'chamada', openAnswer: 'resposta aberta', intro: 'ponte', scaffold: 'montagem por blocos', minLength: 'mínimo de caracteres',
  maxLength: 'máximo de caracteres', placeholder: 'texto de apoio do campo', required: 'obrigatório', summary: 'resumo', recap: 'roteiro do aluno', recapTitle: 'título do roteiro',
  closingLine: 'frase de fechamento', outcomeLabel: 'rótulo do resultado', mode: 'modo', passing: 'critério de aprovação', maxAttempts: 'tentativas', feedbackPassed: 'retorno ao passar',
  feedbackFailed: 'retorno ao reprovar', options: 'opções',
};
const CAMPOS_PLANO = [['line', 'fala'], ['cameraId', 'câmera'], ['framing', 'enquadramento'], ['layout', 'layout'], ['cameraMove', 'movimento de câmera'], ['motionPrompt', 'gesto'], ['slide', 'cartão na tela'], ['caption', 'letreiro'], ['transitionIn', 'transição'], ['cinematic', 'cena em movimento']];
function difPlanos(sh, ref) {
  if (!ref) return { mudanca: 'novo', campos: [] };
  const campos = CAMPOS_PLANO.filter(([k]) => estavel(sh[k] ?? null) !== estavel(ref[k] ?? null)).map(([, l]) => l);
  return campos.length ? { mudanca: 'alterado', campos } : { mudanca: null, campos: [] };
}
function difOpcoes(n, ref) {
  const out = [];
  const antes = new Map((ref.options ?? []).map((o) => [o.id, o]));
  for (const o of n.options ?? []) {
    const r = antes.get(o.id);
    if (!r) { out.push({ id: o.id, mudanca: 'novo', campos: [] }); continue; }
    const campos = [];
    if (o.label !== r.label) campos.push('texto da opção');
    if (n.type === 'choice') {
      if (o.quality !== r.quality) campos.push('qualidade');
      if (estavel(o.feedback ?? null) !== estavel(r.feedback ?? null)) campos.push('retorno escrito');
      if ((o.reaction?.text ?? null) !== (r.reaction?.text ?? null)) campos.push('reação falada');
      if ((o.reaction?.motionPrompt ?? null) !== (r.reaction?.motionPrompt ?? null) || !!o.reaction?.disabled !== !!r.reaction?.disabled) campos.push('reação (gesto/ativa)');
    } else {
      if (o.correct !== r.correct) campos.push('certa/errada');
      if (estavel(o.feedback ?? null) !== estavel(r.feedback ?? null)) campos.push('retorno escrito');
    }
    if (campos.length) out.push({ id: o.id, mudanca: 'alterado', campos });
    antes.delete(o.id);
  }
  for (const id of antes.keys()) out.push({ id, mudanca: 'removido', campos: [] });
  return out;
}
/** diferença de um nó do rascunho para o da publicada (ref); ref ausente = nó novo */
function difNo(n, ref) {
  if (!ref) return { mudanca: 'novo', campos: [], opcoes: [], planos: null };
  const ignorar = new Set(['id', 'type', 'media', 'direction', 'objectiveIds', 'options']);
  const campos = [];
  for (const k of new Set([...Object.keys(n), ...Object.keys(ref)])) {
    if (ignorar.has(k)) continue;
    if (estavel(n[k] ?? null) !== estavel(ref[k] ?? null)) campos.push(ROTULO_CAMPO[k] ?? k);
  }
  if (estavel(n.objectiveIds ?? []) !== estavel(ref.objectiveIds ?? [])) campos.push('objetivos');
  const opcoes = n.options ? difOpcoes(n, ref) : [];
  if (opcoes.length) campos.push('opções');
  // direção: intenção/origem aqui; os planos têm lista própria
  const ds = n.direction?.shots ?? [];
  const rs = ref.direction?.shots ?? [];
  const antes = new Map(rs.map((s) => [s.id, s]));
  const planos = { novos: 0, alterados: 0, removidos: 0, ordem: false };
  for (const s of ds) {
    const d = difPlanos(s, antes.get(s.id));
    if (d.mudanca === 'novo') planos.novos++;
    else if (d.mudanca) planos.alterados++;
    antes.delete(s.id);
  }
  planos.removidos = antes.size;
  const idsComuns = ds.map((s) => s.id).filter((id) => rs.some((r) => r.id === id));
  planos.ordem = estavel(idsComuns) !== estavel(rs.map((s) => s.id).filter((id) => ds.some((d) => d.id === id)));
  if ((n.direction?.intent ?? '') !== (ref.direction?.intent ?? '') || (n.direction?.source ?? null) !== (ref.direction?.source ?? null)) campos.push('intenção da direção');
  if (!!n.direction !== !!ref.direction) campos.push('direção (planos)');
  if (planos.novos || planos.alterados || planos.removidos || planos.ordem) campos.push(`planos (${[planos.novos && `${planos.novos} novo(s)`, planos.alterados && `${planos.alterados} alterado(s)`, planos.removidos && `${planos.removidos} removido(s)`, planos.ordem && 'ordem'].filter(Boolean).join(', ')})`);
  const videoTrocado = (n.media?.assetId ?? null) !== (ref.media?.assetId ?? null) || (n.options ?? []).some((o) => (o.reaction?.media?.assetId ?? null) !== ((ref.options ?? []).find((x) => x.id === o.id)?.reaction?.media?.assetId ?? null));
  return { mudanca: campos.length ? 'alterado' : null, campos, opcoes, planos: planos.novos || planos.alterados || planos.removidos || planos.ordem ? planos : null, ...(videoTrocado ? { videoTrocado: true } : {}) };
}

/* ----------------------------------- leitura do banco ----------------------------------- */
function carregar(filtro) {
  const rows = JSON.parse(
    sql(`select coalesce(json_agg(x), '[]') from (
      select c.id, c.title, c.status, c.trail, c.latest_version_number lv, c.updated_at,
        d.revision rev, d.updated_at draft_at, d.document draft,
        v.id vid, v.version_number vn, v.source_revision vrev, v.published_at vat, v.document pub
      from courses c
      left join course_drafts d on d.course_id = c.id
      left join lateral (select * from course_versions w where w.course_id = c.id order by w.version_number desc limit 1) v on true
      where c.id in (${CURSOS.map(lit).join(',')})) x`),
  );
  return CURSOS.map((id, i) => {
    const r = rows.find((x) => x.id === id);
    const codigo = `C${String(i + 1).padStart(2, '0')}`;
    return r && (!filtro || filtro.has(codigo)) ? { codigo, ...r } : null;
  }).filter(Boolean);
}

function idsDeMidia(doc, acc) {
  if (!doc) return;
  const v = (m, tipo) => m?.kind === 'video' && m.assetId && acc.add(m.assetId);
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
    v(n.media);
    for (const o of n.options ?? []) if (!o.reaction?.disabled) v(o.reaction?.media);
  }
  const b = doc.branding?.bumper;
  if (b?.assetId) acc.add(b.assetId);
  if (b?.assetIdVertical) acc.add(b.assetIdVertical);
}

function jobsDe(doc, acc) {
  if (!doc) return;
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
    const j = n.media?.generatedFrom?.jobId;
    if (j) acc.add(j);
  }
}

/** jobs de origem das cenas com ajuste fino (palavras de cada clipe e a direção original, para mostrar o que foi tirado) */
function jobsAjustadosDe(doc, acc) {
  if (!doc) return;
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
    const a = n.media?.adjust;
    const j = n.media?.generatedFrom?.jobId;
    if (j && a && (a.drop?.length || Object.values(a.cut ?? {}).some((c) => c.first || c.last || c.lead || c.skip?.length))) acc.add(j);
  }
}

/* ----------------------------------- ordem do caminho principal ----------------------------------- */
function ordenar(g) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const saidas = new Map();
  for (const e of g.edges) {
    if (!saidas.has(e.from)) saidas.set(e.from, []);
    saidas.get(e.from).push(e);
  }
  for (const [id, es] of saidas) {
    const n = byId.get(id);
    const idx = (e) => (n?.options ? n.options.findIndex((o) => o.id === e.optionId) : 0);
    es.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || idx(a) - idx(b));
  }
  const inicio = g.startNodeId && byId.has(g.startNodeId) ? g.startNodeId : g.nodes[0].id;
  // ordem topológica estável (primeiro filho primeiro); arestas de volta ("refazer") são ignoradas
  const visto = new Set();
  const post = [];
  const dfs = (id) => {
    visto.add(id);
    const es = saidas.get(id) ?? [];
    for (let i = es.length - 1; i >= 0; i--) {
      const t = es[i].to;
      if (byId.has(t) && !visto.has(t)) dfs(t);
    }
    post.push(id);
  };
  dfs(inicio);
  const ordem = post.reverse();
  const alcancaveis = new Set(ordem);
  // caminho principal: em cada pergunta, a opção forte (senão a primeira)
  const principal = new Set();
  for (let cur = inicio; cur && !principal.has(cur); ) {
    principal.add(cur);
    const n = byId.get(cur);
    const es = saidas.get(cur) ?? [];
    let escolha;
    if (n?.type === 'choice' && n.options?.length) {
      const forte = n.options.find((o) => o.quality === 'strong') ?? n.options[0];
      escolha = es.find((e) => e.optionId === forte.id) ?? es[0];
    } else escolha = es.find((e) => !e.condition) ?? es[0];
    cur = escolha?.to;
    if (cur && !byId.has(cur)) cur = undefined;
  }
  // ramos: nós fora do caminho principal, com a pergunta/opção de onde saem
  const ramoDe = new Map();
  for (const id of ordem) {
    if (!principal.has(id)) continue;
    for (const e of saidas.get(id) ?? []) {
      if (principal.has(e.to) || ramoDe.has(e.to) || !byId.has(e.to)) continue;
      const fila = [e.to];
      while (fila.length) {
        const x = fila.shift();
        if (ramoDe.has(x) || principal.has(x)) continue;
        ramoDe.set(x, { no: id, ...(e.optionId ? { opcao: e.optionId } : {}) });
        for (const e2 of saidas.get(x) ?? []) if (byId.has(e2.to)) fila.push(e2.to);
      }
    }
  }
  const fora = g.nodes.map((n) => n.id).filter((id) => !alcancaveis.has(id));
  return { ordem: [...ordem, ...fora], principal, ramoDe, saidas, byId, inalcancaveis: new Set(fora) };
}

/* ----------------------------------- montagem do vídeo de um nó ----------------------------------- */
function criarContexto(base) {
  const ref = base.ref ?? null;
  const refNos = new Map();
  const refAulas = new Map();
  if (ref) for (const m of ref.modules) for (const l of m.lessons) {
    refAulas.set(l.id, l);
    for (const n of l.graph.nodes) refNos.set(`${l.id}|${n.id}`, n);
  }
  return {
    ...base,
    cameras: base.doc?.presentation?.cameras ?? [],
    comparar: !!base.comparar,
    refNos,
    refAulas,
    mudancas: { aulas: [], nos: [], planos: [], nosRemovidos: [], planosRemovidos: [] },
    todos: [], falas: [], refs: new Map(), slots: [], contagem: { videos: 0, comAsr: 0, asrPendente: 0, semMidia: 0, semArquivo: 0 },
  };
}

/** registra um alerta no nó (lista local) e na lista do curso */
function alertar(ctx, lista, codigo, tipo, gravidade, mensagem, extra = {}) {
  const a = { tipo, gravidade, mensagem, ...extra };
  lista.push(a);
  ctx.todos.push({ codigo, ...a });
  return a;
}

function falaDoNo(n) {
  const shots = n.direction?.shots ?? [];
  if (shots.length) return { texto: shots.map((s) => s.line.trim()).join(' '), origem: 'planos' };
  const narr = typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narr) return { texto: narr, origem: 'narração' };
  const reg = n.media?.transcript?.trim();
  if (reg) return { texto: reg, origem: 'registro do vídeo' };
  if (n.type === 'choice') return { texto: plano(n.prompt), origem: 'enunciado' };
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return { texto: plano(n.body), origem: 'texto da cena' };
  return { texto: '', origem: null };
}

function esperaVideo(n) {
  if (!['scenario', 'content', 'consequence', 'choice'].includes(n.type)) return false;
  return !!(n.direction?.shots?.length || (typeof n.narration === 'string' && n.narration.trim()));
}

function cameraInfo(ctx, id) {
  const cams = ctx.cameras ?? [];
  const principal = cams[0] ?? null;
  const c = id ? cams.find((x) => x.id === id) : principal;
  if (!c) return id ? { id, naoEncontrada: true, nome: `câmera “${id}” não existe no kit do curso` } : null;
  return {
    id: c.id,
    nome: c.name,
    principal: c.id === principal?.id,
    ...(id ? {} : { porPadrao: true }),
    zona: c.zone ?? null,
    zonaRotulo: c.zone ? CAMERA_ZONE_LABELS[c.zone] : 'câmera comum (sem zona)',
    posicao: c.placement ?? 'inherit',
    posicaoRotulo: CAMERA_PLACEMENT_LABELS[c.placement ?? 'inherit'],
    angulo: c.angle ? { codigo: c.angle, rotulo: ROTULO_ANGULO[c.angle] ?? c.angle } : null,
    enquadramentoNativo: rot(ROTULO_ENQUADRAMENTO, c.nativeFraming),
    status: c.status ?? 'ready',
    lookId: c.lookId,
  };
}

/** O que o ajuste fino tirou de um plano (texto + tempo no clipe original e posição no vídeo final, quando o job guarda as palavras). */
function cortesDoPlano(shotId, cut, job, tempo, indicesCasados, palavrasAudio) {
  const words = job?.clip?.[shotId]?.words;
  if (!words?.length) return null;
  const segs = keptSegments(words.map((w) => ({ text: w[0] })), cut);
  const mantida = new Set();
  for (const [a, b] of segs) for (let i = a; i <= b; i++) mantida.add(i);
  const out = [];
  for (let i = 0; i < words.length; ) {
    if (mantida.has(i)) { i++; continue; }
    let j = i;
    while (j + 1 < words.length && !mantida.has(j + 1)) j++;
    const antes = [...mantida].filter((x) => x < i).length;
    const posicao = i === 0 ? 'começo' : j === words.length - 1 ? 'fim' : 'meio';
    let noFinal = null;
    if (tempo) {
      if (posicao === 'começo') noFinal = tempo.inicioS;
      else if (posicao === 'fim') noFinal = tempo.fimS;
      else if (antes > 0 && indicesCasados?.[antes - 1] != null && palavrasAudio) noFinal = palavrasAudio[indicesCasados[antes - 1]][2];
    }
    out.push({ posicao, textoTirado: words.slice(i, j + 1).map((w) => w[0]).join(' '), clipeDeS: r2(words[i][1]), clipeAteS: r2(words[j][2]), duracaoTiradaS: r2(words[j][2] - words[i][1]), noVideoFinalS: r2(noFinal) });
    i = j + 1;
  }
  return out;
}

/**
 * Todos os planos de um nó dirigido (cada campo da direção + câmera resolvida + tempo no vídeo final + status).
 * info = { temMidia, stale, palavras: [[texto, ini, fim]] | null (áudio com tempos), fonteTempo, registrado }
 */
function planosDoNo(ctx, n, info) {
  const shots = n.direction?.shots ?? [];
  if (!shots.length) return { planos: null, removidos: null, direcao: null };
  const adj = n.media?.adjust;
  const base = adj?.baseLines ?? {};
  const drop = new Set(adj?.drop ?? []);
  const job = n.media?.generatedFrom?.jobId ? ctx.jobsAjuste.get(n.media.generatedFrom.jobId) : null;
  const refNode = ctx.comparar ? ctx.refNos.get(`${ctx.aulaId}|${n.id}`) ?? null : null;
  const refShots = new Map((refNode?.direction?.shots ?? []).map((s) => [s.id, s]));
  const vivos = shots.filter((s) => !drop.has(s.id));
  // palavras do áudio: do whisper (com tempos) ou, sem transcrição, da fala registrada no vídeo (sem tempos)
  let palavras = info.palavras;
  let fonteTempo = info.fonteTempo;
  if (!palavras && info.temMidia && info.registrado) { palavras = spokenWords(info.registrado).map((w) => [w, null, null]); fonteTempo = null; }
  const alin = palavras?.length ? alinharPlanos(vivos.map((s) => s.line), palavras) : null;
  // zoom automático da montagem: a regra real (framingPunchPlan) sobre os planos na ordem final, sem os tirados
  const zonaDe = (id) => cameraInfo(ctx, id)?.zona ?? undefined;
  const punches = framingPunchPlan(vivos.map((s) => ({ id: s.id, cameraId: s.cameraId, layout: s.layout, framing: s.framing, cameraMove: s.cameraMove, zone: zonaDe(s.cameraId) })));
  const aplicado = !info.temMidia ? 'previsto' : info.emendas?.codigo === 'sim' ? 'sim' : info.emendas?.codigo === 'nao' ? 'nao' : 'desconhecido';
  const planos = vivos.map((s, i) => {
    const c = adj?.cut?.[s.id];
    const cortou = c && (c.first || c.last || c.lead || c.skip?.length);
    const orig = base[s.id];
    const slide = s.slide;
    const cartao = slide && (slide.title || slide.bullets?.length || slide.highlight) ? { ...(slide.title ? { titulo: slide.title } : {}), ...(slide.bullets?.length ? { topicos: slide.bullets } : {}), ...(slide.highlight ? { destaque: slide.highlight } : {}) } : null;
    const cartaoCompleto = slide
      ? {
          ...(slide.title ? { titulo: slide.title } : {}),
          ...(slide.bullets?.length ? { topicos: slide.bullets } : {}),
          ...(slide.highlight ? { destaque: slide.highlight } : {}),
          ...(slide.eyebrow ? { linhaDeCima: slide.eyebrow } : {}),
          estilo: rot(ROTULO_ESTILO_SLIDE, slide.style ?? 'clean'),
          ...(slide.variant ? { variante: slide.variant === 'navy' ? 'marinho' : 'claro' } : {}),
          ...(slide.icons?.some(Boolean) ? { icones: slide.icons } : {}),
          ...(slide.imageAssetId ? { imagem: slide.imageAssetId } : {}),
        }
      : null;
    const ant = vivos[i - 1];
    const cam = cameraInfo(ctx, s.cameraId);
    const camAnt = ant ? cameraInfo(ctx, ant.cameraId) : null;
    const dEnq = ant ? (NIVEL_ENQUADRAMENTO[s.framing] ?? 1) - (NIVEL_ENQUADRAMENTO[ant.framing] ?? 1) : null;
    const a = alin?.[i];
    let tempo = null;
    let tempoMotivo = null;
    // só há tempo quando a fala do plano está mesmo no áudio (>= 60%); fala nova ou muito mudada não ganha o tempo de outro trecho
    if (a?.inicioS != null && a.casadas >= 2 && a.cobertura >= 0.6) tempo = { inicioS: r2(a.inicioS), fimS: r2(a.fimS), duracaoS: r2(a.fimS - a.inicioS), fonte: fonteTempo === 'whisper' ? 'alinhamento da fala com as palavras do áudio (whisper)' : fonteTempo, cobertura: a.cobertura };
    else if (!info.temMidia) tempoMotivo = 'nó ainda sem vídeo';
    else if (!alin) tempoMotivo = 'vídeo sem transcrição do áudio';
    else if (!a || a.inicioS == null || a.cobertura < 0.6) tempoMotivo = fonteTempo ? (a?.cobertura > 0 ? 'a fala deste plano mudou depois da gravação: só parte dela está no áudio' : 'a fala deste plano não está no áudio gravado (plano novo)') : 'sem tempos: o áudio deste vídeo não tem transcrição com tempos';
    // status: gravado (a fala está no vídeo), alterado (parte da fala mudou depois da gravação), novo (ainda não gravado)
    let status;
    let statusMotivo;
    if (!info.temMidia) { status = 'novo'; statusMotivo = 'o nó ainda não tem vídeo gravado'; }
    else if (!a) { status = info.stale ? 'desconhecido' : 'gravado'; statusMotivo = 'vídeo sem transcrição para conferir'; }
    else if (a.cobertura >= 0.75) { status = 'gravado'; statusMotivo = `${Math.round(a.cobertura * 100)}% da fala está no vídeo`; }
    else if (a.cobertura >= 0.35) { status = 'alterado'; statusMotivo = `só ${Math.round(a.cobertura * 100)}% da fala está no vídeo: o texto mudou depois da gravação`; }
    else { status = 'novo'; statusMotivo = 'a fala não está no vídeo gravado: plano novo, ainda não gravado'; }
    const cortes = cortou ? cortesDoPlano(s.id, c, job, tempo, a?.indices, palavras) : null;
    const corteAntigo = cortou && info.temMidia && status !== 'gravado';
    const mudanca = ctx.comparar ? (refNode ? difPlanos(s, refShots.get(s.id)) : { mudanca: 'novo', campos: [] }) : null;
    const punch = punches.get(s.id) ?? 1;
    const nativo = cam?.enquadramentoNativo?.codigo ?? 'medium';
    const ratio = FAZ_ZOOM_DE_ENQUADRAMENTO.has(s.layout) ? framingCropRatio(s.framing, nativo) : 1;
    const zoomNaMontagem = {
      fator: punch,
      tipo: punch > 1 ? 'aproximação no corte (punch-in)' : null,
      origem: 'regra da montagem atual (framingPunchPlan, join.ts)',
      aplicadoNoVideo: punch > 1 ? (status === 'novo' ? 'previsto' : aplicado) : null,
      ...(ratio < 1 ? { recorteDeEnquadramento: { fator: r2(1 / ratio), de: ROTULO_ENQUADRAMENTO[nativo] ?? nativo, para: ROTULO_ENQUADRAMENTO[s.framing] ?? s.framing } } : {}),
    };
    return {
      id: s.id,
      ordem: i + 1,
      fala: s.line.trim(),
      palavras: contar(s.line),
      layout: s.layout,
      layoutRotulo: ROTULO_LAYOUT[s.layout] ?? s.layout,
      enquadramento: rot(ROTULO_ENQUADRAMENTO, s.framing),
      movimento: rot(ROTULO_MOVIMENTO, s.cameraMove),
      ...(s.cameraId ? { camera: s.cameraId } : {}),
      cameraInfo: cam,
      ...(s.motionPrompt ? { gesto: s.motionPrompt } : {}),
      transicao: rot(ROTULO_TRANSICAO, s.transitionIn),
      zoomNaMontagem,
      ...(cartao ? { cartao } : {}),
      ...(cartaoCompleto ? { cartaoCompleto } : {}),
      ...(s.caption ? { letreiro: s.caption } : {}),
      ...(s.cinematic ? { cinematico: { ...(s.cinematic.action ? { acao: rot(CINEMATIC_ACTION_LABELS, s.cinematic.action) } : {}), prompt: s.cinematic.prompt, ...(s.cinematic.setting ? { cenario: s.cinematic.setting } : {}) } } : {}),
      mudancaDeEnquadramento: dEnq == null ? null : dEnq > 0 ? 'aproxima' : dEnq < 0 ? 'afasta' : 'igual',
      trocaDeCamera: ant ? (cam?.id ?? null) !== (camAnt?.id ?? null) : null,
      tempo,
      ...(tempoMotivo ? { tempoMotivo } : {}),
      status,
      statusMotivo,
      ...(mudanca?.mudanca ? { mudanca: mudanca.mudanca, ...(mudanca.campos.length ? { mudancaCampos: mudanca.campos } : {}) } : {}),
      ...(cortou
        ? {
            corte: {
              ...(c.first ? { primeirasFrasesTiradas: c.first } : {}),
              ...(c.last ? { ultimasFrasesTiradas: c.last } : {}),
              ...(c.lead ? { palavrasTiradasDoComeco: c.lead } : {}),
              ...(c.skip?.length ? { trechosTiradosDoMeio: (c.skipText ?? []).filter(Boolean).length ? c.skipText.filter(Boolean) : c.skip.map(([x, y]) => `palavras ${x}–${y}`) } : {}),
            },
            ...(cortes ? { cortes } : {}),
            ...(corteAntigo ? { corteDaGravacaoAnterior: true } : {}),
            ...(orig && orig.trim() !== s.line.trim() ? { falaOriginal: orig } : {}),
          }
        : {}),
    };
  });
  const removidos = [...drop].map((id) => {
    const o = job?.dir?.find((x) => x.id === id);
    const s = shots.find((x) => x.id === id) ?? o;
    const fala = base[id] ?? s?.line ?? null;
    return {
      plano: id,
      id,
      tirado: true,
      status: 'tirado',
      statusMotivo: 'plano tirado pelo ajuste fino (não aparece no vídeo)',
      ...(fala ? { fala, falaOriginal: fala, palavras: contar(fala) } : {}),
      ...(s ? { layout: s.layout, layoutRotulo: ROTULO_LAYOUT[s.layout] ?? s.layout, enquadramento: rot(ROTULO_ENQUADRAMENTO, s.framing), movimento: rot(ROTULO_MOVIMENTO, s.cameraMove), ...(s.cameraId ? { camera: s.cameraId } : {}), cameraInfo: cameraInfo(ctx, s.cameraId), ...(s.motionPrompt ? { gesto: s.motionPrompt } : {}), transicao: rot(ROTULO_TRANSICAO, s.transitionIn), ...(s.caption ? { letreiro: s.caption } : {}) } : {}),
      ...(job?.clip?.[id]?.sec != null ? { duracaoTiradaS: r2(job.clip[id].sec) } : {}),
    };
  });
  return { planos, removidos: removidos.length ? removidos : null, direcao: { punchInsNoCorte: planos.filter((p) => p.zoomNaMontagem.fator > 1).length, intencao: n.direction?.intent || null, origem: n.direction?.source === 'ai' ? 'IA (proposta aprovada)' : 'autor', nPlanos: planos.length } };
}

/** contagens de uma lista de planos (para o resumo do curso/aula) */
function contarPlanos(planos) {
  const r = { planos: 0, novos: 0, alterados: 0, gravados: 0, tirados: 0, cortados: 0, comTempo: 0, semTempo: 0, zoomIn: 0, zoomOut: 0, panoramicas: 0, deriva: 0, paradas: 0, aproximacoesDeEnquadramento: 0, afastamentosDeEnquadramento: 0, aproximacoesNoCorte: 0, aproximacoesNoCorteNaoAplicadas: 0, recortesDeEnquadramento: 0, trocasDeCamera: 0, comCartao: 0, comLetreiro: 0, cenasEmMovimento: 0, planosQueMudaramNoRascunho: 0 };
  for (const p of planos) {
    if (p.tirado) { r.tirados++; continue; }
    r.planos++;
    if (p.status === 'novo') r.novos++;
    else if (p.status === 'alterado') r.alterados++;
    else if (p.status === 'gravado') r.gravados++;
    if (p.corte) r.cortados++;
    if (p.tempo) r.comTempo++;
    else r.semTempo++;
    const mv = p.movimento?.codigo;
    if (mv === 'push_in') r.zoomIn++;
    else if (mv === 'pull_out') r.zoomOut++;
    else if (mv === 'pan_left' || mv === 'pan_right') r.panoramicas++;
    else if (mv === 'drift') r.deriva++;
    else r.paradas++;
    if (p.mudancaDeEnquadramento === 'aproxima') r.aproximacoesDeEnquadramento++;
    if (p.mudancaDeEnquadramento === 'afasta') r.afastamentosDeEnquadramento++;
    if (p.zoomNaMontagem?.fator > 1) { r.aproximacoesNoCorte++; if (p.zoomNaMontagem.aplicadoNoVideo === 'nao' || p.zoomNaMontagem.aplicadoNoVideo === 'desconhecido') r.aproximacoesNoCorteNaoAplicadas++; }
    if (p.zoomNaMontagem?.recorteDeEnquadramento) r.recortesDeEnquadramento++;
    if (p.trocaDeCamera) r.trocasDeCamera++;
    if (p.cartaoCompleto) r.comCartao++;
    if (p.letreiro) r.comLetreiro++;
    if (p.layout === 'cinematic') r.cenasEmMovimento++;
    if (p.mudanca) r.planosQueMudaramNoRascunho++;
  }
  return r;
}
const somar = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] ?? 0) + b[k]; return a; };

/**
 * Bloco de vídeo de um nó (ou da reação de uma opção). `esperado` = a fala que o roteiro manda (depois do ajuste fino).
 * Devolve null quando o nó não tem vídeo nem deveria ter.
 */
function blocoVideo(ctx, { codigo, node, media, esperado, espera, alertas, alvo, reacao = false }) {
  const m = media?.kind === 'video' ? media : null;
  if (!m?.assetId) {
    if (!espera) return null;
    ctx.slots.push({ codigo, ok: false, reacao });
    ctx.contagem.semMidia++;
    const job = ctx.producao.get(`${ctx.curso}|${ctx.aulaId}|${alvo ?? node.id}`);
    const vazio = { situacao: 'sem_midia', ...(job ? { producao: job } : {}), roteiro: esperado };
    if (!reacao) {
      const { planos, removidos, direcao } = planosDoNo(ctx, node, { temMidia: false });
      if (planos) vazio.planos = planos;
      if (removidos) vazio.planosRemovidos = removidos;
      if (direcao) vazio.direcao = direcao;
    }
    return vazio;
  }
  ctx.contagem.videos++;
  const asset = ctx.assets.get(m.assetId);
  const arquivoOk = !!asset && asset.existe;
  ctx.slots.push({ codigo, ok: true, reacao });
  const registrado = (m.transcript ?? '').trim();
  const falaMudou = registrado && esperado && !sameWords(registrado, esperado);
  const stale = m.stale === true;
  const adj = m.adjust;
  const job = m.generatedFrom?.jobId ? ctx.jobs.get(m.generatedFrom.jobId) : null;
  const cartao = adj && adj.teaser !== undefined ? adj.teaser : job?.nextQuestion ?? null;
  const v = {
    situacao: !asset ? 'asset_inexistente' : !arquivoOk ? 'arquivo_ausente' : stale ? 'stale' : falaMudou ? 'fala_mudou' : 'ok',
    assetId: m.assetId,
    duracaoS: asset?.duracao != null ? Math.round(asset.duracao * 10) / 10 : null,
    stale,
    ...(falaMudou ? { falaMudouDepoisDaGravacao: true, registradoNoVideo: registrado } : {}),
    roteiro: esperado,
    ...(reacao ? {} : { cartaoPerguntaSeguinte: cartao }),
    ...(m.generatedFrom ? { geradoPor: m.generatedFrom.provider, ...(m.generatedFrom.simulated ? { simulado: true } : {}) } : {}),
  };
  if (!reacao) {
    if (adj) v.ajusteFino = { planosTirados: adj.drop ?? [], cartaoPerguntaSeguinte: adj.teaser ?? null };
    if (questionVideoSkipped(ctx.graph, node.id) && node.type === 'choice') v.naoToca = 'a cena anterior já termina dizendo a chamada: o player pula este vídeo';
  }
  // ---- alertas de mídia
  if (!asset) alertar(ctx, alertas, codigo, 'arquivo_ausente', 'alta', `O asset ${m.assetId} não existe no banco.`);
  else if (!arquivoOk) alertar(ctx, alertas, codigo, 'arquivo_ausente', 'alta', `O arquivo do vídeo (${m.assetId}) não está no disco.`, { peso: 30 });
  const contraRegistro = (stale || falaMudou) && !!registrado;
  if (stale || falaMudou) {
    // o que mudou entre a fala gravada e o roteiro de hoje
    const dif = registrado ? comparar(esperado, { texto: registrado }) : null;
    const lista = (xs) => xs.map((x) => `“${x.texto}”`).join(', ');
    const detalhe = !dif ? '' : dif.faltando.length || dif.sobrando.length ? ` Roteiro novo que não está no vídeo: ${dif.faltando.length ? lista(dif.faltando) : 'nada'}. Está no vídeo e saiu do roteiro: ${dif.sobrando.length ? lista(dif.sobrando) : 'nada'}.` : ' As palavras do roteiro são as mesmas do vídeo (a marca pode ser só de apresentação: cartão, cor, câmera).';
    v.mudancaNoRoteiro = dif ? { faltaNoVideo: dif.faltando, saiuDoRoteiro: dif.sobrando } : null;
    alertar(ctx, alertas, codigo, 'stale', 'alta', `${stale ? 'O vídeo está marcado como desatualizado.' : 'A fala do roteiro é diferente da fala registrada no vídeo, que não está marcado como desatualizado.'}${detalhe}`, { peso: 20 + (dif ? dif.faltando.reduce((s, f) => s + f.palavras, 0) : 0) });
  }
  const congel = ctx.cache.itens[m.assetId]?.congelamentos;
  if (congel?.length && congel.some(([, d]) => d >= 1)) alertar(ctx, alertas, codigo, 'video_congelado', 'media', `Imagem parada em ${congel.length} trecho(s): ${congel.map(([s, d]) => `${s.toFixed(1)}s por ${d.toFixed(1)}s`).join(', ')}.`);
  // ---- ASR
  const item = arquivoOk ? ctx.cache.itens[m.assetId] : null;
  if (!arquivoOk) v.asr = { status: 'sem_arquivo' };
  else if (!item) {
    v.asr = { status: 'pendente' };
    ctx.contagem.asrPendente++;
  } else {
    ctx.contagem.comAsr++;
    // vídeo desatualizado: o áudio é comparado com a fala que foi gravada (o que mudou no roteiro já está no alerta `stale`)
    const alvoAsr = contraRegistro ? registrado : esperado;
    const c = comparar(alvoAsr, item);
    v.asr = {
      status: 'ok',
      origem: item.origem,
      ...(item.normalizado ? { textoNormalizado: true } : {}),
      comparadoCom: contraRegistro ? 'fala registrada no vídeo (o roteiro atual mudou)' : 'roteiro',
      ouvido: item.texto,
      semelhanca: c.semelhanca,
      faltando: c.faltando,
      sobrando: c.sobrando,
      ...(c.trocados.length ? { trocados: c.trocados } : {}),
    };
    if (contraRegistro) {
      const atual = comparar(esperado, item);
      v.asr.contraRoteiroAtual = { semelhanca: atual.semelhanca, faltando: atual.faltando, sobrando: atual.sobrando };
    }
    if (alvoAsr) {
      if (c.semelhanca < 0.9) alertar(ctx, alertas, codigo, 'asr_similaridade_baixa', c.semelhanca < 0.75 ? 'alta' : 'media', `O áudio bate ${(c.semelhanca * 100).toFixed(0)}% com o roteiro (mínimo 90%).`, { peso: Math.round((0.9 - c.semelhanca) * 100), semelhanca: c.semelhanca });
      const falt = c.faltando.reduce((s, f) => s + f.palavras, 0);
      if (falt) alertar(ctx, alertas, codigo, 'palavras_ausentes_no_audio', falt >= 6 || falt / Math.max(1, spokenWords(alvoAsr).length) >= 0.2 ? 'alta' : falt >= 3 || falt / Math.max(1, spokenWords(alvoAsr).length) >= 0.1 ? 'media' : 'baixa', `Palavras do roteiro que não aparecem no áudio (${falt}): ${c.faltando.map((f) => `“${f.texto}”`).join(', ')}.`, { peso: falt * 5 });
      const ALUCINACAO = /legenda|amara\.org|obrigad[oa] por assistir|inscreva|cidade no brasil/i;
      for (const x of c.sobrando) if (x.borda === 'fim' && ALUCINACAO.test(x.texto)) x.provavelAlucinacao = true;
      const sobrandoReais = c.sobrando.filter((x) => !x.provavelAlucinacao);
      const sob = sobrandoReais.reduce((s, f) => s + f.palavras, 0);
      const borda = sobrandoReais.some((s) => s.borda);
      if (sob >= 3 || (borda && sob >= 2)) alertar(ctx, alertas, codigo, 'palavras_sobrando_no_audio', borda && sob <= 5 ? 'media' : 'baixa', `Palavras ouvidas que não estão no roteiro (${sob}): ${sobrandoReais.map((s) => `“${s.texto}”${s.borda ? ` (${s.borda === 'inicio' ? 'no começo' : 'no fim'})` : ''}`).join(', ')}.`, { peso: sob * 2 });
    }
  }
  // ---- emendas (motor join.ts), planos (direção completa, tempo no vídeo final, status) e desengasgo
  const emendas = emendasDoVideo(ctx, m.assetId);
  if (!reacao) v.emendas = emendas;
  const palavrasAudio = item?.palavras?.length ? item.palavras : null;
  if (!reacao) {
    const { planos, removidos, direcao } = planosDoNo(ctx, node, { temMidia: true, emendas, stale, palavras: palavrasAudio, fonteTempo: palavrasAudio ? 'whisper' : null, registrado });
    if (planos) v.planos = planos;
    if (removidos) v.planosRemovidos = removidos;
    if (direcao) v.direcao = direcao;
  }
  const dt = ctx.desengasgo.tratado.get(m.assetId);
  const dp = ctx.desengasgo.pendente.get(m.assetId);
  if (dt) v.desengasgo = { tratado: true, assetAnterior: dt.deAsset, trechos: dt.trechos };
  else if (dp) v.desengasgo = { tratado: false, pendente: true, trechosPendentes: dp, nota: 'ainda há imagem parada (>= 200 ms) neste vídeo: o desengasgo só entra depois da gravação/remontagem' };
  if (v.desengasgo?.trechos?.length && v.planos?.some((p) => p.tempo)) {
    for (const t of v.desengasgo.trechos) {
      const cand = v.planos.filter((p) => p.tempo && p.tempo.inicioS <= t.inicioS + 0.05);
      const alvoP = cand.length ? cand[cand.length - 1] : v.planos.find((p) => p.tempo);
      (alvoP.desengasgo ??= []).push(t);
    }
  }
  return v;
}

/* ----------------------------------- nós ----------------------------------- */
/** o retorno escrito costuma ser “o que acontece” + “Faça assim: …” (o player mostra a orientação prática à parte) */
function separarRetorno(plain) {
  const cut = plain.search(/faça assim:/i);
  if (cut < 0) return { consequencia: plain, facaAssim: null, completo: plain };
  return { consequencia: cut > 0 ? plain.slice(0, cut).trim() : null, facaAssim: plain.slice(cut).replace(/^faça assim:\s*/i, '').trim() || null, completo: plain };
}

function destinoDe(ord, e) {
  return { para: e.to, ...(e.condition ? { condicional: true } : {}), ...(e.isDefault ? { padrao: true } : {}) };
}

function montarAula(ctx, lesson, modulo, numero) {
  const g = lesson.graph;
  const o = ordenar(g);
  const posicao = new Map(o.ordem.map((id, i) => [id, i]));
  ctx.graph = g;
  ctx.aulaId = lesson.id;
  const prefixo = `${ctx.codigo}·A${numero}`;
  const nos = [];
  const spokenAntes = []; // falas dos nós já vistos, na ordem (para o anúncio da missão)
  const slotsAntes = ctx.slots.length;
  const cast = new Set((ctx.doc.cast ?? []).map((c) => c.name).filter((nm) => nm && nm !== ctx.instrutor?.nome));
  const status = callStatuses(g);

  for (const id of o.ordem) {
    const n = o.byId.get(id);
    const codigo = `${prefixo}·${n.id}`;
    const alertas = [];
    ctx.refs.set(codigo, alertas);
    const no = {
      id: n.id,
      codigo,
      tipo: n.type,
      rotuloTipo: ROTULO_TIPO[n.type] ?? n.type,
      ...(chipFor ? { rotuloNaTela: chipFor(n, false).label } : {}),
      ...(n.title ? { titulo: n.title } : {}),
      caminho: o.inalcancaveis.has(id) ? 'inalcancavel' : o.principal.has(id) ? 'principal' : 'ramo',
      ...(o.ramoDe.has(id) ? { ramoDe: o.ramoDe.get(id) } : {}),
      obrigatorio: n.required !== false,
    };
    // ---- o que mudou no rascunho (vs. a versão publicada)
    const dif = ctx.comparar ? difNo(n, ctx.refNos.get(`${lesson.id}|${n.id}`) ?? null) : null;
    if (dif?.mudanca) {
      no.mudanca = { tipo: dif.mudanca, ...(dif.campos.length ? { campos: dif.campos } : {}), ...(dif.opcoes.length ? { opcoes: dif.opcoes } : {}), ...(dif.planos ? { planos: dif.planos } : {}) };
      if (!ctx.semPublicada) ctx.mudancas.nos.push({ aula: numero, aulaId: lesson.id, aulaTitulo: lesson.title, no: n.id, codigo, tipo: n.type, rotuloTipo: ROTULO_TIPO[n.type] ?? n.type, titulo: n.title ?? null, mudanca: dif.mudanca, campos: dif.campos, opcoes: dif.opcoes, planos: dif.planos });
    }
    if (dif?.videoTrocado) no.videoTrocadoDesdeAPublicada = true;
    if (o.inalcancaveis.has(id)) alertar(ctx, alertas, codigo, 'no_inalcancavel', 'baixa', 'Nenhum caminho do início chega a este nó.');
    const sai = (o.saidas.get(id) ?? []).filter((e) => !(n.type === 'choice' && e.optionId));
    if (n.type !== 'choice' && sai.length) no.proximos = sai.map((e) => ({ ...destinoDe(o, e), ...(posicao.get(e.to) <= posicao.get(id) ? { volta: true } : {}) }));
    if (n.objectiveIds?.length) no.objetivos = n.objectiveIds;

    const fala = falaDoNo(n);

    if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') {
      no.textoTela = plano(n.body);
      if (n.type === 'consequence') {
        no.tom = n.tone;
        if (n.guidance) no.orientacao = plano(n.guidance);
        if (n.effects?.length) no.efeitos = n.effects.length;
      }
      if (n.type === 'content' && n.reviewNodeIds?.length) no.revisaoDeRespostas = n.reviewNodeIds;
      const v = blocoVideo(ctx, { codigo, node: n, media: n.media, esperado: fala.texto, espera: esperaVideo(n), alertas });
      if (v) no.video = v;
      if (!v && fala.texto && fala.origem !== 'texto da cena') no.fala = { texto: fala.texto, origem: fala.origem, palavras: contar(fala.texto) };
    } else if (n.type === 'choice') {
      const t = splitPrompt(n.prompt, n.title ?? 'Sua vez');
      const situacao = plano(n.prompt);
      const perguntaFrase = frases(situacao).reverse().find((x) => /\?["”»)]?$/.test(x)) ?? null;
      no.pergunta = {
        tituloNaTela: t.heading,
        ...(t.lead ? { apoioNaTela: t.lead } : t.leadDoc ? { apoioNaTela: situacao } : {}),
        situacaoCompleta: situacao,
        pergunta: /\?["”»)]?$/.test(t.heading) ? t.heading : perguntaFrase,
        ...(n.bridge?.call ? { chamada: n.bridge.call } : {}),
        ...(n.openAnswer?.enabled ? { respostaAberta: { voz: n.openAnswer.voice !== false, texto: n.openAnswer.text !== false, perguntaDeAutoavaliacao: n.openAnswer.matchPrompt } } : {}),
      };
      const st = status.find((s) => s.choiceId === n.id);
      if (st?.call) {
        const callW = spokenWords(st.call).join(' ');
        const proprio = n.media?.kind === 'video' && n.media.transcript ? spokenWords(n.media.transcript).join(' ').endsWith(callW) : false;
        const anterior = questionVideoSkipped(g, n.id);
        const ant = anterior ? [...new Set(g.edges.filter((e) => e.to === n.id).map((e) => e.from))][0] : null;
        no.pergunta.chamadaNoVideo = { ditaPor: anterior ? `vídeo da cena anterior (${ant}); o player pula o vídeo da pergunta` : proprio ? 'vídeo da própria pergunta' : st.spoken && st.hostId ? `vídeo de ${st.hostId}` : null, anfitriao: st.hostId, precisaRegravar: st.needsRecording };
      }
      if (fala.texto && fala.origem !== 'enunciado' && !(n.media?.kind === 'video' && n.media.assetId)) no.fala = { texto: fala.texto, origem: fala.origem, palavras: contar(fala.texto) };
      const v = blocoVideo(ctx, { codigo, node: n, media: n.media, esperado: fala.texto, espera: esperaVideo(n), alertas });
      if (v) no.video = v;
      no.pergunta.videoDaPergunta = questionVideoSkipped(g, n.id) ? 'pulado: a cena anterior já termina dizendo a chamada' : v ? (v.situacao === 'sem_midia' ? 'próprio, ainda não gravado' : 'próprio (toca antes das opções)') : 'sem vídeo (só texto e chamada falada na cena anterior)';
      // ---- alertas do título
      const h = semAspas(t.heading);
      if (!/\?$/.test(h)) alertar(ctx, alertas, codigo, 'titulo_sem_interrogacao', 'media', `O título na tela não é uma pergunta: “${t.heading}”.`);
      if (!/^no lugar d[aoe]s?\b/i.test(h)) {
        const nomes = [...cast].filter((nm) => new RegExp(`\\b${nm}\\b`).test(situacao));
        const direta = /\b(você|voce|seu|sua|seus|suas)\b/i.test(h);
        alertar(ctx, alertas, codigo, 'fora_padrao_no_lugar', nomes.length || !direta ? 'media' : 'baixa', `Título fora do padrão “No lugar de X, …?”: “${t.heading}”${nomes.length ? ` (a situação cita ${nomes.join(', ')})` : direta ? ' (pergunta direta ao aluno; ok se não há personagem)' : ''}.`);
      }
      // ---- opções
      const rotulos = n.options.map((op) => semAspas(op.label));
      const forte = n.options.filter((op) => op.quality === 'strong').length;
      if (!forte) alertar(ctx, alertas, codigo, 'pergunta_sem_opcao_forte', 'media', 'Nenhuma opção está marcada como forte.');
      else if (forte > 1) alertar(ctx, alertas, codigo, 'pergunta_sem_opcao_forte', 'baixa', `${forte} opções marcadas como fortes.`);
      no.opcoes = n.options.map((op, i) => {
        const cod = `${codigo}·${op.id.toUpperCase()}`;
        const alOp = [];
        ctx.refs.set(cod, alOp);
        const alvo = (o.saidas.get(id) ?? []).find((e) => e.optionId === op.id);
        const outros = rotulos.filter((_, j) => j !== i);
        const media = outros.reduce((s, x) => s + x.length, 0) / (outros.length || 1);
        const len = rotulos[i].length;
        if (len >= media * 1.5 && len - media >= 20) alertar(ctx, alOp, cod, 'opcao_muito_longa', len >= media * 2 || op.quality === 'strong' ? 'media' : 'baixa', `Opção com ${len} caracteres, ${(len / media).toFixed(1)}× a média das outras (${Math.round(media)})${op.quality === 'strong' ? ' e é a opção forte: o tamanho entrega a resposta' : ''}.`, { peso: Math.round(len / media) });
        if (!alvo) alertar(ctx, alOp, cod, 'opcao_sem_destino', 'alta', 'A opção não leva a nenhum nó.');
        let reacao = null;
        if (op.reaction) {
          const rt = op.reaction.text.trim();
          const rcod = `${cod}·reação`;
          const alRe = [];
          ctx.refs.set(rcod, alRe);
          reacao = { texto: rt, palavras: contar(rt), ...(op.reaction.disabled ? { videoDesativado: true } : {}) };
          if (!op.reaction.disabled) {
            const vr = blocoVideo(ctx, { codigo: rcod, node: n, media: op.reaction.media, esperado: rt, espera: true, alertas: alRe, reacao: true, alvo: `${n.id}~${op.id}` });
            if (vr) reacao.video = vr;
            ctx.falas.push({ codigo: rcod, texto: rt, alertas: alRe });
            if (contar(rt) > 25) alertar(ctx, alRe, rcod, 'fala_longa', contar(rt) > 40 ? 'media' : 'baixa', `Reação com ${contar(rt)} palavras (limite 25).`, { peso: contar(rt) - 25 });
          }
        }
        return {
          id: op.id,
          codigo: cod,
          rotulo: op.label,
          caracteres: len,
          ...(op.quality ? { qualidade: QUALIDADE[op.quality], qualidadeCodigo: op.quality } : {}),
          feedback: op.feedback ? plano(op.feedback) : null,
          ...(op.feedback ? { retorno: separarRetorno(plano(op.feedback)) } : {}),
          ...(dif?.opcoes?.find((x) => x.id === op.id) ? { mudanca: dif.opcoes.find((x) => x.id === op.id) } : dif?.mudanca === 'novo' ? { mudanca: { id: op.id, mudanca: 'novo', campos: [] } } : {}),
          ...(op.reaction?.motionPrompt ? { gestoDaReacao: op.reaction.motionPrompt } : {}),
          reacao,
          vaiPara: alvo ? alvo.to : null,
          ...(alvo?.condition ? { condicional: true } : {}),
          ...(alOp.length ? { alertas: alOp } : {}),
        };
      });
    } else if (n.type === 'reflection') {
      const sc = n.scaffold;
      const tituloTela = sc ? ((n.title ?? '').trim().replace(/^miss[aã]o\s*:\s*/i, '').trim() || 'Monte sua resposta') : splitPrompt(n.prompt, n.title ?? 'Sua vez').heading;
      const tituloNaTela = sc ? tituloTela.charAt(0).toLocaleUpperCase('pt-BR') + tituloTela.slice(1) : tituloTela;
      // anúncio: vale o que o aluno OUVE (ASR do vídeo gravado); sem vídeo/ASR ainda, vale o roteiro
      const RE_ANUNCIO = /\bmiss[ãa]o\b|\bna pr[áa]tica\b|\batividade\b/i;
      // o plano de anúncio só conta quando está falado (fora de media.adjust.drop e, havendo ASR, dito no vídeo)
      const ant = spokenAntes.filter((s) => RE_ANUNCIO.test(s.texto) || s.anuncioPlano?.noRoteiro);
      const audivel = spokenAntes.filter((s) => RE_ANUNCIO.test(s.ouvido ?? s.texto) || s.anuncioPlano?.falado);
      no.missao = {
        rotuloNaTela: 'Na prática',
        tituloNaTela,
        ponte: n.intro?.trim() || null,
        instrucoes: plano(n.prompt) || null,
        ...(sc ? { instrucaoPadrao: 'Escolha uma opção em cada grupo para montar sua resposta.' } : {}),
        modo: sc ? 'montar frase (blocos prontos)' : 'texto livre',
        campos: sc
          ? sc.slots.map((s) => ({ id: s.id, rotulo: s.label, pergunta: s.question ?? null, opcoes: s.options, permiteOutro: s.allowCustom !== false, ...(s.allowCustom !== false ? { maxCaracteresOutro: s.customMaxLength ?? 60 } : {}) }))
          : [{ id: 'resposta', rotulo: 'Resposta escrita', placeholder: n.placeholder ?? 'Escreva com suas palavras.', minLength: n.minLength ?? 20, maxLength: n.maxLength ?? 1500 }],
        ...(sc ? { molde: sc.template, exemplo: assembleScaffold(sc, Object.fromEntries(sc.slots.map((s) => [s.id, s.options[0]]))) } : {}),
        obrigatoria: n.required !== false,
        minLength: n.minLength ?? 0,
        maxLength: n.maxLength ?? null,
        anunciadaEm: ant.map((a) => ({ no: a.id, noRoteiro: true, noAudio: a.anuncioPlano && !RE_ANUNCIO.test(a.texto) ? (a.ouvido == null ? null : a.anuncioPlano.falado) : a.ouvido == null ? null : RE_ANUNCIO.test(a.ouvido), ...(a.anuncioPlano?.noRoteiro && !RE_ANUNCIO.test(a.texto) ? { plano: a.anuncioPlano.id } : {}), trecho: a.anuncioPlano?.noRoteiro && !RE_ANUNCIO.test(a.texto) ? a.anuncioPlano.line : (a.texto.match(/[^.!?…]*\b(miss[ãa]o|na pr[áa]tica|atividade)\b[^.!?…]*[.!?…]?/i) ?? [''])[0].trim() })),
      };
      if (!ant.length) alertar(ctx, alertas, codigo, 'missao_sem_anuncio', 'media', 'Nenhuma fala antes da missão a anuncia (nenhum trecho com “missão”, “na prática” ou “atividade”).');
      else if (!audivel.length) alertar(ctx, alertas, codigo, 'missao_sem_anuncio', 'media', `O roteiro anuncia a missão (${ant.map((a) => a.id).join(', ')}), mas o vídeo gravado não diz isso: o aluno chega à missão sem ouvir o anúncio.`, { peso: 10 });
      if (!sc && !(plano(n.prompt) || n.intro)) alertar(ctx, alertas, codigo, 'missao_sem_instrucao', 'baixa', 'A missão não tem instrução nem ponte escrita.');
    } else if (n.type === 'assessment') {
      const t = splitPrompt(n.prompt, n.title ?? 'Sua vez');
      no.avaliacao = {
        tituloNaTela: t.heading,
        enunciado: plano(n.prompt),
        modo: n.mode,
        aprovacao: n.passing,
        tentativas: n.maxAttempts,
        opcoes: n.options.map((op) => ({ id: op.id, rotulo: op.label, correta: op.correct, qualidade: op.correct ? 'certa' : 'errada', feedback: op.feedback ? plano(op.feedback) : null })),
        feedbackAprovado: n.feedbackPassed ? plano(n.feedbackPassed) : null,
        feedbackReprovado: n.feedbackFailed ? plano(n.feedbackFailed) : null,
      };
      const h = semAspas(t.heading);
      if (!/\?$/.test(h) && n.mode === 'single') alertar(ctx, alertas, codigo, 'titulo_sem_interrogacao', 'baixa', `O título da avaliação não é uma pergunta: “${t.heading}”.`);
      const rot = n.options.map((op) => semAspas(op.label).length);
      n.options.forEach((op, i) => {
        const outros = rot.filter((_, j) => j !== i);
        const media = outros.reduce((s, x) => s + x, 0) / (outros.length || 1);
        if (rot[i] >= media * 1.5 && rot[i] - media >= 20) alertar(ctx, alertas, codigo, 'opcao_muito_longa', op.correct ? 'media' : 'baixa', `Opção “${op.id}” com ${rot[i]} caracteres, ${(rot[i] / media).toFixed(1)}× a média das outras${op.correct ? ' e é a correta' : ''}.`, { peso: Math.round(rot[i] / media) });
      });
    } else if (n.type === 'end') {
      no.fim = {
        resumo: plano(n.summary),
        tituloDoRoteiro: n.recapTitle ?? 'Meu roteiro',
        rotuloDoResultado: n.outcomeLabel ?? null,
        fraseDeFechamento: n.closingLine ?? null,
        itensDoRoteiro: (n.recap ?? []).map((r) => ({ id: r.id, rotulo: r.label, tipo: r.kind, ...(r.nodeId ? { origem: r.nodeId } : {}), ...(r.composedNodeIds?.length ? { origemMontada: r.composedNodeIds } : {}), ...(r.items?.length ? { itens: r.items } : {}), ...(r.text ? { texto: r.text } : {}), textoVazio: r.emptyText })),
      };
    } else {
      const { media, ...resto } = n;
      no.bruto = resto;
    }

    // falas para as verificações do curso (repetição, tamanho)
    if (no.video || fala.texto) {
      const unidades = no.video?.naoToca ? [] : no.video?.planos?.length ? no.video.planos.map((p) => ({ codigo, id: p.id, texto: p.fala })) : fala.texto && fala.origem !== 'texto da cena' && (no.video || esperaVideo(n)) ? [{ codigo, id: null, texto: fala.texto }] : [];
      for (const u of unidades) {
        ctx.falas.push({ codigo, texto: u.texto, alertas });
        if (contar(u.texto) > 25) alertar(ctx, alertas, codigo, 'fala_longa', contar(u.texto) > 40 ? 'media' : 'baixa', `${u.id ? `Fala do plano “${u.id}”` : 'Fala'} com ${contar(u.texto)} palavras (limite 25).`, { peso: contar(u.texto) - 25 });
      }
    }
    // chamada registrada que o vídeo não diz
    if (n.type === 'choice') {
      // a chamada é dita pelo vídeo da cena anterior (o player então pula o vídeo da pergunta), pelo vídeo da própria pergunta
      // ou pelo anfitrião da ponte; só é defeito quando há um anfitrião com vídeo e nenhum deles a diz
      const st = status.find((s) => s.choiceId === n.id);
      if (st?.call && st.hostId) {
        const proprio = n.media?.kind === 'video' && n.media.transcript ? spokenWords(n.media.transcript).join(' ').endsWith(spokenWords(st.call).join(' ')) : false;
        if (!st.spoken && !proprio && !questionVideoSkipped(g, n.id)) alertar(ctx, alertas, codigo, 'chamada_nao_dita', 'media', `A chamada “${st.call}” não está no fim da fala de ${st.hostId} nem no vídeo da cena anterior.`);
      }
    }
    if (fala.texto && n.type !== 'reflection' && n.type !== 'end' && !no.video?.naoToca) {
      const ouvido = no.video?.asr?.status === 'ok' ? no.video.asr.ouvido : null;
      // anúncio por plano (`missao` ou o marcado pela proposta), mesmo sem a palavra "missão" (tools/robo-aluno/anuncio.mjs)
      const anuncioPlano = planoDeAnuncio(n, { marcadores: MARCADORES_ANUNCIO.get(`${ctx.codigo}|${lesson.id}|${n.id}`), texto: ouvido });
      spokenAntes.push({ id: n.id, texto: fala.texto, ouvido, ...(anuncioPlano ? { anuncioPlano } : {}) });
    }
    nos.push(no);
  }

  // situação da gravação da aula
  const meus = ctx.slots.slice(slotsAntes);
  const comVideo = meus.filter((s) => s.ok).length;
  const gravacao = !meus.length ? 'sem_video_previsto' : comVideo === meus.length ? 'completa' : comVideo === 0 ? 'nenhuma' : 'parcial';
  // faltas de mídia: aula toda sem vídeo = aguardando gravação (informativo); lacuna numa aula gravada = defeito
  const faltas = [];
  for (const no of nos) {
    const mark = (cod, lista, v) => {
      if (v?.situacao === 'sem_midia') {
        const espera = gravacao === 'nenhuma' || !!v.producao;
        v.aguardandoGravacao = espera;
        alertar(ctx, lista, cod, 'sem_midia', espera ? 'info' : 'alta', gravacao === 'nenhuma' ? 'Vídeo ainda não gravado (aula inteira aguardando gravação).' : v.producao ? `Vídeo ainda não gravado (trabalho de gravação: ${v.producao}).` : 'Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila.', { aguardandoGravacao: espera });
        faltas.push(cod);
      }
    };
    mark(no.codigo, ctx.refs.get(no.codigo), no.video);
    for (const op of no.opcoes ?? []) {
      if (op.reacao?.video?.situacao === 'sem_midia') {
        const rcod = `${op.codigo}·reação`;
        const lista = ctx.refs.get(rcod);
        mark(rcod, lista, op.reacao.video);
      }
    }
  }
  const intervalo = lessonVideoRange({ graph: g }, ctx.duracoes);
  // ---- resumo dos planos da aula e o que mudou no rascunho
  const todosPlanos = nos.flatMap((n) => [...(n.video?.planos ?? []), ...(n.video?.planosRemovidos ?? [])]);
  const resumoPlanos = contarPlanos(todosPlanos);
  resumoPlanos.nosComVideo = nos.filter((n) => n.video && n.video.situacao !== 'sem_midia').length;
  for (const k of ['sim', 'nao', 'desconhecido']) resumoPlanos['emendas_' + k] = nos.filter((n) => n.video?.emendas?.codigo === k).length;
  resumoPlanos.nosAGravar = nos.filter((n) => n.video?.situacao === 'sem_midia').length;
  let mudancaAula = null;
  let nosRemovidos = null;
  if (ctx.comparar) {
    const refLesson = ctx.refAulas.get(lesson.id);
    if (!refLesson) mudancaAula = 'nova';
    else {
      const atuais = new Set(g.nodes.map((x) => x.id));
      const sumidos = refLesson.graph.nodes.filter((x) => !atuais.has(x.id));
      if (sumidos.length) {
        nosRemovidos = sumidos.map((x) => ({ no: x.id, tipo: x.type, rotuloTipo: ROTULO_TIPO[x.type] ?? x.type, titulo: x.title ?? null, ...(x.direction?.shots?.length ? { planos: x.direction.shots.length } : {}) }));
        if (!ctx.semPublicada) for (const x of nosRemovidos) ctx.mudancas.nosRemovidos.push({ aula: numero, aulaId: lesson.id, aulaTitulo: lesson.title, ...x });
      }
      for (const x of refLesson.graph.nodes) {
        const atual = g.nodes.find((y) => y.id === x.id);
        if (!atual) continue;
        const idsAtuais = new Set((atual.direction?.shots ?? []).map((sh) => sh.id));
        for (const sh of x.direction?.shots ?? []) if (!idsAtuais.has(sh.id)) if (!(atual.media?.adjust?.drop ?? []).includes(sh.id) && !ctx.semPublicada) ctx.mudancas.planosRemovidos.push({ aula: numero, aulaId: lesson.id, no: x.id, plano: sh.id, fala: sh.line });
      }
      if (nos.some((x) => x.mudanca) || nosRemovidos) mudancaAula = 'alterada';
    }
    if (mudancaAula && !ctx.semPublicada) ctx.mudancas.aulas.push({ aula: numero, aulaId: lesson.id, titulo: lesson.title, mudanca: mudancaAula });
    if (!ctx.semPublicada) for (const x of nos) for (const p of x.video?.planos ?? []) if (p.mudanca) ctx.mudancas.planos.push({ aula: numero, aulaId: lesson.id, no: x.id, codigo: x.codigo, plano: p.id, mudanca: p.mudanca, campos: p.mudancaCampos ?? [], fala: p.fala });
  }
  return {
    ...(mudancaAula ? { mudanca: mudancaAula } : {}),
    ...(nosRemovidos ? { nosRemovidosDoRascunho: nosRemovidos } : {}),
    resumoPlanos,
    numero,
    id: lesson.id,
    modulo: modulo.title,
    titulo: lesson.title,
    resumo: lesson.description || null,
    estimativaMin: lesson.estimatedMinutes ?? null,
    videoReal: { minS: Math.round(intervalo.minS * 10) / 10, maxS: Math.round(intervalo.maxS * 10) / 10, texto: formatLessonVideo(intervalo), semDuracao: intervalo.missing },
    gravacao,
    caminhoPrincipal: [...o.ordem].filter((id) => o.principal.has(id)),
    nos,
  };
}

/* ----------------------------------- verificações do curso inteiro ----------------------------------- */
function repeticoes(ctx) {
  const mapa = new Map();
  for (const f of ctx.falas) {
    const vistos = new Set();
    for (const s of frases(f.texto)) {
      const k = normTxt(s);
      if (k.split(' ').length < 4 || vistos.has(k)) continue;
      vistos.add(k);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push({ ...f, frase: s });
    }
  }
  for (const [, locais] of mapa) {
    const cods = [...new Set(locais.map((l) => l.codigo))];
    if (cods.length < 2) continue;
    const curta = locais[0].frase.split(/\s+/).length <= 7;
    for (const l of locais) {
      const outros = cods.filter((c) => c !== l.codigo);
      alertar(ctx, l.alertas, l.codigo, 'fala_repetida', cods.length >= 3 && !curta ? 'alta' : curta ? 'baixa' : 'media', `Frase repetida em ${cods.length} nós do curso: “${l.frase}” (também em ${outros.slice(0, 4).join(', ')}${outros.length > 4 ? '…' : ''}).`, { peso: cods.length * 3, frase: l.frase, tambemEm: outros });
    }
  }
}

/* ----------------------------------- um curso, uma versão ----------------------------------- */
function montarVersao(base, doc, rotulo, opcoes = {}) {
  const ctx = criarContexto({ ...base, doc, instrutor: instrutorDe(doc), ref: opcoes.ref ?? null, comparar: !!opcoes.comparar, semPublicada: !!opcoes.semPublicada });
  const aulas = [];
  let numero = 0;
  for (const m of doc.modules) for (const l of m.lessons) aulas.push(montarAula(ctx, l, m, ++numero));
  repeticoes(ctx);
  // as listas de alertas dos nós foram preenchidas depois (repetições, mídia): sincroniza o campo `alertas`
  for (const a of aulas) for (const no of a.nos) {
    const l = ctx.refs.get(no.codigo);
    if (l?.length) no.alertas = l;
    else delete no.alertas;
    for (const op of no.opcoes ?? []) {
      const lo = ctx.refs.get(op.codigo);
      if (lo?.length) op.alertas = lo;
      else delete op.alertas;
      const lr = ctx.refs.get(`${op.codigo}·reação`);
      if (op.reacao) {
        if (lr?.length) op.reacao.alertas = lr;
        else delete op.reacao.alertas;
      }
    }
  }
  const intervalo = courseVideoRange(doc.modules.flatMap((m) => m.lessons).map((l) => ({ graph: l.graph })), ctx.duracoes);
  const resumoPlanos = aulas.reduce((acc, a) => somar(acc, a.resumoPlanos), {});
  resumoPlanos.aulas = aulas.length;
  resumoPlanos.videosGravadosOuPrevistos = ctx.contagem.videos + ctx.contagem.semMidia;
  const porTipo = {};
  const porGravidade = {};
  for (const a of ctx.todos) {
    porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
    porGravidade[a.gravidade] = (porGravidade[a.gravidade] ?? 0) + 1;
  }
  // vinheta da marca (toca no fim da aula)
  const b = doc.branding?.bumper;
  const vin = b?.assetId ? ctx.assets.get(b.assetId) : null;
  const vinheta = b?.assetId
    ? {
        tocaEm: b.playOn ?? [],
        podePular: b.skippable !== false,
        assetId: b.assetId,
        ...(b.assetIdVertical ? { assetIdVertical: b.assetIdVertical } : {}),
        duracaoS: vin?.duracao != null ? Math.round(vin.duracao * 10) / 10 : null,
        ...(ctx.cache.itens[b.assetId] ? { asr: { ouvido: ctx.cache.itens[b.assetId].texto, origem: ctx.cache.itens[b.assetId].origem, ...(spokenWords(ctx.cache.itens[b.assetId].texto).length <= 5 ? { nota: 'poucas palavras: provável vinheta só com música (o whisper costuma inventar legenda em trilha sem fala)' } : {}) } } : { asr: { status: vin?.existe ? 'pendente' : 'sem_arquivo' } }),
      }
    : null;
  return {
    ctx,
    dados: {
      rotulo,
      aulas,
      resumoPlanos,
      mudancas: ctx.comparar ? { semPublicada: !!ctx.semPublicada, ...ctx.mudancas } : null,
      videoReal: { minS: Math.round(intervalo.minS * 10) / 10, maxS: Math.round(intervalo.maxS * 10) / 10, texto: formatCourseVideo(intervalo), semDuracao: intervalo.missing },
      vinheta,
      nos: aulas.reduce((s, a) => s + a.nos.length, 0),
      videos: ctx.contagem.videos,
      videosSemMidia: ctx.contagem.semMidia,
      asr: { comAsr: ctx.contagem.comAsr, pendentes: ctx.contagem.asrPendente },
      alertas: { total: ctx.todos.length, porGravidade, porTipo },
    },
  };
}

function instrutorDe(doc) {
  const nome = doc.branding?.presenterName ?? doc.cast?.[0]?.name ?? null;
  return { nome, papel: doc.branding?.presenterRole ?? doc.cast?.[0]?.role ?? null };
}

/* ----------------------------------- trilhas ----------------------------------- */
function trilhas(cursos) {
  const mapa = new Map();
  for (const c of cursos) {
    if (!c.trilha) continue;
    if (!mapa.has(c.trilha)) mapa.set(c.trilha, []);
    mapa.get(c.trilha).push(c);
  }
  return [...mapa.entries()].map(([nome, cs]) => {
    const slug = trailSlug(nome);
    const chk = TRAIL_CHECKS[slug];
    const alertas = [];
    const situacoes = (chk?.situations ?? []).map((s) => {
      const lista = [];
      const h = semAspas(s.title);
      if (!/\?$/.test(h)) lista.push({ tipo: 'titulo_sem_interrogacao', gravidade: 'media', mensagem: `O título da situação não é uma pergunta: “${s.title}”.` });
      if (!/^no lugar d[aoe]s?\b/i.test(h)) lista.push({ tipo: 'fora_padrao_no_lugar', gravidade: 'baixa', mensagem: `Título fora do padrão “No lugar de X, …?”: “${s.title}”.` });
      const len = s.options.map((o) => semAspas(o.label).length);
      s.options.forEach((o, i) => {
        const outros = len.filter((_, j) => j !== i);
        const m = outros.reduce((a, b) => a + b, 0) / (outros.length || 1);
        if (len[i] >= m * 1.5 && len[i] - m >= 20) lista.push({ tipo: 'opcao_muito_longa', gravidade: o.correct ? 'media' : 'baixa', mensagem: `Opção “${o.id}” com ${len[i]} caracteres, ${(len[i] / m).toFixed(1)}× a média${o.correct ? ' e é a correta' : ''}.` });
      });
      alertas.push(...lista.map((a) => ({ codigo: `trilha·${slug}·${s.id}`, ...a })));
      return { id: s.id, titulo: s.title, situacao: s.situation, opcoes: s.options.map((o) => ({ id: o.id, rotulo: o.label, correta: o.correct, qualidade: o.correct ? 'certa' : 'errada', feedback: o.feedback })), ...(lista.length ? { alertas: lista } : {}) };
    });
    return { nome, slug, cursos: cs.map((c) => c.codigo), temChecagemFinal: !!chk, acertoMinimo: chk ? 0.8 : null, checagemFinal: situacoes, _alertas: alertas };
  });
}

/* ----------------------------------- principal ----------------------------------- */
async function main() {
  const filtro = argv('--cursos') ? new Set(argv('--cursos').split(',').map((s) => s.trim().toUpperCase())) : null;
  mkdirSync(SAIDA, { recursive: true });
  console.log('Lendo o banco (somente leitura)…');
  const cursosDb = carregar(filtro);

  // assets, jobs e produção em andamento
  const desengasgoPre = carregarDesengasgo();
  const ids = new Set();
  const jobIds = new Set();
  for (const c of cursosDb) for (const d of [c.draft, c.pub]) {
    idsDeMidia(d, ids);
    jobsDe(d, jobIds);
  }
  const assets = new Map();
  if (ids.size)
    for (const linha of sql(`select id || '|' || storage_key || '|' || coalesce(duration_seconds::text, '') || '|' || mime_type from assets where id in (${[...ids].map(lit).join(',')})`).split('\n')) {
      if (!linha) continue;
      const [id, key, dur, mime] = linha.split('|');
      const arq = resolve(RAIZ, '.data/storage', key);
      assets.set(id, { id, arquivo: arq, existe: existsSync(arq), duracao: dur === '' ? null : Number(dur), mime });
    }
  const jobs = new Map();
  if (jobIds.size)
    for (const linha of sql(`select id || '|' || status || '|' || coalesce(input->>'nextQuestion', '') from media_jobs where id in (${[...jobIds].map(lit).join(',')})`).split('\n')) {
      if (!linha) continue;
      const [id, st, ...resto] = linha.split('|');
      jobs.set(id, { status: st, nextQuestion: resto.join('|') || null });
    }
  // jobs de origem das cenas com ajuste fino: direção original + palavras de cada clipe (para o que foi tirado e quando)
  const ajusteIds = new Set();
  for (const c of cursosDb) for (const d of [c.draft, c.pub]) jobsAjustadosDe(d, ajusteIds);
  const jobsAjuste = new Map();
  if (ajusteIds.size)
    for (const linha of sql(`select id || E'\t' || jsonb_build_object('dir', input->'direction'->'shots', 'clip', coalesce((select jsonb_object_agg(e.key, jsonb_build_object('words', e.value->'words', 'sec', e.value->'clipSeconds')) from jsonb_each(case when jsonb_typeof(input->'shots') = 'object' then input->'shots' else '{}'::jsonb end) e), '{}'::jsonb))::text from media_jobs where id in (${[...ajusteIds].map(lit).join(',')})`).split('\n')) {
      if (!linha) continue;
      const i = linha.indexOf('\t');
      try { jobsAjuste.set(linha.slice(0, i), JSON.parse(linha.slice(i + 1))); } catch { /* job ilegível: segue sem os tempos do que foi tirado */ }
    }
  const desengasgo = desengasgoPre;
  const producao = new Map();
  for (const linha of sql(`select distinct on (course_id, lesson_id, node_id) course_id || '|' || lesson_id || '|' || node_id || '|' || status || '|' || phase from media_jobs where course_id in (${CURSOS.map(lit).join(',')}) and status <> 'succeeded' order by course_id, lesson_id, node_id, created_at desc`).split('\n')) {
    if (!linha) continue;
    const [c, l, n, st, ph] = linha.split('|');
    producao.set(`${c}|${l}|${n}`, st === 'queued' ? 'na fila para gravar' : `${st}/${ph}`);
  }
  // data de criação dos vídeos (para saber se foram montados com o motor de emendas) + dos originais do desengasgo
  const criadoEm = new Map();
  const desenIds = [...desengasgoPre.tratado.values()].map((x) => x.deAsset).filter(Boolean);
  const todosIds = [...new Set([...ids, ...desenIds])];
  if (todosIds.length)
    for (const linha of sql(`select id || '|' || extract(epoch from created_at)::bigint from assets where id in (${todosIds.map(lit).join(',')})`).split('\n')) {
      if (!linha) continue;
      const [id, ep] = linha.split('|');
      criadoEm.set(id, Number(ep));
    }
  const duracoes = new Map([...assets].filter(([, a]) => a.duracao != null).map(([id, a]) => [id, a.duracao]));

  // ------------------------------- ASR (idempotente) -------------------------------
  const cache = lerCache(CACHE);
  const herdados = importarQaRascunhos(cache, QA_RASCUNHOS);
  if (herdados) console.log(`Cache: ${herdados} resultados herdados do qa-rascunhos.json`);
  const videos = [...ids].map((id) => assets.get(id)).filter((a) => a?.existe && a.mime?.startsWith('video'));
  let pendentes = videos.filter((a) => !cache.itens[a.id] || (arg('--refinar') && cache.itens[a.id].normalizado));
  if (argv('--limite')) pendentes = pendentes.slice(0, Number(argv('--limite')));
  if (arg('--sem-asr')) pendentes = [];
  console.log(`Vídeos com arquivo: ${videos.length}; no cache: ${videos.filter((a) => cache.itens[a.id]).length}; a transcrever agora: ${pendentes.length}`);
  if (pendentes.length) {
    if (!existsSync(MODELO)) throw new Error(`modelo do whisper não encontrado: ${MODELO}`);
    gravarCache(CACHE, cache);
    const falhas = await rodarFila(pendentes.map((a) => ({ id: a.id, arquivo: a.arquivo })), cache, CACHE, { paralelo: 2 });
    if (falhas.length) console.warn(`ASR falhou em ${falhas.length}: ${falhas.map((f) => `${f.id} (${f.erro.slice(0, 80)})`).join('; ')}`);
  }
  gravarCache(CACHE, cache);
  if (arg('--so-asr')) return;

  // ------------------------------- montagem -------------------------------
  const base = { assets, jobs, producao, duracoes, cache, jobsAjuste, desengasgo, criadoEm, joinNasceu: statSync(ARQ_JOIN).birthtimeMs / 1000, joinEditado: statSync(ARQ_JOIN).mtimeMs / 1000 };
  const cursos = [];
  const cursosRascunho = [];
  const todosAlertas = [];
  for (const c of cursosDb) {
    const doc = c.draft;
    const instrutor = instrutorDe(doc);
    const ctxBase = { ...base, curso: c.id, codigo: c.codigo };
    const rasc = montarVersao(ctxBase, doc, 'rascunho', { ref: c.pub ?? null, comparar: true, semPublicada: !c.pub });
    const pub = c.pub ? montarVersao(ctxBase, c.pub, 'publicada') : null;
    // nós da versão publicada idênticos ao rascunho (para o dono pular o que não mudou)
    if (pub) {
      const porCodigo = new Map(rasc.dados.aulas.flatMap((a) => a.nos).map((n) => [n.codigo, JSON.stringify(n)]));
      for (const a of pub.dados.aulas) for (const n of a.nos) n.igualAoRascunho = porCodigo.get(n.codigo) === JSON.stringify(n);
    }
    cursosRascunho.push({ codigo: c.codigo, ctx: rasc.ctx });
    for (const [v, r] of [['rascunho', rasc], ['publicada', pub]]) if (r) for (const a of r.ctx.todos) todosAlertas.push({ curso: c.codigo, versao: v, ...a });
    cursos.push({
      codigo: c.codigo,
      id: c.id,
      titulo: c.title,
      tituloCurto: shortTitleFor(c.id, c.title),
      trilha: c.trail ?? null,
      trilhaSlug: c.trail ? trailSlug(c.trail) : null,
      instrutor,
      descricao: doc.description ?? null,
      status: {
        situacao: nomeSituacao[c.status] ?? c.status,
        versaoPublicada: c.vn ?? null,
        publicadoEm: c.vat ?? null,
        revisaoDoRascunho: c.rev ?? null,
        revisaoDaVersaoPublicada: c.vrev ?? null,
        rascunhoMudouDepoisDePublicar: c.vn != null && c.rev != null && c.rev > c.vrev,
        rascunhoAtualizadoEm: c.draft_at ?? null,
      },
      nAulas: rasc.dados.aulas.length,
      nAulasPublicada: pub ? pub.dados.aulas.length : null,
      videoReal: { rascunho: rasc.dados.videoReal, publicada: pub ? pub.dados.videoReal : null },
      alertas: { rascunho: rasc.dados.alertas, publicada: pub ? pub.dados.alertas : null },
      cameras: (doc.presentation?.cameras ?? []).map((k, i) => ({ id: k.id, nome: k.name, principal: i === 0, zona: k.zone ?? null, zonaRotulo: k.zone ? CAMERA_ZONE_LABELS[k.zone] : 'câmera comum (sem zona)', posicao: CAMERA_PLACEMENT_LABELS[k.placement ?? 'inherit'], angulo: ROTULO_ANGULO[k.angle] ?? k.angle ?? null, enquadramentoNativo: ROTULO_ENQUADRAMENTO[k.nativeFraming] ?? k.nativeFraming ?? null, status: k.status ?? 'ready', lookId: k.lookId })),
      rascunho: { revisao: c.rev, vinheta: rasc.dados.vinheta, nos: rasc.dados.nos, videos: rasc.dados.videos, videosSemMidia: rasc.dados.videosSemMidia, asr: rasc.dados.asr, resumoPlanos: rasc.dados.resumoPlanos, mudancas: rasc.dados.mudancas, aulas: rasc.dados.aulas },
      publicada: pub ? { versao: c.vn, revisaoOrigem: c.vrev, vinheta: pub.dados.vinheta, nos: pub.dados.nos, videos: pub.dados.videos, videosSemMidia: pub.dados.videosSemMidia, asr: pub.dados.asr, resumoPlanos: pub.dados.resumoPlanos, aulas: pub.dados.aulas } : null,
    });
  }
  // frases ditas em vários cursos (fala robótica da plataforma), rascunho
  const global = new Map();
  for (const c of cursosRascunho) for (const f of c.ctx.falas) {
    const vistos = new Set();
    for (const fr of frases(f.texto)) {
      const k = normTxt(fr);
      if (k.split(' ').length < 4 || vistos.has(k)) continue;
      vistos.add(k);
      if (!global.has(k)) global.set(k, { frase: fr, ocorrencias: 0, cursos: new Set(), exemplos: [] });
      const g = global.get(k);
      g.ocorrencias++;
      g.cursos.add(c.codigo);
      if (g.exemplos.length < 6) g.exemplos.push(f.codigo);
    }
  }
  const frasesNaPlataforma = [...global.values()]
    .filter((g) => g.cursos.size >= 3)
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 80)
    .map((g) => ({ frase: g.frase, ocorrencias: g.ocorrencias, nCursos: g.cursos.size, cursos: [...g.cursos], exemplos: g.exemplos }));
  const tr = trilhas(cursos);
  for (const t of tr) {
    for (const a of t._alertas) todosAlertas.push({ curso: `trilha ${t.nome}`, versao: 'checagem final', ...a });
    delete t._alertas;
  }

  const asrStats = {
    videosComArquivo: videos.length,
    comAsr: videos.filter((a) => cache.itens[a.id]).length,
    asrCompleto: videos.filter((a) => cache.itens[a.id] && !cache.itens[a.id].normalizado).length,
    asrHerdadoSemTempos: videos.filter((a) => cache.itens[a.id]?.normalizado).length,
    pendentes: videos.filter((a) => !cache.itens[a.id]).length,
    videosSemArquivo: [...ids].filter((id) => !assets.get(id)?.existe).length,
    nosAguardandoGravacao: { rascunho: cursos.reduce((s, c) => s + c.rascunho.videosSemMidia, 0), publicada: cursos.reduce((s, c) => s + (c.publicada?.videosSemMidia ?? 0), 0) },
  };
  const saida = {
    geradoEm: new Date().toISOString(),
    gerador: 'tools/raio-x/gerar.mjs',
    leia: 'Um objeto por curso. `rascunho` é o que o estúdio tem agora; `publicada` é a última versão publicada (null nos cursos novos). Os nós de cada aula estão na ordem do caminho principal; os ramos (reação de cada opção) estão dentro de `opcoes`. Alertas: gravidade alta/media/baixa/info. Cada vídeo de cena tem `planos` (todos os campos da direção: fala, enquadramento, movimento de câmera, câmera, gesto, cartão, letreiro, transição, status gravado/alterado/novo/tirado, `tempo` no vídeo final quando o áudio foi transcrito, cortes do ajuste fino, desengasgo) e `rascunho.mudancas` lista o que mudou no rascunho em relação à publicada.',
    regras: { tituloDaPergunta: regraTitulo, asr: `whisper.cpp ${MODELO_NOME}`, gravidades: Object.keys(GRAVIDADE), tempoDosPlanos: 'início/fim = primeira e última palavra da fala do plano casadas (maior subsequência comum) com as palavras do whisper do vídeo FINAL; sem transcrição ou sem casamento = null (nunca estimado)', statusDoPlano: 'gravado (>=75% da fala está no áudio), alterado (35–75%), novo (<35% ou nó sem vídeo), tirado (ajuste fino)', zoomNaMontagem: `framingPunchPlan (packages/media/src/compose/join.ts): punch-in de ${JOIN.punch}x em planos alternados da MESMA câmera/enquadramento, parados, layouts presenter/lower_third (e presenter_chips só com zona esquerda/direita); recorte de enquadramento = framingCropRatio. É a regra ATUAL: vídeos montados antes do join.ts (${new Date(statSync(ARQ_JOIN).birthtimeMs).toISOString()}) não a têm; o banco não guarda marca, a data do vídeo é o único sinal`, desengasgo: `docs/qa/lancamento/desengasgo/*.json (${desengasgo.fontes.join(', ') || 'nenhum arquivo'})` },
    asr: asrStats,
    trilhas: tr,
    frasesRepetidasEmVariosCursos: frasesNaPlataforma,
    cursos,
  };
  writeFileSync(resolve(SAIDA, 'raio-x.json'), JSON.stringify(saida, null, 1));
  const tam = statSync(resolve(SAIDA, 'raio-x.json')).size;
  escreverResumo(resolve(SAIDA, 'resumo.md'), saida, todosAlertas);
  console.log(`\nraio-x.json: ${(tam / 1024 / 1024).toFixed(2)} MB; ${cursos.length} cursos; ASR ${asrStats.comAsr}/${asrStats.videosComArquivo} vídeos (${asrStats.pendentes} pendentes); nós aguardando gravação (rascunho): ${asrStats.nosAguardandoGravacao.rascunho}`);
  console.log(`alertas: ${todosAlertas.length} (${todosAlertas.filter((a) => a.gravidade !== 'info').length} sem contar informativos)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

#!/usr/bin/env node
// Lê o bruto de uma rodada (rodar.mjs), cruza com o roteiro publicado e com os arquivos dos vídeos e gera
// resultado.json, relatorio.html e resumo.md.
//
// node tools/robo-aluno/analisar.mjs --rodada base [--publicar] [--comparar base]
//   --publicar  também grava em docs/qa/lancamento/robo/ (a versão "oficial" do relatório)
//   --comparar  rodada anterior: diz o que foi resolvido, o que é novo e o que continua
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAIZ, carregarCursos, arquivosDosAssets } from './dados.mjs';
import { planoDeAnuncio, marcadoresDasPropostas } from './anuncio.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const RODADA = arg('rodada');
if (!RODADA) throw new Error('--rodada obrigatório');
const PUBLICAR = process.argv.includes('--publicar');
const COMPARAR = arg('comparar', '');
const TOPO = resolve(RAIZ, 'docs/qa/lancamento/robo');
const DIR = resolve(TOPO, 'rodadas', RODADA);
const BRUTO = resolve(DIR, 'bruto');
const IMG = resolve(DIR, 'img');
mkdirSync(IMG, { recursive: true });
const meta = JSON.parse(readFileSync(resolve(DIR, 'rodada.json'), 'utf8'));
// os cursos desta rodada (os do alvo dela); aula fora do alvo não entra nas checagens de roteiro
const cursos = carregarCursos('aluna@demo.local', meta.cursos.map((c) => c.codigo)).filter((c) => c.publicado !== false);
const alvoDaRodada = meta.alvo || null;
const aulaNoAlvo = (codigo, n) => !alvoDaRodada || !alvoDaRodada[codigo] || alvoDaRodada[codigo].includes(n);
const porCodigo = Object.fromEntries(cursos.map((c) => [c.codigo, c]));
const execucoes = readdirSync(BRUTO)
  .filter((f) => /^C\d+-A\d+-c\d\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(resolve(BRUTO, f), 'utf8')))
  .sort((a, b) => a.nome.localeCompare(b.nome));
const paginas = existsSync(resolve(BRUTO, '_paginas.json')) ? JSON.parse(readFileSync(resolve(BRUTO, '_paginas.json'), 'utf8')) : [];

const problemas = [];
const GRAV = { bloqueante: 3, importante: 2, menor: 1 };
// exceções aceitas pelo dono (decisoes-linha-de-base.md): não contam como problema
const EXCECOES = [
  { curso: 'C14', aula: 6, tipos: ['missao-no-meio', 'atividade-nao-levou-ao-fim'], motivo: 'atividade no meio da aula por desenho (decisão do dono e da revisão)' },
];
const excecoesAplicadas = [];
function prob(p) {
  const ex = EXCECOES.find((e) => e.curso === p.curso && e.aula === p.aula && e.tipos.includes(p.tipo));
  if (ex) {
    if (!excecoesAplicadas.some((x) => x.curso === ex.curso && x.aula === ex.aula && x.tipo === p.tipo)) excecoesAplicadas.push({ curso: ex.curso, aula: ex.aula, tipo: p.tipo, motivo: ex.motivo });
    return;
  }
  // mesmo problema em vários caminhos vira um só, com a lista de caminhos
  const chave = [p.tipo, p.curso, p.aula ?? '', p.etapa ?? '', p.chave ?? p.texto].join('|');
  const ja = problemas.find((x) => x._k === chave);
  if (ja) {
    if (p.caminho && !ja.caminhos.includes(p.caminho)) ja.caminhos.push(p.caminho);
    if (!ja.evidencia && p.evidencia) ja.evidencia = p.evidencia;
    return;
  }
  const { caminho, chave: _c, ...resto } = p;
  // nó do roteiro (para cruzar com o raio-X): o informado, ou o que vem na etapa ("pergunta:q02", "vídeo:v17 ast_…")
  const no = p.no ?? (p.etapa || '').match(/^[^:]+:([A-Za-z0-9_]+)/)?.[1] ?? null;
  const estavel = no && p.curso && p.aula ? `${p.curso}-A${String(p.aula).padStart(2, '0')}-${no}.jpg` : null;
  const captura = estavel && existsSync(resolve(IMG, estavel)) ? `img/${estavel}` : null;
  problemas.push({ _k: chave, caminhos: caminho ? [caminho] : [], ...resto, no, ...(captura ? { captura } : {}) });
}

// ---------------------------------------------------------------- roteiro
const isNarrada = (n) => (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') && n.media?.kind === 'video' && n.media?.assetId;
function videoAhead(lesson, fromId) {
  const seen = new Set([fromId]);
  const fila = lesson.graph.edges.filter((e) => e.from === fromId).map((e) => e.to);
  while (fila.length) {
    const id = fila.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const n = lesson.graph.nodes.find((x) => x.id === id);
    if (n && n.type !== 'choice' && n.media?.kind === 'video' && n.media.assetId) return true;
    for (const e of lesson.graph.edges) if (e.from === id) fila.push(e.to);
  }
  return false;
}
// mesma regra do player (immersive-player.tsx · lastLongVideoId)
const ultimoVideoLongo = (lesson) => lesson.graph.nodes.filter(isNarrada).filter((n) => !videoAhead(lesson, n.id)).at(-1)?.id;
const norm = (t) => (t || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const PARADAS = new Set('a o as os um uma de da do das dos e em no na nos nas para pra por com sem que se sua seu suas seus voce te ao aos isso esta este essa esse eu meu minha antes depois sobre como quando qual'.split(' '));
const raiz = (w) => w.slice(0, 5);
function compativel(anuncio, titulo) {
  const a = new Set(norm(anuncio).split(' ').filter((w) => w.length > 2 && !PARADAS.has(w)).map(raiz));
  const t = norm(titulo).split(' ').filter((w) => w.length > 2 && !PARADAS.has(w)).map(raiz);
  if (!t.length) return { ok: false, nota: 0 };
  const hit = t.filter((w) => a.has(w)).length;
  return { ok: hit / t.length >= 0.5, nota: +(hit / t.length).toFixed(2) };
}
const texto = (doc) => {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.text) out.push(n.text);
    (n.content || []).forEach(walk);
  };
  walk(doc);
  return out.join(' ').replace(/\s+/g, ' ').trim();
};

// ---------------------------------------------------------------- 1. missão (roteiro publicado)
const missoes = [];
const MARCADORES = marcadoresDasPropostas(RAIZ);
const cobertos = new Set(execucoes.map((r) => r.curso));
const agregados = {}; // problemas que se repetem em toda aula viram um por curso
const agrega = (curso, tipo, gravidade, aula, texto) => ((agregados[curso + '|' + tipo] ||= { curso, tipo, gravidade, aulas: [], texto }).aulas.push(aula));
for (const c of cursos.filter((x) => cobertos.has(x.codigo))) {
  c.aulas.forEach((l, i) => {
    const aula = i + 1;
    if (!aulaNoAlvo(c.codigo, aula)) return;
    const abertura = l.graph.nodes.find(isNarrada);
    const fala = abertura?.media?.transcript || '';
    // anúncio: o plano de abertura `missao` (ou o que a proposta da expansão marca) quando está falado, mesmo sem a palavra "missão";
    // senão a palavra-chave, como antes (tools/robo-aluno/anuncio.mjs)
    const plano = abertura ? planoDeAnuncio(abertura, { marcadores: MARCADORES.get(`${c.codigo}|${l.id}|${abertura.id}`), texto: fala }) : null;
    const m = fala.match(/miss[aã]o\s*(?:para\s+)?(?:voc[eê]|te|sua)?\s*[:,]?\s*([^.!?]*[.!?]?)/i);
    const anuncioPorPlano = !!plano?.falado && !m;
    const anuncio = m ? m[1].trim() : anuncioPorPlano ? plano.line : '';
    const ativs = l.graph.nodes.filter((n) => n.type === 'reflection');
    const ativ = ativs[0];
    const ultimo = l.graph.nodes.filter(isNarrada).at(-1);
    const falaFinal = ultimo?.media?.transcript || '';
    const finalChama = /miss[aã]o|na pr[aá]tica|monte|seu roteiro|atividade/i.test(falaFinal.slice(-260));
    // posição: depois da atividade só pode vir o fim
    // a `despedida` em vídeo (expansão final, 01/11) fecha a aula depois da prática e antes do fim: também não é "atividade no meio"
    const tipoDepois = (id) => {
      const n = l.graph.nodes.find((x) => x.id === id);
      return n?.id === 'despedida' && l.graph.edges.filter((e) => e.from === n.id).every((e) => l.graph.nodes.find((x) => x.id === e.to)?.type === 'end') ? 'mission' : n?.type;
    };
    const depois = ativ ? l.graph.edges.filter((e) => e.from === ativ.id).map((e) => tipoDepois(e.to)) : [];
    // a missão "Leve para a vida real" (mission) pode vir depois da atividade: é o terceiro momento da aula, não uma atividade no meio
    const noFim = ativ ? depois.every((t) => t === 'end' || t === 'mission') : null;
    // o anúncio por plano promete a prática com outras palavras (sem o nome da missão): não há título para comparar
    const comp = anuncio && ativ && !anuncioPorPlano ? compativel(anuncio, ativ.title || '') : null;
    const reg = { curso: c.codigo, aula, aulaTitulo: l.title, anuncio, ...(anuncioPorPlano ? { anuncioPorPlano: plano.id } : {}), atividade: ativ ? ativ.title : null, compativel: comp, noFim, finalChama, aberturaNode: abertura?.id, ultimoNode: ultimo?.id };
    missoes.push(reg);
    const etapa = `abertura:${abertura?.id ?? '—'}`;
    if (ativ && !anuncio) prob({ tipo: 'missao-sem-anuncio', gravidade: 'importante', curso: c.codigo, aula, etapa, texto: `a aula tem a atividade "${ativ.title}", mas a abertura não anuncia a missão ("tem uma missão para você: …")`, detalhe: fala.slice(-220) });
    if (anuncio && !ativ && !l.graph.nodes.some((n) => n.type === 'mission')) prob({ tipo: 'missao-sem-atividade', gravidade: 'bloqueante', curso: c.codigo, aula, etapa, texto: `a abertura anuncia a missão "${anuncio}", mas a aula não tem atividade` });
    if (anuncio && ativ && comp && !comp.ok) prob({ tipo: 'missao-titulo-diferente', gravidade: 'importante', curso: c.codigo, aula, etapa, texto: `missão anunciada "${anuncio}" não bate com o título da atividade "${ativ.title}" (semelhança ${comp.nota})` });
    if (ativ && noFim === false) prob({ tipo: 'missao-no-meio', gravidade: 'importante', curso: c.codigo, aula, etapa: `atividade:${ativ.id}`, texto: `a atividade "${ativ.title}" não é a última etapa: depois dela vem ${depois.join(', ')}` });
    if (ativs.length > 1) prob({ tipo: 'missao-dupla', gravidade: 'menor', curso: c.codigo, aula, etapa: 'roteiro', texto: `${ativs.length} atividades na mesma aula` });
    // vídeo final sem chamar a missão: aceito (decisoes-linha-de-base.md §3); fica só na tabela de missão
    // grupos da atividade (roteiro): rótulo técnico vira "Escolha a parte N"
    for (const [gi, s] of (ativ?.scaffold?.slots || []).entries()) {
      const q = s.question?.trim();
      const lab = (s.label || '').trim();
      const tecnico = lab.toLocaleLowerCase('pt-BR') === s.id.toLocaleLowerCase('pt-BR') || lab.includes('_');
      if (!q && (!lab || tecnico)) prob({ tipo: 'atividade-grupo-sem-titulo', gravidade: 'importante', curso: c.codigo, aula, etapa: `atividade:${ativ.id}`, texto: `o grupo ${gi + 1} ("${s.id}") aparece como "Escolha a parte ${gi + 1}" (sem pergunta nem rótulo)` });
    }
    if (ativ && ativ.required === true && ativ.minLength === 0) agrega(c.codigo, 'atividade-obrigatoria-com-fazer-depois', 'menor', aula, 'a atividade está marcada como obrigatória (required: true), mas mostra "Fazer depois" (minLength 0)');
  });
}

for (const a of Object.values(agregados)) {
  const total = porCodigo[a.curso].aulas.length;
  prob({ tipo: a.tipo, gravidade: a.gravidade, curso: a.curso, etapa: 'roteiro', texto: `${a.texto}: ${a.aulas.length === total ? 'todas as' : a.aulas.length + ' de'} ${total} aulas (${a.aulas.map((n) => 'A' + n).join(', ')})` });
}

// ---------------------------------------------------------------- 2. execuções (ao vivo)
const atividades = [];
const vinhetas = [];
const tocados = new Map(); // asset -> {curso, aula, node, box}
const cobertura = { execucoes: execucoes.length, concluidas: 0 };
for (const r of execucoes) {
  const c = porCodigo[r.curso];
  const lesson = c?.aulas[r.aula - 1];
  if (!lesson) continue;
  const base = { curso: r.curso, aula: r.aula, caminho: r.caminho };
  const ev = (f) => (f ? `img/${f}` : null);
  if (r.concluiu) cobertura.concluidas++;
  else prob({ ...base, tipo: 'nao-concluiu', gravidade: 'bloqueante', etapa: r.telas?.at(-1)?.tipo ?? '—', texto: `o robô não chegou ao fim da aula: ${r.motivoParada}`, evidencia: ev(r.capturas?.find((x) => /parou|travou/.test(x))), chave: r.motivoParada });
  for (const a of r.achados || []) prob({ ...base, tipo: a.tipo, gravidade: a.gravidade, etapa: a.etapa, tempo: a.t, texto: a.texto, evidencia: ev(a.evidencia), chave: a.tipo === 'reiniciar-abriu-fim' ? 'reiniciar' : a.texto });

  const vids = (r.videos || []).filter((v) => v.box === 'cena' || v.box === 'reacao' || v.box === 'vinheta');
  for (const v of vids) {
    if (v.box !== 'vinheta' && v.src && !tocados.has(v.src)) {
      let node = v.node;
      if (v.box === 'reacao') {
        const q = lesson.graph.nodes.find((n) => (n.options || []).some((o) => o.reaction?.media?.assetId === v.src));
        const o = q?.options.find((x) => x.reaction?.media?.assetId === v.src);
        node = q ? `${q.id}` : null;
        if (o) v.opcao = o.id.toUpperCase();
      }
      tocados.set(v.src, { curso: r.curso, aula: r.aula, node, box: v.box, opcao: v.opcao ?? null });
    }
    if (!v.plays) continue;
    const nome = v.box === 'reacao' ? `reação ${v.src}` : v.box === 'vinheta' ? 'vinheta' : `vídeo ${v.node}`;
    const etapa = `${v.box}:${v.node ?? v.src}`;
    if (v.interrompido) prob({ ...base, tipo: 'video-interrompido', gravidade: 'bloqueante', etapa, tempo: v.interrompido.t, texto: `${nome} foi INTERROMPIDO em ${v.interrompido.em}/${v.interrompido.dur} s (${v.interrompido.motivo}; tela seguinte: ${v.interrompido.tela})`, chave: etapa });
    else if (!v.ended && v.dur && v.max < v.dur - 0.6) prob({ ...base, tipo: 'video-incompleto', gravidade: 'importante', etapa, texto: `${nome} tocou só até ${v.max.toFixed(1)}/${v.dur.toFixed(1)} s`, chave: etapa });
    for (const rc of v.recomecos || []) prob({ ...base, tipo: 'video-recomecou', gravidade: 'importante', etapa, tempo: rc.t, texto: `${nome} RECOMEÇOU do início ${rc.jaTerminou ? 'depois de terminar' : `depois de ${rc.depoisDe} s`}`, chave: etapa });
    for (const w of v.esperas || []) prob({ ...base, tipo: 'video-carregando', gravidade: w.ms > 3000 ? 'importante' : 'menor', etapa, tempo: w.t, texto: `${nome} travou carregando ${(w.ms / 1000).toFixed(1)} s em ${w.em} s (${w.ev})`, chave: etapa });
    if (v.atrasoInicioMs > 1500) prob({ ...base, tipo: 'video-demorou', gravidade: 'menor', etapa, texto: `${nome} demorou ${(v.atrasoInicioMs / 1000).toFixed(1)} s para começar`, chave: etapa });
    if (v.pausas?.length && !v.ended) prob({ ...base, tipo: 'video-pausou', gravidade: 'importante', etapa, texto: `${nome} pausou sozinho em ${v.pausas.map((p) => p.em).join(', ')} s`, chave: etapa });
    if (v.erro) prob({ ...base, tipo: 'video-erro', gravidade: 'bloqueante', etapa, texto: `${nome} deu erro de mídia (${v.erro})`, chave: etapa });
  }
  // cenas narradas visitadas cujo vídeo não tocou (ou tocou 2x)
  const visitadas = new Set((r.telas || []).map((t) => t.node).filter(Boolean));
  for (const n of lesson.graph.nodes.filter(isNarrada)) {
    if (!visitadas.has(n.id)) continue;
    const vs = vids.filter((v) => v.box === 'cena' && v.node === n.id && v.plays);
    if (!vs.length && r.concluiu) prob({ ...base, tipo: 'video-nao-tocou', gravidade: 'bloqueante', etapa: `video:${n.id}`, texto: `o vídeo da cena "${n.title}" (${n.id}) não tocou`, chave: n.id });
    if (vs.filter((v) => v.ended).length > 1) prob({ ...base, tipo: 'video-repetiu', gravidade: 'importante', etapa: `video:${n.id}`, texto: `o vídeo da cena "${n.title}" tocou ${vs.length} vezes`, chave: n.id });
  }
  // reações esperadas
  for (const p of r.perguntas || []) {
    const node = lesson.graph.nodes.find((x) => x.id === p.node);
    const op = node?.options?.find((o) => o.id === p.escolhida?.id);
    const rm = op?.reaction && !op.reaction.disabled ? op.reaction.media : null;
    if (rm?.kind === 'video' && rm.assetId && r.concluiu) {
      const v = vids.find((x) => x.box === 'reacao' && x.src === rm.assetId);
      if (!v || !v.plays) prob({ ...base, tipo: 'reacao-nao-tocou', gravidade: 'importante', etapa: `pergunta:${p.node}`, texto: `a reação da opção ${op.id.toUpperCase()} não tocou`, chave: p.node + op.id });
    }
  }
  // depois do vídeo, precisou clicar "Continuar" para chegar à pergunta (devia seguir sozinho)
  for (const o of (r.obs || []).filter((x) => x.manual)) {
    const outs = [...new Set(lesson.graph.edges.filter((e) => e.from === o.node).map((e) => e.to))];
    const prox = outs.length === 1 ? lesson.graph.nodes.find((n) => n.id === outs[0]) : null;
    if (prox?.type === 'choice') prob({ ...base, tipo: 'nao-seguiu-para-pergunta', gravidade: 'importante', etapa: `video:${o.node}`, tempo: o.t, texto: `o vídeo "${o.node}" terminou e a tela parou em "Continuar"${prox.media?.assetId ? ` antes do vídeo próprio da pergunta ${prox.id} (o vídeo anterior não termina com a chamada da pergunta, então ela não abre sozinha)` : ' (a pergunta não abriu sozinha)'}`, chave: o.node });
  }
  // vinheta
  const bumper = c.doc.branding?.bumper;
  const deveTocar = !!bumper && (bumper.playOn || []).includes('lesson_end');
  const ultimo = ultimoVideoLongo(lesson);
  const vin = vids.filter((v) => v.box === 'vinheta' && v.plays);
  const vUlt = vids.filter((v) => v.box === 'cena' && v.node === ultimo && v.ended).at(-1);
  const reg = { ...base, deveTocar, ultimoVideo: ultimo, vezes: vin.length, inicio: vin[0]?.inicio ?? null, terminou: !!vin[0]?.ended, lugar: null, seguiuSozinho: null };
  if (vin[0]) {
    const tela = r.telas.find((t) => t.t >= vin[0].inicio - 0.5 && (t.tipo === 'vinheta' || t.vinhetaNoFim));
    reg.lugar = tela?.tipo === 'vinheta' ? (vUlt && Math.abs(vin[0].inicio - vUlt.fim) < 1.5 ? 'depois do último vídeo' : 'palco, fora do ponto esperado') : 'painel do fim';
    if (vin[0].fim != null) {
      const prox = r.telas.find((t) => t.t > vin[0].fim - 0.05 && t.tipo !== 'vinheta');
      const clique = (r.acoes || []).some((a) => a.t > vin[0].inicio && prox && a.t < prox.t);
      reg.seguiuSozinho = !!prox && !clique && prox.t - vin[0].fim < 2.5;
      reg.depois = prox ? `${prox.tipo}${prox.node ? ':' + prox.node : ''}` : null;
      reg.esperaDepoisS = prox ? +(prox.t - vin[0].fim).toFixed(2) : null;
    }
  }
  vinhetas.push(reg);
  if (r.concluiu && deveTocar) {
    if (!vin.length) prob({ ...base, tipo: 'vinheta-nao-tocou', gravidade: 'importante', etapa: `video:${ultimo}`, texto: 'a vinheta da marca não tocou', chave: 'vinheta' });
    if (vin.length > 1) prob({ ...base, tipo: 'vinheta-repetiu', gravidade: 'importante', etapa: 'vinheta', texto: `a vinheta tocou ${vin.length} vezes`, chave: 'vinheta' });
    if (vin.length && reg.lugar !== 'depois do último vídeo') prob({ ...base, tipo: 'vinheta-fora-do-lugar', gravidade: 'importante', etapa: 'vinheta', tempo: reg.inicio, texto: `a vinheta tocou no lugar errado (${reg.lugar}); o esperado é logo depois do vídeo "${ultimo}"`, chave: 'vinheta' });
    if (vin.length && reg.seguiuSozinho === false) prob({ ...base, tipo: 'vinheta-nao-seguiu', gravidade: 'importante', etapa: 'vinheta', tempo: vin[0].fim, texto: `depois da vinheta o fluxo não seguiu sozinho (próxima tela: ${reg.depois ?? 'nenhuma'}, ${reg.esperaDepoisS ?? '?'} s)`, chave: 'vinheta' });
  }
  // ordem das telas: a atividade vem depois de todas as perguntas e antes do fim
  const tipos = (r.telas || []).map((t) => t.tipo);
  const iAtiv = tipos.indexOf('atividade');
  if (iAtiv >= 0 && (r.telas || []).slice(iAtiv).some((t) => (t.tipo === 'pergunta' || t.tipo === 'video') && t.node !== 'despedida')) prob({ ...base, tipo: 'missao-no-meio', gravidade: 'importante', etapa: 'atividade', texto: 'a atividade apareceu no meio da aula (há pergunta ou vídeo depois dela)', chave: 'ordem' });

  // perguntas
  const cast = (c.doc.cast || []).filter((p) => /personagem/i.test(p.role || '')).map((p) => p.name);
  const apresentador = c.doc.branding?.presenterName;
  for (const p of r.perguntas || []) {
    const etapa = `pergunta:${p.node}`;
    const pb = { curso: r.curso, aula: r.aula, etapa };
    const evq = p.foto ? `img/${p.foto}` : null;
    const ehPergunta = /\?\s*$/.test(p.titulo);
    if (!ehPergunta) prob({ ...pb, tipo: 'pergunta-sem-pergunta', gravidade: 'importante', texto: `o título da tela é uma afirmação, não uma pergunta: "${p.titulo}"${p.situacao ? '' : '; o quadro "A situação" não aparece'}${p.chamada ? `; a pergunta só aparece na linha de apoio: "${p.chamada}"` : ''}`, evidencia: evq });
    else if (!p.situacao) prob({ ...pb, tipo: 'pergunta-sem-situacao', gravidade: 'importante', texto: `a pergunta "${p.titulo}" não mostra "A situação"`, evidencia: evq });
    const nomes = cast.filter((n) => n !== apresentador && new RegExp(`\\b${n}\\b`).test(`${p.situacao} ${p.titulo} ${p.chamada}`));
    if (ehPergunta && nomes.length && !/^no lugar d[aeo]s?\s/i.test(p.titulo)) prob({ ...pb, tipo: 'pergunta-titulo-fora-do-padrao', gravidade: 'importante', texto: `a situação tem personagem (${nomes.join(', ')}) e o título não segue "No lugar de X, o que você…?": "${p.titulo}"`, evidencia: evq });
    if (nomes.length && /^no lugar d/i.test(p.titulo) && !nomes.some((n) => p.titulo.includes(n))) prob({ ...pb, tipo: 'pergunta-personagem-trocado', gravidade: 'importante', texto: `o título fala de outra pessoa: "${p.titulo}" (situação com ${nomes.join(', ')})` });
    for (const o of p.opcoes || []) {
      const t = o.texto.replace(/^[“"']|[”"']$/g, '').trim();
      const toks = norm(t).split(' ').filter((w) => !['nao', 'so', 'tambem', 'ja', 'antes', 'depois', 'de', 'da', 'do', 'ouvir', 'primeiro', 'agora', 'hoje', 'ainda', 'logo', 'e'].includes(w)).slice(0, 3);
      const VERBO1 = /^(sou|vou|estou|tenho|faco|digo|peco|posso|sei|fico|dou|trago|ponho|prefiro|consigo|sigo|mantenho|ouco|vejo|leio|perco|meco|nasci|fiz|fui|tive|falei|disse|pedi|perguntei|mandei|expliquei|estudei|trabalhei|aprendi|gosto)$/;
      const NAO_VERBO = new Set(['como', 'quando', 'isso', 'pedido', 'conteudo', 'tudo', 'outro', 'grupo', 'contexto', 'trabalho', 'celular', 'curso', 'medo', 'jeito', 'assunto', 'certo', 'pouco', 'prazo', 'horario', 'texto', 'video', 'modelo', 'uso', 'caso']);
      const primeira = /\b(eu|me|meu|minha|meus|minhas|mim|comigo)\b/i.test(t) || toks.some((w) => VERBO1.test(w) || (/o$/.test(w) && w.length > 3 && !NAO_VERBO.has(w)) || (/ei$/.test(w) && w.length > 4));
      // fala dirigida a alguém ("Como você quer…?") ou item a escolher ("Uma foto…") não é necessariamente erro
      const item = /^(uma?|o|a|os|as|de|sem|porque|com)\s/i.test(t) || /^(\.\.\.|…)/.test(t) || /·/.test(t) || /\?$/.test(t);
      // fala dirigida a alguém ("Você sempre…", pedido à IA "Escreva…"), resposta a pergunta de sim/não ("Sim, porque…")
      // e continuação de frase ("Que ele…"): mesma exceção (§5)
      const fala = /(?<!\p{L})(você|vocês|podemos)(?!\p{L})/iu.test(t) || /^(escreva|crie|faça|resuma|liste|explique|revise|mostre|gere|traduza|organize|corrija|reescreva|sugira)\b/i.test(t);
      const resposta = /^(sim|não)[,.]/i.test(t) || /^que\s/i.test(t);
      // fala entre aspas (“…”): é o que a pessoa diz a alguém na cena (onda 2: C19·A3·q05 “Isso é golpe…”); mesma exceção de fala dirigida
      const citacao = /^[“"].+[”"]$/s.test(o.texto.trim());
      // item a escolher / fala dirigida a alguém: exceção aceita (decisoes-linha-de-base.md §5)
      if (!primeira && !item && !fala && !resposta && !citacao) prob({ ...pb, tipo: 'opcao-fora-da-1a-pessoa', gravidade: 'importante', texto: `a opção ${o.id.toUpperCase()} não está em 1ª pessoa: "${t}"`, evidencia: evq, chave: o.id });
    }
  }

  // atividade
  const at = r.atividade;
  if (at && !at.pulou) {
    const ap = at.pronta || {};
    const pb = { ...base, etapa: `atividade:${at.node}` };
    const frase = ap.frase || '';
    const linha = { curso: r.curso, aula: r.aula, caminho: r.caminho, titulo: ap.titulo, grupos: (ap.grupos || []).map((g) => g.titulo), frase, salvoMs: at.salvoMs, fimMs: at.fimMs, depoisContinuar: at.depoisContinuar, fazerDepois: ap.fazerDepois, desktop: { cabe: !!ap.painel?.inteiroNaTela && !!ap.botao?.visivel, rolagem: ap.rolagemPagina, botaoVisivel: ap.botao?.visivel }, celular: at.celular?.pronta ? { rolagem: at.celular.pronta.rolagemPagina, botaoVisivel: at.celular.pronta.botao?.visivel, alturaPainel: at.celular.pronta.painel.base - at.celular.pronta.painel.topo, foto: at.celular.foto } : { erro: at.celular?.erro }, fotos: at.fotos };
    atividades.push(linha);
    for (const g of ap.grupos || []) if (!g.titulo || /^Escolha a parte \d/i.test(g.titulo)) prob({ ...pb, tipo: 'atividade-grupo-sem-titulo', gravidade: 'importante', texto: `grupo "${g.id}" aparece como "${g.titulo || '(vazio)'}"`, chave: g.id });
    const defeitos = [];
    if (ap.lacunas) defeitos.push(`${ap.lacunas} lacuna(s) sem preencher`);
    if (/\?\?/.test(frase)) defeitos.push('"??"');
    if (/\.\s+\./.test(frase) || /\.\./.test(frase.replace(/\.\.\./g, ''))) defeitos.push('". ." ou ".."');
    if (/,\s*,|,\s*\./.test(frase)) defeitos.push('vírgula dobrada');
    if (/\s[.,;:!?]/.test(frase)) defeitos.push('espaço antes da pontuação');
    if (/\s{2,}/.test(frase)) defeitos.push('espaço duplo');
    if (/^[a-zà-ú]/.test(frase)) defeitos.push('começa com minúscula');
    if (/[.!?]\s+[a-zà-ú]/.test(frase)) defeitos.push('frase nova começando com minúscula');
    const rep = frase.toLowerCase().match(/(?<!\p{L})(\p{L}+)\s+\1(?!\p{L})/u); // \b não conhece letra acentuada
    if (rep) defeitos.push(`palavra repetida "${rep[0]}"`);
    if (frase && !/[.!?]["”]?$/.test(frase)) defeitos.push('termina sem pontuação');
    if (defeitos.length) prob({ ...pb, tipo: 'atividade-frase-quebrada', gravidade: ap.lacunas ? 'bloqueante' : 'importante', texto: `a frase montada sai com ${defeitos.join(', ')}: "${frase}"`, evidencia: ev(at.fotos?.pronta), chave: frase });
    if (!frase) prob({ ...pb, tipo: 'atividade-sem-frase', gravidade: 'bloqueante', texto: 'depois de escolher em todos os grupos, a prévia "Sua resposta" ficou vazia', evidencia: ev(at.fotos?.pronta) });
    if (ap.botao && !ap.botao.ativo) prob({ ...pb, tipo: 'atividade-botao-inativo', gravidade: 'bloqueante', texto: `com todos os grupos escolhidos, "${ap.botao.texto}" continua desativado`, evidencia: ev(at.fotos?.pronta) });
    // passar da tela com o botão visível foi aceito (decisoes-linha-de-base.md §6)
    if (!linha.desktop.cabe && !ap.botao?.visivel) prob({ ...pb, tipo: 'atividade-nao-cabe-desktop', gravidade: 'importante', texto: `em 1440×900 a atividade não cabe sem rolar (página rola ${ap.rolagemPagina}px; botão de salvar ${ap.botao?.visivel ? 'visível' : 'fora da tela'})`, evidencia: ev(at.fotos?.pronta) });
    const cel = at.celular?.pronta;
    if (cel && !cel.botao?.visivel) prob({ ...pb, tipo: 'atividade-celular-botao-escondido', gravidade: 'importante', texto: `no celular (390×844), com a resposta completa, o botão de salvar não fica à vista (página rola ${cel.rolagemPagina}px)`, evidencia: ev(at.celular.foto) });
    if (cel && cel.rolagemPagina > 2500) prob({ ...pb, tipo: 'atividade-celular-longa', gravidade: 'menor', texto: `no celular a página da atividade rola ${cel.rolagemPagina}px`, evidencia: ev(at.celular.foto) });
    if (at.celular?.erro) prob({ ...pb, tipo: 'robo-celular', gravidade: 'menor', texto: `prova no celular não rodou: ${at.celular.erro}` });
    if (at.salvoMs == null) prob({ ...pb, tipo: 'atividade-nao-salvou', gravidade: 'bloqueante', texto: '"Salvar no meu roteiro" não mostrou "Resposta salva no Meu roteiro" em 15 s', evidencia: ev(at.fotos?.salva) });
    else if (at.salvoMs > 3000) prob({ ...pb, tipo: 'atividade-lenta', gravidade: 'menor', texto: `salvar levou ${(at.salvoMs / 1000).toFixed(1)} s` });
    if (at.salvoMs != null && !/^(fim|video:despedida)/.test(at.depoisContinuar || '')) prob({ ...pb, tipo: 'atividade-nao-levou-ao-fim', gravidade: 'importante', texto: `"Continuar aula" levou a ${at.depoisContinuar ?? 'lugar nenhum'} em vez do fim`, evidencia: ev(at.fotos?.salva) });
  }
  // caminho 4: "Fazer depois" na atividade. Missão opcional (decisoes-linha-de-base.md §2): quem pulou não ganha "Prática feita" (antes "Missão cumprida")
  if (r.caminho === 4 && r.concluiu) {
    if (r.atividade && !r.atividade.pulou) prob({ ...base, tipo: 'atividade-sem-fazer-depois', gravidade: 'importante', etapa: `atividade:${r.atividade.node}`, texto: 'a atividade não oferece "Fazer depois" (a missão foi decidida como opcional)' });
    if (r.atividade?.pulou && /Missão cumprida|missões cumpridas|Prática feita|práticas feitas/.test(r.fim?.conquistas || '')) prob({ ...base, tipo: 'missao-cumprida-sem-fazer', gravidade: 'importante', etapa: 'fim', texto: `quem clicou "Fazer depois" ganha "Prática feita" no fim da aula (conquistas: ${r.fim.conquistas})`, evidencia: ev(r.capturas?.find((x) => /fim-pulou/.test(x))) });
  }
  // fim
  if (r.concluiu) {
    const f = r.fim || {};
    if (!f.fazerDeNovo) prob({ ...base, tipo: 'fim-sem-fazer-de-novo', gravidade: 'importante', etapa: 'fim', texto: 'o fim da aula não mostra "Fazer de novo"' });
    if (!f.proxima && !f.voltar) prob({ ...base, tipo: 'fim-sem-saida', gravidade: 'importante', etapa: 'fim', texto: 'o fim da aula não mostra "Próxima aula" nem "Voltar ao curso"' });
    const ehUltima = r.aula === c.aulas.length;
    if (!ehUltima && !f.proxima) prob({ ...base, tipo: 'fim-sem-proxima', gravidade: 'importante', etapa: 'fim', texto: 'não é a última aula, mas o fim não oferece "Próxima aula"' });
  }
  // erros
  for (const e of r.erros || []) {
    const g = e.tipo === 'pagina' ? 'importante' : e.tipo === 'http' && /^5/.test(e.texto) ? 'importante' : 'menor';
    prob({ ...base, tipo: `erro-${e.tipo}`, gravidade: g, etapa: 'página', texto: e.texto, chave: e.texto.replace(/\d+/g, '#') });
  }
}

// ---------------------------------------------------------------- 3. cabeçalhos
const cabs = [];
const assinatura = (c) => (c ? (c.cabecalhos || []).map((h) => `${h.qual}: ${h.logo?.length ? '[logo ' + h.logo.join('/') + '] ' : ''}${h.marca}${h.subtitulo ? ' · ' + h.subtitulo : ''}`).join(' | ') : '—');
for (const c of cursos) {
  const exs = execucoes.filter((r) => r.curso === c.codigo);
  if (!exs.length) continue;
  const noPlayer = new Map();
  for (const r of exs)
    for (const h of r.cabecalhos || []) {
      if (!(h.cabecalhos || []).length) continue;
      const s = assinatura(h);
      if (!noPlayer.has(s)) noPlayer.set(s, { telas: new Set(), aulas: new Set() });
      noPlayer.get(s).telas.add(h.tipo);
      noPlayer.get(s).aulas.add(r.aula);
    }
  const pag = paginas.find((p) => p.curso === c.codigo);
  const ph = exs.flatMap((r) => r.cabecalhos || []).flatMap((h) => h.cabecalhos || []).find((x) => x.qual === 'player');
  const sub = ph?.subtitulo || '';
  const classe = /^Aula \d+ de \d+$/.test(sub) ? 'Aula N de M' : /DNA Work/i.test(sub) ? 'DNA Work' : sub ? (norm(sub) === norm(c.titulo) ? 'título do curso' : 'outro') : '(vazio)';
  const marcaClasse = !ph ? '—' : ph.logo?.some((l) => /dna ?work|dnawork/i.test(l)) ? 'logo' : ph.logo?.length ? 'outra imagem' : norm(ph.marca) === norm(c.titulo) ? 'título do curso' : 'outro texto';
  cabs.push({ curso: c.codigo, titulo: c.titulo, player: [...noPlayer.entries()].map(([s, v]) => ({ assinatura: s, telas: [...v.telas], aulas: [...v.aulas] })), marca: ph?.marca?.replace(/\s+\.$/, ''), marcaClasse, subtitulo: sub, subtituloClasse: classe, paginaDoCurso: pag ? assinatura(pag) : '—', fotoPagina: pag?.foto ? `img/${pag.foto}` : null, wordmarkRoteiro: c.doc.branding?.wordmark ?? null, subtituloRoteiro: c.doc.branding?.subtitle ?? null });
  const sigs = [...noPlayer.keys()];
  // por aula: o subtítulo "Aula N de M" muda de aula para aula; dentro da mesma aula o cabeçalho deve ser um só
  for (const r of exs) {
    const s = new Set((r.cabecalhos || []).filter((h) => (h.cabecalhos || []).some((x) => x.qual === 'player')).map(assinatura));
    if (s.size > 1) prob({ tipo: 'cabecalho-muda-na-aula', gravidade: 'importante', curso: c.codigo, aula: r.aula, caminho: r.caminho, etapa: 'cabeçalho', texto: `o cabeçalho muda entre as telas da mesma aula: ${[...s].join('  ⟶  ')}`, chave: [...s].join('|') });
  }
  void sigs;
}
const catalogo = paginas.find((p) => !p.curso);
// entre cursos: o subtítulo do cabeçalho do player segue padrões diferentes
const porClasse = {};
for (const x of cabs) (porClasse[x.subtituloClasse] ||= []).push(x.curso);
const marcas = {};
for (const x of cabs) (marcas[x.marcaClasse] ||= []).push(x.curso);
// padrão decidido (decisoes-linha-de-base.md §1, opção A): logo DNA Work à esquerda em todas as telas da aula e o nome
// curto do curso no centro (sem "Aula N de M" nem "DNA Work" em texto)
for (const x of cabs) {
  const falhas = [];
  if (x.marcaClasse !== 'logo') falhas.push(`à esquerda mostra "${x.marca}" em texto, não o logo DNA Work`);
  if (['Aula N de M', 'DNA Work', '(vazio)'].includes(x.subtituloClasse)) falhas.push(`no centro mostra "${x.subtitulo || '(nada)'}", não o nome do curso`);
  const foto = execucoes.find((r) => r.curso === x.curso && r.perguntas?.some((q) => q.foto))?.perguntas.find((q) => q.foto)?.foto;
  if (falhas.length) prob({ tipo: 'cabecalho-fora-do-padrao', gravidade: 'importante', curso: x.curso, etapa: 'cabeçalho', texto: `fora do padrão decidido (logo DNA Work à esquerda, nome do curso no centro): ${falhas.join('; ')}`, evidencia: foto ? `img/${foto}` : null });
}

// ---------------------------------------------------------------- 4. travamento nos arquivos de vídeo
const CACHE = resolve(TOPO, 'cache-trava.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const arquivos = arquivosDosAssets([...tocados.keys()]);
const pendentes = [];
for (const [id, f] of Object.entries(arquivos)) {
  const st = statSync(f);
  const k = `${id}:${st.size}:${Math.round(st.mtimeMs)}`;
  if (!cache[k]) pendentes.push({ id, f, k });
}
console.log(`travamento: ${Object.keys(arquivos).length} arquivos tocados, ${pendentes.length} a analisar`);
for (let i = 0; i < pendentes.length; i += 8) {
  const lote = pendentes.slice(i, i + 8);
  const out = await Promise.all(
    lote.map(
      (p) =>
        new Promise((ok) => {
          try {
            const r = JSON.parse(execFileSync('python3', [resolve(RAIZ, 'tools/robo-aluno/trava.py'), p.f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))[p.f];
            ok(r);
          } catch (e) {
            ok({ erro: String(e).slice(0, 200) });
          }
        }),
    ),
  );
  lote.forEach((p, j) => (cache[p.k] = { id: p.id, ...out[j] }));
  writeFileSync(CACHE, JSON.stringify(cache));
}
const travas = [];
const ARQ_JANELAS = resolve(TOPO, 'janelas-estaticas.json');
const janelasEstaticas = existsSync(ARQ_JANELAS) ? JSON.parse(readFileSync(ARQ_JANELAS, 'utf8')) : {};
const quadro = (f, t, ms, nome) => {
  const dest = resolve(IMG, nome);
  if (existsSync(dest)) return `img/${nome}`;
  const ts = [Math.max(0, t - 0.16), t + 0.02, t + ms / 2000, t + ms / 1000 + 0.08];
  try {
    const ins = ts.flatMap((x) => ['-ss', x.toFixed(2), '-i', f]);
    const filt = ts.map((_, i) => `[${i}:v]scale=320:-2,pad=iw+6:ih:0:0:white[v${i}]`).join(';') + `;${ts.map((_, i) => `[v${i}]`).join('')}hstack=inputs=4`;
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...ins, '-filter_complex', filt, '-frames:v', '1', '-q:v', '5', dest]);
    return `img/${nome}`;
  } catch {
    return null;
  }
};
for (const [id, f] of Object.entries(arquivos)) {
  const st = statSync(f);
  const res = cache[`${id}:${st.size}:${Math.round(st.mtimeMs)}`];
  const onde = tocados.get(id);
  if (!res || res.erro) continue;
  for (const p of res.paradas || []) {
    const entreFalas = !p.com_fala && (p.antes_db > -35 || p.depois_db > -35);
    const tipo = p.com_fala ? 'com fala' : entreFalas ? 'entre falas' : 'em silêncio';
    let grav = null;
    // meta decidida (decisoes-linha-de-base.md §4): zerar os >= 200 ms; de 120 a 199 ms ficam tolerados (contados à parte)
    let tolerado = false;
    // plano de cartão/slide: a imagem fica parada POR DESENHO (a voz segue); janelas em janelas-estaticas.json (asset -> [[ini, fim, ...]])
    const estatico = (janelasEstaticas[id] || []).some(([i, f]) => p.t >= i - 0.4 && p.t + p.ms / 1000 <= f + 0.4);
    if (estatico) {
      travas.push({ asset: id, ...onde, ...p, tipo, gravidade: null, tolerado: false, estaticoPorDesenho: true });
      continue;
    }
    if (p.onde === 'meio' && (p.com_fala || entreFalas)) {
      if (p.ms >= 200) grav = 'importante';
      else tolerado = true;
    } else if (p.onde === 'cauda' && p.com_fala) grav = 'menor';
    travas.push({ asset: id, ...onde, ...p, tipo, gravidade: grav, tolerado });
    if (!grav) continue;
    const ev = grav === 'importante' ? quadro(f, p.t, p.ms, `trava-${id}-${p.t.toFixed(2)}.jpg`) : null;
    prob({ tipo: 'travamento-entre-falas', gravidade: grav, curso: onde.curso, aula: onde.aula, etapa: `${onde.box === 'reacao' ? 'reação' : 'vídeo'}:${onde.node ?? ''}${onde.opcao ? '·' + onde.opcao : ''} ${id}`, no: onde.node ?? null, tempo: p.t, texto: `imagem parada ${p.ms} ms ${p.onde === 'cauda' ? 'no fim do vídeo ' : ''}${tipo} (áudio ${p.fala_db} dB; antes ${p.antes_db}, depois ${p.depois_db}) aos ${p.t.toFixed(2)} s do arquivo`, evidencia: ev, chave: `${id}@${p.t}` });
  }
}

// ---------------------------------------------------------------- 5. consolidação
for (const p of problemas) delete p._k;
problemas.sort((a, b) => GRAV[b.gravidade] - GRAV[a.gravidade] || a.curso.localeCompare(b.curso) || (a.aula ?? 0) - (b.aula ?? 0) || a.tipo.localeCompare(b.tipo));
problemas.forEach((p, i) => (p.id = `P${String(i + 1).padStart(3, '0')}`));
const porCurso = cursos.map((c) => {
  const ps = problemas.filter((p) => p.curso === c.codigo);
  const exs = execucoes.filter((r) => r.curso === c.codigo);
  const cnt = { bloqueante: 0, importante: 0, menor: 0 };
  ps.forEach((p) => cnt[p.gravidade]++);
  const coberto = exs.length > 0;
  return { curso: c.codigo, titulo: c.titulo, aulas: c.aulas.length, execucoes: exs.length, concluidas: exs.filter((r) => r.concluiu).length, coberto, status: !coberto ? '—' : cnt.bloqueante ? '✗' : cnt.importante ? '⚠' : '✓', ...cnt };
});
const tiposResumo = {};
for (const p of problemas) {
  const t = (tiposResumo[p.tipo] ||= { tipo: p.tipo, bloqueante: 0, importante: 0, menor: 0 });
  t[p.gravidade]++;
}
let comparacao = null;
if (COMPARAR) {
  const ant = JSON.parse(readFileSync(resolve(TOPO, 'rodadas', COMPARAR, 'resultado.json'), 'utf8'));
  const k = (p) => [p.tipo, p.curso, p.aula ?? '', p.etapa ?? '', p.tipo === 'travamento-entre-falas' ? p.etapa : p.texto].join('|');
  // só os cursos cobertos NAS DUAS rodadas (e os problemas globais): curso fora de uma delas não vira "resolvido" nem "novo"
  const cobertosAntes = new Set((ant.porCurso || []).filter((c) => c.coberto).map((c) => c.curso));
  const daqui = new Set(execucoes.map((r) => r.curso).filter((c) => !cobertosAntes.size || cobertosAntes.has(c)));
  const naRodada = (p) => p.curso === 'todos' || daqui.has(p.curso);
  // travamento: os vídeos remontados ganham ids novos, então a comparação é por contagem e por aula (abaixo), não item a item
  const semTrava = (p) => p.tipo !== 'travamento-entre-falas';
  const antes = new Map(ant.problemas.filter(naRodada).filter(semTrava).map((p) => [k(p), p]));
  const agora = new Map(problemas.filter(naRodada).filter(semTrava).map((p) => [k(p), p]));
  const porAula = {};
  for (const [lado, lista] of [['antes', ant.travamentos || []], ['depois', travas]])
    for (const t of lista) {
      if (t.gravidade !== 'importante' || !daqui.has(t.curso)) continue;
      const a = (porAula[`${t.curso}·A${t.aula}`] ||= { antes: 0, depois: 0 });
      a[lado]++;
    }
  const tiposAntes = {};
  for (const p of ant.problemas.filter(naRodada)) (tiposAntes[p.tipo] ||= { importante: 0, menor: 0, bloqueante: 0 })[p.gravidade]++;
  const tiposAgora = {};
  for (const p of problemas.filter(naRodada)) (tiposAgora[p.tipo] ||= { importante: 0, menor: 0, bloqueante: 0 })[p.gravidade]++;
  comparacao = {
    rodadaAntes: COMPARAR,
    cursosEmComum: [...daqui].sort(),
    resolvidos: [...antes.keys()].filter((x) => !agora.has(x)).map((x) => antes.get(x)),
    novos: [...agora.keys()].filter((x) => !antes.has(x)).map((x) => agora.get(x)),
    continuam: [...agora.keys()].filter((x) => antes.has(x)).length,
    porTipo: [...new Set([...Object.keys(tiposAntes), ...Object.keys(tiposAgora)])].map((t) => ({ tipo: t, antes: tiposAntes[t] || { importante: 0, menor: 0, bloqueante: 0 }, depois: tiposAgora[t] || { importante: 0, menor: 0, bloqueante: 0 } })),
    travamentoPorAula: porAula,
    pioraram: Object.entries(porAula).filter(([, v]) => v.depois > v.antes).map(([aula, v]) => ({ aula, ...v })),
    travamentosAntes: ant.travamentos?.filter((t) => t.gravidade === 'importante' && daqui.has(t.curso)).length ?? null,
    travamentosAgora: travas.filter((t) => t.gravidade === 'importante' && daqui.has(t.curso)).length,
    toleradosAntes: ant.travamentos?.filter((t) => (t.tolerado || (t.gravidade === 'menor' && t.onde === 'meio')) && daqui.has(t.curso)).length ?? null,
    toleradosAgora: travas.filter((t) => t.tolerado && daqui.has(t.curso)).length,
  };
}
const caso = existsSync(resolve(TOPO, 'caso-que-roupa-eu-uso.md')) ? 'caso-que-roupa-eu-uso.md' : null;
const resultado = {
  rodada: RODADA,
  geradoEm: new Date().toISOString(),
  inicio: meta.inicio,
  fim: meta.fim,
  cobertura: { cursos: porCurso.filter((c) => c.coberto).length, cursosPublicados: cursos.length, aulas: new Set(execucoes.map((r) => r.curso + r.aula)).size, aulasPublicadas: cursos.reduce((s, c) => s + c.aulas.length, 0), caminhos: execucoes.length, concluidas: cobertura.concluidas, naoCobertos: meta.naoCobertos },
  totais: { bloqueante: problemas.filter((p) => p.gravidade === 'bloqueante').length, importante: problemas.filter((p) => p.gravidade === 'importante').length, menor: problemas.filter((p) => p.gravidade === 'menor').length },
  porCurso,
  porTipo: Object.values(tiposResumo).sort((a, b) => b.bloqueante - a.bloqueante || b.importante - a.importante || b.menor - a.menor),
  problemas,
  missoes,
  vinhetas,
  atividades,
  cabecalhos: { porCurso: cabs, catalogo: catalogo ? assinatura(catalogo) : null, subtituloPorPadrao: porClasse, marcaPorPadrao: marcas },
  travamentos: travas,
  excecoesAplicadas,
  comparacao,
  casoQueRoupa: caso,
};
writeFileSync(resolve(DIR, 'resultado.json'), JSON.stringify(resultado, null, 1));
const { html, md } = await import('./relatorio.mjs').then((m) => m.gerar(resultado));
writeFileSync(resolve(DIR, 'relatorio.html'), html('img/'));
writeFileSync(resolve(DIR, 'resumo.md'), md);
if (PUBLICAR) {
  const pre = relative(TOPO, IMG) + '/';
  const fix = (s) => s.replace(/(["(])img\//g, `$1${pre}`).replace(/\(\.\.\/\.\.\/caso-/g, '(caso-');
  writeFileSync(resolve(TOPO, 'resultado.json'), fix(JSON.stringify(resultado, null, 1)));
  writeFileSync(resolve(TOPO, 'relatorio.html'), html(pre));
  writeFileSync(resolve(TOPO, 'resumo.md'), fix(md));
}
console.log(`problemas: ${resultado.totais.bloqueante} bloqueantes, ${resultado.totais.importante} importantes, ${resultado.totais.menor} menores · ${DIR}`);

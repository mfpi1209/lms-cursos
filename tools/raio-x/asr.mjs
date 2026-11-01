// ASR (whisper.cpp local) com cache por id de asset + comparação "o que se ouve × o roteiro".
// Cache: docs/qa/raio-x/asr-cache.json  { versao, modelo, itens: { <assetId>: { origem, texto, normalizado, palavras?, ... } } }
//  - origem "whisper": texto com acento/pontuação e `palavras` = [[palavra, inicioS, fimS], ...]
//  - origem "qa-rascunhos": herdado de scratchpad/asr/qa-rascunhos.json (texto já normalizado, sem tempos)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const MODELO = join(homedir(), '.cache/whisper-cpp/ggml-large-v3-turbo.bin');
export const MODELO_NOME = 'ggml-large-v3-turbo';
export const MAX_PARALELO = 2; // o worker está compondo vídeos: nunca mais de 2 whisper ao mesmo tempo
const THREADS = 3;

const UN = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** inteiro (0 a 999.999) por extenso, sem acento: 480 -> "quatrocentos e oitenta" (para o áudio "480" bater com o roteiro por extenso) */
export function porExtenso(n) {
  if (n < 20) return UN[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UN[n % 10]}` : '');
  if (n === 100) return 'cem';
  if (n < 1000) return `${CEN[Math.floor(n / 100)]}${n % 100 ? ` e ${porExtenso(n % 100)}` : ''}`;
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const cabeca = mil === 1 ? 'mil' : `${porExtenso(mil)} mil`;
  return resto ? `${cabeca}${resto < 100 || resto % 100 === 0 ? ' e ' : ' '}${porExtenso(resto)}` : cabeca;
}

/** formas equivalentes na fala (gênero do numeral) contam como a mesma palavra */
const CANON = { uma: 'um', duas: 'dois' };

/** palavras minúsculas, sem acento nem pontuação (mesma normalização do asr.py); algarismos viram palavras */

export function norm(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => (/^\d+$/.test(w) && w.length <= 6 ? porExtenso(Number(w)).split(' ') : [w]))
    .map((w) => CANON[w] ?? w);
}

/* ------------------------------ cache ------------------------------ */

export function lerCache(arquivo) {
  if (existsSync(arquivo)) {
    try {
      const c = JSON.parse(readFileSync(arquivo, 'utf8'));
      if (c && c.itens) return c;
    } catch {
      /* cache corrompido: recomeça (os itens são refeitos sob demanda) */
    }
  }
  return { versao: 1, modelo: MODELO_NOME, itens: {} };
}

export function gravarCache(arquivo, cache) {
  mkdirSync(dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, arquivo);
}

/** herda os resultados já calculados (texto normalizado, sem tempos) para os assets ainda sem entrada */
export function importarQaRascunhos(cache, arquivo) {
  if (!existsSync(arquivo)) return 0;
  let n = 0;
  for (const r of JSON.parse(readFileSync(arquivo, 'utf8'))) {
    if (!r.asset || cache.itens[r.asset] || typeof r.ouvido !== 'string') continue;
    cache.itens[r.asset] = {
      origem: 'qa-rascunhos',
      normalizado: true,
      texto: r.ouvido,
      imagemS: r.imagem,
      somS: r.som,
      ...(r.congelamentos?.length ? { congelamentos: r.congelamentos } : {}),
    };
    n++;
  }
  return n;
}

/* ------------------------------ whisper ------------------------------ */

function rodar(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com ${code}: ${err.slice(-300)}`))));
  });
}

export async function transcrever(arquivo) {
  const dir = mkdtempSync(join(tmpdir(), 'raiox-asr-'));
  try {
    const wav = join(dir, 'a.wav');
    await rodar('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', arquivo, '-vn', '-ar', '16000', '-ac', '1', wav]);
    const base = join(dir, 'o');
    await rodar('whisper-cli', ['-m', MODELO, '-l', 'pt', '-f', wav, '-oj', '-of', base, '-ml', '1', '-sow', '-np', '-t', String(THREADS)]);
    const js = JSON.parse(readFileSync(`${base}.json`).toString('utf8'));
    const palavras = [];
    for (const seg of js.transcription || []) {
      const t = (seg.text || '').replace(/�/g, '').trim();
      if (!t || /^[[(].*[\])]$/.test(t)) continue; // "[Música]", "(risos)"
      palavras.push([t, Math.round(seg.offsets.from / 10) / 100, Math.round(seg.offsets.to / 10) / 100]);
    }
    return { origem: 'whisper', modelo: MODELO_NOME, normalizado: false, texto: palavras.map((p) => p[0]).join(' '), palavras, em: new Date().toISOString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** roda a fila com no máximo `paralelo` (<= 2) processos; grava o cache a cada poucos itens */
export async function rodarFila(itens, cache, arquivoCache, { paralelo = 2, log = console.log } = {}) {
  const fila = [...itens];
  const total = fila.length;
  let feitos = 0;
  const falhas = [];
  const trabalhador = async () => {
    while (fila.length) {
      const it = fila.shift();
      const t0 = Date.now();
      try {
        cache.itens[it.id] = await transcrever(it.arquivo);
      } catch (e) {
        falhas.push({ id: it.id, erro: e instanceof Error ? e.message : String(e) });
      }
      feitos++;
      if (feitos % 8 === 0 || feitos === total) gravarCache(arquivoCache, cache);
      log(`  ASR ${feitos}/${total} ${it.id} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALELO, Math.max(1, paralelo)) }, trabalhador));
  gravarCache(arquivoCache, cache);
  return falhas;
}

/* ------------------------------ comparação ------------------------------ */

/** blocos iguais, como o difflib.SequenceMatcher (sem autojunk): maior bloco comum e recursão dos dois lados */
function blocosIguais(a, b) {
  const res = [];
  const pilha = [[0, a.length, 0, b.length]];
  while (pilha.length) {
    const [alo, ahi, blo, bhi] = pilha.pop();
    let melhor = null;
    let prev = new Array(bhi - blo + 1).fill(0);
    for (let i = alo; i < ahi; i++) {
      const cur = new Array(bhi - blo + 1).fill(0);
      for (let j = blo; j < bhi; j++) {
        if (a[i] === b[j]) {
          const k = prev[j - blo] + 1;
          cur[j - blo + 1] = k;
          if (!melhor || k > melhor[2]) melhor = [i - k + 1, j - k + 1, k];
        }
      }
      prev = cur;
    }
    if (!melhor) continue;
    const [i, j, k] = melhor;
    res.push(melhor);
    if (alo < i && blo < j) pilha.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) pilha.push([i + k, ahi, j + k, bhi]);
  }
  return res.sort((x, y) => x[0] - y[0]);
}

function operacoes(a, b) {
  const ops = [];
  let i = 0;
  let j = 0;
  for (const [ai, bj, k] of [...blocosIguais(a, b), [a.length, b.length, 0]]) {
    if (i < ai && j < bj) ops.push(['replace', i, ai, j, bj]);
    else if (i < ai) ops.push(['delete', i, ai, j, bj]);
    else if (j < bj) ops.push(['insert', i, ai, j, bj]);
    i = ai + k;
    j = bj + k;
  }
  return ops;
}

/** semelhança de duas palavras (1 - distância de edição / maior tamanho): "Iara" × "Yara", "tem" × "tenho" */
function semelhancaPalavras(x, y) {
  if (x === y) return 1;
  const m = x.length;
  const n = y.length;
  if (Math.min(m, n) < 3) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** dentro de um trecho que difere: pareia as palavras parecidas (variação de reconhecimento) e deixa o resto como falta/sobra */
function alinharBloco(e, o) {
  const L = Array.from({ length: e.length + 1 }, () => new Array(o.length + 1).fill(0));
  const par = (i, j) => semelhancaPalavras(e[i], o[j]) >= 0.5;
  for (let i = e.length - 1; i >= 0; i--) for (let j = o.length - 1; j >= 0; j--) L[i][j] = par(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const passos = [];
  let i = 0;
  let j = 0;
  while (i < e.length || j < o.length) {
    if (i < e.length && j < o.length && par(i, j) && L[i][j] === L[i + 1][j + 1] + 1) passos.push(['par', i++, j++]);
    else if (i < e.length && (j >= o.length || L[i + 1][j] >= L[i][j + 1])) passos.push(['falta', i++, j]);
    else passos.push(['sobra', i, j++]);
  }
  return passos;
}

/**
 * Compara o roteiro (esperado) com o que se ouve. Devolve a semelhança (0..1, como o difflib), as palavras do roteiro
 * que faltam no áudio, as que sobram (com a borda: início/fim do vídeo, onde ficam as "sobras de corte") e as trocadas
 * (variação de reconhecimento, número por extenso). Palavras numéricas do roteiro nunca contam como "faltando".
 */
export function comparar(esperadoTexto, item) {
  // (palavra normalizada, palavra como escrita) para mostrar o texto original nos achados
  const tokens = (texto) => {
    const out = [];
    for (const raw of (texto || '').match(/[\p{L}\p{N}]+/gu) ?? []) for (const w of norm(raw)) out.push([w, raw]);
    return out;
  };
  const E = tokens(esperadoTexto);
  const O = [];
  if (item.palavras?.length) {
    for (const [txt, t0] of item.palavras) for (const [w, raw] of tokens(txt)) O.push([w, raw, t0]);
  } else {
    for (const [w, raw] of tokens(item.texto)) O.push([w, raw, null]);
  }
  const esp = E.map((x) => x[0]);
  const heard = O.map((x) => x[0]);
  if (!esp.length && !heard.length) return { semelhanca: 1, faltando: [], sobrando: [], trocados: [] };
  const blocos = blocosIguais(esp, heard);
  const casadas = blocos.reduce((s, b) => s + b[2], 0);
  const semelhanca = Math.round(((2 * casadas) / (esp.length + heard.length)) * 1000) / 1000;
  const faltando = [];
  const sobrando = [];
  const trocados = [];
  const tempo = (idx) => {
    const t = O[Math.min(idx, O.length - 1)]?.[2];
    return t == null ? {} : { t };
  };
  const bordaDe = (b0, b1) => (b0 === 0 ? { borda: 'inicio' } : b1 === heard.length ? { borda: 'fim' } : {});
  const txtE = (a0, a1) => E.slice(a0, a1).map((x) => x[1]).join(' ');
  const txtO = (b0, b1) => O.slice(b0, b1).map((x) => x[1]).join(' ');
  for (const [op, a0, a1, b0, b1] of operacoes(esp, heard)) {
    const e = esp.slice(a0, a1);
    const o = heard.slice(b0, b1);
    if (op === 'delete') {
      faltando.push({ texto: txtE(a0, a1), palavras: e.length, ...tempo(b0) });
    } else if (op === 'insert') {
      sobrando.push({ texto: txtO(b0, b1), palavras: o.length, ...bordaDe(b0, b1), ...tempo(b0) });
    } else if (e.length === 1 && o.length === 1) {
      // uma palavra por outra ("tem" ouvido como "tenho"): variação de reconhecimento ou fala diferente, listada em `trocados`
      trocados.push({ esperado: txtE(a0, a1), ouvido: txtO(b0, b1), ...tempo(b0) });
    } else {
      // trecho trocado: pareia o que é parecido ("tem" × "tenho", "Iara" × "Yara") e separa o que falta e o que sobra
      let falta = null;
      let sobra = null;
      const fecha = () => {
        if (falta) faltando.push({ texto: txtE(falta[0], falta[1]), palavras: falta[1] - falta[0], ...tempo(b0 + falta[2]) });
        if (sobra) sobrando.push({ texto: txtO(sobra[0], sobra[1]), palavras: sobra[1] - sobra[0], ...(sobra[0] === 0 ? { borda: 'inicio' } : sobra[1] === heard.length ? { borda: 'fim' } : {}), ...tempo(sobra[0]) });
        falta = null;
        sobra = null;
      };
      for (const [tipo, ii, jj] of alinharBloco(e, o)) {
        if (tipo === 'par') {
          fecha();
          if (e[ii] !== o[jj]) trocados.push({ esperado: txtE(a0 + ii, a0 + ii + 1), ouvido: txtO(b0 + jj, b0 + jj + 1), ...tempo(b0 + jj) });
        } else if (tipo === 'falta') falta = falta ? [falta[0], a0 + ii + 1, falta[2]] : [a0 + ii, a0 + ii + 1, jj];
        else sobra = sobra ? [sobra[0], b0 + jj + 1] : [b0 + jj, b0 + jj + 1];
      }
      fecha();
    }
  }
  return { semelhanca, faltando, sobrando, trocados };
}

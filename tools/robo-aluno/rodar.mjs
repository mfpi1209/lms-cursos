#!/usr/bin/env node
// Robô aluno: roda todas as aulas dos cursos publicados nos 3 caminhos e grava o bruto em
// docs/qa/lancamento/robo/rodadas/<rodada>/. Depois chame analisar.mjs para o relatório.
//
// node tools/robo-aluno/rodar.mjs --rodada base [--alvo atuais|novos|todos|C06:3,C15-C26] [--cursos C01,C02] [--aulas 1,2] [--caminhos 1,2,3] [--paralelo 4]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, carregarCursos, alvo } from './dados.mjs';
import { login } from './login.mjs';
import { rodarAula, cabecalhoDaPagina } from './aula.mjs';

const { chromium } = await import(resolve(RAIZ, 'node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs'));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:3010');
const RODADA = arg('rodada', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
const SO_CURSOS = arg('cursos', '') ? arg('cursos').split(',') : null;
// --alvo: conjunto de cursos e aulas (padrão: os 14 atuais); --cursos/--aulas filtram dentro dele
const ALVO = alvo(arg('alvo', SO_CURSOS ? SO_CURSOS.join(',') : 'atuais'));
const SO_AULAS = arg('aulas', '') ? arg('aulas').split(',').map(Number) : null;
const CAMINHOS = arg('caminhos', '1,2,3').split(',').map(Number);
const PARALELO = Number(arg('paralelo', '4'));
const REFAZER = process.argv.includes('--refazer');

const DIR = resolve(RAIZ, 'docs/qa/lancamento/robo/rodadas', RODADA);
const BRUTO = resolve(DIR, 'bruto');
const IMG = resolve(DIR, 'img');
mkdirSync(BRUTO, { recursive: true });
mkdirSync(IMG, { recursive: true });

const cursos = carregarCursos('aluna@demo.local', [...ALVO.keys()]).filter((c) => !SO_CURSOS || SO_CURSOS.includes(c.codigo));
const cookies = await login(BASE);

// fila: um trabalho = uma aula com os seus caminhos EM SEQUÊNCIA (caminhos da mesma aula em paralelo reiniciariam a
// tentativa um do outro)
const fila = [];
const naoCobertos = [];
for (const c of cursos) {
  if (!c.publicado) {
    naoCobertos.push({ curso: c.codigo, titulo: c.titulo, motivo: 'curso ainda não publicado' });
    continue;
  }
  if (!c.matricula) {
    naoCobertos.push({ curso: c.codigo, titulo: c.titulo, motivo: 'a conta de teste não tem matrícula neste curso' });
    continue;
  }
  const soEstas = ALVO.get(c.codigo);
  const faltam = (soEstas || []).filter((n) => n > c.aulas.length);
  if (faltam.length)
    naoCobertos.push({ curso: c.codigo, titulo: c.titulo, motivo: `a matrícula está na versão ${c.versao}${c.ultimaVersao && c.ultimaVersao !== c.versao ? ` (a publicada mais recente é ${c.ultimaVersao})` : ''}, que tem ${c.aulas.length} aulas: a aula ${faltam.join(', ')} não existe nela` });
  else if (c.ultimaVersao && c.versao !== c.ultimaVersao) console.log(`aviso: ${c.codigo} matrícula na versão ${c.versao}, a publicada mais recente é ${c.ultimaVersao}`);
  c.aulas.forEach((a, i) => {
    if (SO_AULAS && !SO_AULAS.includes(i + 1)) return;
    if (soEstas && !soEstas.includes(i + 1)) return;
    fila.push({ c, a, n: i + 1 });
  });
}
writeFileSync(
  resolve(DIR, 'rodada.json'),
  JSON.stringify({ rodada: RODADA, inicio: new Date().toISOString(), base: BASE, alvo: Object.fromEntries(ALVO), caminhos: CAMINHOS, paralelo: PARALELO, cursos: cursos.map((c) => ({ codigo: c.codigo, id: c.id, titulo: c.titulo, matricula: c.matricula, versao: c.versao, aulas: c.aulas.map((a) => a.id) })), naoCobertos }, null, 1),
);
console.log(`rodada ${RODADA}: ${fila.length} aulas × ${CAMINHOS.length} caminhos, ${PARALELO} navegadores; não cobertos: ${naoCobertos.map((x) => x.curso).join(', ') || 'nenhum'}`);

const lancar = () => chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

// cabeçalho do catálogo e da página de cada curso (consistência da marca)
{
  const b = await lancar();
  const paginas = [await cabecalhoDaPagina({ browser: b, cookies, url: `${BASE}/aprender`, img: IMG, nome: 'catalogo' })];
  for (const c of cursos) if (c.matricula) paginas.push({ curso: c.codigo, ...(await cabecalhoDaPagina({ browser: b, cookies, url: `${BASE}/aprender/${c.matricula}`, img: IMG, nome: c.codigo })) });
  writeFileSync(resolve(BRUTO, '_paginas.json'), JSON.stringify(paginas, null, 1));
  await b.close();
}

let feitos = 0;
const total = fila.length * CAMINHOS.length;
async function trabalhador(w) {
  let browser = await lancar();
  while (fila.length) {
    const { c, a, n } = fila.shift();
    const primeira = a.graph.nodes.find((x) => x.type === 'scenario' || x.type === 'content')?.id;
    for (const cam of CAMINHOS) {
      const nome = `${c.codigo}-A${String(n).padStart(2, '0')}-c${cam}`;
      const arq = resolve(BRUTO, `${nome}.json`);
      if (!REFAZER && existsSync(arq) && JSON.parse(readFileSync(arq, 'utf8')).concluiu) {
        feitos++;
        continue;
      }
      let r;
      try {
        if (!browser.isConnected()) browser = await lancar();
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
          r = await rodarAula({ browser, cookies, url: `${BASE}/aprender/${c.matricula}/aulas/${a.id}`, caminho: cam, primeiraCena: primeira, img: IMG, prefixo: nome, estavel: `${c.codigo}-A${String(n).padStart(2, '0')}` });
          r.tentativaDoRobo = tentativa;
          // página recarregou no meio (HMR): a medida não vale, roda de novo
          const ambiente = /página indisponível|ERR_CONNECTION_REFUSED|net::ERR/.test(r.motivoParada || '');
          if (!r.recarregou && !ambiente) break;
          console.log(`[${w}] ${nome} ${ambiente ? 'falha do ambiente' : 'recarregou no meio'}; refazendo (${tentativa}/3)`);
          await new Promise((ok) => setTimeout(ok, 10000));
        }
      } catch (err) {
        r = { url: `${BASE}/aprender/${c.matricula}/aulas/${a.id}`, caminho: cam, concluiu: false, motivoParada: `erro do robô: ${String(err?.stack || err).slice(0, 400)}`, achados: [], videos: [], telas: [] };
        try { await browser.close(); } catch {}
        browser = await lancar();
      }
      Object.assign(r, { curso: c.codigo, cursoId: c.id, aula: n, aulaId: a.id, aulaTitulo: a.title, nome, quando: new Date().toISOString() });
      writeFileSync(arq, JSON.stringify(r, null, 1));
      feitos++;
      const probs = (r.achados || []).length;
      console.log(`[${w}] ${feitos}/${total} ${nome} ${r.concluiu ? 'ok' : 'PAROU: ' + r.motivoParada} ${r.duracaoS ?? '?'}s achados=${probs} erros=${(r.erros || []).length}`);
    }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: PARALELO }, (_, i) => trabalhador(i + 1)));
const meta = JSON.parse(readFileSync(resolve(DIR, 'rodada.json'), 'utf8'));
meta.fim = new Date().toISOString();
writeFileSync(resolve(DIR, 'rodada.json'), JSON.stringify(meta, null, 1));
console.log('fim da rodada', RODADA);

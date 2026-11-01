#!/usr/bin/env node
// Varredura de privacidade: abre as páginas da aluna num navegador de verdade (desktop e celular) e lista TODO pedido que
// sai para fora do nosso domínio (imagens, fontes, scripts, vídeo, XHR, websocket…). Para a política de privacidade valer,
// a lista tem de vir vazia em toda página do aluno.
//
//   node tools/robo-aluno/externos.mjs [--curso C02] [--saida caminho.json] [--sem-aula]
//
// Só a conta aluna@demo.local (a senha vem do seed em tempo de execução e nunca é impressa). Não encerra sessão de ninguém.
// A parte da aula usa o robô (rodarAula): toca o vídeo, responde a pergunta, faz a missão e chega ao fim.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, carregarCursos, sql } from './dados.mjs';
import { login } from './login.mjs';
import { rodarAula } from './aula.mjs';

const { chromium } = await import(resolve(RAIZ, 'node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs'));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:3010');
const CURSO = arg('curso', 'C02');
const SAIDA = arg('saida', '');
const SEM_AULA = process.argv.includes('--sem-aula');
const ORIGEM = new URL(BASE).host;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORTS = { desktop: { viewport: { width: 1440, height: 900 } }, celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' } };

const achados = []; // { viewport, pagina, tipo, url }
let paginaAtual = '(início)';
let viewportAtual = 'desktop';
const externo = (u) => {
  if (/^(data|blob|about):/.test(u)) return false;
  try {
    return new URL(u).host !== ORIGEM;
  } catch {
    return true;
  }
};
const vigiar = (ctx) => {
  ctx.on('request', (r) => {
    if (externo(r.url())) achados.push({ viewport: viewportAtual, pagina: paginaAtual, tipo: r.resourceType(), url: r.url().replace(/([?&](?:Signature|Key-Pair-Id|X-Amz-[A-Za-z-]+|token)=)[^&]*/g, '$1…') });
  });
  ctx.on('page', (p) => p.on('websocket', (ws) => externo(ws.url()) && achados.push({ viewport: viewportAtual, pagina: paginaAtual, tipo: 'websocket', url: ws.url() })));
};

async function visitar(ctx, rotulo, caminho, { espera = 2500, antes } = {}) {
  paginaAtual = rotulo;
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${caminho}`, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    if (antes) await antes(page);
    await sleep(espera);
    // rola a página inteira para disparar imagens preguiçosas (loading="lazy")
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    }).catch(() => null);
    await sleep(800);
  } finally {
    await page.close().catch(() => null);
  }
}

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const cookies = await login(BASE);
const [c] = carregarCursos('aluna@demo.local', [CURSO]);
if (!c?.matricula) throw new Error(`a conta de teste não tem matrícula em ${CURSO}`);
const trilhaNome = sql(`select trail from courses where id = '${c.id}'`);
const trilha = trilhaNome.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const selo = sql(`select b.code from trail_badges b join "user" u on u.id = b.user_id where u.email = 'aluna@demo.local' and b.revoked_at is null limit 1`);
const aulas = c.aulas;
const urlAula = (i) => `${BASE}/aprender/${c.matricula}/aulas/${aulas[i].id}`;

for (const [vp, cfg] of Object.entries(VIEWPORTS)) {
  viewportAtual = vp;
  // 1) páginas públicas, sem sessão
  {
    const ctx = await browser.newContext({ ...cfg, deviceScaleFactor: 1 });
    vigiar(ctx);
    await visitar(ctx, '/login', '/login');
    if (selo) {
      await visitar(ctx, `/selo/<código> (público)`, `/selo/${selo}`);
      await visitar(ctx, `/selo/<código>/certificado (público)`, `/selo/${selo}/certificado`);
    }
    await visitar(ctx, '/selo/<código inexistente> (público)', '/selo/DNA-XXXX-XXXX');
    await ctx.close();
  }
  // 2) páginas da aluna
  {
    const ctx = await browser.newContext({ ...cfg, deviceScaleFactor: 1 });
    await ctx.addCookies(cookies);
    vigiar(ctx);
    await visitar(ctx, '/aprender', '/aprender');
    await visitar(ctx, `página do curso ${CURSO}`, `/aprender/${c.matricula}`);
    await visitar(ctx, '/aprender/trilhas', '/aprender/trilhas');
    await visitar(ctx, `página da trilha (${trilha})`, `/aprender/trilhas/${trilha}`);
    if (selo) {
      await visitar(ctx, `/selo/<código> (logada)`, `/selo/${selo}`);
      await visitar(ctx, `/selo/<código>/certificado (logada)`, `/selo/${selo}/certificado`);
    }
    // aula: só abre, toca e espera (o celular não percorre a aula inteira; o desktop percorre abaixo, com o robô)
    if (vp === 'celular') {
      await visitar(ctx, `aula 1 do ${CURSO} (abre e toca)`, new URL(urlAula(0)).pathname + '?reiniciar=1', {
        espera: 6000,
        antes: async (page) => {
          const b = page.locator('[data-testid="player-watch"]').first();
          if (await b.count()) await b.tap({ timeout: 4000 }).catch(() => null);
        },
      });
    }
    await ctx.close();
  }
}

// 3) aula inteira no desktop (vídeo, pergunta, missão, fim da aula e fim do curso na última aula), pelo robô
if (!SEM_AULA) {
  viewportAtual = 'desktop';
  const proxy = {
    newContext: async (...a) => {
      const ctx = await browser.newContext(...a);
      vigiar(ctx);
      return ctx;
    },
  };
  const img = resolve(RAIZ, 'docs/qa/lancamento/robo/rodadas/_externos/img');
  mkdirSync(img, { recursive: true });
  for (const i of [0, aulas.length - 1].filter((v, k, a) => a.indexOf(v) === k)) {
    paginaAtual = i === 0 ? `aula 1 do ${CURSO} (vídeo, pergunta, missão, fim)` : `última aula do ${CURSO} (inclui o fim do curso)`;
    const r = await rodarAula({ browser: proxy, cookies, url: urlAula(i), caminho: 1, primeiraCena: aulas[i].graph.nodes.find((x) => x.type === 'scenario' || x.type === 'content')?.id, img, prefixo: `externos-${CURSO}-${i + 1}`, provaCelular: false });
    console.log(`  ${paginaAtual}: ${r.concluiu ? 'chegou ao fim' : `parou (${r.motivoParada})`}`);
  }
}
await browser.close();

// relatório
const porChave = new Map();
for (const a of achados) {
  const k = `${a.viewport} | ${a.pagina} | ${new URL(a.url).host} | ${a.tipo}`;
  const m = porChave.get(k) ?? { n: 0, exemplo: a.url };
  m.n++;
  porChave.set(k, m);
}
console.log(`\nPedidos para fora de ${ORIGEM}: ${achados.length}`);
for (const [k, v] of [...porChave].sort()) console.log(`  ${v.n}×  ${k}   ${v.exemplo.slice(0, 110)}`);
const hosts = [...new Set(achados.map((a) => new URL(a.url).host))];
console.log(`Hosts externos: ${hosts.length ? hosts.join(', ') : '(nenhum)'}`);
if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ origem: ORIGEM, curso: CURSO, selo: !!selo, achados }, null, 1));
process.exit(0);

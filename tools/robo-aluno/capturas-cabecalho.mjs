// Capturas do cabeçalho do player (logo à esquerda, nome curto do curso no centro) em 1440 e 375 px, claro e escuro.
// Uso: node tools/robo-aluno/capturas-cabecalho.mjs --cursos C02,C13 --sufixo v2 --saida docs/qa/lancamento/robo/correcoes-player
// Só lê e abre a primeira cena da aula 1 (conta aluna@demo.local, versão publicada); a senha vem de login.mjs e nunca é impressa.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, carregarCursos } from './dados.mjs';
import { login } from './login.mjs';
const { chromium } = await import(resolve(RAIZ, 'node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs'));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const CODS = arg('cursos', 'C02,C13').split(',');
const SUF = arg('sufixo', 'v2');
const SAIDA = resolve(RAIZ, arg('saida', 'docs/qa/lancamento/robo/correcoes-player'));
const BASE = 'http://localhost:3010';
const SO_LER = process.argv.includes('--sem-capturas');
mkdirSync(SAIDA, { recursive: true });
const cursos = carregarCursos('aluna@demo.local', CODS);
const cookies = await login(BASE);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const out = [];
for (const c of cursos) {
  for (const [vp, w, h, rotulo] of [['desktop', 1440, 900, 'desktop-1440'], ['celular', 375, 812, 'celular-375']]) {
    for (const esquema of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: esquema, ...(vp === 'celular' ? { hasTouch: true, isMobile: true } : {}) });
      await ctx.addCookies(cookies);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/aprender/${c.matricula}/aulas/${c.aulas[0].id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid=player-brand]').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(1800);
      const info = await page.evaluate(() => {
        const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        const logos = [...document.querySelectorAll('[data-testid=brand-logo]')];
        const nome = document.querySelector('[data-testid=player-course-name]');
        const header = document.querySelector('header');
        const botoes = [...document.querySelectorAll('header button')].map((b) => b.getBoundingClientRect());
        const nr = nome?.getBoundingClientRect();
        return {
          logoNoDom: logos.length,
          logoVisivel: logos.some((l) => [...l.querySelectorAll('img')].some(vis)),
          logoDoPlayer: !!document.querySelector('[data-testid=player-brand] [data-testid=brand-logo]'),
          linkDoLogo: document.querySelector('[data-testid=player-brand]')?.getAttribute('aria-label') ?? null,
          logoAlt: document.querySelector('[data-testid=player-brand] [data-testid=brand-logo]')?.getAttribute('aria-label') ?? null,
          centroVisivel: vis(nome),
          centroTexto: nome?.textContent?.trim() ?? null,
          semRolagemHorizontal: document.documentElement.scrollWidth <= window.innerWidth,
          centroNaoEncostaBotoes: nr && botoes.length ? botoes.every((b) => nr.right <= b.left + 0.5 || nr.left >= b.right - 0.5) : null,
          headerH: Math.round(header?.getBoundingClientRect().height ?? 0),
        };
      });
      if (!SO_LER) await page.screenshot({ path: resolve(SAIDA, `${c.codigo}-${rotulo}-${esquema}-${SUF}.png`) });
      out.push({ curso: c.codigo, titulo: c.titulo, viewport: rotulo, tema: esquema, ...info });
      await ctx.close();
    }
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));

#!/usr/bin/env node
// Conferência de ponta a ponta da tarefa com entrega, num navegador de verdade (Playwright), contra um servidor de
// desenvolvimento apontado para um BANCO-CÓPIA. Grava as capturas nesta pasta.
//
// Passos: publicar o roteiro de exemplo (autor), matricular a aluna (admin), a aluna envia o link e um PDF pela aula,
// o revisor devolve com comentário, a aluna vê o comentário e reenvia pela página do curso, o revisor aprova, a aluna
// vê "Entrega aprovada". No meio: um link sem https é recusado, e outra conta de aluno não lê o arquivo da aluna.
//
// node docs/qa/tarefa/fluxo.mjs --base http://localhost:3023 --curso crs_… [--so aluna|correcao]
// As senhas vêm do seed do projeto (packages/db/src/seed/seed.ts) em tempo de execução e nunca são impressas.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../..');
const { chromium } = await import(resolve(RAIZ, 'node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs'));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:3023');
const CURSO = arg('curso');
if (!CURSO) {
  console.error('uso: fluxo.mjs --curso <crs_…> [--base http://localhost:3023]');
  process.exit(2);
}
const seed = readFileSync(resolve(RAIZ, 'packages/db/src/seed/seed.ts'), 'utf8');
const SENHA = seed.match(/SEED_PASSWORD\s*=\s*['"`]([^'"`]+)['"`]/)?.[1];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const passos = [];
const ok = (nome, cond, detalhe = '') => {
  passos.push({ nome, ok: !!cond, detalhe });
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` · ${detalhe}` : ''}`);
  if (!cond) process.exitCode = 1;
};

async function entrar(browser, email, opts = {}) {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email, password: SENHA }) });
  if (!r.ok) throw new Error(`login de ${email} falhou: ${r.status}`);
  const cookies = r.headers.getSetCookie().map((c) => {
    const [nv] = c.split(';');
    const i = nv.indexOf('=');
    return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: new URL(BASE).hostname, path: '/' };
  });
  const ctx = await browser.newContext({ viewport: opts.celular ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: opts.celular ? 2 : 1, isMobile: !!opts.celular, hasTouch: !!opts.celular, colorScheme: opts.escuro ? 'dark' : 'light', reducedMotion: 'reduce' });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [erro de página ${email}] ${String(e).slice(0, 200)}`));
  return { ctx, page };
}
const foto = (page, nome, full = true) => page.screenshot({ path: resolve(AQUI, `${nome}.png`), fullPage: full });
const t = (id) => `[data-testid="${id}"]`;

/** Anda pela aula até o painel da tarefa (cenas sem vídeo: "Continuar"; decisão: primeira opção). */
async function ateATarefa(page) {
  for (let i = 0; i < 40; i++) {
    if (await page.locator(t('task-panel')).count()) {
      const st = await page.locator(t('task-panel')).getAttribute('data-state');
      if (st !== 'loading') return st;
    } else if (await page.locator(`${t('choice-panel')} label:has([data-testid^="option-"])`).count()) {
      await page.locator(`${t('choice-panel')} label:has([data-testid^="option-"])`).first().click();
      await page.locator(t('player-submit')).click();
    } else {
      for (const id of ['opening-read', 'player-continue', 'reaction-continue', 'video-skip']) {
        const b = page.locator(t(id)).first();
        if ((await b.count()) && (await b.isVisible()) && (await b.isEnabled())) {
          await b.click().catch(() => null);
          break;
        }
      }
    }
    await page.waitForTimeout(500);
  }
  return null;
}

const browser = await chromium.launch({ headless: true });
const SO = arg('so', '');
const estado = { matricula: null, entrega: null };

try {
  /* 1. publicar (autor) e matricular (admin) */
  const autor = await entrar(browser, 'autor@demo.local');
  await autor.page.goto(`${BASE}/estudio/cursos/${CURSO}/revisao`, { waitUntil: 'networkidle' });
  const jaPublicado = !(await autor.page.locator(t('publish')).count()) ? false : await autor.page.getByText(/Versão \d+ publicada|v\d+ publicada/i).count();
  if (await autor.page.locator(t('publish')).isEnabled().catch(() => false)) {
    await autor.page.locator(t('publish')).click();
    await autor.page.locator(t('publish-confirm')).waitFor({ timeout: 10000 });
    const sim = autor.page.locator(t('publish-allow-simulated'));
    if (await sim.count()) await sim.check().catch(() => null);
    await foto(autor.page, '01-estudio-publicar');
    await autor.page.locator(t('publish-confirm-button')).click();
    await autor.page.locator(t('publish-message')).waitFor({ timeout: 20000 });
    ok('autor publica o roteiro de exemplo com as duas tarefas', /publicad/i.test(await autor.page.locator(t('publish-message')).innerText()), (await autor.page.locator(t('publish-message')).innerText()).slice(0, 80));
  } else ok('curso já publicado (rodada repetida)', true, String(jaPublicado));
  await autor.ctx.close();

  const admin = await entrar(browser, 'admin@demo.local');
  await admin.page.goto(`${BASE}/estudio/cursos/${CURSO}/matriculas`, { waitUntil: 'networkidle' });
  const sel = admin.page.locator(t('enroll-user'));
  if (await sel.count()) {
    const valor = await sel.locator('option', { hasText: 'aluna@demo.local' }).first().getAttribute('value').catch(() => null);
    if (valor) {
      await sel.selectOption(valor);
      await admin.page.locator(t('enroll-submit')).click();
      await admin.page.waitForTimeout(1500);
    }
  }
  await admin.page.goto(`${BASE}/estudio/cursos/${CURSO}/matriculas`, { waitUntil: 'networkidle' });
  const linha = admin.page.locator(`${t('enrollment-list')} li`, { hasText: 'aluna@demo.local' }).first();
  ok('admin matricula aluna@demo.local', (await linha.count()) === 1);
  estado.matricula = (await linha.locator('a', { hasText: 'Relatório' }).getAttribute('href'))?.split('/').pop();
  await foto(admin.page, '02-estudio-matricula');
  await admin.ctx.close();
  const ENR = estado.matricula;

  /* 2. a aluna envia pela aula (celular) */
  const aluna = await entrar(browser, 'aluna@demo.local', { celular: true });
  await aluna.page.goto(`${BASE}/aprender/${ENR}/aulas/aula_01`, { waitUntil: 'networkidle' });
  const st = await ateATarefa(aluna.page);
  ok('a aula chega ao painel da tarefa', st === 'open' || st === 'returned', `estado ${st}`);
  if (st === 'open') {
    const painel = aluna.page.locator(t('task-panel'));
    ok('o painel mostra a instrução e "O que o avaliador confere" com 3 critérios', (await painel.locator(t('task-instruction')).count()) === 1 && (await painel.locator(`${t('task-criteria')} li`).count()) === 3, (await painel.locator(`${t('task-criteria')} h3`).innerText()).trim());
    ok('sem rolagem horizontal no celular (390 px)', await aluna.page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth));
    await foto(aluna.page, '03-aluna-tarefa-celular');
    // link sem https: recusado na tela, sem sair da tarefa
    await aluna.page.locator(t('task-link')).fill('http://exemplo.com/video');
    await aluna.page.locator(t('task-submit')).click();
    await aluna.page.locator(t('task-link-error')).waitFor({ timeout: 5000 });
    ok('link sem https é recusado com mensagem', /https:\/\//.test(await aluna.page.locator(t('task-link-error')).innerText()));
    // arquivo de tipo errado (texto com nome .pdf): o servidor recusa pelos bytes
    await aluna.page.locator(t('task-link')).fill('https://example.com/minha-apresentacao');
    await aluna.page.locator(t('task-file')).setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ este arquivo nao e um pdf') });
    await aluna.page.locator(t('task-submit')).click();
    await aluna.page.locator(t('task-file-error')).waitFor({ timeout: 10000 });
    ok('arquivo disfarçado de PDF é recusado pelo servidor', /Tipo de arquivo não aceito/.test(await aluna.page.locator(t('task-file-error')).innerText()));
    await foto(aluna.page, '04-aluna-arquivo-recusado-celular');
    // envio certo: link + PDF
    await aluna.page.locator(t('task-file')).setInputFiles({ name: 'roteiro-da-apresentacao.pdf', mimeType: 'application/pdf', buffer: PDF });
    await aluna.page.locator(t('task-submit')).click();
    await aluna.page.locator(t('task-saved')).waitFor({ timeout: 20000 });
    const status = aluna.page.locator(`${t('task-saved')} ${t('task-status')}`);
    ok('depois do envio: "Entrega enviada. Em correção." com o link e o arquivo', (await status.getAttribute('data-status')) === 'submitted' && (await status.locator(t('task-sent-file')).count()) === 1, (await status.locator('h3').innerText()).trim());
    await foto(aluna.page, '05-aluna-entrega-enviada-celular');
    await aluna.page.locator(t('task-continue')).click();
    await aluna.page.locator(t('player-completed')).waitFor({ timeout: 15000 });
    ok('a aula conclui logo depois do envio (a tarefa não trava a aula)', true);
    await foto(aluna.page, '06-aluna-aula-concluida-celular');
  }
  await aluna.page.goto(`${BASE}/aprender/${ENR}`, { waitUntil: 'networkidle' });
  const cartao = aluna.page.locator(t('task-delivery-t01'));
  ok('a página do curso mostra "Suas entregas" com a situação', (await cartao.count()) === 1, await cartao.locator(t('task-status')).getAttribute('data-status').catch(() => 'sem entrega'));
  const hrefArquivo = await cartao.locator(t('task-sent-file')).getAttribute('href').catch(() => null);
  await aluna.page.locator(t('task-deliveries')).scrollIntoViewIfNeeded();
  await foto(aluna.page, '07-aluna-suas-entregas-celular', false);

  /* 3. leitura do arquivo: a dona lê; outro aluno, não; sem sessão, não */
  if (hrefArquivo) {
    const dona = await aluna.ctx.request.get(`${BASE}${hrefArquivo}`);
    ok('a aluna lê o próprio arquivo (PDF como download)', dona.status() === 200 && /attachment/.test(dona.headers()['content-disposition'] || ''), `${dona.status()} ${dona.headers()['content-disposition']}`);
    const outro = await entrar(browser, 'tarefa-teste-outra@demo.local');
    const r2 = await outro.ctx.request.get(`${BASE}${hrefArquivo}`);
    ok('outra conta de aluno recebe 404 no arquivo da aluna', r2.status() === 404, String(r2.status()));
    const r3 = await outro.ctx.request.get(`${BASE}/api/enrollments/${ENR}/tasks`);
    ok('outra conta de aluno não lê as entregas da matrícula da aluna', r3.status() === 404, String(r3.status()));
    const r4 = await outro.ctx.request.get(`${BASE}/estudio/entregas`, { maxRedirects: 0 }).catch((e) => ({ status: () => String(e).slice(0, 40) }));
    ok('aluno não abre a fila de correção do estúdio', r4.status() !== 200, String(r4.status()));
    await outro.ctx.close();
    const anon = await fetch(`${BASE}${hrefArquivo}`);
    ok('sem sessão: 401 no arquivo', anon.status === 401, String(anon.status));
  }

  /* 4. o revisor devolve com comentário */
  const revisor = await entrar(browser, 'revisor@demo.local');
  await revisor.page.goto(`${BASE}/estudio/entregas`, { waitUntil: 'networkidle' });
  await foto(revisor.page, '08-estudio-fila-entregas');
  const item = revisor.page.locator(`${t('submission-list')} li`, { hasText: 'aluna@demo.local' }).first();
  const situacaoAtual = await cartao.locator(t('task-status')).getAttribute('data-status').catch(() => null);
  if (situacaoAtual === 'submitted' && SO !== 'aprovar') {
    ok('a entrega da aluna está na fila "Para corrigir"', (await item.count()) === 1);
    await revisor.page.goto(`${BASE}/estudio/cursos/${CURSO}/entregas`, { waitUntil: 'networkidle' });
    await foto(revisor.page, '09-estudio-entregas-do-curso');
    await revisor.page.locator(`${t('submission-list')} li`, { hasText: 'aluna@demo.local' }).first().locator(t('submission-open')).click();
    await revisor.page.locator(t('review-form')).waitFor({ timeout: 15000 });
    const link = revisor.page.locator(t('submission-link'));
    ok('o link do aluno abre em outra aba com rel="noopener noreferrer"', (await link.getAttribute('rel')) === 'noopener noreferrer' && (await link.getAttribute('target')) === '_blank', await link.getAttribute('href'));
    ok('o avaliador vê o arquivo enviado', (await revisor.page.locator(t('submission-file')).count()) === 1);
    ok('sem marcar os critérios, não dá para aprovar nem devolver', (await revisor.page.locator(t('review-approve')).isDisabled()) && (await revisor.page.locator(t('review-return')).isDisabled()));
    await revisor.page.locator(t('criterion-c1-sim')).check();
    await revisor.page.locator(t('criterion-c2-sim')).check();
    await revisor.page.locator(t('criterion-c3-nao')).check();
    ok('com um critério "não", aprovar fica desligado', await revisor.page.locator(t('review-approve')).isDisabled());
    await revisor.page.locator(t('review-comment')).fill('Seu vídeo ficou com 2 minutos. Corte para até 1 minuto e envie o link novo.');
    await foto(revisor.page, '10-estudio-correcao-devolver');
    await revisor.page.locator(t('review-return')).click();
    await revisor.page.locator(`${t('review-done')}, ${t('submission-result')}`).first().waitFor({ timeout: 15000 });
    ok('o revisor devolve com comentário', true);
    await revisor.page.waitForTimeout(800);
    await foto(revisor.page, '11-estudio-entrega-devolvida');

    /* 5. a aluna vê o comentário e reenvia pela página do curso */
    await aluna.page.goto(`${BASE}/aprender/${ENR}`, { waitUntil: 'networkidle' });
    const dev = aluna.page.locator(t('task-delivery-t01'));
    ok('a aluna vê "devolvida" com o comentário do avaliador', (await dev.locator(t('task-status')).getAttribute('data-status')) === 'returned' && /Corte para até 1 minuto/.test(await dev.locator(t('task-comment')).innerText()));
    await dev.scrollIntoViewIfNeeded();
    await foto(aluna.page, '12-aluna-entrega-devolvida-celular');
    await dev.locator(t('task-link')).fill('https://example.com/minha-apresentacao-1-minuto');
    await dev.locator(t('task-file')).setInputFiles({ name: 'roteiro-novo.pdf', mimeType: 'application/pdf', buffer: PDF });
    await dev.locator(t('task-resubmit-send')).click();
    await aluna.page.waitForFunction(() => document.querySelector('[data-testid="task-delivery-t01"] [data-testid="task-status"]')?.getAttribute('data-status') === 'submitted', null, { timeout: 20000 });
    ok('a aluna reenvia (link e PDF novos) e a entrega volta para "Em correção"', true);
    await foto(aluna.page, '13-aluna-reenviada-celular');
  }

  /* 6. o revisor aprova */
  await revisor.page.goto(`${BASE}/estudio/cursos/${CURSO}/entregas`, { waitUntil: 'networkidle' });
  const pend = revisor.page.locator(`${t('submission-list')} li`, { hasText: 'aluna@demo.local' }).first();
  if (await pend.count()) {
    await pend.locator(t('submission-open')).click();
    await revisor.page.locator(t('review-form')).waitFor({ timeout: 15000 });
    for (const c of ['c1', 'c2', 'c3']) await revisor.page.locator(t(`criterion-${c}-sim`)).check();
    await revisor.page.locator(t('review-comment')).fill('Agora sim: claro e dentro do tempo.');
    await foto(revisor.page, '14-estudio-correcao-aprovar');
    await revisor.page.locator(t('review-approve')).click();
    await revisor.page.locator(`${t('review-done')}, ${t('submission-result')}`).first().waitFor({ timeout: 15000 });
    await revisor.page.waitForTimeout(800);
    await revisor.page.reload({ waitUntil: 'networkidle' });
    ok('o revisor aprova', /Aprovada/.test(await revisor.page.locator(t('submission-status')).innerText()));
    ok('o histórico mostra enviada, devolvida, reenviada e aprovada', (await revisor.page.locator(`${t('submission-history')} li`).count()) >= 4, `${await revisor.page.locator(`${t('submission-history')} li`).count()} linhas`);
    await foto(revisor.page, '15-estudio-entrega-aprovada');
  }
  await revisor.page.goto(`${BASE}/estudio/cursos/${CURSO}/entregas?situacao=approved`, { waitUntil: 'networkidle' });
  await foto(revisor.page, '16-estudio-aprovadas');
  await revisor.ctx.close();

  /* 7. a aluna vê a aprovação: na página do curso e ao voltar à tarefa na aula */
  await aluna.page.goto(`${BASE}/aprender/${ENR}`, { waitUntil: 'networkidle' });
  const fim = aluna.page.locator(t('task-delivery-t01'));
  ok('a aluna vê "Entrega aprovada" na página do curso', (await fim.locator(t('task-status')).getAttribute('data-status')) === 'approved');
  await fim.scrollIntoViewIfNeeded();
  await foto(aluna.page, '17-aluna-entrega-aprovada-celular');
  await aluna.ctx.close();

  const desk = await entrar(browser, 'aluna@demo.local', { escuro: true });
  await desk.page.goto(`${BASE}/aprender/${ENR}/aulas/aula_01?reiniciar=1`, { waitUntil: 'networkidle' });
  const st2 = await ateATarefa(desk.page);
  ok('aula refeita: a tarefa aparece como aprovada, com "Continuar" (sem enviar de novo)', st2 === 'approved' && (await desk.page.locator(t('task-keep')).count()) === 1, `estado ${st2}`);
  await foto(desk.page, '18-aluna-tarefa-aprovada-na-aula-desktop', false);
  await desk.page.locator(t('task-keep')).click();
  await desk.page.locator(t('player-completed')).waitFor({ timeout: 15000 });
  ok('"Continuar" segue e a aula conclui de novo', true);
  await desk.ctx.close();
} catch (e) {
  ok('fluxo sem erro inesperado', false, String(e?.stack || e).slice(0, 600));
} finally {
  await browser.close();
  writeFileSync(resolve(AQUI, 'fluxo-resultado.json'), JSON.stringify({ quando: new Date().toISOString(), base: BASE, curso: CURSO, matricula: estado.matricula, passos }, null, 1));
  console.log(`${passos.filter((p) => p.ok).length}/${passos.length} passos ok`);
}

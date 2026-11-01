// Uma aula, um caminho: toca tudo a 2x (sem pular nada), responde a opção N em todas as perguntas, monta e salva a
// atividade (com prova no celular), chega ao fim. Devolve o registro bruto (telas, vídeos, ações, achados ao vivo).
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const INIT = readFileSync(resolve(AQUI, 'pagina.js'), 'utf8');
export const DESKTOP = { width: 1440, height: 900 };
export const CELULAR = { width: 390, height: 844 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function novoContexto(browser, cookies, celular) {
  const ctx = await browser.newContext(
    celular ? { viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' } : { viewport: DESKTOP, deviceScaleFactor: 1 },
  );
  await ctx.addCookies(cookies);
  await ctx.addInitScript(INIT);
  return ctx;
}

function vigiaErros(page, erros) {
  page.on('pageerror', (e) => erros.push({ tipo: 'pagina', texto: String(e?.message || e).slice(0, 300) }));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push({ tipo: 'console', texto: m.text().slice(0, 300) });
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.includes('localhost')) erros.push({ tipo: 'http', texto: `${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`.slice(0, 300) });
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    // trocar de vídeo cancela o download do anterior: normal
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(f) && /\/api\/assets\//.test(r.url())) return;
    erros.push({ tipo: 'rede', texto: `${f} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`.slice(0, 300) });
  });
}

/**
 * @param o.browser  navegador Playwright
 * @param o.cookies  sessão da aluna
 * @param o.url      URL da aula (sem ?reiniciar)
 * @param o.caminho  1, 2 ou 3 (opção escolhida em TODAS as perguntas e grupos da atividade)
 * @param o.primeiraCena id da 1ª cena da aula (a única que deve pedir "Começar aula")
 * @param o.img      pasta das capturas; o.prefixo nome base dos arquivos
 */
export async function rodarAula(o) {
  const { browser, cookies, url, caminho, primeiraCena, img, prefixo, provaCelular = true, estavel = null } = o;
  // capturas com nome estável por nó (<curso>-<aula>-<nó>.jpg), só no caminho 1: ligam o relatório ao raio-X dos cursos
  const fotoEstavel = async (node, opts = {}) => {
    if (!estavel || caminho !== 1) return null;
    const f = `${estavel}-${node}.jpg`;
    try {
      await page.screenshot({ path: resolve(img, f), type: 'jpeg', quality: 60, ...opts });
      return f;
    } catch {
      return null;
    }
  };
  // caminhos 1 a 3: a opção N em tudo; caminho 4: opção 1 e "Fazer depois" na atividade
  const k = caminho === 4 ? 0 : caminho - 1;
  mkdirSync(img, { recursive: true });
  const ctx = await novoContexto(browser, cookies, false);
  const page = await ctx.newPage();
  const erros = [];
  vigiaErros(page, erros);
  const acoes = [];
  const achados = []; // problemas vistos ao vivo
  const obs = []; // observações neutras
  const perguntas = [];
  let atividade = null;
  let missao = null;
  let fim = null;
  const capturas = [];
  const t0 = Date.now();
  let concluiu = false;
  let motivoParada = null;

  const est = () => page.evaluate(() => window.__robo.estado());
  const agora = async () => page.evaluate(() => window.__robo.now()).catch(() => null);
  const foto = async (nome, opts = {}) => {
    const f = `${prefixo}-${nome}.jpg`;
    try {
      await page.screenshot({ path: resolve(img, f), type: 'jpeg', quality: 55, ...opts });
      capturas.push(f);
      return f;
    } catch {
      return null;
    }
  };
  const clicar = async (testid, motivo) => {
    const loc = page.locator(`[data-testid="${testid}"]`).first();
    if (!(await loc.count()) || !(await loc.isVisible()) || !(await loc.isEnabled())) return false;
    const t = await agora();
    const e = await est().catch(() => null);
    await loc.click({ timeout: 4000 }).catch(() => null);
    acoes.push({ t, acao: testid, motivo, tela: e?.tela?.tipo, node: e?.tela?.node ?? null });
    return true;
  };

  // pedidos de tentativa (entrada e "Fazer de novo"): ordem, corpo, status e estado devolvido
  const tentativas = [];
  let recargas = 0;
  page.on('request', (rq) => {
    if (rq.method() === 'POST' && /\/lessons\/[^/]+\/attempts$/.test(rq.url())) tentativas.push({ t: Date.now() - t0, corpo: rq.postData() || '{}', status: null, _rq: rq });
  });
  page.on('response', async (rs) => {
    const x = tentativas.find((y) => y._rq === rs.request());
    if (!x) return;
    x.status = rs.status();
    try {
      const j = await rs.json();
      x.estado = j?.attempt ? `tentativa ${j.attempt.attemptNumber} ${j.attempt.status} em ${j.attempt.state?.currentNodeId}` : (j?.error?.message || j?.message || '').slice(0, 80);
    } catch {}
  });
  await page.goto(`${url}?reiniciar=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  let ultimaChave = '';
  let mudou = Date.now();
  const feitas = new Set();
  const avisos = new Set();
  const limite = Date.now() + 15 * 60 * 1000;
  let fimVisto = null;

  while (Date.now() < limite) {
    await sleep(250);
    let e;
    try {
      e = await est();
    } catch (err) {
      motivoParada = `página indisponível: ${String(err).slice(0, 120)}`;
      break;
    }
    const tl = e.tela;
    const chave = [tl.tipo, tl.node, tl.fase, e.palco ? Math.floor(e.palco.ct * 2) : ''].join('|');
    if (chave !== ultimaChave) {
      ultimaChave = chave;
      mudou = Date.now();
    }
    const parado = Date.now() - mudou;
    const tem = (id) => e.botoes.includes(id);
    const travou = async (texto) => {
      const f = await foto(`travou-${tl.tipo}`);
      achados.push({ tipo: 'fluxo-travado', gravidade: 'bloqueante', t: e.t, etapa: `${tl.tipo}${tl.node ? ':' + tl.node : ''}`, texto, evidencia: f, botoes: e.botoes });
      motivoParada = texto;
    };

    if (tl.tipo === 'carregando') {
      if (parado > 30000) { await travou('a aula não carregou em 30 s'); break; }
      continue;
    }
    if (tl.tipo === 'erro-carregar') { await travou(`erro ao abrir a aula: ${tl.titulo}`); break; }

    if (tl.tipo === 'fim' && !acoes.some((a) => a.acao === 'player-watch' || a.acao.startsWith('opcao-'))) {
      // "?reiniciar=1" devia abrir uma tentativa nova; a tela mostra o fim de uma tentativa concluída
      if (!avisos.has('reiniciar')) {
        avisos.add('reiniciar');
        achados.push({ tipo: 'reiniciar-abriu-fim', gravidade: 'importante', t: e.t, etapa: 'entrada', texto: `"?reiniciar=1" abriu a aula já no fim (tentativa concluída) em vez de começar de novo; pedidos de tentativa na entrada: ${tentativas.map((x) => `${x.corpo} → ${x.status ?? '?'}${x.estado ? ' (' + x.estado + ')' : ''}`).join('; ') || 'nenhum'}`, evidencia: await foto('reiniciar-abriu-fim'), tentativas: [...tentativas] });
      }
      if (parado > 1500) {
        if (recargas >= 3) { await travou('a aula continua abrindo no fim depois de 3 recargas com ?reiniciar=1'); break; }
        recargas++;
        acoes.push({ t: e.t, acao: 'recarregar', motivo: 'reiniciar abriu o fim', tela: 'fim' });
        await page.goto(`${url}?reiniciar=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        ultimaChave = '';
      }
      continue;
    }
    if (tl.tipo === 'fim') {
      if (!fimVisto) {
        fimVisto = Date.now();
        fim = await page.evaluate(() => window.__robo.fim());
      }
      // vinheta tocando no painel final (quem pulou vídeos): espera terminar
      if (tl.vinhetaNoFim && Date.now() - fimVisto < 15000) continue;
      if (Date.now() - fimVisto < 1500) continue;
      fim = await page.evaluate(() => window.__robo.fim());
      if (caminho === 4) await foto('fim-pulou');
      concluiu = true;
      break;
    }

    if (tl.tipo === 'video') {
      if (e.palco && e.palco.paused && !e.palco.ended && parado > 2000) {
        achados.push({ tipo: 'video-pausou', gravidade: 'importante', t: e.t, etapa: `video:${tl.node}`, texto: `o vídeo da cena pausou sozinho em ${e.palco.ct.toFixed(1)} s` });
        (await clicar('video-play-toggle', 'retomar vídeo pausado')) || (await clicar('video-play-toggle-bar', 'retomar'));
        mudou = Date.now();
      } else if (parado > 25000) { await travou(`vídeo da cena ${tl.node} parado há 25 s em ${e.palco?.ct?.toFixed(1)} s`); break; }
      continue;
    }

    if (tl.tipo === 'reacao') {
      if (tl.fase === 'playing') {
        if (parado > 25000) { await travou('reação parada há 25 s'); break; }
        continue;
      }
      if (parado > 2500 && tem('reaction-play')) {
        achados.push({ tipo: 'reacao-nao-tocou', gravidade: 'importante', t: e.t, etapa: 'reacao', texto: 'a reação em vídeo não começou sozinha depois de "Confirmar escolha" (precisou de "Assistir")' });
        await clicar('reaction-play', 'reação não tocou sozinha');
        mudou = Date.now();
      } else if (parado > 25000) { await travou('reação sem tocar nem seguir'); break; }
      continue;
    }

    if (tl.tipo === 'vinheta') {
      if (parado > 25000) { await travou('vinheta não terminou em 25 s'); break; }
      continue;
    }

    if (tl.tipo === 'abertura') {
      const primeira = tl.node === primeiraCena;
      if (!primeira) {
        if (parado < 2500) continue;
        if (!avisos.has('abertura:' + tl.node)) {
          avisos.add('abertura:' + tl.node);
          const f = await foto(`pediu-assistir-${tl.node}`);
          achados.push({ tipo: 'video-nao-seguiu', gravidade: 'importante', t: e.t, etapa: `abertura:${tl.node}`, texto: `a cena "${tl.titulo}" parou na tela "A seguir" pedindo "Assistir" (o vídeo não seguiu sozinho)`, evidencia: f });
        }
      }
      if (!(await clicar('player-watch', primeira ? 'Começar aula' : 'Assistir (não seguiu sozinho)')) && parado > 15000) { await travou('abertura sem botão de assistir'); break; }
      continue;
    }

    if (tl.tipo === 'cena') {
      if (tl.fase === 'playing') {
        if (parado > 25000) { await travou(`vídeo da cena ${tl.node} parado`); break; }
        continue;
      }
      if (tem('player-watch')) {
        if (parado < 1500) continue;
        // depois de uma escolha sem reação em vídeo, o painel mostra "Sua escolha" e espera o Assistir (desenho do player)
        obs.push({ t: e.t, etapa: `cena:${tl.node}`, texto: tl.sobra ? 'cena mostrou "Sua escolha" e pediu "Assistir" (escolha sem reação em vídeo)' : 'cena pediu "Assistir"' });
        if (!tl.sobra && !avisos.has('assistir:' + tl.node)) {
          avisos.add('assistir:' + tl.node);
          achados.push({ tipo: 'video-nao-seguiu', gravidade: 'importante', t: e.t, etapa: `cena:${tl.node}`, texto: `a cena "${tl.titulo}" esperou "Assistir" sem uma escolha antes`, evidencia: await foto(`pediu-assistir-${tl.node}`) });
        }
        await clicar('player-watch', 'Assistir');
        continue;
      }
      if (tl.fase === 'paused') {
        if (parado < 2000) continue;
        achados.push({ tipo: 'video-pausou', gravidade: 'importante', t: e.t, etapa: `cena:${tl.node}`, texto: `o vídeo da cena ${tl.node} ficou pausado no meio (${e.palco?.ct?.toFixed(1)} s)` });
        (await clicar('video-play-toggle-bar', 'retomar')) || (await clicar('video-play-toggle', 'retomar'));
        continue;
      }
      if (tem('player-continue')) {
        // vídeo terminou: o player segue sozinho quando a próxima é pergunta (700 ms); espera 3 s antes de clicar
        if (tl.fase === 'ended' && parado < 3000) continue;
        if (tl.fase === 'ended') obs.push({ t: e.t, etapa: `cena:${tl.node}`, texto: 'vídeo terminou e a cena pediu "Continuar"', manual: true, node: tl.node });
        await clicar('player-continue', tl.fase === 'ended' ? 'Continuar depois do vídeo' : 'Continuar (cena sem vídeo)');
        continue;
      }
      if (parado > 20000) { await travou(`cena ${tl.node} sem ação possível`); break; }
      continue;
    }

    if (tl.tipo === 'pergunta') {
      if (feitas.has('q:' + tl.node)) {
        // a mesma pergunta voltou (recarga da página / voltar cena): responde de novo
        if (parado > 5000 && e.botoes.includes('player-submit(off)') && !feitas.has('q2:' + tl.node)) {
          feitas.add('q2:' + tl.node);
          feitas.delete('q:' + tl.node);
          obs.push({ t: e.t, etapa: `pergunta:${tl.node}`, texto: 'a pergunta reapareceu sem escolha; respondida de novo' });
        } else if (parado > 15000) { await travou(`pergunta ${tl.node} não saiu depois de confirmar`); break; }
        continue;
      }
      await sleep(300);
      const p = await page.evaluate(() => window.__robo.pergunta());
      const n = p?.opcoes?.length || 0;
      if (!n) { if (parado > 10000) { await travou('pergunta sem opções'); break; } continue; }
      const idx = Math.min(k, n - 1);
      feitas.add('q:' + tl.node);
      const fotoPergunta = caminho === 1 ? (await fotoEstavel(tl.node)) || (await foto(`pergunta-${tl.node}`)) : null;
      const ti = await agora();
      await page.locator('[data-testid=choice-panel] label:has([data-testid^="option-"])').nth(idx).click({ timeout: 4000 });
      acoes.push({ t: ti, acao: `opcao-${idx + 1}`, tela: 'pergunta', node: tl.node });
      await sleep(150);
      await clicar('player-submit', 'Confirmar escolha');
      perguntas.push({ node: tl.node, t: ti, ...p, escolhida: p.opcoes[idx], foto: fotoPergunta });
      continue;
    }

    if (tl.tipo === 'atividade') {
      if (feitas.has('a:' + tl.node)) {
        if (parado > 6000 && !feitas.has('a2:' + tl.node) && atividade?.salvoMs != null) {
          feitas.add('a2:' + tl.node);
          feitas.delete('a:' + tl.node);
          obs.push({ t: e.t, etapa: `atividade:${tl.node}`, texto: 'a atividade reapareceu depois de salva; feita de novo' });
        } else if (parado > 20000) { await travou('atividade não confirmou o salvamento em 20 s'); break; }
        continue;
      }
      feitas.add('a:' + tl.node);
      await sleep(600);
      if (caminho === 4) {
        const pulou = await clicar('player-skip', 'Fazer depois');
        atividade = { node: tl.node, pulou };
        if (!pulou) obs.push({ t: e.t, etapa: `atividade:${tl.node}`, texto: 'caminho 4: sem "Fazer depois"; atividade feita normalmente' });
        else continue;
      }
      const antes = await page.evaluate(() => window.__robo.atividade());
      if (!antes) {
        // o painel saiu entre a leitura da tela e a medida (recarga, troca de cena): tenta de novo no próximo ciclo
        feitas.delete('a:' + tl.node);
        continue;
      }
      const fotoAntes = await foto('atividade');
      const passos = [];
      for (let g = 0; g < antes.grupos.length; g++) {
        const grp = antes.grupos[g];
        const idx = Math.min(k, grp.opcoes.length - 1);
        if (idx < 0) continue;
        await page.locator(`[data-testid="scaffold-group-${grp.id}"] label`).nth(idx).click({ timeout: 4000 });
        await sleep(150);
        const s = await page.evaluate(() => window.__robo.atividade());
        passos.push({ grupo: grp.id, escolha: grp.opcoes[idx], frase: s.frase, lacunas: s.lacunas, botao: s.botao });
      }
      const pronta = await page.evaluate(() => window.__robo.atividade());
      const fotoPronta = (await fotoEstavel(tl.node)) || (await foto('atividade-pronta'));
      // prova no celular: outra aba (390x844) abre a mesma aula, que retoma nesta atividade; monta igual e mede, sem salvar
      let celular = null;
      if (provaCelular) celular = await provaNoCelular({ browser, cookies, url, k, img, prefixo }).catch((err) => ({ erro: String(err).slice(0, 200) }));
      await page.bringToFront().catch(() => null);
      const ts = Date.now();
      const tSalvar = await agora();
      await clicar('player-submit', 'Salvar no meu roteiro');
      let salvoMs = null;
      try {
        await page.locator('[data-testid=compose-saved]').waitFor({ state: 'visible', timeout: 15000 });
        salvoMs = Date.now() - ts;
      } catch {}
      const salva = await page.evaluate(() => window.__robo.atividade());
      const fotoSalva = await foto('atividade-salva');
      let fimMs = null;
      let depoisContinuar = null;
      if (salvoMs != null) {
        const tc = Date.now();
        await clicar('compose-continue', 'Continuar aula');
        for (let i = 0; i < 40; i++) {
          await sleep(250);
          const s2 = await est();
          if (s2.tela.tipo !== 'atividade-salva' && s2.tela.tipo !== 'atividade') {
            depoisContinuar = s2.tela.tipo + (s2.tela.node ? ':' + s2.tela.node : '');
            fimMs = Date.now() - tc;
            break;
          }
        }
      }
      atividade = { node: tl.node, tSalvar, antes, passos, pronta, salva, salvoMs, depoisContinuar, fimMs, celular, fotos: { antes: fotoAntes, pronta: fotoPronta, salva: fotoSalva } };
      continue;
    }

    // missão "Leve para a vida real": caminho 4 e 3 deixam "para depois"; 1 e 2 dizem "Já experimentei" (o 1 escreve
    // o que percebeu, o 2 deixa em branco). Os dois estados têm de terminar a aula e a confirmação só vem do servidor.
    if (tl.tipo === 'missao') {
      if (feitas.has('m:' + tl.node)) {
        if (parado > 20000) { await travou('a missão não confirmou o registro em 20 s'); break; }
        continue;
      }
      feitas.add('m:' + tl.node);
      await sleep(500);
      const antes = await page.evaluate(() => window.__robo.missao());
      if (!antes) { feitas.delete('m:' + tl.node); continue; }
      const depois = caminho === 4 || caminho === 3;
      const fotoMissao = (await fotoEstavel(tl.node)) || (await foto(`missao-${depois ? 'depois' : 'feita'}`));
      const ts = Date.now();
      let nota = null;
      if (depois) {
        // revisita: quem já marcou "Já experimentei" (outro caminho na mesma matrícula) volta com o painel em "registrando", sem
        // o botão "Vou fazer depois"; "Voltar" devolve os dois botões
        if (antes.estado === 'reporting') { await clicar('mission-back', 'Voltar'); await sleep(400); }
        await clicar('mission-later', 'Vou fazer depois');
      } else {
        if (antes.estado !== 'reporting') await clicar('mission-done', 'Já experimentei');
        await sleep(300);
        if (caminho === 1) {
          nota = 'Testei com uma colega e foi mais fácil do que eu pensava.';
          await page.locator('[data-testid=mission-note]').fill(nota, { timeout: 4000 }).catch(() => null);
        }
        await clicar('player-submit', 'Salvar e continuar');
      }
      let confirmadoMs = null;
      try {
        await page.locator('[data-testid=mission-saved]').waitFor({ state: 'visible', timeout: 15000 });
        confirmadoMs = Date.now() - ts;
      } catch {}
      const confirmacao = await page.evaluate(() => window.__robo.missao());
      const fotoSalva = await foto('missao-salva');
      if (confirmadoMs == null) achados.push({ tipo: 'missao-sem-confirmacao', gravidade: 'importante', t: e.t, etapa: `missao:${tl.node}`, texto: 'a missão foi enviada mas a confirmação não apareceu em 15 s', evidencia: fotoSalva });
      else await clicar('mission-continue', 'Continuar aula');
      if ((antes.rolagemHorizontal || 0) > 0) achados.push({ tipo: 'missao-rolagem-horizontal', gravidade: 'importante', t: e.t, etapa: `missao:${tl.node}`, texto: `a missão ficou ${antes.rolagemHorizontal}px mais larga que a tela`, evidencia: fotoMissao });
      missao = { node: tl.node, estado: depois ? 'depois' : 'feita', nota, antes, confirmacao, confirmadoMs, fotos: { antes: fotoMissao, salva: fotoSalva } };
      continue;
    }

    if (tl.tipo === 'missao-salva') {
      if (parado > 2000) await clicar('mission-continue', 'Continuar aula');
      if (parado > 20000) { await travou('missão registrada sem seguir'); break; }
      continue;
    }

    if (tl.tipo === 'atividade-salva') {
      if (parado > 2000) await clicar('compose-continue', 'Continuar aula');
      if (parado > 20000) { await travou('atividade salva sem seguir'); break; }
      continue;
    }
  }
  if (!concluiu && !motivoParada) motivoParada = 'tempo esgotado (15 min)';
  // a página recarregou no meio (HMR do servidor de desenvolvimento, por exemplo): a execução não vale como medida
  const recarregou = (await page.evaluate(() => window.__robo.telas.filter((t, i) => i > 0 && t.tipo === 'carregando').length).catch(() => 0)) > 0;
  if (!concluiu) await foto('parou');
  await sleep(300);
  const R = await page.evaluate(() => ({ videos: window.__robo.videos.map(({ _w, _p, ...v }) => v), telas: window.__robo.telas, cabecalhos: window.__robo.cabecalhos })).catch(() => ({ videos: [], telas: [], cabecalhos: [] }));
  await ctx.close().catch(() => null);
  return { url, caminho, concluiu, motivoParada, recarregou, tentativas: tentativas.map(({ _rq, ...x }) => x), duracaoS: Math.round((Date.now() - t0) / 1000), acoes, achados, obs, perguntas, atividade, missao, fim, erros, capturas, ...R };
}

async function provaNoCelular({ browser, cookies, url, k, img, prefixo }) {
  const ctx = await novoContexto(browser, cookies, true);
  const page = await ctx.newPage();
  const erros = [];
  vigiaErros(page, erros);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-testid=compose-panel]').waitFor({ state: 'visible', timeout: 20000 });
    await sleep(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    const antes = await page.evaluate(() => window.__robo.atividade());
    // rolagem até ver o 1º grupo e até o botão de salvar
    for (let g = 0; g < antes.grupos.length; g++) {
      const grp = antes.grupos[g];
      const idx = Math.min(k, grp.opcoes.length - 1);
      if (idx < 0) continue;
      await page.locator(`[data-testid="scaffold-group-${grp.id}"] label`).nth(idx).tap({ timeout: 4000 });
      await sleep(150);
    }
    const pronta = await page.evaluate(() => window.__robo.atividade());
    const f = `${prefixo}-celular.jpg`;
    await page.screenshot({ path: resolve(img, f), type: 'jpeg', quality: 50, fullPage: true });
    return { antes, pronta, foto: f, erros };
  } finally {
    await ctx.close().catch(() => null);
  }
}

/** Cabeçalho das páginas do aluno fora do player (catálogo e página do curso). */
export async function cabecalhoDaPagina({ browser, cookies, url, img, nome }) {
  const ctx = await novoContexto(browser, cookies, false);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
    await sleep(800);
    const cab = await page.evaluate(() => window.__robo.cabecalho());
    const f = `${nome}-cabecalho.jpg`;
    await page.screenshot({ path: resolve(img, f), type: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: 1440, height: 220 } }).catch(() => null);
    return { url, ...cab, foto: f };
  } finally {
    await ctx.close().catch(() => null);
  }
}

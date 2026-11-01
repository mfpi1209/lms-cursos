// Roda DENTRO da página (addInitScript), antes do app: registra cada <video> por ELEMENTO (não por arquivo: a pré-carga
// usa os mesmos arquivos fora do palco), a sequência de telas e o cabeçalho de cada tela. Tudo fica em window.__robo.
(() => {
  if (window.__robo) return;
  const R = (window.__robo = { t0: performance.now(), videos: [], telas: [], cabecalhos: [] });
  const now = () => +((performance.now() - R.t0) / 1000).toFixed(2);
  R.now = now;
  const VEL = 2;
  const q = (s, root = document) => root.querySelector(s);
  const qa = (s, root = document) => [...root.querySelectorAll(s)];
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity !== 0;
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  const srcOf = (v) => (v.currentSrc || v.getAttribute('src') || '').split('/').pop().split('#')[0].split('?')[0];
  const boxOf = (v) =>
    v.closest('[data-testid=brand-bumper]') ? 'vinheta' : v.closest('[data-testid=video-prefetch]') ? 'prefetch' : v.closest('[data-testid=reaction-scene]') ? 'reacao' : v.closest('[data-testid=stage-media]') ? 'cena' : 'outro';
  const ultimaTela = () => R.telas[R.telas.length - 1] || null;

  let seq = 0;
  const novo = (v) => {
    const r = { id: ++seq, src: srcOf(v), box: boxOf(v), node: v.closest('[data-node-id]')?.dataset.nodeId ?? null, tela: ultimaTela()?.i ?? null, criado: now(), dur: 0, max: 0, plays: 0, ended: 0, inicio: null, fim: null, atrasoInicioMs: null, recomecos: [], esperas: [], pausas: [], interrompido: null, removido: null, velocidade: [] };
    R.videos.push(r);
    v.__r = r;
    return r;
  };
  const fecha = (r, motivo) => {
    if (r.box === 'prefetch' || !r.plays || r.interrompido) return;
    if (!r.ended && r.dur && r.max < r.dur - 0.6) {
      const t = ultimaTela();
      r.interrompido = { t: now(), em: +r.max.toFixed(2), dur: +r.dur.toFixed(2), motivo, tela: t ? `${t.tipo}${t.node ? ':' + t.node : ''}` : null };
    }
  };
  const rec = (v) => {
    const s = srcOf(v);
    if (!v.__r) return novo(v);
    if (s && v.__r.src && s !== v.__r.src) {
      fecha(v.__r, 'outro arquivo no mesmo player');
      return novo(v);
    }
    if (!v.__r.src && s) v.__r.src = s;
    return v.__r;
  };
  const fechaEspera = (v, r) => {
    if (!r._w) return;
    if (v.currentTime > r._w.em + 0.03 || v.paused) {
      const ms = Math.round((now() - r._w.t) * 1000);
      if (ms > 1000) r.esperas.push({ t: r._w.t, ms, em: +r._w.em.toFixed(2), ev: r._w.ev });
      r._w = null;
    }
  };
  const H = {
    loadedmetadata: (v, r) => { if (isFinite(v.duration)) r.dur = v.duration; },
    durationchange: (v, r) => { if (isFinite(v.duration)) r.dur = v.duration; },
    play: (v, r) => {
      r.plays++;
      r._p = now();
      if (r.inicio == null) r.inicio = now();
      if ((r.max > 1 || r.ended) && v.currentTime < 0.5) r.recomecos.push({ t: now(), depoisDe: +r.max.toFixed(2), jaTerminou: r.ended > 0 });
    },
    playing: (v, r) => {
      if (r._p != null && r.atrasoInicioMs == null) r.atrasoInicioMs = Math.round((now() - r._p) * 1000);
      fechaEspera(v, r);
    },
    seeking: (v, r) => { if ((r.max > 1 || r.ended) && v.currentTime < 0.5 && !v.paused) r.recomecos.push({ t: now(), depoisDe: +r.max.toFixed(2), jaTerminou: r.ended > 0, porSeek: true }); },
    timeupdate: (v, r) => {
      if (v.currentTime > r.max) r.max = v.currentTime;
      if (isFinite(v.duration)) r.dur = v.duration;
      fechaEspera(v, r);
    },
    waiting: (v, r) => { if (!r._w && r.plays && !v.ended) r._w = { t: now(), em: v.currentTime, ev: 'waiting' }; },
    stalled: (v, r) => { if (!r._w && r.plays && !v.paused && !v.ended) r._w = { t: now(), em: v.currentTime, ev: 'stalled' }; },
    pause: (v, r) => { if (!v.ended && r.plays && v.currentTime > 0.2) r.pausas.push({ t: now(), em: +v.currentTime.toFixed(2) }); },
    ended: (v, r) => { r.ended++; r.fim = now(); r.max = Math.max(r.max, v.currentTime); },
    emptied: (v, r) => fecha(r, 'player esvaziado'),
    error: (v, r) => { r.erro = (v.error && v.error.code) || 'erro'; },
    ratechange: () => {},
  };
  for (const ev of Object.keys(H)) {
    document.addEventListener(
      ev,
      (e) => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) return;
        const r = rec(v);
        H[ev](v, r);
        if (r.box !== 'prefetch' && (ev === 'play' || ev === 'loadedmetadata' || ev === 'ratechange') && v.playbackRate !== VEL) v.playbackRate = VEL;
        if (ev === 'play' && r.velocidade.length < 3) r.velocidade.push(v.playbackRate);
      },
      true,
    );
  }
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        const vs = n.matches('video') ? [n] : qa('video', n);
        for (const v of vs)
          if (v.__r) {
            fecha(v.__r, 'saiu da tela');
            v.__r.removido = now();
          }
      }
  }).observe(document, { childList: true, subtree: true });

  // ---------- telas ----------
  R.tela = () => {
    if (q('[data-testid=outro-stage]')) return { tipo: 'vinheta' };
    const rs = q('[data-testid=reaction-scene]');
    if (rs) return { tipo: 'reacao', fase: rs.dataset.phase || null };
    if (q('[data-testid=player-load-error]')) return { tipo: 'erro-carregar', titulo: txt(q('[data-testid=player-load-error]')) };
    const s = q('[data-testid=player-node]');
    if (!s) return { tipo: 'carregando' };
    const base = { node: s.dataset.nodeId, ntipo: s.dataset.nodeType, fase: s.dataset.phase || null };
    let tipo;
    const cp = q('[data-testid=compose-panel]', s);
    const mp = q('[data-testid=mission-panel]', s);
    if (cp) tipo = cp.dataset.state === 'saved' ? 'atividade-salva' : 'atividade';
    else if (mp) tipo = mp.dataset.state === 'saved' ? 'missao-salva' : 'missao';
    else if (q('[data-testid=player-completed]', s)) tipo = 'fim';
    else if (q('[data-testid=choice-panel]', s)) tipo = 'pergunta';
    else if (q('[data-testid=opening-panel]', s)) tipo = 'abertura';
    else if (q('[data-testid=video-watching]', s)) tipo = 'video';
    else tipo = 'cena';
    const h2 = q('h2', s);
    return { tipo, ...base, titulo: txt(h2), vinhetaNoFim: !!q('[data-testid=stage-bumper]', s), sobra: !!q('[data-testid=choice-feedback]', s) };
  };
  // cabeçalhos visíveis da página: o do LMS (logo da plataforma) e o do player (marca do curso + subtítulo)
  R.cabecalho = () => {
    const hs = qa('header').filter((h) => vis(h) && (h.classList.contains('lms-chrome') || h.parentElement?.matches('[data-immersive-root]') || !h.closest('main, article, section, aside, [role=dialog], [data-immersive-root]')));
    if (!hs.length) return null;
    const ler = (h) => {
      const link = q('a', h);
      const logo = qa('img, svg[role=img]', h).filter(vis).map((i) => [i.closest('[data-testid=brand-logo]') ? 'brand-logo' : '', i.getAttribute('alt') || i.closest('[aria-label]')?.getAttribute('aria-label') || '', (i.getAttribute('src') || '').split('?')[0].split('/').slice(-2).join('/')].filter(Boolean).join(' '));
      const centro = qa(':scope > p, :scope > div > p', h).find(vis);
      return { qual: h.classList.contains('lms-chrome') ? 'lms' : h.closest('[data-immersive-root]') ? 'player' : 'outro', marca: link ? (txt(link) || link.getAttribute('aria-label') || '') : '', logo: [...new Set(logo)], subtitulo: txt(centro) };
    };
    const nav = q('[data-testid=stage-top-nav] h1');
    const foot = q('[data-immersive-root] > footer');
    return { cabecalhos: hs.map(ler), topoAula: txt(nav), rodape: txt(foot) };
  };
  let ultimaChave = '';
  let ultimoCab = '';
  setInterval(() => {
    let t;
    try {
      t = R.tela();
    } catch {
      return;
    }
    const chave = [t.tipo, t.node, t.fase, t.titulo].join('|');
    if (chave !== ultimaChave) {
      ultimaChave = chave;
      R.telas.push({ i: R.telas.length, t: now(), ...t });
      const c = R.cabecalho();
      const cs = JSON.stringify(c);
      if (c && cs !== ultimoCab) {
        ultimoCab = cs;
        R.cabecalhos.push({ t: now(), tela: R.telas.length - 1, tipo: t.tipo, node: t.node ?? null, ...c });
      }
    }
  }, 100);

  // ---------- leituras usadas pelo robô ----------
  R.estado = () => {
    const t = R.tela();
    const v = q('[data-testid=stage-media] video');
    const visiveis = qa('[data-testid]').filter((el) => (el.tagName === 'BUTTON' || el.tagName === 'A') && vis(el)).map((el) => el.dataset.testid + (el.disabled ? '(off)' : ''));
    return { t: now(), tela: t, palco: v ? { src: srcOf(v), ct: v.currentTime, dur: v.duration, paused: v.paused, ended: v.ended } : null, botoes: visiveis };
  };
  R.pergunta = () => {
    const p = q('[data-testid=choice-panel]');
    if (!p) return null;
    const h2 = q('h2', p);
    const bruto = txt(h2);
    const m = bruto.match(/^((?:pergunta \d+ de \d+\s*·\s*)?agora é com você)\s*\.?\s*(.*)$/i);
    const eyebrow = m ? m[1] : '';
    const titulo = m ? m[2] : bruto;
    const labels = qa('label', p).filter((l) => q('[data-testid^=option-]', l));
    return {
      titulo,
      eyebrow,
      situacao: txt(q('[data-testid=choice-situation]', p)).replace(/^A situação\s*/i, ''),
      chamada: txt(q('[data-testid=choice-call]', p)),
      opcoes: labels.map((l) => ({ id: q('[data-testid^=option-]', l).dataset.testid.replace('option-', ''), texto: txt(l).replace(/^[A-D]\s+/, '') })),
      escrever: !!q('[data-testid=open-answer-text-start]', p),
      voz: !!q('[data-testid=open-answer-voice]', p),
    };
  };
  R.atividade = () => {
    const p = q('[data-testid=compose-panel]');
    if (!p) return null;
    const grupos = qa('fieldset[data-testid^=scaffold-group-]', p).map((f) => ({
      id: f.dataset.testid.replace('scaffold-group-', ''),
      titulo: txt(q('legend', f)).replace(/^\d+\s*/, ''),
      opcoes: qa('input[type=radio]', f).map((i) => i.value).filter((x) => x !== '__escrever__'),
      escrever: !!q('[data-testid^=scaffold-custom-]', f),
    }));
    const rp = p.getBoundingClientRect();
    const sub = q('[data-testid=player-submit]', p) || q('[data-testid=compose-continue]', p);
    const rb = sub ? sub.getBoundingClientRect() : null;
    const se = document.scrollingElement;
    const frase = q('[data-testid=scaffold-sentence]', p);
    return {
      estado: p.dataset.state,
      titulo: txt(q('h2', p)),
      intro: txt(q('[data-testid=compose-intro]', p)),
      grupos,
      frase: frase ? txt(frase) : '',
      lacunas: frase ? qa('[data-missing]', frase).length : null,
      progresso: txt(q('[data-testid=scaffold-progress]', p)),
      botao: sub ? { texto: txt(sub), ativo: !sub.disabled && sub.getAttribute('aria-disabled') !== 'true', visivel: rb.top >= 0 && rb.bottom <= innerHeight, topo: Math.round(rb.top), base: Math.round(rb.bottom) } : null,
      fazerDepois: !!q('[data-testid=player-skip]', p),
      painel: { topo: Math.round(rp.top + scrollY), base: Math.round(rp.bottom + scrollY), alturaTela: innerHeight, larguraTela: innerWidth, inteiroNaTela: rp.top >= -1 && rp.bottom <= innerHeight + 1 },
      rolagemPagina: Math.max(0, se.scrollHeight - innerHeight),
      scrollY: Math.round(scrollY),
    };
  };
  // missão "Leve para a vida real": o que a tela mostra e se cabe no celular (botões, campo, texto da ação e da alternativa)
  R.missao = () => {
    const p = q('[data-testid=mission-panel]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const bt = (id) => {
      const b = q(`[data-testid=${id}]`, p) || q(`[data-testid=${id}]`);
      if (!b) return null;
      const rb = b.getBoundingClientRect();
      return { texto: txt(b), ativo: !b.disabled, visivel: rb.top >= 0 && rb.bottom <= innerHeight, largura: Math.round(rb.width), altura: Math.round(rb.height) };
    };
    const se = document.scrollingElement;
    return {
      estado: p.dataset.state,
      titulo: txt(q('h2', p)),
      acao: txt(q('[data-testid=mission-action]', p)),
      alternativa: txt(q('[data-testid=mission-alternative]', p)),
      frase: txt(q('[data-testid=mission-draft] blockquote', p)),
      campo: !!q('[data-testid=mission-note]', p),
      jaExperimentei: bt('mission-done'),
      depois: bt('mission-later'),
      salvar: bt('player-submit'),
      confirmacao: txt(q('[data-testid=mission-saved]')),
      painel: { topo: Math.round(r.top + scrollY), base: Math.round(r.bottom + scrollY), alturaTela: innerHeight, larguraTela: innerWidth },
      rolagemHorizontal: Math.max(0, se.scrollWidth - innerWidth),
    };
  };
  R.fim = () => {
    const p = q('[data-testid=player-completed]');
    if (!p) return null;
    return {
      titulo: txt(q('h2', p)),
      concluida: /Aula concluída/.test(txt(p)),
      fazerDeNovo: !!q('[data-testid=player-restart]', p),
      proxima: !!q('[data-testid=next-lesson-link]', p),
      voltar: qa('a', p).some((a) => /Voltar ao curso/.test(txt(a))),
      conquistas: txt(q('[data-testid=lesson-achievements]', p)),
    };
  };
})();

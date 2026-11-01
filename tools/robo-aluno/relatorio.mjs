// Gera relatorio.html (autocontido; as capturas ficam em img/) e resumo.md a partir do resultado.json.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NOME = {
  'nao-concluiu': 'Não chegou ao fim', 'fluxo-travado': 'Fluxo travou', 'video-interrompido': 'Vídeo interrompido', 'video-incompleto': 'Vídeo incompleto', 'video-recomecou': 'Vídeo recomeçou', 'video-carregando': 'Vídeo travou carregando', 'video-demorou': 'Vídeo demorou a começar', 'video-pausou': 'Vídeo pausou sozinho', 'video-erro': 'Erro de mídia', 'video-nao-tocou': 'Vídeo não tocou', 'video-repetiu': 'Vídeo repetiu', 'video-nao-seguiu': 'Vídeo não seguiu sozinho', 'reacao-nao-tocou': 'Reação não tocou', 'nao-seguiu-para-pergunta': 'Não seguiu para a pergunta',
  'vinheta-nao-tocou': 'Vinheta não tocou', 'vinheta-repetiu': 'Vinheta repetiu', 'vinheta-fora-do-lugar': 'Vinheta fora do lugar', 'vinheta-nao-seguiu': 'Fluxo parou depois da vinheta',
  'missao-sem-confirmacao': 'Missão sem confirmação', 'missao-rolagem-horizontal': 'Missão mais larga que a tela', 'missao-sem-anuncio': 'Missão não anunciada', 'missao-sem-atividade': 'Missão sem atividade', 'missao-titulo-diferente': 'Missão ≠ atividade', 'missao-no-meio': 'Atividade no meio', 'missao-dupla': 'Duas atividades', 'missao-nao-retomada': 'Vídeo final não chama a missão',
  'atividade-grupo-sem-titulo': 'Grupo sem título', 'atividade-obrigatoria-com-fazer-depois': 'Obrigatória com "Fazer depois"', 'atividade-frase-quebrada': 'Frase montada com defeito', 'atividade-sem-frase': 'Prévia vazia', 'atividade-botao-inativo': 'Botão de salvar inativo', 'atividade-nao-cabe-desktop': 'Atividade não cabe (1440×900)', 'atividade-celular-botao-escondido': 'Celular: salvar fora da vista', 'atividade-celular-longa': 'Celular: atividade longa', 'atividade-nao-salvou': 'Não salvou', 'atividade-lenta': 'Salvar lento', 'atividade-nao-levou-ao-fim': '"Continuar aula" não leva ao fim', 'atividade-sem-fazer-depois': 'Atividade sem "Fazer depois"', 'missao-cumprida-sem-fazer': '"Prática feita" sem fazer',
  'pergunta-sem-situacao': 'Pergunta sem situação', 'pergunta-sem-pergunta': 'Título da pergunta não é pergunta', 'pergunta-titulo-fora-do-padrao': 'Título fora do padrão "No lugar de X"', 'pergunta-personagem-trocado': 'Personagem trocado no título', 'opcao-fora-da-1a-pessoa': 'Opção fora da 1ª pessoa',
  'fim-sem-fazer-de-novo': 'Fim sem "Fazer de novo"', 'fim-sem-saida': 'Fim sem saída', 'fim-sem-proxima': 'Fim sem "Próxima aula"',
  'cabecalho-muda-na-aula': 'Cabeçalho muda na aula', 'cabecalho-fora-do-padrao': 'Cabeçalho fora do padrão', 'cabecalho-marca-diferente': 'Marca diferente LMS × aula', 'cabecalho-wordmark-ignorado': 'Marca do curso ignorada',
  'travamento-entre-falas': 'Travamento entre falas', 'reiniciar-abriu-fim': '"Reiniciar" abriu o fim', 'erro-pagina': 'Erro de página', 'erro-console': 'Erro no console', 'erro-http': 'Erro HTTP', 'erro-rede': 'Falha de rede', 'robo-celular': 'Robô: prova no celular',
};
export const nomeTipo = (t) => NOME[t] || t;

export function gerar(R) {
  const T = R.totais;
  const cam = (p) => (p.caminhos?.length ? (p.caminhos.length === 3 ? '1·2·3' : p.caminhos.sort().join('·')) : '—');
  const tempo = (p) => (p.tempo != null ? `${Number(p.tempo).toFixed(1)} s` : '');
  const md = [];
  md.push(`# Robô aluno — rodada \`${R.rodada}\``, '');
  md.push(`Gerado em ${R.geradoEm.slice(0, 16).replace('T', ' ')} UTC. Cobertura: **${R.cobertura.cursos}/${R.cobertura.cursosPublicados} cursos, ${R.cobertura.aulas}/${R.cobertura.aulasPublicadas} aulas, ${R.cobertura.caminhos} caminhos** (${R.cobertura.concluidas} chegaram ao fim). Vídeos a 2×, nada pulado.`, '');
  if (R.cobertura.naoCobertos?.length) md.push(`Não cobertos: ${R.cobertura.naoCobertos.map((x) => `${x.curso} ${x.titulo} (${x.motivo})`).join('; ')}.`, '');
  md.push(`**Problemas: ${T.bloqueante} bloqueantes · ${T.importante} importantes · ${T.menor} menores.**`, '');
  md.push('## Por curso', '', '| | Curso | Aulas | Caminhos ok | Bloq. | Imp. | Menor |', '|---|---|---|---|---|---|---|');
  for (const c of R.porCurso) md.push(`| ${c.status} | ${c.curso} ${c.titulo} | ${c.aulas} | ${c.concluidas}/${c.execucoes} | ${c.bloqueante} | ${c.importante} | ${c.menor} |`);
  md.push('', '## Por tipo', '', '| Tipo | Bloq. | Imp. | Menor |', '|---|---|---|---|');
  for (const t of R.porTipo) md.push(`| ${nomeTipo(t.tipo)} | ${t.bloqueante} | ${t.importante} | ${t.menor} |`);
  if (R.comparacao) {
    const C = R.comparacao;
    md.push('', `## Antes × depois (comparado com \`${C.rodadaAntes}\`)`, '', ...(C.cursosEmComum ? [`Só os ${C.cursosEmComum.length} cursos cobertos nas duas rodadas: ${C.cursosEmComum.join(', ')}.`, ''] : []), `- Resolvidos: **${C.resolvidos.length}**`, `- Novos: **${C.novos.length}**`, `- Continuam: ${C.continuam}`, `- Travamentos ≥ 200 ms: ${C.travamentosAntes} → ${C.travamentosAgora}; tolerados (120–199 ms): ${C.toleradosAntes} → ${C.toleradosAgora}`);
    md.push('', '| Tipo | Antes (bloq./imp./menor) | Depois |', '|---|---|---|', ...C.porTipo.map((t) => `| ${nomeTipo(t.tipo)} | ${t.antes.bloqueante}/${t.antes.importante}/${t.antes.menor} | ${t.depois.bloqueante}/${t.depois.importante}/${t.depois.menor} |`));
    if (C.pioraram?.length) md.push('', 'Aulas com MAIS travamentos ≥ 200 ms do que antes:', ...C.pioraram.map((p) => `- ${p.aula}: ${p.antes} → ${p.depois}`));
    if (C.novos.length) md.push('', 'Novos:', ...C.novos.slice(0, 30).map((p) => `- [${p.gravidade}] ${p.curso}·A${p.aula ?? '—'} ${nomeTipo(p.tipo)}: ${p.texto}`));
  }
  md.push('', '## Bloqueantes e importantes', '');
  for (const p of R.problemas.filter((x) => x.gravidade !== 'menor').slice(0, 200)) md.push(`- **${p.id}** [${p.gravidade}] ${p.curso}${p.aula ? '·A' + p.aula : ''} · caminho ${cam(p)} · ${p.etapa ?? ''}${p.tempo != null ? ' · ' + tempo(p) : ''} — ${nomeTipo(p.tipo)}: ${p.texto}${p.evidencia ? ` ([evidência](${p.evidencia}))` : ''}`);
  if (R.casoQueRoupa)
    md.splice(
      md.indexOf('## Por curso'),
      0,
      '## Caso "Que roupa eu uso?" (C02·A1)',
      '',
      'O v01 TOCOU inteiro (39,6 s, das 28,9 s às 48,8 s do tempo da página), sozinho, depois da reação; a vinheta veio logo em seguida. Não foi clique errado nem defeito do player: o gravador do protótipo indexava os vídeos pelo nome do arquivo, a pré-carga do player usa o mesmo arquivo fora do palco e criava o registro marcado "fora do palco", e o filtro final descartava o v01. O robô novo registra por elemento.',
      `Evidência: [${R.casoQueRoupa}](${R.casoQueRoupa.startsWith('/') ? R.casoQueRoupa : '../../' + R.casoQueRoupa}).`,
      '',
    );

  const html = (img) => {
    const fix = (s) => (s ? s.replace(/^img\//, img) : s);
    const linhaProb = (p) => `<tr data-g="${p.gravidade}" data-c="${esc(p.curso)}" data-t="${esc(p.tipo)}"><td class="id">${p.id}</td><td><span class="g g-${p.gravidade}">${p.gravidade}</span></td><td>${esc(p.curso)}${p.aula ? '·A' + p.aula : ''}</td><td>${cam(p)}</td><td class="mono">${esc(p.etapa ?? '')}</td><td class="mono">${tempo(p)}</td><td><b>${esc(nomeTipo(p.tipo))}</b><br>${esc(p.texto)}${p.detalhe ? `<div class="det">${esc(p.detalhe)}</div>` : ''}</td><td>${p.evidencia ? `<a href="${esc(fix(p.evidencia))}" target="_blank"><img loading="lazy" src="${esc(fix(p.evidencia))}" alt="evidência ${p.id}"></a>` : ''}</td></tr>`;
    const cursos = R.porCurso.map((c) => `<tr><td class="st st-${c.status === '✓' ? 'ok' : c.status === '⚠' ? 'warn' : c.status === '✗' ? 'bad' : 'na'}">${c.status}</td><td><b>${c.curso}</b> ${esc(c.titulo)}</td><td>${c.aulas}</td><td>${c.concluidas}/${c.execucoes}</td><td>${c.bloqueante}</td><td>${c.importante}</td><td>${c.menor}</td></tr>`).join('');
    const cabs = (R.cabecalhos?.porCurso || []).map((x) => `<tr><td><b>${x.curso}</b> ${esc(x.titulo)}</td><td>${esc(x.marca)} <span class="tag">${esc(x.marcaClasse)}</span></td><td>${esc(x.subtitulo)} <span class="tag">${esc(x.subtituloClasse)}</span></td><td class="small">${esc(x.wordmarkRoteiro ?? '—')} / ${esc(x.subtituloRoteiro ?? '—')}</td><td class="small">${esc(x.paginaDoCurso)}</td></tr>`).join('');
    const vins = (R.vinhetas || []).map((v) => `<tr><td>${v.curso}·A${v.aula}</td><td>${v.caminho}</td><td>${v.vezes}</td><td>${v.inicio != null ? v.inicio.toFixed(1) + ' s' : '—'}</td><td>${esc(v.lugar ?? '—')}</td><td>${v.seguiuSozinho == null ? '—' : v.seguiuSozinho ? 'sim' : '<b>não</b>'}</td><td class="small">${esc(v.depois ?? '')}</td></tr>`).join('');
    const ativs = (R.atividades || []).map((a) => `<tr><td>${a.curso}·A${a.aula}</td><td>${a.caminho}</td><td>${esc(a.titulo)}<div class="small">${a.grupos.map(esc).join(' · ')}</div></td><td class="small">${esc(a.frase)}</td><td>${a.desktop.cabe ? 'cabe' : `<b>rola ${a.desktop.rolagem}px</b>`}</td><td>${a.celular.rolagem != null ? `${a.celular.rolagem}px${a.celular.botaoVisivel ? '' : ' · <b>botão escondido</b>'}` : esc(a.celular.erro ?? '—')}</td><td>${a.salvoMs != null ? (a.salvoMs / 1000).toFixed(1) + ' s' : '<b>não salvou</b>'}</td><td>${esc(a.depoisContinuar ?? '—')}</td><td>${a.celular.foto ? `<a href="${esc(img + a.celular.foto)}" target="_blank">celular</a>` : ''} ${a.fotos?.pronta ? `<a href="${esc(img + a.fotos.pronta)}" target="_blank">desktop</a>` : ''}</td></tr>`).join('');
    const miss = (R.missoes || []).map((m) => `<tr><td>${m.curso}·A${m.aula}</td><td>${esc(m.aulaTitulo)}</td><td>${m.anuncio ? esc(m.anuncio) : '<b>sem anúncio</b>'}</td><td>${m.atividade ? esc(m.atividade) : '<b>sem atividade</b>'}</td><td>${m.compativel ? (m.compativel.ok ? 'bate' : `<b>não bate</b> (${m.compativel.nota})`) : '—'}</td><td>${m.noFim == null ? '—' : m.noFim ? 'no fim' : '<b>no meio</b>'}</td><td>${m.finalChama ? 'sim' : 'não'}</td></tr>`).join('');
    const trv = R.travamentos || [];
    const trvImp = trv.filter((t) => t.gravidade === 'importante').length;
    const trvMen = trv.filter((t) => t.tolerado).length;
    const filtros = [...new Set(R.problemas.map((p) => p.tipo))].map((t) => `<option value="${esc(t)}">${esc(nomeTipo(t))}</option>`).join('');
    const cursosOpt = [...new Set(R.problemas.map((p) => p.curso))].sort().map((c) => `<option>${esc(c)}</option>`).join('');
    const comp = R.comparacao
      ? `<section><h2>Antes × depois</h2><p>Comparado com a rodada <code>${esc(R.comparacao.rodadaAntes)}</code>${R.comparacao.cursosEmComum ? `, só nos ${R.comparacao.cursosEmComum.length} cursos cobertos nas duas (${esc(R.comparacao.cursosEmComum.join(', '))})` : ''}: <b>${R.comparacao.resolvidos.length}</b> resolvidos, <b>${R.comparacao.novos.length}</b> novos, ${R.comparacao.continuam} continuam. Travamentos ≥ 200 ms: ${R.comparacao.travamentosAntes} → ${R.comparacao.travamentosAgora}; tolerados (120–199 ms): ${R.comparacao.toleradosAntes} → ${R.comparacao.toleradosAgora}.</p>${R.comparacao.novos.length ? `<details><summary>Novos (${R.comparacao.novos.length})</summary><ul>${R.comparacao.novos.map((p) => `<li>[${p.gravidade}] ${esc(p.curso)}·A${p.aula ?? '—'} ${esc(nomeTipo(p.tipo))}: ${esc(p.texto)}</li>`).join('')}</ul></details>` : ''}${R.comparacao.resolvidos.length ? `<details><summary>Resolvidos (${R.comparacao.resolvidos.length})</summary><ul>${R.comparacao.resolvidos.map((p) => `<li>[${p.gravidade}] ${esc(p.curso)}·A${p.aula ?? '—'} ${esc(nomeTipo(p.tipo))}: ${esc(p.texto)}</li>`).join('')}</ul></details>` : ''}</section>`
      : '';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Robô aluno · ${esc(R.rodada)}</title><style>
:root{--bg:#f6f6f8;--fg:#15161c;--muted:#5d6070;--line:#dfe0e6;--card:#fff;--bad:#c62828;--warn:#b26a00;--ok:#2e7d32;--minor:#55607a;--accent:#ff6b00}
@media (prefers-color-scheme:dark){:root{--bg:#101118;--fg:#ecedf3;--muted:#a2a6b8;--line:#2b2d3a;--card:#181a24;--bad:#ff6b6b;--warn:#ffb74d;--ok:#81c784;--minor:#9aa4c2}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 10px}
.sub{color:var(--muted)}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:150px}.card b{display:block;font-size:26px}
.card.bad b{color:var(--bad)}.card.warn b{color:var(--warn)}.card.minor b{color:var(--minor)}
.tw{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);position:sticky;top:0;background:var(--card)}
.g{font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap}.g-bloqueante{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}.g-importante{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}.g-menor{background:color-mix(in srgb,var(--minor) 18%,transparent);color:var(--minor)}
.st{font-size:20px;text-align:center}.st-ok{color:var(--ok)}.st-warn{color:var(--warn)}.st-bad{color:var(--bad)}.mono,.id{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:nowrap}.small{font-size:12.5px;color:var(--muted)}.det{font-size:12.5px;color:var(--muted);margin-top:4px}
td img{width:220px;max-width:40vw;border-radius:6px;border:1px solid var(--line)}.tag{font-size:11px;border:1px solid var(--line);border-radius:99px;padding:1px 6px;color:var(--muted)}
.fil{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}select,input{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
details{margin:6px 0}code{font-size:13px}
</style></head><body><main>
<h1>Robô aluno · rodada <code>${esc(R.rodada)}</code></h1>
<p class="sub">Gerado em ${esc(R.geradoEm.slice(0, 16).replace('T', ' '))} UTC · ${R.cobertura.cursos}/${R.cobertura.cursosPublicados} cursos · ${R.cobertura.aulas}/${R.cobertura.aulasPublicadas} aulas · ${R.cobertura.caminhos} caminhos (${R.cobertura.concluidas} até o fim) · vídeos a 2×, nada pulado${R.cobertura.naoCobertos?.length ? ` · <b>não cobertos:</b> ${R.cobertura.naoCobertos.map((x) => esc(`${x.curso} ${x.titulo}`)).join(', ')}` : ''}</p>
<div class="cards"><div class="card bad"><b>${T.bloqueante}</b>bloqueantes</div><div class="card warn"><b>${T.importante}</b>importantes</div><div class="card minor"><b>${T.menor}</b>menores</div><div class="card"><b>${trvImp}</b>travamentos ≥ 200 ms<br><span class="small">+ ${trvMen} tolerados (120–199 ms)</span></div></div>
${comp}
<section><h2>Por curso</h2><div class="tw"><table><thead><tr><th></th><th>Curso</th><th>Aulas</th><th>Caminhos ok</th><th>Bloq.</th><th>Imp.</th><th>Menor</th></tr></thead><tbody>${cursos}</tbody></table></div></section>
<section><h2>Problemas</h2><p class="sub">Tiras de travamento: 4 quadros do arquivo do vídeo, em ordem: logo antes, início da imagem parada, meio dela e logo depois. O tempo é contado a partir do começo do arquivo. Nos dois quadros do meio a imagem não muda.</p><div class="fil"><select id="fg"><option value="">todas as gravidades</option><option>bloqueante</option><option>importante</option><option>menor</option></select><select id="fc"><option value="">todos os cursos</option>${cursosOpt}</select><select id="ft"><option value="">todos os tipos</option>${filtros}</select><span class="sub" id="cont"></span></div>
<div class="tw"><table id="tp"><thead><tr><th>#</th><th>Gravidade</th><th>Onde</th><th>Caminho</th><th>Etapa</th><th>Tempo</th><th>Problema</th><th>Evidência</th></tr></thead><tbody>${R.problemas.map(linhaProb).join('')}</tbody></table></div></section>
<section><h2>Cabeçalho (marca e subtítulo)</h2><p class="sub">Catálogo: ${esc(R.cabecalhos?.catalogo ?? '—')}</p><div class="tw"><table><thead><tr><th>Curso</th><th>Canto esquerdo (aula)</th><th>Centro (aula)</th><th>Roteiro: wordmark / subtítulo</th><th>Página do curso</th></tr></thead><tbody>${cabs}</tbody></table></div></section>
<section><h2>Missão</h2><div class="tw"><table><thead><tr><th>Aula</th><th>Título</th><th>Abertura anuncia</th><th>Atividade</th><th>Título bate?</th><th>Posição</th><th>Vídeo final chama?</th></tr></thead><tbody>${miss}</tbody></table></div></section>
<section><h2>Atividade "Na prática"</h2><div class="tw"><table><thead><tr><th>Aula</th><th>Cam.</th><th>Título e grupos</th><th>Frase montada</th><th>1440×900</th><th>390×844 (rolagem)</th><th>Salvar</th><th>"Continuar aula" →</th><th>Capturas</th></tr></thead><tbody>${ativs}</tbody></table></div></section>
<section><h2>Vinheta</h2><div class="tw"><table><thead><tr><th>Aula</th><th>Cam.</th><th>Vezes</th><th>Quando</th><th>Lugar</th><th>Seguiu sozinho</th><th>Depois</th></tr></thead><tbody>${vins}</tbody></table></div></section>
<script>
const f=()=>{const g=fg.value,c=fc.value,t=ft.value;let n=0;for(const r of tp.tBodies[0].rows){const ok=(!g||r.dataset.g===g)&&(!c||r.dataset.c===c)&&(!t||r.dataset.t===t);r.style.display=ok?'':'none';if(ok)n++}cont.textContent=n+' problemas'};[fg,fc,ft].forEach(e=>e.onchange=f);f();
</script></main></body></html>`;
  };
  return { html, md: md.join('\n') + '\n' };
}

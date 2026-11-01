// docs/qa/raio-x/resumo.md: contagens por curso e por tipo de alerta + os 30 alertas mais graves.
import { writeFileSync } from 'node:fs';

const PESO = { alta: 300, media: 200, baixa: 100, info: 0 };
const NOME_TIPO = {
  titulo_sem_interrogacao: 'Título de pergunta sem “?”',
  fora_padrao_no_lugar: 'Título fora do padrão “No lugar de X”',
  fala_repetida: 'Frase repetida em vários nós',
  fala_longa: 'Fala com mais de 25 palavras',
  asr_similaridade_baixa: 'Áudio × roteiro abaixo de 0,90',
  palavras_ausentes_no_audio: 'Palavras do roteiro ausentes no áudio',
  palavras_sobrando_no_audio: 'Palavras ouvidas que não estão no roteiro',
  sem_midia: 'Nó sem vídeo',
  stale: 'Vídeo desatualizado (stale)',
  arquivo_ausente: 'Arquivo de vídeo ausente',
  opcao_muito_longa: 'Opção muito mais longa que as outras',
  missao_sem_anuncio: 'Missão sem anúncio',
  missao_sem_instrucao: 'Missão sem instrução',
  pergunta_sem_opcao_forte: 'Pergunta sem exatamente uma opção forte',
  chamada_nao_dita: 'Chamada que o vídeo não diz',
  video_congelado: 'Imagem parada no vídeo',
  opcao_sem_destino: 'Opção sem destino',
  no_inalcancavel: 'Nó inalcançável',
};

const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');

export function escreverResumo(arquivo, raio, todos) {
  const L = [];
  const a = raio.asr;
  L.push('# Raio-X dos cursos: resumo');
  L.push('');
  L.push(`Gerado em ${raio.geradoEm.slice(0, 16).replace('T', ' ')} por \`tools/raio-x/gerar.mjs\`. Detalhe completo em \`raio-x.json\`.`);
  L.push('');
  L.push('## Cobertura do áudio (ASR)');
  L.push('');
  L.push(`- Vídeos com arquivo no disco: **${a.videosComArquivo}**; com transcrição real: **${a.comAsr}** (${a.asrCompleto} com texto e tempos do whisper, ${a.asrHerdadoSemTempos} herdados do QA anterior, sem acento nem tempos); pendentes: **${a.pendentes}**.`);
  L.push(`- Nós que deveriam ter vídeo e ainda não têm (aguardando gravação ou lacuna): **${a.nosAguardandoGravacao.rascunho}** no rascunho, **${a.nosAguardandoGravacao.publicada}** na versão publicada. Vídeos referenciados sem arquivo: ${a.videosSemArquivo}.`);
  L.push('- Para completar depois da gravação, rode o gerador de novo: ele transcreve só o que falta.');
  L.push('');

  if (raio.frasesRepetidasEmVariosCursos?.length) {
    L.push('## Frases que se repetem em vários cursos (fala robótica)');
    L.push('');
    L.push('Frases de 4 palavras ou mais ditas em 3 cursos ou mais (rascunho). As primeiras 15; a lista completa está em `frasesRepetidasEmVariosCursos` no JSON.');
    L.push('');
    L.push('| Frase | Vezes | Cursos |');
    L.push('|---|---|---|');
    for (const f of raio.frasesRepetidasEmVariosCursos.slice(0, 15)) L.push(`| ${esc(f.frase)} | ${f.ocorrencias} | ${f.nCursos} (${f.cursos.slice(0, 6).join(', ')}${f.cursos.length > 6 ? '…' : ''}) |`);
    L.push('');
  }

  // -------- por curso
  const por = new Map();
  for (const t of todos) {
    if (!t.curso.startsWith('C')) continue;
    const k = `${t.curso}|${t.versao}`;
    if (!por.has(k)) por.set(k, { alta: 0, media: 0, baixa: 0, info: 0 });
    por.get(k)[t.gravidade]++;
  }
  L.push('## Por curso (rascunho | versão publicada)');
  L.push('');
  L.push('Alertas por gravidade: A = alta, M = média, B = baixa (informativos, como vídeo ainda não gravado, ficam fora). “sem vídeo” = nós que deveriam ter vídeo e não têm.');
  L.push('');
  L.push('| Curso | Título | Instrutor | Trilha | Situação | Aulas | Vídeo real | ASR | Sem vídeo | Rascunho A/M/B | Publicada A/M/B |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of raio.cursos) {
    const r = por.get(`${c.codigo}|rascunho`) ?? { alta: 0, media: 0, baixa: 0 };
    const p = c.publicada ? por.get(`${c.codigo}|publicada`) ?? { alta: 0, media: 0, baixa: 0 } : null;
    const vr = c.videoReal.rascunho.texto ?? '–';
    const asr = `${c.rascunho.asr.comAsr}/${c.rascunho.videos}`;
    L.push(`| ${c.codigo} | ${esc(c.tituloCurto)} | ${esc(c.instrutor.nome ?? '–')} | ${esc(c.trilha ?? '–')} | ${c.status.situacao}${c.status.versaoPublicada ? ` v${c.status.versaoPublicada}` : ''}${c.status.rascunhoMudouDepoisDePublicar ? ' (rascunho mais novo)' : ''} | ${c.nAulas} | ${vr} | ${asr} | ${c.rascunho.videosSemMidia} | ${r.alta}/${r.media}/${r.baixa} | ${p ? `${p.alta}/${p.media}/${p.baixa}` : '–'} |`);
  }
  L.push('');

  // -------- por tipo
  const tipos = [...new Set(todos.map((t) => t.tipo))];
  const cont = (v, tipo, filtro) => todos.filter((t) => t.tipo === tipo && t.versao === v && (!filtro || filtro(t))).length;
  L.push('## Por tipo de alerta');
  L.push('');
  L.push('| Tipo | Rascunho | Versão publicada | Checagem das trilhas |');
  L.push('|---|---|---|---|');
  for (const tipo of tipos.sort((x, y) => cont('rascunho', y) + cont('publicada', y) - cont('rascunho', x) - cont('publicada', x))) {
    L.push(`| ${NOME_TIPO[tipo] ?? tipo} (\`${tipo}\`) | ${cont('rascunho', tipo)} | ${cont('publicada', tipo)} | ${cont('checagem final', tipo)} |`);
  }
  const aguard = todos.filter((t) => t.tipo === 'sem_midia' && t.aguardandoGravacao).length;
  L.push('');
  L.push(`Dos alertas “Nó sem vídeo”, ${aguard} são informativos (a aula inteira ainda aguarda gravação).`);
  L.push('');

  // -------- por tipo x curso (rascunho)
  const cursos = raio.cursos.map((c) => c.codigo);
  L.push('## Tipo × curso (rascunho, sem informativos)');
  L.push('');
  L.push(`| Tipo | ${cursos.join(' | ')} |`);
  L.push(`|---|${cursos.map(() => '---').join('|')}|`);
  for (const tipo of tipos) {
    const linha = cursos.map((c) => todos.filter((t) => t.curso === c && t.versao === 'rascunho' && t.tipo === tipo && t.gravidade !== 'info').length || '');
    if (linha.some(Boolean)) L.push(`| ${NOME_TIPO[tipo] ?? tipo} | ${linha.join(' | ')} |`);
  }
  L.push('');

  // -------- top 30
  const chave = (t) => `${t.codigo}|${t.tipo}|${t.assetId ?? ''}|${(t.frase ?? t.mensagem).slice(0, 60)}`;
  const grupos = new Map();
  for (const t of todos) {
    if (t.gravidade === 'info') continue;
    const k = chave(t);
    if (!grupos.has(k)) grupos.set(k, { ...t, versoes: [t.versao] });
    else grupos.get(k).versoes.push(t.versao);
  }
  const ordenados = [...grupos.values()].sort((x, y) => PESO[y.gravidade] + Math.min(99, y.peso ?? 0) - (PESO[x.gravidade] + Math.min(99, x.peso ?? 0)) || x.codigo.localeCompare(y.codigo));
  // causa comum: frase nova que anuncia a missão ainda não gravada
  const staleTodos = [...grupos.values()].filter((t) => t.tipo === 'stale');
  const soMissao = staleTodos.filter((t) => /miss[ãa]o/i.test(t.mensagem.split('Roteiro novo que não está no vídeo:')[1]?.split('Está no vídeo')[0] ?? '')).length;
  L.push('## Os 30 alertas mais graves');
  L.push('');
  L.push(`Causa comum: dos ${staleTodos.length} vídeos desatualizados, ${soMissao} ganharam no roteiro a frase que anuncia a missão e não foram regravados; o aluno chega à missão sem ouvir o anúncio (alerta \`missao_sem_anuncio\`).`);
  L.push('');
  L.push('Ordem: gravidade e, dentro dela, o tamanho do problema (diferença do áudio, palavras faltando, repetições). No máximo 8 por tipo, para a lista não ficar só com uma causa; a lista completa está em `raio-x.json`. Alertas iguais no rascunho e na publicada aparecem uma vez.');
  L.push('');
  L.push('| # | Onde | Gravidade | Problema | Versão |');
  L.push('|---|---|---|---|---|');
  const contaTipo = {};
  const top = ordenados.filter((t) => (contaTipo[t.tipo] = (contaTipo[t.tipo] ?? 0) + 1) <= 8).slice(0, 30);
  top.forEach((t, i) => {
    L.push(`| ${i + 1} | ${t.curso.startsWith('C') ? '' : `${esc(t.curso)} · `}\`${esc(t.codigo)}\` | ${t.gravidade} | ${esc(t.mensagem)} | ${[...new Set(t.versoes)].join(' e ')} |`);
  });
  L.push('');
  writeFileSync(arquivo, L.join('\n'));
}

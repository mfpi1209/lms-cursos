// Anúncio falado da prática (regra `missao-sem-anuncio` do robô e `missao_sem_anuncio` do raio-x).
//
// Antes: o anúncio era a fala que dizia "missão" (ou "na prática"/"atividade"). As aberturas novas (expansão final, 01/11)
// anunciam a prática SEM essa palavra ("Daqui a pouco, você escreve a pergunta que confirma roupa e calçado…"). Então o anúncio passa a ser,
// por ordem: (1) o plano de abertura com id `missao` da cena (o mesmo id que o plano antigo tinha: só a fala mudou); (2) o plano que a
// proposta da expansão marca como anúncio (o plano cuja fala ANTIGA dizia "missão" e foi trocada: em alguns cursos tem outro id, ex. `s4`);
// (3) a palavra-chave, como sempre. O plano só vale quando está falado: não está em `media.adjust.drop` e, havendo transcrição ou
// áudio ouvido, as palavras dele aparecem lá.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const RE_ANUNCIO_PALAVRA = /\bmiss[ãa]o\b|\bna pr[áa]tica\b|\batividade\b/i;
export const ID_PLANO_ANUNCIO = 'missao';
/** nas aulas NOVAS da expansão (C01 piloto) o plano que promete a prática tem o id `promessa` */
export const IDS_ANUNCIO_ALTERNATIVOS = ['promessa'];

const normaliza = (t) => (t || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const palavras = (t) => normaliza(t).split(' ').filter(Boolean);

/** a fala do plano está no texto (ouvido ou transcrição)? Tolera cortes do ajuste fino: ≥ 60% das palavras do plano aparecem. */
export function planoEstaNoTexto(linha, texto) {
  const alvo = palavras(linha);
  if (!alvo.length) return false;
  const saco = new Set(palavras(texto));
  return alvo.filter((w) => saco.has(w)).length / alvo.length >= 0.6;
}

/**
 * Plano que anuncia a prática nesta cena, ou null.
 * `marcadores`: ids de plano marcados como anúncio pela proposta (Set) para esta cena, além de `missao`.
 * `texto`: o que foi dito (ASR/transcrição); vazio/null = só o roteiro (vale o roteiro).
 * Devolve { id, line, noRoteiro (o plano está na cena e não foi tirado), falado (e o áudio/transcrição o diz) }.
 */
export function planoDeAnuncio(node, { marcadores = new Set(), texto = null } = {}) {
  const shots = node?.direction?.shots;
  if (!Array.isArray(shots)) return null;
  const ids = new Set([ID_PLANO_ANUNCIO, ...IDS_ANUNCIO_ALTERNATIVOS, ...marcadores]);
  const shot = shots.find((s) => s.id === ID_PLANO_ANUNCIO) ?? shots.find((s) => ids.has(s.id));
  if (!shot || !String(shot.line || '').trim()) return null;
  const tirado = (node.media?.adjust?.drop ?? []).includes(shot.id);
  const falado = !tirado && (!texto || !texto.trim() || planoEstaNoTexto(shot.line, texto));
  return { id: shot.id, line: String(shot.line).trim(), noRoteiro: !tirado, falado };
}

/**
 * Marcadores das propostas da expansão: `curso|aula|no` → ids de plano cuja fala ANTIGA dizia "missão" e foi trocada por uma promessa
 * (é o anúncio da prática daquela aula). Sem as propostas (ou sem a pasta), devolve vazio e vale só o plano `missao` e a palavra-chave.
 */
export function marcadoresDasPropostas(raiz) {
  const pasta = resolve(raiz, 'docs/novos-cursos/expansao-final');
  const out = new Map();
  if (!existsSync(pasta)) return out;
  for (const c of readdirSync(pasta).filter((x) => /^C\d\d$/.test(x))) {
    const arq = resolve(pasta, c, 'proposta.json');
    if (!existsSync(arq)) continue;
    let p;
    try { p = JSON.parse(readFileSync(arq, 'utf8')); } catch { continue; }
    for (const a of p.aulas ?? []) {
      if (a.acao === 'add') continue;
      for (const n of a.nos ?? []) {
        for (const pl of n.planos ?? []) {
          const antiga = pl.de ?? pl.falaAnterior ?? pl.antes ?? '';
          if (!/miss[aã]o/i.test(antiga)) continue;
          const k = `${c}|${a.id}|${n.id}`;
          if (!out.has(k)) out.set(k, new Set());
          out.get(k).add(pl.id);
        }
      }
    }
  }
  return out;
}

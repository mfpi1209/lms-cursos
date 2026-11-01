// node --test tools/robo-aluno/anuncio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planoDeAnuncio, planoEstaNoTexto, RE_ANUNCIO_PALAVRA } from './anuncio.mjs';

const cena = (shots, media) => ({ id: 'v00', direction: { shots }, ...(media ? { media } : {}) });
const ABERTURA = 'Daqui a pouco, você escreve a pergunta que confirma roupa e calçado, pronta para o seu primeiro dia.';

test('a abertura nova (sem a palavra "missão") é o anúncio quando o plano `missao` está falado', () => {
  assert.equal(RE_ANUNCIO_PALAVRA.test(ABERTURA), false); // a regra antiga não a enxergava
  const p = planoDeAnuncio(cena([{ id: 's1', line: 'Oi!' }, { id: 'missao', line: ABERTURA }]), { texto: `Oi! ${ABERTURA} Uma loja pode ter regras diferentes.` });
  assert.deepEqual(p, { id: 'missao', line: ABERTURA, noRoteiro: true, falado: true });
});

test('sem transcrição vale o roteiro; plano em media.adjust.drop não é falado', () => {
  assert.equal(planoDeAnuncio(cena([{ id: 'missao', line: ABERTURA }])).falado, true);
  assert.equal(planoDeAnuncio(cena([{ id: 'missao', line: ABERTURA }], { adjust: { drop: ['missao'] } })).falado, false);
});

test('plano `missao` que a gravação não diz (transcrição de outra fala) não é falado', () => {
  const p = planoDeAnuncio(cena([{ id: 'missao', line: ABERTURA }]), { texto: 'Oi! Eu sou a Camila. Hoje vamos falar de outra coisa bem diferente.' });
  assert.equal(p.falado, false);
  assert.equal(p.noRoteiro, true); // está no roteiro, mas a gravação (antiga) não o diz: é o aviso "o vídeo gravado não diz isso"
});

test('corte do ajuste fino numa frase do plano ainda conta como falado (≥ 60% das palavras)', () => {
  assert.equal(planoEstaNoTexto(ABERTURA, 'daqui a pouco você escreve a pergunta que confirma roupa e calçado'), true);
});

test('marcador da proposta: anúncio em plano com outro id (ex.: s4)', () => {
  const linha = 'Daqui a pouco você escreve uma pergunta que ofereça formas diferentes de participar.';
  const c = cena([{ id: 's1', line: 'Oi.' }, { id: 's4', line: linha }]);
  assert.equal(planoDeAnuncio(c), null); // sem o marcador, só `missao` conta
  assert.deepEqual(planoDeAnuncio(c, { marcadores: new Set(['s4']) }), { id: 's4', line: linha, noRoteiro: true, falado: true });
});

test('cena sem direção ou sem plano de anúncio: null (cai na palavra-chave)', () => {
  assert.equal(planoDeAnuncio({ id: 'v00' }), null);
  assert.equal(planoDeAnuncio(cena([{ id: 's1', line: 'Oi, tem uma missão para você: escreva.' }])), null);
});

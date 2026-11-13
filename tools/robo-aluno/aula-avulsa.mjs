#!/usr/bin/env node
// Robô aluno numa aula avulsa: roda UMA aula de qualquer curso em que a conta de teste (aluna@demo.local) tenha
// matrícula, pelo endereço da aula. Serve para cursos fora da numeração da casa (C01…C26), como um roteiro de exemplo.
// Não grava relatório: imprime o resumo e deixa as capturas na pasta indicada.
//
// node tools/robo-aluno/aula-avulsa.mjs --base http://localhost:3023 --matricula enr_… --aula aula_01 [--caminhos 1,2] [--saida docs/qa/tarefa/robo]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ } from './dados.mjs';
import { login } from './login.mjs';
import { rodarAula } from './aula.mjs';

const { chromium } = await import(resolve(RAIZ, 'node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs'));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:3010');
const MATRICULA = arg('matricula');
const AULA = arg('aula');
const CAMINHOS = arg('caminhos', '1').split(',').map(Number);
const SAIDA = resolve(RAIZ, arg('saida', 'docs/qa/lancamento/robo/avulsa'));
if (!MATRICULA || !AULA) {
  console.error('uso: aula-avulsa.mjs --matricula <enr_…> --aula <id da aula> [--base http://localhost:3010] [--caminhos 1,2] [--saida pasta]');
  process.exit(2);
}
mkdirSync(SAIDA, { recursive: true });

const cookies = await login(BASE);
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let falhou = false;
for (const caminho of CAMINHOS) {
  const nome = `${AULA}-c${caminho}`;
  const r = await rodarAula({ browser, cookies, url: `${BASE}/aprender/${MATRICULA}/aulas/${AULA}`, caminho, primeiraCena: arg('primeira-cena', null), img: SAIDA, prefixo: nome, provaCelular: false });
  writeFileSync(resolve(SAIDA, `${nome}.json`), JSON.stringify(r, null, 1));
  const t = r.tarefa;
  console.log(
    JSON.stringify({
      aula: AULA,
      caminho,
      concluiu: r.concluiu,
      motivoParada: r.motivoParada ?? null,
      duracaoS: r.duracaoS,
      telas: (r.telas || []).map((x) => x.tipo + (x.node ? ':' + x.node : '')),
      tarefa: t ? { node: t.node, situacao: t.situacao, reenvio: !!t.reenvio, mantida: !!t.mantida, arquivo: t.arquivo, recusouSemHttps: t.recusouSemHttps ?? null, confirmadoMs: t.confirmadoMs ?? null, criterios: t.antes?.criterios ?? [] } : null,
      achados: (r.achados || []).map((a) => `${a.gravidade}: ${a.tipo}: ${a.texto}`),
      erros: (r.erros || []).length,
    }),
  );
  if (!r.concluiu) falhou = true;
}
await browser.close();
process.exit(falhou ? 1 : 0);

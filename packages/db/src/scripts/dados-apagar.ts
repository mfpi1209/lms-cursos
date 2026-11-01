// Exclusão (ou encerramento) de uma conta a pedido da pessoa (LGPD, art. 18, IV/VI; Marco Civil, art. 7, X).
// Procedimento: docs/legal/procedimento-direitos-do-titular.md, seção 5.
//
//   pnpm --filter @lms/db dados:apagar <email>                        # simulação: só conta o que faria
//   pnpm --filter @lms/db dados:apagar <email> --apply                # cancela o selo, tira o nome dele e apaga a conta
//   pnpm --filter @lms/db dados:apagar <email> --encerrar [--apply]   # só marca a conta como encerrada (não apaga)
//
// Selos: viram "cancelado" e o nome é trocado por "Titular removido a pedido" (a página pública mostra "Selo cancelado").
// Fica: auditoria e registro de acesso (obrigação legal; sem ligação para a pessoa depois da exclusão).
// Recusa aluno@demo.local e qualquer @demo.local do seed (só contas descartáveis lgpd-teste-*@demo.local aceitam --apply)
// e contas com papel de equipe.
import { userInfo } from 'node:os';
import { closeAccount, eraseUser } from '../repositories/privacy';
import { parseArgs, runScript } from './_dados';

await runScript(async ({ db }) => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const email = positional[0];
  if (!email) throw new Error('uso: dados:apagar <email> [--encerrar] [--apply]');
  const apply = flags.has('--apply');
  const r = flags.has('--encerrar') ? await closeAccount(db, { email, apply, actorId: null }) : await eraseUser(db, { email, apply, actorId: null, via: `dados:apagar (${userInfo().username})` });
  const c = r.counts;
  console.log(`${apply ? '' : '[simulação, nada foi alterado] '}${r.mode === 'encerrar' ? 'Encerrar' : 'Apagar'} a conta ${r.userId}`);
  if (r.mode === 'apagar') {
    console.log(`  apaga: ${c.sessoes} sessão(ões), ${c.matriculas} matrícula(s), ${c.tentativasDeAula} tentativa(s) de aula, ${c.eventos} evento(s), ${c.evidencias} evidência(s), ${c.missoes} missão(ões) com ${c.historicoDeMissoes} versão(ões), ${c.checagensDeTrilha} checagem(ns)`);
    console.log(`  outbox: ${c.eventosPendentesDoOutbox} evento(s) apagado(s)`);
    console.log(`  selos: ${c.selosParaCancelarEAnonimizar} cancelado(s) e sem o nome ("Titular removido a pedido")`);
    console.log(`  mantém (obrigação legal, sem ligação com a pessoa): ${c.registrosDeAcessoMantidos} registro(s) de acesso, ${c.registrosDeAuditoriaMantidos} de auditoria`);
  } else console.log('  marca a conta como encerrada (nada é apagado agora)');
  console.log(apply ? 'Concluído. Registre no log de pedidos e responda pelo modelo E.' : 'Para executar, repita com --apply.');
});

// Exportação dos dados de uma pessoa (LGPD, arts. 18 e 19). Procedimento: docs/legal/procedimento-direitos-do-titular.md.
//
//   pnpm --filter @lms/db dados:exportar <email> [--saida <pasta>]
//
// Escreve `dados.json` e `resumo.txt` numa pasta (a indicada em --saida ou uma pasta nova no diretório temporário, só do dono)
// e imprime SÓ o caminho e uma contagem; o conteúdo nunca vai para a saída padrão. Só leitura (grava uma linha `data.export`
// em audit_logs). Recusa aluno@demo.local; contas @demo.local do seed podem ser lidas, nunca alteradas.
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { newId } from '../ids';
import { assertTargetEmail, collectUserData, summarizeUserData } from '../repositories/privacy';
import * as s from '../schema';
import { parseArgs, runScript } from './_dados';

await runScript(async ({ db }) => {
  const { values, positional } = parseArgs(process.argv.slice(2));
  const email = positional[0];
  if (!email) throw new Error('uso: dados:exportar <email> [--saida <pasta>]');
  assertTargetEmail(email, 'read');
  const data = await collectUserData(db, email);
  if (!data) throw new Error('não há conta com este e-mail');

  const outDir = values.get('--saida') ? path.resolve(values.get('--saida')!) : mkdtempSync(path.join(tmpdir(), 'dna-dados-'));
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(outDir, 0o700);
  } catch {
    /* pasta já existente de outro dono: segue */
  }
  writeFileSync(path.join(outDir, 'dados.json'), JSON.stringify(data, null, 2), { mode: 0o600 });
  writeFileSync(path.join(outDir, 'resumo.txt'), summarizeUserData(data), { mode: 0o600 });

  await db.insert(s.auditLogs).values({
    id: newId('aud'),
    actorId: null,
    action: 'data.export',
    entityType: 'user',
    entityId: data.conta.id,
    data: { userId: data.conta.id, via: 'dados:exportar', executor: userInfo().username },
  });

  console.log(`Exportação gerada em: ${outDir}`);
  console.log(`  dados.json e resumo.txt (apenas o dono da pasta lê)`);
  console.log(
    `  matrículas ${data.matriculas.length}, tentativas ${data.tentativasDeAula.length}, missões ${data.missoes.length}, selos ${data.selos.length}, sessões ativas ${data.sessoesAtivas.length}, registros de acesso ${data.registrosDeAcesso.length}, auditoria ${data.auditoria.length}`,
  );
  console.log('Envie como anexo ao e-mail da conta (modelo C) e apague a pasta depois. Registre só o fato no log de pedidos.');
});

// Consulta ao registro de acesso do Marco Civil (Lei 12.965/2014, art. 15). Só por ordem judicial ou obrigação legal
// (docs/legal/pendencias.md, seção 8). Cada uso grava `access_logs.read` em audit_logs com o motivo.
//
//   pnpm --filter @lms/db acesso:consultar <email|ip|idDaConta> --motivo "<processo ou ordem>" [--desde AAAA-MM-DD] [--limite N]
//
// Imprime as linhas encontradas (data/hora, tipo, IP, conta). Não há rota HTTP para isto.
import { userInfo } from 'node:os';
import { queryAccessLogs } from '../repositories/access';
import { parseArgs, runScript } from './_dados';

await runScript(async ({ db }) => {
  const { values, positional } = parseArgs(process.argv.slice(2));
  const term = positional[0];
  const motivo = values.get('--motivo');
  if (!term || !motivo) throw new Error('uso: acesso:consultar <email|ip|idDaConta> --motivo "<processo ou ordem>" [--desde AAAA-MM-DD] [--limite N]');
  const since = values.get('--desde') ? new Date(`${values.get('--desde')}T00:00:00-03:00`) : undefined;
  if (since && Number.isNaN(since.getTime())) throw new Error('--desde deve ser AAAA-MM-DD');
  const limit = values.get('--limite') ? Number(values.get('--limite')) : undefined;
  const r = await queryAccessLogs(db, { term, motivo, executor: userInfo().username, ...(since ? { since } : {}), ...(limit ? { limit } : {}) });
  console.log(`Consulta por ${r.by}${r.userId ? ` (conta ${r.userId})` : ''}: ${r.rows.length} registro(s). A consulta foi registrada em audit_logs.`);
  for (const x of r.rows) console.log(`${x.occurredAt.toISOString()}\t${x.kind}\t${x.ipAddress ?? '(sem IP)'}${x.sourcePort ? `:${x.sourcePort}` : ''}\t${x.userId}`);
});

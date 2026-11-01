// Apaga a nota "O que você percebeu?" de uma missão, com o histórico de versões e as cópias do texto nas tentativas e eventos.
// Não mexe no resto (a missão continua "Já experimentei"/"Vou fazer depois"; o curso e o selo ficam como estão).
//
//   pnpm --filter @lms/db dados:apagar-nota <email> <enrollmentId|lessonId>           # simulação
//   pnpm --filter @lms/db dados:apagar-nota <email> <enrollmentId|lessonId> --apply
//
// Recusa aluno@demo.local e qualquer @demo.local do seed (só lgpd-teste-*@demo.local aceita --apply).
import { eraseMissionNotesForUser } from '../repositories/privacy';
import { parseArgs, runScript } from './_dados';

await runScript(async ({ db }) => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [email, target] = positional;
  if (!email || !target) throw new Error('uso: dados:apagar-nota <email> <enrollmentId|lessonId> [--apply]');
  const apply = flags.has('--apply');
  const r = await eraseMissionNotesForUser(db, { email, target, apply });
  console.log(`${apply ? '' : '[simulação, nada foi alterado] '}${r.targets.length} missão(ões) casam com ${target}`);
  for (const t of r.targets) console.log(`  - aula ${t.lessonId}, cena ${t.nodeId}: ${t.hasNote ? 'tem nota' : 'sem nota'}, ${t.revisions} versão(ões) no histórico`);
  if (apply) {
    const n = r.results.filter((x) => x.deleted).length;
    console.log(`Concluído: ${n} nota(s) apagada(s), ${r.results.reduce((a, x) => a + x.copiesCleaned, 0)} cópia(s)/versão(ões) limpa(s). Responda pelo modelo G e registre no log de pedidos.`);
  } else console.log('Para executar, repita com --apply.');
});

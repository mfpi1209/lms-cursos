/**
 * Onda 2 (C12–C26): correção de ERRO DE DIGITAÇÃO no rascunho quando a fala gravada estava certa e o texto errado.
 * Troca uma frase exata (esperando N ocorrências) e grava com saveDraft. NÃO mexe em `media.stale` nem em nenhum outro campo
 * (o vídeo continua válido: o texto passa a bater com o que o avatar disse). Sem `--apply` só mostra.
 *   tsx onda2-texto.ts <Cxx> "<texto antigo>" "<texto novo>" [N=1] [--apply]
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
// @ts-ignore .mjs sem tipos
import { CURSOS } from '../../../../../tools/robo-aluno/dados.mjs';

async function main() {
  const a = process.argv.slice(2).filter((x) => x !== '--apply');
  const apply = process.argv.includes('--apply');
  const [cod, velho, novo, nStr] = a;
  const esperado = Number(nStr ?? 1);
  const id = CURSOS[Number(cod!.slice(1)) - 1];
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const d = await getDraft(db, id);
    const json = JSON.stringify(d!.document);
    const velhoJ = JSON.stringify(velho).slice(1, -1), novoJ = JSON.stringify(novo).slice(1, -1);
    const n = json.split(velhoJ).length - 1;
    console.log(`${cod}: ${n} ocorrência(s) de "${velho}"`);
    if (n !== esperado) throw new Error(`esperava ${esperado}`);
    if (!apply) return;
    const doc = JSON.parse(json.split(velhoJ).join(novoJ));
    const r = await saveDraft(db, { courseId: id, document: doc, expectedRevision: d!.revision, userId: d!.updatedBy, origin: 'qa', note: `onda2: erro de digitação "${velho}" → "${novo}"` });
    console.log(`gravado: revisão ${r.revision}`);
  } finally { await close(); }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

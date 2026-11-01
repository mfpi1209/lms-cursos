/** Onda 1 (C01–C11), SÓ LEITURA: validateDraft de cada curso + nós da aula nova / aberturas com mídia ausente ou desatualizada. */
import { writeFileSync } from 'node:fs';
import { createDb } from '../../client';
import { validateDraft, } from '../../repositories/publishing';
import { getDraft } from '../../repositories/authoring';
// @ts-ignore script de QA lê a lista de cursos do robô (.mjs sem tipos)
import { CURSOS } from '../../../../../tools/robo-aluno/dados.mjs';

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const out: any[] = [];
  const alvo = (process.argv[2] ?? 'C01-C11').split('-');
  const a = Number(alvo[0]!.slice(1)), b = Number(alvo[1]!.slice(1));
  try {
    for (let i = a - 1; i < b; i++) {
      const id = CURSOS[i];
      const v = await validateDraft(db, id);
      const d = await getDraft(db, id);
      const doc: any = d!.document;
      const lessons = doc.modules.flatMap((m: any) => m.lessons);
      const last = lessons[lessons.length - 1];
      const rel = {
        codigo: `C${String(i + 1).padStart(2, '0')}`, id, titulo: doc.title, revisao: v.revision, ok: v.ok, erros: v.errors.map((e: any) => `${e.code} ${e.lessonId}/${e.nodeId}: ${e.message}`),
        midia: v.media,
        ausentes: v.warnings.filter((w: any) => w.code === 'MEDIA_MISSING').map((w: any) => `${w.lessonId}/${w.nodeId}`),
        stale: v.warnings.filter((w: any) => w.code === 'MEDIA_STALE').map((w: any) => `${w.lessonId}/${w.nodeId}`),
        outros: v.warnings.filter((w: any) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)).map((w: any) => `${w.code} ${w.lessonId}/${w.nodeId}`),
        ultimaAula: last.id,
        nosUltimaAula: last.graph.nodes.map((n: any) => `${n.id}:${n.type}`),
      };
      out.push(rel);
      console.log(rel.codigo, 'ok=' + rel.ok, 'rev=' + rel.revisao, JSON.stringify(rel.midia), 'ausentes=', rel.ausentes.join(','), 'stale=', rel.stale.join(','), 'erros=', rel.erros.length);
    }
  } finally { await close(); }
  writeFileSync(process.argv[3] ?? '/dev/null', JSON.stringify(out, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

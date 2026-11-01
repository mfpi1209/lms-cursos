/**
 * Decisão do dono (31/10, item 2 de decisoes-linha-de-base.md): a atividade "Na prática" é OPCIONAL.
 * No RASCUNHO dos 14 cursos atuais e dos 12 cursos novos, todo nó `reflection` com `required: true` passa a `required: false`.
 * `minLength: 0` (aceita resposta vazia) e o botão "Fazer depois" continuam como estão: este script NÃO muda `minLength`; se
 * alguma atividade tiver `minLength > 0`, ela é listada (o aluno não teria "Fazer depois" nela) e mesmo assim só recebe o `required`.
 *
 * Só `required`. Nada de narração, direção, planos, mídia, `media.stale` ou `media.adjust`: o diff entre o documento lido e o
 * gravado só pode conter caminhos `modules.N.lessons.N.graph.nodes.N.required`, e só em nós `reflection`; qualquer outra coisa
 * aborta sem gravar. (`required` de nó nem entra na impressão digital da apresentação nem no hash da cena: a cena de mídia não
 * fica desatualizada. Os nós `reflection` nem são cenas de vídeo.)
 * Idempotente (o que já é `false` é pulado). Controle de revisão: grava com `expectedRevision`; em conflito (a gravação paga e
 * o ajuste fino também escrevem no rascunho) relê o rascunho e tenta de novo. Sem `--apply` (ou com `--dry-run`) não grava nada
 * no banco. Nos dois casos escreve o antes/depois em JSON (`--saida`).
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-atividade-opcional.ts [--dry-run | --apply] [--saida arq.json]
 */
import { writeFileSync } from 'node:fs';
import { CourseDocumentSchema, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { argumentos, caminhosDiferentes, cenasStale } from './_rascunho-qa';

/** 14 cursos atuais (C01…C14 em short-titles.ts) */
const ATUAIS = [
  'crs_99hpdsc8w88osiuh', 'crs_arbeohlw3xp5v3zx', 'crs_hd4jnnpx3oj0xf14', 'crs_4z17p0m6d43qxmmo', 'crs_5vccpfypr6fmxojb', 'crs_b8zeh4b2gguseghq', 'crs_8g0csi2hflfztfge',
  'crs_gjn468p3y6hwua4f', 'crs_bmf11akamtxoti28', 'crs_q52zsimeeahpa9bq', 'crs_4tj8a3q3g9gudgb7', 'crs_u4nfw88a4n2n0ubv', 'crs_gujuaiykqcsl2n31', 'crs_hvvgkvtd1rb2um0l',
];
/** 12 cursos novos (docs/novos-cursos/instrutores-gerados.md) */
const NOVOS = [
  'crs_t303ykqfmhj3yb1g', 'crs_2rt2rsoii8bpydp2', 'crs_5k5upah2xphlfvi5', // Mauro
  'crs_tg9iqz8wmmf5pw77', 'crs_au1463izc386by27', 'crs_m60hsx8on6ebcyqg', // Laís
  'crs_4jh683s5h351z2db', 'crs_njtlqq7y7fyfeqcr', 'crs_gl0hjkmqfgnnur9y', // Vinícius
  'crs_dp9s7pdro9j6e3m0', 'crs_0ua5onij460lpzs0', 'crs_d5rsi8gt36rv0qbq', // Flávia
];
const CURSOS = [...ATUAIS, ...NOVOS];

const PERMITIDO = /^modules\.\d+\.lessons\.\d+\.graph\.nodes\.\d+\.required$/;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Linha {
  curso: string;
  grupo: 'atual' | 'novo';
  titulo: string;
  aula: string;
  no: string;
  tituloNo: string;
  minLength: number;
  estado: 'aplicar' | 'ja-aplicado';
  requiredAntes: boolean;
  requiredDepois: boolean;
  revisaoAntes?: number;
  revisaoDepois?: number;
}

function marcar(doc: CourseDocument): Array<{ lessonId: string; node: { id: string; type: string; required: boolean; title?: string; minLength?: number } }> {
  const out: Array<{ lessonId: string; node: { id: string; type: string; required: boolean; title?: string; minLength?: number } }> = [];
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) if (n.type === 'reflection') out.push({ lessonId: l.id, node: n as never });
  return out;
}

async function main(): Promise<void> {
  const { apply, saida } = argumentos('docs/qa/lancamento/robo/correcoes-atividade-opcional.antes-depois.json');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const log: Linha[] = [];
  const avisos: string[] = [];
  const staleInfo: Array<{ curso: string; staleAntes: number; staleDepois: number }> = [];
  try {
    for (const courseId of CURSOS) {
      for (let tentativa = 1; ; tentativa++) {
        const d = await getDraft(db, courseId);
        if (!d) throw new Error(`rascunho de ${courseId} não encontrado`);
        const original = d.document as CourseDocument;
        const doc = structuredClone(original) as CourseDocument;
        const reflexoes = marcar(doc);
        const linhas: Linha[] = reflexoes.map(({ lessonId, node }) => ({
          curso: courseId, grupo: ATUAIS.includes(courseId) ? 'atual' : 'novo', titulo: doc.title, aula: lessonId, no: node.id, tituloNo: node.title ?? '', minLength: node.minLength ?? 20,
          estado: node.required ? 'aplicar' : 'ja-aplicado', requiredAntes: node.required, requiredDepois: false, revisaoAntes: d.revision,
        }));
        for (const { node } of reflexoes) if (node.required) node.required = false;
        const n = linhas.filter((l) => l.estado === 'aplicar').length;
        // trava: o único jeito de gravar é o diff conter só `required` de nós reflection
        const parsed = CourseDocumentSchema.parse(doc);
        const dif = caminhosDiferentes(original as unknown as Json, parsed as unknown as Json);
        const fora = dif.filter((p) => !PERMITIDO.test(p));
        if (fora.length) throw new Error(`${courseId}: o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
        // prova de que nenhuma cena passa a "desatualizada": o conjunto de cenas stale é o mesmo antes e depois
        const staleAntes = cenasStale(original);
        const staleDepois = cenasStale(parsed);
        if (JSON.stringify(staleAntes) !== JSON.stringify(staleDepois)) throw new Error(`${courseId}: o conjunto de cenas desatualizadas mudou; nada foi gravado`);
        if (tentativa === 1) staleInfo.push({ curso: courseId, staleAntes: staleAntes.length, staleDepois: staleDepois.length });
        if (dif.length !== n) throw new Error(`${courseId}: ${dif.length} caminho(s) diferentes, esperava ${n}; nada foi gravado`);
        if (tentativa === 1) {
          const comMin = linhas.filter((l) => l.minLength > 0);
          console.log(`[opcional] ${courseId} (${doc.title}): ${linhas.length} atividade(s), ${n} a mudar, ${linhas.length - n} já opcional(is); revisão ${d.revision}`);
          for (const l of comMin) avisos.push(`${courseId}/${l.aula}/${l.no}: minLength=${l.minLength} (sem "Fazer depois")`);
        }
        if (!apply || !n) {
          log.push(...linhas);
          break;
        }
        try {
          const salvo = await saveDraft(db, { courseId, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `Atividade "Na prática" opcional (required:false): ${n} atividade(s)` });
          console.log(`[opcional] ${courseId}: ${n} atividade(s); rascunho ${d.revision} → ${salvo.revision}`);
          log.push(...linhas.map((l) => ({ ...l, revisaoDepois: salvo.revision })));
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
            console.log(`[opcional] ${courseId}: conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
            await new Promise((res) => setTimeout(res, 700 * tentativa));
            continue;
          }
          throw e;
        }
      }
    }
    const resumo = {
      script: 'qa-atividade-opcional',
      modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
      geradoEm: new Date().toISOString(),
      cursos: CURSOS.length,
      atividades: log.length,
      aMudar: log.filter((l) => l.estado === 'aplicar').length,
      jaOpcionais: log.filter((l) => l.estado === 'ja-aplicado').length,
      comMinLengthMaiorQueZero: avisos,
      cenasDesatualizadasAntesDepois: staleInfo,
    };
    writeFileSync(saida, JSON.stringify({ resumo, atividades: log }, null, 1));
    console.log(`[opcional] ${resumo.modo}: ${resumo.cursos} cursos, ${resumo.atividades} atividades, ${resumo.aMudar} a mudar, ${resumo.jaOpcionais} já opcionais, ${avisos.length} com minLength>0. Antes/depois em ${saida}`);
    for (const a of avisos) console.log(`[opcional] ATENÇÃO ${a}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[opcional] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

/**
 * Reação da instrutora a cada resposta (A14, pedido do autor 2026-10-30): grava o
 * TEXTO da reação padrão em cada opção de decisão dos cursos, derivado do
 * retorno escrito da própria opção (`reactionFromFeedback`: abertura pela
 * qualidade + a explicação + a dica curta). Só texto: nenhum vídeo existente
 * fica desatualizado e nada é gravado nem cobrado. Opções que já têm reação não
 * mudam. Edita o RASCUNHO direto (sem reimportar).
 *
 * A gravação vem depois, pelo orçamento do estúdio ("Só as reações"), com "aprovo".
 *
 * Uso (raiz do monorepo):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/reacoes-padrao.ts [--apply] [--only crs_a,crs_b] [--skip crs_c] [--max-words N]
 * `--max-words N`: encurta as reações SEM vídeo com mais de N palavras, tirando frases do fim (fica no mínimo
 * abertura + explicação); serve para caber num teto de custo aprovado (ex.: 18 palavras ≈ 7 s).
 * Sem --only: os 14 cursos (Primeira Vaga, Comece bem e os 12 do lote).
 */
import { applyDefaultReactions, compileCourse, CourseDocumentSchema, reactionStatuses, allLessons, type ChoiceNode, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

export const COURSES: Record<string, string> = {
  crs_hvvgkvtd1rb2um0l: 'Primeira Vaga',
  crs_gujuaiykqcsl2n31: 'Comece bem',
  crs_99hpdsc8w88osiuh: 'Lote 01 · Primeiro dia',
  crs_arbeohlw3xp5v3zx: 'Lote 02 · Roupa',
  crs_hd4jnnpx3oj0xf14: 'Lote 03 · Celular',
  crs_4z17p0m6d43qxmmo: 'Lote 04 · WhatsApp',
  crs_4tj8a3q3g9gudgb7: 'Lote 05 · Horários',
  crs_b8zeh4b2gguseghq: 'Lote 06 · Limites',
  crs_bmf11akamtxoti28: 'Lote 07 · Equipe',
  crs_8g0csi2hflfztfge: 'Lote 08 · Espaços',
  crs_gjn468p3y6hwua4f: 'Lote 09 · Redes',
  crs_q52zsimeeahpa9bq: 'Lote 10 · Tarefa',
  crs_u4nfw88a4n2n0ubv: 'Lote 11 · Regras',
  crs_5vccpfypr6fmxojb: 'Lote 12 · Postura',
};

/** Reações padrão no documento inteiro (puro). Gira as aberturas pela posição corrida das opções no curso. */
export function withCourseReactions(doc: CourseDocument): { document: CourseDocument; added: number; total: number } {
  const d = structuredClone(doc);
  let added = 0;
  let k = 0;
  for (const m of d.modules) {
    for (const l of m.lessons) {
      const before = reactionStatuses(l.graph).filter((r) => r.text).length;
      // índice corrido no curso: as aberturas não se repetem entre aulas
      l.graph = applyDefaultReactions(l.graph, k).graph;
      k += l.graph.nodes.reduce((a, n) => a + (n.type === 'choice' ? n.options.length : 0), 0);
      added += reactionStatuses(l.graph).filter((r) => r.text).length - before;
    }
  }
  const total = allLessons(d).reduce((a, l) => a + reactionStatuses(l.graph).length, 0);
  return { document: CourseDocumentSchema.parse(d), added, total };
}

/** Encurta reações sem vídeo para no máximo `max` palavras (frases inteiras; mínimo de 2 frases). */
export function capReactionWords(doc: CourseDocument, max: number): { document: CourseDocument; trimmed: number } {
  const d = structuredClone(doc);
  let trimmed = 0;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  for (const m of d.modules) {
    for (const l of m.lessons) {
      l.graph.nodes = l.graph.nodes.map((n) => {
        if (n.type !== 'choice') return n;
        const options = (n as ChoiceNode).options.map((o) => {
          const t = o.reaction?.text;
          if (!t || o.reaction?.media || words(t) <= max) return o;
          const ss = t.match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g)?.map((x) => x.trim()) ?? [t];
          let out = ss.slice(0, 2).join(' ');
          for (const x of ss.slice(2)) {
            if (words(`${out} ${x}`) > max) break;
            out = `${out} ${x}`;
          }
          if (out === t) return o;
          trimmed++;
          return { ...o, reaction: { ...o.reaction!, text: out } };
        });
        return { ...n, options } as ChoiceNode;
      });
    }
  }
  return { document: CourseDocumentSchema.parse(d), trimmed };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? (process.argv[i + 1] ?? '').split(',').filter(Boolean) : [];
  };
  const only = arg('--only');
  const skip = new Set(arg('--skip'));
  const ids = (only.length ? only : Object.keys(COURSES)).filter((id) => !skip.has(id));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const courseId of ids) {
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`rascunho ${courseId} não encontrado`);
      const maxAt = process.argv.indexOf('--max-words');
      const maxWords = maxAt >= 0 ? Number(process.argv[maxAt + 1]) : 0;
      const base = withCourseReactions(draft.document);
      const capped = maxWords > 0 ? capReactionWords(base.document, maxWords) : { document: base.document, trimmed: 0 };
      const { document } = capped;
      const { added, total } = base;
      const errorsBefore = compileCourse(draft.document).errors.length;
      const r = compileCourse(document);
      if (r.errors.length > errorsBefore) throw new Error(`${courseId}: a mudança criaria erros: ${r.errors.map((e) => e.message).join('; ')}`);
      const noText = r.warnings.filter((w) => w.code === 'REACTION_MISSING').length;
      console.log(`${(COURSES[courseId] ?? courseId).padEnd(26)} rev ${draft.revision}: ${total} respostas, +${added} reações${capped.trimmed ? `, ${capped.trimmed} encurtadas (≤ ${maxWords} palavras)` : ''}${noText ? ` (${noText} decisões ainda sem reação: opção sem retorno escrito)` : ''}`);
      if (!apply || (added === 0 && capped.trimmed === 0)) continue;
      const saved = await saveDraft(db, { courseId, document, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `Reação da instrutora a cada resposta: ${added} textos padrão a partir do retorno${capped.trimmed ? `; ${capped.trimmed} encurtadas para até ${maxWords} palavras (teto de custo)` : ''} (sem vídeo ainda)` });
      console.log(`  gravado: rascunho ${draft.revision} → ${saved.revision}`);
    }
    if (!apply) console.log('\n(só leitura; rode com --apply para gravar)');
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('reacoes-padrao.ts')) main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

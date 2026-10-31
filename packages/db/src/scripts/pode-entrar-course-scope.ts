/**
 * Aplica ao RASCUNHO do curso "Pode entrar" a mudança estrutural do perfil como
 * variável de curso, preservando tudo o que foi editado depois da inserção
 * (branding, openAnswer nas opções etc.): carrega o rascunho atual e mexe só em
 *  - `perfil` → `scope: 'course'` em toda aula que a declara;
 *  - remove as perguntas de perfil repetidas (`q03_perfil`, `q05_perfil`) e as
 *    arestas que saem delas; o início da aula passa a ser o destino delas (V03 /
 *    V05) e eventuais arestas que chegavam nelas são religadas a esse destino.
 * Compila antes de gravar (0 erros) e grava com `authoring.saveDraft` (nova
 * revisão, controle otimista). Idempotente: sem mudanças, não grava.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/pode-entrar-course-scope.ts [--dry-run]
 */
import { compileCourse, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const COURSE_ID = process.env.COURSE_ID ?? 'crs_7vbrb49jkq23ibiw';
const REMOVE = ['q03_perfil', 'q05_perfil'];
const DRY_RUN = process.argv.includes('--dry-run');

function transform(input: CourseDocument): { doc: CourseDocument; changes: string[] } {
  const doc = structuredClone(input);
  const changes: string[] = [];
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      const g = l.graph;
      for (const v of g.variables) {
        if (v.name === 'perfil' && v.scope !== 'course') {
          v.scope = 'course';
          changes.push(`${l.id}: perfil → scope course`);
        }
      }
      for (const removeId of REMOVE) {
        if (!g.nodes.some((n) => n.id === removeId)) continue;
        const outs = g.edges.filter((e) => e.from === removeId);
        const targets = [...new Set(outs.map((e) => e.to))];
        if (targets.length !== 1) throw new Error(`${l.id}/${removeId}: esperava um único destino, encontrou ${targets.join(', ') || 'nenhum'}`);
        const target = targets[0]!;
        g.nodes = g.nodes.filter((n) => n.id !== removeId);
        g.edges = g.edges.filter((e) => e.from !== removeId);
        for (const e of g.edges) if (e.to === removeId) e.to = target;
        if (g.startNodeId === removeId) g.startNodeId = target;
        if (g.layout?.positions && removeId in g.layout.positions) delete g.layout.positions[removeId];
        changes.push(`${l.id}: removido ${removeId} (${outs.length} arestas); início/entrada → ${target}`);
      }
    }
  }
  return { doc, changes };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE_ID);
    if (!draft) throw new Error(`Rascunho de ${COURSE_ID} não encontrado`);
    console.log(`[course-scope] ${COURSE_ID}: rascunho na revisão ${draft.revision}`);
    const { doc, changes } = transform(draft.document);
    if (changes.length === 0) {
      console.log('[course-scope] nada a mudar (já aplicado)');
      return;
    }
    for (const c of changes) console.log(`[course-scope] ${c}`);
    const compiled = compileCourse(doc);
    for (const e of compiled.errors) console.error(`[course-scope] erro ${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`);
    console.log(`[course-scope] compilação: ${compiled.errors.length} erros, ${compiled.warnings.length} avisos (${[...new Set(compiled.warnings.map((w) => w.code))].join(', ') || '—'})`);
    if (!compiled.ok) throw new Error('documento não compila; nada gravado');
    if (DRY_RUN) {
      console.log('[course-scope] --dry-run: nada gravado');
      return;
    }
    // autoria da revisão: quem gravou a revisão atual
    const userId = draft.updatedBy;
    const saved = await saveDraft(db, {
      courseId: COURSE_ID,
      document: doc,
      expectedRevision: draft.revision,
      userId,
      origin: 'script',
      note: 'perfil como variável de curso; remove perguntas de perfil repetidas (Q03/Q05)',
    });
    console.log(`[course-scope] gravado: revisão ${draft.revision} → ${saved.revision}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

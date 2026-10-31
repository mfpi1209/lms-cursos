/**
 * "Pode entrar" para quem está começando (primeiro emprego/estágio, muitas vezes
 * tímido ou introvertido): menos texto e nada de escrita obrigatória.
 *
 * Aplica ao RASCUNHO do curso o conteúdo novo do exemplo (`podeEntrar`), nó a nó,
 * preservando o que foi editado depois da inserção:
 *  - documento: `branding`, `presentation` (fundo, posição e escala da
 *    apresentadora), `sourceIds` e quaisquer outras chaves que o exemplo não tem;
 *  - nós que continuam: `media` e `direction` do rascunho (ex.: o vídeo com
 *    legendas da `q03_primeiro_emprego`). A mídia só fica desatualizada se a FALA
 *    mudou; a fala da Q03 é a mesma, então o vídeo segue válido;
 *  - layout: posições do editor dos nós que continuam; nós novos usam a posição
 *    do exemplo.
 * Muda: reflexões obrigatórias viram escolhas guiadas; uma anotação opcional no
 * fim da simulação; treino em voz alta opcional (só voz) em 10 perguntas de
 * entrevista; textos de tela em palavras-chave; nova aula "No dia: chegar bem e
 * com calma"; "Meu roteiro" montado com as escolhas.
 *
 * Compila (0 erros), grava com `authoring.saveDraft` (nova revisão) e, com
 * `--publish`, publica uma nova versão. Com `--move-demo-enrollments`, as
 * matrículas dos alunos de demonstração (aluno@demo.local, aluna@demo.local)
 * passam para a versão nova (por padrão, matrículas ficam na versão em que
 * entraram). Idempotente: sem mudanças, não grava.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/pode-entrar-simples.ts [--dry-run] [--publish] [--move-demo-enrollments]
 */
import { and, eq, inArray } from 'drizzle-orm';
import { compileCourse, courseLengthReport, podeEntrar, type AnyNode, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft, saveDraft } from '../repositories/authoring';
import { publishCourse } from '../repositories/publishing';

const COURSE_ID = process.env.COURSE_ID ?? 'crs_7vbrb49jkq23ibiw';
const DEMO_LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];
const DRY_RUN = process.argv.includes('--dry-run');
const PUBLISH = process.argv.includes('--publish');
const MOVE_ENROLLMENTS = process.argv.includes('--move-demo-enrollments');

/** Campos do nó que vêm da produção (não do roteiro): ficam como estão no rascunho. */
const PRESERVED_NODE_FIELDS = ['media', 'direction'] as const;

const json = (v: unknown) => JSON.stringify(v ?? null);

export function transform(draft: CourseDocument, target: CourseDocument = podeEntrar): { doc: CourseDocument; changes: string[] } {
  const doc = structuredClone(target) as CourseDocument & Record<string, unknown>;
  const changes: string[] = [];
  // documento: o que o exemplo não define (ou que é da produção) fica como no rascunho
  for (const [k, v] of Object.entries(draft as unknown as Record<string, unknown>)) {
    if (k === 'branding' || k === 'presentation' || k === 'sourceIds' || !(k in doc)) doc[k] = structuredClone(v);
  }

  const draftLessons = new Map(draft.modules.flatMap((m) => m.lessons).map((l) => [l.id, l]));
  const draftNodes = new Map(draft.modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes.map((n) => [n.id, n] as const))));
  const newNodeIds = new Set<string>();

  for (const lesson of doc.modules.flatMap((m) => m.lessons)) {
    const before = draftLessons.get(lesson.id);
    if (!before) changes.push(`${lesson.id}: aula nova "${lesson.title}" (${lesson.graph.nodes.length} cenas, sem mídia)`);
    for (const node of lesson.graph.nodes) {
      newNodeIds.add(node.id);
      const old = draftNodes.get(node.id);
      if (!old) {
        changes.push(`${lesson.id}/${node.id}: novo (${node.type})`);
        continue;
      }
      const target = node as AnyNode & Record<string, unknown>;
      const prev = old as AnyNode & Record<string, unknown>;
      for (const f of PRESERVED_NODE_FIELDS) if (prev[f] !== undefined && target[f] === undefined) target[f] = structuredClone(prev[f]);
      // mídia gerada a partir de uma fala que mudou fica marcada como desatualizada (não é o caso da Q03)
      if (target.media && json(prev.narration) !== json(target.narration)) {
        (target.media as { stale?: boolean }).stale = true;
        changes.push(`${lesson.id}/${node.id}: fala mudou → vídeo marcado como desatualizado`);
      }
      const diff = Object.keys({ ...prev, ...target }).filter((k) => json(prev[k]) !== json(target[k]));
      if (prev.type !== target.type) changes.push(`${lesson.id}/${node.id}: ${prev.type} → ${target.type} (escolha guiada)`);
      else if (diff.length) changes.push(`${lesson.id}/${node.id}: ${diff.join(', ')}`);
    }
    // layout: posições do editor dos nós que continuam
    const oldPositions = before?.graph.layout?.positions ?? {};
    const positions = lesson.graph.layout?.positions ?? {};
    for (const id of Object.keys(positions)) if (oldPositions[id]) positions[id] = oldPositions[id]!;
    if (before && json(before.graph.edges) !== json(lesson.graph.edges)) changes.push(`${lesson.id}: arestas (${before.graph.edges.length} → ${lesson.graph.edges.length})`);
  }
  for (const [id, n] of draftNodes) if (!newNodeIds.has(id)) changes.push(`removido ${id} (${n.type})`);
  for (const k of ['title', 'description', 'brief', 'objectives', 'completion', 'cast'] as const) {
    if (json(draft[k]) !== json(doc[k])) changes.push(`documento: ${k}`);
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
    console.log(`[simples] ${COURSE_ID}: rascunho na revisão ${draft.revision}`);
    const { doc, changes } = transform(draft.document);
    for (const c of changes) console.log(`[simples] ${c}`);

    const before = courseLengthReport(draft.document);
    const after = courseLengthReport(doc);
    console.log(`[simples] palavras na tela: ${before.totals.screenWords} → ${after.totals.screenWords}; minutos estimados: ${before.totals.estMinutes} → ${after.totals.estMinutes}`);

    const compiled = compileCourse(doc);
    for (const e of compiled.errors) console.error(`[simples] erro ${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`);
    console.log(`[simples] compilação: ${compiled.errors.length} erros, ${compiled.warnings.length} avisos (${[...new Set(compiled.warnings.map((w) => w.code))].join(', ') || '—'})`);
    if (!compiled.ok) throw new Error('documento não compila; nada gravado');
    if (DRY_RUN) {
      console.log('[simples] --dry-run: nada gravado');
      return;
    }

    let revision = draft.revision;
    if (changes.length === 0) console.log('[simples] rascunho já atualizado');
    else {
      const saved = await saveDraft(db, {
        courseId: COURSE_ID,
        document: doc,
        expectedRevision: draft.revision,
        userId: draft.updatedBy,
        origin: 'script',
        note: 'menos texto e nada de escrita obrigatória (escolhas guiadas, voz opcional, anotação opcional) + aula "No dia: chegar bem e com calma"',
      });
      revision = saved.revision;
      console.log(`[simples] gravado: revisão ${draft.revision} → ${revision}`);
    }

    if (PUBLISH) {
      const [course] = await db.select().from(s.courses).where(eq(s.courses.id, COURSE_ID)).limit(1);
      const [latest] = await db.select().from(s.courseVersions).where(and(eq(s.courseVersions.courseId, COURSE_ID), eq(s.courseVersions.versionNumber, course!.latestVersionNumber))).limit(1);
      if (latest && latest.sourceRevision === revision) console.log(`[simples] versão ${latest.versionNumber} já publicada desta revisão`);
      else {
        const pub = await publishCourse(db, { courseId: COURSE_ID, userId: draft.updatedBy, expectedRevision: revision });
        console.log(`[simples] publicado: versão ${pub.versionNumber} (${pub.versionId}), ${pub.warnings.length} avisos`);
      }
    }

    if (MOVE_ENROLLMENTS) {
      const [course] = await db.select().from(s.courses).where(eq(s.courses.id, COURSE_ID)).limit(1);
      const [latest] = await db.select().from(s.courseVersions).where(and(eq(s.courseVersions.courseId, COURSE_ID), eq(s.courseVersions.versionNumber, course!.latestVersionNumber))).limit(1);
      if (!latest) throw new Error('curso sem versão publicada');
      const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, DEMO_LEARNERS));
      if (users.length) {
        const moved = await db
          .update(s.enrollments)
          .set({ courseVersionId: latest.id })
          .where(and(eq(s.enrollments.courseId, COURSE_ID), inArray(s.enrollments.userId, users.map((u) => u.id))))
          .returning({ id: s.enrollments.id, userId: s.enrollments.userId });
        for (const m of moved) console.log(`[simples] matrícula ${m.id} (${users.find((u) => u.id === m.userId)?.email}) → versão ${latest.versionNumber}`);
      }
    }
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('pode-entrar-simples.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

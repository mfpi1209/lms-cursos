/**
 * "Pode entrar" pelo olhar do estagiário (19 anos, tímido, primeiro estágio):
 * aplica ao RASCUNHO dos cursos "Pode entrar" (crs_7vbrb49jkq23ibiw) e "Pode
 * entrar Light" (crs_vcbnqk4vgfcyp95v) o conteúdo novo dos exemplos, nó a nó:
 *  - "3 pontos" definidos (apresentação, um exemplo real e uma pergunta);
 *  - composição guiada "Monte sua apresentação" (por perfil) e "Monte seu
 *    exemplo"; o roteiro prefere a frase montada;
 *  - opções reescritas em primeira pessoa, sem a melhor "entregue" pelo formato,
 *    e segunda tentativa com a melhor opção dita de outro jeito;
 *  - `quality` nas opções e "Resultado da simulação" com a revisão das respostas;
 *  - resumo para o aluno (`learnerSummary`) e frase própria de cada curso
 *    (`branding.tagline`).
 *
 * PRESERVA o que só existe no rascunho (produção):
 *  - documento: `presentation` (câmeras `cam_principal` e `cam_sentada`, fundo,
 *    posição), `branding` (exceto `tagline`), `sourceIds` e chaves que o exemplo
 *    não tem;
 *  - nós que continuam: `media` e `direction`; e `narration`/`motionPrompt` que
 *    o rascunho tem e o exemplo não (ex.: o vídeo sentado da `s01_perfil_combina`,
 *    asset ast_5x2dbwpqvtne8qp7). A mídia só fica desatualizada se a FALA mudou;
 *  - layout: posições do editor dos nós que continuam;
 *  - variável de curso `perfil` (o exemplo já a declara `scope: 'course'`; o
 *    script confere).
 *
 * Compila (0 erros), grava com `authoring.saveDraft` (nova revisão) e, com
 * `--publish`, publica uma versão nova. Com `--move-demo-enrollments`, as
 * matrículas de aluno@demo.local e aluna@demo.local passam para a versão nova e
 * tentativas abertas cuja cena atual não existe mais viram `abandoned`.
 * Idempotente: sem mudanças, não grava; versão já publicada da revisão, não publica.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/pode-entrar-estagiario.ts [--dry-run] [--publish] [--move-demo-enrollments] [--only=pode-entrar|light]
 */
import { and, eq, inArray } from 'drizzle-orm';
import {
  allLessons,
  compileCourse,
  courseLengthReport,
  podeEntrar,
  podeEntrarLight,
  PODE_ENTRAR_LIGHT_TAGLINE,
  PODE_ENTRAR_TAGLINE,
  type AnyNode,
  type CourseDocument,
} from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import { getDraft, saveDraft } from '../repositories/authoring';
import { publishCourse } from '../repositories/publishing';

const TARGETS = [
  { key: 'pode-entrar', courseId: process.env.COURSE_ID ?? 'crs_7vbrb49jkq23ibiw', example: podeEntrar, tagline: PODE_ENTRAR_TAGLINE },
  { key: 'light', courseId: process.env.LIGHT_COURSE_ID ?? 'crs_vcbnqk4vgfcyp95v', example: podeEntrarLight, tagline: PODE_ENTRAR_LIGHT_TAGLINE },
] as const;
const DEMO_LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];
const DRY_RUN = process.argv.includes('--dry-run');
const PUBLISH = process.argv.includes('--publish');
const MOVE_ENROLLMENTS = process.argv.includes('--move-demo-enrollments');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

/** Campos de produção do nó: ficam como no rascunho. */
const PRESERVED_NODE_FIELDS = ['media', 'direction'] as const;
/** Campos do roteiro que o rascunho pode ter ganhado depois (ex.: fala gravada da S01): ficam se o exemplo não os define. */
const KEEP_IF_MISSING = ['narration', 'motionPrompt'] as const;

const json = (v: unknown) => JSON.stringify(v ?? null);

export function transform(draft: CourseDocument, target: CourseDocument, tagline: string): { doc: CourseDocument; changes: string[] } {
  const doc = structuredClone(target) as CourseDocument & Record<string, unknown>;
  const changes: string[] = [];
  for (const [k, v] of Object.entries(draft as unknown as Record<string, unknown>)) {
    if (k === 'branding' || k === 'presentation' || k === 'sourceIds' || !(k in doc)) doc[k] = structuredClone(v);
  }
  // frase própria de cada curso (lista "Meus cursos" e rodapé do player)
  if (doc.branding.tagline !== tagline) {
    changes.push(`branding.tagline: "${draft.branding.tagline ?? ''}" → "${tagline}"`);
    doc.branding = { ...doc.branding, tagline };
  }

  const draftLessons = new Map(allLessons(draft).map((l) => [l.id, l]));
  const draftNodes = new Map(allLessons(draft).flatMap((l) => l.graph.nodes.map((n) => [n.id, n] as const)));
  const newNodeIds = new Set<string>();
  for (const lesson of allLessons(doc)) {
    const before = draftLessons.get(lesson.id);
    if (!before) changes.push(`${lesson.id}: aula nova "${lesson.title}"`);
    for (const node of lesson.graph.nodes) {
      newNodeIds.add(node.id);
      const old = draftNodes.get(node.id);
      if (!old) {
        changes.push(`${lesson.id}/${node.id}: novo (${node.type}${node.type === 'reflection' && node.scaffold ? ', composição guiada' : ''})`);
        continue;
      }
      const t = node as AnyNode & Record<string, unknown>;
      const prev = old as AnyNode & Record<string, unknown>;
      if (prev.type === t.type) {
        for (const f of KEEP_IF_MISSING) if (prev[f] !== undefined && t[f] === undefined) t[f] = structuredClone(prev[f]);
        for (const f of PRESERVED_NODE_FIELDS) if (prev[f] !== undefined && t[f] === undefined) t[f] = structuredClone(prev[f]);
      }
      if (t.media && json(prev.narration) !== json(t.narration)) {
        (t.media as { stale?: boolean }).stale = true;
        changes.push(`${lesson.id}/${node.id}: fala mudou → vídeo marcado como desatualizado`);
      }
      const diff = Object.keys({ ...prev, ...t }).filter((k) => json(prev[k]) !== json(t[k]));
      if (prev.type !== t.type) changes.push(`${lesson.id}/${node.id}: ${prev.type} → ${t.type}`);
      else if (diff.length) changes.push(`${lesson.id}/${node.id}: ${diff.join(', ')}`);
    }
    const oldPositions = before?.graph.layout?.positions ?? {};
    const positions = lesson.graph.layout?.positions ?? {};
    for (const id of Object.keys(positions)) if (oldPositions[id]) positions[id] = oldPositions[id]!;
    if (before && json(before.graph.edges) !== json(lesson.graph.edges)) changes.push(`${lesson.id}: arestas (${before.graph.edges.length} → ${lesson.graph.edges.length})`);
    if (before && json(before.graph.variables) !== json(lesson.graph.variables)) changes.push(`${lesson.id}: variáveis`);
  }
  for (const [id, n] of draftNodes) if (!newNodeIds.has(id)) changes.push(`removido ${id} (${n.type})`);
  for (const k of ['title', 'description', 'learnerSummary', 'brief', 'objectives', 'completion', 'cast'] as const) {
    if (json(draft[k]) !== json(doc[k])) changes.push(`documento: ${k}`);
  }
  return { doc, changes };
}

/** Confere o que precisa sobreviver (produção) antes de gravar. */
function assertPreserved(key: string, draft: CourseDocument, doc: CourseDocument) {
  const nodes = new Map(allLessons(doc).flatMap((l) => l.graph.nodes.map((n) => [n.id, n as AnyNode & Record<string, unknown>] as const)));
  const prevNodes = new Map(allLessons(draft).flatMap((l) => l.graph.nodes.map((n) => [n.id, n as AnyNode & Record<string, unknown>] as const)));
  if (json(doc.presentation) !== json(draft.presentation)) throw new Error(`${key}: presentation mudou`);
  for (const [id, prev] of prevNodes) {
    const now = nodes.get(id);
    if (!now) continue;
    for (const f of ['media', 'direction'] as const) {
      if (prev[f] === undefined) continue;
      const a = { ...(prev[f] as object), stale: undefined };
      const b = { ...(now[f] as object), stale: undefined };
      if (json(a) !== json(b)) throw new Error(`${key}: ${id}.${f} não foi preservado`);
      if (f === 'media' && json(prev.narration) === json(now.narration) && (now.media as { stale?: boolean }).stale) throw new Error(`${key}: ${id} ficou desatualizado sem mudar a fala`);
    }
  }
  for (const l of allLessons(doc)) for (const v of l.graph.variables) if (v.name === 'perfil' && v.scope !== 'course') throw new Error(`${key}: perfil sem scope course em ${l.id}`);
}

async function latestVersion(db: Database, courseId: string) {
  const [course] = await db.select().from(s.courses).where(eq(s.courses.id, courseId)).limit(1);
  const [latest] = await db.select().from(s.courseVersions).where(and(eq(s.courseVersions.courseId, courseId), eq(s.courseVersions.versionNumber, course!.latestVersionNumber))).limit(1);
  return latest;
}

async function run(db: Database, t: (typeof TARGETS)[number]) {
  const tag = `[estagiario:${t.key}]`;
  const draft = await getDraft(db, t.courseId);
  if (!draft) throw new Error(`Rascunho de ${t.courseId} não encontrado`);
  console.log(`${tag} ${t.courseId}: rascunho na revisão ${draft.revision}`);
  const { doc, changes } = transform(draft.document, t.example, t.tagline);
  for (const c of changes) console.log(`${tag} ${c}`);
  assertPreserved(t.key, draft.document, doc);

  const before = courseLengthReport(draft.document);
  const after = courseLengthReport(doc);
  console.log(`${tag} palavras na tela: ${before.totals.screenWords} → ${after.totals.screenWords}; fala: ${before.totals.spokenWords} → ${after.totals.spokenWords}; minutos estimados: ${before.totals.estMinutes} → ${after.totals.estMinutes}; cenas: ${before.totals.scenes} → ${after.totals.scenes}`);

  const compiled = compileCourse(doc);
  for (const e of compiled.errors) console.error(`${tag} erro ${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`);
  console.log(`${tag} compilação: ${compiled.errors.length} erros, ${compiled.warnings.length} avisos (${[...new Set(compiled.warnings.map((w) => w.code))].join(', ') || '—'})`);
  if (!compiled.ok) throw new Error('documento não compila; nada gravado');
  if (DRY_RUN) {
    console.log(`${tag} --dry-run: nada gravado`);
    return;
  }

  let revision = draft.revision;
  if (changes.length === 0) console.log(`${tag} rascunho já atualizado`);
  else {
    const saved = await saveDraft(db, {
      courseId: t.courseId,
      document: doc,
      expectedRevision: draft.revision,
      userId: draft.updatedBy,
      origin: 'script',
      note: 'olhar do estagiário: fala sem vídeo, "Monte sua frase", opções difíceis de adivinhar, resultado da simulação, textos para o aluno',
    });
    revision = saved.revision;
    console.log(`${tag} gravado: revisão ${draft.revision} → ${revision}`);
  }

  if (PUBLISH) {
    const latest = await latestVersion(db, t.courseId);
    if (latest && latest.sourceRevision === revision) console.log(`${tag} versão ${latest.versionNumber} já publicada desta revisão`);
    else {
      const pub = await publishCourse(db, { courseId: t.courseId, userId: draft.updatedBy, expectedRevision: revision });
      console.log(`${tag} publicado: versão ${pub.versionNumber} (${pub.versionId}), ${pub.warnings.length} avisos`);
    }
  }

  if (MOVE_ENROLLMENTS) {
    const latest = await latestVersion(db, t.courseId);
    if (!latest) throw new Error('curso sem versão publicada');
    const nodeIds = new Map(allLessons(latest.document as CourseDocument).map((l) => [l.id, new Set(l.graph.nodes.map((n) => n.id))]));
    const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, DEMO_LEARNERS));
    if (!users.length) return;
    const moved = await db
      .update(s.enrollments)
      .set({ courseVersionId: latest.id })
      .where(and(eq(s.enrollments.courseId, t.courseId), inArray(s.enrollments.userId, users.map((u) => u.id))))
      .returning({ id: s.enrollments.id, userId: s.enrollments.userId });
    for (const m of moved) {
      console.log(`${tag} matrícula ${m.id} (${users.find((u) => u.id === m.userId)?.email}) → versão ${latest.versionNumber}`);
      const open = await db.select().from(s.lessonAttempts).where(and(eq(s.lessonAttempts.enrollmentId, m.id), eq(s.lessonAttempts.status, 'in_progress')));
      for (const a of open) {
        const ok = nodeIds.get(a.lessonId)?.has(a.state.currentNodeId) ?? false;
        if (ok) continue;
        await db.update(s.lessonAttempts).set({ status: 'abandoned', updatedAt: new Date() }).where(eq(s.lessonAttempts.id, a.id));
        console.log(`${tag}   tentativa ${a.id} (${a.lessonId}) na cena "${a.state.currentNodeId}", que não existe mais → abandonada`);
      }
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    for (const t of TARGETS) if (!ONLY || ONLY === t.key) await run(db, t);
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('pode-entrar-estagiario.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

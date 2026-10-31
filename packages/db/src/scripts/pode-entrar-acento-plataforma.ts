/**
 * Remove o acento próprio (verde-limão) dos cursos "Pode entrar" e "Pode entrar Light":
 * o player passa a herdar o acento da plataforma (preset DNA Work). Publica uma versão
 * nova e move as matrículas de demonstração. Idempotente.
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/pode-entrar-acento-plataforma.ts
 */
import { and, eq, inArray } from 'drizzle-orm';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft, saveDraft } from '../repositories/authoring';
import { publishCourse } from '../repositories/publishing';

const COURSES = ['crs_7vbrb49jkq23ibiw', 'crs_vcbnqk4vgfcyp95v'];
const DEMO_LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const courseId of COURSES) {
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`rascunho ${courseId} não encontrado`);
      const doc = structuredClone(draft.document) as any;
      let revision = draft.revision;
      if (doc.branding?.accent) {
        delete doc.branding.accent;
        const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'acento do curso removido: herda a marca da plataforma (DNA Work)' });
        revision = r.revision;
        console.log(`[acento] ${courseId}: revisão ${draft.revision} → ${revision}`);
      } else console.log(`[acento] ${courseId}: já sem acento próprio`);
      const [course] = await db.select().from(s.courses).where(eq(s.courses.id, courseId)).limit(1);
      const [latest] = await db.select().from(s.courseVersions).where(and(eq(s.courseVersions.courseId, courseId), eq(s.courseVersions.versionNumber, course!.latestVersionNumber))).limit(1);
      let versionId = latest?.id;
      if (latest && latest.sourceRevision === revision) console.log(`[acento] ${courseId}: versão ${latest.versionNumber} já publicada desta revisão`);
      else {
        const pub = await publishCourse(db, { courseId, userId: draft.updatedBy, expectedRevision: revision });
        versionId = pub.versionId;
        console.log(`[acento] ${courseId}: publicado v${pub.versionNumber}`);
      }
      const users = await db.select({ id: s.user.id }).from(s.user).where(inArray(s.user.email, DEMO_LEARNERS));
      const moved = await db.update(s.enrollments).set({ courseVersionId: versionId! }).where(and(eq(s.enrollments.courseId, courseId), inArray(s.enrollments.userId, users.map((u) => u.id)))).returning({ id: s.enrollments.id });
      console.log(`[acento] ${courseId}: ${moved.length} matrículas de demonstração movidas`);
    }
  } finally { await close(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

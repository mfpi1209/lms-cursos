/**
 * Insere o curso "Pode entrar Light: sua primeira entrevista em 10 minutos" como
 * um curso NOVO no workspace do "Pode entrar" (crs_7vbrb49jkq23ibiw), sem mexer
 * nele. Do rascunho do "Pode entrar" vêm:
 *  - `branding` (com o subtítulo "Versão rápida") e `presentation` (fundo,
 *    posição e escala da apresentadora);
 *  - o vídeo + legendas da `q03_primeiro_emprego`, ligados à cena "Fale sobre
 *    você" SÓ se a fala for idêntica (assets do mesmo workspace; nada é gerado).
 * Compila (0 erros), publica a versão 1 e matricula aluno@demo.local e
 * aluna@demo.local. Idempotente: curso existente com o mesmo título é reusado;
 * publica só se ainda não houver versão; matrícula existente fica como está.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/insert-pode-entrar-light.ts [--dry-run]
 */
import { and, eq, inArray } from 'drizzle-orm';
import {
  CourseDocumentSchema,
  compileCourse,
  courseLengthReport,
  podeEntrarLight,
  PODE_ENTRAR_LIGHT_TITLE,
  PODE_ENTRAR_LIGHT_VIDEO_NODE_ID,
  type AnyNode,
  type CourseDocument,
  type MediaRef,
} from '@lms/course-schema';
import { createDb } from '../client';
import * as s from '../schema';
import { createCourse, getDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';

const SOURCE_COURSE_ID = process.env.SOURCE_COURSE_ID ?? 'crs_7vbrb49jkq23ibiw';
const SOURCE_VIDEO_NODE_ID = 'q03_primeiro_emprego';
const LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];
const DRY_RUN = process.argv.includes('--dry-run');

/** Monta o documento: exemplo + marca/apresentação do "Pode entrar" + vídeo da Q03 (se a fala bater). */
export function buildLightDocument(source: CourseDocument, validAssetIds: ReadonlySet<string>): { document: CourseDocument; media: string } {
  const doc = structuredClone(podeEntrarLight);
  doc.branding = { ...source.branding, subtitle: 'Versão rápida' };
  doc.presentation = structuredClone(source.presentation);
  const q03 = source.modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes)).find((n) => n.id === SOURCE_VIDEO_NODE_ID) as (AnyNode & { narration?: string; media?: MediaRef }) | undefined;
  const target = doc.modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes)).find((n) => n.id === PODE_ENTRAR_LIGHT_VIDEO_NODE_ID) as AnyNode & { narration?: string; media?: MediaRef };
  let media = 'sem vídeo';
  if (!q03?.media || q03.media.kind !== 'video') media = 'sem vídeo: a Q03 do "Pode entrar" não tem vídeo';
  else if (q03.narration !== target.narration) media = 'sem vídeo: a fala da Q03 mudou (o vídeo ficaria desatualizado)';
  else if (!validAssetIds.has(q03.media.assetId) || (q03.media.captions && !validAssetIds.has(q03.media.captions.assetId))) media = 'sem vídeo: asset fora do workspace';
  else {
    target.media = { ...structuredClone(q03.media), stale: false };
    media = `vídeo ${q03.media.assetId}${q03.media.captions ? ` + legendas ${q03.media.captions.assetId}` : ''} (da ${SOURCE_VIDEO_NODE_ID})`;
  }
  return { document: CourseDocumentSchema.parse(doc), media };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    const [source] = await db.select().from(s.courses).where(eq(s.courses.id, SOURCE_COURSE_ID)).limit(1);
    if (!source) throw new Error(`Curso de origem ${SOURCE_COURSE_ID} não encontrado`);
    const draft = await getDraft(db, SOURCE_COURSE_ID);
    if (!draft) throw new Error(`Rascunho de ${SOURCE_COURSE_ID} não encontrado`);
    const assets = await db.select({ id: s.assets.id }).from(s.assets).where(eq(s.assets.workspaceId, source.workspaceId));
    const { document, media } = buildLightDocument(draft.document, new Set(assets.map((a) => a.id)));

    const compiled = compileCourse(document);
    for (const e of compiled.errors) console.error(`[light] erro ${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`);
    const length = courseLengthReport(document);
    console.log(`[light] compilação: ${compiled.errors.length} erros, ${compiled.warnings.length} avisos (${[...new Set(compiled.warnings.map((w) => w.code))].join(', ') || '—'})`);
    console.log(`[light] ${length.lessons.length} aulas, ${length.totals.decisions} decisões, ${length.totals.screenWords} palavras na tela, ~${length.totals.estMinutes} min; ${media}`);
    if (!compiled.ok) throw new Error('documento não compila; nada gravado');
    if (DRY_RUN) {
      console.log('[light] --dry-run: nada gravado');
      return;
    }

    const [existing] = await db.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.workspaceId, source.workspaceId), eq(s.courses.title, PODE_ENTRAR_LIGHT_TITLE))).limit(1);
    const courseId = existing?.id ?? (await createCourse(db, { workspaceId: source.workspaceId, title: document.title, createdBy: source.createdBy, document })).id;
    console.log(`[light] curso ${existing ? 'já existia' : 'criado'}: ${courseId} (workspace ${source.workspaceId})`);

    let version = await getLatestVersion(db, courseId);
    if (!version) {
      const pub = await publishCourse(db, { courseId, userId: source.createdBy });
      console.log(`[light] publicado: versão ${pub.versionNumber} (${pub.versionId}), ${pub.warnings.length} avisos`);
      version = await getLatestVersion(db, courseId);
    } else console.log(`[light] já publicado: versão ${version.versionNumber}`);

    const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, [...LEARNERS, 'admin@demo.local']));
    const admin = users.find((u) => u.email === 'admin@demo.local')?.id ?? source.createdBy;
    for (const email of LEARNERS) {
      const u = users.find((x) => x.email === email);
      if (!u) {
        console.log(`[light] ${email} não existe; sem matrícula`);
        continue;
      }
      const { enrollment, created } = await enrollStudent(db, { courseId, userId: u.id, createdBy: admin });
      console.log(`[light] matrícula ${enrollment.id} (${email}) ${created ? 'criada' : 'já existia'} → versão ${version!.versionNumber}`);
    }
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('insert-pode-entrar-light.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

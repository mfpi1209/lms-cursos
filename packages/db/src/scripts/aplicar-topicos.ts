/**
 * Aplica os TÓPICOS DO PAINEL (`docs/roteiros/telas/<roteiro>.topicos.md`, ver `parseSceneTopicsMarkdown` em
 * @lms/course-schema) num rascunho que já existe, SEM reimportar o roteiro: cada seção `## V07` vira o campo
 * `topics` do nó da cena (o id do nó é o código em minúsculas: `V07` → `v07`; vale em todas as aulas que tiverem
 * esse id). Grava com `saveDraft` (nova revisão, `origin: 'script'`) só se algo mudou; nada é gerado nem pago, e o
 * clipe do HeyGen continua o mesmo (só a montagem muda).
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/aplicar-topicos.ts \
 *     --course crs_… --file docs/roteiros/telas/c1-ia-na-pratica.topicos.md [--seco]
 *
 * `--seco`: só mostra o relatório (cenas atualizadas / sem mudança / não encontradas), sem gravar.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { parseSceneTopicsMarkdown, type CourseDocument, type SceneTopic, type SceneTopicsIssue } from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import { getDraft, saveDraft } from '../repositories/authoring';
import { stableJson } from './import-markdown-course';

export interface TopicsArgs {
  course: string;
  file: string;
  seco: boolean;
}

export function parseTopicsArgs(argv: readonly string[]): TopicsArgs {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const eqAt = a.indexOf('=');
    if (eqAt > 0) {
      flags.set(a.slice(2, eqAt), a.slice(eqAt + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  }
  const str = (k: string) => {
    const v = flags.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const course = str('course');
  const file = str('file');
  if (!course) throw new Error('informe --course <id do curso>');
  if (!file) throw new Error('informe --file <roteiro.topicos.md>');
  return { course, file, seco: flags.has('seco') };
}

export interface TopicsReport {
  document: CourseDocument;
  /** cenas que ganharam/trocaram os tópicos (código, aula) */
  updated: Array<{ code: string; lessonId: string; topics: number }>;
  /** cenas que já tinham exatamente estes tópicos */
  unchanged: Array<{ code: string; lessonId: string }>;
  /** códigos do arquivo sem nó de cena (scenario/content) com esse id no curso */
  notFound: string[];
  /** cena de gravação de tela própria (sem avatar): o painel não se aplica */
  skipped: Array<{ code: string; lessonId: string; why: string }>;
}

/**
 * Parte pura: aplica os tópicos ao documento (cópia). O código da cena `V07` corresponde ao id do nó `v07`
 * (a importação grava `code.toLowerCase()`); só nós `scenario`/`content`.
 */
export function applyTopicsToDocument(doc: CourseDocument, topics: ReadonlyMap<string, readonly SceneTopic[]>): TopicsReport {
  const document = structuredClone(doc);
  const updated: TopicsReport['updated'] = [];
  const unchanged: TopicsReport['unchanged'] = [];
  const skipped: TopicsReport['skipped'] = [];
  const hit = new Set<string>();
  for (const m of document.modules) {
    for (const l of m.lessons) {
      for (const n of l.graph.nodes) {
        const code = [...topics.keys()].find((c) => c.toLowerCase() === n.id.toLowerCase());
        if (!code || (n.type !== 'scenario' && n.type !== 'content')) continue;
        hit.add(code);
        const node = n as typeof n & { topics?: SceneTopic[]; screenRecordings?: unknown[] };
        if (node.screenRecordings?.length) {
          skipped.push({ code, lessonId: l.id, why: 'cena com gravação de tela (tela cheia, sem avatar): sem painel' });
          continue;
        }
        const next = topics.get(code)!.map((t) => ({ text: t.text, ...(t.cue ? { cue: t.cue } : {}) }));
        if (stableJson(node.topics ?? null) === stableJson(next)) {
          unchanged.push({ code, lessonId: l.id });
          continue;
        }
        node.topics = next;
        updated.push({ code, lessonId: l.id, topics: next.length });
      }
    }
  }
  const notFound = [...topics.keys()].filter((c) => !hit.has(c));
  return { document, updated, unchanged, notFound, skipped };
}

export async function run(db: Database, args: TopicsArgs, read: (f: string) => string = (f) => readFileSync(f, 'utf8')) {
  const tag = '[aplicar-topicos]';
  const parsed = parseSceneTopicsMarkdown(read(args.file));
  for (const i of parsed.issues) printIssue(tag, i);
  if (!parsed.topics.size) throw new Error('o arquivo não tem nenhuma cena com tópicos; nada a aplicar');
  const [course] = await db.select({ id: s.courses.id, createdBy: s.courses.createdBy }).from(s.courses).where(eq(s.courses.id, args.course)).limit(1);
  if (!course) throw new Error(`curso ${args.course} não encontrado`);
  const draft = await getDraft(db, args.course);
  if (!draft) throw new Error(`rascunho de ${args.course} não encontrado`);
  const report = applyTopicsToDocument(draft.document, parsed.topics);
  console.log(`${tag} ${path.basename(args.file)}: ${parsed.topics.size} cena(s) no arquivo`);
  for (const u of report.updated) console.log(`${tag}   atualizada ${u.code} (${u.lessonId}): ${u.topics} tópico(s)`);
  for (const u of report.unchanged) console.log(`${tag}   sem mudança ${u.code} (${u.lessonId})`);
  for (const k of report.skipped) console.log(`${tag}   ignorada ${k.code} (${k.lessonId}): ${k.why}`);
  for (const c of report.notFound) console.log(`${tag}   NÃO ENCONTRADA ${c}: nenhum nó de cena com id "${c.toLowerCase()}" no curso`);
  console.log(`${tag} resumo: ${report.updated.length} atualizada(s), ${report.unchanged.length} sem mudança, ${report.skipped.length} ignorada(s), ${report.notFound.length} não encontrada(s)`);
  if (!report.updated.length) {
    console.log(`${tag} nada a gravar`);
    return { ...report, revision: draft.revision, saved: false };
  }
  if (args.seco) {
    console.log(`${tag} --seco: nada gravado`);
    return { ...report, revision: draft.revision, saved: false };
  }
  const saved = await saveDraft(db, { courseId: args.course, document: report.document, expectedRevision: draft.revision, userId: draft.updatedBy ?? course.createdBy, origin: 'script', note: `Tópicos do painel de ${path.basename(args.file)}` });
  console.log(`${tag} curso ${args.course}: revisão ${draft.revision} → ${saved.revision}`);
  return { ...report, revision: saved.revision, saved: true };
}

function printIssue(tag: string, i: SceneTopicsIssue) {
  console.log(`${tag} aviso ${i.code} (linha ${i.line}): ${i.message}`);
}

async function main() {
  const args = parseTopicsArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    await run(db, args);
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

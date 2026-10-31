/**
 * Liga o bloco de escolha ao vídeo (grátis, só texto): a pergunta do bloco passa a ser a MESMA do
 * cartão "Pergunta a seguir" e da chamada da instrutora. O último parágrafo do enunciado (a reformulação
 * genérica com "?") vira a pergunta nova; a situação continua acima. O título acompanha.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/perguntas-ligadas.ts <perguntas.json> <cartoes.json>
 *   perguntas.json: [{c, l, q}] na ordem; cartoes.json: {"<índice>": [fato, pergunta]}
 */
import { readFileSync } from 'node:fs';
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';

type Para = { type: string; content?: Array<{ type: string; text?: string }> };
const plain = (p: Para) => (p.content ?? []).map((t) => t.text ?? '').join('').trim();

async function main() {
  const [qFile, cFile] = process.argv.slice(2);
  const rows = JSON.parse(readFileSync(qFile!, 'utf8')) as Array<{ c: string; l: string; q: string }>;
  const cards = JSON.parse(readFileSync(cFile!, 'utf8')) as Record<string, [string, string]>;
  const byCourse = new Map<string, Array<{ l: string; q: string; question: string }>>();
  rows.forEach((r, i) => {
    const card = cards[String(i)];
    if (!card) return;
    byCourse.set(r.c, [...(byCourse.get(r.c) ?? []), { l: r.l, q: r.q, question: card[1] }]);
  });
  const db = getDb();
  for (const [courseId, items] of byCourse) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const d = (await authoring.getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      let k = 0;
      for (const it of items) {
        const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === it.l);
        const node = lesson?.graph.nodes.find((n) => n.id === it.q) as unknown as { title?: string; prompt: { content: Para[] } } | undefined;
        if (!node?.prompt?.content?.length) continue;
        const paras = node.prompt.content;
        const last = paras[paras.length - 1]!;
        if (plain(last) === it.question) continue;
        // a reformulação genérica no fim ("Você terminou a lista. Como entrega?") sai; só quando há situação acima
        const body = paras.length > 1 && /\?["”]?$/.test(plain(last)) ? paras.slice(0, -1) : paras;
        node.prompt = { ...node.prompt, content: [...body, { type: 'paragraph', content: [{ type: 'text', text: it.question }] }] };
        node.title = it.question;
        k++;
      }
      if (!k) { console.log(`[ligar] ${courseId}: nada a mudar`); break; }
      try {
        const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `perguntas ligadas ao vídeo (${k})` });
        console.log(`[ligar] ${courseId}: ${k} perguntas; rascunho ${d.revision} → ${saved.revision}`);
        break;
      } catch (e) {
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[ligar] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

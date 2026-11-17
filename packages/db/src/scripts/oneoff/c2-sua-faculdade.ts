/**
 * C2 sem co-branding: toda menção a "Cruzeiro do Sul" no rascunho vira "sua faculdade" (ou forma equivalente).
 * Só toca strings que contêm "Cruzeiro"; o resto do documento fica intacto (hash das cenas preservado). Sem custo.
 *   tsx …/c2-sua-faculdade.ts <curso> [--listar] [--gravar]
 *   tsx …/c2-sua-faculdade.ts <curso> --desatualizar [--gravar]   # 2º passo: marca media.stale nas cenas cuja fala mudou
 *     (o saveDraft de script não marca; é o `stale` que faz o orçamento incluir a cena; media.adjust fica intacto)
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

// Ordem importa: formas mais longas primeiro.
// Exportadas para o mesmo texto ser aplicado aos .md de origem.
export const RULES: Array<[RegExp, string]> = [
  // Sobre da Bia (3ª pessoa): sem a instituição; ela estuda a distância.
  [/estudante de Administração na Cruzeiro do Sul/g, 'estudante de Administração a distância'],
  // Exemplo de descrição digitado no perfil da Bia: sem a instituição.
  [/Cursando Administração na Cruzeiro do Sul, modalidade/g, 'Cursando Administração, modalidade'],
  // Exemplo de título (fala, quiz e cue): modelo para o aluno preencher.
  [/Administração na Cruzeiro do Sul/g, 'Administração na sua faculdade'],
  [/começo a digitar Cruzeiro do Sul/g, 'começo a digitar o nome completo da faculdade'],
  [/na Cruzeiro do Sul para/g, 'na faculdade para'],
  [/Página da Cruzeiro\b/g, 'Página da faculdade'],
  [/da Cruzeiro do Sul/g, 'da sua faculdade'],
  [/a Cruzeiro do Sul e/g, 'a sua faculdade e'],
  [/(oficial) da Cruzeiro\b/g, '$1 da sua faculdade'],
];

function walk(v: unknown, path: string, out: Array<{ path: string; get: () => string; set: (s: string) => void }>, parent?: Record<string, unknown> | unknown[], key?: string | number) {
  if (typeof v === 'string') {
    if (v.includes('Cruzeiro') && parent !== undefined && key !== undefined) {
      const p = parent as Record<string | number, unknown>;
      out.push({ path, get: () => p[key] as string, set: (s) => { p[key] = s; } });
    }
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, out, v, i)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out, v as Record<string, unknown>, k);
}

async function main() {
  if (!process.argv[2] || process.argv[2].startsWith('--')) return;
  const [courseId] = process.argv.slice(2);
  const confirm = process.argv.includes('--gravar');
  const listar = process.argv.includes('--listar');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId!))!;
    const doc = structuredClone(draft.document) as unknown;
    if (process.argv.includes('--desatualizar')) {
      const NOVOS = [/sua faculdade/, /estudante de Administração a distância/, /Cursando Administração, modalidade/, /nome completo da faculdade/];
      const d = doc as { modules: Array<{ lessons: Array<{ id: string; graph: { nodes: Array<{ id: string; narration?: string; media?: { stale?: boolean } }> } }> }> };
      let n = 0;
      for (const m of d.modules) for (const l of m.lessons) for (const nd of l.graph.nodes) {
        if (!nd.narration || !NOVOS.some((re) => re.test(nd.narration!))) continue;
        console.log(`${l.id}/${nd.id} media=${nd.media ? `stale:${nd.media.stale ?? false}` : 'sem'}`);
        if (nd.media && nd.media.stale !== true) { nd.media.stale = true; n++; }
      }
      console.log(`[c2-faculdade] ${n} cena(s) marcadas desatualizadas`);
      if (!confirm || n === 0) { console.log('[c2-faculdade] SECO: nada gravado'); return; }
      const r = await saveDraft(db, { courseId: courseId!, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'C2 sua faculdade: cenas com fala nova desatualizadas' });
      console.log(`[c2-faculdade] revisão ${draft.revision} → ${r.revision}`);
      return;
    }
    const hits: Parameters<typeof walk>[2] = [];
    walk(doc, '$', hits);
    if (listar) { for (const h of hits) console.log(`${h.path}\n  ${h.get()}\n`); console.log(`total ${hits.length}`); return; }
    let changed = 0;
    for (const h of hits) {
      const old = h.get(); let s = old;
      for (const [re, rep] of RULES) s = s.replace(re, rep);
      if (s.includes('Cruzeiro')) { console.log(`!! SEM REGRA ${h.path}: ${old}`); continue; }
      h.set(s); changed++;
      console.log(`${h.path}\n  - ${old}\n  + ${s}\n`);
    }
    console.log(`[c2-faculdade] ${changed}/${hits.length} strings trocadas (revisão ${draft.revision})`);
    if (!confirm || changed === 0) { console.log('[c2-faculdade] SECO: nada gravado'); return; }
    const r = await saveDraft(db, { courseId: courseId!, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'C2 sem co-branding: Cruzeiro do Sul → sua faculdade' });
    console.log(`[c2-faculdade] revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
if (process.argv[1]?.includes('c2-sua-faculdade')) main().catch((e) => { console.error(e); process.exit(1); });

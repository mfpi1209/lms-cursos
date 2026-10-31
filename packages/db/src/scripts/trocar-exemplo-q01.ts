/**
 * Conteúdo (pedido do autor, 2026-10-30): a Q01 do Primeira Vaga deixa o futsal
 * e usa o negócio da família (exemplo que a Marina acabou de mostrar no V01).
 * Só texto (a pergunta não tem vídeo): sem custo, edita o rascunho sem reimportar.
 */
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const COURSE = 'crs_hvvgkvtd1rb2um0l';
const doc = (paras: string[]) => ({ type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE))!;
    const d = structuredClone(draft.document) as any;
    const q = d.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === 'aula_01').graph.nodes.find((n: any) => n.id === 'q01');
    q.prompt = doc(['Você ajuda na lanchonete da sua família aos fins de semana: atende os clientes, anota os pedidos e fecha o caixa.', 'Isso entra no seu currículo?']);
    const opt = (id: string) => q.options.find((o: any) => o.id === id);
    opt('a').label = '“Coloco, sim: mostra atendimento e responsabilidade.”';
    opt('a').feedback = doc(['É uma responsabilidade real. Faça assim: coloque em ‘Experiências’ e diga o que você fazia.']);
    opt('c').label = '“Só coloco se a vaga for numa lanchonete.”';
    opt('c').feedback = doc(['Serve para qualquer vaga, porque mostra atendimento e responsabilidade. Faça assim: destaque a habilidade, não o lugar.']);
    if (/futsal|esporte/i.test(JSON.stringify(q))) throw new Error('ainda sobrou futsal/esporte na Q01');
    const r = await saveDraft(db, { courseId: COURSE, document: d, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Q01: exemplo do negócio da família no lugar do futsal' });
    console.log(`rascunho ${draft.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

/**
 * Correção de conteúdo (pedido do autor, 2026-10-30): a DNA Work é o agente de
 * integração e quem oferece as vagas — o curso não indica outros agentes (CIEE,
 * IEL…). Edita o RASCUNHO do Primeira Vaga (aula 3) sem reimportar: os outros
 * vídeos pagos continuam; o V05 fica desatualizado (a fala mudou) e precisa ser
 * gravado de novo. Sem custo.
 */
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const COURSE = 'crs_hvvgkvtd1rb2um0l';
const doc = (paras: string[]) => ({ type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const LEVOU = 'Use vários caminhos: seu cadastro na DNA Work, Jovem Aprendiz, as empresas e as pessoas.';

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE))!;
    const d = structuredClone(draft.document) as any;
    const lesson = d.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === 'aula_03');
    const node = (id: string) => lesson.graph.nodes.find((n: any) => n.id === id);

    const v05 = node('v05');
    const shots = v05.direction.shots;
    shots.find((s: any) => s.id === 's2').line =
      'Aqui na DNA Work, a gente é agente de integração: você faz o cadastro, e a nossa tecnologia de match liga o seu perfil a vagas de estágio, de primeiro emprego e de Jovem Aprendiz, para quem tem de 14 a 24 anos.';
    shots.find((s: any) => s.id === 's2').slide.bullets = ['**DNA Work**: cadastro e match com vagas', '**Estágio** e **primeiro emprego**', '**Jovem Aprendiz**, de 14 a 24 anos'];
    shots.find((s: any) => s.id === 's3').line = 'Também vale olhar a página ‘trabalhe conosco’ das empresas e o LinkedIn.';
    v05.narration = shots.map((s: any) => s.line).join(' ');
    v05.body = doc(['DNA Work · Jovem Aprendiz · Trabalhe conosco · Pessoas']);

    const a = node('q05').options.find((o: any) => o.id === 'a');
    a.label = '“Me cadastro na DNA Work e aviso conhecidos.”';
    a.feedback = doc(['Você combina dois caminhos que funcionam. Faça assim: faça seu cadastro na DNA Work e conte para três pessoas.']);

    for (const id of ['fim_aula_03', 'fim_aula_03_revisar']) {
      const end = node(id);
      const check = end.recap.find((r: any) => r.id === 'checklist');
      check.items = check.items.map((x: string) => (/agente/i.test(x) ? 'cadastro feito na DNA Work' : x));
      const levou = end.recap.find((r: any) => r.id === 'o_que_levou');
      levou.text = levou.text.replace(/^Use vários caminhos:.*$/m, LEVOU);
      const s = JSON.stringify(end.summary).replace(/Use vários caminhos: agentes de estágio, Jovem Aprendiz, sites e pessoas\./g, LEVOU);
      end.summary = JSON.parse(s);
    }
    // a transcrição do vídeo antigo (media.transcript) ainda cita: o vídeo vai ser trocado; o resto do texto não pode
    const semMidia = JSON.stringify(lesson, (k, v) => (k === 'media' ? undefined : v));
    const left = semMidia.match(/CIEE|IEL|agentes? de est[aá]gio|agentes de integra/gi);
    if (left) throw new Error(`ainda sobrou: ${left.join(', ')}`);
    const r = await saveDraft(db, { courseId: COURSE, document: d, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'DNA Work é o agente de integração: sem CIEE/IEL (aula 3)' });
    console.log(`rascunho ${draft.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

/**
 * Fase 0 da expansão, correções de TEXTO (grátis; rascunho; nenhuma mídia, nenhum provedor). Os cortes de vídeo ficam em
 * `apps/worker/src/scripts/oneoff/fase0-cortes.ts`. Aqui:
 *
 *  A. Instrução "Escreva uma resposta curta…" em prática que é MONTAGEM DE FRASE (reflexão com `scaffold`: o aluno toca em
 *     blocos): vira uma instrução do formato, com redação variada (8 jeitos, sorteio determinístico por posição, vizinhas
 *     diferentes). Acha as práticas no rascunho de C02–C26 (ids em docs/qa/raio-x/raio-x.json): reflexão com `scaffold` cujo
 *     enunciado começa por "Escreva". Só o enunciado (prompt) muda; o título NÃO (ele é falado no anúncio da missão).
 *  B. C22·A1·a01 e C24·A1·a01 (docs/qa/expansao-analise/pedagogia-C19-C26.md + CORRECOES_ADICIONAIS.md do pacote, só esses dois itens):
 *     - C22: contexto fixo do orçamento; "foi digitado" → "eu digitei" no molde (revisão pedagógica: o aluno assumiu o erro na
 *       q01); duas lacunas (impacto, pedido), todas as combinações compatíveis, sem prometer preço nem culpar o jovem.
 *     - C24: caso novo ("30 cópias de um material para amanhã…", sugestão do revisor: o caso do pacote repetia a v02/q01 palavra
 *       por palavra); contexto único, 4 lacunas, opções todas compatíveis com o caso.
 *
 * Cada troca confere o valor esperado ANTES de gravar (se alguém mexeu, lista como divergente e não toca). O diff do documento só
 * pode conter os caminhos previstos; o conjunto de cenas desatualizadas não pode mudar; o rascunho tem de compilar sem erro novo.
 * Em conflito de revisão (os cortes e o estúdio também gravam), relê e tenta de novo. Idempotente.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/fase0-expansao.ts [--dry-run | --apply] [--saida arq.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CourseDocumentSchema, compileCourse, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { argumentos, caminhosDiferentes, cenasStale } from './_rascunho-qa';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Slot = { id: string; label: string; question?: string; options: string[]; allowCustom: boolean; customMaxLength: number };
type Doc = { type?: string; text?: string; content?: Doc[] };
type No = { id: string; type: string; title?: string; prompt?: Doc; scaffold?: { template: string; slots: Slot[] } };

const ANTIGO = 'Escreva uma resposta curta. Pode usar uma situação fictícia. Não inclua nomes, contatos ou informações internas.';
const NUM = ['', 'um', 'dois', 'três', 'quatro', 'cinco'];

/** oito jeitos de dizer "escolha um bloco em cada grupo" (com e sem o "Prefiro escrever", que é o rótulo real do botão do aluno) */
const COM_ESCRITA: Array<(n: number) => string> = [
  () => 'Escolha uma opção em cada grupo e a sua frase vai se formando. Se nenhuma servir, toque em “Prefiro escrever”, sem nomes, contatos ou informações internas.',
  () => 'Monte a frase tocando em um bloco de cada grupo. Quer dizer de outro jeito? Use “Prefiro escrever”, com uma situação fictícia e sem dados pessoais.',
  (n) => `São ${NUM[n]} grupos: escolha um bloco em cada um. Se precisar, “Prefiro escrever” deixa você usar suas próprias palavras, sem informações internas.`,
  () => 'Toque em um bloco por grupo para montar sua frase. Pode ser uma situação fictícia; se for escrever uma parte, não inclua nomes, contatos ou informações internas.',
  () => 'Vá escolhendo, grupo por grupo, as partes da sua frase. Nenhuma combina com você? Toque em “Prefiro escrever” e use palavras suas, sem dados pessoais.',
  () => 'Sua frase fica pronta quando cada grupo tiver uma escolha. Para mudar uma parte, toque em “Prefiro escrever”, sem nomes, contatos ou informações internas.',
  (n) => `Em cada um dos ${NUM[n]} grupos, toque no bloco que mais combina com você. Se preferir, escreva a sua parte em “Prefiro escrever”, com uma situação fictícia.`,
  () => 'Escolha um bloco em cada grupo para montar a frase. Só se quiser, use “Prefiro escrever” para dizer do seu jeito; nada de nomes, contatos ou informações internas.',
];
const SEM_ESCRITA: Array<(n: number) => string> = [
  () => 'Escolha uma opção em cada grupo e a sua frase vai se formando.',
  (n) => `Toque em um bloco de cada um dos ${NUM[n]} grupos para montar a frase.`,
];

/** C22·A1·a01 */
const C22 = {
  codigo: 'C22', aula: 'aula_01', no: 'a01',
  promptDe: ANTIGO,
  promptPara: 'Você digitou R$ 480 no lugar de R$ 840 no orçamento, e o cliente já aceitou. Monte o aviso para a referência responsável, escolhendo uma opção em cada grupo. Você ainda não tem autorização para alterar as condições com o cliente.',
  templateDe: '{fato}. {impacto}. {passo}.',
  templatePara: 'No orçamento, eu digitei R$ 480 no lugar de R$ 840. {impacto}. {pedido}?',
  slotsDe: ['fato', 'impacto', 'passo'],
  slotsPara: [
    { id: 'impacto', label: 'O que isso causa', question: 'O que isso causa?', options: ['O cliente já aceitou e precisamos verificar como tratar a diferença', 'Ainda preciso confirmar o que foi encaminhado após o aceite'], allowCustom: true, customMaxLength: 120 },
    { id: 'pedido', label: 'O que você pede', question: 'O que você pede à referência?', options: ['Pode me orientar sobre como registrar e corrigir a situação', 'Qual é o procedimento para tratar a diferença com quem responde pelo orçamento'], allowCustom: true, customMaxLength: 120 },
  ] as Slot[],
};

/** C24·A1·a01: caso novo sugerido pelo revisor (pedagogia-C19-C26.md, "Correção C24 A1") */
const C24 = {
  codigo: 'C24', aula: 'aula_01', no: 'a01',
  promptDe: ANTIGO,
  promptPara: 'Você recebeu o pedido de tirar 30 cópias de um material para amanhã. Ainda não sabe qual versão usar nem se é frente e verso. Monte seu plano com as informações desse caso, escolhendo uma opção em cada grupo.',
  templateDe: 'Preciso {a}. Sei {b}. Faltam {c}. Vou {d}.',
  templatePara: 'Preciso {a}. Sei {b}. Ainda não sei {c}. Vou {d}.',
  slotsDe: ['a', 'b', 'c', 'd'],
  slotsPara: [
    { id: 'a', label: 'O que você precisa conseguir', question: 'O que você precisa conseguir?', options: ['deixar as 30 cópias prontas para amanhã', 'entregar amanhã as 30 cópias da versão certa do material'], allowCustom: true, customMaxLength: 120 },
    { id: 'b', label: 'O que você já sabe', question: 'O que você já sabe?', options: ['que são 30 cópias e que o prazo é amanhã', 'a quantidade e o prazo do pedido'], allowCustom: true, customMaxLength: 120 },
    { id: 'c', label: 'O que falta descobrir', question: 'O que falta descobrir?', options: ['qual versão do material usar e se é frente e verso', 'qual é a versão certa e como imprimir'], allowCustom: true, customMaxLength: 120 },
    { id: 'd', label: 'Qual é o seu primeiro passo', question: 'Qual é o seu primeiro passo?', options: ['perguntar a quem pediu qual versão usar e se é frente e verso', 'confirmar a versão e o formato antes de imprimir'], allowCustom: true, customMaxLength: 120 },
  ] as Slot[],
};

const textoDe = (p: Doc | undefined): string | null => {
  const par = p?.content ?? [];
  if (par.length !== 1 || par[0]!.type !== 'paragraph') return null;
  const t = par[0]!.content ?? [];
  return t.length === 1 && t[0]!.type === 'text' ? (t[0]!.text ?? '') : null;
};

interface Item { codigo: string; courseId: string; aula: string; no: string; tipo: 'instrucao' | 'c22-a01' | 'c24-a01'; estado: string; antes: Record<string, Json>; depois: Record<string, Json>; revisaoAntes?: number; revisaoDepois?: number }

async function main(): Promise<void> {
  const { apply, saida } = argumentos('docs/qa/expansao-analise/fase0.antes-depois.json');
  const raio = JSON.parse(readFileSync('docs/qa/raio-x/raio-x.json', 'utf8')) as { cursos: Array<{ codigo: string; id: string }> };
  const cursos = raio.cursos.filter((c) => /^C(0[2-9]|1\d|2[0-6])$/.test(c.codigo));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const itens: Item[] = [];
  try {
    // posição global (curso, aula, nó) → qual das variantes
    let pos = 0;
    for (const curso of cursos) {
      for (let tentativa = 1; ; tentativa++) {
        const d = await getDraft(db, curso.id);
        if (!d) throw new Error(`rascunho de ${curso.codigo} não encontrado`);
        const original = d.document as CourseDocument;
        const doc = structuredClone(original) as CourseDocument;
        const errosAntes = compileCourse(original).errors.map((e) => `${e.code}:${e.lessonId ?? ''}:${e.nodeId ?? ''}`).sort();
        const regs: Item[] = [];
        const permitido = new Set<string>();
        let seq = 0;
        doc.modules.forEach((m, mi) => m.lessons.forEach((l, li) => l.graph.nodes.forEach((n0, ni) => {
          const n = n0 as unknown as No;
          if (n.type !== 'reflection' || !n.scaffold) return;
          const base = `modules.${mi}.lessons.${li}.graph.nodes.${ni}`;
          const atual = textoDe(n.prompt);
          const especial = [C22, C24].find((x) => x.codigo === curso.codigo && x.aula === l.id && x.no === n.id);
          const novoPrompt = (): string => {
            const grupos = new Set(n.scaffold!.template.match(/\{[^{}\s]*\}/g) ?? []).size || n.scaffold!.slots.length;
            const livre = n.scaffold!.slots.every((s) => s.allowCustom);
            const lista = livre ? COM_ESCRITA : SEM_ESCRITA;
            return lista[(pos + seq) % lista.length]!(Math.min(5, Math.max(1, grupos)));
          };
          // só entram as práticas de montagem cujo enunciado manda "escrever" (ou que já foram trocadas por este script)
          if (especial) {
            seq++;
            const antes = { prompt: atual ?? '', template: n.scaffold.template, slots: n.scaffold.slots.map((s) => s.id) } as unknown as Record<string, Json>;
            const depois = { prompt: especial.promptPara, template: especial.templatePara, slots: especial.slotsPara.map((s) => s.id) } as unknown as Record<string, Json>;
            const ja = atual === especial.promptPara && n.scaffold.template === especial.templatePara;
            const igual = atual === especial.promptDe && n.scaffold.template === especial.templateDe && JSON.stringify(n.scaffold.slots.map((s) => s.id)) === JSON.stringify(especial.slotsDe);
            const tipo = curso.codigo === 'C22' ? 'c22-a01' : 'c24-a01';
            if (ja) regs.push({ codigo: curso.codigo, courseId: curso.id, aula: l.id, no: n.id, tipo, estado: 'ja-aplicado', antes: depois, depois });
            else if (!igual) regs.push({ codigo: curso.codigo, courseId: curso.id, aula: l.id, no: n.id, tipo, estado: 'divergente', antes: antes, depois });
            else {
              regs.push({ codigo: curso.codigo, courseId: curso.id, aula: l.id, no: n.id, tipo, estado: 'aplicar', antes: { ...antes, scaffoldCompleto: n.scaffold as unknown as Json }, depois: { ...depois, scaffoldCompleto: { template: especial.templatePara, slots: especial.slotsPara } as unknown as Json } });
              n.prompt!.content![0]!.content![0]!.text = especial.promptPara;
              n.scaffold = { template: especial.templatePara, slots: especial.slotsPara.map((s) => ({ ...s })) };
              permitido.add(`${base}.prompt.content.0.content.0.text`);
              for (const p of ['scaffold.template', 'scaffold.slots']) permitido.add(`${base}.${p}`);
              for (let k = 0; k < 6; k++) for (const f of ['id', 'label', 'question', 'options', 'allowCustom', 'customMaxLength']) permitido.add(`${base}.scaffold.slots.${k}.${f}`);
            }
            return;
          }
          if (atual === null || !/^Escreva\b/.test(atual)) return;
          seq++;
          const para = atual === ANTIGO ? novoPrompt() : null;
          if (!para) {
            regs.push({ codigo: curso.codigo, courseId: curso.id, aula: l.id, no: n.id, tipo: 'instrucao', estado: 'divergente', antes: { prompt: atual }, depois: {} });
            return;
          }
          regs.push({ codigo: curso.codigo, courseId: curso.id, aula: l.id, no: n.id, tipo: 'instrucao', estado: 'aplicar', antes: { prompt: atual }, depois: { prompt: para } });
          n.prompt!.content![0]!.content![0]!.text = para;
          permitido.add(`${base}.prompt.content.0.content.0.text`);
        })));
        // já trocadas por este script antes (enunciado no formato certo) ficam como "já aplicado" só se forem de um dos 8 jeitos
        const parsed = CourseDocumentSchema.parse(doc);
        const dif = caminhosDiferentes(original as unknown as Json, parsed as unknown as Json);
        const fora = dif.filter((p) => !permitido.has(p));
        if (fora.length) throw new Error(`${curso.codigo}: o diff tocou caminho(s) fora do previsto (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
        const staleAntes = cenasStale(original);
        const staleDepois = cenasStale(parsed);
        if (JSON.stringify(staleAntes) !== JSON.stringify(staleDepois)) throw new Error(`${curso.codigo}: o conjunto de cenas desatualizadas mudou; nada foi gravado`);
        const errosDepois = compileCourse(parsed).errors.map((e) => `${e.code}:${e.lessonId ?? ''}:${e.nodeId ?? ''}`).sort();
        const novos = errosDepois.filter((e) => !errosAntes.includes(e));
        if (novos.length) throw new Error(`${curso.codigo}: o rascunho passaria a ter erro de compilação (${novos.slice(0, 3).join(', ')}); nada foi gravado`);
        const aplicar = regs.filter((r) => r.estado === 'aplicar');
        if (tentativa === 1) for (const r of regs) console.log(`[fase0-expansao] ${r.codigo}/${r.aula}/${r.no} ${r.tipo}: ${r.estado}${r.estado === 'aplicar' ? ` → "${String(r.depois.prompt)}"` : r.estado === 'divergente' ? ` (hoje: "${String(r.antes.prompt)}")` : ''}`);
        if (!apply || !aplicar.length) { itens.push(...regs.map((r) => ({ ...r, revisaoAntes: d.revision }))); break; }
        try {
          const salvo = await saveDraft(db, { courseId: curso.id, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `Fase 0 da expansão: ${aplicar.length} instrução(ões) de montagem${curso.codigo === 'C22' || curso.codigo === 'C24' ? ' + correção da a01' : ''}` });
          console.log(`[fase0-expansao] ${curso.codigo}: ${aplicar.length} texto(s); rascunho ${d.revision} → ${salvo.revision}`);
          itens.push(...regs.map((r) => ({ ...r, revisaoAntes: d.revision, revisaoDepois: r.estado === 'aplicar' ? salvo.revision : undefined })));
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
            console.log(`[fase0-expansao] ${curso.codigo}: conflito de revisão, relendo (tentativa ${tentativa})`);
            await new Promise((res) => setTimeout(res, 700 * tentativa));
            continue;
          }
          throw e;
        }
      }
      pos += 2;
    }
    const conta = (e: string) => itens.filter((i) => i.estado === e).length;
    const resumo = {
      script: 'fase0-expansao',
      modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
      geradoEm: new Date().toISOString(),
      total: itens.length,
      porTipo: { instrucao: itens.filter((i) => i.tipo === 'instrucao').length, 'c22-a01': itens.filter((i) => i.tipo === 'c22-a01').length, 'c24-a01': itens.filter((i) => i.tipo === 'c24-a01').length },
      aplicar: conta('aplicar'), jaAplicado: conta('ja-aplicado'), divergente: conta('divergente'),
    };
    writeFileSync(saida, JSON.stringify({ resumo, mudancas: itens }, null, 1));
    console.log(`[fase0-expansao] ${resumo.modo}: ${resumo.aplicar} a aplicar/aplicados, ${resumo.jaAplicado} já aplicados, ${resumo.divergente} divergentes. Antes/depois em ${saida}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[fase0-expansao] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

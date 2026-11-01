/**
 * Apoio dos scripts de correção de conteúdo do robô de QA (31/10): lê o RASCUNHO de cada curso, aplica só mudanças de
 * TEXTO DE TELA (título da pergunta, situação da pergunta, rótulo de opção, ponte da atividade), confere por diff que nada
 * além disso mudou (nem mídia, nem `media.adjust`, nem falas gravadas) e grava uma nova revisão. Idempotente:
 * o que já está no valor novo é pulado; o que não bate com o valor esperado (alguém mexeu) é listado e não é tocado.
 * Em conflito de revisão (a gravação paga e o ajuste fino também escrevem no rascunho), relê e tenta de novo.
 * Sem `--apply` (ou com `--dry-run`) não grava nada no banco. Nos dois casos escreve o antes/depois em JSON (`--saida`).
 */
import { writeFileSync } from 'node:fs';
import { CourseDocumentSchema, allLessons, mediaPresentationStale, reactionScenes, type CourseDocument, type MediaRef } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';

export type Campo = 'title' | 'prompt' | 'intro' | 'label';

export interface Mudanca {
  /** código do achado do robô (P001…) ou "irmã" (opção vizinha mexida por coerência) */
  codigo: string;
  courseId: string;
  lessonId: string;
  nodeId: string;
  campo: Campo;
  /** só para `label` */
  optionId?: string;
  /** valor esperado hoje (guarda contra edição de outra pessoa) */
  de: string;
  para: string;
}

export interface Registro extends Mudanca {
  estado: 'aplicar' | 'ja-aplicado' | 'divergente' | 'nao-encontrado';
  atual?: string;
}

/** campos que este tipo de script pode mexer: qualquer outro caminho no diff aborta */
const PERMITIDO = /^modules\.\d+\.lessons\.\d+\.graph\.nodes\.\d+\.(title|intro|prompt\.content\.\d+\.content\.\d+\.text|options\.\d+\.label)$/;

/** cenas "desatualizadas" como o orçamento (`media-jobs/quote`) as enxerga: `media.stale` ou impressão da apresentação diferente */
export function cenasStale(doc: CourseDocument): string[] {
  const out: string[] = [];
  for (const l of allLessons(doc)) {
    for (const n of [...l.graph.nodes, ...reactionScenes(l.graph)]) {
      const m = (n as { media?: MediaRef }).media;
      if (m && (m.stale === true || mediaPresentationStale(m, doc.presentation, n))) out.push(`${l.id}/${n.id}`);
    }
  }
  return out.sort();
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** caminhos (a.b.0.c) onde os dois documentos diferem; arrays com tamanho diferente contam como diferença no próprio array */
export function caminhosDiferentes(a: Json, b: Json, base = ''): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [base];
  if (Array.isArray(a) !== Array.isArray(b)) return [base];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [base];
    return a.flatMap((x, i) => caminhosDiferentes(x, b[i]!, base ? `${base}.${i}` : String(i)));
  }
  const oa = a as { [k: string]: Json };
  const ob = b as { [k: string]: Json };
  const chaves = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  const out: string[] = [];
  for (const k of chaves) {
    if (!(k in oa) || !(k in ob)) out.push(base ? `${base}.${k}` : k);
    else out.push(...caminhosDiferentes(oa[k]!, ob[k]!, base ? `${base}.${k}` : k));
  }
  return out;
}

type Doc = { type?: string; text?: string; marks?: unknown; content?: Doc[] };

/** texto do enunciado: só 1 parágrafo com 1 trecho sem marcação (é o que os 73 enunciados têm); outra forma vira erro, não palpite */
function textoDoPrompt(prompt: Doc): { texto: string; no: Doc } {
  const par = prompt.content ?? [];
  if (par.length !== 1 || par[0]!.type !== 'paragraph') throw new Error('enunciado com mais de um parágrafo');
  const trechos = par[0]!.content ?? [];
  if (trechos.length !== 1 || trechos[0]!.type !== 'text' || trechos[0]!.marks) throw new Error('enunciado com formatação');
  return { texto: trechos[0]!.text ?? '', no: trechos[0]! };
}

type Alvo = { title?: string; intro?: string; prompt?: Doc; options?: Array<{ id: string; label: string }> };

function achar(doc: CourseDocument, m: Mudanca): Alvo | undefined {
  for (const mod of doc.modules) {
    const lesson = mod.lessons.find((l) => l.id === m.lessonId);
    if (lesson) return lesson.graph.nodes.find((n) => n.id === m.nodeId) as Alvo | undefined;
  }
  return undefined;
}

function valorAtual(n: Alvo, m: Mudanca): string | undefined {
  if (m.campo === 'title') return n.title ?? '';
  if (m.campo === 'intro') return n.intro ?? '';
  if (m.campo === 'prompt') return n.prompt ? textoDoPrompt(n.prompt).texto : undefined;
  return n.options?.find((o) => o.id === m.optionId)?.label;
}

function gravar(n: Alvo, m: Mudanca): void {
  if (m.campo === 'title') n.title = m.para;
  else if (m.campo === 'intro') n.intro = m.para;
  else if (m.campo === 'prompt') textoDoPrompt(n.prompt!).no.text = m.para;
  else n.options!.find((o) => o.id === m.optionId)!.label = m.para;
}

function classificar(doc: CourseDocument, ms: Mudanca[]): Registro[] {
  return ms.map((m) => {
    const n = achar(doc, m);
    const atual = n ? valorAtual(n, m) : undefined;
    if (!n || atual === undefined) return { ...m, estado: 'nao-encontrado' as const };
    if (atual === m.para) return { ...m, estado: 'ja-aplicado' as const, atual };
    if (atual !== m.de) return { ...m, estado: 'divergente' as const, atual };
    return { ...m, estado: 'aplicar' as const, atual };
  });
}

export async function rodar(opts: { rotulo: string; mudancas: Mudanca[]; apply: boolean; saida: string; nota: string }): Promise<void> {
  const { rotulo, mudancas, apply, saida, nota } = opts;
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const log: Array<Registro & { curso: string; revisaoAntes?: number; revisaoDepois?: number }> = [];
  try {
    const porCurso = new Map<string, Mudanca[]>();
    for (const m of mudancas) porCurso.set(m.courseId, [...(porCurso.get(m.courseId) ?? []), m]);
    for (const [courseId, itens] of porCurso) {
      for (let tentativa = 1; ; tentativa++) {
        const d = await getDraft(db, courseId);
        if (!d) throw new Error(`rascunho de ${courseId} não encontrado`);
        const original = d.document as CourseDocument;
        const doc = structuredClone(original) as CourseDocument;
        const regs = classificar(doc, itens);
        for (const r of regs) if (r.estado === 'aplicar') gravar(achar(doc, r)!, r);
        const n = regs.filter((r) => r.estado === 'aplicar').length;
        // trava: o único jeito de gravar é o diff conter só os campos de texto de tela deste script
        const parsed = CourseDocumentSchema.parse(doc);
        const fora = caminhosDiferentes(original as unknown as Json, parsed as unknown as Json).filter((p) => !PERMITIDO.test(p));
        if (fora.length) throw new Error(`${courseId}: o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
        if (tentativa === 1) {
          for (const r of regs) {
            const alvo = `${rotulo} ${courseId}/${r.lessonId}/${r.nodeId}${r.optionId ? `/${r.optionId}` : ''} ${r.campo}`;
            if (r.estado === 'aplicar') console.log(`[${rotulo}] ${r.codigo} ${alvo}: "${r.de}" → "${r.para}"`);
            else if (r.estado === 'ja-aplicado') console.log(`[${rotulo}] ${alvo}: já aplicado`);
            else console.log(`[${rotulo}] ATENÇÃO ${alvo}: ${r.estado}${r.atual !== undefined ? ` (hoje: "${r.atual}")` : ''}; não toquei`);
          }
        }
        if (!apply || !n) {
          for (const r of regs) log.push({ ...r, curso: courseId, revisaoAntes: d.revision });
          break;
        }
        try {
          const salvo = await saveDraft(db, { courseId, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `${nota}: ${n} texto(s)` });
          console.log(`[${rotulo}] ${courseId}: ${n} texto(s); rascunho ${d.revision} → ${salvo.revision}`);
          for (const r of regs) log.push({ ...r, curso: courseId, revisaoAntes: d.revision, revisaoDepois: salvo.revision });
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
            console.log(`[${rotulo}] ${courseId}: conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
            await new Promise((res) => setTimeout(res, 700 * tentativa));
            continue;
          }
          throw e;
        }
      }
    }
    const resumo = {
      script: rotulo,
      modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
      geradoEm: new Date().toISOString(),
      total: log.length,
      aplicar: log.filter((l) => l.estado === 'aplicar').length,
      jaAplicado: log.filter((l) => l.estado === 'ja-aplicado').length,
      divergente: log.filter((l) => l.estado === 'divergente' || l.estado === 'nao-encontrado').length,
    };
    writeFileSync(saida, JSON.stringify({ resumo, mudancas: log.map((l) => ({ codigo: l.codigo, curso: l.curso, aula: l.lessonId, no: l.nodeId, ...(l.optionId ? { opcao: l.optionId } : {}), campo: l.campo, estado: l.estado, antes: l.atual ?? l.de, depois: l.para, ...(l.revisaoAntes != null ? { revisaoAntes: l.revisaoAntes } : {}), ...(l.revisaoDepois != null ? { revisaoDepois: l.revisaoDepois } : {}) })) }, null, 1));
    console.log(`[${rotulo}] ${resumo.modo}: ${resumo.aplicar} a aplicar/aplicados, ${resumo.jaAplicado} já aplicados, ${resumo.divergente} divergentes. Antes/depois em ${saida}`);
  } finally {
    await close();
  }
}

/** argumentos comuns: `--dry-run` (padrão: só mostra), `--apply` (grava) e `--saida <arquivo>` */
export function argumentos(padraoSaida: string): { apply: boolean; saida: string } {
  const args = process.argv.slice(2);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply, não os dois');
  const i = args.indexOf('--saida');
  return { apply: args.includes('--apply'), saida: i >= 0 && args[i + 1] ? args[i + 1]! : padraoSaida };
}

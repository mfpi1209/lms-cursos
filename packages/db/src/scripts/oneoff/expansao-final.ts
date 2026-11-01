/**
 * Expansão final (01/11): aplica no RASCUNHO as propostas revisadas `docs/novos-cursos/expansao-final/Cxx/proposta.json`
 * (C02–C26, exceto C01 e C24), no mesmo formato do piloto C24 (`piloto-c24.ts`), com a opção RECOMENDADA de cada pergunta
 * aberta (as decisões do dono dormindo: docs/qa/expansao-analise/DECISOES-AUTONOMAS.md). Nada é publicado, nenhuma mídia é
 * gerada e nenhum orçamento é pedido: o script só edita o documento do rascunho.
 *
 * O que uma proposta faz (e o que este script entende):
 *  - aulas existentes: troca de FALA de planos existentes (mesmo id, mesma câmera, mesmo gesto, mesmo layout; ex.: o plano de
 *    abertura `missao` sem a fórmula "tem uma missão para você"); textos de tela (instrução e ponte da prática, frase de fechamento,
 *    rótulo e resumo do fim da aula, texto de reação desligada); nenhum nó novo e nenhum id muda. Só os nós com plano
 *    trocado ficam `media.stale = true` (o orçamento regrava só o plano trocado, pela chave de reaproveitamento por plano).
 *  - aula NOVA anexada ao fim do último módulo: cena → "Você decide" (sem vídeo próprio; 3 reações faladas; a chamada é o último
 *    plano da cena anterior) → explicação → missão "Leve para a vida real" (tipo `mission`) → despedida (nó `content`) → fim ("Curso concluído").
 *  - nível do curso: descrição, objetivo novo, personagem novo com nome, aula nova obrigatória, duração-alvo se a estimativa passar de 1,5×.
 *
 * Guardas (nada é gravado se alguma falhar): (1) texto antigo: o valor atual tem que ser o que a proposta viu; se já estiver igual ao
 * alvo, é "já aplicado"; um TERCEIRO texto (ex.: alguém mexeu depois) vira CONFLITO, listado e nunca sobrescrito. A instrução "Escreva…" que
 * a Fase 0 já trocou (um dos 8 jeitos de `fase0-expansao.ts`) vale como "já corrigida"; a Fase 0 do C22 (a01) aceita a troca de "referência
 * responsável" por "pessoa responsável" por cima do texto dela; (2) diff com lista de permissões: nenhum campo fora do previsto muda;
 * (3) `carryAdjust` (regravação) antes x depois idêntico nos planos que não mudaram; (4) as únicas cenas que passam a ficar desatualizadas
 * são as de plano trocado; (5) `onlyAppendedLessons(publicada, rascunho novo)`; (6) `compileCourse` sem erro novo e `ok`; (7) em
 * conflito de revisão, relê e tenta de novo. Curso com conflito ou inconsistência na proposta NÃO é gravado (o resto do lote segue).
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/expansao-final.ts [--so=C02,C03] [--dry-run | --apply] [--resumo arq.json] [--ignorar-jobs] [--pasta=dir]
 *
 * Sem `--apply` não grava nada (dry-run é o padrão). Relatório por curso: docs/novos-cursos/expansao-final/Cxx/aplicacao.antes-depois.json
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
  COURSE_LENGTH_TOLERANCE,
  CourseDocumentSchema,
  SAFE_GESTURES,
  allLessons,
  compileCourse,
  courseLengthReport,
  directionNarration,
  gestureKey,
  sameWords,
  spokenWords,
  type CourseDocument,
  type Shot,
} from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { getLatestVersion, validateDraft } from '../../repositories/publishing';
import { listJobsForCourse } from '../../repositories/media';
import { carryAdjust, REACTION_OPENERS, type AdjustState } from '../../../../media/src/adjust';
import { onlyAppendedLessons } from '../matricula-migracao';
import { caminhosDiferentes, cenasStale } from './_rascunho-qa';

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = any; // trechos da proposta (JSON)
type Doc = CourseDocument;
type Lesson = Doc['modules'][number]['lessons'][number];
type NodeAny = Lesson['graph']['nodes'][number] & Record<string, any>;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

let PASTA = 'docs/novos-cursos/expansao-final';
const RAIOX = 'docs/qa/raio-x/raio-x.json';
const TAG = '[expansao-final]';
const WORDS_PER_SECOND = 2.62;
const USD_PER_SECOND = 0.0183;

/* ------------------------------------------------------------------ */
/* utilidades de texto                                                 */
/* ------------------------------------------------------------------ */
const norm = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] });
const richDoc = (...paras: string[]) => ({ type: 'doc' as const, content: paras.map(paragraph) });
const bulletDoc = (head: string, items: string[]) => ({
  type: 'doc' as const,
  content: [paragraph(head), { type: 'bulletList' as const, content: items.map((t) => ({ type: 'listItem' as const, content: [paragraph(t)] })) }],
});
/** texto do documento rico: um parágrafo por linha; itens de lista, um por linha (mesma forma do "resumo" do raio-x) */
function richLines(doc: any): string[] {
  const out: string[] = [];
  const walk = (n: any): void => {
    if (!n) return;
    if (n.type === 'text') return;
    if (n.type === 'paragraph' || n.type === 'heading') {
      out.push((n.content ?? []).map((t: any) => t.text ?? '').join(''));
      return;
    }
    for (const c of n.content ?? []) walk(c);
  };
  for (const b of doc?.content ?? []) walk(b);
  return out;
}
const richPlain = (doc: any): string => richLines(doc).join(' ').trim();
const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/* ------------------------------------------------------------------ */
/* estado do processamento de um curso                                 */
/* ------------------------------------------------------------------ */
type Estado = 'aplicar' | 'ja-aplicado' | 'ja-corrigido-fase0' | 'conflito';
interface Item { tipo: string; onde: string; estado: Estado; antes?: unknown; depois?: unknown; motivo?: string }

class Ctx {
  itens: Item[] = [];
  /** a proposta não fecha consigo mesma ou com o schema: não dá para aplicar (a correção é na proposta) */
  inconsistencias: string[] = [];
  avisos: string[] = [];
  /** prefixos de caminho do documento que o diff pode tocar */
  permitidos: string[] = [];
  /** `aula/no` → ids dos planos cuja fala mudou */
  planosMudados = new Map<string, Set<string>>();
  constructor(readonly codigo: string) {}
  item(i: Item) { this.itens.push(i); }
  get conflitos() { return this.itens.filter((i) => i.estado === 'conflito'); }
  inconsistente(msg: string) { this.inconsistencias.push(msg); }
}

/* ------------------------------------------------------------------ */
/* instrução da Fase 0 ("Escreva uma resposta curta…" já corrigida)    */
/* ------------------------------------------------------------------ */
const ANTIGA_ESCREVA = 'Escreva uma resposta curta. Pode usar uma situação fictícia. Não inclua nomes, contatos ou informações internas.';
const NUM = ['', 'um', 'dois', 'três', 'quatro', 'cinco'];
/** os 8 jeitos de `fase0-expansao.ts` (instrução de montagem de frase): copiados de lá; se mudarem lá, o guarda cai em "conflito", nunca em sobrescrita */
const FASE0: Array<(n: number) => string> = [
  () => 'Escolha uma opção em cada grupo e a sua frase vai se formando. Se nenhuma servir, toque em “Prefiro escrever”, sem nomes, contatos ou informações internas.',
  () => 'Monte a frase tocando em um bloco de cada grupo. Quer dizer de outro jeito? Use “Prefiro escrever”, com uma situação fictícia e sem dados pessoais.',
  (n) => `São ${NUM[n]} grupos: escolha um bloco em cada um. Se precisar, “Prefiro escrever” deixa você usar suas próprias palavras, sem informações internas.`,
  () => 'Toque em um bloco por grupo para montar sua frase. Pode ser uma situação fictícia; se for escrever uma parte, não inclua nomes, contatos ou informações internas.',
  () => 'Vá escolhendo, grupo por grupo, as partes da sua frase. Nenhuma combina com você? Toque em “Prefiro escrever” e use palavras suas, sem dados pessoais.',
  () => 'Sua frase fica pronta quando cada grupo tiver uma escolha. Para mudar uma parte, toque em “Prefiro escrever”, sem nomes, contatos ou informações internas.',
  (n) => `Em cada um dos ${NUM[n]} grupos, toque no bloco que mais combina com você. Se preferir, escreva a sua parte em “Prefiro escrever”, com uma situação fictícia.`,
  () => 'Escolha um bloco em cada grupo para montar a frase. Só se quiser, use “Prefiro escrever” para dizer do seu jeito; nada de nomes, contatos ou informações internas.',
  () => 'Escolha uma opção em cada grupo e a sua frase vai se formando.',
  (n) => `Toque em um bloco de cada um dos ${NUM[n]} grupos para montar a frase.`,
];
const FASE0_TEXTOS = new Set(FASE0.flatMap((f) => [1, 2, 3, 4, 5].map((n) => norm(f(n)))));
/** troca de jargão por cima do texto da Fase 0 (C22·a01): "referência responsável" → "pessoa responsável" */
const SUBS: Array<[RegExp, string]> = [[/referência responsável/g, 'pessoa responsável'], [/à referência\b/g, 'à pessoa responsável']];
const comSubs = (t: string) => SUBS.reduce((a, [re, to]) => a.replace(re, to), t);

/* ------------------------------------------------------------------ */
/* raio-x: o que as propostas "viram" (referência do texto antigo)     */
/* ------------------------------------------------------------------ */
let raioxCache: any | null = null;
function raiox(): any {
  if (!raioxCache) raioxCache = existsSync(RAIOX) ? JSON.parse(readFileSync(RAIOX, 'utf8')) : { cursos: [] };
  return raioxCache;
}
function rxNo(codigo: string, aula: string, no: string): any | undefined {
  const c = raiox().cursos.find((x: any) => x.codigo === codigo);
  return c?.rascunho?.aulas?.find((a: any) => a.id === aula)?.nos?.find((n: any) => n.id === no);
}
const rxCurso = (codigo: string): any | undefined => raiox().cursos.find((x: any) => x.codigo === codigo);

/* ------------------------------------------------------------------ */
/* localizar nós                                                       */
/* ------------------------------------------------------------------ */
interface Loc { mi: number; li: number; ni: number; lesson: Lesson; node: NodeAny; base: string }
function localizar(doc: Doc, lessonId: string, nodeId: string): Loc | undefined {
  for (let mi = 0; mi < doc.modules.length; mi++) {
    const m = doc.modules[mi]!;
    for (let li = 0; li < m.lessons.length; li++) {
      const l = m.lessons[li]!;
      if (l.id !== lessonId) continue;
      const ni = l.graph.nodes.findIndex((x) => x.id === nodeId);
      if (ni < 0) return undefined;
      return { mi, li, ni, lesson: l, node: l.graph.nodes[ni] as NodeAny, base: `modules.${mi}.lessons.${li}.graph.nodes.${ni}` };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* edição das aulas existentes                                         */
/* ------------------------------------------------------------------ */

/** troca de fala de planos existentes (mesmo id, mesma câmera, mesmo layout e mesmo gesto; só a `line` muda) */
function editarPlanos(ctx: Ctx, doc: Doc, aula: string, n: P): void {
  const loc = localizar(doc, aula, n.id);
  if (!loc) { ctx.item({ tipo: 'plano', onde: `${aula}/${n.id}`, estado: 'conflito', motivo: 'o nó não existe mais no rascunho' }); return; }
  const node = loc.node;
  const shots: Shot[] | undefined = node.direction?.shots;
  const chave = `${aula}/${n.id}`;
  const mudados = new Set<string>();
  for (const pl of n.planos as P[]) {
    const onde = `${chave}/${pl.id}`;
    if (pl.acao && pl.acao !== 'change' && pl.acao !== 'keep') { ctx.inconsistente(`${onde}: ação de plano "${pl.acao}" em nó existente não é suportada (só troca de fala; nada de plano novo em aula existente)`); continue; }
    const para: string | undefined = pl.para ?? pl.fala;
    const de: string | undefined = pl.de ?? pl.falaAnterior ?? pl.antes;
    if (!para || !de) { ctx.inconsistente(`${onde}: o plano não traz a fala antiga e a nova (de/para, falaAnterior/fala ou antes/fala)`); continue; }
    const k = shots?.findIndex((s) => s.id === pl.id) ?? -1;
    if (!shots || k < 0) { ctx.item({ tipo: 'plano', onde, estado: 'conflito', motivo: 'o plano não está mais na direção da cena (tirado ou renomeado?)', depois: para }); continue; }
    const shot = shots[k]!;
    if (norm(shot.line) === norm(para)) { ctx.item({ tipo: 'plano', onde, estado: 'ja-aplicado', antes: de, depois: para }); continue; }
    if (norm(shot.line) !== norm(de)) { ctx.item({ tipo: 'plano', onde, estado: 'conflito', motivo: 'a fala atual não é a que a proposta viu nem a nova', antes: shot.line, depois: para }); continue; }
    if (pl.camera && shot.cameraId !== pl.camera) { ctx.item({ tipo: 'plano', onde, estado: 'conflito', motivo: `câmera da proposta (${pl.camera}) ≠ câmera do rascunho (${shot.cameraId ?? 'principal'}); o plano mantém câmera, gesto e layout`, antes: shot.line, depois: para }); continue; }
    if (pl.layout && (shot.layout ?? 'presenter') !== pl.layout) { ctx.item({ tipo: 'plano', onde, estado: 'conflito', motivo: `layout da proposta (${pl.layout}) ≠ layout do rascunho (${shot.layout})`, antes: shot.line, depois: para }); continue; }
    if (palavras(para) > 25) ctx.avisos.push(`${onde}: a fala nova tem ${palavras(para)} palavras (regra: até 25)`);
    if (/miss[aã]o/i.test(para) && pl.id === 'missao') ctx.avisos.push(`${onde}: a fala nova do anúncio ainda usa a palavra "missão"`);
    mudados.add(pl.id);
    ctx.item({ tipo: 'plano', onde, estado: 'aplicar', antes: shot.line, depois: para });
  }
  if (!mudados.size) return;
  // a fala do nó é a soma dos planos: confere antes de trocar
  const soma = directionNarration({ shots: shots! });
  if (norm(node.narration) !== norm(soma)) {
    for (const it of ctx.itens) if (it.estado === 'aplicar' && it.onde.startsWith(`${chave}/`) && it.tipo === 'plano') { it.estado = 'conflito'; it.motivo = 'a narração do nó não é a soma dos planos (alguém mexeu); nada foi trocado'; }
    return;
  }
  for (const pl of n.planos as P[]) {
    if (!mudados.has(pl.id)) continue;
    const k = shots!.findIndex((s) => s.id === pl.id);
    shots![k]!.line = String(pl.para ?? pl.fala).trim();
    ctx.permitidos.push(`${loc.base}.direction.shots.${k}.line`);
  }
  node.narration = directionNarration({ shots: shots! });
  ctx.permitidos.push(`${loc.base}.narration`);
  if (node.media) {
    node.media.stale = true;
    ctx.permitidos.push(`${loc.base}.media.stale`);
  }
  ctx.planosMudados.set(chave, mudados);
}

function resultado(ctx: Ctx, tipo: string, onde: string, atual: string, alvo: string, aceitaveis: string[], aplicar: () => void, opts: { fase0?: boolean } = {}): void {
  if (norm(atual) === norm(alvo)) return void ctx.item({ tipo, onde, estado: 'ja-aplicado', antes: atual, depois: alvo });
  if (aceitaveis.some((a) => norm(a) === norm(atual))) { aplicar(); return void ctx.item({ tipo, onde, estado: 'aplicar', antes: atual, depois: alvo }); }
  if (opts.fase0 && FASE0_TEXTOS.has(norm(atual))) return void ctx.item({ tipo, onde, estado: 'ja-corrigido-fase0', antes: atual, depois: alvo, motivo: 'a Fase 0 já trocou a instrução (um dos 8 jeitos); a proposta não a sobrescreve' });
  ctx.item({ tipo, onde, estado: 'conflito', antes: atual, depois: alvo, motivo: 'o texto atual não é o que a proposta viu nem o novo (alguém mexeu); não toquei' });
}

function editarCampos(ctx: Ctx, doc: Doc, original: Doc, aula: string, n: P): void {
  const loc = localizar(doc, aula, n.id);
  const onde0 = `${aula}/${n.id}`;
  const campos = n.campos_alterados as Record<string, any>;
  if (!loc) { ctx.item({ tipo: 'campos', onde: onde0, estado: 'conflito', motivo: 'o nó não existe mais no rascunho' }); return; }
  const node = loc.node;
  const rx = rxNo(ctx.codigo, aula, n.id);
  const permitir = (suf: string) => ctx.permitidos.push(`${loc.base}${suf ? `.${suf}` : ''}`);
  for (const [campo, alvo] of Object.entries(campos)) {
    const onde = `${onde0}.${campo}`;
    let m: RegExpExecArray | null;
    if (campo === 'instrucoes' || (campo === 'prompt' && node.type === 'reflection')) {
      if (node.type !== 'reflection') { ctx.inconsistente(`${onde}: o nó não é uma prática (reflection)`); continue; }
      const atual = richPlain(node.prompt);
      resultado(ctx, 'instrucao', onde, atual, alvo as string, campo === 'instrucoes' ? ['', ANTIGA_ESCREVA] : [comSubsReverso(atual, alvo as string)], () => { node.prompt = richDoc(alvo as string); permitir('prompt'); }, { fase0: campo === 'instrucoes' });
    } else if (campo === 'ponte') {
      const atual = node.intro ?? '';
      const vistoPelaProposta = [rx?.missao?.ponte ?? '\u0000', atual.replace(/^Esta é a missão da aula\.\s*/, '') === alvo ? atual : '\u0000'];
      resultado(ctx, 'ponte', onde, atual, alvo as string, vistoPelaProposta, () => { node.intro = alvo; permitir('intro'); });
    } else if (campo === 'tituloNaTela') {
      resultado(ctx, 'titulo', onde, node.title ?? '', alvo as string, [rx?.missao?.tituloNaTela ?? '\u0000'], () => { node.title = alvo; permitir('title'); });
    } else if (campo === 'closingLine') {
      resultado(ctx, 'closingLine', onde, node.closingLine ?? '', alvo as string, [''], () => { node.closingLine = alvo; permitir('closingLine'); });
    } else if (campo === 'outcomeLabel') {
      resultado(ctx, 'outcomeLabel', onde, node.outcomeLabel ?? '', alvo as string, ['Curso concluído'], () => { node.outcomeLabel = alvo; permitir('outcomeLabel'); });
    } else if (campo === 'summary') {
      const atual = richLines(node.summary).join('\n');
      const visto = rx?.fim?.resumo ?? '\u0000';
      resultado(ctx, 'summary', onde, atual, alvo as string, [visto], () => { { const ls = String(alvo).split('\n'); node.summary = ls.length > 1 ? bulletDoc(ls[0]!, ls.slice(1)) : richDoc(ls[0]!); } permitir('summary'); });
    } else if ((m = /^campos\.([^.]+)\.pergunta$/.exec(campo))) {
      const slot = node.scaffold?.slots?.find((s: any) => s.id === m![1]);
      const k = node.scaffold?.slots?.findIndex((s: any) => s.id === m![1]) ?? -1;
      if (!slot) { ctx.item({ tipo: 'pergunta-do-campo', onde, estado: 'conflito', motivo: `o campo ${m[1]} não existe no molde`, depois: alvo }); continue; }
      resultado(ctx, 'pergunta-do-campo', onde, slot.question ?? '', alvo as string, [comSubsReverso(slot.question ?? '', alvo as string)], () => { slot.question = alvo; permitir(`scaffold.slots.${k}.question`); });
    } else if ((m = /^itensDoRoteiro\[([^\]]+)\]\.rotulo$/.exec(campo))) {
      const k = node.recap?.findIndex((r: any) => r.id === m![1]) ?? -1;
      if (k < 0) { ctx.item({ tipo: 'rotulo-do-roteiro', onde, estado: 'conflito', motivo: `o item ${m[1]} não existe no roteiro`, depois: alvo }); continue; }
      const atual = node.recap[k].label as string;
      const tituloAntigo = (localizar(original, aula, m[1]!)?.node.title as string | undefined) ?? '';
      const semReticencias = atual.replace(/…$/, '');
      const aceita = tituloAntigo && tituloAntigo.startsWith(semReticencias) ? [atual] : [];
      resultado(ctx, 'rotulo-do-roteiro', onde, atual, alvo as string, aceita, () => { node.recap[k].label = alvo; permitir(`recap.${k}.label`); });
    } else if (campo === 'opcoes') {
      if (node.type !== 'choice') { ctx.inconsistente(`${onde}: o nó não é uma decisão`); continue; }
      for (const o of alvo as P[]) {
        const ko = node.options.findIndex((x: any) => x.id === o.id);
        const ondeO = `${onde}[${o.id}]`;
        if (ko < 0) { ctx.item({ tipo: 'reacao-texto', onde: ondeO, estado: 'conflito', motivo: 'a opção não existe', depois: o['reacao.texto'] }); continue; }
        const op = node.options[ko];
        const novo = o['reacao.texto'] as string | undefined;
        if (novo == null || Object.keys(o).some((k) => !['id', 'reacao.texto'].includes(k))) { ctx.inconsistente(`${ondeO}: só a troca de "reacao.texto" é suportada em opções`); continue; }
        const rxOpt = rx?.opcoes?.find((x: any) => x.id === o.id);
        const atual = op.reaction?.text ?? '';
        if (norm(atual) !== norm(novo) && norm(atual) === norm(rxOpt?.reacao?.texto) && !op.reaction?.disabled && op.reaction?.media) {
          ctx.item({ tipo: 'reacao-texto', onde: ondeO, estado: 'conflito', antes: atual, depois: novo, motivo: 'a reação tem vídeo ativo: trocar o texto o deixaria desatualizado (não é grátis); a proposta supõe vídeo desligado' });
          continue;
        }
        resultado(ctx, 'reacao-texto', ondeO, atual, novo, [rxOpt?.reacao?.texto ?? '\u0000'], () => { op.reaction = { ...op.reaction, text: novo }; permitir(`options.${ko}.reaction.text`); });
      }
    } else {
      ctx.inconsistente(`${onde}: campo "${campo}" não é suportado pelo aplicador`);
    }
  }
}
/** se `atual` virar `alvo` só por troca de jargão (C22), vale como texto antigo aceitável; senão devolve um valor que nunca bate */
function comSubsReverso(atual: string, alvo: string): string { return norm(comSubs(atual)) === norm(alvo) ? atual : '\u0000'; }

/* ------------------------------------------------------------------ */
/* gestos, planos e nós da aula nova                                   */
/* ------------------------------------------------------------------ */
const POOL = [
  'opens both palms, honest',
  'moves both hands gently while explaining, calm',
  'nods slowly, warm',
  'relaxes the shoulders and smiles, reassuring',
  'brings both hands together, focused',
  'leans in slightly, curious',
  'smiles softly, welcoming',
];
for (const g of POOL) if (!SAFE_GESTURES.some((s) => s.prompt === g)) throw new Error(`gesto fora da lista segura: ${g}`);
const CALL_GESTURE = 'tilts the head slightly, inviting';
const FOCUS = ['brings both hands together, focused', 'leans in slightly, curious'];
let gestureCursor = 0;

/** dá gesto aos planos novos (nunca a mesma ação do plano vizinho já definido) */
function assignGestures(shots: Shot[]): void {
  shots.forEach((s, i) => {
    if (/^chamada/.test(s.id)) { s.motionPrompt = CALL_GESTURE; return; }
    const avoid = new Set([gestureKey(shots[i - 1]?.motionPrompt), gestureKey(shots[i + 1]?.motionPrompt)].filter(Boolean));
    const prefer = ['promessa', 'lancamento'].includes(s.id) ? FOCUS : [];
    const k = gestureCursor % POOL.length;
    const order = [...prefer, ...POOL.slice(k), ...POOL.slice(0, k)];
    s.motionPrompt = order.find((g) => !avoid.has(gestureKey(g))) ?? POOL[0]!;
    gestureCursor++;
  });
}

function shotFrom(ctx: Ctx, no: string, p: P, cameras: Set<string>): Shot {
  const layout = p.layout as Shot['layout'];
  const slide = p.cartao
    ? { title: p.cartao.titulo, bullets: p.cartao.topicos, style: (p.cartaoEstilo ?? 'checklist') as 'checklist' | 'quote' | 'clean' | 'bold' }
    : undefined;
  if (['card', 'presenter_chips', 'presenter_panel'].includes(layout) && !slide) ctx.inconsistente(`${no}/${p.id}: layout ${layout} exige cartão`);
  if (p.camera && !cameras.has(p.camera)) ctx.inconsistente(`${no}/${p.id}: a câmera ${p.camera} não existe no kit do curso`);
  if (palavras(String(p.fala)) > 25) ctx.avisos.push(`${no}/${p.id}: fala de ${palavras(String(p.fala))} palavras (regra: até 25)`);
  return {
    id: p.id,
    line: String(p.fala).trim(),
    ...(p.camera ? { cameraId: p.camera } : {}),
    framing: 'medium',
    layout,
    cameraMove: 'static',
    transitionIn: 'cut', // como as cenas atuais
    ...(slide ? { slide } : {}),
  } as Shot;
}

function intentFor(tipo: string, shots: Shot[]): string {
  if (tipo === 'scenario') return 'Estúdio com zonas: a fala inteira na câmera da cena (as cenas alternam entre a 3/4 e as laterais).';
  const chips = shots.find((s) => s.layout === 'presenter_chips');
  return chips ? `Estúdio com zonas: a fala na câmera da cena; as pílulas "${chips.slide?.title}" surgem na parede livre e a fala volta.` : 'Estúdio com zonas: a fala na câmera da cena.';
}

/** cena narrada nova (scenario/content): sem mídia */
function narratedNode(ctx: Ctx, n: P, cameras: Set<string>): NodeAny {
  const tipo = n.tipo as 'scenario' | 'content';
  const shots = (n.planos as P[]).map((p) => shotFrom(ctx, n.id, p, cameras));
  assignGestures(shots);
  const narration = directionNarration({ shots });
  if (!sameWords(narration, n.roteiroNovo)) ctx.inconsistente(`${n.id}: a soma dos planos não bate com o "roteiroNovo" da proposta`);
  return {
    id: n.id,
    objectiveIds: n.objetivos ?? [],
    required: n.required ?? true,
    title: n.titulo,
    type: tipo,
    body: richDoc(n.textoTela),
    narration,
    motionPrompt: shots[0]!.motionPrompt,
    direction: { version: 1, shots, intent: intentFor(tipo, shots), source: 'author' },
  } as NodeAny;
}

const POINTS: Record<string, number> = { strong: 2, ok: 1, weak: 0 };

function choiceNode(ctx: Ctx, n: P): NodeAny {
  const situacao = norm(n.apoioNaTela);
  // padrão aprovado (qa-titulos-perguntas): o enunciado termina com a pergunta, que vira o título da tela
  const pergunta = norm(n.titulo);
  for (const o of n.opcoes as P[]) {
    const w = palavras(o.reacao?.texto ?? '');
    if (w > 25) ctx.avisos.push(`${n.id}~${o.id}: reação de ${w} palavras (regra: até 25)`);
    if (String(o.rotulo).length > 300) ctx.inconsistente(`${n.id}/${o.id}: rótulo passa de 300 caracteres`);
  }
  return {
    id: n.id,
    objectiveIds: n.objetivos ?? [],
    required: true,
    title: pergunta,
    type: 'choice',
    prompt: richDoc(`${situacao} ${pergunta}`),
    options: (n.opcoes as P[]).map((o) => ({
      id: o.id,
      label: o.rotulo,
      feedback: richDoc(o.feedback),
      quality: o.qualidade,
      reaction: { text: o.reacao.texto },
    })),
    bridge: { call: n.bridge.call },
  } as NodeAny;
}

/** Missão "Leve para a vida real" (tipo `mission`): título, ponte, ação em passos, alternativa e exemplo; sem molde e sem texto obrigatório */
function missionNode(ctx: Ctx, n: P): NodeAny {
  const action = (n.action as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const alternative = String(n.alternative);
  const example = String(n.tip?.texto ?? '');
  const lim = (campo: string, v: string, max: number) => { if (v.length > max) ctx.inconsistente(`${n.id}: ${campo} tem ${v.length} caracteres e o schema da missão aceita até ${max}`); };
  lim('action (passos numerados, "1. …" por linha)', action, 800);
  lim('alternative', alternative, 500);
  lim('tip.texto (exemplo)', example, 400);
  lim('intro', n.intro, 400);
  lim('title', n.title, 120);
  if (n.draftFromNodeId) ctx.inconsistente(`${n.id}: a proposta pede draftFromNodeId (${n.draftFromNodeId}); o aplicador segue a decisão do piloto (plano só no celular, sem molde)`);
  return {
    id: n.id,
    objectiveIds: n.objetivos ?? [],
    required: false,
    title: n.title,
    type: 'mission',
    intro: n.intro,
    action,
    alternative,
    ...(example ? { example } : {}),
  } as NodeAny;
}

function endNode(ctx: Ctx, n: P, missionIds: Set<string>): NodeAny {
  const linhas = String(n.summary).split('\n');
  const recap = (n.recap as P[]).map((r) => {
    const mission = !!r.nodeId && missionIds.has(r.nodeId);
    if (r.items && r.items.some((x: string) => x.length > 160)) ctx.inconsistente(`${n.id}/recap ${r.id}: item de checklist com mais de 160 caracteres`);
    return {
      id: r.id,
      label: r.label,
      // "Como foi?" é a própria missão (estado + o que a pessoa percebeu), não uma reflexão
      kind: mission ? 'mission' : r.kind,
      ...(r.nodeId ? { nodeId: r.nodeId } : {}),
      ...(!mission && r.composedNodeIds ? { composedNodeIds: r.composedNodeIds } : {}),
      ...(r.items ? { items: r.items } : {}),
      ...(r.text ? { text: r.text } : {}),
      emptyText: r.emptyText,
    };
  });
  return {
    id: n.id,
    objectiveIds: [],
    required: true,
    title: n.titulo ?? 'Meu roteiro',
    type: 'end',
    summary: bulletDoc(linhas[0]!, linhas.slice(1)),
    recap,
    recapTitle: n.recapTitle ?? 'Meu roteiro',
    outcomeLabel: n.outcomeLabel,
    closingLine: n.closingLine,
  } as NodeAny;
}

function ehMissao(n: P): boolean {
  return n.tipo === 'reflection' && (n.rotuloNaTela === 'Leve para a vida real' || !!n.comoFoi || !!n.ui);
}

function buildAulaNova(ctx: Ctx, a: P, cameras: Set<string>, modelo: Lesson): Lesson {
  const nodes: NodeAny[] = [];
  const missionIds = new Set<string>((a.nos as P[]).filter(ehMissao).map((n) => n.id));
  if (missionIds.size !== 1) ctx.inconsistente(`${a.id}: esperava exatamente 1 missão "Leve para a vida real", achei ${missionIds.size}`);
  for (const n of a.nos as P[]) {
    if (n.tipo === 'scenario' || n.tipo === 'content') nodes.push(narratedNode(ctx, n, cameras));
    else if (n.tipo === 'choice') nodes.push(choiceNode(ctx, n));
    else if (ehMissao(n)) nodes.push(missionNode(ctx, n));
    else if (n.tipo === 'end') nodes.push(endNode(ctx, n, missionIds));
    else ctx.inconsistente(`tipo de nó não suportado na aula nova: ${n.id} (${n.tipo})`);
  }
  const path: string[] = a.caminhoPrincipal;
  if (JSON.stringify(nodes.map((x) => x.id)) !== JSON.stringify(path)) ctx.inconsistente(`${a.id}: os nós e o caminho principal não batem (${nodes.map((x) => x.id).join(',')} ≠ ${path.join(',')})`);
  // a pergunta é chamada no fim da cena anterior: a chamada do nó tem que ser a última fala dela
  for (const q of nodes.filter((x) => x.type === 'choice')) {
    const prev = nodes[path.indexOf(q.id) - 1];
    const last = prev?.direction?.shots.at(-1);
    const call: string = q.bridge?.call ?? '';
    const wl = spokenWords(last?.line ?? ''), wc = spokenWords(call);
    // mesma regra do player (`hostSaysCall`): a fala do último plano TERMINA com a chamada (pode ter uma frase antes dela)
    if (!prev || !last || !/^chamada/.test(last.id) || !wc.length || wc.length > wl.length || !wc.every((w, i) => wl[wl.length - wc.length + i] === w)) ctx.inconsistente(`${q.id}: a cena anterior (${prev?.id}) não termina com a chamada "${call}" (último plano: ${last?.id ?? '-'})`);
    // a decisão não ganha vídeo próprio
    if (q.options.length < 2) ctx.inconsistente(`${q.id}: menos de 2 opções`);
  }
  // a despedida fecha com um gesto aberto de "é com você", e nunca repete o gesto do plano anterior
  const desp = nodes.find((x) => x.id === 'despedida' && x.direction);
  if (desp) {
    const ds = desp.direction.shots as Shot[];
    const ultimo = ds.at(-1)!;
    ultimo.motionPrompt = 'opens both palms, honest';
    if (ds.length > 1 && gestureKey(ds.at(-2)!.motionPrompt) === gestureKey(ultimo.motionPrompt)) ds.at(-2)!.motionPrompt = 'nods slowly, warm';
  } else ctx.inconsistente(`${a.id}: não há nó "despedida" com planos`);

  const edges: any[] = [];
  path.forEach((id, i) => {
    const node = nodes[i];
    if (!node || node.type === 'end') return;
    const next = path[i + 1]!;
    if (node.type === 'choice') {
      const proposto = (a.nos as P[]).find((x) => x.id === id);
      for (const o of node.options) {
        const por = (proposto?.opcoes as P[] | undefined)?.find((x) => x.id === o.id);
        const to = por?.vaiPara && path.includes(por.vaiPara) ? por.vaiPara : next;
        if (por?.vaiPara && por.vaiPara !== to) ctx.inconsistente(`${id}/${o.id}: vaiPara "${por.vaiPara}" não está no caminho da aula`);
        const by = POINTS[o.quality ?? 'weak']!;
        edges.push({ id: `e_${id}_${o.id}`, from: id, to, optionId: o.id, ...(by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {}) });
      }
    } else edges.push({ id: `e_${id}`, from: id, to: next });
  });
  return {
    id: a.id,
    title: a.titulo,
    description: a.resumo,
    estimatedMinutes: a.estimativaMin,
    family: modelo.family,
    objectiveIds: [a.objetivo.id],
    graph: {
      schemaVersion: 1,
      startNodeId: path[0]!,
      variables: structuredClone(modelo.graph.variables),
      nodes,
      edges,
      layout: { positions: Object.fromEntries(path.map((id, i) => [id, { x: 0, y: i * 180 }])) },
    },
  } as unknown as Lesson;
}

/* ------------------------------------------------------------------ */
/* nível do curso                                                      */
/* ------------------------------------------------------------------ */
function nivelCurso(ctx: Ctx, doc: Doc, prop: P, aulaNova: Lesson, aulaProposta: P): void {
  const nivel = prop.cursoNivel;
  // descrição
  const para = nivel.descricao?.para as string | undefined;
  if (para) {
    const visto = rxCurso(ctx.codigo)?.descricao ?? '\u0000';
    if (norm(doc.description) === norm(para)) ctx.item({ tipo: 'descricao', onde: 'curso', estado: 'ja-aplicado', antes: doc.description, depois: para });
    else if (norm(doc.description) === norm(visto)) { ctx.item({ tipo: 'descricao', onde: 'curso', estado: 'aplicar', antes: doc.description, depois: para }); doc.description = para; }
    else ctx.item({ tipo: 'descricao', onde: 'curso', estado: 'conflito', antes: doc.description, depois: para, motivo: 'a descrição atual não é a que a proposta viu nem a nova' });
  }
  // objetivos novos
  for (const o of (nivel.objetivosNovos ?? []) as P[]) {
    if (o.id !== aulaProposta.objetivo?.id) ctx.inconsistente(`objetivo ${o.id} ≠ objetivo da aula nova (${aulaProposta.objetivo?.id})`);
    if (doc.objectives.some((x) => x.id === o.id)) { ctx.item({ tipo: 'objetivo', onde: o.id, estado: 'ja-aplicado' }); continue; }
    doc.objectives.push({
      id: o.id,
      title: `Você consegue ${lowerFirst(String(o.texto).trim())}`.slice(0, 300),
      criterion: 'Confirma uma escolha na situação da aula e chega ao fechamento. A missão “Leve para a vida real” não bloqueia: dá para marcar “Já experimentei” ou “Vou fazer depois”.',
      required: true,
    } as Doc['objectives'][number]);
    ctx.item({ tipo: 'objetivo', onde: o.id, estado: 'aplicar', depois: o.texto });
  }
  // elenco: só personagem novo COM nome próprio ("Davi (não entra na vaquinha)"); os sem nome ficam fora (a fala diz "uma colega")
  for (const txt of (nivel.personagens?.novos ?? []) as string[]) {
    const m = /^([A-ZÀ-Ý][\p{L}-]*)\s*\((.+)\)\s*$/u.exec(txt.trim());
    if (!m) { ctx.avisos.push(`personagem novo sem nome próprio, fora do elenco: "${txt}"`); continue; }
    if (doc.cast.some((c) => c.name === m[1])) { ctx.item({ tipo: 'elenco', onde: m[1]!, estado: 'ja-aplicado' }); continue; }
    doc.cast.push({ name: m[1]!, role: 'Personagem de exemplo (fictício)', details: m[2]!.trim() } as Doc['cast'][number]);
    ctx.item({ tipo: 'elenco', onde: m[1]!, estado: 'aplicar', depois: txt });
  }
  // aula nova obrigatória (decisão 1; a opção recomendada de todas as propostas)
  if (!doc.completion.requiredLessonIds.includes(aulaNova.id)) doc.completion.requiredLessonIds = [...doc.completion.requiredLessonIds, aulaNova.id];
}

/* ------------------------------------------------------------------ */
/* aplicação                                                           */
/* ------------------------------------------------------------------ */
const PERMITIDO_CURSO = /^(description|objectives|cast|completion\.requiredLessonIds|brief\.targetMinutes)$/;

function aplicar(ctx: Ctx, original: Doc, prop: P): { doc: Doc; aulaNova: Lesson } {
  const doc = structuredClone(original) as Doc;
  gestureCursor = 0;
  const cameras = new Set<string>(((doc.presentation as any).cameras ?? []).map((c: any) => c.id));
  const novas = (prop.aulas as P[]).filter((a) => a.acao === 'add');
  if (novas.length !== 1) throw new Error(`esperava exatamente 1 aula nova (acao "add"), achei ${novas.length}`);
  const propNova = novas[0]!;
  if (!doc.modules.length) throw new Error('o rascunho não tem módulos');
  const ultimoModulo = doc.modules.at(-1)!;
  if (propNova.modulo && norm(propNova.modulo) !== norm(ultimoModulo.title)) ctx.inconsistente(`o módulo da aula nova ("${propNova.modulo}") não é o último módulo do rascunho ("${ultimoModulo.title}"); o aplicador só anexa ao fim do último módulo`);

  for (const a of prop.aulas as P[]) {
    if (a.acao === 'add' || a.acao === 'keep') continue;
    for (const n of a.nos as P[]) {
      if (n.planos?.length) editarPlanos(ctx, doc, a.id, n);
      if (n.campos_alterados) editarCampos(ctx, doc, original, a.id, n);
      if (n.acao === 'drop' || n.acao === 'add') ctx.inconsistente(`${a.id}/${n.id}: ação "${n.acao}" em nó de aula existente não é suportada`);
    }
  }
  const modelo = ultimoModulo.lessons.at(-1)!;
  if (ultimoModulo.lessons.some((l) => l.id === propNova.id)) throw new Error(`a aula ${propNova.id} já existe`);
  const aulaNova = buildAulaNova(ctx, propNova, cameras, modelo);
  nivelCurso(ctx, doc, prop, aulaNova, propNova);
  ultimoModulo.lessons.push(aulaNova);
  if (ctx.inconsistencias.length) return { doc, aulaNova }; // nem tenta o schema
  return { doc: CourseDocumentSchema.parse(doc), aulaNova: ultimoModulo.lessons.at(-1)! };
}

/* ------------------------------------------------------------------ */
/* conferências                                                        */
/* ------------------------------------------------------------------ */
interface Carry { aula: string; no: string; igual: boolean; antes: unknown; depois: unknown; descartadosPeloPlanoMudado: string[]; alertas: string[] }

/** pedido de reaplicação sem as entradas dos planos que mudaram de fala (esses perdem o corte, de propósito) */
function semPlanos(req: any, ids: Set<string>): any {
  if (!req) return null;
  const out: any = {};
  if (req.drop) { const d = req.drop.filter((i: string) => !ids.has(i)); if (d.length) out.drop = d; }
  for (const k of ['cut', 'trimLead', 'skip'] as const) if (req[k]) { const l = req[k].filter((x: any) => !ids.has(x.shotId)); if (l.length) out[k] = l; }
  if (req.teaser !== undefined) out.teaser = req.teaser;
  return Object.keys(out).length ? out : null;
}

function conferirCarry(ctx: Ctx, original: Doc, novo: Doc): Carry[] {
  const out: Carry[] = [];
  for (const lo of allLessons(original)) {
    const ln = allLessons(novo).find((l) => l.id === lo.id)!;
    for (const no of lo.graph.nodes as any[]) {
      const adj = no.media?.adjust;
      if (!adj || !no.direction) continue;
      const nn: any = ln.graph.nodes.find((x) => x.id === no.id)!;
      const mudados = ctx.planosMudados.get(`${lo.id}/${no.id}`) ?? new Set<string>();
      const st: AdjustState = { drop: adj.drop ?? [], cut: adj.cut ?? {}, ...(adj.teaser !== undefined ? { teaser: adj.teaser } : {}) };
      const a = carryAdjust(st, adj.baseLines ?? null, no.direction.shots);
      const d = carryAdjust(st, adj.baseLines ?? null, nn.direction.shots);
      const igual = JSON.stringify(semPlanos(a.request, mudados)) === JSON.stringify(semPlanos(d.request, mudados));
      const alertas: string[] = [];
      for (const id of mudados) if ((adj.drop ?? []).includes(id)) alertas.push(`o plano ${id} está em media.adjust.drop: ao regravar, o corte NÃO é reaplicado (a fala mudou) e o plano novo volta ao vídeo`);
      out.push({ aula: lo.id, no: no.id, igual, antes: a.request, depois: d.request, descartadosPeloPlanoMudado: d.skipped.filter((s) => [...mudados].some((id) => s.includes(` ${id}:`))), alertas });
      if (!igual) ctx.inconsistente(`${lo.id}/${no.id}: o ajuste carregado na regravação mudou para planos que não foram tocados`);
      for (const al of alertas) ctx.avisos.push(`${lo.id}/${no.id}: ${al}`);
    }
  }
  return out;
}

function conferirDiff(ctx: Ctx, original: Doc, novo: Doc): void {
  const totalAntigas = allLessons(original).length;
  const semNova = structuredClone(novo) as Doc;
  const ult = semNova.modules.at(-1)!;
  ult.lessons = ult.lessons.slice(0, ult.lessons.length - (allLessons(novo).length - totalAntigas));
  const fora = caminhosDiferentes(original as unknown as Json, semNova as unknown as Json).filter((c) => !PERMITIDO_CURSO.test(c) && !ctx.permitidos.some((p) => c === p || c.startsWith(`${p}.`)));
  if (fora.length) throw new Error(`o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 5).join(', ')}); nada foi gravado`);
  if (allLessons(novo).length !== totalAntigas + 1) throw new Error('esperava exatamente 1 aula acrescentada');
}

function resumoCompilacao(doc: Doc) {
  const r = compileCourse(doc);
  const cont = (l: { code: string }[]) => l.reduce<Record<string, number>>((a, x) => ((a[x.code] = (a[x.code] ?? 0) + 1), a), {});
  return { ok: r.ok, erros: r.errors, avisos: cont(r.warnings), avisosLista: r.warnings.filter((w) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) };
}

/** reações atuais cuja abertura o ajuste fino de reação consegue cortar (REACTION_OPENERS): só estas teriam corte limpo (opção (b) das perguntas) */
function reacoesCortaveis(doc: Doc): string[] {
  const out: string[] = [];
  for (const l of allLessons(doc)) for (const n of l.graph.nodes as any[]) {
    if (n.type !== 'choice') continue;
    for (const o of n.options) {
      const t = (o.reaction?.text ?? '').trim();
      if (REACTION_OPENERS.some((x) => t.startsWith(`${x} `))) out.push(`${l.id}/${n.id}~${o.id}`);
    }
  }
  return out;
}

/** opção recomendada de cada pergunta aberta (a que as propostas já refletem no JSON) */
function recomendadas(prop: P): Array<{ pergunta: number; recomendada: string; fallback?: string; texto: string; efeito: string }> {
  return (prop.perguntasAbertas as string[]).map((q, i) => {
    const texto = typeof q === 'string' ? q : JSON.stringify(q);
    const n = Number(/^\s*(\d+)\./.exec(texto)?.[1] ?? i + 1);
    const m = /Recomendo\s*\(?([a-d])\)?(?:[^.]*?se não der,?\s*\(?([a-d])\)?)?/i.exec(texto);
    const rec = m?.[1]?.toLowerCase() ?? '?';
    const efeito = /abertura repetida|reações antigas|reações atuais/i.test(texto)
      ? 'operação de ajuste fino de mídia (corte da 1ª frase), FORA deste aplicador; ver reacoesCortaveis (sem corte limpo → fica como está)'
      : /obrigatória ou opcional/i.test(texto) ? 'aula nova entra em completion.requiredLessonIds' : 'já refletida no texto/estrutura da proposta (nada a fazer no aplicador)';
    return { pergunta: n, recomendada: rec, ...(m?.[2] ? { fallback: m[2].toLowerCase() } : {}), texto: texto.slice(0, 220), efeito };
  });
}

function contagem(aula: Lesson, ctx: Ctx) {
  const falado = (aula.graph.nodes as any[]).reduce((b, n) => b + (n.direction ? palavras(directionNarration(n.direction)) : 0), 0);
  const reacoes = (aula.graph.nodes as any[]).reduce((b, n) => b + (n.type === 'choice' ? n.options.reduce((c: number, o: any) => c + palavras(o.reaction?.text ?? ''), 0) : 0), 0);
  let trocadas = 0;
  for (const i of ctx.itens) if (i.tipo === 'plano' && i.estado === 'aplicar') trocadas += palavras(String(i.depois ?? ''));
  const total = falado + reacoes + trocadas;
  return {
    planosAulaNova: (aula.graph.nodes as any[]).reduce((b, n) => b + (n.direction?.shots.length ?? 0), 0),
    palavrasPlanosAulaNova: falado,
    palavrasReacoesNovas: reacoes,
    palavrasAberturasTrocadas: trocadas,
    palavrasTotal: total,
    segundos: Math.round((total / WORDS_PER_SECOND) * 10) / 10,
    usdEstimado: Math.round((total / WORDS_PER_SECOND) * USD_PER_SECOND * 100) / 100,
    nos: (aula.graph.nodes as any[]).map((n) => `${n.id}:${n.type}`),
  };
}

/* ------------------------------------------------------------------ */
/* por curso                                                           */
/* ------------------------------------------------------------------ */
type Status = 'ok' | 'conflito' | 'inconsistente' | 'ja-aplicado' | 'erro';
interface Resultado { codigo: string; status: Status; resumo: string }

async function curso(db: any, codigo: string, apply: boolean, ignorarJobs: boolean): Promise<Resultado> {
  const arq = `${PASTA}/${codigo}/proposta.json`;
  const saida = `${PASTA}/${codigo}/aplicacao.antes-depois.json`;
  if (!existsSync(arq)) return { codigo, status: 'erro', resumo: 'sem proposta.json (ainda)' };
  let prop: P;
  try { prop = JSON.parse(readFileSync(arq, 'utf8')); } catch (e) { return { codigo, status: 'inconsistente', resumo: `proposta.json não é JSON válido: ${(e as Error).message}` }; }
  if (prop.curso?.codigo !== codigo) return { codigo, status: 'inconsistente', resumo: 'o código dentro da proposta é de outro curso' };
  const courseId: string = prop.curso.id;
  const novaId = (prop.aulas as P[]).find((a) => a.acao === 'add')?.id;

  const abertos = (await listJobsForCourse(db, courseId)).filter((j: any) => j.status === 'queued' || j.status === 'running');
  const publicada = await getLatestVersion(db, courseId);
  if (!publicada) return { codigo, status: 'erro', resumo: 'curso sem versão publicada (nada a comparar para a migração das matrículas)' };

  for (let tentativa = 1; ; tentativa++) {
    const d = await getDraft(db, courseId);
    if (!d) return { codigo, status: 'erro', resumo: 'rascunho não encontrado' };
    const original = d.document as Doc;
    if (allLessons(original).some((l) => l.id === novaId)) {
      return { codigo, status: 'ja-aplicado', resumo: `o rascunho (rev ${d.revision}) já tem a ${novaId}: nada a fazer` };
    }
    const ctx = new Ctx(codigo);
    let novo: Doc | undefined;
    let aulaNova: Lesson | undefined;
    let erro: string | undefined;
    try {
      ({ doc: novo, aulaNova } = aplicar(ctx, original, prop));
    } catch (e: any) {
      if (e?.issues) erro = `schema: ${(e.issues as any[]).slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')}`;
      else erro = e instanceof Error ? e.message : String(e);
    }
    let carry: Carry[] = [];
    let stale0: string[] = [], stale1: string[] = [];
    let antes: any, depois: any;
    let append = false;
    let metaMin: { de: number; para: number } | undefined;
    if (novo && !erro && !ctx.inconsistencias.length) {
      try {
        // duração-alvo: a aula nova pode passar de 1,5× a meta (aviso COURSE_TOO_LONG): sobe a meta até o aviso sumir (como no piloto, 5 → 9 min)
        const rel1 = courseLengthReport(novo);
        const estoura1 = rel1.totals.estMinutes > rel1.targetMinutes * COURSE_LENGTH_TOLERANCE;
        if (estoura1) {
          const para = Math.ceil(rel1.totals.estMinutes / COURSE_LENGTH_TOLERANCE);
          metaMin = { de: novo.brief.targetMinutes, para };
          novo.brief.targetMinutes = para;
        }
        novo = CourseDocumentSchema.parse(novo);
        conferirDiff(ctx, original, novo);
        carry = conferirCarry(ctx, original, novo);
        stale0 = cenasStale(original);
        stale1 = cenasStale(novo);
        const esperadas = [...ctx.planosMudados.keys()].filter((k) => { const [a, nn] = k.split('/'); return !!localizar(original, a!, nn!)?.node.media; });
        const novasStale = stale1.filter((x) => !stale0.includes(x));
        if (JSON.stringify(novasStale.sort()) !== JSON.stringify(esperadas.sort())) ctx.inconsistente(`as cenas que passam a ficar desatualizadas (${novasStale.join(', ') || 'nenhuma'}) não são exatamente as de plano trocado (${esperadas.join(', ') || 'nenhuma'})`);
        if (stale0.some((x) => !stale1.includes(x))) ctx.inconsistente('alguma cena já desatualizada deixou de estar');
        antes = resumoCompilacao(original);
        depois = resumoCompilacao(novo);
        append = onlyAppendedLessons(publicada.document, novo);
      } catch (e: any) {
        erro = e?.issues ? `schema: ${(e.issues as any[]).slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')}` : e instanceof Error ? e.message : String(e);
      }
    }
    if (!erro && depois) {
      const antigos = new Set<string>(antes.erros.map((x: any) => `${x.code}:${x.lessonId ?? ''}:${x.nodeId ?? ''}`));
      const novos = depois.erros.filter((x: any) => !antigos.has(`${x.code}:${x.lessonId ?? ''}:${x.nodeId ?? ''}`));
      if (novos.length) ctx.inconsistente(`o compilador passaria a recusar o rascunho: ${novos.slice(0, 3).map((x: any) => `${x.code} ${x.lessonId ?? ''}/${x.nodeId ?? ''}: ${x.message}`).join(' | ')}`);
      else if (!depois.ok) ctx.avisos.push(`o compilador recusa o rascunho (${depois.erros.length} erro(s)), todos já existentes antes`);
      if (!append) ctx.inconsistente('onlyAppendedLessons(publicada, rascunho novo) = false: a migração das matrículas não aceitaria esta versão');
    }

    let status: Status = erro ? 'erro' : ctx.inconsistencias.length ? 'inconsistente' : ctx.conflitos.length ? 'conflito' : 'ok';
    const relatorio: any = {
      script: 'expansao-final',
      modo: apply ? 'aplicar' : 'dry-run (nada gravado no banco)',
      geradoEm: new Date().toISOString(),
      curso: { codigo, id: courseId, titulo: prop.curso.titulo },
      status,
      ...(erro ? { erro } : {}),
      revisaoAntes: d.revision,
      revisaoVistaPelaProposta: prop.curso.revisaoDoRascunho,
      versaoPublicadaComparada: publicada.versionNumber,
      onlyAppendedLessons: append,
      jobsAbertos: abertos.map((j: any) => `${j.lessonId}/${j.nodeId}`),
      conflitos: ctx.conflitos,
      inconsistenciasDaProposta: ctx.inconsistencias,
      avisos: ctx.avisos,
      itens: ctx.itens,
      ...(metaMin ? { duracaoAlvoMinutos: metaMin } : {}),
      carryAdjust: carry,
      cenasDesatualizadasAntes: stale0,
      cenasDesatualizadasDepois: stale1,
      compilador: antes && depois ? { antes, depois } : undefined,
      avisosNovosDoCompilador: antes && depois ? Object.entries(depois.avisos as Record<string, number>).map(([c, n]) => [c, n - ((antes.avisos as Record<string, number>)[c] ?? 0)]).filter(([, n]) => (n as number) > 0) : [],
      reacoesCortaveisPeloAjusteFino: novo ? reacoesCortaveis(original) : [],
      perguntasAbertas: recomendadas(prop),
      ...(aulaNova ? { contagem: contagem(aulaNova, ctx), aulaNova } : {}),
    };

    const resumo = erro ? `erro: ${erro}`
      : status === 'ok' ? `ok (${ctx.itens.filter((i) => i.estado === 'aplicar').length} trocas + aula ${aulaNova?.id}; compilador ${depois?.ok ? 'ok' : `${depois?.erros.length} erro(s) pré-existentes`}; ${contagem(aulaNova!, ctx).segundos}s falados${metaMin ? `; meta ${metaMin.de}→${metaMin.para} min` : ''})`
        : status === 'conflito' ? `${ctx.conflitos.length} conflito(s): ${ctx.conflitos.map((c) => c.onde).join(', ')}`
          : `proposta inconsistente: ${ctx.inconsistencias.slice(0, 3).join(' || ')}${ctx.inconsistencias.length > 3 ? ` (+${ctx.inconsistencias.length - 3})` : ''}`;

    if (tentativa === 1 && abertos.length) console.log(`${TAG} ${codigo}: ATENÇÃO ${abertos.length} job(s) de vídeo abertos: ${abertos.map((j: any) => `${j.lessonId}/${j.nodeId}`).join(', ')}`);
    if (!apply || status !== 'ok') {
      writeFileSync(saida, JSON.stringify(relatorio, null, 1));
      return { codigo, status, resumo };
    }
    if (abertos.length && !ignorarJobs) {
      relatorio.modo = 'recusado: há jobs de vídeo abertos (use --ignorar-jobs)';
      writeFileSync(saida, JSON.stringify(relatorio, null, 1));
      return { codigo, status: 'erro', resumo: `recusado: ${abertos.length} job(s) de vídeo abertos` };
    }
    try {
      const trocas = ctx.itens.filter((i) => i.estado === 'aplicar').length;
      const salvo = await saveDraft(db, { courseId, document: novo!, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `Expansão final ${codigo}: aula ${aulaNova!.id} (decisão, missão “Leve para a vida real”, despedida), ${trocas} troca(s) de texto/fala nas aulas existentes (proposta revisada)` });
      const v = await validateDraft(db, courseId);
      writeFileSync(saida, JSON.stringify({ ...relatorio, revisaoDepois: salvo.revision, validateDraft: { ok: v.ok, erros: v.errors, midia: v.media, avisos: v.warnings.filter((w: any) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) } }, null, 1));
      return { codigo, status: 'ok', resumo: `APLICADO: rascunho ${d.revision} → ${salvo.revision}; validateDraft ok=${v.ok} erros=${v.errors.length}` };
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
        console.log(`${TAG} ${codigo}: conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
        await new Promise((res) => setTimeout(res, 700 * tentativa));
        continue;
      }
      throw e;
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply, não os dois');
  const apply = args.includes('--apply');
  const so = args.find((a) => a.startsWith('--so='))?.slice(5).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const pasta = args.find((a) => a.startsWith('--pasta='))?.slice(8);
  if (pasta) PASTA = pasta; // só para teste (cópia das propostas com textos alterados)
  const iResumo = args.indexOf('--resumo');
  const resumoArq = iResumo >= 0 ? args[iResumo + 1] : undefined;
  const codigos = so?.length ? so : readdirSync(PASTA).filter((x) => /^C\d\d$/.test(x)).sort();
  for (const c of codigos) if (c === 'C01' || c === 'C24') throw new Error(`${c} é piloto (piloto-c01.ts / piloto-c24.ts), não faz parte deste lote`);
  console.log(`${TAG} ${apply ? 'APLICANDO' : 'dry-run (nada será gravado)'}: ${codigos.join(', ')}`);

  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const res: Resultado[] = [];
  try {
    for (const c of codigos) {
      try {
        const r = await curso(db, c, apply, args.includes('--ignorar-jobs'));
        res.push(r);
      } catch (e) {
        res.push({ codigo: c, status: 'erro', resumo: e instanceof Error ? e.message : String(e) });
      }
      const r = res.at(-1)!;
      console.log(`${TAG} ${r.codigo}: ${r.status.toUpperCase()} — ${r.resumo}`);
    }
  } finally {
    await close();
  }
  const conta = (s: Status) => res.filter((r) => r.status === s).length;
  console.log(`${TAG} total ${res.length}: ok ${conta('ok')}, conflito ${conta('conflito')}, inconsistente ${conta('inconsistente')}, já aplicado ${conta('ja-aplicado')}, erro ${conta('erro')}`);
  if (resumoArq) writeFileSync(resumoArq, JSON.stringify({ modo: apply ? 'aplicar' : 'dry-run', geradoEm: new Date().toISOString(), resultados: res }, null, 1));
}

main().catch((e) => {
  console.error(`${TAG} erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

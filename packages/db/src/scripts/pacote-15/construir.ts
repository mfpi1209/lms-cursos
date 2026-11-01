/**
 * Pacote-15 → rascunho de curso do motor (parte PURA: sem banco, sem rede, sem pagar nada).
 *
 *  1. `lerPacote`/`validarPacote`: lê `catalogo.json` + `curso.json` (contrato editorial `dna-editorial-1.0`), valida o
 *     formato (zod), as ligações entre os nós (abertura → situação → 3 retornos → explicação → prática → fechamento) e
 *     confere cada texto contra o `roteiro.md` da pasta (ninguém edita um sem o outro).
 *  2. `montarMarkdown`: escreve o roteiro no formato que o importador do motor já lê (`parseMarkdownCourse`), com o texto
 *     do pacote palavra por palavra. O acréscimo à fala é só o que o motor pede (apresentação, "Hoje, vamos…", aviso da
 *     missão, caso e chamada antes da pergunta) e vem de frases do próprio pacote.
 *  3. `adaptarDocumento`: ajusta o documento que o importador devolveu ao que o pacote define e o importador não sabe
 *     (atividade "Na prática" de texto livre, fechamento, gestos seguros, marcador de origem, paleta).
 *  4. `validarDocumento`: esquema (zod), compilador do motor, chamada falada, fala = soma dos planos, textos do pacote
 *     preservados e uma rota por alternativa rodando o próprio motor (course-engine).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { applyIntent, createInitialState } from '@lms/course-engine';
import {
  allLessons,
  assembleScaffold,
  boldSegments,
  callStatuses,
  compileCourse,
  CourseDocumentSchema,
  directionNarration,
  importMarkdownCourse,
  reactionStatuses,
  richTextToPlain,
  sameWords,
  smartQuotes,
  spokenWords,
  splitSentences,
  type AnyNode,
  type ChoiceNode,
  type CompileIssue,
  type CourseDocument,
  type Lesson,
  type MarkdownCourseOptions,
  type RecapItem,
  type RichTextDocument,
} from '@lms/course-schema';
import { APOIO_VISUAL, MISSAO_FALADA, OBJETIVO_VOCE, PALETAS, VERBO_VOCE } from './dados';
import { ABERTURA_AULA_2, ATIVIDADES, DECISOES, FECHAMENTOS, opcoesEmOrdem, PERGUNTA_VOCE } from './editorial';

/* ------------------------------------------------------------------ */
/* 1. Pacote                                                           */
/* ------------------------------------------------------------------ */

const Video = z.object({ id: z.string(), type: z.literal('video'), title: z.string(), speech: z.string().min(1), onscreen_text: z.string(), asset: z.null(), duration_seconds: z.null(), next: z.string() });
const Opcao = z.object({ id: z.string(), label: z.string().min(1), recommended: z.boolean(), feedback_node: z.string() });
const Decisao = z.object({ id: z.string(), type: z.literal('decision'), title: z.string(), context: z.string().min(1), question: z.string().min(1), selection_mode: z.literal('single'), submit_label: z.string(), options: z.array(Opcao).length(3) });
const Retorno = z.object({ id: z.string(), type: z.literal('text_feedback'), title: z.string(), text: z.string().min(1), next: z.string(), next_label: z.string(), retry_target: z.string(), retry_label: z.string() });
const Pratica = z.object({
  id: z.string(),
  type: z.literal('practice'),
  title: z.string(),
  prompt: z.string().min(1),
  instructions: z.string().min(1),
  response_mode: z.literal('short_text'),
  fields: z.array(z.object({ id: z.string(), label: z.string(), placeholder: z.string(), required: z.boolean(), max_length: z.number().int() })).length(1),
  example: z.string().min(1),
  self_check: z.array(z.string()),
  empty_error: z.string(),
  save_label: z.string(),
  save_success: z.string(),
  save_error: z.string(),
  skip_label: z.string(),
  skip_next: z.string(),
  skip_status: z.string(),
  next: z.string(),
  next_label: z.string(),
});
const Fechamento = z.object({ id: z.string(), type: z.literal('text'), title: z.string(), text: z.string().min(1), next: z.string(), next_label: z.string() });
const NoPacote = z.discriminatedUnion('type', [Video, Decisao, Retorno, Pratica, Fechamento]);
const AulaPacote = z.object({ id: z.string(), title: z.string().min(1), objective: z.string().min(1), entry_node: z.string(), duration_seconds: z.null(), nodes: z.array(NoPacote) });
export const CursoPacoteSchema = z.object({
  schema_version: z.literal('dna-editorial-1.0'),
  id: z.string().regex(/^dna-proposta-/),
  slug_proposto: z.string().min(1),
  title: z.string().min(1),
  status: z.literal('draft'),
  track_proposed: z.string().min(1),
  objective: z.string().min(1),
  audience: z.string().min(1),
  prerequisites: z.string(),
  instructor_proposed: z.string().min(1),
  editorial_review: z.string().min(1),
  duration_seconds: z.null(),
  lessons: z.array(AulaPacote).length(2),
  end_node: z.object({ id: z.string(), type: z.literal('summary'), title: z.string(), text: z.string(), actions: z.array(z.string()), pending_message: z.string(), completion_rule: z.string() }),
});
export type CursoPacote = z.infer<typeof CursoPacoteSchema>;
export type AulaDoPacote = CursoPacote['lessons'][number];
type NoVideo = z.infer<typeof Video>;
type NoDecisao = z.infer<typeof Decisao>;
type NoRetorno = z.infer<typeof Retorno>;
export type NoPratica = z.infer<typeof Pratica>;
type NoFechamento = z.infer<typeof Fechamento>;

export interface CatalogoItem { id: string; title: string; path: string; track: string; instructor_proposed: string; lessons: number; decisions: number; practice_activities: number; video_scripts: number; duration_seconds: number | null; editorial_review: string }

export interface Pacote {
  dir: string;
  catalogo: CatalogoItem[];
  cursos: Array<{ item: CatalogoItem; curso: CursoPacote; roteiro: string }>;
}

export function lerPacote(dir: string): Pacote {
  const catalogo = JSON.parse(readFileSync(path.join(dir, 'catalogo.json'), 'utf8')) as CatalogoItem[];
  const cursos = catalogo.map((item) => {
    const raw = JSON.parse(readFileSync(path.join(dir, item.path, 'curso.json'), 'utf8')) as unknown;
    const parsed = CursoPacoteSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`${item.path}/curso.json fora do contrato: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return { item, curso: parsed.data, roteiro: readFileSync(path.join(dir, item.path, 'roteiro.md'), 'utf8') };
  });
  return { dir, catalogo, cursos };
}

export const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Nós da aula por tipo, na ordem do pacote. */
export function nosDaAula(aula: AulaDoPacote) {
  const videos = aula.nodes.filter((n): n is NoVideo => n.type === 'video');
  const decisao = aula.nodes.find((n): n is NoDecisao => n.type === 'decision');
  const retornos = aula.nodes.filter((n): n is NoRetorno => n.type === 'text_feedback');
  const pratica = aula.nodes.find((n): n is NoPratica => n.type === 'practice');
  const fechamento = aula.nodes.find((n): n is NoFechamento => n.type === 'text');
  if (videos.length !== 2 || !decisao || retornos.length !== 3 || !pratica || !fechamento) throw new Error(`aula ${aula.id}: estrutura fora do padrão (2 vídeos, 1 decisão, 3 retornos, 1 prática, 1 fechamento)`);
  return { abertura: videos[0]!, explicacao: videos[1]!, decisao, retornos, pratica, fechamento };
}

/** Problemas do pacote (formato, ligações e roteiro.md); lista vazia = pacote consistente. */
export function validarPacote(pacote: Pacote): string[] {
  const erros: string[] = [];
  const erro = (c: string, m: string) => erros.push(`${c}: ${m}`);
  const total = { aulas: 0, videos: 0, decisoes: 0, retornos: 0, praticas: 0 };
  if (pacote.cursos.length !== 15) erro('pacote', `esperados 15 cursos, há ${pacote.cursos.length}`);
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const { item, curso, roteiro } of pacote.cursos) {
    const c = item.path;
    if (curso.id !== item.id) erro(c, `id do curso.json (${curso.id}) difere do catálogo (${item.id})`);
    if (curso.slug_proposto !== item.path) erro(c, `slug_proposto "${curso.slug_proposto}" difere da pasta`);
    if (slugs.has(curso.slug_proposto)) erro(c, 'slug repetido');
    if (ids.has(curso.id)) erro(c, 'id repetido');
    slugs.add(curso.slug_proposto);
    ids.add(curso.id);
    if (curso.instructor_proposed !== item.instructor_proposed) erro(c, 'instrutor do curso.json difere do catálogo');
    if (curso.track_proposed !== item.track) erro(c, 'trilha do curso.json difere do catálogo');
    const rot = norm(roteiro);
    const noRoteiro = (rotulo: string, texto: string) => {
      if (!rot.includes(norm(texto))) erro(c, `${rotulo} não está no roteiro.md: "${norm(texto).slice(0, 70)}…"`);
    };
    for (const t of [curso.title, curso.objective]) noRoteiro('cabeçalho', t);
    const nodeIds = new Set(curso.lessons.flatMap((l) => l.nodes.map((n) => n.id)));
    curso.lessons.forEach((aula, i) => {
      total.aulas++;
      let n;
      try {
        n = nosDaAula(aula);
      } catch (e) {
        erro(c, (e as Error).message);
        return;
      }
      total.videos += 2;
      total.decisoes++;
      total.retornos += n.retornos.length;
      total.praticas++;
      const proximaEntrada = curso.lessons[i + 1]?.entry_node ?? curso.end_node.id;
      if (aula.entry_node !== n.abertura.id) erro(c, `${aula.id}: entry_node não é a abertura`);
      if (n.abertura.next !== n.decisao.id) erro(c, `${aula.id}: abertura não leva à decisão`);
      if (n.explicacao.next !== n.pratica.id) erro(c, `${aula.id}: explicação não leva à prática`);
      if (n.pratica.next !== n.fechamento.id || n.pratica.skip_next !== n.fechamento.id) erro(c, `${aula.id}: prática (salvar/fazer depois) não leva ao fechamento`);
      if (n.fechamento.next !== proximaEntrada) erro(c, `${aula.id}: fechamento leva a "${n.fechamento.next}", esperado "${proximaEntrada}"`);
      if (n.pratica.skip_status !== 'pending_practice') erro(c, `${aula.id}: skip_status inesperado`);
      if (n.pratica.fields[0]!.max_length !== 800 || !n.pratica.fields[0]!.required) erro(c, `${aula.id}: campo da prática fora do contrato (800, obrigatório para salvar)`);
      const recomendadas = n.decisao.options.filter((o) => o.recommended).length;
      if (recomendadas !== 1) erro(c, `${aula.id}: ${recomendadas} alternativas recomendadas (esperada 1)`);
      const feedbacks = new Set<string>();
      for (const o of n.decisao.options) {
        const r = n.retornos.find((x) => x.id === o.feedback_node);
        if (!r) {
          erro(c, `${aula.id}: opção ${o.id} aponta para retorno inexistente "${o.feedback_node}"`);
          continue;
        }
        if (r.next !== n.explicacao.id) erro(c, `${aula.id}: retorno ${r.id} não leva à explicação comum`);
        if (r.retry_target !== n.decisao.id) erro(c, `${aula.id}: retorno ${r.id} não volta à decisão`);
        if (feedbacks.has(norm(r.text))) erro(c, `${aula.id}: retorno repetido entre alternativas`);
        feedbacks.add(norm(r.text));
        noRoteiro(`${aula.id} alternativa`, o.label);
        noRoteiro(`${aula.id} retorno`, r.text);
      }
      for (const ref of [n.abertura.next, n.explicacao.next, ...n.decisao.options.map((o) => o.feedback_node)]) if (!nodeIds.has(ref)) erro(c, `${aula.id}: referência "${ref}" inexistente`);
      for (const [rotulo, t] of [
        ['fala da abertura', n.abertura.speech],
        ['fala da explicação', n.explicacao.speech],
        ['situação', n.decisao.context],
        ['pergunta', n.decisao.question],
        ['enunciado da prática', n.pratica.prompt],
        ['exemplo da prática', n.pratica.example],
        ['fechamento', n.fechamento.text],
        ['título da aula', aula.title],
      ] as const) noRoteiro(`${aula.id} ${rotulo}`, t);
      for (const t of [n.abertura.speech, n.explicacao.speech, n.decisao.context, n.decisao.question, ...n.decisao.options.map((o) => o.label), ...n.retornos.map((r) => r.text), n.pratica.prompt, n.pratica.example]) {
        if (t.includes('|') || /\n/.test(t)) erro(c, `${aula.id}: texto com "|" ou quebra de linha não cabe no roteiro em Markdown: "${t.slice(0, 40)}…"`);
      }
    });
    for (const a of ['a01', 'a02']) {
      const k = `${curso.slug_proposto}/${a}`;
      if (!APOIO_VISUAL[k]) erro(c, `falta apoio visual (dados.ts) em ${k}`);
      if (!DECISOES[k] || !FECHAMENTOS[k] || !ATIVIDADES[k]) erro(c, `faltam ajustes editoriais (editorial.ts) em ${k}`);
    }
    if (!ABERTURA_AULA_2[`${curso.slug_proposto}/a02`]) erro(c, 'falta abertura da aula 2 (editorial.ts)');
  }
  const esperado = { aulas: 30, videos: 60, decisoes: 30, retornos: 90, praticas: 30 };
  for (const k of Object.keys(esperado) as Array<keyof typeof esperado>) if (total[k] !== esperado[k]) erro('pacote', `${k}: ${total[k]} (esperado ${esperado[k]})`);
  return erros;
}

/* ------------------------------------------------------------------ */
/* 2. Markdown do motor                                                */
/* ------------------------------------------------------------------ */

export interface Instrutor { nome: string; papel: string; pronome: 'she' | 'he' | 'they' }

export const baixa1 = (s: string) => s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1);
export const semPonto = (s: string) => norm(s).replace(/[.\s]+$/u, '');

/** "Sua orientadora" + "she" → "Oi! Eu sou a Patrícia, sua orientadora neste curso da DNA Work." */
export function apresentacao(i: Instrutor): string {
  const artigo = i.pronome === 'she' ? 'a' : i.pronome === 'he' ? 'o' : '';
  return `Oi! Eu sou ${artigo ? `${artigo} ` : ''}${i.nome}, ${baixa1(i.papel)} neste curso da DNA Work.`;
}

/** Ação da missão dita na abertura: o enunciado da prática, em verbo no imperativo, sem o ponto final. */
export function missaoFalada(slug: string, aula: string, pratica: NoPratica): string {
  return MISSAO_FALADA[`${slug}/${aula}`] ?? baixa1(semPonto(pratica.prompt));
}

/** Pergunta da decisão (2ª pessoa). */
export function perguntaDe(slug: string, aula: string, doPacote: string): string {
  return PERGUNTA_VOCE[`${slug}/${aula}`] ?? norm(doPacote);
}

/** Corta em palavra inteira, com reticências, até `max` caracteres. */
export function recortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(' '), 1)).trimEnd()}…`;
}

/** "Você escreve uma pergunta…" a partir do enunciado da prática (que é o objetivo da aula no pacote). */
export function objetivoVoce(curso: CursoPacote, aula: AulaDoPacote): string {
  const chave = `${curso.slug_proposto}/${aula.id}`;
  const especial = OBJETIVO_VOCE[chave];
  if (especial) return especial;
  const texto = norm(aula.objective);
  const verbo = texto.split(/[\s:,]/)[0]!;
  const conj = VERBO_VOCE[verbo];
  if (!conj) throw new Error(`${chave}: verbo "${verbo}" do objetivo sem conjugação em dados.ts (VERBO_VOCE)`);
  return `Você ${conj}${texto.slice(verbo.length)}`;
}

/* ------------------------------------------------------------------ */
/* 3. Adaptação do documento                                            */
/* ------------------------------------------------------------------ */

/** Gestos seguros (sem mãos soltas, objetos nem sinais): o avatar gera mal "opens both palms" e parecidos. */
export const GESTOS_SEGUROS = ['nods slowly, warm', 'hands relaxed at the waist, calm, small nods', 'leans in slightly, curious', 'relaxes the shoulders and smiles, reassuring'] as const;
export const GESTO_ABERTURA = 'smiles softly, welcoming';
export const GESTO_CHAMADA = 'tilts the head slightly, inviting';
export const GESTOS_PROIBIDOS_RE = /opens? both palms|both hands|moves both|brings both|hand on|finger|point|wave|thumb/i;

export const rt = (...textos: string[]): RichTextDocument => ({ type: 'doc', content: textos.filter((t) => t.trim()).map((text) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] })) });

export const MARCADOR = (cursoId: string) => `[pacote-15:${cursoId}]`;
export const NOTA_IMPORTACAO = 'Importado do pacote-15';

/** Aberturas das reações: neutras para as alternativas que pedem reconsideração (nunca validam a escolha), curtas para a recomendada. */
export const ABERTURA_REACAO = {
  forte: ['Boa escolha.', 'É por aí.', 'Isso ajuda.', 'Bom caminho.'],
  outra: ['Vamos olhar o efeito disso.', 'Repare no que isso provoca.', 'Pense no que acontece depois.', 'Veja o que essa escolha muda.', 'Olhe isso com calma.', 'Vale pensar no que fica de fora.'],
} as const;

/** Reação (8 a 26 palavras) = abertura + o retorno escrito da própria alternativa (inteiro se couber; senão a 1ª frase). */
export function reacaoDe(abertura: string, retorno: string): string {
  const f = norm(retorno);
  const cabe = (t: string) => spokenWords(t).length <= 26;
  const inteira = `${abertura} ${f}`;
  if (cabe(inteira)) return inteira;
  const primeira = splitSentences(f)[0] ?? f;
  const curta = `${abertura} ${primeira}`;
  return cabe(curta) ? curta : primeira;
}

/**
 * Planos que cortam uma citação ao meio ("Você pode dizer: ‘Entendi. Não vou repetir’") se juntam ao seguinte: o
 * divisor de frases do motor corta no ponto de dentro das aspas, e a gravação separada soaria quebrada.
 */
export function juntarCitacoes<T extends { line: string; slide?: unknown }>(shots: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < shots.length; i++) {
    let atual = shots[i]!;
    while (i + 1 < shots.length && (atual.line.match(/‘/g)?.length ?? 0) > (atual.line.match(/’/g)?.length ?? 0)) {
      const prox = shots[++i]!;
      atual = { ...(prox.slide ? prox : atual), line: `${atual.line.trim()} ${prox.line.trim()}` };
    }
    out.push(atual);
  }
  return out;
}

export function gestosDoNo(n: AnyNode, primeiroDoCurso: boolean): AnyNode {
  if (n.type !== 'scenario' && n.type !== 'content') return n;
  let k = 0;
  const unidos = n.direction ? juntarCitacoes(n.direction.shots) : undefined;
  const narracaoUnida = unidos ? unidos.map((s) => s.line.trim()).join(' ') : n.narration;
  const shots = unidos?.map((s, i) => {
    let motionPrompt: string;
    if (s.id === 'chamada') motionPrompt = GESTO_CHAMADA;
    else if (i === 0 && primeiroDoCurso) motionPrompt = GESTO_ABERTURA;
    else motionPrompt = GESTOS_SEGUROS[k++ % GESTOS_SEGUROS.length]!;
    return { ...s, motionPrompt };
  });
  return {
    ...n,
    motionPrompt: primeiroDoCurso ? GESTO_ABERTURA : GESTOS_SEGUROS[0],
    ...(n.direction && shots ? { direction: { ...n.direction, shots: shots.map((x, i) => ({ ...x, id: x.id === 'chamada' ? x.id : `s${i + 1}` })) }, narration: narracaoUnida } : {}),
  };
}

export const textoDo = (d: RichTextDocument | undefined) => (d ? richTextToPlain(d).replace(/\s+/g, ' ').trim() : '');

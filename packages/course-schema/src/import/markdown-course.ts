import { CourseDocumentSchema, type Branding, type CastMember, type CourseDocument, type Lesson, type Module, type Presentation } from '../course';
import type { Edge, LessonGraph, Objective } from '../graph';
import type { AnyNode, ChoiceQuality, RecapItem } from '../nodes';
import type { RichTextDocument } from '../richtext';
import { boldSegments, CARD_LIMITS, CHIPS_LIMITS, nextChipsCamera, resolveCameraPlacement, SAFE_GESTURES, sameWords, spokenWords, stripBold, zoneCamerasOf, zoneTalkCamera, type Camera, type SceneDirection, type Shot, type ShotFraming, type SlideVariant, type ZoneCameraSet } from '../direction';
import { compileCourse, type CompileIssue, type CourseCompileResult } from '../compile';
import { courseLengthReport } from '../length';
import { applyCallsToGraph, callFromSituation } from '../bridge';
import { reactionFromFeedback, REACTION_WORDS } from '../reaction';

/*
 * Importador de roteiro em Markdown → documento de curso (puro, sem IA).
 *
 * Formato do roteiro (ver docs/roteiros/curso-primeira-vaga.md):
 *  - cabeçalho: `# Título` + linhas `Ideia:`, `Público:`, `Objetivo final:`,
 *    `Duração-alvo:`, `Personagens de exemplo (fictícios):`;
 *  - `## Módulo N — título` + `Descrição:`; `### Aula N — título` + `Objetivo:`;
 *  - cenas `### CÓDIGO — título` (códigos únicos no curso inteiro):
 *    - `V..` vídeo: `**Fala para gravação**` + fala entre aspas, `Texto na tela:`
 *      (palavras-chave) e `Cartão:` opcional (título + tópicos com **negrito**);
 *      segue para a cena seguinte;
 *    - `Q..` decisão: `Situação:`, `Voz opcional: sim|não`, `Chamada:` (frase
 *      com que a instrutora chama o aluno no FIM do vídeo anterior; ausente =
 *      `callFromSituation` — fato + pergunta do enunciado —, com aviso) e a tabela
 *      `Escolha | Qualidade | Reação | Feedback | Destino` (forte / ok / fraca;
 *      `Reação` = fala curta da instrutora a essa resposta, opcional: faltando,
 *      sai a padrão derivada do retorno, com aviso);
 *    - `M..` composição guiada: `Montar frase:` com `{lacunas}`, uma linha
 *      `- {lacuna}: a · b · c` por lacuna e `Destino:`;
 *    - `AV..` avaliação: `Tentativas: N`, `Aprovação: X de Y`, perguntas
 *      numeradas com alternativas (a correta marcada `(correta)`) e `Explicação:`;
 *    - `A..` anotação opcional: `Pergunta:`, `Pular: sim`, `Destino:`;
 *    - `### FIM — O que você levou`: tópicos, `Meu roteiro:` (itens separados
 *      por `;`) e `Checklist: Título: a · b · c` opcional. `Destino: FIM` é o
 *      encerramento da própria aula.
 *  - uma seção `## Notas…` (ou qualquer `##` que não seja módulo) encerra o roteiro.
 *
 * Mapeamento: vídeo → `scenario` (primeiro da aula) ou `content` com `narration`
 * e, com cartão, `direction` (planos da apresentadora na câmera principal + um
 * plano `card`); decisão → `choice` com qualidade e pontos (forte 2 / ok 1 /
 * fraca 0 na variável `pontos` da aula); composição → `reflection` com
 * `scaffold`; avaliação → uma cena `assessment` por pergunta encadeadas, com a
 * variável `acertos` e dois encerramentos (aprovado / revisar) para o critério
 * "X de Y"; anotação → `reflection` livre com `minLength: 0`; FIM → `end` com
 * o roteiro ("Meu roteiro"): frases montadas, anotação, checklist e os tópicos
 * de "O que você levou".
 */

/* ------------------------------------------------------------------ */
/* Tipos do roteiro analisado                                           */
/* ------------------------------------------------------------------ */

export interface ParsedHeader {
  /** todas as linhas `Chave: valor` do cabeçalho, pela chave como escrita */
  fields: Record<string, string>;
  idea: string;
  audience: string;
  finalGoal: string;
  targetDuration: string;
  characters: string;
}

export interface ParsedCard {
  title: string;
  /** tópicos com a marcação `**negrito**` preservada */
  bullets: string[];
}

export interface ParsedVideo {
  kind: 'video';
  code: string;
  title: string;
  narration: string;
  screenText: string;
  card?: ParsedCard;
}

export interface ParsedDecisionOption {
  label: string;
  quality: ChoiceQuality;
  feedback: string;
  destination: string;
  /** fala curta da instrutora ao reagir a esta resposta (coluna `Reação`); ausente = derivada do retorno */
  reaction?: string;
}

export interface ParsedDecision {
  kind: 'decision';
  code: string;
  title: string;
  situation: string;
  voiceOptional: boolean;
  /** frase de chamada falada no fim do vídeo anterior (`Chamada:`) */
  call?: string;
  options: ParsedDecisionOption[];
}

export interface ParsedScaffoldScene {
  kind: 'scaffold';
  code: string;
  title: string;
  template: string;
  slots: Array<{ id: string; options: string[] }>;
  destination: string;
}

export interface ParsedQuestion {
  text: string;
  alternatives: Array<{ label: string; correct: boolean }>;
  explanation: string;
}

export interface ParsedAssessment {
  kind: 'assessment';
  code: string;
  title: string;
  attempts: number;
  /** "Aprovação: X de Y" */
  passMin: number;
  passOf: number;
  questions: ParsedQuestion[];
  destination: string;
}

export interface ParsedNote {
  kind: 'note';
  code: string;
  title: string;
  text: string;
  skippable: boolean;
  destination: string;
}

export interface ParsedEnd {
  kind: 'end';
  code: 'FIM';
  title: string;
  takeaways: string[];
  /** itens de "Meu roteiro:" como escritos */
  myScript: string[];
  checklist?: { title: string; items: string[] };
}

export type ParsedScene = ParsedVideo | ParsedDecision | ParsedScaffoldScene | ParsedAssessment | ParsedNote | ParsedEnd;

export interface ParsedLesson {
  number: number;
  title: string;
  objective: string;
  scenes: ParsedScene[];
}

export interface ParsedModule {
  number: number;
  title: string;
  description: string;
  lessons: ParsedLesson[];
}

export interface ParsedCourse {
  title: string;
  header: ParsedHeader;
  modules: ParsedModule[];
}

/* ------------------------------------------------------------------ */
/* Análise do Markdown                                                  */
/* ------------------------------------------------------------------ */

const DASH = '[—–-]';
const H1_RE = /^#\s+(.+?)\s*$/;
const H2_RE = /^##\s+/;
const MODULE_RE = new RegExp(`^##\\s+M[óo]dulo\\s+(\\d+)\\s*${DASH}\\s*(.+?)\\s*$`);
const LESSON_RE = new RegExp(`^###\\s+Aula\\s+(\\d+)\\s*${DASH}\\s*(.+?)\\s*$`);
const SCENE_RE = new RegExp(`^###\\s+(FIM|AV\\d+|V\\d+|Q\\d+|M\\d+|A\\d+)\\s*${DASH}\\s*(.+?)\\s*$`);
const H3_RE = /^###\s+/;
const KEY_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()/-]{0,40}?):\s*(.*)$/;
const BULLET_RE = /^-\s+(.+?)\s*$/;
const SLOT_RE = /^-\s+\{([A-Za-z_][A-Za-z0-9_]*)\}:\s*(.+?)\s*$/;
const QUESTION_RE = /^(\d+)[.)]\s+(.+?)\s*$/;
const ALT_RE = /^\s+-\s+(.+?)\s*$/;
const EXPLANATION_RE = /^\s*Explica[çc][ãa]o:\s*(.+?)\s*$/;
const CORRECT_RE = /\s*\((correta|certa)\)\s*$/i;
const TABLE_SEP_RE = /^\|\s*-{2,}/;

export class MarkdownCourseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(line ? `linha ${line}: ${message}` : message);
    this.name = 'MarkdownCourseError';
  }
}

const foldKey = (k: string) => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const stripQuotes = (s: string) => s.trim().replace(/^["“”«]+/, '').replace(/["“”»]+$/, '').trim();
const splitDots = (s: string) => s.split(/\s+·\s+|\s+•\s+/).map((x) => x.trim()).filter(Boolean);
const yes = (v: string) => /^(sim|yes|true|s)$/i.test(v.trim());

/** Linha `Chave: valor` com a chave normalizada (sem acento, minúscula). */
function keyLine(line: string): { key: string; value: string } | undefined {
  const m = KEY_RE.exec(line);
  if (!m) return undefined;
  return { key: foldKey(m[1]!), value: m[2]!.trim() };
}

function pickField(fields: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const hit = Object.entries(fields).find(([k]) => foldKey(k).startsWith(foldKey(n)));
    if (hit) return hit[1];
  }
  return '';
}

function parseHeader(lines: string[]): { title: string; header: ParsedHeader } {
  let title = '';
  const fields: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = H1_RE.exec(line);
    if (h && !title) {
      title = h[1]!;
      continue;
    }
    const m = KEY_RE.exec(line);
    if (m) fields[m[1]!.trim()] = m[2]!.trim();
  }
  return {
    title,
    header: {
      fields,
      idea: pickField(fields, 'Ideia', 'Tema'),
      audience: pickField(fields, 'Publico', 'Público'),
      finalGoal: pickField(fields, 'Objetivo final', 'Objetivo'),
      targetDuration: pickField(fields, 'Duracao-alvo', 'Duracao', 'Duração'),
      characters: pickField(fields, 'Personagens'),
    },
  };
}

type Block = { code: string; title: string; line: number; body: string[] };

function parseVideo(b: Block): ParsedVideo {
  const narrationParts: string[] = [];
  let screenText = '';
  let card: ParsedCard | undefined;
  let mode: 'none' | 'narration' | 'card' = 'none';
  for (const raw of b.body) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\*\*Fala para grava[çc][ãa]o\*\*$/i.test(line)) {
      mode = 'narration';
      continue;
    }
    const kv = keyLine(line);
    if (kv && !line.startsWith('"') && !line.startsWith('“')) {
      if (kv.key === 'texto na tela') {
        screenText = kv.value;
        mode = 'none';
        continue;
      }
      if (kv.key === 'cartao') {
        card = { title: kv.value, bullets: [] };
        mode = 'card';
        continue;
      }
      if (kv.key === 'destino') {
        mode = 'none';
        continue;
      }
    }
    const bullet = BULLET_RE.exec(line);
    if (mode === 'card' && bullet && card) {
      card.bullets.push(bullet[1]!);
      continue;
    }
    if (mode === 'narration') narrationParts.push(line);
  }
  const narration = smartQuotes(stripQuotes(narrationParts.join(' ').replace(/\s+/g, ' ')));
  if (!narration) throw new MarkdownCourseError(`vídeo ${b.code} sem "Fala para gravação"`, b.line);
  return { kind: 'video', code: b.code, title: b.title, narration, screenText, ...(card ? { card } : {}) };
}

const QUALITY: Record<string, ChoiceQuality> = { forte: 'strong', strong: 'strong', ok: 'ok', media: 'ok', fraca: 'weak', weak: 'weak' };

function parseDecision(b: Block): ParsedDecision {
  let situation = '';
  let voiceOptional = false;
  let call = '';
  const options: ParsedDecisionOption[] = [];
  let headerSeen = false;
  // colunas pelo cabeçalho: `Escolha | Qualidade | Reação | Feedback | Destino` (Reação opcional; sem cabeçalho, a ordem antiga)
  let col = { label: 0, quality: 1, feedback: 2, destination: 3, reaction: -1 };
  for (const raw of b.body) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('|')) {
      if (TABLE_SEP_RE.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      // a divisão deixa uma célula vazia em cada ponta
      if (cells[0] === '') cells.shift();
      if (cells[cells.length - 1] === '') cells.pop();
      if (!headerSeen) {
        headerSeen = true;
        if (/^escolha$/i.test(cells[0] ?? '')) {
          const at = (re: RegExp) => cells.findIndex((c) => re.test(foldKey(c)));
          const found = { label: 0, quality: at(/^qualidade$/), feedback: at(/^(feedback|retorno)$/), destination: at(/^destino$/), reaction: at(/^reacao$/) };
          if (found.quality < 0 || found.feedback < 0 || found.destination < 0) throw new MarkdownCourseError(`decisão ${b.code}: cabeçalho da tabela precisa de Escolha | Qualidade | Feedback | Destino (Reação opcional)`, b.line);
          col = found;
          continue;
        }
      }
      const need = Math.max(col.quality, col.feedback, col.destination, col.reaction) + 1;
      if (cells.length < need) throw new MarkdownCourseError(`decisão ${b.code}: linha da tabela com ${cells.length} colunas (esperadas ${need}: ${col.reaction >= 0 ? 'Escolha | Qualidade | Reação | Feedback | Destino' : 'Escolha | Qualidade | Feedback | Destino'})`, b.line);
      const quality = QUALITY[foldKey(cells[col.quality]!)];
      if (!quality) throw new MarkdownCourseError(`decisão ${b.code}: qualidade "${cells[col.quality]}" desconhecida (forte, ok ou fraca)`, b.line);
      const reaction = col.reaction >= 0 ? smartQuotes(stripQuotes(cells[col.reaction] ?? '')) : '';
      options.push({ label: cells[0]!, quality, feedback: cells[col.feedback]!, destination: cells[col.destination]!.trim(), ...(reaction ? { reaction } : {}) });
      continue;
    }
    const kv = keyLine(line);
    if (kv?.key === 'situacao') situation = kv.value;
    else if (kv?.key === 'voz opcional') voiceOptional = yes(kv.value);
    else if (kv?.key === 'chamada') call = smartQuotes(stripQuotes(kv.value));
  }
  if (options.length < 2) throw new MarkdownCourseError(`decisão ${b.code} precisa de ao menos 2 escolhas na tabela`, b.line);
  return { kind: 'decision', code: b.code, title: b.title, situation, voiceOptional, ...(call ? { call } : {}), options };
}

function parseScaffold(b: Block): ParsedScaffoldScene {
  let template = '';
  let destination = '';
  const slots: ParsedScaffoldScene['slots'] = [];
  for (const raw of b.body) {
    const line = raw.trim();
    if (!line) continue;
    const slot = SLOT_RE.exec(line);
    if (slot) {
      slots.push({ id: slot[1]!, options: splitDots(slot[2]!) });
      continue;
    }
    const kv = keyLine(line);
    if (kv?.key === 'montar frase') template = stripQuotes(kv.value);
    else if (kv?.key === 'destino') destination = kv.value;
  }
  if (!template) throw new MarkdownCourseError(`composição ${b.code} sem "Montar frase:"`, b.line);
  if (!destination) throw new MarkdownCourseError(`composição ${b.code} sem "Destino:"`, b.line);
  return { kind: 'scaffold', code: b.code, title: b.title, template, slots, destination };
}

function parseAssessment(b: Block): ParsedAssessment {
  let attempts = 2;
  let passMin = 0;
  let passOf = 0;
  let destination = '';
  const questions: ParsedQuestion[] = [];
  for (const raw of b.body) {
    if (!raw.trim()) continue;
    const q = QUESTION_RE.exec(raw.trim());
    const indented = /^\s/.test(raw);
    if (q && !indented) {
      questions.push({ text: q[2]!, alternatives: [], explanation: '' });
      continue;
    }
    const alt = ALT_RE.exec(raw);
    const current = questions[questions.length - 1];
    if (alt && current) {
      const correct = CORRECT_RE.test(alt[1]!);
      current.alternatives.push({ label: alt[1]!.replace(CORRECT_RE, '').trim(), correct });
      continue;
    }
    const ex = EXPLANATION_RE.exec(raw);
    if (ex && current && (indented || !questions.length)) {
      current.explanation = ex[1]!;
      continue;
    }
    const kv = keyLine(raw.trim());
    if (kv?.key === 'tentativas') attempts = Math.max(1, Number.parseInt(kv.value, 10) || 1);
    else if (kv?.key === 'aprovacao') {
      const m = /(\d+)\s*(?:de|\/)\s*(\d+)/.exec(kv.value);
      if (m) {
        passMin = Number(m[1]);
        passOf = Number(m[2]);
      } else passMin = Number.parseInt(kv.value, 10) || 0;
    } else if (kv?.key === 'destino') destination = kv.value;
    else if (kv?.key === 'explicacao' && current) current.explanation = kv.value;
  }
  if (!questions.length) throw new MarkdownCourseError(`avaliação ${b.code} sem perguntas`, b.line);
  for (const [i, q] of questions.entries()) {
    if (q.alternatives.length < 2) throw new MarkdownCourseError(`avaliação ${b.code}, pergunta ${i + 1}: menos de 2 alternativas`, b.line);
    if (!q.alternatives.some((a) => a.correct)) throw new MarkdownCourseError(`avaliação ${b.code}, pergunta ${i + 1}: nenhuma alternativa marcada (correta)`, b.line);
  }
  if (!destination) throw new MarkdownCourseError(`avaliação ${b.code} sem "Destino:"`, b.line);
  if (!passOf) passOf = questions.length;
  if (!passMin) passMin = questions.length;
  return { kind: 'assessment', code: b.code, title: b.title, attempts, passMin, passOf, questions, destination };
}

function parseNote(b: Block): ParsedNote {
  let text = '';
  let skippable = false;
  let destination = '';
  let free = '';
  for (const raw of b.body) {
    const line = raw.trim();
    if (!line) continue;
    const kv = keyLine(line);
    if (kv?.key === 'pergunta' || kv?.key === 'texto') text = kv.value;
    else if (kv?.key === 'pular') skippable = yes(kv.value);
    else if (kv?.key === 'destino') destination = kv.value;
    else if (!kv && !free) free = line;
  }
  if (!destination) throw new MarkdownCourseError(`anotação ${b.code} sem "Destino:"`, b.line);
  return { kind: 'note', code: b.code, title: b.title, text: text || free, skippable, destination };
}

function parseEnd(b: Block): ParsedEnd {
  const takeaways: string[] = [];
  const myScript: string[] = [];
  let checklist: ParsedEnd['checklist'];
  for (const raw of b.body) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      takeaways.push(bullet[1]!);
      continue;
    }
    const kv = keyLine(line);
    if (kv?.key === 'meu roteiro') myScript.push(...kv.value.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean));
    else if (kv?.key === 'checklist') {
      const at = kv.value.indexOf(':');
      const title = at > 0 ? kv.value.slice(0, at).trim() : 'Checklist';
      checklist = { title, items: splitDots(at > 0 ? kv.value.slice(at + 1) : kv.value) };
    }
  }
  return { kind: 'end', code: 'FIM', title: b.title, takeaways, myScript, ...(checklist ? { checklist } : {}) };
}

function parseScene(b: Block): ParsedScene {
  if (b.code === 'FIM') return parseEnd(b);
  if (b.code.startsWith('AV')) return parseAssessment(b);
  if (b.code.startsWith('V')) return parseVideo(b);
  if (b.code.startsWith('Q')) return parseDecision(b);
  if (b.code.startsWith('M')) return parseScaffold(b);
  if (b.code.startsWith('A')) return parseNote(b);
  throw new MarkdownCourseError(`código de cena desconhecido "${b.code}"`, b.line);
}

/** Lê o roteiro em Markdown. Erros de formato viram `MarkdownCourseError` (com a linha). */
export function parseMarkdownCourse(md: string): ParsedCourse {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const firstModule = lines.findIndex((l) => MODULE_RE.test(l));
  const { title, header } = parseHeader(firstModule === -1 ? lines : lines.slice(0, firstModule));
  if (!title) throw new MarkdownCourseError('o roteiro precisa começar com "# Título"');
  if (firstModule === -1) throw new MarkdownCourseError('nenhum "## Módulo N — título" encontrado');

  const modules: ParsedModule[] = [];
  let module: ParsedModule | undefined;
  let lesson: ParsedLesson | undefined;
  let block: Block | undefined;
  let lessonHeaderLines: string[] = [];
  let stopped = false;

  const flushBlock = () => {
    if (!block) return;
    if (!lesson) throw new MarkdownCourseError(`cena ${block.code} fora de uma aula`, block.line);
    lesson.scenes.push(parseScene(block));
    block = undefined;
  };
  const flushLesson = () => {
    flushBlock();
    if (!lesson) return;
    for (const l of lessonHeaderLines) {
      const kv = keyLine(l.trim());
      if (kv?.key === 'objetivo') lesson.objective = kv.value;
    }
    lessonHeaderLines = [];
    lesson = undefined;
  };

  for (let i = firstModule; i < lines.length && !stopped; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    const mod = MODULE_RE.exec(line);
    if (mod) {
      flushLesson();
      module = { number: Number(mod[1]), title: mod[2]!, description: '', lessons: [] };
      modules.push(module);
      continue;
    }
    if (H2_RE.test(line)) {
      // qualquer outra seção "##" (ex.: "Notas para a montagem") encerra o roteiro
      flushLesson();
      stopped = true;
      break;
    }
    const les = LESSON_RE.exec(line);
    if (les) {
      flushLesson();
      if (!module) throw new MarkdownCourseError('aula fora de um módulo', i + 1);
      lesson = { number: Number(les[1]), title: les[2]!, objective: '', scenes: [] };
      module.lessons.push(lesson);
      continue;
    }
    const sc = SCENE_RE.exec(line);
    if (sc) {
      flushBlock();
      block = { code: sc[1]!, title: sc[2]!, line: i + 1, body: [] };
      continue;
    }
    if (H3_RE.test(line)) throw new MarkdownCourseError(`cabeçalho "###" não reconhecido: ${line}`, i + 1);
    if (block) block.body.push(raw);
    else if (lesson) lessonHeaderLines.push(raw);
    else if (module) {
      const kv = keyLine(line);
      if (kv?.key === 'descricao') module.description = kv.value;
    }
  }
  flushLesson();

  // códigos únicos no curso inteiro
  const seen = new Map<string, string>();
  for (const m of modules)
    for (const l of m.lessons)
      for (const s of l.scenes) {
        if (s.kind === 'end') continue;
        const where = `aula ${l.number}`;
        if (seen.has(s.code)) throw new MarkdownCourseError(`código ${s.code} repetido (${seen.get(s.code)} e ${where})`);
        seen.set(s.code, where);
      }
  return { title, header, modules };
}

/* ------------------------------------------------------------------ */
/* Texto rico                                                           */
/* ------------------------------------------------------------------ */

type TextNode = { type: 'text'; text: string; marks?: Array<{ type: 'bold' }> };

/** Texto com `**negrito**` → nós de texto com a marca bold. */
function inline(text: string): TextNode[] {
  return boldSegments(text).map((s) => (s.bold ? { type: 'text', text: s.text, marks: [{ type: 'bold' }] } : { type: 'text', text: s.text }));
}
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: inline(text) });
const doc = (...blocks: RichTextDocument['content']): RichTextDocument => ({ type: 'doc', content: blocks });
const paragraphs = (...texts: string[]): RichTextDocument => doc(...texts.filter((t) => t.trim()).map(paragraph));
const list = (items: string[]) => ({ type: 'bulletList' as const, content: items.map((t) => ({ type: 'listItem' as const, content: [paragraph(t)] })) });

const wc = (s: string) => spokenWords(s).length;
const clipWords = (s: string, max: number) => s.trim().split(/\s+/).slice(0, max).join(' ');
const clipChars = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/* ------------------------------------------------------------------ */
/* Direção do vídeo com cartão                                           */
/* ------------------------------------------------------------------ */

/** Divide a fala em frases mantendo o texto original (pontuação incluída). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["'”’»)]*(?=\s|$)/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Limites dos planos (os mesmos da IA diretora em `@lms/ai`): cartão 13–39 palavras; plano com apresentadora 3–26. */
export const CARD_SHOT_WORDS = { min: 13, max: 39 } as const;
export const PRESENTER_SHOT_WORDS = { min: 3, max: 26 } as const;

/** Agrupa frases em planos de até `max` palavras (uma frase maior fica sozinha). */
function groupLines(sentences: string[], max = PRESENTER_SHOT_WORDS.max): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && wc(cur) + wc(s) > max) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  // planos curtos demais se juntam ao vizinho
  for (let i = 0; i < out.length && out.length > 1; ) {
    if (wc(out[i]!) >= PRESENTER_SHOT_WORDS.min) {
      i++;
      continue;
    }
    if (i > 0) out.splice(i - 1, 2, `${out[i - 1]} ${out[i]}`);
    else out.splice(0, 2, `${out[0]} ${out[1]}`);
  }
  return out;
}

const GESTURE_CYCLE = ['open_palms_honest', 'lean_in_curious', 'hands_explaining', 'relaxed_shoulders_reassuring', 'nod_warm', 'hands_together_focused'] as const;
const gesture = (id: string) => SAFE_GESTURES.find((g) => g.id === id)?.prompt ?? 'nods slowly, warm';

export interface CardDirectionOptions {
  /** câmera principal (planos com apresentadora); ausente = sem `cameraId` */
  cameraId?: string;
  variant: SlideVariant;
  sceneTitle: string;
  /**
   * a câmera principal é `full_frame` (visual com o próprio cenário): todos os
   * planos usam este enquadramento nativo, estáticos — nunca zoom digital
   */
  fullFrameNative?: ShotFraming;
  /** `card` = o cartão em tela cheia de antes (sem apresentadora); padrão `presenter_panel` */
  cardLayout?: 'presenter_panel' | 'card';
  /**
   * estúdio com zonas: a fala vai na câmera de fala da cena (`talk`) e o
   * cartão vira `presenter_chips` na câmera lateral `chips` (o lado que
   * alterna com as pílulas anteriores). Cada câmera com o enquadramento
   * nativo dela (tela cheia, sem zoom). Ignora `cameraId`/`cardLayout`.
   */
  zone?: { talk: { cameraId: string; framing: ShotFraming }; chips: { cameraId: string; framing: ShotFraming } };
}

/**
 * Direção de uma fala com cartão: a apresentadora abre (câmera principal), o
 * cartão cobre o trecho que enumera os tópicos (13–39 palavras, de preferência
 * no meio) e a apresentadora fecha. As `line` são recortes exatos da fala, por
 * frases, então `directionLinesMatchSpoken` vale. `undefined` quando não há
 * recorte possível (fala curta demais ou sem trecho de cartão no tamanho).
 */
export function buildCardDirection(narration: string, card: ParsedCard, opts: CardDirectionOptions): SceneDirection | undefined {
  const sents = splitSentences(narration);
  const n = sents.length;
  if (n < 2) return undefined;
  const keywords = card.bullets.flatMap((b) => spokenWords(stripBold(b))).filter((w) => w.length >= 4);
  const words = sents.map(wc);
  const sum = (a: number, b: number) => words.slice(a, b).reduce((x, y) => x + y, 0);
  let best: { i: number; j: number; score: number } | undefined;
  for (let i = 1; i < n; i++) {
    for (let j = i + 1; j <= n; j++) {
      const cardWords = sum(i, j);
      if (cardWords < CARD_SHOT_WORDS.min) continue;
      if (cardWords > CARD_SHOT_WORDS.max) break;
      const closing = sum(j, n);
      if (j < n && closing < PRESENTER_SHOT_WORDS.min) continue;
      const segment = spokenWords(sents.slice(i, j).join(' '));
      const hits = keywords.filter((k) => segment.includes(k)).length;
      const center = (i + j) / 2;
      let score = Math.abs(cardWords - 26) + Math.abs(center - n / 2) * 2 - hits * 3;
      if (j === n) score += 12; // fechar no cartão é pior que voltar à apresentadora
      if (!best || score < best.score) best = { i, j, score };
    }
  }
  if (!best) return undefined;
  const opening = groupLines(sents.slice(0, best.i));
  const closing = groupLines(sents.slice(best.j));
  const cardLine = sents.slice(best.i, best.j).join(' ');
  const shots: Shot[] = [];
  let prevGesture = -1;
  let presenterIndex = 0;
  const presenter = (line: string): Shot => {
    const g = (prevGesture + 1) % GESTURE_CYCLE.length;
    prevGesture = g;
    const framing = opts.zone ? opts.zone.talk.framing : (opts.fullFrameNative ?? (presenterIndex++ % 2 === 0 ? 'medium' : 'close'));
    const cameraId = opts.zone ? opts.zone.talk.cameraId : opts.cameraId;
    return {
      id: `s${shots.length + 1}`,
      line,
      ...(cameraId ? { cameraId } : {}),
      framing,
      layout: 'presenter',
      cameraMove: 'static',
      motionPrompt: gesture(GESTURE_CYCLE[g]!),
      transitionIn: 'cut',
    };
  };
  for (const line of opening) shots.push(presenter(line));
  const cardSlide = {
    title: clipWords(stripBold(card.title), CARD_LIMITS.titleWords).slice(0, 80),
    bullets: card.bullets.slice(0, 4).map((b) => b.slice(0, 90)),
    style: 'checklist' as const,
  };
  if (opts.zone) {
    // estúdio com zonas: a apresentadora num terço (câmera lateral, sem transformação) e as pílulas na parede livre, surgindo quando ditas
    const p = presenter(cardLine);
    shots.push({ ...p, cameraId: opts.zone.chips.cameraId, framing: opts.zone.chips.framing, layout: 'presenter_chips', slide: { ...cardSlide, bullets: card.bullets.slice(0, CHIPS_LIMITS.chips).map((b) => b.slice(0, 90)) } });
  } else if (opts.cardLayout === 'card') {
    shots.push({ id: `s${shots.length + 1}`, line: cardLine, framing: 'medium', layout: 'card', cameraMove: 'static', slide: { ...cardSlide, variant: opts.variant }, transitionIn: 'cut' });
  } else {
    // padrão: a apresentadora continua (câmera principal, com gesto) e o painel mostra os tópicos, que acendem quando ditos
    const p = presenter(cardLine);
    shots.push({ ...p, framing: opts.fullFrameNative ?? 'medium', layout: 'presenter_panel', slide: cardSlide });
  }
  for (const line of closing) shots.push(presenter(line));
  const direction: SceneDirection = { version: 1, shots, intent: opts.zone ? `Estúdio com zonas: a fala na câmera da cena; as pílulas "${clipWords(stripBold(card.title), 6)}" surgem na parede livre e a fala volta.` : opts.cardLayout === 'card' ? `Apresentadora na câmera principal; o cartão "${clipWords(stripBold(card.title), 6)}" cobre a lista e a fala volta a ela.` : `Apresentadora na câmera principal; o painel "${clipWords(stripBold(card.title), 6)}" mostra a lista ao lado dela e a fala segue com ela.`, source: 'author' };
  if (!sameWords(shots.map((s) => s.line).join(' '), narration)) return undefined;
  return direction;
}

/**
 * Estúdio com zonas: direção de uma fala SEM cartão — os planos (frases
 * agrupadas, 3–26 palavras) ficam todos na câmera de fala da cena, com o
 * enquadramento nativo dela (sem zoom; nenhum corte de câmera dentro da cena).
 * `undefined` quando a fala não tem palavras.
 */
export function buildTalkDirection(narration: string, talk: { cameraId: string; framing: ShotFraming }): SceneDirection | undefined {
  const lines = groupLines(splitSentences(narration));
  if (!lines.length) return undefined;
  const shots: Shot[] = lines.map((line, i) => ({
    id: `s${i + 1}`,
    line,
    cameraId: talk.cameraId,
    framing: talk.framing,
    layout: 'presenter',
    cameraMove: 'static',
    motionPrompt: gesture(GESTURE_CYCLE[i % GESTURE_CYCLE.length]!),
    transitionIn: 'cut',
  }));
  if (!sameWords(shots.map((s) => s.line).join(' '), narration)) return undefined;
  return { version: 1, shots, intent: 'Estúdio com zonas: a fala inteira na câmera da cena (as cenas alternam entre a 3/4 e as laterais).', source: 'author' };
}

/** Câmeras do estúdio com zonas resolvidas para o importador: ids por zona + enquadramento de cada uma (nativo na tela cheia). */
export interface ImportZones {
  set: ZoneCameraSet;
  framing: (cameraId: string) => ShotFraming;
}

export function importZonesFrom(presentation: Partial<Presentation> | undefined): ImportZones | undefined {
  const cameras = (presentation?.cameras ?? []) as Camera[];
  const set = zoneCamerasOf(cameras);
  if (!set) return undefined;
  return {
    set,
    framing: (id) => {
      const cam = cameras.find((c) => c.id === id);
      return cam && resolveCameraPlacement(presentation ?? null, cam).placement === 'full_frame' ? (cam.nativeFraming ?? 'medium') : 'medium';
    },
  };
}

/* ------------------------------------------------------------------ */
/* Conversão em documento                                                */
/* ------------------------------------------------------------------ */

export interface MarkdownCourseOptions {
  /** título do curso (padrão: o `# Título` do roteiro) */
  title?: string;
  /** apresentação (apresentadora, voz, cenário, câmeras); `directionStyle.cameraMode` vira `single` */
  presentation?: Partial<Presentation>;
  branding?: Partial<Branding>;
  /** quem apresenta (vai para `cast`); padrão: nome/papel da marca */
  presenter?: { name: string; role: string; details?: string };
  /** frase de fechamento dos encerramentos */
  closingLine?: string;
  tone?: string;
  narrativeVoice?: CourseDocument['brief']['narrativeVoice'];
  sourcesNote?: string;
  /** minutos por aula (orientação); padrão: lido de "Duração-alvo" ou 6 */
  lessonMinutes?: number;
  /** duração total alvo; padrão: lida de "Duração-alvo" */
  targetMinutes?: number;
  audienceProfile?: CourseDocument['brief']['audienceProfile'];
  level?: CourseDocument['brief']['level'];
  traits?: CourseDocument['brief']['traits'];
  /** câmera dos planos com apresentadora; padrão: a primeira do kit */
  mainCameraId?: string;
  /** (interno) enquadramento nativo da câmera principal quando ela é `full_frame` (sem zoom digital) */
  mainCameraFullFrameNative?: ShotFraming;
  /** gravar a direção dos vídeos com cartão (padrão: sim) */
  direction?: boolean;
  /**
   * (interno) estúdio com zonas: as câmeras da apresentação com `zone`.
   * Automático quando o kit tem câmeras de zona: TODOS os vídeos ganham
   * direção (a fala na câmera da cena, alternando 3/4 e laterais; o cartão
   * vira pílulas numa câmera lateral alternando o lado).
   */
  zones?: ImportZones;
}

export interface MarkdownImportReport {
  document: CourseDocument;
  /** avisos da conversão (cartão sem direção, limites editoriais…) */
  warnings: CompileIssue[];
}

/** "12 aulas de 5 a 7 minutos (cerca de 1h15 no total)" → { lessonMinutes, targetMinutes }. */
export function parseTargetDuration(text: string, lessons: number): { lessonMinutes?: number; targetMinutes?: number } {
  const range = /de\s+(\d+)\s+a\s+(\d+)\s+min/i.exec(text);
  const single = /(\d+)\s+min\w*\s+por\s+aula/i.exec(text);
  const lessonMinutes = range ? Math.ceil((Number(range[1]) + Number(range[2])) / 2) : single ? Number(single[1]) : undefined;
  const hm = /(\d+)\s*h\s*(\d{1,2})?/i.exec(text);
  const total = /(?:total|no total)[^0-9]*(\d+)\s*min/i.exec(text) ?? /(\d+)\s*min\w*\s+no\s+total/i.exec(text);
  let targetMinutes: number | undefined;
  if (hm) targetMinutes = Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  else if (total) targetMinutes = Number(total[1]);
  else if (lessonMinutes && lessons) targetMinutes = lessonMinutes * lessons;
  return { lessonMinutes, targetMinutes };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const nodeIdOf = (code: string) => code.toLowerCase();
const POINTS: Record<ChoiceQuality, number> = { strong: 2, ok: 1, weak: 0 };

function layoutRows(rows: string[][]): LessonGraph['layout'] {
  const positions: Record<string, { x: number; y: number }> = {};
  rows.forEach((row, r) => {
    const offset = ((row.length - 1) * 320) / 2;
    row.forEach((id, c) => {
      positions[id] = { x: c * 320 - offset, y: r * 180 };
    });
  });
  return { positions };
}

/** Nome legível da lacuna a partir do id (`habilidade_principal` → "habilidade principal"). */
/** Rótulo legível da lacuna: o id vem sem acento no roteiro ({experiencia}); restauramos a grafia. */
const SLOT_WORDS: Record<string, string> = {
  acao: 'ação', area: 'área', experiencia: 'experiência', frequencia: 'frequência', situacao: 'situação',
  habilidade: 'habilidade', funcao: 'função', opcao: 'opção', informacao: 'informação', comunicacao: 'comunicação',
  porque: 'por quê', voce: 'você', pratica: 'prática', proximo: 'próximo', proxima: 'próxima', solucao: 'solução',
};
const slotLabel = (id: string) => id.split('_').map((w) => SLOT_WORDS[w] ?? w).join(' ').slice(0, 60);

/** Aspas retas → tipográficas (“…” e ‘…’), preservando apóstrofos dentro de palavras. */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, '$1\u201C').replace(/"/g, '\u201D')
    .replace(/(^|[\s([{—–-])'/g, '$1\u2018').replace(/'/g, '\u2019');
}

/** Rótulo do item de roteiro: o texto antes do parêntese ou do código. */
export function recapLabel(item: string): string {
  const CODE = String.raw`\b(?:AV|V|Q|M|A)\d+\b`;
  const raw = item
    .replace(/\(.*?\)/g, '')
    // "junto às frases M01 a M05" / "M01, M02 e M03": a lista inteira de códigos sai junto com o conector
    .replace(new RegExp(String.raw`,?\s*junto\s+(?:às|as|com\s+as)\s+frases\s+${CODE}(?:\s*(?:a|e|,)\s*${CODE})*`, 'gi'), '')
    .replace(new RegExp(String.raw`${CODE}(?:\s*(?:a|e|,)\s*${CODE})*`, 'g'), '')
    // conector que sobrou sem o código: ", montada em", "frase montada em", "feito na"
    .replace(/,?\s*(?:frase\s+)?(?:montad|feit|criad|escrit|escolhid|marcad|respondid)[oa]s?\s+(?:em|na|no)\b(?=\s*(?:[,.;:]|$))/gi, '')
    .replace(/,?\s*se preenchida/i, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[\s,.:;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = raw.replace(/^checklist\s*/i, '').replace(/^["“]|["”]$/g, '').trim() || item.trim();
  return clipChars(text.charAt(0).toUpperCase() + text.slice(1), 80);
}

interface LessonBuild {
  lesson: Lesson;
  objective: Objective;
  nodeCount: number;
  edgeCount: number;
}

function buildLesson(
  parsed: ParsedLesson,
  ctx: { moduleObjectiveIds: string[]; lessonId: string; objectiveId: string; lastOfCourse: boolean; opts: MarkdownCourseOptions; warn: (i: CompileIssue) => void; nextVariant: () => SlideVariant; allCodes: Map<string, string>; reactionIndex: (advance?: number) => number },
): LessonBuild {
  const { lessonId, objectiveId, opts, warn } = ctx;
  const endId = `fim_${lessonId}`;
  const retryEndId = `${endId}_revisar`;
  const scenes = parsed.scenes;
  const end = scenes.find((s): s is ParsedEnd => s.kind === 'end');
  if (!end) throw new MarkdownCourseError(`aula ${parsed.number} ("${parsed.title}") não tem "### FIM"`);
  const localCodes = new Set(scenes.filter((s) => s.kind !== 'end').map((s) => s.code));
  const assessments = scenes.filter((s): s is ParsedAssessment => s.kind === 'assessment');
  const hasDecisions = scenes.some((s) => s.kind === 'decision');
  const hasAssessment = assessments.length > 0;

  /** id do nó de entrada de uma cena (avaliação = primeira pergunta). */
  const entryOf = (code: string) => (code.startsWith('AV') ? `${nodeIdOf(code)}_q1` : nodeIdOf(code));
  const resolve = (dest: string, from: string): string => {
    const d = dest.trim();
    if (/^fim$/i.test(d)) return endId;
    if (localCodes.has(d)) return entryOf(d);
    const elsewhere = ctx.allCodes.get(d);
    throw new MarkdownCourseError(`aula ${parsed.number}: destino "${d}" de ${from} ${elsewhere ? `está em outra aula (${elsewhere})` : 'não existe'}`);
  };
  const nextOf = (index: number, from: string): string => {
    const next = scenes[index + 1];
    if (!next) throw new MarkdownCourseError(`aula ${parsed.number}: ${from} é a última cena e não tem destino`);
    return next.kind === 'end' ? endId : entryOf(next.code);
  };

  const nodes: AnyNode[] = [];
  const edges: Edge[] = [];
  const rows: string[][] = [];
  const go = (id: string, from: string, to: string, extra: Partial<Edge> = {}): Edge => ({ id, from, to, ...extra });
  let firstVideo = true;
  let videoIndex = 0;
  // estúdio com zonas: lado das últimas pílulas da aula (o próximo plano de pílulas vai para o outro lado)
  let chipsSide: 'left' | 'right' | undefined;

  scenes.forEach((scene, index) => {
    if (scene.kind === 'end') return;
    const id = nodeIdOf(scene.code);
    switch (scene.kind) {
      case 'video': {
        const type = firstVideo ? 'scenario' : 'content';
        firstVideo = false;
        videoIndex++;
        let body = paragraphs(scene.screenText || scene.title);
        let direction: SceneDirection | undefined;
        if (scene.card) {
          if (scene.card.bullets.length > CARD_LIMITS.bullets) warn({ code: 'CARD_TOO_MANY_BULLETS', lessonId, nodeId: id, message: `${scene.code}: cartão com ${scene.card.bullets.length} tópicos (recomendado até ${CARD_LIMITS.bullets})` });
          for (const b of scene.card.bullets) if (wc(stripBold(b)) > CARD_LIMITS.bulletWords) warn({ code: 'CARD_BULLET_TOO_LONG', lessonId, nodeId: id, message: `${scene.code}: tópico do cartão com ${wc(stripBold(b))} palavras (máximo ${CARD_LIMITS.bulletWords})` });
          if (wc(stripBold(scene.card.title)) > CARD_LIMITS.titleWords) warn({ code: 'CARD_TITLE_TOO_LONG', lessonId, nodeId: id, message: `${scene.code}: título do cartão com ${wc(stripBold(scene.card.title))} palavras (máximo ${CARD_LIMITS.titleWords})` });
          const variant = ctx.nextVariant();
          const z = opts.zones;
          const talkId = z ? zoneTalkCamera(z.set, videoIndex - 1) : undefined;
          const pick = z ? nextChipsCamera(z.set, chipsSide) : undefined;
          const zone = z && talkId && pick ? { talk: { cameraId: talkId, framing: z.framing(talkId) }, chips: { cameraId: pick.cameraId, framing: z.framing(pick.cameraId) } } : undefined;
          direction = opts.direction === false ? undefined : buildCardDirection(scene.narration, scene.card, { ...(opts.mainCameraId ? { cameraId: opts.mainCameraId } : {}), variant, sceneTitle: scene.title, ...(opts.mainCameraFullFrameNative ? { fullFrameNative: opts.mainCameraFullFrameNative } : {}), ...(zone ? { zone } : {}) });
          if (direction && pick && direction.shots.some((s) => s.layout === 'presenter_chips')) chipsSide = pick.zone;
          if (!direction) {
            // sem recorte possível: o cartão vai para o texto da tela (TODO: montar a direção à mão no estúdio)
            body = doc(paragraph(scene.screenText || scene.title), paragraph(scene.card.title), list(scene.card.bullets));
            warn({ code: 'CARD_WITHOUT_DIRECTION', lessonId, nodeId: id, message: `${scene.code}: não foi possível recortar a fala para o cartão "${stripBold(scene.card.title)}"; o cartão ficou no texto da tela (TODO: direção manual)` });
          }
        }
        // estúdio com zonas: as falas sem cartão também ganham direção (câmera da cena; as cenas alternam 3/4 e laterais)
        if (!direction && !scene.card && opts.zones && opts.direction !== false) {
          const talkId = zoneTalkCamera(opts.zones.set, videoIndex - 1);
          direction = buildTalkDirection(scene.narration, { cameraId: talkId, framing: opts.zones.framing(talkId) });
        }
        if (wc(scene.narration) > 120) warn({ code: 'NARRATION_TOO_LONG', lessonId, nodeId: id, message: `${scene.code}: fala com ${wc(scene.narration)} palavras (máximo 120)` });
        if (wc(scene.narration) < 60) warn({ code: 'NARRATION_SHORT', lessonId, nodeId: id, message: `${scene.code}: fala com ${wc(scene.narration)} palavras (alvo 60–120)` });
        if (wc(scene.screenText) > 25) warn({ code: 'SCREEN_TEXT_WITH_NARRATION', lessonId, nodeId: id, message: `${scene.code}: ${wc(scene.screenText)} palavras na tela numa cena com fala (recomendado até 25)` });
        const gestureId = videoIndex % 2 === 1 ? 'smile_welcoming' : 'open_palms_honest';
        nodes.push({
          id,
          type,
          title: clipChars(scene.title, 120),
          objectiveIds: [objectiveId],
          required: true,
          body,
          narration: scene.narration,
          motionPrompt: gesture(gestureId),
          ...(direction ? { direction } : {}),
        });
        edges.push(go(`e_${id}`, id, nextOf(index, scene.code)));
        rows.push([id]);
        break;
      }
      case 'decision': {
        if (!scene.call) warn({ code: 'CALL_DEFAULT', lessonId, nodeId: id, message: `${scene.code}: sem "Chamada:"; montada do enunciado ("${callFromSituation(scene.situation, scene.title)}")` });
        else if (wc(scene.call) > 16) warn({ code: 'CALL_TOO_LONG', lessonId, nodeId: id, message: `${scene.code}: chamada com ${wc(scene.call)} palavras (máximo 16)` });
        if (scene.options.length !== 3) warn({ code: 'CHOICE_OPTIONS', lessonId, nodeId: id, message: `${scene.code}: ${scene.options.length} escolhas (recomendadas 3)` });
        const options = scene.options.map((o, i) => {
          const oid = String.fromCharCode(97 + i);
          if (wc(o.label) > 12) warn({ code: 'OPTION_TOO_LONG', lessonId, nodeId: id, message: `${scene.code}/${oid}: escolha com ${wc(o.label)} palavras (máximo 12)` });
          // reação da instrutora a esta resposta (reaction.ts): a do roteiro ou, faltando, a padrão derivada do retorno
          const reaction = o.reaction ? smartQuotes(o.reaction) : reactionFromFeedback(smartQuotes(o.feedback), o.quality, ctx.reactionIndex() + i);
          if (o.reaction && (wc(o.reaction) < REACTION_WORDS.min || wc(o.reaction) > REACTION_WORDS.max)) warn({ code: 'REACTION_LENGTH', lessonId, nodeId: id, message: `${scene.code}/${oid}: reação com ${wc(o.reaction)} palavras (${REACTION_WORDS.min} a ${REACTION_WORDS.max}, 5 a 10 s)` });
          return { id: oid, label: smartQuotes(o.label), feedback: paragraphs(smartQuotes(o.feedback)), quality: o.quality, ...(reaction ? { reaction: { text: clipChars(reaction, 400) } } : {}) };
        });
        if (scene.options.some((o) => !o.reaction)) warn({ code: 'REACTION_DEFAULT', lessonId, nodeId: id, message: `${scene.code}: sem coluna "Reação" em ${scene.options.filter((o) => !o.reaction).length} opção(ões); usada a reação padrão derivada do retorno` });
        ctx.reactionIndex(scene.options.length);
        nodes.push({
          id,
          type: 'choice',
          title: clipChars(scene.title, 120),
          objectiveIds: [objectiveId],
          required: true,
          prompt: paragraphs(scene.situation, scene.title),
          options,
          // ponte: a instrutora chama o aluno no fim do vídeo anterior (aplicado ao grafo abaixo)
          bridge: { call: clipChars(scene.call ?? callFromSituation(scene.situation, scene.title), 200) },
          ...(scene.voiceOptional ? { openAnswer: { enabled: true, voice: true, text: false, matchPrompt: 'Qual destas respostas se parece mais com a sua?' } } : {}),
        });
        scene.options.forEach((o, i) => {
          const oid = String.fromCharCode(97 + i);
          const by = POINTS[o.quality];
          edges.push(go(`e_${id}_${oid}`, id, resolve(o.destination, `${scene.code}/${oid}`), { optionId: oid, ...(by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {}) }));
        });
        rows.push([id]);
        break;
      }
      case 'scaffold': {
        for (const s of scene.slots) if (s.options.length < 2 || s.options.length > 5) warn({ code: 'SCAFFOLD_SLOT_OPTIONS', lessonId, nodeId: id, message: `${scene.code}: lacuna {${s.id}} com ${s.options.length} opções (2 a 5)` });
        nodes.push({
          id,
          type: 'reflection',
          title: clipChars(scene.title, 120),
          objectiveIds: [objectiveId],
          required: true,
          minLength: 0,
          maxLength: 400,
          prompt: paragraphs('Monte sua frase tocando nas partes. Se preferir, escreva a sua em "Outro…". Pode pular.'),
          scaffold: { template: scene.template, slots: scene.slots.map((s) => ({ id: s.id, label: slotLabel(s.id), options: s.options, allowCustom: true, customMaxLength: 60 })) },
        });
        edges.push(go(`e_${id}`, id, resolve(scene.destination, scene.code)));
        rows.push([id]);
        break;
      }
      case 'note': {
        nodes.push({
          id,
          type: 'reflection',
          title: clipChars(scene.title, 120),
          objectiveIds: [],
          required: true,
          minLength: scene.skippable ? 0 : 20,
          maxLength: 600,
          prompt: paragraphs(scene.text || scene.title, scene.skippable ? 'É opcional: pode pular.' : ''),
          placeholder: clipChars(scene.text || scene.title, 200),
        });
        edges.push(go(`e_${id}`, id, resolve(scene.destination, scene.code)));
        rows.push([id]);
        break;
      }
      case 'assessment': {
        const total = scene.questions.length;
        if (total > 3) warn({ code: 'ASSESSMENT_COUNT', lessonId, message: `${scene.code}: ${total} perguntas (recomendadas até 3)` });
        const passMin = Math.min(scene.passMin, total);
        if (scene.passOf !== total) warn({ code: 'ASSESSMENT_PASS_OF', lessonId, message: `${scene.code}: "Aprovação: ${scene.passMin} de ${scene.passOf}", mas há ${total} perguntas` });
        const after = resolve(scene.destination, scene.code);
        scene.questions.forEach((q, qi) => {
          const qid = `${id}_q${qi + 1}`;
          if (q.alternatives.length !== 3) warn({ code: 'ASSESSMENT_OPTIONS', lessonId, nodeId: qid, message: `${scene.code} pergunta ${qi + 1}: ${q.alternatives.length} alternativas (recomendadas 3)` });
          if (wc(q.text) > 20) warn({ code: 'ASSESSMENT_TOO_LONG', lessonId, nodeId: qid, message: `${scene.code} pergunta ${qi + 1}: enunciado com ${wc(q.text)} palavras (máximo 20)` });
          nodes.push({
            id: qid,
            type: 'assessment',
            title: clipChars(`${scene.title} · pergunta ${qi + 1} de ${total}`, 120),
            objectiveIds: ctx.moduleObjectiveIds,
            required: true,
            prompt: paragraphs(q.text),
            mode: 'single',
            options: q.alternatives.map((a, ai) => ({ id: String.fromCharCode(97 + ai), label: smartQuotes(a.label), correct: a.correct })),
            passing: { kind: 'all_correct' },
            maxAttempts: Math.min(10, Math.max(1, scene.attempts)),
            ...(q.explanation ? { feedbackPassed: paragraphs(q.explanation), feedbackFailed: paragraphs(q.explanation) } : {}),
          });
          rows.push([qid]);
          const last = qi === total - 1;
          const inc: Edge['effects'] = [{ op: 'inc', var: 'acertos', by: 1 }];
          if (!last) {
            const next = `${id}_q${qi + 2}`;
            edges.push(go(`e_${qid}_ok`, qid, next, { condition: { op: 'passed', nodeId: qid }, priority: 1, effects: inc }));
            edges.push(go(`e_${qid}`, qid, next, { isDefault: true }));
          } else if (passMin <= 0) {
            edges.push(go(`e_${qid}`, qid, after));
          } else {
            // aprovado: já tinha X-1 acertos e acertou esta, ou já tinha X; senão, encerramento "revisar"
            const retryTarget = after === endId ? retryEndId : after;
            edges.push(go(`e_${qid}_ok`, qid, after, { condition: { op: 'and', conditions: [{ op: 'gte', var: 'acertos', value: passMin - 1 }, { op: 'passed', nodeId: qid }] }, priority: 1, effects: inc }));
            edges.push(go(`e_${qid}_ja`, qid, after, { condition: { op: 'gte', var: 'acertos', value: passMin }, priority: 2 }));
            edges.push(go(`e_${qid}`, qid, retryTarget, { isDefault: true }));
          }
        });
        break;
      }
    }
  });

  if (end.takeaways.length < 2 || end.takeaways.length > 3) warn({ code: 'TAKEAWAYS_COUNT', lessonId, message: `aula ${parsed.number}: ${end.takeaways.length} tópicos em "O que você levou" (recomendados 2 a 3)` });
  for (const t of end.takeaways) if (wc(t) > 12) warn({ code: 'TAKEAWAY_TOO_LONG', lessonId, message: `aula ${parsed.number}: tópico "${clipWords(t, 6)}…" com ${wc(t)} palavras (máximo 12)` });

  // "Meu roteiro": frases montadas (M), anotação (A), decisões (Q) e checklist citados pelo autor; depois o que faltou
  const recap: RecapItem[] = [];
  const used = new Set<string>();
  const addSource = (code: string, label: string) => {
    const node = nodes.find((n) => n.id === nodeIdOf(code));
    if (!node || used.has(code)) return;
    used.add(code);
    if (node.type === 'reflection') recap.push({ id: nodeIdOf(code), label, kind: 'reflection', nodeId: node.id, ...(node.scaffold ? { composedNodeIds: [node.id] } : {}), emptyText: node.scaffold ? `Monte na aula ${parsed.number}` : 'Se quiser, escreva depois' });
    else if (node.type === 'choice') recap.push({ id: nodeIdOf(code), label, kind: 'choice', nodeId: node.id, emptyText: `Escolha na aula ${parsed.number}` });
  };
  for (const item of end.myScript) {
    const codes = [...item.matchAll(/\b((?:M|A|Q)\d+)\b/g)].map((m) => m[1]!);
    if (codes.length) for (const c of codes) addSource(c, recapLabel(item));
    else if (/checklist/i.test(item) && end.checklist && !used.has('checklist')) {
      used.add('checklist');
      recap.push({ id: 'checklist', label: clipChars(end.checklist.title, 80), kind: 'checklist', items: end.checklist.items.map((i) => i.slice(0, 160)).slice(0, 12), emptyText: 'Completar quando quiser' });
    }
  }
  for (const s of scenes) if (s.kind === 'scaffold' || s.kind === 'note') addSource(s.code, recapLabel(s.title.replace(/^Miss[ãa]o:\s*/i, '').replace(/^Anota[çc][ãa]o opcional:\s*/i, '')));
  if (end.checklist && !used.has('checklist')) recap.push({ id: 'checklist', label: clipChars(end.checklist.title, 80), kind: 'checklist', items: end.checklist.items.map((i) => i.slice(0, 160)).slice(0, 12), emptyText: 'Completar quando quiser' });
  if (end.takeaways.length) recap.push({ id: 'o_que_levou', label: end.title.slice(0, 80) || 'O que você levou', kind: 'text', text: clipChars(end.takeaways.join('\n'), 600), emptyText: 'Completar quando quiser' });

  const endNode = (id: string, summary: RichTextDocument, outcomeLabel: string): AnyNode => ({
    id,
    type: 'end',
    title: 'Meu roteiro',
    objectiveIds: [],
    required: true,
    summary,
    ...(recap.length ? { recap: recap.slice(0, 12), recapTitle: 'Meu roteiro' } : {}),
    ...(opts.closingLine ? { closingLine: opts.closingLine.slice(0, 200) } : {}),
    outcomeLabel,
  });
  const outcome = ctx.lastOfCourse ? 'Curso concluído' : 'Aula concluída';
  const takeaways = end.takeaways.length ? doc(paragraph(end.title || 'O que você levou'), list(end.takeaways)) : paragraphs(end.title);
  nodes.push(endNode(endId, takeaways, outcome));
  const endRow = [endId];
  if (hasAssessment && assessments.some((a) => Math.min(a.passMin, a.questions.length) > 0)) {
    const a = assessments[0]!;
    nodes.push(
      endNode(
        retryEndId,
        doc(paragraph(`Você acertou menos de ${Math.min(a.passMin, a.questions.length)} de ${a.questions.length} na revisão. Reveja as aulas deste módulo e refaça a revisão quando quiser.`), list(end.takeaways)),
        outcome,
      ),
    );
    endRow.push(retryEndId);
  }
  rows.push(endRow);

  const variables: LessonGraph['variables'] = [];
  if (hasDecisions) variables.push({ name: 'pontos', type: 'number', initial: 0, label: 'Pontos da aula', scope: 'lesson' });
  if (hasAssessment) variables.push({ name: 'acertos', type: 'number', initial: 0, label: 'Acertos da revisão', scope: 'lesson' });

  const first = scenes[0];
  if (!first || first.kind === 'end') throw new MarkdownCourseError(`aula ${parsed.number} não tem cenas antes do FIM`);
  // chamada de cada decisão no fim do vídeo que a antecede (plano final próprio; ver bridge.ts)
  const withCalls = applyCallsToGraph({ nodes, edges }, (opts.presentation?.cameras ?? []) as Camera[]).graph;
  const graph: LessonGraph = { schemaVersion: 1, startNodeId: entryOf(first.code), variables, nodes: withCalls.nodes, edges, layout: layoutRows(rows) };

  const visible = nodes.filter((n) => n.type !== 'end').length;
  if (visible > 7) warn({ code: 'LESSON_SCENES', lessonId, message: `aula ${parsed.number} tem ${visible} cenas além do encerramento (recomendadas até 7)` });
  const reflections = nodes.filter((n) => n.type === 'reflection').length;
  if (reflections > 1) warn({ code: 'LESSON_REFLECTIONS', lessonId, message: `aula ${parsed.number} tem ${reflections} reflexões (recomendada 1)` });

  const decisionCodes = scenes.filter((s) => s.kind === 'decision').map((s) => s.code);
  const composeCodes = scenes.filter((s) => s.kind === 'scaffold').map((s) => s.code);
  const criterionParts: string[] = [];
  if (decisionCodes.length) criterionParts.push(`escolhe respostas fortes em ${decisionCodes.join(', ')}`);
  if (composeCodes.length) criterionParts.push(`monta a frase de ${composeCodes.join(', ')}`);
  if (hasAssessment) criterionParts.push(`passa na revisão ${assessments.map((a) => a.code).join(', ')}`);
  const objectiveTitle = parsed.objective.replace(/^Ao final,?\s*/i, '').trim();
  const objective: Objective = {
    id: objectiveId,
    title: clipChars((objectiveTitle.charAt(0).toUpperCase() + objectiveTitle.slice(1)) || parsed.title, 200),
    criterion: clipChars(criterionParts.length ? `${criterionParts.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '', 500),
    required: true,
  };

  const lesson: Lesson = {
    id: lessonId,
    title: clipChars(parsed.title, 160),
    description: clipChars(parsed.objective, 1000),
    estimatedMinutes: opts.lessonMinutes ?? 6,
    family: 'decision_consequence',
    objectiveIds: [objectiveId],
    graph,
  };
  return { lesson, objective, nodeCount: nodes.length, edgeCount: edges.length };
}

/** Personagens do cabeçalho ("Júlia, 21, estuda… Caio, 18, …") → elenco. */
function castFromCharacters(text: string): CastMember[] {
  if (!text.trim()) return [];
  return splitSentences(text)
    .map((s) => s.replace(/[.]+$/, '').trim())
    .filter(Boolean)
    .map((s) => {
      const at = s.indexOf(',');
      const name = (at > 0 ? s.slice(0, at) : s.split(/\s+/)[0]!).trim();
      return { name: name.slice(0, 60), role: 'Personagem de exemplo (fictício)', details: s.slice(0, 600) };
    });
}

/** Converte o roteiro analisado em documento de curso válido (`CourseDocumentSchema.parse`), com os avisos da conversão. */
export function markdownToCourseDocumentWithReport(parsed: ParsedCourse, opts: MarkdownCourseOptions = {}): MarkdownImportReport {
  const warnings: CompileIssue[] = [];
  const warn = (i: CompileIssue) => warnings.push(i);
  const lessonsTotal = parsed.modules.reduce((a, m) => a + m.lessons.length, 0);
  const duration = parseTargetDuration(parsed.header.targetDuration, lessonsTotal);
  const lessonMinutes = opts.lessonMinutes ?? duration.lessonMinutes ?? 6;
  const targetMinutes = opts.targetMinutes ?? duration.targetMinutes ?? Math.max(5, lessonMinutes * lessonsTotal);

  const allCodes = new Map<string, string>();
  for (const m of parsed.modules) for (const l of m.lessons) for (const s of l.scenes) if (s.kind !== 'end') allCodes.set(s.code, `aula ${l.number}`);

  let variantIndex = 0;
  const nextVariant = (): SlideVariant => (variantIndex++ % 2 === 0 ? 'light' : 'navy');
  // posição corrida das opções no curso: gira as aberturas das reações padrão
  let reactionAt = 0;
  const reactionIndex = (advance = 0) => {
    const at = reactionAt;
    reactionAt += advance;
    return at;
  };
  const mainCameraId = opts.mainCameraId ?? opts.presentation?.cameras?.[0]?.id;
  const mainCam = mainCameraId ? opts.presentation?.cameras?.find((c) => c.id === mainCameraId) : undefined;
  const mainCameraFullFrameNative = mainCam && resolveCameraPlacement(opts.presentation ?? null, mainCam).placement === 'full_frame' ? (mainCam.nativeFraming ?? 'medium') : undefined;
  const zones = importZonesFrom(opts.presentation);
  const lessonOpts: MarkdownCourseOptions = { ...opts, lessonMinutes, ...(mainCameraId ? { mainCameraId } : {}), ...(mainCameraFullFrameNative ? { mainCameraFullFrameNative } : {}), ...(zones ? { zones } : {}) };

  const objectives: Objective[] = [];
  const modules: Module[] = [];
  const lessonIds: string[] = [];
  const lastLesson = parsed.modules[parsed.modules.length - 1]?.lessons.slice(-1)[0];
  for (const m of parsed.modules) {
    const moduleObjectiveIds = m.lessons.map((l) => `obj_aula_${pad2(l.number)}`);
    const lessons: Lesson[] = [];
    for (const l of m.lessons) {
      const lessonId = `aula_${pad2(l.number)}`;
      const built = buildLesson(l, { moduleObjectiveIds, lessonId, objectiveId: `obj_aula_${pad2(l.number)}`, lastOfCourse: l === lastLesson, opts: lessonOpts, warn, nextVariant, allCodes, reactionIndex });
      lessons.push(built.lesson);
      objectives.push(built.objective);
      lessonIds.push(lessonId);
    }
    modules.push({ id: `mod_${pad2(m.number)}`, title: clipChars(m.title, 160), description: clipChars(m.description, 1000), lessons });
  }

  const h = parsed.header;
  const title = (opts.title ?? parsed.title).slice(0, 160);
  const presenterName = opts.presenter?.name ?? opts.branding?.presenterName;
  const presenterRole = opts.presenter?.role ?? opts.branding?.presenterRole ?? '';
  const cast: CastMember[] = [
    ...(presenterName ? [{ name: presenterName.slice(0, 60), role: presenterRole.slice(0, 120), details: (opts.presenter?.details ?? 'Conduz todas as falas dos vídeos, em conversa com o aluno.').slice(0, 600) }] : []),
    ...castFromCharacters(h.characters),
  ];
  const presentation = {
    ...(opts.presentation ?? {}),
    directionStyle: { ...(opts.presentation?.directionStyle ?? {}), cameraMode: 'single' as const },
  };
  const branding: Partial<Branding> = {
    theme: 'immersive',
    wordmark: clipChars(opts.branding?.wordmark ?? title, 40),
    ...(opts.branding?.subtitle ? { subtitle: clipChars(opts.branding.subtitle, 60) } : {}),
    tagline: clipChars(opts.branding?.tagline ?? h.idea, 120),
    ...(opts.branding?.accent ? { accent: opts.branding.accent } : {}),
    ...(opts.branding?.watermark ? { watermark: opts.branding.watermark } : {}),
    ...(presenterName ? { presenterName: clipChars(presenterName, 40) } : {}),
    ...(presenterRole ? { presenterRole: clipChars(presenterRole, 60) } : {}),
    ...(opts.branding?.bumper ? { bumper: opts.branding.bumper } : {}),
  };

  const document = CourseDocumentSchema.parse({
    schemaVersion: 1,
    title,
    description: clipChars([h.idea, h.audience ? `Público: ${h.audience}` : '', h.finalGoal ? `Objetivo final: ${h.finalGoal}` : ''].filter(Boolean).join(' '), 2000),
    ...(h.idea ? { learnerSummary: clipChars(h.idea, 400) } : {}),
    brief: {
      topic: clipChars(h.idea, 500),
      audience: clipChars(h.audience, 500),
      context: clipChars([h.targetDuration ? `Duração-alvo: ${h.targetDuration}` : '', h.characters ? `Personagens de exemplo (fictícios): ${h.characters}` : ''].filter(Boolean).join(' '), 1000),
      prerequisites: 'Nenhum.',
      finalSkill: clipChars(h.finalGoal, 500),
      tone: clipChars(opts.tone ?? 'brasileiro, acolhedor, direto; apresentadora em conversa com o aluno; sem julgar', 200),
      narrativeVoice: opts.narrativeVoice ?? 'second_person',
      targetMinutes: Math.min(600, Math.max(5, Math.round(targetMinutes))),
      sourcesNote: clipChars(opts.sourcesNote ?? `Roteiro autoral em Markdown ("${parsed.title}"), importado sem IA. Personagens fictícios.`, 2000),
      ...(opts.audienceProfile ? { audienceProfile: opts.audienceProfile } : {}),
      ...(opts.level ? { level: opts.level } : {}),
      traits: opts.traits ?? [],
      interaction: { guidedChoices: true, voiceTraining: true, noWriting: true },
    },
    objectives,
    modules,
    completion: { requiredLessonIds: lessonIds },
    presentation,
    branding,
    cast: cast.slice(0, 12),
    wizard: { step: 'previa', completedSteps: ['tema', 'conteudo', 'estrutura', 'aulas', 'apresentacao'], contentMode: 'paste', finished: true },
  });
  return { document, warnings };
}

export function markdownToCourseDocument(parsed: ParsedCourse, opts: MarkdownCourseOptions = {}): CourseDocument {
  return markdownToCourseDocumentWithReport(parsed, opts).document;
}

export interface MarkdownImportResult extends MarkdownImportReport {
  parsed: ParsedCourse;
  compile: CourseCompileResult;
  length: ReturnType<typeof courseLengthReport>;
  /** avisos da conversão + da compilação (sem repetir os de extensão, que já vêm na compilação) */
  allWarnings: CompileIssue[];
  /** nós e arestas por aula */
  lessons: Array<{ id: string; title: string; nodes: number; edges: number }>;
}

/** Analisa, converte, compila e mede o roteiro: o caminho completo do importador. */
export function importMarkdownCourse(md: string, opts: MarkdownCourseOptions = {}): MarkdownImportResult {
  const parsed = parseMarkdownCourse(md);
  const { document, warnings } = markdownToCourseDocumentWithReport(parsed, opts);
  const compile = compileCourse(document);
  const length = courseLengthReport(document);
  const lessons = document.modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, title: l.title, nodes: l.graph.nodes.length, edges: l.graph.edges.length })));
  return { parsed, document, warnings, compile, length, allWarnings: [...warnings, ...compile.warnings], lessons };
}

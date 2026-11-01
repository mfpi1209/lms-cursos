/**
 * Piloto C01 "Meu primeiro dia" (01/11): aplica no RASCUNHO a proposta revisada
 * `docs/novos-cursos/piloto-c01/proposta.json` (versão humana: proposta.md). Nada é publicado e nenhuma mídia é gerada:
 * o script só edita o documento do rascunho; o orçamento (grátis, `POST /media-jobs/quote`) é pedido depois.
 *
 *  - aulas 1 e 2 (mesmos ids de cena, nenhuma cena nova dentro delas): troca a fala dos planos `missao` / `missao_fim`
 *    (mesmo id de plano, só a linha), insere os planos novos (ex1..ex3) nas cenas de conteúdo, reescreve a atividade
 *    "Na prática" (título, ponte, enunciado e molde da frase), ganha frase de fechamento e o item "Minha missão de verdade"
 *    no roteiro; "Curso concluído" sai de `fim_aula_02`. As perguntas (q01..q03) e as reações gravadas NÃO mudam
 *    (decisão do dono: as 4 reações repetidas das aulas 1 e 2 ficam como estão).
 *  - módulo novo "Dentro da empresa" com as aulas 3 e 4 (v04..fim_aula_03; v06..despedida..fim_aula_04), no mesmo formato
 *    das aulas 1 e 2, sem mídia nenhuma (sem vídeo próprio de pergunta: o player pula o vídeo da pergunta quando a cena
 *    anterior termina com a chamada, e uma pergunta sem vídeo não toca nada).
 *  - nível do curso: descrição, briefing (tema, habilidade final, duração), objetivos das aulas 3 e 4, aulas obrigatórias, elenco.
 *
 * Ajuste fino preservado: a narração por planos é `direction.shots[]` (a fala do nó = soma das linhas); os cortes
 * (`media.adjust.cut`, `drop`, `baseLines`, `teaser`) são guardados por ID de plano. Este script NÃO toca em `media.adjust`, não
 * muda câmera/gesto/ordem dos planos que ficam, e só marca `media.stale = true` nos nós com plano trocado ou novo (é o que faz
 * o orçamento incluir a cena e reaproveitar de graça os planos sem mudança). Antes de gravar: (1) um diff trava qualquer
 * campo fora do previsto; (2) `carryAdjust` (regravação) é simulado antes e depois em cada nó; (3) `onlyAppendedLessons`
 * (migração das matrículas) precisa aceitar publicada → rascunho novo; (4) o rascunho tem que passar no compilador de
 * publicação (`compileCourse`, sem erros). Em conflito de revisão, relê e tenta de novo.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/piloto-c01.ts [--dry-run | --apply] [--saida arq.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  CourseDocumentSchema,
  SAFE_GESTURES,
  compileCourse,
  directionNarration,
  gestureKey,
  sameWords,
  type CourseDocument,
  type Shot,
} from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { getLatestVersion, validateDraft } from '../../repositories/publishing';
import { listJobsForCourse } from '../../repositories/media';
import { carryAdjust, type AdjustState } from '../../../../media/src/adjust';
import { onlyAppendedLessons } from '../matricula-migracao';
import { caminhosDiferentes, cenasStale } from './_rascunho-qa';

const COURSE_ID = 'crs_99hpdsc8w88osiuh';
const PROPOSTA = 'docs/novos-cursos/piloto-c01/proposta.json';
const MODULO_NOVO = { id: 'mod_02', title: 'Dentro da empresa', description: 'Atravesse o primeiro dia e a primeira semana: nomes, chefe ocupada, almoço, perguntar de novo e anotar a rotina.' };

/**
 * Ajustes de redação das 3 perguntas cujo título/enunciado da proposta não cabem no cartão "A seguir" (a pergunta do cartão é
 * a última frase com "?" do enunciado, até 12 palavras; mais que isso vira "…") ou trazem "?" dentro de aspas.
 */
const PERGUNTA: Record<string, { titulo: string; situacao?: string }> = {
  q04: { titulo: 'No lugar da Luana, o que você faz com o nome esquecido?' },
  q06: { titulo: 'No lugar da Luana, o que você faz sem ter entendido tudo?' },
  q07: {
    titulo: 'No lugar da Luana, o que você responde à Renata?',
    situacao: 'Fim da primeira semana. A Renata pergunta como foi a semana. A Luana teve dúvidas no sistema, errou um registro e ainda não sabe o que vai fazer na segunda.',
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = any; // trechos da proposta (JSON)
type Doc = CourseDocument;
type Lesson = Doc['modules'][number]['lessons'][number];
type NodeAny = Lesson['graph']['nodes'][number] & Record<string, any>;

const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] });
const richDoc = (...paras: string[]) => ({ type: 'doc' as const, content: paras.map(paragraph) });
const bulletDoc = (head: string, items: string[]) => ({
  type: 'doc' as const,
  content: [paragraph(head), { type: 'bulletList' as const, content: items.map((t) => ({ type: 'listItem' as const, content: [paragraph(t)] })) }],
});
const richPlain = (doc: any): string => (doc?.content ?? []).map((b: any) => (b.content ?? []).map((t: any) => t.text).join('')).join(' ').trim();

/* ------------------------------------------------------------------ */
/* gestos: só da lista segura, sem repetir o gesto do plano vizinho    */
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
function assignGestures(shots: Shot[], fresh: Set<string>): void {
  shots.forEach((s, i) => {
    if (!fresh.has(s.id)) return;
    if (/^chamada/.test(s.id)) { s.motionPrompt = CALL_GESTURE; return; }
    const avoid = new Set([gestureKey(shots[i - 1]?.motionPrompt), gestureKey(shots[i + 1]?.motionPrompt)].filter(Boolean));
    const prefer = ['promessa', 'lancamento', 'missao_fim', 'missao'].includes(s.id) ? FOCUS : [];
    const k = gestureCursor % POOL.length;
    const order = [...prefer, ...POOL.slice(k), ...POOL.slice(0, k)];
    s.motionPrompt = order.find((g) => !avoid.has(gestureKey(g))) ?? POOL[0]!;
    gestureCursor++;
  });
}

/* ------------------------------------------------------------------ */
/* construção dos planos e dos nós                                     */
/* ------------------------------------------------------------------ */
function shotFrom(p: P, transitionIn: Shot['transitionIn']): Shot {
  const layout = p.layout as Shot['layout'];
  const slide = p.cartao
    ? { title: p.cartao.titulo, bullets: p.cartao.topicos, style: (p.cartaoEstilo ?? 'checklist') as 'checklist' | 'quote' | 'clean' | 'bold' }
    : undefined;
  if (['card', 'presenter_chips', 'presenter_panel'].includes(layout) && !slide) throw new Error(`plano ${p.id}: layout ${layout} exige cartão`);
  return {
    id: p.id,
    line: String(p.fala).trim(),
    ...(p.camera ? { cameraId: p.camera } : {}),
    framing: 'medium',
    layout,
    cameraMove: 'static',
    transitionIn,
    ...(slide ? { slide } : {}),
  } as Shot;
}

function scaffoldFrom(s: P) {
  return {
    template: s.template as string,
    slots: (s.slots as P[]).map((x) => ({ id: x.id, label: x.label, question: x.question, options: x.options, allowCustom: x.allowCustom, customMaxLength: x.customMaxLength })),
  };
}

function recapFrom(items: P[]) {
  return items.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    ...(r.nodeId ? { nodeId: r.nodeId } : {}),
    ...(r.composedNodeIds ? { composedNodeIds: r.composedNodeIds } : {}),
    ...(r.items ? { items: r.items } : {}),
    ...(r.text ? { text: r.text } : {}),
    emptyText: r.emptyText,
  }));
}

function intentFor(tipo: string, shots: Shot[]): string {
  if (tipo === 'scenario') return 'Estúdio com zonas: a fala inteira na câmera da cena (as cenas alternam entre a 3/4 e as laterais).';
  const chips = shots.find((s) => s.layout === 'presenter_chips');
  return chips ? `Estúdio com zonas: a fala na câmera da cena; as pílulas "${chips.slide?.title}" surgem na parede livre e a fala volta.` : 'Estúdio com zonas: a fala na câmera da cena.';
}

/** cena narrada nova (scenario/content): sem mídia */
function narratedNode(n: P): NodeAny {
  const tipo = n.tipo as 'scenario' | 'content';
  const planos = n.planos as P[];
  const shots = planos.map((p, i) => shotFrom(p, /^chamada/.test(p.id) ? 'crossfade' : tipo === 'scenario' && i >= 2 ? 'crossfade' : 'cut'));
  assignGestures(shots, new Set(shots.map((s) => s.id)));
  const narration = directionNarration({ shots });
  if (n.roteiroNovo && !sameWords(narration, n.roteiroNovo)) throw new Error(`${n.id}: a soma dos planos não bate com o roteiro da proposta`);
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

function choiceNode(n: P): NodeAny {
  const aj = PERGUNTA[n.id];
  const situacao = norm(aj?.situacao ?? n.apoioNaTela);
  // padrão aprovado (qa-titulos-perguntas): o enunciado termina com a pergunta, que vira o título da tela
  const pergunta = norm(aj?.titulo ?? n.titulo);
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

function reflectionNode(n: P): NodeAny {
  return {
    id: n.id,
    objectiveIds: n.objetivos ?? [],
    required: false,
    title: n.titulo,
    type: 'reflection',
    prompt: richDoc(n.prompt),
    intro: n.intro,
    minLength: 0,
    maxLength: 400,
    scaffold: scaffoldFrom(n.scaffold),
  } as NodeAny;
}

function endNode(n: P): NodeAny {
  const linhas = String(n.summary).split('\n');
  return {
    id: n.id,
    objectiveIds: [],
    required: true,
    title: n.titulo ?? 'Meu roteiro',
    type: 'end',
    summary: bulletDoc(linhas[0]!, linhas.slice(1)),
    recap: recapFrom(n.recap),
    recapTitle: n.recapTitle ?? 'Meu roteiro',
    outcomeLabel: n.outcomeLabel,
    closingLine: n.closingLine,
  } as NodeAny;
}

function newLesson(a: P, nodes: NodeAny[]): Lesson {
  const edges: any[] = [];
  const byId = new Map(nodes.map((x) => [x.id, x] as const));
  const path: string[] = a.caminhoPrincipal;
  path.forEach((id, i) => {
    const node = byId.get(id);
    if (!node) throw new Error(`${a.id}: nó ${id} do caminho principal não existe`);
    if (node.type === 'end') return;
    const next = path[i + 1];
    if (!next) throw new Error(`${a.id}: ${id} sem próximo`);
    if (node.type === 'choice') {
      for (const o of node.options) {
        const by = POINTS[o.quality ?? 'weak']!;
        edges.push({ id: `e_${id}_${o.id}`, from: id, to: next, optionId: o.id, ...(by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {}) });
      }
    } else edges.push({ id: `e_${id}`, from: id, to: next });
  });
  if (nodes.length !== path.length) throw new Error(`${a.id}: nós (${nodes.length}) e caminho principal (${path.length}) não batem`);
  return {
    id: a.id,
    title: a.titulo,
    description: a.resumo,
    estimatedMinutes: a.estimativaMin,
    family: 'decision_consequence',
    objectiveIds: [a.objetivo.id],
    graph: {
      schemaVersion: 1,
      startNodeId: path[0]!,
      variables: [{ name: 'pontos', type: 'number', initial: 0, label: 'Pontos da aula', scope: 'lesson' }],
      nodes,
      edges,
      layout: { positions: Object.fromEntries(path.map((id, i) => [id, { x: 0, y: i * 180 }])) },
    },
  } as unknown as Lesson;
}

function buildNewLesson(a: P): Lesson {
  const nodes: NodeAny[] = [];
  for (const n of a.nos as P[]) {
    if (n.tipo === 'scenario' || n.tipo === 'content') {
      const node = narratedNode(n);
      // a proposta pede "acena de leve com a mão": aceno é gesto de mão que o avatar executa mal (HAND_SIGN_GESTURE_RE); vai o gesto seguro mais próximo
      if (n.id === 'despedida') node.motionPrompt = 'smiles softly, welcoming';
      nodes.push(node);
    } else if (n.tipo === 'choice') nodes.push(choiceNode(n));
    else if (n.tipo === 'reflection') nodes.push(reflectionNode(n));
    else if (n.tipo === 'end') nodes.push(endNode(n));
    else throw new Error(`tipo de nó desconhecido: ${n.tipo}`);
  }
  // cada pergunta é chamada no fim da cena anterior: a chamada do nó tem que ser a última fala dela
  const path: string[] = a.caminhoPrincipal;
  for (const q of nodes.filter((x) => x.type === 'choice')) {
    const prev = nodes.find((x) => x.id === path[path.indexOf(q.id) - 1])!;
    const last = prev.direction?.shots.at(-1);
    if (!last || !/^chamada/.test(last.id) || norm(last.line) !== norm(q.bridge.call)) throw new Error(`${q.id}: a cena anterior (${prev.id}) não termina com a chamada "${q.bridge.call}"`);
  }
  return newLesson(a, nodes);
}

/* ------------------------------------------------------------------ */
/* aulas 1 e 2: edição no lugar                                        */
/* ------------------------------------------------------------------ */
interface RegistroNo { aula: string; no: string; trocados: string[]; novos: string[]; carry?: { antes: unknown; depois: unknown; igual: boolean; perdas: string[] }; narracaoConfere: boolean }
const registros: RegistroNo[] = [];

function findNode(doc: Doc, lessonId: string, nodeId: string): NodeAny {
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === lessonId) {
    const n = l.graph.nodes.find((x) => x.id === nodeId);
    if (n) return n as NodeAny;
  }
  throw new Error(`nó não encontrado: ${lessonId}/${nodeId}`);
}

function editNarrated(doc: Doc, aula: string, n: P): void {
  const node = findNode(doc, aula, n.id);
  const shots = node.direction.shots as Shot[];
  const antes = structuredClone(shots) as Shot[];
  const planos = n.planos as P[];
  const existentes = planos.filter((p) => p.acao !== 'add').map((p) => p.id);
  if (JSON.stringify(existentes) !== JSON.stringify(shots.map((s) => s.id))) throw new Error(`${aula}/${n.id}: os planos existentes da proposta (${existentes.join(',')}) não batem com os do rascunho (${shots.map((s) => s.id).join(',')})`);
  const trocados: string[] = [];
  const novos: string[] = [];
  const out: Shot[] = [];
  for (const p of planos) {
    if (p.acao === 'add') {
      out.push(shotFrom(p, 'cut'));
      novos.push(p.id);
      continue;
    }
    const atual = shots.find((s) => s.id === p.id)!;
    if (p.acao === 'change') {
      if (norm(atual.line) !== norm(p.falaAnterior)) throw new Error(`${aula}/${n.id}/${p.id}: a fala atual mudou desde a proposta ("${atual.line}")`);
      out.push({ ...atual, line: String(p.fala).trim() }); // mesma câmera, gesto, layout e transição: só a linha
      trocados.push(p.id);
    } else out.push(atual); // keep: o MESMO objeto, intacto
  }
  assignGestures(out, new Set(novos));
  node.direction.shots = out;
  node.narration = directionNarration({ shots: out });
  const confere = sameWords(node.narration as string, n.roteiroNovo);
  if (!confere) throw new Error(`${aula}/${n.id}: a soma dos planos não bate com o roteiro da proposta`);
  if (node.media) node.media.stale = true;
  // ajuste carregado na regravação (carryAdjust): antes x depois
  const adj = node.media?.adjust;
  let carry: RegistroNo['carry'];
  if (adj) {
    const st: AdjustState = { drop: adj.drop ?? [], cut: adj.cut ?? {}, ...(adj.teaser !== undefined ? { teaser: adj.teaser } : {}) };
    const a = carryAdjust(st, adj.baseLines ?? null, antes);
    const d = carryAdjust(st, adj.baseLines ?? null, out);
    const ids = (r: typeof a) => new Set<string>([...(r.request?.drop ?? []), ...(r.request?.cut ?? []).map((c: any) => `cut:${c.shotId}:${c.side}`)]);
    const depoisIds = ids(d);
    const perdas = [...ids(a)].filter((x) => !depoisIds.has(x));
    carry = { antes: a.request, depois: d.request, igual: JSON.stringify(a.request) === JSON.stringify(d.request), perdas };
    // um corte só pode sumir no plano cuja fala foi trocada (a gravação nova já nasce com a fala nova, inteira)
    for (const x of perdas) {
      const id = x.startsWith('cut:') ? x.split(':')[1]! : x;
      if (!trocados.includes(id)) throw new Error(`${aula}/${n.id}: o ajuste carregado encolheria em "${x}", que não é plano trocado`);
    }
  }
  registros.push({ aula, no: n.id, trocados, novos, carry, narracaoConfere: confere });
}

function editReflection(doc: Doc, aula: string, n: P, promptExtra: string[]): void {
  const node = findNode(doc, aula, n.id);
  if (node.type !== 'reflection') throw new Error(`${aula}/${n.id} não é reflexão`);
  node.title = n.titulo;
  node.intro = n.intro;
  node.prompt = richDoc(n.prompt, ...promptExtra);
  node.scaffold = scaffoldFrom(n.scaffold);
  node.required = false;
}

function editEnd(doc: Doc, aula: string, n: P): void {
  const node = findNode(doc, aula, n.id);
  if (node.type !== 'end') throw new Error(`${aula}/${n.id} não é encerramento`);
  node.closingLine = n.closingLine;
  node.outcomeLabel = n.outcomeLabel;
  const recap = node.recap as any[];
  for (const m of n.recap.manter as string[]) {
    const id = /^m0\d/.test(m) ? m.split(' ')[0]! : /^checklist/.test(m) ? 'checklist' : m;
    if (!recap.some((r) => r.id === id)) throw new Error(`${aula}/${n.id}: item mantido "${m}" não existe no roteiro`);
  }
  for (const add of n.recap.adicionar as P[]) {
    if (recap.some((r) => r.id === add.id)) continue;
    const pos = /depois de '([^']+)'/.exec(add.posicao)?.[1];
    const at = recap.findIndex((r) => r.label === pos);
    if (at < 0) throw new Error(`${aula}/${n.id}: item "${pos}" do roteiro não encontrado`);
    recap.splice(at + 1, 0, ...recapFrom([add]));
  }
}

/* ------------------------------------------------------------------ */
/* aplicação                                                           */
/* ------------------------------------------------------------------ */
/** "Apresentar-se, pedir um nome…" → "Você se apresenta, pede um nome…" (mesmo padrão dos objetivos das aulas 1 e 2) */
function voce(texto: string): string {
  const mapa: Record<string, string> = {
    'Apresentar-se, pedir um nome de novo e agir com autonomia no primeiro dia.': 'Você se apresenta, pede um nome de novo e age com autonomia no primeiro dia.',
    'Pedir de novo uma explicação, validar a tarefa antes de errar e registrar a rotina da primeira semana.': 'Você pede de novo uma explicação, valida a tarefa antes de errar e registra a rotina da primeira semana.',
  };
  const r = mapa[texto];
  if (!r) throw new Error(`objetivo sem versão em 2ª pessoa: ${texto}`);
  return r;
}

function aplicar(original: Doc, prop: P): Doc {
  const doc = structuredClone(original) as Doc;
  if (doc.modules.length !== 1 || doc.modules[0]!.lessons.map((l) => l.id).join() !== 'aula_01,aula_02') throw new Error('o rascunho não está no formato esperado (1 módulo, aulas aula_01 e aula_02)');
  gestureCursor = 0;
  registros.length = 0;
  const [a1, a2, a3, a4] = prop.aulas as P[];

  for (const [aula, a] of [['aula_01', a1], ['aula_02', a2]] as const) {
    for (const n of a.nos as P[]) {
      if (n.acao === 'keep') continue; // perguntas: intactas (as reações opcionais ficam como estão)
      if (n.tipo === 'scenario' || n.tipo === 'content') editNarrated(doc, aula, n);
      else if (n.tipo === 'reflection') {
        // aula 2: "Manter o exemplo de conversa já existente (Luana / Equipe)": o enunciado antigo segue como 2º parágrafo
        const antigo = richPlain((findNode(original, aula, n.id) as any).prompt);
        editReflection(doc, aula, n, aula === 'aula_02' && antigo ? [antigo] : []);
      } else if (n.tipo === 'end') editEnd(doc, aula, n);
      else throw new Error(`${aula}/${n.id}: tipo ${n.tipo} não previsto`);
    }
    for (const id of a.caminhoPrincipal as string[]) findNode(doc, aula, id); // todos os ids do caminho continuam lá
  }

  // curso: descrição, briefing, objetivos, aulas obrigatórias, elenco, módulo novo
  const nivel = prop.cursoNivel;
  doc.description = nivel.descricao.para;
  doc.brief.topic = 'Chegue ao primeiro dia com os combinados confirmados, saiba avisar um imprevisto e atravesse a primeira semana perguntando, se apresentando e anotando a rotina.';
  doc.brief.finalSkill = 'Ao final, a pessoa confirma as orientações de chegada, comunica um imprevisto com clareza, se apresenta e pede de novo uma explicação sem constrangimento.';
  doc.brief.context = doc.brief.context.replace('Duração-alvo: 2 aulas de 3 a 6 minutos (cerca de 10 minutos no total).', 'Duração-alvo: 4 aulas de 3 a 7 minutos (cerca de 20 minutos no total).');
  if (!doc.brief.context.startsWith('Duração-alvo: 4 aulas')) throw new Error('briefing: texto de duração não encontrado');
  doc.brief.targetMinutes = 20;
  for (const o of nivel.objetivosNovos as P[]) {
    doc.objectives.push({
      id: o.id,
      title: voce(o.texto),
      criterion: o.id === 'obj_aula_03' ? 'Escolhe respostas fortes em Q04, Q05; monta a frase de M03.' : 'Escolhe respostas fortes em Q06, Q07; monta a frase de M04.',
      required: true,
    });
  }
  doc.completion.requiredLessonIds = ['aula_01', 'aula_02', 'aula_03', 'aula_04'];
  doc.cast.push(
    { name: 'Renata', role: 'Personagem de exemplo (fictício)', details: 'Renata, do RH da empresa, é a pessoa de referência da Luana no primeiro dia' },
    { name: 'Caio', role: 'Personagem de exemplo (fictício)', details: 'Caio, colega da mesa ao lado da Luana e do Davi' },
  );
  doc.modules.push({ ...MODULO_NOVO, lessons: [buildNewLesson(a3), buildNewLesson(a4)] } as Doc['modules'][number]);
  return CourseDocumentSchema.parse(doc);
}

/* ------------------------------------------------------------------ */
/* conferências                                                        */
/* ------------------------------------------------------------------ */
const PERMITIDO_AULAS_1_2 =
  /^modules\.0\.lessons\.[01]\.graph\.nodes\.\d+\.(direction\.shots(\.\d+\.line)?|narration|media\.stale|title|intro|prompt(\..*)?|scaffold(\..*)?|closingLine|outcomeLabel|recap)$/;
const PERMITIDO_CURSO = /^(description|brief\.(topic|context|finalSkill|targetMinutes)|objectives|completion\.requiredLessonIds|cast)$/;

function conferirDiff(original: Doc, novo: Doc): string[] {
  if (novo.modules.length !== 2) throw new Error('esperava exatamente 2 módulos');
  const semNovo = structuredClone(novo) as Doc;
  semNovo.modules = [semNovo.modules[0]!];
  const fora = caminhosDiferentes(original as never, semNovo as never).filter((c) => !PERMITIDO_CURSO.test(c) && !PERMITIDO_AULAS_1_2.test(c));
  if (fora.length) throw new Error(`o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 5).join(', ')}); nada foi gravado`);
  const mod0o = original.modules[0]!;
  const mod0n = novo.modules[0]!;
  if (JSON.stringify({ ...mod0o, lessons: 0 }) !== JSON.stringify({ ...mod0n, lessons: 0 })) throw new Error('o módulo 1 mudou');
  const mudados: string[] = [];
  mod0o.lessons.forEach((lo, li) => {
    const ln = mod0n.lessons[li]!;
    if (JSON.stringify(lo.graph.nodes.map((n) => n.id)) !== JSON.stringify(ln.graph.nodes.map((n) => n.id))) throw new Error(`${lo.id}: os ids de cena mudaram`);
    if (JSON.stringify(lo.graph.edges) !== JSON.stringify(ln.graph.edges)) throw new Error(`${lo.id}: as arestas mudaram`);
    lo.graph.nodes.forEach((no: any, ni) => {
      const nn: any = ln.graph.nodes[ni]!;
      if (no.type === 'choice' && JSON.stringify(no) !== JSON.stringify(nn)) throw new Error(`${lo.id}/${no.id}: pergunta mudou`);
      if (no.media) {
        if (JSON.stringify(no.media.adjust) !== JSON.stringify(nn.media?.adjust)) throw new Error(`${lo.id}/${no.id}: media.adjust mudou`);
        const { stale: _a, ...ma } = no.media;
        const { stale: _b, ...mb } = nn.media;
        if (JSON.stringify(ma) !== JSON.stringify(mb)) throw new Error(`${lo.id}/${no.id}: a mídia mudou além de stale`);
      }
      if (no.direction) {
        // planos que ficam: o mesmo objeto (câmera, gesto, layout, ordem relativa); só a linha dos trocados
        const so: Shot[] = no.direction.shots;
        const sn: Shot[] = nn.direction.shots;
        const comuns = sn.filter((s) => so.some((x) => x.id === s.id));
        if (JSON.stringify(comuns.map((s) => s.id)) !== JSON.stringify(so.map((s) => s.id))) throw new Error(`${lo.id}/${no.id}: ordem/lista dos planos existentes mudou`);
        for (const s of comuns) {
          const o = so.find((x) => x.id === s.id)!;
          if (o.line !== s.line) {
            if (!['missao', 'missao_fim'].includes(s.id)) throw new Error(`${lo.id}/${no.id}/${s.id}: fala mudou em plano que deveria ficar`);
            if (JSON.stringify({ ...o, line: '' }) !== JSON.stringify({ ...s, line: '' })) throw new Error(`${lo.id}/${no.id}/${s.id}: o plano trocado mudou além da linha`);
            mudados.push(`${lo.id}/${no.id}/${s.id}`);
          } else if (JSON.stringify(o) !== JSON.stringify(s)) throw new Error(`${lo.id}/${no.id}/${s.id}: plano que deveria ficar mudou`);
        }
        const novosIds = sn.filter((x) => !so.some((y) => y.id === x.id));
        for (const s of novosIds) mudados.push(`${lo.id}/${no.id}/${s.id} (novo)`);
        const mudou = novosIds.length > 0 || comuns.some((s) => so.find((x) => x.id === s.id)!.line !== s.line);
        if (mudou && nn.media && nn.media.stale !== true) throw new Error(`${lo.id}/${no.id}: plano trocado/novo em cena sem media.stale`);
        if (!mudou && nn.media?.stale !== no.media?.stale) throw new Error(`${lo.id}/${no.id}: media.stale mudou numa cena sem plano alterado`);
      }
    });
  });
  return mudados;
}

function resumoCompilacao(doc: Doc) {
  const r = compileCourse(doc);
  const cont = (l: { code: string }[]) => l.reduce<Record<string, number>>((a, x) => ((a[x.code] = (a[x.code] ?? 0) + 1), a), {});
  return { ok: r.ok, erros: r.errors, avisos: cont(r.warnings), avisosLista: r.warnings.filter((w) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply, não os dois');
  const apply = args.includes('--apply');
  const iSaida = args.indexOf('--saida');
  const saida = iSaida >= 0 && args[iSaida + 1] ? args[iSaida + 1]! : 'docs/novos-cursos/piloto-c01/aplicacao.antes-depois.json';
  const prop = JSON.parse(readFileSync(PROPOSTA, 'utf8')) as P;
  if (prop.curso.id !== COURSE_ID) throw new Error('a proposta é de outro curso');

  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const abertos = (await listJobsForCourse(db, COURSE_ID)).filter((j) => j.status === 'queued' || j.status === 'running');
    if (abertos.length) console.log(`[piloto-c01] ATENÇÃO: ${abertos.length} job(s) de vídeo abertos neste curso: ${abertos.map((j) => `${j.lessonId}/${j.nodeId}`).join(', ')}`);
    const publicada = await getLatestVersion(db, COURSE_ID);
    if (!publicada) throw new Error('curso sem versão publicada (nada a comparar para a migração das matrículas)');

    for (let tentativa = 1; ; tentativa++) {
      const d = await getDraft(db, COURSE_ID);
      if (!d) throw new Error('rascunho não encontrado');
      const original = d.document as Doc;
      if (original.modules.some((m) => m.lessons.some((l) => l.id === 'aula_03'))) {
        console.log(`[piloto-c01] o rascunho (revisão ${d.revision}) já tem a aula_03: nada a fazer`);
        return;
      }
      const novo = aplicar(original, prop);
      const planosAlterados = conferirDiff(original, novo);
      const append = onlyAppendedLessons(publicada.document, novo);
      const stale0 = cenasStale(original);
      const stale1 = cenasStale(novo);
      const antes = resumoCompilacao(original);
      const depois = resumoCompilacao(novo);

      const novas = novo.modules[1]!.lessons;
      const contagem = {
        planosTrocados: planosAlterados.filter((x) => !x.endsWith('(novo)')).length,
        planosNovosAulas1e2: planosAlterados.filter((x) => x.endsWith('(novo)')).length,
        planosAulas3e4: novas.reduce((a, l) => a + l.graph.nodes.reduce((b, n: any) => b + (n.direction?.shots.length ?? 0), 0), 0),
        nosNovos: novas.reduce((a, l) => a + l.graph.nodes.length, 0),
        aulasNovas: novas.length,
        perguntasNovas: novas.reduce((a, l) => a + l.graph.nodes.filter((n) => n.type === 'choice').length, 0),
        reacoesNovas: novas.reduce((a, l) => a + l.graph.nodes.reduce((b: number, n: any) => b + (n.type === 'choice' ? n.options.filter((o: any) => o.reaction?.text).length : 0), 0), 0),
      };
      if (tentativa === 1) {
        console.log(`[piloto-c01] rascunho na revisão ${d.revision}; versão publicada comparada: v${publicada.versionNumber}`);
        console.log(`[piloto-c01] planos trocados/novos nas aulas 1–2:\n  ${planosAlterados.join('\n  ')}`);
        for (const r of registros) {
          console.log(`[piloto-c01] ${r.aula}/${r.no}: trocados [${r.trocados.join(',')}] novos [${r.novos.join(',')}] carryAdjust ${r.carry ? (r.carry.igual ? 'IGUAL antes/depois' : `muda (perde: ${r.carry.perdas.join(', ') || 'nada'})`) : 'sem ajuste'}`);
        }
        console.log(`[piloto-c01] contagem: ${JSON.stringify(contagem)}`);
        console.log(`[piloto-c01] cenas desatualizadas antes: [${stale0.join(', ')}] depois: [${stale1.join(', ')}]`);
        console.log(`[piloto-c01] onlyAppendedLessons(publicada, rascunho novo) = ${append}`);
        console.log(`[piloto-c01] compilador: ok=${depois.ok} erros=${depois.erros.length} avisos=${JSON.stringify(depois.avisos)} (antes: ok=${antes.ok} avisos=${JSON.stringify(antes.avisos)})`);
        for (const e of depois.erros) console.log(`[piloto-c01]   ERRO ${e.code} ${e.lessonId ?? ''}/${e.nodeId ?? ''}: ${e.message}`);
        for (const w of depois.avisosLista) console.log(`[piloto-c01]   aviso ${w.code} ${w.lessonId ?? ''}/${w.nodeId ?? ''}: ${w.message}`);
      }
      if (!append) throw new Error('onlyAppendedLessons recusou: a migração das matrículas não aceitaria esta versão');
      if (!depois.ok) throw new Error('o compilador recusou o rascunho novo');

      const relatorio = {
        script: 'piloto-c01',
        modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
        geradoEm: new Date().toISOString(),
        courseId: COURSE_ID,
        revisaoAntes: d.revision,
        versaoPublicadaComparada: publicada.versionNumber,
        onlyAppendedLessons: append,
        contagem,
        planosAlterados,
        nos: registros,
        cenasDesatualizadasAntes: stale0,
        cenasDesatualizadasDepois: stale1,
        compilador: { antes, depois },
      };
      if (!apply) {
        writeFileSync(saida, JSON.stringify(relatorio, null, 1));
        console.log(`[piloto-c01] dry-run: nada gravado. Relatório em ${saida}`);
        return;
      }
      try {
        const salvo = await saveDraft(db, { courseId: COURSE_ID, document: novo, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'Piloto C01: aulas 3 e 4, missão que vira ação, promessas e fechamentos (proposta revisada)' });
        console.log(`[piloto-c01] rascunho ${d.revision} → ${salvo.revision}`);
        const v = await validateDraft(db, COURSE_ID);
        console.log(`[piloto-c01] validateDraft (o mesmo da publicação): ok=${v.ok} erros=${v.errors.length} avisos=${v.warnings.length} mídia=${JSON.stringify(v.media)}`);
        writeFileSync(saida, JSON.stringify({ ...relatorio, revisaoDepois: salvo.revision, validateDraft: { ok: v.ok, erros: v.errors, midia: v.media, avisos: v.warnings.filter((w) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) } }, null, 1));
        console.log(`[piloto-c01] antes/depois em ${saida}`);
        return;
      } catch (e) {
        if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
          console.log(`[piloto-c01] conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
          await new Promise((res) => setTimeout(res, 700 * tentativa));
          continue;
        }
        throw e;
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[piloto-c01] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

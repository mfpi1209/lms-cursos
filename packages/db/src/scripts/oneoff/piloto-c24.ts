/**
 * Piloto C24 "Por onde eu começo?" (01/11): aplica no RASCUNHO a proposta revisada
 * `docs/novos-cursos/piloto-c24/proposta.json` (versão humana: proposta.md), com as decisões do dono em
 * `docs/qa/expansao-analise/DECISOES-AUTONOMAS.md`. Nada é publicado e nenhuma mídia é gerada: o script só edita o documento
 * do rascunho; o orçamento (grátis, `POST /media-jobs/quote`) é pedido depois.
 *
 *  - aulas 1 e 2 (nenhuma cena nova, nenhum plano tocado, nenhuma mídia tocada): só TEXTO de tela. a01 ganha ponte, instrução,
 *    blocos e caso novos ("30 cópias para amanhã"); a02 só a instrução; fim_aula_01 ganha a frase de fechamento; fim_aula_02
 *    deixa de ser o fim do curso ("Aula concluída", resumo e frase novos). v01/s4 e v03/s3 ficam (decisão 3); as 8 reações
 *    com abertura repetida ficam como estão (decisão 4: o ajuste fino de reação só apara as aberturas de REACTION_OPENERS,
 *    então não há corte limpo).
 *  - aula 3 NOVA, anexada ao fim do último módulo: v05 (cena) → q05 (Você decide, 3 reações faladas, sem vídeo próprio) → v06
 *    (explicação) → a03 (missão "Leve para a vida real", tipo `mission`, sem molde) → despedida → fim_aula_03 ("Curso concluído").
 *  - nível do curso: descrição, resumo do aluno, briefing, objetivo da aula 3, aula 3 obrigatória (decisão 1), elenco (Bia).
 *
 * Antes de gravar: (1) guardas no texto antigo (se alguém mexeu, aborta); (2) um diff trava qualquer campo fora do previsto e
 * exige que mídia, `media.adjust`, planos, arestas e ids de cena das aulas 1 e 2 estejam intactos; (3) `carryAdjust`
 * (regravação) é simulado antes e depois em cada cena com ajuste; (4) `onlyAppendedLessons` (migração das matrículas) precisa
 * aceitar publicada → rascunho novo; (5) o rascunho tem que passar no compilador de publicação (`compileCourse`, sem erros).
 * Em conflito de revisão, relê e tenta de novo.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/piloto-c24.ts [--dry-run | --apply] [--saida arq.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  CourseDocumentSchema,
  SAFE_GESTURES,
  assembleScaffold,
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
import { carryAdjust, REACTION_OPENERS, type AdjustState } from '../../../../media/src/adjust';
import { onlyAppendedLessons } from '../matricula-migracao';
import { caminhosDiferentes, cenasStale } from './_rascunho-qa';

const COURSE_ID = 'crs_dp9s7pdro9j6e3m0';
const PROPOSTA = 'docs/novos-cursos/piloto-c24/proposta.json';

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

/** guarda: o texto atual tem que ser o que a proposta viu (ou, se já estiver no valor novo, nada a fazer) */
function guarda(rotulo: string, atual: string | null | undefined, esperado: string | null): void {
  if ((atual ?? null) !== esperado) throw new Error(`${rotulo}: o texto atual mudou desde a proposta (esperado ${JSON.stringify(esperado)}, achei ${JSON.stringify(atual ?? null)}); nada foi gravado`);
}

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

/* ------------------------------------------------------------------ */
/* construção dos planos e dos nós da aula 3                           */
/* ------------------------------------------------------------------ */
function shotFrom(p: P): Shot {
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
    transitionIn: 'cut', // como as cenas atuais do C24
    ...(slide ? { slide } : {}),
  } as Shot;
}

function intentFor(tipo: string, shots: Shot[]): string {
  if (tipo === 'scenario') return 'Estúdio com zonas: a fala inteira na câmera da cena (as cenas alternam entre a 3/4 e as laterais).';
  const chips = shots.find((s) => s.layout === 'presenter_chips');
  return chips ? `Estúdio com zonas: a fala na câmera da cena; as pílulas "${chips.slide?.title}" surgem na parede livre e a fala volta.` : 'Estúdio com zonas: a fala na câmera da cena.';
}

/** cena narrada nova (scenario/content): sem mídia */
function narratedNode(n: P): NodeAny {
  const tipo = n.tipo as 'scenario' | 'content';
  const shots = (n.planos as P[]).map(shotFrom);
  assignGestures(shots);
  const narration = directionNarration({ shots });
  if (!sameWords(narration, n.roteiroNovo)) throw new Error(`${n.id}: a soma dos planos não bate com o roteiro da proposta`);
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
  const situacao = norm(n.apoioNaTela);
  // padrão aprovado (qa-titulos-perguntas): o enunciado termina com a pergunta, que vira o título da tela
  const pergunta = norm(n.titulo);
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
function missionNode(n: P): NodeAny {
  const action = (n.action as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n');
  // a etiqueta da tela já diz "Se você ainda não trabalha": a alternativa começa direto na tarefa (a proposta abria com "Sem estágio ou emprego? Tanto faz:")
  const alternative = String(n.alternative).replace(/^Sem estágio ou emprego\? Tanto faz: a tarefa pode/, 'A tarefa pode');
  if (alternative === n.alternative) throw new Error('a03: a alternativa da proposta mudou; revise o ajuste de abertura');
  // a tela já escreve "Exemplo: " antes do texto
  const nota = String(n.tip.texto).replace(/^Amigo-secreto da turma\. /, '');
  if (nota === n.tip.texto) throw new Error('a03: o exemplo da proposta mudou; revise o ajuste de abertura');
  const example = `A nota da Bia para o amigo-secreto da turma. ${nota}`;
  if (action.length > 500 || alternative.length > 500 || example.length > 300 || n.intro.length > 400) throw new Error('a03: texto da missão passa do limite do schema');
  return {
    id: n.id,
    objectiveIds: n.objetivos ?? [],
    required: false,
    title: n.title,
    type: 'mission',
    intro: n.intro,
    action,
    alternative,
    example,
    // sem draftFromNodeId: o plano vai para o bloco de notas do celular (decisão 2)
  } as NodeAny;
}

function recapFrom(items: P[]) {
  return items.map((r) => ({
    id: r.id,
    label: r.label,
    // "Como foi?" é a própria missão (estado + o que a pessoa percebeu), não uma reflexão
    kind: r.id === 'como_foi' ? 'mission' : r.kind,
    ...(r.nodeId ? { nodeId: r.nodeId } : {}),
    ...(r.items ? { items: r.items } : {}),
    ...(r.text ? { text: r.text } : {}),
    emptyText: r.emptyText,
  }));
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

function buildAula3(a: P): Lesson {
  const nodes: NodeAny[] = [];
  for (const n of a.nos as P[]) {
    if (n.tipo === 'scenario' || n.tipo === 'content') nodes.push(narratedNode(n));
    else if (n.tipo === 'choice') nodes.push(choiceNode(n));
    else if (n.tipo === 'reflection' && n.id === 'a03') nodes.push(missionNode(n)); // a proposta a rotula "Leve para a vida real": é o tipo `mission`
    else if (n.tipo === 'end') nodes.push(endNode(n));
    else throw new Error(`tipo de nó desconhecido: ${n.tipo}`);
  }
  const path: string[] = a.caminhoPrincipal;
  if (JSON.stringify(nodes.map((x) => x.id)) !== JSON.stringify(path)) throw new Error('aula 3: nós e caminho principal não batem');
  // a pergunta é chamada no fim da cena anterior: a chamada do nó tem que ser a última fala dela
  for (const q of nodes.filter((x) => x.type === 'choice')) {
    const prev = nodes[path.indexOf(q.id) - 1]!;
    const last = prev.direction?.shots.at(-1);
    const call: string = q.bridge?.call ?? '';
    if (!last || !/^chamada/.test(last.id) || !call || norm(last.line) !== norm(call)) throw new Error(`${q.id}: a cena anterior (${prev.id}) não termina com a chamada "${call}"`);
  }
  // a despedida fecha com um gesto aberto de "é com você", e nunca repete o gesto do plano anterior
  const desp = nodes.find((x) => x.id === 'despedida')!;
  const ds = desp.direction.shots as Shot[];
  const ultimo = ds.at(-1)!;
  ultimo.motionPrompt = 'opens both palms, honest';
  if (gestureKey(ds.at(-2)!.motionPrompt) === gestureKey(ultimo.motionPrompt)) ds.at(-2)!.motionPrompt = 'nods slowly, warm';

  const edges: any[] = [];
  path.forEach((id, i) => {
    const node = nodes[i]!;
    if (node.type === 'end') return;
    const next = path[i + 1]!;
    if (node.type === 'choice') {
      for (const o of node.options) {
        const by = POINTS[o.quality ?? 'weak']!;
        edges.push({ id: `e_${id}_${o.id}`, from: id, to: next, optionId: o.id, ...(by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {}) });
      }
    } else edges.push({ id: `e_${id}`, from: id, to: next });
  });
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

/* ------------------------------------------------------------------ */
/* aulas 1 e 2: edição de texto no lugar                               */
/* ------------------------------------------------------------------ */
function findNode(doc: Doc, lessonId: string, nodeId: string): NodeAny {
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === lessonId) {
    const n = l.graph.nodes.find((x) => x.id === nodeId);
    if (n) return n as NodeAny;
  }
  throw new Error(`nó não encontrado: ${lessonId}/${nodeId}`);
}

const ANTIGO = {
  descricao: 'Entender um objetivo, identificar informações faltantes e ordenar ações. Público: Jovens do ensino médio, aprendizes, estagiários e pessoas no primeiro emprego.',
  resumoAluno: 'Entender um objetivo, identificar informações faltantes e ordenar ações.',
  a01Intro: 'Você viu que entender o resultado vem antes de agir. Agora complete as quatro partes: o que precisa conseguir, o que já sabe, o que falta e o primeiro passo.',
  a01Prompt: 'Você recebeu o pedido de tirar 30 cópias de um material para amanhã. Ainda não sabe qual versão usar nem se é frente e verso. Monte seu plano com as informações desse caso, escolhendo uma opção em cada grupo.',
  a02Prompt: 'Em cada um dos quatro grupos, toque no bloco que mais combina com você. Se preferir, escreva a sua parte em “Prefiro escrever”, com uma situação fictícia.',
  fim02Resumo: 'Dividir em etapas e marcar o que depende de confirmação evita retrabalho. Se você salvou, seu plano fica no Meu roteiro. Você chegou ao final. Revise o que preparou e escolha uma ideia para aplicar na sua rotina.',
} as const;

function editA01(doc: Doc, n: P): void {
  const node = findNode(doc, 'aula_01', 'a01');
  if (node.type !== 'reflection') throw new Error('aula_01/a01 não é reflexão');
  const c = n.campos_alterados;
  guarda('a01.intro', node.intro, ANTIGO.a01Intro);
  guarda('a01.prompt', richPlain(node.prompt), ANTIGO.a01Prompt);
  guarda('a01.molde', node.scaffold?.template, c.molde); // o molde fica
  node.intro = c.ponte;
  node.prompt = richDoc(c.instrucoes);
  node.scaffold = {
    template: c.molde,
    slots: (c.campos as P[]).map((x) => ({ id: x.id, label: x.rotulo, question: x.pergunta, options: x.opcoes, allowCustom: x.permiteOutro, customMaxLength: x.maxCaracteresOutro })),
  };
  // o exemplo da proposta tem que sair do molde com as primeiras escolhas indicadas (garante que blocos e molde combinam)
  const montado = assembleScaffold(node.scaffold, { a: c.campos[0].opcoes[0], b: c.campos[1].opcoes[2], c: c.campos[2].opcoes[2], d: c.campos[3].opcoes[0] });
  if (norm(montado) !== norm(c.exemplo)) throw new Error(`a01: o exemplo montado (“${montado}”) não bate com o da proposta (“${c.exemplo}”)`);
}

function editA02(doc: Doc, n: P): void {
  const node = findNode(doc, 'aula_02', 'a02');
  if (node.type !== 'reflection') throw new Error('aula_02/a02 não é reflexão');
  guarda('a02.prompt', richPlain(node.prompt), ANTIGO.a02Prompt);
  node.prompt = richDoc(n.campos_alterados.instrucoes);
}

function editFim(doc: Doc, aula: string, id: string, c: P): void {
  const node = findNode(doc, aula, id);
  if (node.type !== 'end') throw new Error(`${aula}/${id} não é encerramento`);
  guarda(`${id}.closingLine`, node.closingLine, null);
  node.closingLine = c.closingLine;
  if (id === 'fim_aula_02') {
    guarda('fim_aula_02.outcomeLabel', node.outcomeLabel, 'Curso concluído');
    guarda('fim_aula_02.resumo', richPlain(node.summary), ANTIGO.fim02Resumo);
    node.outcomeLabel = c.outcomeLabel;
    node.summary = richDoc(c.summary);
  }
}

/* ------------------------------------------------------------------ */
/* aplicação                                                           */
/* ------------------------------------------------------------------ */
function aplicar(original: Doc, prop: P): Doc {
  const doc = structuredClone(original) as Doc;
  if (doc.modules.length !== 1 || doc.modules[0]!.lessons.map((l) => l.id).join() !== 'aula_01,aula_02') throw new Error('o rascunho não está no formato esperado (1 módulo, aulas aula_01 e aula_02)');
  gestureCursor = 0;
  const [a1, a2, a3] = prop.aulas as P[];
  const no = (a: P, id: string): P => (a.nos as P[]).find((x) => x.id === id) ?? (() => { throw new Error(`proposta sem o nó ${id}`); })();

  editA01(doc, no(a1, 'a01'));
  editA02(doc, no(a2, 'a02'));
  editFim(doc, 'aula_01', 'fim_aula_01', no(a1, 'fim_aula_01').campos_alterados);
  editFim(doc, 'aula_02', 'fim_aula_02', no(a2, 'fim_aula_02').campos_alterados);

  // curso: descrição, resumo do aluno, briefing, objetivo, aula obrigatória, elenco
  const nivel = prop.cursoNivel;
  guarda('description', doc.description, ANTIGO.descricao);
  guarda('learnerSummary', doc.learnerSummary, ANTIGO.resumoAluno);
  guarda('brief.targetMinutes', String(doc.brief.targetMinutes), '5');
  doc.description = nivel.descricao.para;
  const habilidade = 'Entender um objetivo, descobrir o que falta, ordenar as ações e ajustar o plano quando algo muda.';
  doc.learnerSummary = habilidade;
  doc.brief.topic = habilidade;
  doc.brief.finalSkill = habilidade;
  doc.brief.targetMinutes = 9; // 3 aulas: ~5,4 min de vídeo + leitura e atividades (o compilador estima 13,4 min, dentro de 1,5× a meta)
  for (const o of nivel.objetivosNovos as P[]) {
    if (o.id !== 'obj_aula_03') throw new Error(`objetivo inesperado: ${o.id}`);
    doc.objectives.push({
      id: o.id,
      title: 'Você executa um plano simples numa tarefa real e, quando algo muda, volta só até a etapa que a mudança alcança.',
      criterion: 'Confirma uma escolha na situação da aula e chega ao fechamento. A missão “Leve para a vida real” não bloqueia: dá para marcar “Já experimentei” ou “Vou fazer depois”.',
      required: true,
    });
  }
  doc.completion.requiredLessonIds = ['aula_01', 'aula_02', 'aula_03']; // decisão 1: aula 3 obrigatória
  doc.cast.push({ name: 'Bia', role: 'Personagem de exemplo (fictício)', details: 'Bia, aluna que organiza o amigo-secreto da turma; exemplo de plano que muda no meio, fora do trabalho' });

  // aula 3: anexada ao fim do último (único) módulo
  doc.modules[0]!.lessons.push(buildAula3(a3));
  return CourseDocumentSchema.parse(doc);
}

/* ------------------------------------------------------------------ */
/* conferências                                                        */
/* ------------------------------------------------------------------ */
const PERMITIDO_CURSO = /^(description|learnerSummary|brief\.(topic|targetMinutes|finalSkill)|objectives|completion\.requiredLessonIds|cast)$/;
/** nós das aulas 1 e 2 que podem mudar, e só nestas chaves */
const NOS_EDITAVEIS: Record<string, Record<string, string[]>> = {
  aula_01: { a01: ['intro', 'prompt', 'scaffold'], fim_aula_01: ['closingLine'] },
  aula_02: { a02: ['prompt'], fim_aula_02: ['closingLine', 'outcomeLabel', 'summary'] },
};

interface Carry { aula: string; no: string; antes: unknown; depois: unknown; igual: boolean }

function conferirDiff(original: Doc, novo: Doc): { carry: Carry[]; nosEditados: string[] } {
  if (novo.modules.length !== 1) throw new Error('esperava exatamente 1 módulo');
  const semNova = structuredClone(novo) as Doc;
  semNova.modules[0]!.lessons = semNova.modules[0]!.lessons.slice(0, 2);
  const fora = caminhosDiferentes(original as never, semNova as never).filter((c) => !PERMITIDO_CURSO.test(c) && !/^modules\.0\.lessons\.[01]\.graph\.nodes\.\d+\.(intro|prompt(\..*)?|scaffold(\..*)?|closingLine|outcomeLabel|summary(\..*)?)$/.test(c));
  if (fora.length) throw new Error(`o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 5).join(', ')}); nada foi gravado`);
  const mo = original.modules[0]!;
  const mn = novo.modules[0]!;
  if (JSON.stringify({ ...mo, lessons: 0 }) !== JSON.stringify({ ...mn, lessons: 0 })) throw new Error('o módulo mudou');
  if (mn.lessons.length !== 3 || mn.lessons[2]!.id !== 'aula_03') throw new Error('a aula 3 não ficou no fim');
  const carry: Carry[] = [];
  const nosEditados: string[] = [];
  mo.lessons.forEach((lo, li) => {
    const ln = mn.lessons[li]!;
    if (JSON.stringify({ ...lo, graph: 0 }) !== JSON.stringify({ ...ln, graph: 0 })) throw new Error(`${lo.id}: título/descrição da aula mudou`);
    if (JSON.stringify(lo.graph.nodes.map((n) => n.id)) !== JSON.stringify(ln.graph.nodes.map((n) => n.id))) throw new Error(`${lo.id}: os ids de cena mudaram`);
    if (JSON.stringify(lo.graph.edges) !== JSON.stringify(ln.graph.edges)) throw new Error(`${lo.id}: as arestas mudaram`);
    if (JSON.stringify(lo.graph.layout) !== JSON.stringify(ln.graph.layout)) throw new Error(`${lo.id}: o layout mudou`);
    lo.graph.nodes.forEach((no: any, ni) => {
      const nn: any = ln.graph.nodes[ni]!;
      const chaves = NOS_EDITAVEIS[lo.id]?.[no.id];
      if (!chaves) {
        if (JSON.stringify(no) !== JSON.stringify(nn)) throw new Error(`${lo.id}/${no.id}: cena que deveria ficar intacta mudou`);
      } else {
        const todas = new Set([...Object.keys(no), ...Object.keys(nn)]);
        for (const k of todas) if (!chaves.includes(k) && JSON.stringify(no[k]) !== JSON.stringify(nn[k])) throw new Error(`${lo.id}/${no.id}: campo "${k}" mudou e não era previsto`);
        nosEditados.push(`${lo.id}/${no.id}`);
      }
      // ajuste carregado na regravação (carryAdjust): antes x depois (planos intocados, então tem que dar igual)
      const adj = no.media?.adjust;
      if (adj && no.direction) {
        const st: AdjustState = { drop: adj.drop ?? [], cut: adj.cut ?? {}, ...(adj.teaser !== undefined ? { teaser: adj.teaser } : {}) };
        const a = carryAdjust(st, adj.baseLines ?? null, no.direction.shots);
        const d = carryAdjust(st, adj.baseLines ?? null, nn.direction.shots);
        const igual = JSON.stringify(a.request) === JSON.stringify(d.request);
        carry.push({ aula: lo.id, no: no.id, antes: a.request, depois: d.request, igual });
        if (!igual) throw new Error(`${lo.id}/${no.id}: o ajuste carregado mudou`);
      }
    });
  });
  if (nosEditados.length !== 4) throw new Error(`esperava 4 cenas editadas nas aulas 1 e 2, achei ${nosEditados.length}`);
  return { carry, nosEditados };
}

function resumoCompilacao(doc: Doc) {
  const r = compileCourse(doc);
  const cont = (l: { code: string }[]) => l.reduce<Record<string, number>>((a, x) => ((a[x.code] = (a[x.code] ?? 0) + 1), a), {});
  return { ok: r.ok, erros: r.errors, avisos: cont(r.warnings), avisosLista: r.warnings.filter((w) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) };
}

/** reações atuais do curso cuja abertura o ajuste fino de reação consegue cortar (REACTION_OPENERS): só estas teriam corte limpo */
function reacoesCortaveis(doc: Doc): string[] {
  const out: string[] = [];
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes as any[]) {
    if (n.type !== 'choice') continue;
    for (const o of n.options) {
      const t = (o.reaction?.text ?? '').trim();
      if (REACTION_OPENERS.some((x) => t.startsWith(`${x} `))) out.push(`${l.id}/${n.id}~${o.id}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply, não os dois');
  const apply = args.includes('--apply');
  const iSaida = args.indexOf('--saida');
  const saida = iSaida >= 0 && args[iSaida + 1] ? args[iSaida + 1]! : 'docs/novos-cursos/piloto-c24/aplicacao.antes-depois.json';
  const prop = JSON.parse(readFileSync(PROPOSTA, 'utf8')) as P;
  if (prop.curso.id !== COURSE_ID) throw new Error('a proposta é de outro curso');

  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const abertos = (await listJobsForCourse(db, COURSE_ID)).filter((j) => j.status === 'queued' || j.status === 'running');
    if (abertos.length) console.log(`[piloto-c24] ATENÇÃO: ${abertos.length} job(s) de vídeo abertos neste curso: ${abertos.map((j) => `${j.lessonId}/${j.nodeId}`).join(', ')}`);
    const publicada = await getLatestVersion(db, COURSE_ID);
    if (!publicada) throw new Error('curso sem versão publicada (nada a comparar para a migração das matrículas)');

    for (let tentativa = 1; ; tentativa++) {
      const d = await getDraft(db, COURSE_ID);
      if (!d) throw new Error('rascunho não encontrado');
      const original = d.document as Doc;
      if (original.modules.some((m) => m.lessons.some((l) => l.id === 'aula_03'))) {
        console.log(`[piloto-c24] o rascunho (revisão ${d.revision}) já tem a aula_03: nada a fazer`);
        return;
      }
      const novo = aplicar(original, prop);
      const { carry, nosEditados } = conferirDiff(original, novo);
      const append = onlyAppendedLessons(publicada.document, novo);
      const stale0 = cenasStale(original);
      const stale1 = cenasStale(novo);
      if (JSON.stringify(stale0) !== JSON.stringify(stale1)) throw new Error('as cenas desatualizadas mudaram (nenhuma cena existente deveria ficar desatualizada)');
      const antes = resumoCompilacao(original);
      const depois = resumoCompilacao(novo);

      const aula3 = novo.modules[0]!.lessons[2]!;
      const contagem = {
        planosAula3: aula3.graph.nodes.reduce((b, n: any) => b + (n.direction?.shots.length ?? 0), 0),
        palavrasFaladasPlanos: aula3.graph.nodes.reduce((b, n: any) => b + (n.narration ? String(n.narration).split(/\s+/).length : 0), 0),
        reacoesNovas: aula3.graph.nodes.reduce((b: number, n: any) => b + (n.type === 'choice' ? n.options.filter((o: any) => o.reaction?.text).length : 0), 0),
        palavrasReacoes: aula3.graph.nodes.reduce((b: number, n: any) => b + (n.type === 'choice' ? n.options.reduce((c: number, o: any) => c + String(o.reaction?.text ?? '').split(/\s+/).length, 0) : 0), 0),
        nos: aula3.graph.nodes.length,
        tiposDosNos: aula3.graph.nodes.map((n) => `${n.id}:${n.type}`),
      };
      const cortaveis = reacoesCortaveis(original);
      if (tentativa === 1) {
        console.log(`[piloto-c24] rascunho na revisão ${d.revision}; versão publicada comparada: v${publicada.versionNumber}`);
        console.log(`[piloto-c24] cenas editadas nas aulas 1–2: ${nosEditados.join(', ')}`);
        console.log(`[piloto-c24] carryAdjust antes/depois: ${carry.map((c) => `${c.aula}/${c.no}=${c.igual ? 'IGUAL' : 'DIFERENTE'}`).join(' ') || 'nenhuma cena com ajuste'}`);
        console.log(`[piloto-c24] contagem aula 3: ${JSON.stringify(contagem)}`);
        console.log(`[piloto-c24] reações atuais com abertura cortável pelo ajuste fino (REACTION_OPENERS): ${cortaveis.length ? cortaveis.join(', ') : 'nenhuma → as reações de abertura repetida ficam como estão (decisão 4)'}`);
        console.log(`[piloto-c24] cenas desatualizadas antes: [${stale0.join(', ')}] depois: [${stale1.join(', ')}]`);
        console.log(`[piloto-c24] onlyAppendedLessons(publicada, rascunho novo) = ${append}`);
        console.log(`[piloto-c24] compilador: ok=${depois.ok} erros=${depois.erros.length} avisos=${JSON.stringify(depois.avisos)} (antes: ok=${antes.ok} avisos=${JSON.stringify(antes.avisos)})`);
        for (const e of depois.erros) console.log(`[piloto-c24]   ERRO ${e.code} ${e.lessonId ?? ''}/${e.nodeId ?? ''}: ${e.message}`);
        for (const w of depois.avisosLista) console.log(`[piloto-c24]   aviso ${w.code} ${w.lessonId ?? ''}/${w.nodeId ?? ''}: ${w.message}`);
      }
      if (!append) throw new Error('onlyAppendedLessons recusou: a migração das matrículas não aceitaria esta versão');
      if (!depois.ok) throw new Error('o compilador recusou o rascunho novo');

      const relatorio = {
        script: 'piloto-c24',
        modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
        geradoEm: new Date().toISOString(),
        courseId: COURSE_ID,
        revisaoAntes: d.revision,
        versaoPublicadaComparada: publicada.versionNumber,
        onlyAppendedLessons: append,
        contagem,
        nosEditadosAulas1e2: nosEditados,
        carryAdjust: carry,
        reacoesAberturaRepetida: { decisao: 'mantidas (sem regravar, sem cortar)', motivo: 'o ajuste fino de reação só apara as aberturas de REACTION_OPENERS ("Boa escolha!"…); nenhuma das 8 reações com abertura repetida começa com uma delas', cortaveis },
        cenasDesatualizadasAntes: stale0,
        cenasDesatualizadasDepois: stale1,
        compilador: { antes, depois },
        aula3: aula3,
      };
      if (!apply) {
        writeFileSync(saida, JSON.stringify(relatorio, null, 1));
        console.log(`[piloto-c24] dry-run: nada gravado. Relatório em ${saida}`);
        return;
      }
      try {
        const salvo = await saveDraft(db, { courseId: COURSE_ID, document: novo, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'Piloto C24: aula 3 (decisão sobre o plano que muda, missão “Leve para a vida real”, despedida), a01/a02 e fim da aula 2 (proposta revisada)' });
        console.log(`[piloto-c24] rascunho ${d.revision} → ${salvo.revision}`);
        const v = await validateDraft(db, COURSE_ID);
        console.log(`[piloto-c24] validateDraft (o mesmo da publicação): ok=${v.ok} erros=${v.errors.length} avisos=${v.warnings.length} mídia=${JSON.stringify(v.media)}`);
        writeFileSync(saida, JSON.stringify({ ...relatorio, revisaoDepois: salvo.revision, validateDraft: { ok: v.ok, erros: v.errors, midia: v.media, avisos: v.warnings.filter((w) => !['MEDIA_MISSING', 'MEDIA_STALE'].includes(w.code)) } }, null, 1));
        console.log(`[piloto-c24] antes/depois em ${saida}`);
        return;
      } catch (e) {
        if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
          console.log(`[piloto-c24] conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
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
  console.error(`[piloto-c24] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

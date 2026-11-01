/**
 * Montagem dos cursos finais do pacote-15 a partir das `AulaSpec` (final.ts): roteiro em Markdown → importador do motor
 * → kit → adaptação → validação. Parte PURA (sem banco, sem rede, nada pago).
 */
import { applyIntent, createInitialState } from '@lms/course-engine';
import {
  allLessons,
  assembleScaffold,
  boldSegments,
  callShot,
  callShotCamera,
  callStatuses,
  cameraZoneOf,
  CARD_LIMITS,
  CHIPS_LIMITS,
  nextChipsCamera,
  resolveCameraPlacement,
  zoneCamerasOf,
  zoneTalkCamera,
  compileCourse,
  CourseDocumentSchema,
  directionNarration,
  importMarkdownCourse,
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
  type Camera,
  type RecapItem,
  type SceneDirection,
  type Shot,
} from '@lms/course-schema';
import { OBJETIVO_CURSO, PALETAS } from './dados';
import { ABERTURA_REACAO, apresentacao, baixa1, GESTO_ABERTURA, GESTO_CHAMADA, GESTOS_PROIBIDOS_RE, GESTOS_SEGUROS, gestosDoNo, MARCADOR, norm, reacaoDe, recortar, rt, semPonto, textoDo, type CursoPacote, type Instrutor } from './construir';
import { PLANOS } from './planos';
import type { AulaSpec, DecSpec, VidSpec } from './final';

/** O curso com o objetivo final da revisão pré-gravação (dados.ts), quando o do pacote não serve para a fala e a descrição. */
export function comObjetivoFinal(curso: CursoPacote): CursoPacote {
  const o = OBJETIVO_CURSO[curso.slug_proposto];
  return o ? { ...curso, objective: o } : curso;
}

const aspas = (s: string) => `"${s.replace(/"/g, "'")}"`;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Códigos (V, Q, A) a partir dos quais o roteiro numera as cenas; no enxerto de uma aula num curso existente evitam colisão. */
export interface Codigos { v: number; q: number; a: number }
export interface IdsDaAula { aula: string; v1: string; q1: string; v2: string; q2: string; v3?: string; a: string; fim: string }

/** Ids de nó que o importador dá a cada cena (código em minúsculas). */
export function idsDasAulas(aulas: readonly AulaSpec[], cod: Codigos = { v: 1, q: 1, a: 1 }): IdsDaAula[] {
  let { v, q, a } = cod;
  return aulas.map((s) => {
    const mk = (p: string, n: number) => `${p}${pad2(n)}`;
    const ids: IdsDaAula = { aula: s.id, v1: mk('v', v++), q1: mk('q', q++), v2: mk('v', v++), q2: mk('q', q++), ...(s.explic2 ? { v3: mk('v', v++) } : {}), a: mk('a', a++), fim: `fim_${s.id}` };
    return ids;
  });
}

/** Partes faladas da abertura e da explicação 1 (esta leva a chamada da 2ª decisão). */
export function falasDaAula(s: AulaSpec, primeira: boolean, instrutor: Instrutor, objetivoCurso: string) {
  const f1 = splitSentences(norm(s.d1.ctx));
  const f2 = splitSentences(norm(s.d2.ctx));
  // o que antecede a última frase do caso: as próprias frases do caso ou, quando a fala difere do painel, a fala escolhida
  const antes1 = s.d1.falaAntes ? splitSentences(norm(s.d1.falaAntes)) : f1.slice(0, -1);
  const antes2 = s.d2.falaAntes ? splitSentences(norm(s.d2.falaAntes)) : f2.slice(0, -1);
  const antes = primeira ? [apresentacao(instrutor), `Hoje, vamos ${baixa1(semPonto(objetivoCurso))}.`] : [];
  const aberturaFala = [...antes, s.abertura.fala, `No fim desta aula, tem uma missão para você: ${s.missao}.`, ...antes1].join(' ');
  const chamada1 = `${f1[f1.length - 1]!} Agora, responda: ${baixa1(s.d1.perg)}`;
  const explicFala = [s.explic1.fala, ...antes2].join(' ');
  const chamada2 = `${f2[f2.length - 1]!} Agora, responda: ${baixa1(s.d2.perg)}`;
  return { aberturaFala, chamada1, explicFala, chamada2, ultimoFato1: f1[f1.length - 1]!, ultimoFato2: f2[f2.length - 1]!, antes1, antes2 };
}

/** Roteiro do curso (ou de aulas avulsas) no formato do importador do motor. */
export function montarMarkdown(cursoDoPacote: CursoPacote, aulas: readonly AulaSpec[], instrutor: Instrutor, cod: Codigos = { v: 1, q: 1, a: 1 }, numeroPrimeiraAula = 1): string {
  const curso = comObjetivoFinal(cursoDoPacote);
  const ids = idsDasAulas(aulas, cod);
  const L: string[] = [];
  L.push(`# ${curso.title}`, '', `Ideia: ${curso.objective}`, `Público: ${norm(curso.audience)}`, `Objetivo final: ${curso.objective}`, '');
  L.push(`## Módulo 1 — ${curso.title}`, '', `Descrição: ${curso.objective}`, '');
  const code = (id: string) => id.toUpperCase();
  const dec = (codigo: string, d: DecSpec, chamada: string, destino: string) => {
    L.push(`### ${code(codigo)} — ${d.perg}`, '', `Situação: ${norm(d.ctx)}`, '', 'Voz opcional: não', '', `Chamada: ${aspas(chamada)}`, '');
    L.push('| Escolha | Qualidade | Feedback | Destino |', '|---|---|---|---|');
    for (const o of d.ops) L.push(`| ${aspas(norm(o.t))} | ${o.q === 'strong' ? 'forte' : o.q === 'ok' ? 'ok' : 'fraca'} | ${norm(o.f)} | ${code(destino)} |`);
    L.push('');
  };
  const vid = (codigo: string, v: VidSpec, fala: string, comCartao: boolean) => {
    L.push(`### ${code(codigo)} — ${v.titulo}`, '', '**Fala para gravação**', '', aspas(fala), '', `Texto na tela: ${norm(v.tela)}`);
    if (comCartao && v.apoio) L.push(`Cartão: ${v.apoio.titulo}`, ...v.apoio.topicos.map((t) => `- ${t}`));
    L.push('');
  };
  aulas.forEach((s, i) => {
    const id = ids[i]!;
    const f = falasDaAula(s, i === 0 && numeroPrimeiraAula === 1, instrutor, curso.objective);
    L.push(`### Aula ${numeroPrimeiraAula + i} — ${s.titulo}`, '', `Objetivo: ${s.objetivo}`, '');
    vid(id.v1, s.abertura, f.aberturaFala, false);
    dec(id.q1, s.d1, f.chamada1, id.v2);
    vid(id.v2, s.explic1, f.explicFala, true);
    dec(id.q2, s.d2, f.chamada2, id.v3 ?? id.a);
    if (s.explic2 && id.v3) vid(id.v3, s.explic2, norm(s.explic2.fala), true);
    L.push(`### ${code(id.a)} — Na prática`, '', `Pergunta: ${s.pratica.enunciado}`, 'Pular: sim', 'Destino: FIM', '', `### FIM — Leve para o dia a dia`, '');
  });
  return L.join('\n');
}

export interface ContextoAdaptacao {
  curso: CursoPacote;
  aulas: readonly AulaSpec[];
  paleta: 'classica' | 'invertida';
  cod: Codigos;
  /** curso novo (marcador, briefing, paleta, etapas) ou enxerto numa aula de curso existente (só a aula) */
  enxerto: boolean;
  /** trilha final (a do pacote é só a proposta) */
  trilha?: string;
}

/** Ajusta o documento devolvido pelo importador (kit já aplicado). Puro; devolve uma cópia. */
export function adaptarDocumento(input: CourseDocument, ctx: ContextoAdaptacao): CourseDocument {
  const { aulas, enxerto } = ctx;
  const curso = comObjetivoFinal(ctx.curso);
  const doc = structuredClone(input) as CourseDocument;
  const lessons = doc.modules.flatMap((m) => m.lessons);
  const ids = idsDasAulas(aulas, ctx.cod);
  lessons.forEach((lesson, i) => {
    const s = aulas[i]!;
    const id = ids[i]!;
    const ultimaDoCurso = !enxerto && i === lessons.length - 1;
    let kForte = i;
    let kOutra = i * 3;
    lesson.graph.nodes = lesson.graph.nodes.map((node): AnyNode => {
      if (node.id === id.a && node.type === 'reflection') {
        const at = s.pratica.atividade;
        return {
          ...node,
          title: recortar(semPonto(at.titulo ?? s.pratica.enunciado), 120),
          objectiveIds: lesson.objectiveIds,
          required: true,
          prompt: rt(smartQuotes(norm(s.pratica.instrucoes))),
          intro: at.intro.slice(0, 300),
          minLength: 0,
          maxLength: 800,
          scaffold: { template: at.molde, slots: at.grupos.map((g) => ({ id: g.id, label: recortar(g.q.replace(/\?$/, ''), 60), question: g.q, options: g.opcoes, allowCustom: true, customMaxLength: 120 })) },
        };
      }
      if (node.id === id.fim && node.type === 'end') {
        const recap: RecapItem[] = [{ id: id.a, label: recortar(semPonto(s.pratica.enunciado), 80), kind: 'reflection', nodeId: id.a, composedNodeIds: [id.a], emptyText: 'Você deixou uma atividade para depois. Ela continua disponível no seu roteiro.' }];
        return {
          ...node,
          title: 'Leve para o dia a dia',
          summary: rt(smartQuotes(s.fechamento), ...(ultimaDoCurso ? [smartQuotes(norm(`${curso.end_node.title}. ${curso.end_node.text}`))] : [])),
          recap,
          recapTitle: 'Meu roteiro',
        };
      }
      if (node.type === 'choice') {
        const d = node.id === id.q1 ? s.d1 : s.d2;
        // numa decisão com duas recomendadas (revisão pré-gravação), só a primeira consome a lista das recomendadas: a outra anda com
        // as demais, como andava quando era "ok", e as aberturas das reações seguintes da aula não mudam
        let fortesVistas = 0;
        const options = node.options.map((o, k) => {
          const forte = o.quality === 'strong' && fortesVistas++ === 0;
          const lista = forte ? ABERTURA_REACAO.forte : ABERTURA_REACAO.outra;
          // os contadores andam mesmo quando a reação vem escrita (r): as aberturas das outras reações não mudam
          const abertura = forte ? lista[kForte++ % lista.length]! : lista[kOutra++ % lista.length]!;
          const escrita = d.ops[k]?.r;
          return { ...o, reaction: { text: escrita ? norm(smartQuotes(escrita)) : reacaoDe(abertura, textoDo(o.feedback)) } };
        });
        return { ...node, options, prompt: rt(smartQuotes(norm(d.ctx)), d.perg) };
      }
      return node;
    });
    const obj = doc.objectives.find((o) => o.id === lesson.objectiveIds[0]);
    if (obj) {
      obj.title = s.objetivo.slice(0, 200);
      obj.criterion = 'Confirma uma escolha em cada situação da aula e chega ao fechamento. A atividade "Na prática" é opcional: salva no roteiro ou fica para depois.';
    }
    lesson.description = obj?.title ?? lesson.description;
    lesson.estimatedMinutes = 1;
    lesson.graph.nodes = lesson.graph.nodes.map((node, k) => gestosDoNo(node, !enxerto && i === 0 && k === 0));
    const vids: Record<string, VidSpec | undefined> = { [id.v1]: s.abertura, [id.v2]: s.explic1, ...(id.v3 ? { [id.v3]: s.explic2 } : {}) };
    const doNo = lesson.graph.nodes;
    lesson.graph.nodes = doNo.map((node, k) => forcarPlanos(node, `${curso.slug_proposto}/${lesson.id}/${node.id}`, !enxerto && i === 0 && k === 0, { vid: vids[node.id], presentation: doc.presentation, nodes: doNo, index: k }));
  });
  if (enxerto) return doc;

  doc.brief = {
    ...doc.brief,
    context: `Revisão editorial pendente: ${curso.editorial_review}`.slice(0, 1000),
    prerequisites: norm(curso.prerequisites).slice(0, 500),
    targetMinutes: 5,
    sourcesNote: `${MARCADOR(curso.id)} Pacote editorial pacote-15 (dna-editorial-1.0), com as decisões do dono sobre a análise editorial (docs/novos-cursos/analise-fable.md): duas decisões por aula, fusões e reorientações. Texto do pacote preservado onde o caso é o do pacote; casos novos e adaptações em docs/novos-cursos/importacao.md. Trilha: ${ctx.trilha ?? curso.track_proposed} (a do pacote era "${curso.track_proposed}"; ver importacao.md). Instrutor sugerido: ${curso.instructor_proposed}. Revisão editorial: ${curso.editorial_review} Duração real: não medida (sem vídeos).`.slice(0, 2000),
  };
  doc.learnerSummary = curso.objective.slice(0, 400);
  doc.description = [curso.objective, `Público: ${norm(curso.audience)}`].join(' ').slice(0, 2000);
  doc.branding = { ...doc.branding, videoPalette: { ...PALETAS[ctx.paleta] } };
  if (doc.branding.bumper) doc.branding = { ...doc.branding, bumper: { ...doc.branding.bumper, playOn: ['lesson_end'] } };
  doc.wizard = { ...doc.wizard, step: 'previa', completedSteps: ['tema', 'conteudo', 'estrutura', 'aulas', 'apresentacao'], finished: true };
  return CourseDocumentSchema.parse(doc);
}

/** Contexto para montar os planos de uma cena que o importador não conseguiu recortar (cartão com pouca fala). */
export interface ContextoPlanos {
  vid?: VidSpec;
  presentation: CourseDocument['presentation'];
  /** cenas da aula na ordem e posição desta (para a câmera de fala e o lado das pílulas) */
  nodes: AnyNode[];
  index: number;
}

/**
 * Cortes da fala fixados à mão pela revisão pré-gravação (planos.ts): os planos da cena passam a ser exatamente `linhas`, cada um
 * com o enquadramento do plano de mesmo papel que o importador criou (fala, pílulas, chamada). Gesto contido em todos
 * ("nods slowly, warm" e "hands relaxed at the waist, calm, small nods"; a chamada mantém o convite). Para se a fala mudou.
 * Se o importador não montou a direção (um cartão precisa de 13 a 39 palavras de fala; uma frase curta de revisão fica abaixo),
 * os planos nascem aqui, com as mesmas câmeras e o mesmo cartão que o importador usaria (estúdio com zonas).
 */
export function forcarPlanos(node: AnyNode, chave: string, primeiroDoCurso = false, ctx?: ContextoPlanos): AnyNode {
  const plano = PLANOS[chave];
  if (!plano) return node;
  if (node.type !== 'scenario' && node.type !== 'content') throw new Error(`${chave}: planos.ts aponta para uma cena que não é um vídeo`);
  const fala = node.narration ?? '';
  // "{apresentacao}" = a frase de apresentação da abertura do curso (leva o nome de quem apresenta)
  const apres = fala.match(/^Oi! Eu sou .*? neste curso da DNA Work\./)?.[0];
  const linhas = plano.linhas.map((l) => (apres ? l.replace('{apresentacao}', apres) : l));
  if (!sameWords(linhas.join(' '), fala)) throw new Error(`${chave}: os planos de planos.ts não batem com a fala da cena.\n  planos: ${linhas.join(' ')}\n  fala:   ${fala}`);
  const contidos = GESTOS_SEGUROS.slice(0, 2);
  let k = 0;
  const n = linhas.length;
  let shots: Shot[];
  let corpo = node.body;
  if (node.direction?.shots.length) {
    const atuais = node.direction.shots;
    const chamada = atuais.find((s) => s.id === 'chamada');
    const pilulas = atuais.find((s) => s.layout === 'presenter_chips');
    const modelo = atuais.find((s) => s.layout === 'presenter' && s.id !== 'chamada') ?? chamada ?? atuais[0]!;
    if (pilulas && plano.chips === undefined) throw new Error(`${chave}: a cena tem pílulas e planos.ts não diz em qual plano elas entram (chips)`);
    shots = linhas.map((line, i) => {
      if (chamada && i === n - 1) return { ...chamada, id: 'chamada', line, motionPrompt: GESTO_CHAMADA };
      if (plano.chips === i) {
        if (!pilulas) throw new Error(`${chave}: planos.ts pede pílulas no plano ${i + 1}, mas a cena não tem cartão`);
        return { ...pilulas, id: `s${i + 1}`, line, motionPrompt: contidos[k++ % 2]! };
      }
      return { ...modelo, id: `s${i + 1}`, line, motionPrompt: contidos[k++ % 2]! };
    });
  } else {
    const apoio = ctx?.vid?.apoio;
    const cameras = (ctx?.presentation?.cameras ?? []) as Camera[];
    const set = zoneCamerasOf(cameras);
    if (!ctx || !set) throw new Error(`${chave}: sem direção e sem câmeras de zona para montar os planos`);
    const nativo = (id: string): Shot['framing'] => {
      const cam = cameras.find((c) => c.id === id);
      return cam && resolveCameraPlacement(ctx.presentation ?? null, cam).placement === 'full_frame' ? (cam.nativeFraming ?? 'medium') : 'medium';
    };
    const videos = ctx.nodes.filter((x) => x.type === 'scenario' || x.type === 'content');
    const posicao = videos.findIndex((x) => x.id === node.id);
    const fala0 = zoneTalkCamera(set, posicao);
    const ladoDe = (x: AnyNode | undefined) => {
      const s = x && 'direction' in x ? x.direction?.shots.find((sh) => sh.layout === 'presenter_chips') : undefined;
      return s ? cameraZoneOf(cameras, s.cameraId) : undefined;
    };
    const anteriores = videos.slice(0, posicao).map(ladoDe).filter((z): z is 'left' | 'right' => z === 'left' || z === 'right');
    let lado = nextChipsCamera(set, anteriores.at(-1));
    const seguinte = ladoDe(videos[posicao + 1]);
    if (!anteriores.length && seguinte === lado.zone) lado = nextChipsCamera(set, seguinte);
    const base = { cameraMove: 'static' as const, layout: 'presenter' as const, transitionIn: 'cut' as const };
    const cartao = apoio
      ? { title: apoio.titulo.split(/\s+/).slice(0, CARD_LIMITS.titleWords).join(' ').slice(0, 80), bullets: apoio.topicos.slice(0, CHIPS_LIMITS.chips).map((b) => b.slice(0, 90)), style: 'checklist' as const }
      : undefined;
    shots = linhas.map((line, i) => {
      if (i === n - 1 && /Agora, responda: /.test(line)) {
        const cam = callShotCamera(linhas.slice(0, -1).map(() => ({ cameraId: fala0, layout: 'presenter' as const })), cameras) ?? fala0;
        return callShot(line, cam, cameras.find((c) => c.id === cam)?.nativeFraming ?? 'medium');
      }
      if (plano.chips === i) {
        if (!cartao) throw new Error(`${chave}: planos.ts pede pílulas e a cena não tem apoio visual`);
        return { ...base, id: `s${i + 1}`, line, cameraId: lado.cameraId, framing: nativo(lado.cameraId), layout: 'presenter_chips' as const, slide: cartao, motionPrompt: contidos[k++ % 2]! };
      }
      return { ...base, id: `s${i + 1}`, line, cameraId: fala0, framing: nativo(fala0), motionPrompt: contidos[k++ % 2]! };
    });
    // o importador, sem recorte, pôs o cartão no texto da tela; com os planos montados o texto da tela volta a ser o da cena
    if (ctx.vid) corpo = rt(smartQuotes(ctx.vid.tela));
  }
  if (primeiroDoCurso && shots[0] && shots[0].id !== 'chamada') shots[0] = { ...shots[0], motionPrompt: GESTO_ABERTURA };
  const direction: SceneDirection = { version: 1, shots, intent: node.direction?.intent ?? `Estúdio com zonas: a fala na câmera da cena; as pílulas "${ctx?.vid?.apoio?.titulo ?? ''}" surgem na parede livre e a fala volta.`, source: 'author' };
  return { ...node, body: corpo, direction, narration: directionNarration(direction) } as AnyNode;
}

export interface Construcao {
  document: CourseDocument;
  markdown: string;
  avisosImportador: CompileIssue[];
}

/** Importador do motor + kit (opcional) + adaptação. */
export function construirCurso(
  cursoDoPacote: CursoPacote,
  aulas: readonly AulaSpec[],
  instrutor: Instrutor,
  paleta: 'classica' | 'invertida',
  opcoes: MarkdownCourseOptions,
  aplicarKit?: (d: CourseDocument) => CourseDocument,
  enxerto?: { cod: Codigos; numeroPrimeiraAula: number },
  trilha?: string,
): Construcao {
  const curso = comObjetivoFinal(cursoDoPacote);
  const cod = enxerto?.cod ?? { v: 1, q: 1, a: 1 };
  const markdown = montarMarkdown(curso, aulas, instrutor, cod, enxerto?.numeroPrimeiraAula ?? 1);
  const r = importMarkdownCourse(markdown, { ...opcoes, lessonMinutes: 1, targetMinutes: 5 });
  if (!r.compile.ok) throw new Error(`${curso.slug_proposto}: o importador não compilou: ${r.compile.errors.map((e) => e.message).join('; ')}`);
  const comKit = aplicarKit ? aplicarKit(r.document) : r.document;
  return { document: adaptarDocumento(comKit, { curso, aulas, paleta, cod, enxerto: !!enxerto, ...(trilha ? { trilha } : {}) }), markdown, avisosImportador: r.allWarnings };
}

/* ------------------------------------------------------------------ */
/* Validação                                                            */
/* ------------------------------------------------------------------ */

export interface ResultadoValidacao {
  erros: string[];
  avisos: CompileIssue[];
  resumo: { aulas: number; videos: number; decisoes: number; opcoes: number; retornos: number; praticas: number; reacoes: number; cenasSemMidia: number; posicaoRecomendada: number[]; recomendadaMaisLonga: number; maiorDiferenca: number; qualidades: Record<string, number> };
}

function contem(fala: string, trecho: string): boolean {
  const a = spokenWords(fala);
  const b = spokenWords(trecho);
  if (!b.length) return false;
  for (let k = 0; k + b.length <= a.length; k++) if (b.every((w, j) => a[k + j] === w)) return true;
  return false;
}

export function validarCurso(doc: CourseDocument, cursoDoPacote: CursoPacote, aulas: readonly AulaSpec[], opts: { primeiraAulaNoCurso?: boolean; cod?: Codigos } = {}): ResultadoValidacao {
  const curso = comObjetivoFinal(cursoDoPacote);
  const erros: string[] = [];
  const slug = curso.slug_proposto;
  const erro = (m: string) => erros.push(`${slug}: ${m}`);
  const resumo: ResultadoValidacao['resumo'] = { aulas: 0, videos: 0, decisoes: 0, opcoes: 0, retornos: 0, praticas: 0, reacoes: 0, cenasSemMidia: 0, posicaoRecomendada: [], recomendadaMaisLonga: 0, maiorDiferenca: 0, qualidades: { strong: 0, ok: 0, weak: 0 } };
  const parsed = CourseDocumentSchema.safeParse(doc);
  if (!parsed.success) erro(`esquema inválido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const compilado = compileCourse(doc);
  for (const e of compilado.errors) erro(`compilador: ${e.code}${e.lessonId ? ` [${e.lessonId}]` : ''}: ${e.message}`);

  const lessons = allLessons(doc) as Lesson[];
  const ids = idsDasAulas(aulas, opts.cod);
  if (lessons.length !== aulas.length) erro(`${lessons.length} aulas (esperadas ${aulas.length})`);
  if (doc.completion.requiredLessonIds.length !== lessons.length) erro('conclusão do curso não exige todas as aulas');
  lessons.forEach((lesson, i) => {
    resumo.aulas++;
    const s = aulas[i];
    const id = ids[i];
    if (!s || !id) return erro(`aula ${i + 1} sem especificação`);
    const R = lesson.id;
    const g = lesson.graph;
    const nodes = new Map(g.nodes.map((x) => [x.id, x]));
    if (lesson.id !== s.id) erro(`${R}: id da aula difere de ${s.id}`);

    const vistos = new Set<string>();
    const pilha = [g.startNodeId];
    while (pilha.length) {
      const nid = pilha.pop()!;
      if (vistos.has(nid)) continue;
      vistos.add(nid);
      for (const e of g.edges) if (e.from === nid) pilha.push(e.to);
    }
    for (const x of g.nodes) if (!vistos.has(x.id)) erro(`${R}: nó "${x.id}" inalcançável`);
    const fim = g.nodes.find((x) => x.type === 'end');
    if (g.nodes.filter((x) => x.type === 'end').length !== 1) erro(`${R}: deve haver 1 encerramento`);
    for (const x of g.nodes) if (x.type !== 'end' && !g.edges.some((e) => e.from === x.id)) erro(`${R}: "${x.id}" sem saída`);
    if (g.nodes.some((x) => x.type === 'assessment')) erro(`${R}: não deve haver avaliação (assessment)`);

    const videos = g.nodes.filter((x): x is Extract<AnyNode, { type: 'scenario' | 'content' }> => x.type === 'scenario' || x.type === 'content');
    const decisoes = g.nodes.filter((x): x is ChoiceNode => x.type === 'choice');
    const refl = g.nodes.filter((x) => x.type === 'reflection');
    resumo.videos += videos.length;
    resumo.decisoes += decisoes.length;
    resumo.praticas += refl.length;
    const nVideos = s.explic2 ? 3 : 2;
    if (videos.length !== nVideos) erro(`${R}: ${videos.length} vídeos (esperados ${nVideos})`);
    if (decisoes.length !== 2) erro(`${R}: ${decisoes.length} decisões (esperadas 2)`);
    if (refl.length !== 1) erro(`${R}: ${refl.length} práticas (esperada 1)`);
    const vAb = nodes.get(id.v1) as (typeof videos)[number] | undefined;
    const vEx = nodes.get(id.v2) as (typeof videos)[number] | undefined;
    const vEx2 = id.v3 ? (nodes.get(id.v3) as (typeof videos)[number] | undefined) : undefined;
    const q1 = nodes.get(id.q1) as ChoiceNode | undefined;
    const q2 = nodes.get(id.q2) as ChoiceNode | undefined;
    const pr = nodes.get(id.a);
    if (!vAb || !vEx || !q1 || !q2 || !pr || (id.v3 && !vEx2)) return erro(`${R}: cenas esperadas não existem (${id.v1}, ${id.q1}, ${id.v2}, ${id.q2}, ${id.a})`);
    const primeira = (opts.primeiraAulaNoCurso ?? true) && i === 0;
    const f = falasDaAula(s, primeira, { nome: '', papel: '', pronome: 'she' }, curso.objective);

    // vídeos: a fala acrescentada pelo motor + a fala do texto; planos = fala; sem gesto proibido; texto na tela
    const falas: Array<[typeof vAb, string, string, VidSpec]> = [
      [vAb, 'abertura', s.abertura.fala, s.abertura],
      [vEx, 'explicação 1', s.explic1.fala, s.explic1],
      ...(vEx2 && s.explic2 ? ([[vEx2, 'explicação 2', s.explic2.fala, s.explic2]] as Array<[typeof vAb, string, string, VidSpec]>) : []),
    ];
    for (const [no, nome, fala, vs] of falas) {
      if (!contem(no.narration ?? '', smartQuotes(fala))) erro(`${R}: fala da ${nome} não está inteira na cena "${no.id}"`);
      if (!no.direction?.shots.length) erro(`${R}: cena "${no.id}" sem planos`);
      else {
        if (!sameWords(directionNarration(no.direction), no.narration ?? '')) erro(`${R}: fala de "${no.id}" difere da soma dos planos`);
        for (const sh of no.direction.shots) {
          if (GESTOS_PROIBIDOS_RE.test(sh.motionPrompt ?? '')) erro(`${R}: gesto não recomendado em ${no.id}/${sh.id}: ${sh.motionPrompt}`);
          if (!sh.cameraId) erro(`${R}: plano ${no.id}/${sh.id} sem câmera`);
        }
      }
      if (GESTOS_PROIBIDOS_RE.test(no.motionPrompt ?? '')) erro(`${R}: gesto não recomendado em "${no.id}"`);
      if (!no.media) resumo.cenasSemMidia++;
      if (norm(textoDo(no.body)) !== norm(smartQuotes(vs.tela))) erro(`${R}: texto na tela de "${no.id}" difere`);
      if (vs.apoio) {
        const chips = no.direction?.shots.filter((x) => x.layout === 'presenter_chips' && x.slide) ?? [];
        if (!chips.length) erro(`${R}: "${no.id}" sem apoio visual (pílulas)`);
        for (const sh of chips) for (const b of sh.slide?.bullets ?? []) for (const seg of boldSegments(b)) if (seg.bold && !contem(no.narration ?? '', seg.text)) erro(`${R}: pílula "${seg.text}" não é dita na fala de "${no.id}"`);
      }
    }
    if (primeira && !(vAb.narration ?? '').startsWith('Oi! Eu sou ')) erro(`${R}: a abertura não começa pela apresentação ("Oi! Eu sou…")`);

    // decisões
    const decs: Array<[ChoiceNode, DecSpec, string, typeof vAb, string, string]> = [
      [q1, s.d1, id.q1, vAb, vEx.id, f.ultimoFato1],
      [q2, s.d2, id.q2, vEx, id.v3 ?? id.a, f.ultimoFato2],
    ];
    const aberturasReacao: string[] = [];
    for (const [d, ds, qid, host, destino, ultimoFato] of decs) {
      if (d.options.length !== 3) erro(`${R}/${qid}: ${d.options.length} alternativas`);
      // uma recomendada; duas só quando a revisão decidiu que duas alternativas são adequadas (brief §9: aceitar as duas)
      const fortesSpec = ds.ops.filter((o) => o.q === 'strong').length;
      if (fortesSpec < 1 || fortesSpec > 2) erro(`${R}/${qid}: deve haver 1 recomendada (ou 2, por decisão da revisão)`);
      if (d.options.filter((o) => o.quality === 'strong').length !== fortesSpec) erro(`${R}/${qid}: número de recomendadas difere do especificado`);
      const palavras = d.options.map((o) => spokenWords(o.label).length);
      const iStrong = d.options.findIndex((o) => o.quality === 'strong');
      resumo.posicaoRecomendada.push(iStrong);
      if (palavras[iStrong] === Math.max(...palavras) && palavras.filter((w) => w === palavras[iStrong]).length === 1) resumo.recomendadaMaisLonga++;
      const dif = Math.max(...palavras) - Math.min(...palavras);
      resumo.maiorDiferenca = Math.max(resumo.maiorDiferenca, dif);
      if (dif > 7) erro(`${R}/${qid}: alternativas com ${dif} palavras de diferença (máximo 7)`);
      const retornos = new Set<string>();
      d.options.forEach((o, k) => {
        resumo.opcoes++;
        resumo.retornos++;
        const e = ds.ops[k]!;
        resumo.qualidades[o.quality ?? 'none'] = (resumo.qualidades[o.quality ?? 'none'] ?? 0) + 1;
        if (e.q !== o.quality) erro(`${R}/${qid}: qualidade de ${o.id} difere`);
        // pontos da aresta acompanham a qualidade (strong +2, ok +1, weak 0)
        const efeito = g.edges.find((x) => x.from === d.id && x.optionId === o.id)?.effects?.find((x) => x.var === 'pontos');
        const pontos = e.q === 'strong' ? 2 : e.q === 'ok' ? 1 : 0;
        const dado = efeito && efeito.op === 'inc' ? efeito.by : 0;
        if (dado !== pontos) erro(`${R}/${qid}: pontos da alternativa ${o.id} (${dado}) não acompanham a qualidade ${e.q} (${pontos})`);
        if (norm(o.label).replace(/[“”"]/g, '') !== norm(smartQuotes(e.t)).replace(/[“”"]/g, '')) erro(`${R}/${qid}: alternativa ${o.id} difere`);
        const fb = textoDo(o.feedback);
        if (fb !== norm(smartQuotes(e.f))) erro(`${R}/${qid}: retorno de ${o.id} difere`);
        if (!/Faça assim: /.test(fb)) erro(`${R}/${qid}: retorno de ${o.id} sem próximo passo`);
        if (spokenWords(fb).length > 42) erro(`${R}/${qid}: retorno de ${o.id} com ${spokenWords(fb).length} palavras (máximo 42)`);
        if (retornos.has(fb)) erro(`${R}/${qid}: retorno repetido`);
        retornos.add(fb);
        const dest = g.edges.filter((x) => x.from === d.id && x.optionId === o.id);
        if (dest.length !== 1 || dest[0]!.to !== destino) erro(`${R}/${qid}: alternativa ${o.id} deveria levar a "${destino}"`);
        const r = o.reaction?.text?.trim();
        if (!r) erro(`${R}/${qid}: alternativa ${o.id} sem reação`);
        else {
          resumo.reacoes++;
          if (e.r && r !== norm(smartQuotes(e.r))) erro(`${R}/${qid}: reação de ${o.id} difere da escrita`);
          const w = spokenWords(r).length;
          if (w < 8 || w > 26) erro(`${R}/${qid}: reação de ${o.id} com ${w} palavras (8 a 26)`);
          if (/seja qual for a sua escolha/i.test(r)) erro(`${R}/${qid}: reação com fórmula proibida`);
          aberturasReacao.push(r.split(/[.!?]/)[0]!.trim().toLowerCase());
        }
      });
      const st = callStatuses(g).find((x) => x.choiceId === d.id);
      if (!st?.call) erro(`${R}/${qid}: decisão sem chamada`);
      else {
        if (!st.spoken) erro(`${R}/${qid}: a chamada não é a fala final do vídeo anterior`);
        if (st.hostId !== host.id) erro(`${R}/${qid}: chamada falada em "${st.hostId}", esperado "${host.id}"`);
        if (!/Agora, responda: /.test(st.call)) erro(`${R}/${qid}: chamada fora do padrão`);
        if (!spokenWords(st.call).join(' ').startsWith(spokenWords(smartQuotes(ultimoFato)).join(' '))) erro(`${R}/${qid}: chamada não traz o fato final do caso`);
        if (spokenWords(st.call).length > 28) erro(`${R}/${qid}: chamada com ${spokenWords(st.call).length} palavras (máximo 28)`);
      }
      const dito = spokenWords(host.narration ?? '').join(' ');
      const frasesDoCaso = ds.falaAntes ? [...splitSentences(norm(ds.falaAntes)), splitSentences(norm(ds.ctx)).at(-1)!] : splitSentences(norm(ds.ctx));
      for (const fr of frasesDoCaso) if (!dito.includes(spokenWords(smartQuotes(fr)).join(' '))) erro(`${R}/${qid}: fato do caso não é dito antes da pergunta: "${fr.slice(0, 40)}…"`);
      if (!textoDo(d.prompt).includes(smartQuotes(norm(ds.ctx)))) erro(`${R}/${qid}: "A situação" não traz o caso inteiro`);
      if (!textoDo(d.prompt).endsWith(ds.perg)) erro(`${R}/${qid}: a pergunta do painel difere`);
    }
    if (new Set(aberturasReacao).size !== aberturasReacao.length) erro(`${R}: reações começam iguais (${aberturasReacao.join(' | ')})`);

    // atividade por grupos
    let textoPratica = 'x';
    if (pr.type !== 'reflection') erro(`${R}: a atividade não é uma reflexão`);
    else {
      if (!pr.scaffold) erro(`${R}: prática sem montagem por grupos`);
      else {
        const sc = pr.scaffold;
        if (sc.template !== s.pratica.atividade.molde) erro(`${R}: molde difere`);
        if (sc.slots.length < 2 || sc.slots.length > 4) erro(`${R}: ${sc.slots.length} grupos (2 a 4)`);
        for (const sl of sc.slots) {
          if (!sl.question?.trim()) erro(`${R}: grupo "${sl.id}" sem pergunta`);
          if (sl.options.length < 2 || sl.options.length > 5) erro(`${R}: grupo "${sl.id}" com ${sl.options.length} opções`);
          if (!sl.allowCustom) erro(`${R}: grupo "${sl.id}" sem "Prefiro escrever"`);
        }
        textoPratica = assembleScaffold(sc, Object.fromEntries(sc.slots.map((sl) => [sl.id, sl.options[0]])));
        if (!textoPratica.trim() || textoPratica.length > pr.maxLength) erro(`${R}: frase montada inválida`);
        const pior = Object.fromEntries(sc.slots.map((sl) => [sl.id, sl.options.reduce((x, y) => (y.length > x.length ? y : x), '')]));
        if (assembleScaffold(sc, pior).length > pr.maxLength) erro(`${R}: frase montada pode passar de ${pr.maxLength} caracteres`);
      }
      if (pr.minLength !== 0) erro(`${R}: prática obrigatória (minLength ${pr.minLength}); deveria permitir "Fazer depois"`);
      if (/^miss[aã]o/i.test(pr.title ?? '')) erro(`${R}: título da prática com "Missão:"`);
      if (norm(pr.title ?? '') !== recortar(semPonto(s.pratica.atividade.titulo ?? s.pratica.enunciado), 120)) erro(`${R}: título da prática difere do enunciado`);
      if (!pr.intro?.trim()) erro(`${R}: prática sem ponte (intro)`);
      if (fim?.type === 'end') {
        if (!fim.recap?.some((r) => r.kind === 'reflection' && r.nodeId === pr.id)) erro(`${R}: a prática não entra no "Meu roteiro"`);
        if (!textoDo(fim.summary).includes(smartQuotes(s.fechamento))) erro(`${R}: fechamento difere`);
        if (/Guarde esse exemplo como ponto de partida/.test(textoDo(fim.summary))) erro(`${R}: fechamento genérico do pacote`);
      }
    }
    if (!nodes.get(g.startNodeId)) erro(`${R}: nó inicial inexistente`);

    // rotas com o motor: 3 × 3 alternativas, salvando a prática e deixando para depois
    for (const o1 of q1.options) {
      for (const o2 of q2.options) {
        for (const modo of ['salvar', 'depois'] as const) {
          try {
            let st = createInitialState(g);
            let passos = 0;
            while (st.status !== 'completed') {
              if (++passos > 30) throw new Error('mais de 30 passos');
              const node = nodes.get(st.currentNodeId)!;
              if (node.type === 'choice') st = applyIntent(g, st, { kind: 'choose', optionId: node.id === q1.id ? o1.id : o2.id }).state;
              else if (node.type === 'reflection') st = applyIntent(g, st, { kind: 'reflect', text: modo === 'salvar' ? textoPratica : '' }).state;
              else st = applyIntent(g, st, { kind: 'advance' }).state;
            }
            const resp = st.answers[pr.id]?.text;
            if (modo === 'salvar' && resp !== textoPratica) erro(`${R}: rota ${o1.id}${o2.id}/${modo} não guardou a resposta`);
            if (modo === 'depois' && resp !== '') erro(`${R}: rota ${o1.id}${o2.id}/${modo} deveria deixar a prática vazia`);
            if (st.currentNodeId !== fim?.id) erro(`${R}: rota ${o1.id}${o2.id}/${modo} terminou em "${st.currentNodeId}"`);
            for (const q of [q1.id, q2.id]) if (!st.answers[q]) erro(`${R}: rota ${o1.id}${o2.id}/${modo} não registrou a decisão ${q}`);
          } catch (e) {
            erro(`${R}: rota ${o1.id}${o2.id}/${modo}: ${(e as Error).message}`);
          }
        }
      }
    }
  });
  return { erros, avisos: compilado.warnings, resumo };
}

import { richTextToPlain } from './richtext';
import { directionNarration, spokenWords, type Camera, type SceneDirection, type Shot } from './direction';
import type { LessonGraph } from './graph';
import type { AnyNode, ChoiceNode } from './nodes';

/*
 * Ponte vídeo → pergunta ("chamada").
 *
 * Toda decisão que vem logo depois de um vídeo precisa que a instrutora CHAME o
 * aluno para responder ("Agora é com você: o que você faria?"). A frase fica na
 * própria decisão (`choice.bridge.call`) e é FALADA no fim do vídeo que a
 * antecede — o "anfitrião" da chamada:
 *  - o vídeo da própria pergunta, quando a decisão tem vídeo (ex.: o Rafael lê a
 *    situação no Comece bem);
 *  - senão, a cena narrada imediatamente anterior, quando ela leva SÓ a esta
 *    decisão (ex.: V01 → Q01 no Primeira Vaga).
 * Decisão depois de outra decisão, de "Montar frase" ou de vários caminhos não
 * tem anfitrião: a chamada fica só registrada.
 *
 * Com direção (planos), a chamada entra como um PLANO FINAL próprio, voltado
 * para a lente: o worker reaproveita os planos já pagos (mesma chave) e grava
 * só o trecho novo. Sem direção, a fala do vídeo ganha a frase no fim (o vídeo
 * inteiro é regravado).
 *
 * Trocar a chamada SUBSTITUI a anterior (nunca acumula): o plano de chamada
 * existente recebe a fala nova (planos `chamada_N` duplicados de versões
 * antigas são removidos); sem direção, a chamada anterior no fim da fala é
 * trocada pela nova.
 */

/** Id do plano da chamada (fim do vídeo). */
export const CALL_SHOT_ID = 'chamada';
/** Plano de chamada: `chamada` ou um duplicado legado `chamada_N`. */
export function isCallShotId(id: string): boolean {
  return id === CALL_SHOT_ID || /^chamada_\d+$/.test(id);
}
/** Gesto do plano da chamada (SAFE_GESTURES `tilt_head_inviting`). */
export const CALL_SHOT_GESTURE = 'tilts the head slightly, inviting';
/** Chamada usada quando o roteiro não traz uma e o enunciado não dá para montar outra. */
export const DEFAULT_CALL = 'Agora é com você: escolha a resposta que você daria.';
/** Chamada derivada: no máximo tantas palavras (≈ 8 s de fala). */
export const CALL_MAX_WORDS = 26;

/**
 * Chamada a partir do enunciado da decisão (situação + pergunta): o ÚLTIMO fato da situação e a pergunta,
 * as mesmas palavras do bloco de escolha. Assim nenhum fato da pergunta fica só no texto. Reformulações
 * genéricas em 2ª pessoa logo antes da pergunta ("Você terminou a lista.") são puladas.
 * Sem pergunta no enunciado, devolve `DEFAULT_CALL`.
 */
export function callFromSituation(situation: string, question?: string): string {
  const plain = situation.replace(/\s+/g, ' ').trim();
  const sentences = plain.split(/(?<=[.!?…]["”»)]?)\s+(?=[A-ZÀ-Ý“"(¿¡0-9])/u).filter(Boolean);
  const q = question?.trim() || [...sentences].reverse().find((x) => /\?["”»)]?$/.test(x));
  if (!q) return DEFAULT_CALL;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const facts = sentences.filter((x) => x !== q && !/\?["”»)]?$/.test(x));
  // a reformulação genérica ("Você terminou a lista.", "Chegou uma notificação durante o atendimento.") repete o fato anterior
  const candidates = facts.filter((x, i) => !(i === facts.length - 1 && facts.length > 1 && /^Você\s/.test(x)));
  const fact = [...candidates].reverse().find((x) => words(x) + words(q) <= CALL_MAX_WORDS);
  return fact ? `${fact} ${q}` : q;
}

/** Tipos com vídeo da apresentadora que podem levar a chamada no fim. */
const HOST_TYPES = new Set(['scenario', 'content', 'consequence']);

type HostNode = Extract<AnyNode, { type: 'scenario' | 'content' | 'consequence' | 'choice' }>;

/** Fala atual do nó (narração própria, senão o texto do bloco/pergunta). */
export function spokenTextOf(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

/**
 * Nó cujo vídeo deve terminar com a chamada da decisão `choiceId`
 * (ver comentário do módulo); null quando não há anfitrião.
 */
export function callHostId(graph: Pick<LessonGraph, 'nodes' | 'edges'>, choiceId: string): string | null {
  const choice = graph.nodes.find((n) => n.id === choiceId);
  if (!choice || choice.type !== 'choice') return null;
  // a pergunta tem vídeo próprio (ou fala própria): ela mesma termina chamando
  if (choice.media?.kind === 'video' || (typeof choice.narration === 'string' && choice.narration.trim())) return choice.id;
  const preds = [...new Set(graph.edges.filter((e) => e.to === choiceId).map((e) => e.from))];
  if (preds.length !== 1) return null;
  const prev = graph.nodes.find((n) => n.id === preds[0]);
  if (!prev || !HOST_TYPES.has(prev.type) || !spokenTextOf(prev)) return null;
  const outs = new Set(graph.edges.filter((e) => e.from === prev.id).map((e) => e.to));
  return outs.size === 1 ? prev.id : null;
}

/** As palavras de `text` terminam com as palavras de `tail` (sem pontuação/maiúsculas)? */
function endsWithWords(text: string, tail: string): boolean {
  const a = spokenWords(text);
  const b = spokenWords(tail);
  if (!b.length || b.length > a.length) return false;
  const off = a.length - b.length;
  return b.every((w, i) => a[off + i] === w);
}

/** A fala do anfitrião já termina com a chamada? */
export function hostSaysCall(host: AnyNode, call: string): boolean {
  return endsWithWords(spokenTextOf(host), call);
}

export interface CallStatus {
  choiceId: string;
  hostId: string | null;
  call: string | null;
  /** a fala do anfitrião já termina com a chamada */
  spoken: boolean;
  /** o vídeo pronto do anfitrião ainda é o antigo (fala mudou e não foi regravado) */
  needsRecording: boolean;
}

/** Situação da chamada de cada decisão da aula (para avisos do estúdio e scripts). */
export function callStatuses(graph: Pick<LessonGraph, 'nodes' | 'edges'>): CallStatus[] {
  const out: CallStatus[] = [];
  for (const n of graph.nodes) {
    if (n.type !== 'choice') continue;
    const hostId = callHostId(graph, n.id);
    const host = hostId ? graph.nodes.find((x) => x.id === hostId) : undefined;
    const call = n.bridge?.call?.trim() || null;
    const spoken = !!host && !!call && hostSaysCall(host, call);
    const media = host && 'media' in host ? host.media : undefined;
    out.push({ choiceId: n.id, hostId: hostId ?? null, call, spoken, needsRecording: spoken && !!media && media.stale === true });
  }
  return out;
}

/**
 * Câmera do plano da chamada: a do último plano com a apresentadora quando ela
 * olha para a lente (ângulo frontal); senão a primeira câmera frontal pronta
 * (a chamada é olho no olho); por fim, a do último plano.
 */
export function callShotCamera(shots: readonly Pick<Shot, 'cameraId' | 'layout'>[], cameras: readonly Pick<Camera, 'id' | 'angle' | 'status' | 'lookId'>[]): string | undefined {
  const lastPresenter = [...shots].reverse().find((s) => s.layout === 'presenter' || s.layout === 'presenter_chips');
  const lastId = lastPresenter?.cameraId ?? shots[shots.length - 1]?.cameraId;
  const ready = (c: Pick<Camera, 'status' | 'lookId'>) => (c.status ?? 'ready') === 'ready' && !!c.lookId;
  const last = cameras.find((c) => c.id === lastId);
  if (last && (last.angle ?? 'front') === 'front' && ready(last)) return last.id;
  return cameras.find((c) => (c.angle ?? 'front') === 'front' && ready(c))?.id ?? lastId;
}

/** Plano final com a chamada (apresentadora, estático, gesto convidativo). */
export function callShot(call: string, cameraId: string | undefined, framing: Shot['framing'] = 'medium', id = CALL_SHOT_ID): Shot {
  return {
    id,
    line: call.trim(),
    ...(cameraId ? { cameraId } : {}),
    framing,
    layout: 'presenter',
    cameraMove: 'static',
    motionPrompt: CALL_SHOT_GESTURE,
    transitionIn: 'cut',
  };
}

/**
 * Posição (em caracteres) onde começam as últimas `tail` palavras de `text`, quando `text` termina com
 * elas (comparação por palavras, como `endsWithWords`); null quando não termina.
 */
function tailStart(text: string, tail: string): number | null {
  if (!endsWithWords(text, tail)) return null;
  const n = spokenWords(tail).length;
  const starts = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m.index ?? 0);
  return starts[starts.length - n] ?? null;
}

/** Frase final da fala que soa como chamada ("Agora é com você: …", "Agora, responda: …"), quando houver. */
const CALL_SENTENCE_RE = /(?:^|[.!?…]["”»)]?\s+)((?:Agora é com você|Agora,? responda)(?=[\s:,.!?])[^]*)$/u;

/**
 * Fala sem a chamada antiga no fim: a anterior conhecida (`previous`), senão a frase final com cara de
 * chamada. Devolve a fala inteira quando não acha nenhuma.
 */
function withoutOldCall(text: string, previous?: string): string {
  const t = text.trim();
  const p = previous?.trim();
  if (p) {
    const at = tailStart(t, p);
    if (at !== null) return t.slice(0, at).trim();
  }
  const m = t.match(CALL_SENTENCE_RE);
  return m ? t.slice(0, t.length - m[1]!.length).trim() : t;
}

/**
 * Anfitrião com a chamada no fim da fala, SUBSTITUINDO a anterior. Não altera
 * o que já termina com a chamada (e não tem planos de chamada duplicados).
 * Com direção: o plano de chamada existente (`chamada`) recebe a fala nova e
 * duplicados `chamada_N` saem; sem plano de chamada, entra um plano final novo
 * (ou, no limite de 12 planos, a frase no fim do último, trocando a anterior).
 * A narração passa a ser a soma dos planos. Sem direção: a chamada anterior no
 * fim da fala (`previous`, ou a frase final "Agora é com você…/Agora,
 * responda…") é trocada pela nova. Mídia existente fica desatualizada só
 * quando algo mudou. `cameras` = kit do curso (para escolher o plano).
 */
export function withCall<T extends HostNode>(host: T, call: string, cameras: readonly Pick<Camera, 'id' | 'angle' | 'status' | 'lookId' | 'nativeFraming'>[] = [], previous?: string): T {
  const c = call.trim();
  if (!c) return host;
  const stale = () => ('media' in host && host.media ? { media: { ...host.media, stale: true } } : {});
  const direction: SceneDirection | undefined = 'direction' in host ? host.direction : undefined;
  if (direction?.shots.length) {
    const shots = direction.shots;
    const callShots = shots.filter((s) => isCallShotId(s.id));
    let next: Shot[];
    if (callShots.length) {
      // troca a fala do plano de chamada e tira os duplicados (`chamada_2`… de versões antigas)
      const keep = callShots.find((s) => s.id === CALL_SHOT_ID) ?? callShots[0]!;
      if (callShots.length === 1 && keep.line.trim() === c) return host;
      next = shots.filter((s) => !isCallShotId(s.id) || s === keep).map((s) => (s === keep ? { ...s, line: c } : s));
    } else {
      if (hostSaysCall(host, c)) return host;
      if (shots.length < 12) {
        const cam = callShotCamera(shots, cameras);
        const framing = cameras.find((k) => k.id === cam)?.nativeFraming ?? 'medium';
        next = [...shots, callShot(c, cam, framing)];
      } else {
        const last = shots[shots.length - 1]!;
        const base = withoutOldCall(last.line, previous);
        next = [...shots.slice(0, -1), { ...last, line: base ? `${base} ${c}` : c }];
      }
    }
    const d: SceneDirection = { ...direction, shots: next };
    return { ...host, narration: directionNarration(d), direction: d, ...stale() };
  }
  if (hostSaysCall(host, c)) return host;
  const before = withoutOldCall(spokenTextOf(host), previous);
  const narration = before ? `${before} ${c}` : c;
  return { ...host, narration, ...stale() };
}

/**
 * Aplica a chamada de cada decisão (`bridge.call`) ao anfitrião dela, na aula
 * inteira, substituindo a anterior. Devolve o grafo novo e os ids dos
 * anfitriões alterados. Idempotente.
 */
export function applyCallsToGraph<G extends Pick<LessonGraph, 'nodes' | 'edges'>>(
  graph: G,
  cameras: readonly Pick<Camera, 'id' | 'angle' | 'status' | 'lookId' | 'nativeFraming'>[] = [],
  /** chamada anterior de cada decisão (id → frase), quando conhecida: é ela que sai do fim da fala */
  previousCalls?: ReadonlyMap<string, string>,
): { graph: G; changed: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const changed: string[] = [];
  for (const choice of graph.nodes) {
    if (choice.type !== 'choice' || !choice.bridge?.call?.trim()) continue;
    const hostId = callHostId({ nodes: [...byId.values()], edges: graph.edges }, choice.id);
    if (!hostId) continue;
    const host = byId.get(hostId)!;
    if (!HOST_TYPES.has(host.type) && host.type !== 'choice') continue;
    const next = withCall(host as HostNode, choice.bridge.call, cameras, previousCalls?.get(choice.id));
    if (next !== host) {
      byId.set(hostId, next);
      changed.push(hostId);
    }
  }
  return { graph: { ...graph, nodes: graph.nodes.map((n) => byId.get(n.id) ?? n) }, changed };
}

/** Decisão tem a chamada definida? (usado nos avisos) */
export function choiceCall(n: ChoiceNode): string | null {
  return n.bridge?.call?.trim() || null;
}

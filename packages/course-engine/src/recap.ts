import type { AnyNode, EndNode, LessonGraph, MissionStatus, RecapItem } from '@lms/course-schema';
import type { AnswerRecord, AttemptState } from './state';

/**
 * Resposta do aluno em qualquer aula do curso (a mais recente por nó, entre
 * todas as tentativas da matrícula). É o formato de
 * `GET /api/enrollments/[enrollmentId]/answers` → `answers[nodeId]`.
 */
export interface CourseAnswer {
  lessonId: string;
  kind: 'choice' | 'reflection' | 'assessment';
  optionIds?: string[];
  text?: string;
  /** só avaliações */
  passed?: boolean;
  answeredAt: string;
}

/** Resposta em qualquer dos dois formatos (tentativa atual ou curso). */
export type AnswerLike = Pick<AnswerRecord, 'optionIds' | 'text' | 'passed' | 'answeredAt' | 'missionStatus'>;

/**
 * Registro de uma missão "Leve para a vida real" (tabela `mission_responses`): vale mais que a resposta da tentativa, porque
 * o aluno pode voltar depois da aula e marcar "Já experimentei" ou editar o que percebeu.
 */
export interface MissionRecord {
  lessonId: string;
  status: MissionStatus;
  note: string | null;
  /** versão do registro (concorrência otimista ao editar) */
  revision: number;
  updatedAt: string;
}

/**
 * Junta as respostas do curso com as da tentativa atual. A tentativa atual
 * SEMPRE vence (é o que o aluno acabou de responder nesta aula); o curso só
 * completa os nós que ela não conhece (outras aulas).
 */
export function mergeAnswers(
  stateAnswers: Record<string, AnswerLike> | undefined,
  courseAnswers: Record<string, CourseAnswer | AnswerLike> | undefined,
): Record<string, AnswerLike> {
  const out: Record<string, AnswerLike> = {};
  for (const [id, a] of Object.entries(courseAnswers ?? {})) out[id] = { optionIds: a.optionIds, text: a.text, passed: a.passed, answeredAt: a.answeredAt, ...('missionStatus' in a && a.missionStatus ? { missionStatus: a.missionStatus } : {}) };
  for (const [id, a] of Object.entries(stateAnswers ?? {})) out[id] = a;
  return out;
}

/**
 * O mínimo de um nó que o recap precisa: título (origem) e opções (para traduzir
 * o id escolhido em rótulo). Um `AnyNode` serve, e também o resumo
 * `nodes[nodeId]` devolvido por `GET /api/enrollments/[enrollmentId]/answers`.
 */
export interface RecapSourceNode {
  type: string;
  title?: string;
  options?: ReadonlyArray<{ id: string; label: string }>;
  /** missão: o que fazer e a alternativa (o roteiro mostra a ação ao lado do estado) */
  mission?: { intro?: string; action?: string; alternative?: string };
}

/**
 * Item da página "Meu roteiro" já resolvido contra o estado da tentativa.
 * `value` é SEMPRE o que o aluno produziu (ou o conteúdo fixo do item);
 * nunca um exemplo. `null` = fonte vazia → o player mostra `emptyText`.
 */
export interface ResolvedRecapItem {
  id: string;
  label: string;
  kind: RecapItem['kind'];
  value: string | string[] | null;
  emptyText: string;
  /** cena de origem (reflexão/decisão), quando identificada */
  source?: { nodeId: string; title: string };
  /** só `kind: 'mission'`: o estado da missão (`none` = ainda não chegou ou não respondeu) e o que fazer */
  mission?: {
    nodeId: string;
    title: string;
    status: 'none' | MissionStatus;
    note: string | null;
    action?: string;
    alternative?: string;
    /** versão do registro salvo; ausente = ainda não há registro no banco */
    revision?: number;
  };
}

export interface ResolveRecapOptions {
  /**
   * Consulta de nós fora do grafo desta aula (outras aulas do mesmo curso).
   * Permite nomear a cena de origem e traduzir o id da opção escolhida para o
   * rótulo. Sem isso, uma decisão de outra aula resolve para `null`.
   */
  lookupNode?: (nodeId: string) => RecapSourceNode | undefined;
  /**
   * Respostas do curso inteiro (outras aulas). Mescladas com `state.answers`
   * via `mergeAnswers` — a tentativa atual vence.
   */
  answers?: Record<string, CourseAnswer | AnswerLike>;
  /** registros de missão do curso (por cena): valem mais que a resposta da tentativa */
  missions?: Record<string, MissionRecord>;
}

function sourceOf(node: RecapSourceNode | undefined, nodeId: string): ResolvedRecapItem['source'] {
  if (!node) return undefined;
  return { nodeId, title: node.title?.trim() || nodeId };
}

/**
 * Resolve os itens de recap de um encerramento a partir das respostas do aluno.
 *
 * Regras por tipo:
 * - reflection → texto da resposta (trim) ou `null`;
 * - choice     → rótulo da opção escolhida (`answers[nodeId].optionIds[0]`) ou `null`;
 * - com `nodeIds` (variantes da mesma atividade), vale a resposta mais recente;
 * - com `composedNodeIds` (frase montada numa composição guiada), a frase vence
 *   a escolha; composição pulada (texto vazio) → cai na escolha;
 * - checklist  → `items` (lista fixa) — `null` se vazia;
 * - text       → `text` fixo — `null` se vazio.
 *
 * Fontes de outra aula: as respostas vivem na tentativa (por aula), então
 * `state.answers` só conhece as cenas deste grafo. Passe `opts.answers` (as
 * respostas do curso, ex.: `GET /api/enrollments/[id]/answers`) para resolver
 * reflexões e decisões de outras aulas; a tentativa atual vence em conflito.
 * Uma decisão só é traduzida para rótulo se a cena for encontrada (no grafo ou
 * via `lookupNode`). Caso contrário, `null` — e o player exibe `emptyText`,
 * nunca um exemplo inventado.
 */
export function resolveRecap(graph: LessonGraph, endNode: EndNode, state: AttemptState, opts: ResolveRecapOptions = {}): ResolvedRecapItem[] {
  const items = endNode.recap ?? [];
  if (items.length === 0) return [];
  const local = new Map<string, AnyNode>(graph.nodes.map((n) => [n.id, n]));
  const find = (id: string): RecapSourceNode | undefined => {
    const n = local.get(id);
    if (n?.type === 'mission') return { type: 'mission', title: n.title, mission: { intro: n.intro, action: n.action, alternative: n.alternative } };
    return n ?? opts.lookupNode?.(id);
  };
  const answers = opts.answers ? mergeAnswers(state.answers, opts.answers) : state.answers;

  /**
   * Fonte do item: `nodeId` e as alternativas `nodeIds` (variantes da mesma
   * atividade, ex.: uma por perfil). Vale a resposta mais recente; sem resposta,
   * a principal (`nodeId`) nomeia a origem.
   */
  const pickSource = (item: RecapItem, has: (a: AnswerLike | undefined) => boolean): string | undefined => {
    const ids = [item.nodeId, ...(item.nodeIds ?? [])].filter((x): x is string => !!x);
    let best: string | undefined;
    for (const id of ids) {
      const a = answers[id];
      if (!has(a)) continue;
      if (!best || (a!.answeredAt ?? '') > (answers[best]!.answeredAt ?? '')) best = id;
    }
    return best ?? ids[0];
  };

  /** Frase montada mais recente (não vazia) entre as cenas de composição do item. */
  const composed = (item: RecapItem): { nodeId: string; text: string } | undefined => {
    let best: { nodeId: string; text: string; at: string } | undefined;
    for (const id of item.composedNodeIds ?? []) {
      const a = answers[id];
      const text = a?.text?.trim();
      if (!text) continue;
      if (!best || (a!.answeredAt ?? '') > best.at) best = { nodeId: id, text, at: a!.answeredAt ?? '' };
    }
    return best;
  };

  return items.map((item): ResolvedRecapItem => {
    const base = { id: item.id, label: item.label, kind: item.kind, emptyText: item.emptyText };
    if (item.kind === 'reflection' || item.kind === 'choice') {
      const c = composed(item);
      if (c) return { ...base, value: c.text, source: sourceOf(find(c.nodeId), c.nodeId) };
    }
    switch (item.kind) {
      case 'reflection': {
        const nodeId = pickSource(item, (a) => !!a?.text?.trim());
        if (!nodeId) return { ...base, value: null };
        const node = find(nodeId);
        const text = answers[nodeId]?.text?.trim();
        return { ...base, value: text ? text : null, source: sourceOf(node, nodeId) };
      }
      case 'choice': {
        const nodeId = pickSource(item, (a) => !!a?.optionIds?.length);
        if (!nodeId) return { ...base, value: null };
        const node = find(nodeId);
        const optionId = answers[nodeId]?.optionIds?.[0];
        const label = node?.type === 'choice' && optionId ? node.options?.find((o) => o.id === optionId)?.label?.trim() : undefined;
        return { ...base, value: label ? label : null, source: sourceOf(node, nodeId) };
      }
      case 'mission': {
        const nodeId = item.nodeId;
        if (!nodeId) return { ...base, value: null };
        const node = find(nodeId);
        const rec = opts.missions?.[nodeId];
        const ans = answers[nodeId];
        const status: 'none' | MissionStatus = rec?.status ?? ans?.missionStatus ?? 'none';
        const note = (rec ? rec.note : ans?.text)?.trim() || null;
        const title = node?.title?.trim() || nodeId;
        return {
          ...base,
          value: status === 'done' ? note : null,
          source: sourceOf(node, nodeId),
          mission: { nodeId, title, status, note: status === 'done' ? note : null, ...(node?.mission?.action ? { action: node.mission.action } : {}), ...(node?.mission?.alternative ? { alternative: node.mission.alternative } : {}), ...(rec ? { revision: rec.revision } : {}) },
        };
      }
      case 'checklist': {
        const list = (item.items ?? []).map((s) => s.trim()).filter(Boolean);
        return { ...base, value: list.length ? list : null };
      }
      case 'text': {
        const text = item.text?.trim();
        return { ...base, value: text ? text : null };
      }
    }
  });
}

/**
 * Versão em texto simples do roteiro (área de transferência / exportação).
 * Itens vazios saem com `emptyText`; checklist vira "[ ] item".
 */
export function recapToPlainText(title: string, items: ResolvedRecapItem[], closingLine?: string): string {
  const lines: string[] = [title, ''];
  for (const it of items) {
    lines.push(it.label);
    if (it.mission) {
      if (it.mission.action) lines.push(`  ${it.mission.action}`);
      lines.push(`  ${it.mission.status === 'done' ? 'Já experimentei' : it.mission.status === 'later' ? 'Vou fazer depois' : 'Ainda não registrei'}`);
      if (it.mission.note) lines.push(`  O que percebi: ${it.mission.note}`);
    } else if (it.value === null) lines.push(`  ${it.emptyText}`);
    else if (Array.isArray(it.value)) for (const v of it.value) lines.push(`  [ ] ${v}`);
    else lines.push(`  ${it.value}`);
    lines.push('');
  }
  if (closingLine?.trim()) lines.push(closingLine.trim());
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

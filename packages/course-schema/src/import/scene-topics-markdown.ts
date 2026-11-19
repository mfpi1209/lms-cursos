/**
 * Lê o arquivo de TÓPICOS DO PAINEL de um roteiro (`docs/roteiros/telas/<roteiro>.topicos.md`): os tópicos que
 * aparecem, um a um, no painel do lado vazio da cena dirigida de estúdio, conforme a apresentadora fala.
 *
 * ```
 * # Tópicos do painel — C1
 * ## V07
 * - Fatos recentes (na fala: "fatos muito recentes")
 * - Contas longas (na fala: "contas mais longas")
 * - Fontes
 * ```
 *
 * - seção `## V07` = código da cena do roteiro (sem acento/caixa: `## v07`, `## Cena V07`); no documento o nó tem o
 *   id em minúsculas (`v07`);
 * - cada `- tópico` é um tópico (também `*`); ≤ 60 caracteres (`SCENE_TOPIC_MAX_CHARS`), no máximo 8 por cena
 *   (`SCENE_TOPICS_MAX`); `**negrito**` é removido;
 * - sufixo ` (na fala: "trecho")` (sem acento/caixa, aspas retas ou curvas) diz em que trecho da fala o tópico
 *   entra; sem ele vale o próprio texto do tópico (correspondência tolerante com a fala);
 * - texto livre antes da primeira seção e linhas `#`/`---`/comentários `<!-- -->` são ignorados.
 *
 * Nunca lança: problemas viram `issues` com o número da linha; o tópico com problema fica de fora.
 */

export const SCENE_TOPIC_MAX_CHARS = 60;
export const SCENE_TOPICS_MAX = 8;

export interface SceneTopic {
  text: string;
  cue?: string;
}

export interface SceneTopicsIssue {
  code: 'SCENE_TOPICS_SYNTAX' | 'SCENE_TOPICS_TOO_LONG' | 'SCENE_TOPICS_TOO_MANY' | 'SCENE_TOPICS_DUPLICATE' | 'SCENE_TOPICS_EMPTY';
  message: string;
  /** código da cena (maiúsculas) */
  scene?: string;
  line: number;
}

export interface ParsedSceneTopics {
  /** código da cena (maiúsculas, ex.: `V07`) → tópicos, na ordem do arquivo */
  topics: Map<string, SceneTopic[]>;
  issues: SceneTopicsIssue[];
}

const CUE_RE = /\s*\(\s*na\s+fala\s*:\s*["“”'‘’]([^"“”]+?)["“”'‘’]\s*\)\s*$/i;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const CODE_RE = /^(?:cena\s+)?([A-Za-z]{1,3}\d{1,3})\b/i;
const ITEM_RE = /^[-*]\s+(.*)$/;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function parseSceneTopicsMarkdown(md: string): ParsedSceneTopics {
  const topics = new Map<string, SceneTopic[]>();
  const issues: SceneTopicsIssue[] = [];
  const seen = new Map<string, number>();
  let cur: { code: string; line: number; items: SceneTopic[]; skip: boolean; overflow: boolean } | undefined;
  const flush = () => {
    if (!cur) return;
    if (!cur.skip) {
      if (!cur.items.length) issues.push({ code: 'SCENE_TOPICS_EMPTY', message: `seção ${cur.code} sem nenhum tópico ("- Fatos recentes")`, scene: cur.code, line: cur.line });
      else topics.set(cur.code, cur.items);
    }
    cur = undefined;
  };
  md.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    const sec = line.startsWith('###') ? null : SECTION_RE.exec(line);
    if (sec) {
      flush();
      const m = CODE_RE.exec(fold(sec[1]!));
      if (!m) {
        issues.push({ code: 'SCENE_TOPICS_SYNTAX', message: `seção "${sec[1]!.slice(0, 40)}" sem código de cena (use "## V07")`, line: n });
        cur = { code: '', line: n, items: [], skip: true, overflow: false };
        return;
      }
      const code = m[1]!.toUpperCase();
      const dup = seen.get(code);
      if (dup !== undefined) issues.push({ code: 'SCENE_TOPICS_DUPLICATE', message: `seção ${code} repetida (a primeira está na linha ${dup}); a repetição foi ignorada`, scene: code, line: n });
      else seen.set(code, n);
      cur = { code, line: n, items: [], skip: dup !== undefined, overflow: false };
      return;
    }
    if (!cur || !line || line.startsWith('#') || /^[-*_]{3,}$/.test(line) || line.startsWith('<!--')) return;
    if (cur.skip) return;
    const item = ITEM_RE.exec(line);
    if (!item) {
      issues.push({ code: 'SCENE_TOPICS_SYNTAX', message: `linha não reconhecida em ${cur.code}: "${line.slice(0, 60)}" (use "- tópico")`, scene: cur.code, line: n });
      return;
    }
    let value = item[1]!.trim();
    let cue: string | undefined;
    const c = CUE_RE.exec(value);
    if (c) {
      cue = c[1]!.replace(/\s+/g, ' ').trim();
      value = value.slice(0, c.index).trim();
    }
    const text = value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!text) {
      issues.push({ code: 'SCENE_TOPICS_SYNTAX', message: `tópico vazio em ${cur.code}`, scene: cur.code, line: n });
      return;
    }
    if (text.length > SCENE_TOPIC_MAX_CHARS) {
      issues.push({ code: 'SCENE_TOPICS_TOO_LONG', message: `tópico de ${cur.code} com ${text.length} caracteres (máximo ${SCENE_TOPIC_MAX_CHARS}): "${text.slice(0, 40)}…"; ignorado`, scene: cur.code, line: n });
      return;
    }
    if (cur.items.length >= SCENE_TOPICS_MAX) {
      if (!cur.overflow) issues.push({ code: 'SCENE_TOPICS_TOO_MANY', message: `${cur.code} tem mais de ${SCENE_TOPICS_MAX} tópicos; os de sobra foram ignorados`, scene: cur.code, line: n });
      cur.overflow = true;
      return;
    }
    cur.items.push({ text, ...(cue ? { cue } : {}) });
  });
  flush();
  return { topics, issues };
}

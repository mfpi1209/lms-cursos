import { spokenWords, type ExperienceFamily } from '@lms/course-schema';
import type { LessonScene, LessonScript } from './schemas';
import { splitSentences } from './sentences';

/*
 * Regras de extensão e de formato de uma aula (curta, prática, orientadora).
 * Os limites valem para o modelo (prompt) e para o validador, que devolve os
 * estouros ao modelo como erros de reparo, com os números exatos.
 */

/** Famílias com mais turnos (diálogo, simulação): podem ter até 9 cenas. */
export const EXTENDED_SCENE_FAMILIES: ReadonlyArray<ExperienceFamily> = ['dialogue', 'resource_simulation'];

export const LESSON_CAPS = {
  /** cenas sem contar o encerramento (end) */
  maxScenes: 7,
  /** cenas para as famílias de EXTENDED_SCENE_FAMILIES */
  maxScenesExtended: 9,
  /** palavras do texto da tela por cena (scenario, choice, reflection, assessment, end) */
  maxScreenWords: 45,
  /** palavras do texto da tela de uma cena content (inclui a "Dica" com os tópicos) */
  maxContentWords: 60,
  /** palavras faladas (narration) por cena: fala contínua e conversada (60–120 onde a cena permite) */
  maxNarrationWords: 120,
  /** alvo mínimo de fala numa cena de situação/explicação/decisão (orientação do prompt, não é erro) */
  minNarrationWords: 60,
  /** opções de uma decisão (choice): exatamente */
  choiceOptions: 3,
  /** palavras por rótulo de opção */
  maxOptionWords: 12,
  /** palavras do texto de uma consequence */
  maxConsequenceWords: 40,
  /** palavras faladas em uma consequence */
  maxConsequenceNarrationWords: 90,
  /** alvo mínimo de fala numa consequência (orientação do prompt) */
  minConsequenceNarrationWords: 40,
  /** reflexões por aula */
  maxReflections: 1,
  /** palavras do enunciado de uma reflexão */
  maxReflectionWords: 30,
  /** verificações (perguntas) por aula, quando permitidas */
  maxAssessments: 3,
  /** palavras do enunciado de uma verificação */
  maxAssessmentWords: 20,
  /** opções de uma verificação: exatamente */
  assessmentOptions: 3,
  /** tópicos da cena "Dica" e palavras por tópico (orientação do prompt) */
  dicaBullets: 3,
  maxDicaBulletWords: 10,
  /** minutos por aula (orientação do roteiro de curso) */
  minutesPerLesson: 3,
  /** palavras de tela numa cena de situação/conteúdo com fala (vídeo): acima disso, a tela compete com a fala (aviso) */
  maxScreenWordsWithNarration: 25,
  /** alvo de palavras-chave na tela de uma cena com fala (orientação do prompt) */
  keywordScreenWords: 12,
  /** reflexões OBRIGATÓRIAS (minLength > 0) por aula, para público iniciante, antes do aviso OPEN_ANSWER_HEAVY */
  maxMandatoryWritingBeginner: 1,
  /** palavras da linha de abertura "O que você vai treinar: …" (primeira linha da primeira cena) */
  maxOpenerWords: 14,
  /** tópicos de "O que você levou" no encerramento (2 a 3) e palavras por tópico */
  takeawaysMin: 2,
  takeawaysMax: 3,
  maxTakeawayWords: 12,
  /** palavras do texto da tela do encerramento (recapitulação + ação + tópicos de "O que você levou") */
  maxEndWords: 70,
} as const;

/** Linha de abertura de toda aula (primeira linha do texto da primeira cena), em palavras do aluno. */
export const TRAINING_OPENER = 'O que você vai treinar';
/** Título do bloco de fechamento no encerramento, seguido de 2 a 3 tópicos ("- …") derivados das decisões. */
export const TAKEAWAYS_TITLE = 'O que você levou';

const foldText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** true quando o texto começa pela linha "O que você vai treinar: …" (sem acento, sem caixa). */
export function hasTrainingOpener(text: string): boolean {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return foldText(first).startsWith(foldText(TRAINING_OPENER));
}

/**
 * Tópicos que seguem a linha "O que você levou" no texto do encerramento: as
 * linhas seguintes, com ou sem marcador ("- "), porque o texto rico do grafo
 * devolve listas como linhas simples ao voltar para roteiro.
 */
export function takeawayBullets(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => foldText(l).startsWith(foldText(TAKEAWAYS_TITLE)));
  if (start === -1) return [];
  const title = lines[start]!;
  const inline = title.slice(title.indexOf(':') + 1).trim();
  const out: string[] = [];
  if (title.includes(':') && inline) out.push(inline.replace(/^[-•*]\s+/, ''));
  for (const l of lines.slice(start + 1)) if (l) out.push(l.replace(/^[-•*]\s+/, ''));
  return out;
}

/**
 * Público iniciante: primeiro emprego/estágio, jovem aprendiz ou menção a
 * timidez/introversão no briefing. Aceita o briefing (objeto) ou um texto.
 */
const BEGINNER_RE = /(?<!\p{L})(primeiro emprego|primeira vaga|primeiro trabalho|primeira oportunidade|primeiro estagio|estagio|estagiari\w*|jovem aprendiz|aprendiz|iniciante\w*|timid\w*|timidez|introvert\w*|introversao)(?!\p{L})/u;
export function isBeginnerAudience(brief: Record<string, unknown> | string | null | undefined): boolean {
  if (!brief) return false;
  const text = typeof brief === 'string' ? brief : Object.values(brief).filter((v) => typeof v === 'string').join(' ');
  return BEGINNER_RE.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
}

/** Títulos que identificam a cena de orientação prática (content). */
export const DICA_TITLE_PREFIXES = ['dica', 'na prática'] as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** true quando o título é de uma cena "Dica" / "Na prática" (sem acento, sem caixa). */
export function isDicaTitle(title: string): boolean {
  const t = fold(title);
  return DICA_TITLE_PREFIXES.some((p) => t.startsWith(fold(p)));
}

export function isDicaScene(scene: Pick<LessonScene, 'type' | 'title'>): boolean {
  return scene.type === 'content' && isDicaTitle(scene.title);
}

export const wordCount = (s: string | null | undefined) => (s ? spokenWords(s).length : 0);

export function maxScenesFor(family: string | undefined): number {
  return family && (EXTENDED_SCENE_FAMILIES as readonly string[]).includes(family) ? LESSON_CAPS.maxScenesExtended : LESSON_CAPS.maxScenes;
}

export interface LessonRulesOptions {
  family?: string;
  /** verificação (assessment) permitida nesta aula (última aula do curso ou pedido explícito) */
  allowAssessment?: boolean;
  /** nomes do elenco do curso (doc.cast): frases com "<Nome> <verbo>" contam como narração em terceira pessoa */
  castNames?: readonly string[];
  /** inclui as regras de voz de ensino (THIRD_PERSON_NARRATION, NOT_TEACHING); padrão true */
  voice?: boolean;
  /** público iniciante (primeiro emprego/estágio, timidez/introversão): ver `isBeginnerAudience` */
  beginnerAudience?: boolean;
  /**
   * Abertura "O que você vai treinar" e fechamento "O que você levou":
   * `enforce` (geração) devolve a falta como erro de reparo; `warn` (revisão de
   * aulas antigas) só avisa; ausente = não verifica.
   */
  didactic?: 'enforce' | 'warn';
}

export interface LessonRuleIssue {
  code: string;
  message: string;
  sceneId?: string;
  /**
   * `warning`: aviso editorial reparável — não bloqueia nem força reparo sozinho,
   * mas vai junto quando a proposta volta para reparo. Ausente = erro (com `enforce`).
   */
  severity?: 'warning';
}

/**
 * Verifica os limites de extensão e de formato do roteiro. Cada estouro vira um
 * erro com os números exatos, em pt-BR, para o laço de reparo do modelo.
 */
export function validateLessonRules(script: LessonScript, opts: LessonRulesOptions = {}): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];
  const push = (code: string, message: string, sceneId?: string) => issues.push({ code, message, sceneId });
  const scenes = script.scenes;
  const visible = scenes.filter((s) => s.type !== 'end');
  const cap = maxScenesFor(opts.family);
  if (visible.length > cap) push('TOO_MANY_SCENES', `a aula tem ${visible.length} cenas sem contar o encerramento (máximo ${cap}${cap === LESSON_CAPS.maxScenesExtended ? ' para esta família' : ''}); funda ou remova cenas de conteúdo, consequência ou reflexão redundantes`);

  for (const s of scenes) {
    const where = `cena "${s.title || s.id}" (${s.id})`;
    const screen = wordCount(s.text);
    const narration = wordCount(s.narration);
    if (s.type === 'content') {
      if (screen > LESSON_CAPS.maxContentWords) push('SCREEN_TOO_LONG', `${where}: texto da tela com ${screen} palavras (máximo ${LESSON_CAPS.maxContentWords} em cenas de conteúdo)`, s.id);
    } else if (s.type === 'consequence') {
      if (screen > LESSON_CAPS.maxConsequenceWords) push('CONSEQUENCE_TOO_LONG', `${where}: consequência com ${screen} palavras na tela (máximo ${LESSON_CAPS.maxConsequenceWords}); diga o que aconteceu e por quê em uma linha`, s.id);
      if (narration > LESSON_CAPS.maxConsequenceNarrationWords) push('NARRATION_TOO_LONG', `${where}: fala com ${narration} palavras (máximo ${LESSON_CAPS.maxConsequenceNarrationWords} em consequências)`, s.id);
    } else if (s.type === 'end') {
      if (screen > LESSON_CAPS.maxEndWords) push('SCREEN_TOO_LONG', `${where}: encerramento com ${screen} palavras (máximo ${LESSON_CAPS.maxEndWords}: recapitulação, uma ação e os tópicos de "${TAKEAWAYS_TITLE}")`, s.id);
    } else if (screen > LESSON_CAPS.maxScreenWords) {
      push('SCREEN_TOO_LONG', `${where}: texto da tela com ${screen} palavras (máximo ${LESSON_CAPS.maxScreenWords})`, s.id);
    }
    if (s.type !== 'consequence' && narration > LESSON_CAPS.maxNarrationWords) push('NARRATION_TOO_LONG', `${where}: fala com ${narration} palavras (máximo ${LESSON_CAPS.maxNarrationWords})`, s.id);

    if (s.type === 'choice') {
      const n = s.options?.length ?? 0;
      if (n !== LESSON_CAPS.choiceOptions) push('CHOICE_OPTIONS', `${where}: decisão com ${n} ${n === 1 ? 'opção' : 'opções'} (use exatamente ${LESSON_CAPS.choiceOptions}, plausíveis, com uma consequência cada)`, s.id);
      for (const o of s.options ?? []) {
        const w = wordCount(o.label);
        if (w > LESSON_CAPS.maxOptionWords) push('OPTION_TOO_LONG', `${where}, opção "${o.id}": rótulo com ${w} palavras (máximo ${LESSON_CAPS.maxOptionWords})`, s.id);
      }
    }
    if (s.type === 'reflection' && screen > LESSON_CAPS.maxReflectionWords) push('REFLECTION_TOO_LONG', `${where}: enunciado da reflexão com ${screen} palavras (máximo ${LESSON_CAPS.maxReflectionWords})`, s.id);
    if (s.type === 'assessment') {
      if (screen > LESSON_CAPS.maxAssessmentWords) push('ASSESSMENT_TOO_LONG', `${where}: enunciado da verificação com ${screen} palavras (máximo ${LESSON_CAPS.maxAssessmentWords})`, s.id);
      const n = s.options?.length ?? 0;
      if (n !== LESSON_CAPS.assessmentOptions) push('ASSESSMENT_OPTIONS', `${where}: verificação com ${n} ${n === 1 ? 'opção' : 'opções'} (use exatamente ${LESSON_CAPS.assessmentOptions})`, s.id);
    }
  }

  const reflections = scenes.filter((s) => s.type === 'reflection');
  if (reflections.length > LESSON_CAPS.maxReflections) push('TOO_MANY_REFLECTIONS', `a aula tem ${reflections.length} reflexões (máximo ${LESSON_CAPS.maxReflections}); mantenha só a que o objetivo pede`);

  // Avisos reparáveis (não bloqueiam): tela competindo com a fala; escrita obrigatória demais para iniciantes.
  const warn = (code: string, message: string, sceneId?: string) => issues.push({ code, message, sceneId, severity: 'warning' });
  // vale para as cenas de vídeo que explicam (situação e conteúdo); decisões mostram as opções e consequências são o retorno lido
  for (const s of scenes) {
    if ((s.type !== 'scenario' && s.type !== 'content') || !s.narration.trim()) continue;
    // a linha "O que você vai treinar" é um rótulo curto: não compete com a fala
    const screen = wordCount(hasTrainingOpener(s.text) ? s.text.split('\n').slice(1).join('\n') : s.text);
    if (screen > LESSON_CAPS.maxScreenWordsWithNarration)
      warn('TOO_MUCH_SCREEN_TEXT_WITH_NARRATION', `cena "${s.title || s.id}" (${s.id}): ${screen} palavras na tela numa cena com fala (máximo ${LESSON_CAPS.maxScreenWordsWithNarration}); deixe na tela só palavras-chave (até ${LESSON_CAPS.keywordScreenWords}, ex.: "Vaga · Empresa · Encontro") e a fala carrega o conteúdo`, s.id);
  }
  if (opts.beginnerAudience) {
    // só escrita OBRIGATÓRIA conta (reflexão com minLength > 0); treino de voz opcional nas decisões não conta
    const mandatory = reflections.filter((s) => (s.reflection?.minLength ?? 0) > 0);
    if (mandatory.length > LESSON_CAPS.maxMandatoryWritingBeginner)
      warn('OPEN_ANSWER_HEAVY', `a aula tem ${mandatory.length} reflexões obrigatórias (minLength > 0) para um público iniciante (primeiro emprego/estágio, pessoas tímidas): troque por decisões com exemplos prontos para escolher; no máximo uma anotação opcional (minLength 0) no curso`);
  }

  const assessments = scenes.filter((s) => s.type === 'assessment');
  if (assessments.length && !opts.allowAssessment) push('ASSESSMENT_NOT_ALLOWED', `a aula tem ${assessments.length} ${assessments.length === 1 ? 'verificação' : 'verificações'}, mas verificação só entra na última aula do curso; remova e termine na dica`);
  else if (assessments.length > LESSON_CAPS.maxAssessments) push('TOO_MANY_ASSESSMENTS', `a aula tem ${assessments.length} verificações (máximo ${LESSON_CAPS.maxAssessments})`);

  if (!scenes.some(isDicaScene)) push('MISSING_DICA', `falta a cena "Dica": uma cena content com título começando por "Dica" ou "Na prática", com ${LESSON_CAPS.dicaBullets} tópicos de até ${LESSON_CAPS.maxDicaBulletWords} palavras, em imperativo, antes do encerramento`);

  // Didática: abertura "O que você vai treinar" na primeira cena e "O que você levou" (2–3 tópicos) no encerramento.
  if (opts.didactic) issues.push(...validateDidactic(script).map((i) => (opts.didactic === 'warn' ? { ...i, severity: 'warning' as const } : i)));

  if (opts.voice !== false) issues.push(...validateTeachingVoice(script, { castNames: opts.castNames }));

  return issues;
}

/**
 * Abertura e fechamento didáticos (em palavras do aluno):
 * - MISSING_TRAINING_OPENER: a primeira cena não começa por "O que você vai treinar: …" (uma linha, até 14 palavras).
 * - MISSING_TAKEAWAYS: o encerramento não traz "O que você levou" com 2 a 3 tópicos ("- …") de até 12 palavras.
 */
export function validateDidactic(script: LessonScript): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];
  const first = script.scenes[0];
  if (first) {
    const where = `cena "${first.title || first.id}" (${first.id})`;
    if (!hasTrainingOpener(first.text)) {
      issues.push({ code: 'MISSING_TRAINING_OPENER', sceneId: first.id, message: `${where}: a primeira linha do texto da tela deve ser "${TRAINING_OPENER}: …" (uma linha, até ${LESSON_CAPS.maxOpenerWords} palavras, em palavras do aluno, derivada do objetivo da aula), seguida da situação` });
    } else {
      const opener = first.text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
      const w = wordCount(opener);
      if (w > LESSON_CAPS.maxOpenerWords) issues.push({ code: 'OPENER_TOO_LONG', sceneId: first.id, message: `${where}: a linha "${TRAINING_OPENER}" tem ${w} palavras (máximo ${LESSON_CAPS.maxOpenerWords})` });
    }
  }
  const ends = script.scenes.filter((s) => s.type === 'end');
  for (const end of ends) {
    const where = `cena "${end.title || end.id}" (${end.id})`;
    const bullets = takeawayBullets(end.text);
    if (bullets.length < LESSON_CAPS.takeawaysMin || bullets.length > LESSON_CAPS.takeawaysMax) {
      issues.push({ code: 'MISSING_TAKEAWAYS', sceneId: end.id, message: `${where}: o encerramento deve terminar com a linha "${TAKEAWAYS_TITLE}:" seguida de ${LESSON_CAPS.takeawaysMin} a ${LESSON_CAPS.takeawaysMax} tópicos ("- …", até ${LESSON_CAPS.maxTakeawayWords} palavras cada) derivados das decisões da aula${bullets.length ? ` (há ${bullets.length})` : ''}` });
    } else {
      for (const b of bullets) {
        const w = wordCount(b);
        if (w > LESSON_CAPS.maxTakeawayWords) issues.push({ code: 'TAKEAWAY_TOO_LONG', sceneId: end.id, message: `${where}: tópico de "${TAKEAWAYS_TITLE}" com ${w} palavras (máximo ${LESSON_CAPS.maxTakeawayWords}): "${b.slice(0, 80)}"` });
      }
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Voz de ensino: mentor falando com "você", cenas que ensinam         */
/* ------------------------------------------------------------------ */

/** Verbos no imperativo (2ª pessoa de cortesia) que marcam fala dirigida ao aluno. */
export const IMPERATIVE_VERBS: readonly string[] = [
  'diga', 'mostre', 'leve', 'pergunte', 'anote', 'prepare', 'teste', 'evite', 'use', 'faça', 'fale', 'peça', 'confirme', 'avise', 'proponha', 'escreva', 'responda', 'combine', 'explique', 'ofereça',
  'pense', 'olhe', 'lembre', 'repare', 'prefira', 'comece', 'termine', 'envie', 'mande', 'traga', 'conte', 'treine', 'ensaie', 'revise', 'escolha', 'mantenha', 'ouça', 'escute', 'agradeça', 'pratique',
  'observe', 'registre', 'alinhe', 'levante', 'liste', 'separe', 'tente', 'guarde', 'defina', 'resuma', 'experimente', 'descreva', 'apresente', 'negocie', 'corrija', 'assuma', 'ajuste', 'reserve', 'imagine', 'veja', 'nomeie', 'cite', 'chegue',
];

/** Papéis genéricos que, como sujeito da frase, indicam narração do elenco. */
const CAST_ROLES = ['gestor', 'gestora', 'recrutador', 'recrutadora', 'entrevistador', 'entrevistadora', 'chefe', 'cliente', 'colega', 'supervisor', 'supervisora', 'diretor', 'diretora', 'gerente', 'lider', 'coordenador', 'coordenadora', 'candidato', 'candidata', 'atendente', 'professor', 'professora', 'rh'];

/** Conectores que podem anteceder o sujeito ("E então ela…", "Depois, o gestor…"). */
const LEAD_IN = '(?:(?:e|mas|então|entao|depois|aí|ai|já|ja|logo|enquanto|quando|no fim|na hora|em seguida|aí então),?\\s+)*';

const fold2 = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Palavra com cara de verbo conjugado em pt-BR (3ª pessoa): "anota", "responde", "sorriu", "perguntou", "franze", "abriram". */
const VERB_LIKE_RE = /^\p{L}{2,}(a|e|ou|iu|eu|am|em|ram|ava|iam|ia|ara|era|ira)$/u;

const SECOND_PERSON_RE = /(?<!\p{L})(voce|voces|sua|seu|suas|seus|te|contigo|tua|teu)(?!\p{L})/u;

function normalizeSentence(sentence: string): string {
  // tira aspas, travessões, marcadores de lista e espaços iniciais; sem acentos e em minúsculas
  return fold2(sentence).replace(/^[\s"'“”‘’«»(\[\-–—•*]+/, '').trim();
}

/** Frase dirigida ao aluno: traz "você"/"sua"/"seu" ou começa por verbo no imperativo. */
export function isSecondPersonSentence(sentence: string): boolean {
  const n = normalizeSentence(sentence);
  if (SECOND_PERSON_RE.test(n)) return true;
  const first = /^(?:\p{L}+)/u.exec(n)?.[0] ?? '';
  return IMPERATIVE_VERBS.some((v) => fold2(v) === first);
}

/**
 * Frase que narra o elenco (terceira pessoa): começa por ele/ela(s), por um
 * papel ("a recrutadora…", "o gestor…") ou por um nome do elenco; ou traz
 * "<Nome> <verbo>" em qualquer posição sem nenhuma marca de segunda pessoa.
 */
export function isThirdPersonSentence(sentence: string, castNames: readonly string[] = []): boolean {
  const n = normalizeSentence(sentence);
  if (!n) return false;
  const names = castNames.map((c) => fold2(c.trim().split(/\s+/)[0] ?? '')).filter((x) => x.length >= 2);
  const starts = new RegExp(`^${LEAD_IN}(?:(?:ele|ela|eles|elas)(?!\\p{L})|(?:o|a|os|as)\\s+(?:${CAST_ROLES.join('|')})(?!\\p{L})${names.length ? `|(?:${names.map(escapeRe).join('|')})(?!\\p{L})` : ''})`, 'u');
  if (starts.test(n)) return true;
  if (!names.length || isSecondPersonSentence(sentence)) return false;
  const nameVerb = new RegExp(`(?<!\\p{L})(?:${names.map(escapeRe).join('|')})\\s+(\\p{L}+)`, 'gu');
  for (let m = nameVerb.exec(n); m; m = nameVerb.exec(n)) if (VERB_LIKE_RE.test(m[1]!)) return true;
  return false;
}

/** Pistas de que a cena ensina (explica um porquê, dá a regra ou o movimento melhor). */
const TEACHING_CUE_RE = /(?<!\p{L})(porque|por isso|isso mostra|funcion\w*|evite|faca|prefira|lembre|na proxima|da para|o segredo|a regra|regra|dica|melhor caminho|faca assim|em vez de|em vez disso|o que levar)(?!\p{L})/u;

export function hasTeachingCue(text: string): boolean {
  const n = fold2(text);
  if (TEACHING_CUE_RE.test(n)) return true;
  return splitSentences(text).some((s) => {
    const first = /^(?:\p{L}+)/u.exec(normalizeSentence(s))?.[0] ?? '';
    return IMPERATIVE_VERBS.some((v) => fold2(v) === first);
  });
}

/** Tipos de cena submetidos às regras de voz. */
export const VOICE_SCENE_TYPES: ReadonlyArray<LessonScene['type']> = ['scenario', 'content', 'choice', 'consequence'];

/** Fração de frases narradas em terceira pessoa a partir da qual a cena é devolvida para reparo. */
export const THIRD_PERSON_MAX_RATIO = 0.4;

const quote = (s: string) => `"${s.replace(/\s+/g, ' ').trim().slice(0, 120)}${s.trim().length > 120 ? '…' : ''}"`;

/** Textos de uma cena que o aluno lê ou ouve (tela, orientação e fala), separados. */
function sceneTexts(s: LessonScene): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  // tópicos de lista ("- …") contam como frases próprias
  if (s.text.trim()) out.push({ label: 'texto', text: s.text.replace(/\n\s*-\s+/g, '. ').replace(/\n+/g, ' ') });
  if (s.type === 'consequence' && s.guidance?.trim()) out.push({ label: 'orientação', text: s.guidance });
  if (s.narration.trim()) out.push({ label: 'fala', text: s.narration });
  return out;
}

/**
 * Regras de voz de ensino (reparáveis), para as cenas de situação, conteúdo,
 * decisão e consequência:
 * - THIRD_PERSON_NARRATION: mais de 40% das frases (tela + orientação + fala)
 *   narram o elenco em terceira pessoa; ou uma consequência não fala com
 *   "você" (nem usa imperativo) nas duas primeiras frases da tela ou da fala.
 * - NOT_TEACHING: consequência ou conteúdo sem nenhuma pista de ensino
 *   (porque, por isso, isso mostra, funciona, evite, faça, prefira, lembre…).
 * Mensagens em pt-BR citam a frase problemática.
 */
export function validateTeachingVoice(script: LessonScript, opts: { castNames?: readonly string[] } = {}): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];
  const cast = opts.castNames ?? [];
  for (const s of script.scenes) {
    if (!VOICE_SCENE_TYPES.includes(s.type)) continue;
    const where = `cena "${s.title || s.id}" (${s.id})`;
    const texts = sceneTexts(s);
    const all = texts.flatMap((t) => splitSentences(t.text));
    const third = all.filter((x) => isThirdPersonSentence(x, cast));
    if (all.length && third.length / all.length > THIRD_PERSON_MAX_RATIO) {
      issues.push({ code: 'THIRD_PERSON_NARRATION', sceneId: s.id, message: `${where}: ${third.length} de ${all.length} frases narram o elenco em terceira pessoa (ex.: ${quote(third[0]!)}); a pessoa apresentadora é mentora e fala com "você"${s.type === 'consequence' ? ': comece pelo que você fez, diga por que funciona ou não e dê o movimento melhor ("Faça assim: …")' : ''}` });
    } else if (s.type === 'consequence') {
      for (const t of texts) {
        if (t.label === 'orientação') continue;
        const firstTwo = splitSentences(t.text).slice(0, 2);
        if (firstTwo.length && !firstTwo.some(isSecondPersonSentence)) {
          issues.push({ code: 'THIRD_PERSON_NARRATION', sceneId: s.id, message: `${where}: a consequência não fala com o aluno nas primeiras frases ${t.label === 'fala' ? 'da fala' : 'da tela'} (${quote(firstTwo.join(' '))}); comece pelo que VOCÊ fez ("Você respondeu com…"), diga por que funciona ou não e feche com "Faça assim: …"` });
          break;
        }
      }
    }
    if ((s.type === 'consequence' || s.type === 'content') && texts.length && !texts.some((t) => hasTeachingCue(t.text))) {
      issues.push({ code: 'NOT_TEACHING', sceneId: s.id, message: `${where}: ${s.type === 'consequence' ? 'a consequência' : 'a cena de conteúdo'} não ensina nada explícito (${quote(texts[0]!.text)}); diga por que funciona ou não ("porque…", "isso mostra…") e dê o movimento melhor no imperativo ("Faça assim: …", "Evite…", "Prefira…")` });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Roteiro de curso: quantas aulas cabem na duração alvo               */
/* ------------------------------------------------------------------ */

export interface OutlineTargets {
  /** faixa de aulas recomendada para a duração alvo */
  lessonsMin: number;
  lessonsMax: number;
  /** minutos por aula (estimatedMinutes) recomendados */
  minutesPerLessonMin: number;
  minutesPerLessonMax: number;
  /** cenas por aula */
  scenesMin: number;
  scenesMax: number;
}

/**
 * Deriva a quantidade de aulas da duração alvo (≈ 3 min por aula):
 * 10 → 3–4, 15 → 4–5, 20 → 6–7, 30 → 8–10, 45 → 12–15.
 */
export function outlineTargets(targetMinutes: number | undefined): OutlineTargets {
  const t = Math.max(5, Math.round(Number.isFinite(targetMinutes) && targetMinutes ? targetMinutes : 15));
  const lessonsMax = Math.max(2, Math.ceil(t / LESSON_CAPS.minutesPerLesson));
  const lessonsMin = Math.max(1, lessonsMax - Math.max(1, Math.floor(t / 15)));
  return { lessonsMin, lessonsMax, minutesPerLessonMin: 2, minutesPerLessonMax: 4, scenesMin: 4, scenesMax: LESSON_CAPS.maxScenes };
}

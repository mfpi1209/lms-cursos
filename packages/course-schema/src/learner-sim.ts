import { z } from 'zod';
import { AUDIENCE_LEVELS, AUDIENCE_PROFILES, AUDIENCE_TRAITS, allLessons, type CourseDocument, type Lesson } from './course';
import { estimateMinutes, nodeScreenWords, nodeSpokenWords } from './length';
import { richTextToPlain } from './richtext';
import { decisionQuestion } from './studio';
import type { AnyNode } from './nodes';
import type { Edge } from './graph';

/**
 * Alunos de teste: perfis fictícios do público que "fazem" o curso e dão a
 * opinião deles. A simulação é por REGRAS (sem IA, sem custo): percorre o
 * grafo de cada aula como o perfil responderia, mede tempo, texto na tela,
 * fala, decisões, escrita obrigatória e jargão, e escreve a opinião em
 * primeira pessoa. Serve para achar problemas antes de pagar vídeos.
 */

export const ANSWER_STYLES = ['cautious', 'best', 'impulsive', 'mixed'] as const;
export type AnswerStyle = (typeof ANSWER_STYLES)[number];
export const ANSWER_STYLE_LABELS: Record<AnswerStyle, string> = {
  cautious: 'Cautelosa: escolhe a resposta "segura"',
  best: 'Atenta: costuma acertar',
  impulsive: 'Rápida: escolhe a primeira que parece boa',
  mixed: 'Alterna: às vezes acerta, às vezes erra',
};

export const LearnerProfileDataSchema = z.object({
  /** nome fictício */
  name: z.string().min(1).max(40),
  age: z.number().int().min(14).max(70),
  city: z.string().max(60).default(''),
  /** situação em uma frase (o que busca, rotina) */
  situation: z.string().max(300).default(''),
  audienceProfile: z.enum(AUDIENCE_PROFILES).default('first_job'),
  level: z.enum(AUDIENCE_LEVELS).default('beginner'),
  traits: z.array(z.enum(AUDIENCE_TRAITS)).default([]),
  device: z.enum(['celular', 'computador']).default('celular'),
  /** minutos que a pessoa tem de uma vez para o curso */
  minutesAvailable: z.number().int().min(3).max(240).default(20),
  /** palavras na tela que a pessoa lê sem cansar, por cena */
  readingTolerance: z.number().int().min(20).max(400).default(80),
  answerStyle: z.enum(ANSWER_STYLES).default('mixed'),
  /** topa treinar falando em voz alta */
  voiceComfort: z.boolean().default(false),
});
export type LearnerProfileData = z.infer<typeof LearnerProfileDataSchema>;

/** Jargão de RH que trava o público iniciante quando não é explicado. */
export const HR_JARGON = ['fit cultural', 'soft skills', 'hard skills', 'stakeholder', 'networking', 'kpi', 'onboarding', 'pitch', 'case', 'mindset', 'feedback 360', 'proatividade', 'budget', 'deadline', 'follow-up'] as const;

export interface SimulatedChoice {
  lessonId: string;
  nodeId: string;
  /** opção escolhida (o aluno só lê o retorno DELA) */
  optionId: string;
  question: string;
  answer: string;
  quality?: 'strong' | 'ok' | 'weak';
  /** o retorno explica o efeito ("Você…") ou o que fazer ("Faça assim:" / "melhor:") */
  helpfulFeedback: boolean;
}

export interface LearnerFinding {
  kind: 'liked' | 'issue';
  code: string;
  text: string;
  lessonId?: string;
  nodeId?: string;
}

export interface LearnerOpinion {
  profileKey: string;
  name: string;
  /** 1 a 5 */
  rating: number;
  minutes: number;
  /** aulas concluídas no tempo que a pessoa tinha (todas = sem desistência) */
  lessonsDone: number;
  lessonsTotal: number;
  /** onde parou por falta de tempo (título da aula) */
  stoppedAt?: string;
  choices: SimulatedChoice[];
  liked: LearnerFinding[];
  issues: LearnerFinding[];
  /** opinião em primeira pessoa */
  quote: string;
  wouldRecommend: boolean;
}

const plain = (s: unknown) => (typeof s === 'string' ? s : richTextToPlain(s as never)).replace(/\s+/g, ' ').trim();
const fmtMin = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.0', '').replace('.', ',');

function nodeText(n: AnyNode): string {
  const parts: string[] = [];
  if ('narration' in n && typeof n.narration === 'string') parts.push(n.narration);
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') parts.push(richTextToPlain(n.body));
  if (n.type === 'choice' || n.type === 'reflection' || n.type === 'assessment') parts.push(richTextToPlain(n.prompt));
  if (n.type === 'mission') parts.push(n.intro, n.action, n.alternative);
  if (n.type === 'choice' || n.type === 'assessment') for (const o of n.options) parts.push(o.label, richTextToPlain(o.feedback));
  return parts.join(' ').toLowerCase();
}

/** Jargão sem explicação: o termo aparece e não há "ou seja"/"quer dizer"/"significa" no mesmo nó. */
export function unexplainedJargon(n: AnyNode): string[] {
  const text = nodeText(n);
  if (/ou seja|quer dizer|significa|isto é|que é quando/.test(text)) return [];
  return HR_JARGON.filter((j) => new RegExp(`(^|[^a-zà-ú])${j.replace(/[-]/g, '\\-')}([^a-zà-ú]|$)`, 'i').test(text));
}

function pickOption(n: Extract<AnyNode, { type: 'choice' }>, style: AnswerStyle, decisionIndex: number) {
  const byQ = (q: string) => n.options.find((o) => o.quality === q);
  switch (style) {
    case 'best':
      return byQ('strong') ?? n.options[0]!;
    case 'cautious':
      return byQ('ok') ?? byQ('strong') ?? n.options[0]!;
    case 'impulsive':
      return n.options[0]!;
    case 'mixed':
      return (decisionIndex % 2 === 0 ? byQ('weak') : byQ('strong')) ?? n.options[decisionIndex % n.options.length]!;
  }
}

function nextEdge(edges: readonly Edge[], from: string, optionId?: string): Edge | undefined {
  const out = edges.filter((e) => e.from === from && (optionId === undefined || !e.optionId || e.optionId === optionId));
  const ranked = [...out].sort((a, b) => (a.optionId === optionId ? -1 : 0) - (b.optionId === optionId ? -1 : 0) || (a.priority ?? 500) - (b.priority ?? 500));
  return ranked.find((e) => !e.condition) ?? ranked.find((e) => e.isDefault) ?? ranked[0];
}

const countWords = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * Palavras que o aluno LÊ numa cena: na decisão, o enunciado, as opções e só o
 * retorno da opção escolhida (os outros retornos nunca aparecem para ele).
 */
export function seenScreenWords(n: AnyNode, chosenOptionId?: string): number {
  if (n.type !== 'choice') return nodeScreenWords(n);
  const chosen = n.options.find((o) => o.id === chosenOptionId);
  return countWords(richTextToPlain(n.prompt)) + n.options.reduce((a, o) => a + countWords(o.label), 0) + (chosen ? countWords(richTextToPlain(chosen.feedback)) : 0);
}

interface LessonWalk {
  lesson: Lesson;
  nodes: AnyNode[];
  minutes: number;
  choices: SimulatedChoice[];
}

/** Caminho do perfil numa aula (do início ao fim, sem repetir nó). */
export function walkLesson(lesson: Lesson, style: AnswerStyle, decisionOffset = 0): LessonWalk {
  const byId = new Map(lesson.graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const nodes: AnyNode[] = [];
  const choices: SimulatedChoice[] = [];
  let cur = byId.get(lesson.graph.startNodeId);
  let screen = 0;
  let spoken = 0;
  while (cur && !seen.has(cur.id) && nodes.length < 200) {
    seen.add(cur.id);
    nodes.push(cur);
    spoken += nodeSpokenWords(cur);
    if (cur.type === 'end') {
      screen += nodeScreenWords(cur);
      break;
    }
    let optionId: string | undefined;
    if (cur.type !== 'choice') screen += nodeScreenWords(cur);
    if (cur.type === 'choice') {
      const opt = pickOption(cur, style, decisionOffset + choices.length);
      optionId = opt.id;
      screen += seenScreenWords(cur, opt.id);
      const fb = plain(opt.feedback);
      choices.push({ lessonId: lesson.id, nodeId: cur.id, optionId: opt.id, question: decisionQuestion(cur), answer: opt.label.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, ''), ...(opt.quality ? { quality: opt.quality } : {}), helpfulFeedback: /^voc[eê](?![a-zà-ú])/i.test(fb) || /fa[cç]a assim|melhor:/i.test(fb) });
    }
    const e = nextEdge(lesson.graph.edges, cur.id, optionId);
    cur = e ? byId.get(e.to) : undefined;
  }
  return { lesson, nodes, minutes: estimateMinutes({ screenWords: screen, spokenWords: spoken, decisions: choices.length }), choices };
}

const SCENE_SPOKEN_MAX = 120;

/** Opinião simulada de um perfil sobre o curso (pura, determinística, sem custo). */
export function simulateLearner(doc: CourseDocument, profileKey: string, profileInput: LearnerProfileData): LearnerOpinion {
  const p = LearnerProfileDataSchema.parse(profileInput);
  const lessons = allLessons(doc);
  const liked: LearnerFinding[] = [];
  const issues: LearnerFinding[] = [];
  const once = new Set<string>();
  const add = (f: LearnerFinding, max = 2) => {
    const n = [...once].filter((k) => k.startsWith(`${f.kind}:${f.code}:`)).length;
    if (n >= max) return;
    once.add(`${f.kind}:${f.code}:${n}`);
    (f.kind === 'liked' ? liked : issues).push(f);
  };
  const walks: LessonWalk[] = [];
  let decisions = 0;
  for (const l of lessons) {
    const w = walkLesson(l, p.answerStyle, decisions);
    decisions += w.choices.length;
    walks.push(w);
  }
  const choices = walks.flatMap((w) => w.choices);
  const minutes = walks.reduce((a, w) => a + w.minutes, 0);

  // tempo: quantas aulas cabem no tempo da pessoa
  let acc = 0;
  let lessonsDone = 0;
  for (const w of walks) {
    if (acc + w.minutes > p.minutesAvailable + 0.5) break;
    acc += w.minutes;
    lessonsDone++;
  }
  const stoppedAt = lessonsDone < walks.length ? walks[lessonsDone]!.lesson.title : undefined;
  if (stoppedAt) add({ kind: 'issue', code: 'NO_TIME', text: `O curso leva cerca de ${fmtMin(minutes)} min e eu tinha ${p.minutesAvailable}: parei na aula "${stoppedAt}".` }, 1);
  else if (lessons.length) add({ kind: 'liked', code: 'FITS_TIME', text: `Coube no meu tempo: cerca de ${fmtMin(minutes)} min no total.` }, 1);
  const lowTime = p.traits.includes('low_time');
  for (const w of walks) if (lowTime && w.minutes > 6) add({ kind: 'issue', code: 'LONG_LESSON', lessonId: w.lesson.id, text: `A aula "${w.lesson.title}" passou de 6 minutos (cerca de ${fmtMin(w.minutes)}).` });

  for (const w of walks) {
    const lessonDecisions = w.choices.length;
    if (!lessonDecisions && w.nodes.length > 1) add({ kind: 'issue', code: 'NO_DECISION', lessonId: w.lesson.id, text: `Na aula "${w.lesson.title}" eu só assisti; não precisei decidir nada.` });
    for (const n of w.nodes) {
      const screen = seenScreenWords(n, w.choices.find((c) => c.nodeId === n.id)?.optionId);
      const title = n.title ?? n.id;
      if (screen > p.readingTolerance && n.type !== 'end') add({ kind: 'issue', code: 'TOO_MUCH_TEXT', lessonId: w.lesson.id, nodeId: n.id, text: `A cena "${title}" tem ${screen} palavras para ler${p.device === 'celular' ? ' no celular' : ''}; eu me cansei.` });
      const spoken = nodeSpokenWords(n);
      if (spoken > SCENE_SPOKEN_MAX) add({ kind: 'issue', code: 'LONG_SPEECH', lessonId: w.lesson.id, nodeId: n.id, text: `A fala da cena "${title}" é longa (${spoken} palavras).` });
      if (n.type === 'reflection' && !n.scaffold && n.minLength > 0) {
        add({ kind: 'issue', code: 'MUST_WRITE', lessonId: w.lesson.id, nodeId: n.id, text: p.traits.includes('shy') ? `Na cena "${title}" eu tive que escrever do zero; travei.` : `A cena "${title}" pede texto escrito; no celular dá preguiça.` });
      }
      if (n.type === 'reflection' && n.scaffold) add({ kind: 'liked', code: 'SCAFFOLD', lessonId: w.lesson.id, nodeId: n.id, text: 'Montar a frase tocando nos blocos foi fácil, sem precisar escrever.' }, 1);
      // resposta aberta é sempre opcional no player (as escolhas continuam): só conta a favor
      if (n.type === 'choice' && n.openAnswer?.enabled && n.openAnswer.voice && p.voiceComfort) add({ kind: 'liked', code: 'OPEN_ANSWER', lessonId: w.lesson.id, nodeId: n.id, text: `Na cena "${title}" deu para responder do meu jeito, falando.` }, 1);
      if (p.level === 'beginner' || p.audienceProfile === 'first_job') for (const j of unexplainedJargon(n)) add({ kind: 'issue', code: 'JARGON', lessonId: w.lesson.id, nodeId: n.id, text: `Não entendi o que é "${j}" (cena "${title}").` });
    }
  }

  if (choices.length) add({ kind: 'liked', code: 'CHOICES', text: p.traits.includes('shy') ? 'Gostei de poder escolher a resposta em vez de escrever ou falar.' : `Gostei das decisões: foram ${choices.length} no caminho que eu fiz.` }, 1);
  const wrong = choices.filter((c) => c.quality === 'weak' || c.quality === 'ok');
  const helpful = wrong.filter((c) => c.helpfulFeedback);
  if (helpful.length) add({ kind: 'liked', code: 'FEEDBACK', text: `Quando errei ("${helpful[0]!.answer}"), o retorno explicou o que fazer, sem me julgar.` }, 1);
  const unhelpful = wrong.filter((c) => !c.helpfulFeedback);
  for (const c of unhelpful) add({ kind: 'issue', code: 'WEAK_FEEDBACK', lessonId: c.lessonId, nodeId: c.nodeId, text: `Escolhi "${c.answer}" e o retorno não disse o que fazer diferente.` });
  const shapes = choices.filter((c) => c.quality === 'strong');
  if (choices.length >= 2 && shapes.length === choices.length && p.answerStyle !== 'best') add({ kind: 'issue', code: 'OBVIOUS', text: 'A resposta certa parecia sempre óbvia; não precisei pensar.' }, 1);
  if (p.traits.includes('accessibility')) add({ kind: 'liked', code: 'CAPTIONS', text: 'As legendas já vêm ligadas; consigo acompanhar sem som.' }, 1);
  if (doc.brief.interaction?.voiceTraining && p.voiceComfort) add({ kind: 'liked', code: 'VOICE_TRAINING', text: 'Treinar falando em voz alta, quando quis, ajudou.' }, 1);

  // meio ponto por problema (no máximo 2 por tipo); não terminar ou ter de escrever pesa 1
  const penalty = issues.reduce((a, i) => a + (i.code === 'NO_TIME' || i.code === 'MUST_WRITE' ? 1 : 0.5), 0);
  // quem não terminou o curso no tempo que tinha não dá mais que 3
  const rating = Math.max(1, Math.min(stoppedAt ? 3 : 5, Math.round(5 - penalty)));
  const quote = buildQuote(p, liked, issues, rating);
  return { profileKey, name: p.name, rating, minutes: Math.round(minutes * 10) / 10, lessonsDone, lessonsTotal: walks.length, ...(stoppedAt ? { stoppedAt } : {}), choices, liked, issues, quote, wouldRecommend: rating >= 4 };
}

function buildQuote(p: LearnerProfileData, liked: LearnerFinding[], issues: LearnerFinding[], rating: number): string {
  const intro = `Sou ${p.name}, ${p.age} anos${p.city ? `, de ${p.city}` : ''}.`;
  const good = liked[0]?.text;
  const bad = issues[0]?.text;
  const verdict = rating >= 4 ? 'Eu indicaria para um amigo.' : rating === 3 ? 'Dá para fazer, mas precisa de ajustes.' : 'Do jeito que está, eu largaria no meio.';
  return [intro, good, bad ? `Mas: ${bad.charAt(0).toLowerCase()}${bad.slice(1)}` : 'Não travei em nada.', verdict].filter(Boolean).join(' ');
}

/** Resumo do painel de alunos de teste: média, quem indicaria e os problemas mais citados. */
export function summarizeOpinions(opinions: readonly LearnerOpinion[]) {
  const avg = opinions.length ? Math.round((opinions.reduce((a, o) => a + o.rating, 0) / opinions.length) * 10) / 10 : null;
  const counts = new Map<string, { code: string; text: string; who: string[] }>();
  for (const o of opinions)
    for (const i of o.issues) {
      const cur = counts.get(i.code) ?? { code: i.code, text: i.text, who: [] };
      if (!cur.who.includes(o.name)) cur.who.push(o.name);
      counts.set(i.code, cur);
    }
  return {
    average: avg,
    recommend: opinions.filter((o) => o.wouldRecommend).length,
    total: opinions.length,
    topIssues: [...counts.values()].sort((a, b) => b.who.length - a.who.length).slice(0, 5),
  };
}

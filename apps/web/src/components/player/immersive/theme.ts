import { richTextToPlain, type AnyNode, type RichTextDocument } from '@lms/course-schema';
import type { PlatformContext } from '../types';

export const DEFAULT_ACCENT = '#C8F03C';
export const NAVY = '#0B1424';

/* ------------------------------------------------------------------------ */
/* Marca                                                                     */
/* ------------------------------------------------------------------------ */

const STOP = new Set(['ao', 'aos', 'à', 'às', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'e', 'em', 'para', 'a', 'o', 'as', 'os', 'com', 'um', 'uma']);

/** "Pode entrar: sua próxima entrevista…" → "pode entrar"; no máximo 3 palavras, sem conectivo no fim. */
export function defaultWordmark(courseTitle: string): string {
  const head = courseTitle.split(/[:–—|]/)[0]!.trim() || courseTitle;
  const words = head.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean).slice(0, 3);
  // corta antes do primeiro conectivo: "comunicação no primeiro" → "comunicação"; "primeira entrevista de…" → "primeira entrevista"
  const cut = words.findIndex((w, i) => i > 0 && STOP.has(w));
  return (cut > 0 ? words.slice(0, cut) : words).join(' ');
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.8;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Versão escura do acento para texto/linha fina no tema claro: contraste ≥ 6:1 sobre o branco (folga para #F4F6F9). */
export function darkInk(hex: string): string {
  if (hex.toUpperCase() === DEFAULT_ACCENT) return '#3F5A00';
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#3F5A00';
  const n = parseInt(m[1]!, 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let s = 1; s > 0.05; s -= 0.04) {
    const c = rgb.map((v) => Math.round(v * s));
    const out = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    if (1.05 / (luminance(out) + 0.05) >= 6) return out;
  }
  return NAVY;
}

export interface ResolvedBrand {
  wordmark: string;
  subtitle: string;
  tagline?: string;
  /** acento próprio do curso; `undefined` = herda o acento do preset do workspace (`.theme-platform` em globals.css) */
  accent?: string;
  presenterName?: string;
  presenterRole?: string;
  /** variáveis CSS do acento no elemento raiz do player (vazio quando o curso herda o acento da plataforma) */
  style: React.CSSProperties;
}

/**
 * Marca com padrões: wordmark do título, "Aula N de M" como subtítulo.
 * Acento: o do curso (`branding.accent`), aplicado SÓ dentro do player (variáveis `--im-*`
 * no elemento raiz). Sem acento no curso, nada é posto inline e o player herda o acento
 * do preset de marca do workspace (config/brand.ts → globals.css), como o resto da área do aluno.
 */
export function resolveBrand(platform: PlatformContext): ResolvedBrand {
  const b = platform.branding;
  const own = b.accent && /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : undefined;
  const idx = platform.lessons.findIndex((l) => l.id === platform.currentLessonId);
  const subtitle = b.subtitle?.trim() || (idx >= 0 && platform.lessons.length > 1 ? `Aula ${idx + 1} de ${platform.lessons.length}` : platform.courseTitle);
  const base = {
    wordmark: b.wordmark?.trim() || defaultWordmark(platform.courseTitle),
    subtitle,
    tagline: b.tagline?.trim() || undefined,
    // Marca do curso > elenco (apresentador/mentor/entrevistador) > sem legenda (nunca o nome técnico do avatar).
    presenterName: b.presenterName?.trim() || platform.castPresenter?.name,
    presenterRole: b.presenterName?.trim() ? b.presenterRole?.trim() || undefined : platform.castPresenter?.role,
  };
  if (!own) return { ...base, accent: undefined, style: {} };
  const accent = own;
  const L = luminance(accent);
  // Texto sobre o acento: marinho em acentos claros, branco nos escuros (contraste ≥ 4,5:1).
  const onAccent = L > 0.18 ? NAVY : '#FFFFFF';
  // Acento como texto sobre o marinho (tema escuro): clareia os acentos escuros.
  const ink = L > 0.25 ? accent : `color-mix(in oklab, ${accent} 45%, white)`;
  // Acento como texto sobre o branco (tema claro): escurece até ≥ 4,5:1 (lima padrão → oliva #3F5A00).
  const inkLight = darkInk(accent);
  return {
    ...base,
    accent,
    style: { ['--im-accent' as string]: accent, ['--im-on-accent' as string]: onAccent, ['--im-ink-dark' as string]: ink, ['--im-ink-light' as string]: inkLight },
  };
}

/* ------------------------------------------------------------------------ */
/* Cenas                                                                     */
/* ------------------------------------------------------------------------ */

export type ChipTone = 'accent' | 'neutral' | 'warm' | 'danger';
export interface Chip {
  /** texto em caixa normal (o CSS põe em caixa alta) */
  label: string;
  tone: ChipTone;
}

function hasList(doc: RichTextDocument | undefined): boolean {
  return !!doc?.content.some((b) => b.type === 'bulletList' || b.type === 'orderedList');
}

/** Cena de dica: título "Dica…"/"Na prática…" ou um texto que é uma lista (checklist). */
export function isTipScene(node: AnyNode): boolean {
  if (node.type !== 'content') return false;
  return /^\s*(dica|na prática)\b/i.test(node.title ?? '') || hasList(node.body);
}

export function chipFor(node: AnyNode | undefined, playing: boolean): Chip {
  if (playing) return { label: 'Assista', tone: 'neutral' };
  if (!node) return { label: 'Aviso', tone: 'neutral' };
  switch (node.type) {
    case 'choice':
    case 'reflection':
    case 'assessment':
      return { label: 'Sua vez', tone: 'accent' };
    case 'consequence':
      return { label: 'Feedback', tone: node.tone === 'positive' ? 'accent' : node.tone === 'negative' ? 'danger' : 'warm' };
    case 'content':
      return isTipScene(node) ? { label: 'Dica', tone: 'warm' } : { label: 'Entenda', tone: 'neutral' };
    case 'scenario':
      return { label: 'Cena', tone: 'neutral' };
    case 'end':
      return { label: 'Fim', tone: 'accent' };
    default:
      return { label: 'Etapa', tone: 'neutral' };
  }
}

/**
 * Título grande a partir do enunciado. Se houver uma pergunta, ela vira o
 * título e o contexto (antes/depois) vira texto de apoio — como na referência
 * ("Como você começa essa conversa?"). Sem pergunta: curto → o enunciado;
 * longo → o título da cena, com o enunciado inteiro como apoio.
 */
export function splitPrompt(prompt: RichTextDocument, fallbackTitle: string): { heading: string; lead: string | null; leadDoc: RichTextDocument | null } {
  const plain = richTextToPlain(prompt).replace(/\s+/g, ' ').trim();
  if (!plain) return { heading: fallbackTitle, lead: null, leadDoc: null };
  const sentences = plain.split(/(?<=[.!?…]["”»)]?)\s+(?=[A-ZÀ-Ý“"(¿¡0-9])/u).filter(Boolean);
  const qi = sentences.findIndex((x) => /\?["”»)]?$/.test(x) && x.length <= 120);
  if (qi >= 0 && (sentences.length > 1 || plain.length <= 120)) {
    const rest = [...sentences.slice(0, qi), ...sentences.slice(qi + 1)].join(' ').trim();
    return { heading: sentences[qi]!, lead: rest || null, leadDoc: null };
  }
  if (plain.length <= 110) return { heading: plain, lead: null, leadDoc: null };
  return { heading: fallbackTitle, lead: null, leadDoc: prompt };
}

/** Tamanho do título (referência: ~52–56px em 1440, ~64–72px em 1920; 32px no celular). */
export function headingSize(text: string): string {
  const n = text.length;
  if (n <= 48) return 'text-[32px]! md:text-[clamp(2.75rem,3.65vw,4.5rem)]!';
  if (n <= 80) return 'text-[30px]! md:text-[clamp(2.5rem,3.1vw,3.75rem)]!';
  return 'text-[26px]! md:text-[clamp(2rem,2.5vw,3rem)]!';
}

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

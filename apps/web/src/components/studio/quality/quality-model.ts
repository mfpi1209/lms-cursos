import type { AssistantAction } from '@lms/ai/client';

/**
 * Avaliação de qualidade de uma aula (scorecard). Tipos e rótulos espelham o
 * contrato de `@lms/ai` (QualityScorecard / QualityFinding / QUALITY_DIMENSIONS).
 * Enquanto o pacote não exporta esses tipos, ficam aqui; quando exportar, basta
 * trocar as definições por reexports.
 */

export const QUALITY_DIMENSIONS = ['conteudo', 'voz_narrativa', 'perguntas', 'decisoes', 'realismo', 'fala', 'postura', 'aparencia', 'fundo', 'voz', 'realismo_visual'] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

/** dimensões avaliadas a partir do texto da aula */
export const TEXT_DIMENSIONS: ReadonlySet<QualityDimension> = new Set<QualityDimension>(['conteudo', 'voz_narrativa', 'perguntas', 'decisoes', 'realismo']);
/** dimensões avaliadas a partir dos quadros dos vídeos prontos */
export const VIDEO_DIMENSIONS: ReadonlySet<QualityDimension> = new Set<QualityDimension>(['fala', 'postura', 'aparencia', 'fundo', 'voz', 'realismo_visual']);

export const QUALITY_DIMENSION_LABELS: Record<QualityDimension, string> = {
  conteudo: 'Conteúdo',
  voz_narrativa: 'Voz narrativa',
  perguntas: 'Perguntas',
  decisoes: 'Decisões',
  realismo: 'Realismo',
  fala: 'Fala',
  postura: 'Postura e gestos',
  aparencia: 'Aparência',
  fundo: 'Fundo',
  voz: 'Voz',
  realismo_visual: 'Realismo visual',
};

export type QualitySeverity = 'alta' | 'média' | 'baixa';
export const SEVERITY_ORDER: readonly QualitySeverity[] = ['alta', 'média', 'baixa'];
export const SEVERITY_LABELS: Record<QualitySeverity, string> = { alta: 'Alta', média: 'Média', baixa: 'Baixa' };

export type QualityScore = 1 | 2 | 3 | 4 | 5;

export interface QualityFinding {
  dimension: QualityDimension;
  severity: QualitySeverity;
  /** id da cena (nó) a que o apontamento se refere */
  scene?: string;
  /** índice do plano dentro da cena, quando houver */
  shot?: number;
  /** trecho ou quadro que motivou o apontamento */
  evidence: string;
  problem: string;
  fix: string;
  /** cartão de ação pronto (mesmo contrato do assistente) */
  action?: AssistantAction;
}

export interface QualityScorecard {
  lessonId: string;
  revision: number;
  scores: Record<QualityDimension, QualityScore | null>;
  overall: number | null;
  summary: string;
  findings: QualityFinding[];
  evaluatedAt: string;
  basis: { text: boolean; video: string[]; framesPerVideo: number };
}

export interface LessonQuality {
  scorecard: QualityScorecard | null;
  stale: boolean;
}

export interface CourseQuality {
  lessons: { lessonId: string; scorecard: QualityScorecard | null; stale: boolean }[];
  course: { overall: number | null; dimensions: Partial<Record<QualityDimension, number | null>> };
}

/* ------------------------------------------------------------------ */
/* Rótulos e utilitários                                               */
/* ------------------------------------------------------------------ */

/** Rótulo da nota geral: 1–2 "Precisa refazer", 3 "Ajustar", 4 "Bom", 5 "Pronto". */
export function scoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Sem nota';
  const r = Math.round(score);
  if (r <= 2) return 'Precisa refazer';
  if (r === 3) return 'Ajustar';
  if (r === 4) return 'Bom';
  return 'Pronto';
}

/** Tom (classes de cor) para uma nota: baixa → danger, média → paid, boa → success. */
export function scoreTone(score: number | null | undefined): 'danger' | 'warning' | 'success' | 'neutral' {
  if (score === null || score === undefined || Number.isNaN(score)) return 'neutral';
  const r = Math.round(score);
  if (r <= 2) return 'danger';
  if (r === 3) return 'warning';
  return 'success';
}

/** "3,6" em pt-BR; "—" sem nota. */
export function formatScore(score: number | null | undefined, digits = 1): string {
  if (score === null || score === undefined || Number.isNaN(score)) return '—';
  return score.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(score) ? 0 : digits, maximumFractionDigits: digits });
}

/** Avaliação baixa (abaixo de 3): vale avisar antes de publicar. */
export function isLowScore(score: number | null | undefined): boolean {
  return typeof score === 'number' && !Number.isNaN(score) && score < 3;
}

/** Dimensão com a pior nota (ignora as sem nota). */
export function worstDimension(scores: Partial<Record<QualityDimension, number | null>> | undefined): { dimension: QualityDimension; score: number } | null {
  if (!scores) return null;
  let worst: { dimension: QualityDimension; score: number } | null = null;
  for (const d of QUALITY_DIMENSIONS) {
    const s = scores[d];
    if (typeof s !== 'number') continue;
    if (!worst || s < worst.score) worst = { dimension: d, score: s };
  }
  return worst;
}

export type FindingsFilter = 'all' | 'text' | 'video';
export const FINDINGS_FILTERS: { id: FindingsFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'text', label: 'Texto' },
  { id: 'video', label: 'Vídeo' },
];

export function matchesFilter(f: QualityFinding, filter: FindingsFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'text' ? TEXT_DIMENSIONS.has(f.dimension) : VIDEO_DIMENSIONS.has(f.dimension);
}

const SEV_RANK: Record<QualitySeverity, number> = { alta: 0, média: 1, baixa: 2 };

/** Apontamentos em ordem de gravidade (alta primeiro), estável dentro de cada grupo. */
export function sortFindings(findings: readonly QualityFinding[]): QualityFinding[] {
  return findings.map((f, i) => ({ f, i })).sort((a, b) => (SEV_RANK[a.f.severity] ?? 3) - (SEV_RANK[b.f.severity] ?? 3) || a.i - b.i).map((x) => x.f);
}

/** Apontamento mais grave de cada dimensão (nota de uma linha nos cartões). */
export function topFindingByDimension(findings: readonly QualityFinding[]): Map<QualityDimension, QualityFinding> {
  const m = new Map<QualityDimension, QualityFinding>();
  for (const f of sortFindings(findings)) if (!m.has(f.dimension)) m.set(f.dimension, f);
  return m;
}

/** Quantidade de apontamentos por cena. */
export function findingsByScene(findings: readonly QualityFinding[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings ?? []) if (f.scene) m.set(f.scene, (m.get(f.scene) ?? 0) + 1);
  return m;
}

/** Evento global usado pelos selos das cenas para abrir o painel de avaliação. */
export const OPEN_QUALITY_EVENT = 'lms:quality-open';
export interface OpenQualityDetail {
  nodeId?: string;
}
export function requestOpenQuality(detail: OpenQualityDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenQualityDetail>(OPEN_QUALITY_EVENT, { detail }));
}

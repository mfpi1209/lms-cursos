import { z } from 'zod';
import { AssistantActionSchema } from './assistant-schema';

/**
 * Avaliação de qualidade ("Avaliação"): a plataforma avalia cada aula (texto)
 * e os vídeos produzidos, dimensão a dimensão, com evidência e uma correção
 * concreta ligada a uma ação do assistente. Contrato compartilhado entre
 * worker, API e UI (seguro para o navegador: só zod).
 */
export const QUALITY_DIMENSIONS = [
  'conteudo',
  'voz_narrativa',
  'perguntas',
  'decisoes',
  'realismo',
  'fala',
  'postura',
  'aparencia',
  'fundo',
  'voz',
  'realismo_visual',
] as const;
export const QualityDimensionSchema = z.enum(QUALITY_DIMENSIONS);
export type QualityDimension = z.infer<typeof QualityDimensionSchema>;

/** Dimensões avaliadas só a partir do roteiro (texto). */
export const TEXT_DIMENSIONS: readonly QualityDimension[] = ['conteudo', 'voz_narrativa', 'perguntas', 'decisoes', 'realismo', 'fala'];
/** Dimensões avaliadas a partir dos vídeos produzidos (quadros + métricas de áudio). */
export const VIDEO_DIMENSIONS: readonly QualityDimension[] = ['postura', 'aparencia', 'fundo', 'voz', 'realismo_visual'];

export const QUALITY_DIMENSION_LABELS: Record<QualityDimension, { label: string; question: string; basis: 'text' | 'video' }> = {
  conteudo: { label: 'Conteúdo', question: 'A aula ensina algo que a pessoa aplica amanhã?', basis: 'text' },
  voz_narrativa: { label: 'Voz narrativa', question: 'Mentor falando com você (segunda pessoa), sem narrar o elenco?', basis: 'text' },
  perguntas: { label: 'Perguntas', question: 'Perguntas claras, uma por decisão, dirigidas ao aluno?', basis: 'text' },
  decisoes: { label: 'Decisões', question: 'Três opções plausíveis, uma melhor, consequências como feedback?', basis: 'text' },
  realismo: { label: 'Realismo', question: 'Situação crível no Brasil (cargos, empresas, rotina)?', basis: 'text' },
  fala: { label: 'Fala', question: 'Falável, frases curtas, ritmo de conversa?', basis: 'text' },
  postura: { label: 'Postura e gestos', question: 'Postura natural, gestos coerentes, sem sinais estranhos ou repetidos?', basis: 'video' },
  aparencia: { label: 'Aparência', question: 'Rosto visível, enquadramento e luz adequados, identidade consistente entre planos?', basis: 'video' },
  fundo: { label: 'Fundo', question: 'Fundo limpo, coerente e com continuidade entre os planos?', basis: 'video' },
  voz: { label: 'Voz', question: 'Ritmo de fala (2,2–2,9 palavras/s), sem silêncios longos nem áudio cortado?', basis: 'video' },
  realismo_visual: { label: 'Realismo visual', question: 'Sem artefatos, pessoas extras, textos ou logos estranhos?', basis: 'video' },
};

export const QUALITY_SEVERITIES = ['alta', 'média', 'baixa'] as const;
export const QualitySeveritySchema = z.enum(QUALITY_SEVERITIES);
export type QualitySeverity = z.infer<typeof QualitySeveritySchema>;

export const QualityScoreSchema = z.number().int().min(1).max(5);

export const QualityFindingSchema = z.object({
  dimension: QualityDimensionSchema,
  severity: QualitySeveritySchema,
  /** cena (nodeId) a que o achado se refere */
  scene: z.string().max(64).optional(),
  /** plano (shotId) da direção, quando o achado é de um quadro do vídeo */
  shot: z.string().max(40).optional(),
  /** evidência: trecho citado do texto/fala, ou qual quadro/plano ("quadro 3 de 5, 60%") */
  evidence: z.string().max(400),
  problem: z.string().max(400),
  /** correção concreta, em pt-BR */
  fix: z.string().max(400),
  /** ação do assistente que aplica a correção (revise_lesson teaching/shorten/practical, direct_lesson, generate_videos, open, update_direction_style) */
  action: AssistantActionSchema.optional(),
});
export type QualityFinding = z.infer<typeof QualityFindingSchema>;

export const MAX_QUALITY_FINDINGS = 20;

/** Nota por dimensão; null = não avaliada (sem vídeo, fora do limite de vídeos por execução…). */
export const QualityScoresSchema = z.object(Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, QualityScoreSchema.nullable()])) as Record<QualityDimension, z.ZodNullable<typeof QualityScoreSchema>>);
export type QualityScores = z.infer<typeof QualityScoresSchema>;

export const QualityScorecardSchema = z.object({
  lessonId: z.string().max(64),
  /** revisão do rascunho avaliada (draft_revision): diferente da atual = avaliação desatualizada */
  revision: z.number().int().min(0),
  scores: QualityScoresSchema,
  /** média arredondada das dimensões avaliadas (1 a 5) */
  overall: QualityScoreSchema,
  /** até 3 frases, em pt-BR (inclui o custo quando houve chamada de visão) */
  summary: z.string().max(900),
  findings: z.array(QualityFindingSchema).max(MAX_QUALITY_FINDINGS),
  evaluatedAt: z.string().datetime(),
  basis: z.object({
    text: z.boolean(),
    /** cenas cujo vídeo foi avaliado (quadros + métricas) */
    video: z.array(z.string().max(64)).max(200),
    framesPerVideo: z.number().int().min(0).max(20),
    /** cenas com vídeo que ficaram fora (limite por execução); notas de vídeo valem só para as avaliadas */
    skippedVideo: z.array(z.string().max(64)).max(200).default([]),
    /** true quando as notas vieram de validadores determinísticos (modo de demonstração), sem modelo */
    simulated: z.boolean().default(false),
  }),
  meta: z
    .object({
      provider: z.string().max(40),
      model: z.string().max(120),
      instructionsVersion: z.string().max(80),
      costUsd: z.number().nullable().optional(),
      latencyMs: z.number().int().min(0),
    })
    .optional(),
});
export type QualityScorecard = z.infer<typeof QualityScorecardSchema>;

/** Média (1–5) das dimensões avaliadas; null quando nenhuma foi. */
export function averageScore(scores: Partial<Record<QualityDimension, number | null | undefined>>): number | null {
  const vals = QUALITY_DIMENSIONS.map((d) => scores[d]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return Math.min(5, Math.max(1, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)));
}

/** Avaliação desatualizada: o rascunho mudou desde a avaliação. */
export function scorecardIsStale(scorecard: Pick<QualityScorecard, 'revision'> | null | undefined, draftRevision: number): boolean {
  return !!scorecard && scorecard.revision !== draftRevision;
}

export interface CourseQualityAggregate {
  /** aulas com avaliação */
  evaluated: number;
  lessons: number;
  /** média das notas gerais (1–5), arredondada a uma casa; null sem avaliações */
  overall: number | null;
  /** média por dimensão (uma casa) entre as aulas que a avaliaram; null sem dados */
  byDimension: Record<QualityDimension, number | null>;
  /** aulas desatualizadas (o rascunho mudou) */
  stale: number;
}

/** Agregado do curso para o painel "Avaliação". */
export function aggregateScorecards(items: Array<{ scorecard: QualityScorecard | null; stale: boolean }>): CourseQualityAggregate {
  const cards = items.map((i) => i.scorecard).filter((c): c is QualityScorecard => !!c);
  const avg1 = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
  const byDimension = Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, avg1(cards.map((c) => c.scores[d]).filter((v): v is number => typeof v === 'number'))])) as Record<QualityDimension, number | null>;
  return { evaluated: cards.length, lessons: items.length, overall: avg1(cards.map((c) => c.overall)), byDimension, stale: items.filter((i) => i.stale).length };
}

const SEVERITY_RANK: Record<QualitySeverity, number> = { alta: 0, média: 1, baixa: 2 };

/** Achados por severidade (alta primeiro), estável. */
export function sortFindings<T extends { severity: QualitySeverity }>(findings: readonly T[]): T[] {
  return findings.map((f, i) => ({ f, i })).sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i).map((x) => x.f);
}

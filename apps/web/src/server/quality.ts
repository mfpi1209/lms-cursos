import { QualityScorecardSchema, type QualityScorecard } from '@lms/ai/client';

/** Cartão guardado em JSONB (lesson_quality.scorecard) → contrato; um cartão fora do formato vira null, não derruba a rota. */
export function parseScorecard(raw: unknown): QualityScorecard | null {
  const p = QualityScorecardSchema.safeParse(raw);
  return p.success ? p.data : null;
}

export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'FORBIDDEN' | 'PUBLISH_BLOCKED' | 'ENGINE' | 'BUDGET_EXCEEDED';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const httpStatusFor: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  FORBIDDEN: 403,
  PUBLISH_BLOCKED: 422,
  ENGINE: 422,
  /** teto diário de gasto do workspace seria ultrapassado */
  BUDGET_EXCEEDED: 402,
};

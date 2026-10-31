import { z } from 'zod';

/**
 * Adapter de provedor de LLM com capacidades declaradas. Um adapter não implica
 * equivalência de capacidades entre fornecedores. Saída sempre estruturada e
 * validada por schema; nunca pedimos nem armazenamos raciocínio privado.
 */
export interface ProviderCapabilities {
  structuredOutput: boolean;
  tools: boolean;
  streaming: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** aceita imagens de entrada (`StructuredRequest.images`) */
  vision?: boolean;
}

export interface StructuredRequest<T> {
  /** identificador da tarefa (outline, lesson, repair…) para logs e fakes */
  task: string;
  instructionsVersion: string;
  system: string;
  input: string;
  schema: z.ZodType<T>;
  /** nome do schema para provedores que exigem (OpenAI) */
  schemaName?: string;
  maxOutputTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /**
   * Imagens de entrada (quadros de vídeo) para tarefas de visão, em base64.
   * Os adapters reais enviam junto com `input`; o fake ignora. Mantenha
   * poucas e pequenas (JPEG ≤ 512 px): entram no custo de tokens.
   */
  images?: ImageInput[];
}

export interface ImageInput {
  /** image/jpeg | image/png | image/webp | image/gif */
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
  /** rótulo curto (ex.: "quadro 2/5 · 35% · plano s2") que precede a imagem no prompt */
  label?: string;
}

export interface StructuredResult<T> {
  output: T;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
  /** custo estimado em USD quando a tabela de preços é conhecida */
  costUsd?: number;
  /** true quando a resposta veio do provedor de fallback */
  fallbackUsed?: boolean;
}

export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export class LlmError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: 'auth' | 'rate_limit' | 'server' | 'bad_request' | 'refusal' | 'parse' | 'network' | 'unknown',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
  /** erros que justificam tentar o provedor de fallback */
  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'server' || this.kind === 'network';
  }
}

export interface JobLimits {
  maxOutputTokens: number;
  maxMs: number;
  maxAttempts: number;
  maxCostUsd: number;
}

export const DEFAULT_LIMITS: JobLimits = { maxOutputTokens: 16000, maxMs: 10 * 60 * 1000, maxAttempts: 2, maxCostUsd: 5 };

/** Resposta inutilizável (fora do schema ou JSON inválido): motiva uma rodada de reparo. */
export function isUnusableOutput(e: unknown): boolean {
  return (e instanceof LlmError && e.kind === 'parse') || e instanceof z.core.$ZodError || e instanceof SyntaxError;
}

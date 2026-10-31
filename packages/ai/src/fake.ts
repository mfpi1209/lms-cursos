import { z } from 'zod';
import { LlmError, type LlmAdapter, type StructuredRequest, type StructuredResult } from './adapter';

/**
 * Adapter FAKE, explicitamente identificado, para testes. Devolve respostas
 * registradas por tarefa. Não é um backend de produção e nunca é selecionado
 * automaticamente quando há chaves reais.
 */
export class FakeLlmAdapter implements LlmAdapter {
  readonly provider = 'fake';
  readonly model = 'fake-deterministic';
  readonly capabilities = { structuredOutput: true, tools: true, streaming: false, maxInputTokens: 100_000, maxOutputTokens: 8_000, vision: true };
  readonly calls: Array<{ task: string; input: string; images?: number }> = [];
  constructor(private readonly responses: Record<string, unknown | ((req: StructuredRequest<unknown>) => unknown)> = {}) {}

  /** true quando há resposta registrada para a tarefa (o assistente usa o roteador determinístico quando não há) */
  has(task: string): boolean {
    return this.responses[task] !== undefined;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ task: req.task, input: req.input, ...(req.images?.length ? { images: req.images.length } : {}) });
    const raw = this.responses[req.task];
    if (raw === undefined) throw new Error(`FakeLlmAdapter: sem resposta registrada para a tarefa "${req.task}"`);
    const value = typeof raw === 'function' ? (raw as (r: StructuredRequest<unknown>) => unknown)(req as StructuredRequest<unknown>) : raw;
    let output: T;
    try {
      output = req.schema.parse(value);
    } catch (e) {
      // mesmo contrato dos adapters reais: resposta fora do schema = 'parse'
      if (e instanceof z.core.$ZodError) throw new LlmError(this.provider, 'parse', `Resposta não validou contra o schema: ${e.message.slice(0, 500)}`);
      throw e;
    }
    return { output, provider: this.provider, model: this.model, latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
  }
}

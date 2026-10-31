import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { LlmError, type LlmAdapter, type StructuredRequest, type StructuredResult } from './adapter';
import { estimateAiCostUsd } from './pricing';


export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * Adapter Anthropic (SDK oficial 1.x): saída estruturada via `messages.parse`
 * + `zodOutputFormat`; thinking adaptativo (padrão do modelo), profundidade via
 * `output_config.effort`. O prompt de sistema estável vai com cache_control.
 */
export class AnthropicAdapter implements LlmAdapter {
  readonly provider = 'anthropic';
  readonly capabilities = { structuredOutput: true, tools: true, streaming: true, maxInputTokens: 1_000_000, maxOutputTokens: 128_000, vision: true };
  private readonly client: Anthropic;
  constructor(apiKey: string, public readonly model: string = ANTHROPIC_DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  /** Texto e, se houver, os quadros de vídeo (base64) precedidos do rótulo. */
  private content(req: StructuredRequest<unknown>): string | ContentBlockParam[] {
    if (!req.images?.length) return req.input;
    return [
      { type: 'text', text: req.input },
      ...req.images.flatMap((img, i): ContentBlockParam[] => [
        { type: 'text', text: img.label ?? `imagem ${i + 1}` },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ]),
    ];
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now();
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: req.maxOutputTokens ?? 16000,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: this.content(req) }],
        output_config: { effort: req.effort ?? 'high', format: zodOutputFormat(req.schema) },
      });
      if (response.stop_reason === 'refusal') throw new LlmError(this.provider, 'refusal', `Pedido recusado pelo provedor (${response.stop_details?.category ?? 'sem categoria'})`);
      if (response.stop_reason === 'max_tokens') throw new LlmError(this.provider, 'parse', 'Resposta truncada (max_tokens); reduza o escopo da tarefa');
      const output = response.parsed_output;
      if (output === null || output === undefined) throw new LlmError(this.provider, 'parse', 'Resposta não validou contra o schema');
      const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheReadTokens: response.usage.cache_read_input_tokens ?? 0 };
      // custo ESTIMADO (tabela de `pricing.ts`, sobrescrevível por AI_PRICES_JSON); a Anthropic não inclui o cache em input_tokens
      const costUsd = estimateAiCostUsd(response.model || this.model, usage);
      return { output: output as T, provider: this.provider, model: response.model, latencyMs: Date.now() - started, usage, costUsd };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      // resposta fora do schema/JSON inválido: 'parse' (os laços de reparo pedem de novo)
      if (e instanceof z.core.$ZodError || e instanceof SyntaxError) throw new LlmError(this.provider, 'parse', `Resposta não validou contra o schema: ${e.message.slice(0, 500)}`);
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError(this.provider, 'auth', 'Chave da Anthropic inválida', e.status);
      if (e instanceof Anthropic.RateLimitError) throw new LlmError(this.provider, 'rate_limit', 'Limite de requisições da Anthropic', e.status);
      if (e instanceof Anthropic.BadRequestError) throw new LlmError(this.provider, 'bad_request', e.message, e.status);
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError(this.provider, 'network', e.message);
      if (e instanceof Anthropic.APIError) throw new LlmError(this.provider, (e.status ?? 500) >= 500 ? 'server' : 'bad_request', e.message, e.status);
      // o helper de saída estruturada do SDK lança AnthropicError("Failed to parse structured output…")
      if (e instanceof Anthropic.AnthropicError && /failed to parse/i.test(e.message)) throw new LlmError(this.provider, 'parse', e.message.slice(0, 800));
      throw new LlmError(this.provider, 'unknown', String(e instanceof Error ? e.message : e));
    }
  }
}

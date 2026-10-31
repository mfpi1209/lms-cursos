import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { LlmError, type LlmAdapter, type StructuredRequest, type StructuredResult } from './adapter';
import { estimateAiCostUsd } from './pricing';

/**
 * Adapter OpenAI (SDK oficial 7.x): Responses API com `responses.parse` +
 * `zodTextFormat` (JSON Schema estrito). O modelo vem de OPENAI_MODEL — não
 * assumimos identificadores. Custo ESTIMADO pela tabela de preços (`pricing.ts`,
 * sobrescrevível por AI_PRICES_JSON); a fatura real da OpenAI é a referência.
 */
export class OpenAIAdapter implements LlmAdapter {
  readonly provider = 'openai';
  readonly capabilities = { structuredOutput: true, tools: true, streaming: true, maxInputTokens: 200_000, maxOutputTokens: 32_000, vision: true };
  private readonly client: OpenAI;
  constructor(apiKey: string, public readonly model: string) {
    if (!model) throw new Error('OPENAI_MODEL não definido');
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now();
    try {
      // imagens (quadros de vídeo): mensagem única com o texto e, depois, cada quadro precedido do rótulo; detail low (barato: ~85 tokens por imagem)
      const input: string | ResponseInputItem[] = req.images?.length
        ? [{
            role: 'user',
            content: [
              { type: 'input_text', text: req.input },
              ...req.images.flatMap((img, i): Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' }> => [
                { type: 'input_text', text: img.label ?? `imagem ${i + 1}` },
                { type: 'input_image', image_url: `data:${img.mime};base64,${img.base64}`, detail: 'low' },
              ]),
            ],
          }]
        : req.input;
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: req.system,
        input,
        max_output_tokens: req.maxOutputTokens ?? 16000,
        text: { format: zodTextFormat(req.schema, req.schemaName ?? 'output') },
      });
      const output = response.output_parsed;
      if (output === null || output === undefined) throw new LlmError(this.provider, 'parse', 'Resposta não validou contra o schema');
      const cached = response.usage?.input_tokens_details?.cached_tokens;
      const usage = response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, ...(typeof cached === 'number' ? { cacheReadTokens: cached } : {}) } : undefined;
      // na OpenAI os tokens em cache já fazem parte de input_tokens
      const costUsd = usage ? estimateAiCostUsd(response.model || this.model, usage, { cacheIncludedInInput: true }) : undefined;
      return { output: output as T, provider: this.provider, model: response.model, latencyMs: Date.now() - started, usage, costUsd };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      // resposta fora do schema/JSON inválido: 'parse' (os laços de reparo pedem de novo)
      if (e instanceof z.core.$ZodError || e instanceof SyntaxError) throw new LlmError(this.provider, 'parse', `Resposta não validou contra o schema: ${e.message.slice(0, 500)}`);
      if (e instanceof OpenAI.AuthenticationError) throw new LlmError(this.provider, 'auth', 'Chave da OpenAI inválida', e.status);
      if (e instanceof OpenAI.RateLimitError) throw new LlmError(this.provider, 'rate_limit', 'Limite de requisições da OpenAI', e.status);
      if (e instanceof OpenAI.BadRequestError) throw new LlmError(this.provider, 'bad_request', e.message, e.status);
      if (e instanceof OpenAI.APIConnectionError) throw new LlmError(this.provider, 'network', e.message);
      if (e instanceof OpenAI.APIError) throw new LlmError(this.provider, (e.status ?? 500) >= 500 ? 'server' : 'bad_request', e.message, e.status);
      throw new LlmError(this.provider, 'unknown', String(e instanceof Error ? e.message : e));
    }
  }
}

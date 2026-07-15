import type { GenerateInput, GenerateResult, LLMProvider } from "./types";
import { ProviderError } from "./types";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export function anthropicProvider(apiKey: string, baseUrl = "https://api.anthropic.com"): LLMProvider {
  return {
    kind: "anthropic",
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      };
      if (input.temperature !== undefined) body.temperature = input.temperature;
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AnthropicResponse;
      if (!res.ok) {
        throw new ProviderError("anthropic", res.status, data.error?.message ?? JSON.stringify(data).slice(0, 300));
      }
      const text = data.content?.find((b) => b.type === "text")?.text;
      if (!text) {
        throw new ProviderError("anthropic", null, `no text in response (stop_reason: ${data.stop_reason})`);
      }
      return {
        text,
        tokensIn: data.usage?.input_tokens ?? 0,
        tokensOut: data.usage?.output_tokens ?? 0,
      };
    },
  };
}

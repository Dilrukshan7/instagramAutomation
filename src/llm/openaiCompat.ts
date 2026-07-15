import type { GenerateInput, GenerateResult, LLMProvider } from "./types";
import { ProviderError } from "./types";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

/**
 * One adapter for every OpenAI-compatible chat-completions API:
 * OpenAI, xAI Grok, Groq, OpenRouter, and local models (Ollama / LM Studio
 * behind a tunnel) via a custom baseUrl.
 */
export function openAiCompatProvider(kindLabel: string, apiKey: string, baseUrl: string): LLMProvider {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    kind: kindLabel,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      };
      if (input.temperature !== undefined) body.temperature = input.temperature;
      if (input.json) body.response_format = { type: "json_object" };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
      let data: ChatResponse;
      try {
        data = (await res.json()) as ChatResponse;
      } catch {
        throw new ProviderError(kindLabel, res.status, "non-JSON response from provider");
      }
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : data.error?.message;
        // Some providers reject response_format — retry once without it.
        if (input.json && res.status === 400 && /response_format/i.test(msg ?? "")) {
          return this.generate({ ...input, json: false });
        }
        throw new ProviderError(kindLabel, res.status, msg ?? JSON.stringify(data).slice(0, 300));
      }
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError(kindLabel, null, "empty completion");
      return {
        text,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
      };
    },
  };
}

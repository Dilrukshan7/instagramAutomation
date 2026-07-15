import type { GenerateInput, GenerateResult, LLMProvider } from "./types";
import { ProviderError } from "./types";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export function geminiProvider(apiKey: string, baseUrl = "https://generativelanguage.googleapis.com"): LLMProvider {
  return {
    kind: "gemini",
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens,
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          ...(input.json ? { responseMimeType: "application/json" } : {}),
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as GeminiResponse;
      if (!res.ok) {
        throw new ProviderError("gemini", res.status, data.error?.message ?? JSON.stringify(data).slice(0, 300));
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (!text) throw new ProviderError("gemini", null, "empty candidates in response");
      return {
        text,
        tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}

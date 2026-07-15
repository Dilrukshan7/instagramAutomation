export interface GenerateInput {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  /** Ask the model for a JSON object response where the API supports it. */
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface LLMProvider {
  kind: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number | null,
    message: string,
  ) {
    super(`[${provider}${status ? ` ${status}` : ""}] ${message}`);
  }
}

/**
 * Models often wrap JSON in code fences or prose despite instructions.
 * Extract the first top-level JSON object tolerantly.
 */
export function extractJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
}

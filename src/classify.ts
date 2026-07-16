import type { Automation } from "./db";
import { recordClassification } from "./db";
import {
  buildProvider,
  KIND_PRESETS,
  normalizeIntent,
  normalizeSentiment,
  resolveProviderRow,
} from "./llm/registry";
import { anthropicProvider } from "./llm/anthropic";
import type { LLMProvider } from "./llm/types";
import { extractJson } from "./llm/types";
import type { Env } from "./types";

const CLASSIFY_SYSTEM = `Classify an Instagram comment. Respond with ONLY a JSON object (no code fences, no prose):
{"intent": "...", "sentiment": "..."}
- intent: one of question | interested | praise | complaint | spam | other
- sentiment: one of positive | neutral | negative`;

/**
 * Standalone classification for the keyword/template reply path (where no AI
 * reply call runs, so intent wouldn't otherwise be captured). Gated by
 * `config:classify_enabled` (default off) so it never adds cost unless asked.
 * Best-effort: any failure is swallowed so the reply path is never affected.
 */
export async function classifyComment(
  env: Env,
  accountId: number,
  automation: Automation | null,
  comment: string,
): Promise<void> {
  if ((await env.STATE.get("config:classify_enabled")) !== "true") return;

  let provider: LLMProvider | null = null;
  let model = "";
  const row = await resolveProviderRow(env, automation);
  if (row) {
    provider = buildProvider(row);
    model = row.default_model ?? KIND_PRESETS[row.kind]?.model ?? "";
  } else {
    const key = (await env.STATE.get("config:anthropic_key")) ?? env.ANTHROPIC_API_KEY;
    if (key && key.trim() !== "") {
      provider = anthropicProvider(key.trim());
      model = "claude-haiku-4-5";
    }
  }
  if (!provider || !model) return;

  try {
    const result = await provider.generate({
      system: CLASSIFY_SYSTEM,
      user: `Comment:\n${comment}`,
      model,
      maxTokens: 40,
      json: true,
    });
    const parsed = extractJson<{ intent?: string; sentiment?: string }>(result.text);
    await recordClassification(
      env,
      accountId,
      automation?.id ?? null,
      normalizeIntent(parsed.intent),
      normalizeSentiment(parsed.sentiment),
    );
  } catch {
    // best-effort; classification must never break the reply path
  }
}

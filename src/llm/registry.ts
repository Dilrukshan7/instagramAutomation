import type { Automation } from "../db";
import { getActivePrompt, recordAiUsage, recordClassification } from "../db";
import type { Env, ReplyDecision } from "../types";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openAiCompatProvider } from "./openaiCompat";
import type { GenerateResult, LLMProvider } from "./types";
import { extractJson } from "./types";

export interface ProviderRow {
  id: number;
  account_id: number;
  kind: string;
  label: string;
  base_url: string | null;
  api_key: string | null;
  default_model: string | null;
  enabled: number;
  last_test_at: string | null;
  last_test_ok: number | null;
}

/** Presets: base URL + suggested model per provider kind. All editable in the UI. */
export const KIND_PRESETS: Record<string, { baseUrl: string | null; model: string }> = {
  anthropic: { baseUrl: null, model: "claude-haiku-4-5" },
  gemini: { baseUrl: null, model: "gemini-2.0-flash" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-3-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  custom: { baseUrl: "http://localhost:11434/v1", model: "llama3" },
};

export const INTENTS = ["question", "interested", "praise", "complaint", "spam", "other"];
export const SENTIMENTS = ["positive", "neutral", "negative"];

export function normalizeIntent(v: string | undefined): string {
  const s = (v ?? "").toLowerCase().trim();
  return INTENTS.includes(s) ? s : "other";
}

export function normalizeSentiment(v: string | undefined): string {
  const s = (v ?? "").toLowerCase().trim();
  return SENTIMENTS.includes(s) ? s : "neutral";
}

export function buildProvider(row: ProviderRow): LLMProvider {
  const key = row.api_key ?? "";
  switch (row.kind) {
    case "anthropic":
      return anthropicProvider(key);
    case "gemini":
      return geminiProvider(key);
    default: {
      const base = row.base_url ?? KIND_PRESETS[row.kind]?.baseUrl;
      if (!base) throw new Error(`provider ${row.label}: missing base URL`);
      return openAiCompatProvider(row.kind, key, base);
    }
  }
}

export async function getProviderRow(env: Env, id: number): Promise<ProviderRow | null> {
  return env.DB.prepare("SELECT * FROM llm_providers WHERE id = ?").bind(id).first<ProviderRow>();
}

/** Resolve which provider to use: per-post choice → account default → none. */
export async function resolveProviderRow(env: Env, automation: Automation | null): Promise<ProviderRow | null> {
  if (automation?.provider_id) {
    const row = await getProviderRow(env, automation.provider_id);
    if (row && row.enabled === 1) return row;
  }
  const defaultId = await env.STATE.get("config:default_provider_id");
  if (defaultId) {
    const row = await getProviderRow(env, parseInt(defaultId, 10));
    if (row && row.enabled === 1) return row;
  }
  return null;
}

// Editable guidance (tone/style). The DB-backed active prompt overrides THIS
// part; the JSON contract below is always appended so a custom prompt can never
// break parsing.
export const DEFAULT_REPLY_GUIDANCE = `You write replies for an Instagram account owner responding to comments on their posts.
- public_reply: short public reply to the comment (1-2 sentences, friendly, at most one emoji)
- dm_message: private DM to the commenter (2-3 sentences, warm and personal, invite them to reply)
Rules: never promise anything specific (prices, dates, availability) unless it appears in the caption.
Never ask for personal information. Match the language of the comment. Keep it natural, not salesy.`;

// Fixed output contract — always enforced regardless of the editable guidance.
const REPLY_JSON_CONTRACT = `Respond with ONLY a JSON object (no code fences, no prose):
{"public_reply": "...", "dm_message": "...", "intent": "...", "sentiment": "..."}
- intent: one of question | interested | praise | complaint | spam | other
- sentiment: one of positive | neutral | negative`;

/** Assemble the system prompt: active/default guidance + fixed JSON contract + per-post note. */
async function buildSystemPrompt(env: Env, accountId: number, automation: Automation | null): Promise<string> {
  const active = await getActivePrompt(env, accountId);
  const guidance = active?.content?.trim() || DEFAULT_REPLY_GUIDANCE;
  let system = `${guidance}\n\n${REPLY_JSON_CONTRACT}`;
  if (automation?.system_prompt) {
    system += `\n\nAdditional instructions for this post:\n${automation.system_prompt}`;
  }
  return system;
}

/**
 * Generate an AI reply using the configured provider chain.
 * Returns null when AI is off or no provider/key is available (caller falls
 * back to templates). Throws on provider errors (caller also falls back).
 */
export async function generateViaLLM(
  env: Env,
  accountId: number,
  automation: Automation | null,
  comment: string,
  caption?: string,
): Promise<ReplyDecision | null> {
  if ((await env.STATE.get("config:ai_enabled")) === "false") return null;

  let provider: LLMProvider | null = null;
  let model = "";
  let providerName = "";
  const row = await resolveProviderRow(env, automation);
  if (row) {
    provider = buildProvider(row);
    model = automation?.model ?? row.default_model ?? KIND_PRESETS[row.kind]?.model ?? "";
    providerName = row.label;
  } else {
    // Legacy fallback: the Anthropic key from the Settings tab (KV) or wrangler secret.
    const kvKey = await env.STATE.get("config:anthropic_key");
    const key = kvKey ?? env.ANTHROPIC_API_KEY;
    if (key && key.trim() !== "") {
      provider = anthropicProvider(key.trim());
      model = "claude-haiku-4-5";
      providerName = "anthropic (legacy key)";
    }
  }
  if (!provider || !model) return null;

  const system = await buildSystemPrompt(env, accountId, automation);

  const result = await provider.generate({
    system,
    user: `Post caption:\n${caption ?? "(unavailable)"}\n\nComment:\n${comment}`,
    model,
    maxTokens: automation?.max_tokens ?? 400,
    temperature: automation?.temperature ?? undefined,
    json: true,
  });
  await recordAiUsage(env, accountId, automation?.id ?? null, providerName, result.tokensIn, result.tokensOut);

  const parsed = extractJson<{ public_reply: string; dm_message: string; intent?: string; sentiment?: string }>(
    result.text,
  );
  if (!parsed.public_reply || !parsed.dm_message) {
    throw new Error("model JSON missing public_reply/dm_message");
  }
  // Classification comes free with the reply call — record it when present.
  if (parsed.intent || parsed.sentiment) {
    await recordClassification(
      env,
      accountId,
      automation?.id ?? null,
      normalizeIntent(parsed.intent),
      normalizeSentiment(parsed.sentiment),
    );
  }
  return { publicReply: parsed.public_reply, dmMessage: parsed.dm_message, source: "ai" };
}

/** Small live call used by the dashboard's Test button. */
export async function testProviderRow(env: Env, row: ProviderRow): Promise<{ ok: boolean; detail: string }> {
  try {
    const provider = buildProvider(row);
    const model = row.default_model ?? KIND_PRESETS[row.kind]?.model ?? "";
    const res: GenerateResult = await provider.generate({
      system: "Reply with exactly: OK",
      user: "Say OK",
      model,
      maxTokens: 20,
    });
    const ok = res.text.trim().length > 0;
    await env.DB.prepare("UPDATE llm_providers SET last_test_at = datetime('now'), last_test_ok = ? WHERE id = ?")
      .bind(ok ? 1 : 0, row.id)
      .run();
    return { ok, detail: ok ? `responded: ${res.text.trim().slice(0, 40)}` : "empty response" };
  } catch (err) {
    await env.DB.prepare("UPDATE llm_providers SET last_test_at = datetime('now'), last_test_ok = 0 WHERE id = ?")
      .bind(row.id)
      .run();
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

import type { Env } from "./types";

export interface Automation {
  id: number;
  account_id: number;
  media_id: string | null;
  enabled: number;
  auto_reply_enabled: number;
  auto_dm_enabled: number;
  once_per_user: number;
  require_follow: number;
  provider_id: number | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  keyword_triggers: string | null;
  resource_message: string | null;
  nudge_message: string | null;
}

/** Ensures the single account row exists and returns its id (SaaS-ready shape). */
export async function getAccountId(env: Env): Promise<number> {
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE ig_user_id = ?")
    .bind(env.IG_USER_ID)
    .first<{ id: number }>();
  if (existing) return existing.id;
  const inserted = await env.DB.prepare(
    "INSERT INTO accounts (ig_user_id) VALUES (?) RETURNING id",
  )
    .bind(env.IG_USER_ID)
    .first<{ id: number }>();
  return inserted!.id;
}

export async function getAutomationForMedia(
  env: Env,
  accountId: number,
  mediaId: string,
): Promise<Automation | null> {
  return env.DB.prepare("SELECT * FROM automations WHERE account_id = ? AND media_id = ?")
    .bind(accountId, mediaId)
    .first<Automation>();
}

export async function upsertAutomation(
  env: Env,
  accountId: number,
  mediaId: string,
  fields: {
    enabled?: boolean;
    auto_reply_enabled?: boolean;
    auto_dm_enabled?: boolean;
    once_per_user?: boolean;
    provider_id?: number | null; // null clears back to the default provider
    require_follow?: boolean;
    resource_message?: string | null;
    nudge_message?: string | null;
  },
): Promise<void> {
  const existing = await getAutomationForMedia(env, accountId, mediaId);
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO automations (account_id, media_id, enabled, auto_reply_enabled, auto_dm_enabled, once_per_user, provider_id, require_follow, resource_message, nudge_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        accountId,
        mediaId,
        fields.enabled === true ? 1 : 0,
        fields.auto_reply_enabled === false ? 0 : 1,
        fields.auto_dm_enabled === false ? 0 : 1,
        fields.once_per_user === true ? 1 : 0,
        fields.provider_id ?? null,
        fields.require_follow === true ? 1 : 0,
        fields.resource_message ?? null,
        fields.nudge_message ?? null,
      )
      .run();
    return;
  }
  const merged = {
    enabled: fields.enabled ?? existing.enabled === 1,
    auto_reply_enabled: fields.auto_reply_enabled ?? existing.auto_reply_enabled === 1,
    auto_dm_enabled: fields.auto_dm_enabled ?? existing.auto_dm_enabled === 1,
    once_per_user: fields.once_per_user ?? existing.once_per_user === 1,
    provider_id: fields.provider_id === undefined ? existing.provider_id : fields.provider_id,
    require_follow: fields.require_follow ?? existing.require_follow === 1,
    resource_message: fields.resource_message === undefined ? existing.resource_message : fields.resource_message,
    nudge_message: fields.nudge_message === undefined ? existing.nudge_message : fields.nudge_message,
  };
  await env.DB.prepare(
    `UPDATE automations SET enabled = ?, auto_reply_enabled = ?, auto_dm_enabled = ?, once_per_user = ?, provider_id = ?, require_follow = ?, resource_message = ?, nudge_message = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      merged.enabled ? 1 : 0,
      merged.auto_reply_enabled ? 1 : 0,
      merged.auto_dm_enabled ? 1 : 0,
      merged.once_per_user ? 1 : 0,
      merged.provider_id,
      merged.require_follow ? 1 : 0,
      merged.resource_message,
      merged.nudge_message,
      existing.id,
    )
    .run();
}

export async function listAutomations(env: Env, accountId: number): Promise<Automation[]> {
  const res = await env.DB.prepare("SELECT * FROM automations WHERE account_id = ?").bind(accountId).all<Automation>();
  return res.results;
}

/** Ensures an automation row exists for this media (enabled) and returns its id. */
export async function getOrCreateAutomationId(env: Env, accountId: number, mediaId: string): Promise<number> {
  const existing = await getAutomationForMedia(env, accountId, mediaId);
  if (existing) return existing.id;
  const row = await env.DB.prepare(
    "INSERT INTO automations (account_id, media_id, enabled) VALUES (?, ?, 1) RETURNING id",
  )
    .bind(accountId, mediaId)
    .first<{ id: number }>();
  return row!.id;
}

export interface MessageStep {
  id: number;
  automation_id: number;
  sort_order: number;
  type: string;
  content_variations: string; // JSON array of strings
  delay_seconds: number;
}

export async function getSteps(env: Env, automationId: number): Promise<MessageStep[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM message_steps WHERE automation_id = ? ORDER BY sort_order",
  )
    .bind(automationId)
    .all<MessageStep>();
  return res.results;
}

/** Steps for a media id (empty if no automation / no steps). */
export async function getStepsForMedia(env: Env, accountId: number, mediaId: string): Promise<MessageStep[]> {
  const automation = await getAutomationForMedia(env, accountId, mediaId);
  if (!automation) return [];
  return getSteps(env, automation.id);
}

/** Full-replace the sequence for an automation. */
export async function replaceSteps(
  env: Env,
  automationId: number,
  steps: Array<{ type: string; content_variations: string[]; delay_seconds: number }>,
): Promise<void> {
  await env.DB.prepare("DELETE FROM message_steps WHERE automation_id = ?").bind(automationId).run();
  let order = 0;
  for (const step of steps) {
    await env.DB.prepare(
      `INSERT INTO message_steps (automation_id, sort_order, type, content_variations, delay_seconds)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(automationId, order++, step.type, JSON.stringify(step.content_variations), step.delay_seconds)
      .run();
  }
}

export async function hasPriorSend(
  env: Env,
  accountId: number,
  igUserId: string,
  mediaId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS x FROM send_logs WHERE account_id = ? AND ig_user_id = ? AND media_id = ? AND status = 'sent' LIMIT 1",
  )
    .bind(accountId, igUserId, mediaId)
    .first();
  return row !== null;
}

export async function recordSend(
  env: Env,
  accountId: number,
  entry: {
    igUserId: string;
    mediaId?: string;
    automationId?: number | null;
    messageType: "public_reply" | "dm";
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO send_logs (account_id, ig_user_id, media_id, automation_id, message_type, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      accountId,
      entry.igUserId,
      entry.mediaId ?? null,
      entry.automationId ?? null,
      entry.messageType,
      entry.ok ? "sent" : "failed",
      entry.error ?? null,
    )
    .run();
}

export async function recordAiUsage(
  env: Env,
  accountId: number,
  automationId: number | null,
  provider: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO analytics_events (account_id, automation_id, event_type, provider, tokens_in, tokens_out)
     VALUES (?, ?, 'ai_generation', ?, ?, ?)`,
  )
    .bind(accountId, automationId, provider, tokensIn, tokensOut)
    .run();
}

export async function recordEvent(
  env: Env,
  accountId: number,
  eventType: string,
  automationId?: number | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO analytics_events (account_id, automation_id, event_type) VALUES (?, ?, ?)",
  )
    .bind(accountId, automationId ?? null, eventType)
    .run();
}

/** Record a classified comment (intent + sentiment) for the analytics dashboard. */
export async function recordClassification(
  env: Env,
  accountId: number,
  automationId: number | null,
  intent: string,
  sentiment: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO analytics_events (account_id, automation_id, event_type, intent, sentiment) VALUES (?, ?, 'comment_classified', ?, ?)",
  )
    .bind(accountId, automationId, intent, sentiment)
    .run();
}

// ---------- Prompt versioning (Phase 5) ----------

export interface PromptVersion {
  id: number;
  account_id: number;
  scope: string;
  automation_id: number | null;
  content: string;
  version: number;
  label: string | null;
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

/** The active global system prompt, or null if none saved (caller uses the built-in default). */
export async function getActivePrompt(env: Env, accountId: number): Promise<PromptVersion | null> {
  return env.DB.prepare(
    "SELECT * FROM prompts WHERE account_id = ? AND scope = 'global' AND is_active = 1 ORDER BY version DESC LIMIT 1",
  )
    .bind(accountId)
    .first<PromptVersion>();
}

/** All global prompt versions, newest first. */
export async function listPrompts(env: Env, accountId: number): Promise<PromptVersion[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM prompts WHERE account_id = ? AND scope = 'global' ORDER BY version DESC",
  )
    .bind(accountId)
    .all<PromptVersion>();
  return res.results;
}

/** Save a new global prompt version and make it active (append-only history). */
export async function savePromptVersion(
  env: Env,
  accountId: number,
  content: string,
  label: string | null,
): Promise<number> {
  const max = await env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) AS v FROM prompts WHERE account_id = ? AND scope = 'global'",
  )
    .bind(accountId)
    .first<{ v: number }>();
  const nextVersion = (max?.v ?? 0) + 1;
  await env.DB.prepare("UPDATE prompts SET is_active = 0 WHERE account_id = ? AND scope = 'global'")
    .bind(accountId)
    .run();
  const row = await env.DB.prepare(
    `INSERT INTO prompts (account_id, scope, content, version, label, is_active, updated_at)
     VALUES (?, 'global', ?, ?, ?, 1, datetime('now')) RETURNING id`,
  )
    .bind(accountId, content, nextVersion, label)
    .first<{ id: number }>();
  return row!.id;
}

/** Roll back to an existing version by making it the active one. */
export async function activatePrompt(env: Env, accountId: number, id: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM prompts WHERE id = ? AND account_id = ? AND scope = 'global'",
  )
    .bind(id, accountId)
    .first();
  if (!row) return false;
  await env.DB.prepare("UPDATE prompts SET is_active = 0 WHERE account_id = ? AND scope = 'global'")
    .bind(accountId)
    .run();
  await env.DB.prepare("UPDATE prompts SET is_active = 1, updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
  return true;
}

// ---------- Analytics aggregation (Phase 5) ----------

export interface AnalyticsSummary {
  funnel: Record<string, number>;
  intents: Array<{ intent: string; count: number }>;
  sentiments: Array<{ sentiment: string; count: number }>;
  daily: Array<{ day: string; comments: number; replies: number; dms: number }>;
  windowDays: number;
}

/** Aggregate analytics_events over a trailing window for the dashboard. */
export async function getAnalytics(env: Env, accountId: number, windowDays: number): Promise<AnalyticsSummary> {
  const since = `-${windowDays} days`;

  const funnelRes = await env.DB.prepare(
    `SELECT event_type, COUNT(*) AS n FROM analytics_events
     WHERE account_id = ? AND ts > datetime('now', ?) GROUP BY event_type`,
  )
    .bind(accountId, since)
    .all<{ event_type: string; n: number }>();
  const funnel: Record<string, number> = {};
  for (const r of funnelRes.results) funnel[r.event_type] = r.n;

  const intentRes = await env.DB.prepare(
    `SELECT intent, COUNT(*) AS n FROM analytics_events
     WHERE account_id = ? AND intent IS NOT NULL AND ts > datetime('now', ?)
     GROUP BY intent ORDER BY n DESC`,
  )
    .bind(accountId, since)
    .all<{ intent: string; n: number }>();

  const sentimentRes = await env.DB.prepare(
    `SELECT sentiment, COUNT(*) AS n FROM analytics_events
     WHERE account_id = ? AND sentiment IS NOT NULL AND ts > datetime('now', ?)
     GROUP BY sentiment ORDER BY n DESC`,
  )
    .bind(accountId, since)
    .all<{ sentiment: string; n: number }>();

  const dailyRes = await env.DB.prepare(
    `SELECT substr(ts, 1, 10) AS day,
            SUM(event_type = 'comment_received') AS comments,
            SUM(event_type = 'reply_sent') AS replies,
            SUM(event_type = 'dm_sent') AS dms
     FROM analytics_events
     WHERE account_id = ? AND ts > datetime('now', ?)
     GROUP BY day ORDER BY day DESC LIMIT 30`,
  )
    .bind(accountId, since)
    .all<{ day: string; comments: number; replies: number; dms: number }>();

  return {
    funnel,
    intents: intentRes.results.map((r) => ({ intent: r.intent, count: r.n })),
    sentiments: sentimentRes.results.map((r) => ({ sentiment: r.sentiment, count: r.n })),
    daily: dailyRes.results.map((r) => ({
      day: r.day,
      comments: r.comments ?? 0,
      replies: r.replies ?? 0,
      dms: r.dms ?? 0,
    })),
    windowDays,
  };
}

export interface PendingDelivery {
  id: number;
  account_id: number;
  ig_user_id: string;
  comment_id: string | null;
  automation_id: number | null;
  status: string;
  resource_text: string | null;
  nudge_count: number;
  created_at: string;
  delivered_at: string | null;
}

/** One active waiting_follow row per (user, automation); replaces any existing. */
export async function createPending(
  env: Env,
  accountId: number,
  igUserId: string,
  automationId: number,
  commentId: string,
  resourceText: string,
): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM pending_deliveries WHERE account_id = ? AND ig_user_id = ? AND automation_id = ? AND status = 'waiting_follow'",
  )
    .bind(accountId, igUserId, automationId)
    .run();
  await env.DB.prepare(
    `INSERT INTO pending_deliveries (account_id, ig_user_id, comment_id, automation_id, status, resource_text, nudge_count)
     VALUES (?, ?, ?, ?, 'waiting_follow', ?, 1)`,
  )
    .bind(accountId, igUserId, commentId, automationId, resourceText)
    .run();
}

export async function findWaitingByUser(
  env: Env,
  accountId: number,
  igUserId: string,
): Promise<PendingDelivery | null> {
  return env.DB.prepare(
    "SELECT * FROM pending_deliveries WHERE account_id = ? AND ig_user_id = ? AND status = 'waiting_follow' ORDER BY id DESC LIMIT 1",
  )
    .bind(accountId, igUserId)
    .first<PendingDelivery>();
}

export async function markDelivered(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE pending_deliveries SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();
}

export async function bumpNudge(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE pending_deliveries SET nudge_count = nudge_count + 1, last_checked_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();
}

/** Oldest waiting rows for the background re-check (Option B). */
export async function waitingBatch(env: Env, limit: number): Promise<PendingDelivery[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM pending_deliveries WHERE status = 'waiting_follow' ORDER BY COALESCE(last_checked_at, created_at) LIMIT ?",
  )
    .bind(limit)
    .all<PendingDelivery>();
  return res.results;
}

export async function markChecked(env: Env, id: number): Promise<void> {
  await env.DB.prepare("UPDATE pending_deliveries SET last_checked_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

/** Expire waiting rows older than `days` (follow never confirmed in time). */
export async function expireOldPending(env: Env, days: number): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE pending_deliveries SET status = 'expired'
     WHERE status = 'waiting_follow' AND created_at < datetime('now', '-' || ? || ' days')`,
  )
    .bind(days)
    .run();
  return res.meta.changes ?? 0;
}

export async function listPending(env: Env, accountId: number, limit = 50): Promise<PendingDelivery[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM pending_deliveries WHERE account_id = ? ORDER BY id DESC LIMIT ?",
  )
    .bind(accountId, limit)
    .all<PendingDelivery>();
  return res.results;
}

// ---------- Knowledge base (RAG) ----------

export interface KbCollection {
  id: number;
  account_id: number;
  name: string;
  style_note: string | null;
  enabled: number;
  embed_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbChunk {
  id: number;
  collection_id: number;
  content: string;
  embedding: string; // JSON float array
}

/** Collections with their chunk counts, for the dashboard. */
export async function listCollections(
  env: Env,
  accountId: number,
): Promise<Array<KbCollection & { chunk_count: number }>> {
  const res = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM kb_chunks k WHERE k.collection_id = c.id) AS chunk_count
     FROM kb_collections c WHERE c.account_id = ? ORDER BY c.id DESC`,
  )
    .bind(accountId)
    .all<KbCollection & { chunk_count: number }>();
  return res.results;
}

export async function getCollection(env: Env, accountId: number, id: number): Promise<KbCollection | null> {
  return env.DB.prepare("SELECT * FROM kb_collections WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<KbCollection>();
}

export async function createCollection(
  env: Env,
  accountId: number,
  name: string,
  styleNote: string | null,
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO kb_collections (account_id, name, style_note) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(accountId, name, styleNote)
    .first<{ id: number }>();
  return row!.id;
}

export async function updateCollectionMeta(
  env: Env,
  accountId: number,
  id: number,
  fields: { name?: string; styleNote?: string | null; enabled?: boolean },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE kb_collections SET
       name = COALESCE(?, name),
       style_note = CASE WHEN ? = 1 THEN ? ELSE style_note END,
       enabled = COALESCE(?, enabled),
       updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`,
  )
    .bind(
      fields.name ?? null,
      fields.styleNote !== undefined ? 1 : 0,
      fields.styleNote ?? null,
      fields.enabled === undefined ? null : fields.enabled ? 1 : 0,
      id,
      accountId,
    )
    .run();
}

export async function deleteCollection(env: Env, accountId: number, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM kb_chunks WHERE collection_id = ? AND account_id = ?").bind(id, accountId).run();
  await env.DB.prepare("DELETE FROM kb_collections WHERE id = ? AND account_id = ?").bind(id, accountId).run();
}

/** Full-replace a collection's chunks with freshly embedded ones. */
export async function replaceChunks(
  env: Env,
  accountId: number,
  collectionId: number,
  chunks: Array<{ content: string; embedding: number[] }>,
  embedModel: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM kb_chunks WHERE collection_id = ? AND account_id = ?")
    .bind(collectionId, accountId)
    .run();
  for (const ch of chunks) {
    await env.DB.prepare(
      "INSERT INTO kb_chunks (account_id, collection_id, content, embedding) VALUES (?, ?, ?, ?)",
    )
      .bind(accountId, collectionId, ch.content, JSON.stringify(ch.embedding))
      .run();
  }
  await env.DB.prepare(
    "UPDATE kb_collections SET embed_model = ?, updated_at = datetime('now') WHERE id = ? AND account_id = ?",
  )
    .bind(embedModel, collectionId, accountId)
    .run();
}

/** All chunks from enabled collections whose embed_model matches the current one. */
export async function getEnabledChunks(
  env: Env,
  accountId: number,
  embedModel: string,
): Promise<Array<KbChunk & { style_note: string | null }>> {
  const res = await env.DB.prepare(
    `SELECT k.id, k.collection_id, k.content, k.embedding, c.style_note
     FROM kb_chunks k JOIN kb_collections c ON c.id = k.collection_id
     WHERE k.account_id = ? AND c.enabled = 1 AND c.embed_model = ?`,
  )
    .bind(accountId, embedModel)
    .all<KbChunk & { style_note: string | null }>();
  return res.results;
}

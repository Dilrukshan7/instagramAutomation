import type { Env, LogEntry } from "./types";

const LOG_TTL_SECONDS = 30 * 24 * 3600;

/** Append an activity-log entry (KV, 30-day TTL). Shown in the dashboard log. */
export async function writeLog(env: Env, entry: LogEntry): Promise<void> {
  const key = `log:${entry.ts}:${entry.commentId}`;
  await env.STATE.put(key, JSON.stringify(entry), { expirationTtl: LOG_TTL_SECONDS });
}

import { recordEvent, recordSend } from "./db";
import type { MessageStep } from "./db";
import { GraphError, replyToComment, sendPrivateReply } from "./graph";
import type { CommentWebhookValue, Env } from "./types";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = 45;

/** Message-sending job. follow_check / resource step types are Phase 4. */
export interface JobPayload {
  kind: "public_reply" | "dm";
  accountId: number;
  automationId: number | null;
  commentId: string;
  igUserId: string;
  mediaId?: string;
  text: string;
}

interface JobRow {
  id: number;
  payload: string;
  attempts: number;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function substitute(template: string, comment: CommentWebhookValue): string {
  return template
    .replace(/\{username\}/g, comment.from?.username ?? "there")
    .replace(/\{comment\}/g, comment.text ?? "");
}

/**
 * Turn a post's message sequence into scheduled jobs. Each step is spaced by
 * its configured delay plus 2-8s of human-like jitter, so sends are never
 * bursty and always ordered. Returns the number of jobs enqueued.
 */
export async function enqueueSequence(
  env: Env,
  accountId: number,
  automationId: number,
  steps: MessageStep[],
  comment: CommentWebhookValue,
): Promise<number> {
  const igUserId = comment.from?.id ?? "unknown";
  let elapsed = 0;
  let count = 0;
  for (const step of steps) {
    if (step.type !== "public_reply" && step.type !== "dm") continue; // Phase 4 types
    let variations: string[] = [];
    try {
      variations = JSON.parse(step.content_variations) as string[];
    } catch {
      variations = [];
    }
    variations = variations.filter((v) => typeof v === "string" && v.trim() !== "");
    if (variations.length === 0) continue;

    elapsed += Math.max(step.delay_seconds, 0) + 2 + Math.floor(Math.random() * 7); // +2..8s
    const payload: JobPayload = {
      kind: step.type,
      accountId,
      automationId,
      commentId: comment.id,
      igUserId,
      mediaId: comment.media?.id,
      text: substitute(pickRandom(variations), comment),
    };
    await env.DB.prepare(
      "INSERT INTO jobs (run_at, payload) VALUES (datetime('now', '+' || ? || ' seconds'), ?)",
    )
      .bind(elapsed, JSON.stringify(payload))
      .run();
    count++;
  }
  return count;
}

/** Poke the singleton scheduler DO so it (re)arms its alarm for due jobs. */
export async function wakeScheduler(env: Env): Promise<void> {
  const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName("main"));
  await stub.wake();
}

/**
 * Atomically claim up to `limit` due jobs (pending + run_at reached). The
 * single UPDATE...RETURNING flips them to 'running' so concurrent drainers
 * (DO alarm + cron backstop) can never double-execute the same job.
 */
export async function claimDueJobs(env: Env, limit: number): Promise<JobRow[]> {
  const res = await env.DB.prepare(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs WHERE status = 'pending' AND run_at <= datetime('now')
       ORDER BY run_at LIMIT ?
     )
     RETURNING id, payload, attempts`,
  )
    .bind(limit)
    .all<JobRow>();
  return res.results;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof GraphError) return err.status === 429 || err.status >= 500;
  return true; // network / unexpected → retry
}

/** Execute one claimed job and settle its row (done | pending-retry | failed). */
export async function runClaimedJob(env: Env, job: JobRow): Promise<void> {
  let payload: JobPayload;
  try {
    payload = JSON.parse(job.payload) as JobPayload;
  } catch {
    await env.DB.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").bind(job.id).run();
    return;
  }

  try {
    if (payload.kind === "public_reply") {
      await replyToComment(env, payload.commentId, payload.text);
      await recordEvent(env, payload.accountId, "reply_sent", payload.automationId);
    } else {
      await sendPrivateReply(env, payload.commentId, payload.text);
      await recordEvent(env, payload.accountId, "dm_sent", payload.automationId);
    }
    await recordSend(env, payload.accountId, {
      igUserId: payload.igUserId,
      mediaId: payload.mediaId,
      automationId: payload.automationId,
      messageType: payload.kind,
      ok: true,
    });
    await env.DB.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").bind(job.id).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isRetryable(err) && job.attempts < MAX_ATTEMPTS) {
      await env.DB.prepare(
        "UPDATE jobs SET status = 'pending', run_at = datetime('now', '+' || ? || ' seconds') WHERE id = ?",
      )
        .bind(RETRY_BACKOFF_SECONDS * job.attempts, job.id)
        .run();
      return;
    }
    await recordSend(env, payload.accountId, {
      igUserId: payload.igUserId,
      mediaId: payload.mediaId,
      automationId: payload.automationId,
      messageType: payload.kind,
      ok: false,
      error: msg,
    });
    await env.DB.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").bind(job.id).run();
  }
}

import {
  bumpNudge,
  createPending,
  findWaitingByUser,
  getAccountId,
  markChecked,
  markDelivered,
  recordEvent,
  recordSend,
  waitingBatch,
} from "./db";
import type { Automation } from "./db";
import { getUserFollowStatus, replyToComment, sendDirectMessage, sendPrivateReply } from "./graph";
import { writeLog } from "./log";
import { getFallback, pickRandom } from "./rules";
import type { CommentWebhookValue, Env, LogEntry, MessagingEvent } from "./types";

const SEEN_TTL_SECONDS = 7 * 24 * 3600;
const MAX_RENUDGES = 3;
const DEFAULT_NUDGE =
  "Thanks {username}! 🙌 Follow the page and reply here — I'll send it over automatically 🎁";
const DEFAULT_RENUDGE =
  "Almost there! Follow the page, then reply here and I'll send it right away 🙏";

function substitute(t: string, comment: CommentWebhookValue): string {
  return t.replace(/\{username\}/g, comment.from?.username ?? "there").replace(/\{comment\}/g, comment.text ?? "");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Comment path for follow-gated posts: send the public acknowledgment and the
 * single allowed proactive DM (the nudge), then park a pending delivery holding
 * the resolved resource text. Delivery happens later, when the user replies
 * (opening a messaging window) and their follow is confirmed.
 */
export async function handleFollowGate(
  env: Env,
  accountId: number,
  automation: Automation,
  comment: CommentWebhookValue,
  base: LogEntry,
  doReply: boolean,
  doDm: boolean,
): Promise<void> {
  const commenterId = comment.from?.id ?? "unknown";
  let detail = "";

  if (doReply) {
    const pub = substitute(pickRandom((await getFallback(env)).publicReplies), comment);
    try {
      await replyToComment(env, comment.id, pub);
      await recordEvent(env, accountId, "reply_sent", automation.id);
      await recordSend(env, accountId, { igUserId: commenterId, mediaId: comment.media?.id, automationId: automation.id, messageType: "public_reply", ok: true });
    } catch (e) {
      detail += `public reply failed: ${errMsg(e)}; `;
      await recordSend(env, accountId, { igUserId: commenterId, mediaId: comment.media?.id, automationId: automation.id, messageType: "public_reply", ok: false, error: errMsg(e) });
    }
  }

  let dmOk = false;
  if (doDm) {
    const nudge = substitute(automation.nudge_message?.trim() || DEFAULT_NUDGE, comment);
    try {
      await sendPrivateReply(env, comment.id, nudge);
      dmOk = true;
      await recordEvent(env, accountId, "dm_sent", automation.id);
      await recordSend(env, accountId, { igUserId: commenterId, mediaId: comment.media?.id, automationId: automation.id, messageType: "dm", ok: true });
    } catch (e) {
      detail += `nudge DM failed: ${errMsg(e)}`;
      await recordSend(env, accountId, { igUserId: commenterId, mediaId: comment.media?.id, automationId: automation.id, messageType: "dm", ok: false, error: errMsg(e) });
    }
  }

  const resourceText = substitute(automation.resource_message!.trim(), comment);
  await createPending(env, accountId, commenterId, automation.id, comment.id, resourceText);
  await recordEvent(env, accountId, "followgate_pending", automation.id);

  await writeLog(env, {
    ...base,
    publicReply: doReply ? "(follow-gate ack)" : "(off)",
    dmMessage: doDm ? "(follow nudge)" : "(off)",
    source: "follow-gate",
    status: dmOk ? "replied" : detail ? "error" : "skipped",
    detail: [detail, "waiting for follow"].filter(Boolean).join(" | "),
  });
}

/**
 * Inbound user reply. If the user has a pending follow-gated delivery, check
 * their follow status and either deliver the resource or re-nudge.
 *
 * Follow-status policy (asymmetric by design):
 *  - true  → deliver.
 *  - false → re-nudge (confirmed not following).
 *  - null  → the API couldn't determine it; since the user actively replied,
 *            we deliver rather than withhold from an engaged user, and log it
 *            so we can see whether this account returns real booleans.
 */
export async function processMessaging(env: Env, msg: MessagingEvent, entryId: string): Promise<void> {
  if (msg.message?.is_echo) return; // our own outbound message echoed back
  const sender = msg.sender?.id;
  if (!sender || sender === env.IG_USER_ID || sender === entryId) return;

  const mid = msg.message?.mid;
  if (mid) {
    if (await env.STATE.get(`seenmsg:${mid}`)) return;
    await env.STATE.put(`seenmsg:${mid}`, "1", { expirationTtl: SEEN_TTL_SECONDS });
  }

  const accountId = await getAccountId(env);
  const pending = await findWaitingByUser(env, accountId, sender);
  if (!pending) return; // not part of a funnel (human takeover is a later phase)

  const follows = await getUserFollowStatus(env, sender);
  await markChecked(env, pending.id);
  const ts = new Date().toISOString();

  if (follows === true || follows === null) {
    try {
      await sendDirectMessage(env, sender, pending.resource_text ?? "Here you go!");
      await markDelivered(env, pending.id);
      await recordEvent(env, accountId, "resource_delivered", pending.automation_id);
      await recordSend(env, accountId, { igUserId: sender, automationId: pending.automation_id, messageType: "dm", ok: true });
      await writeLog(env, {
        ts, commentId: pending.comment_id ?? sender, from: sender,
        source: "resource-delivered", status: "replied",
        detail: `delivered on reply (follow=${follows})`,
      });
    } catch (e) {
      await recordSend(env, accountId, { igUserId: sender, automationId: pending.automation_id, messageType: "dm", ok: false, error: errMsg(e) });
      await writeLog(env, { ts, commentId: pending.comment_id ?? sender, from: sender, source: "resource-delivered", status: "error", detail: errMsg(e) });
    }
    return;
  }

  // follows === false → confirmed not following: re-nudge (capped).
  if (pending.nudge_count < MAX_RENUDGES) {
    try {
      await sendDirectMessage(env, sender, DEFAULT_RENUDGE);
      await bumpNudge(env, pending.id);
    } catch {
      // window may be closed; leave pending for the background re-check
    }
  }
  await writeLog(env, {
    ts, commentId: pending.comment_id ?? sender, from: sender,
    source: "follow-gate", status: "skipped",
    detail: "user replied, not following yet",
  });
}

/**
 * Background re-check (Option B). Strict: delivers only on a confirmed follow
 * (no user-reply signal here). Runs from the minute cron, capped.
 */
export async function runPendingRecheck(env: Env, limit: number): Promise<void> {
  const rows = await waitingBatch(env, limit);
  for (const row of rows) {
    const follows = await getUserFollowStatus(env, row.ig_user_id);
    await markChecked(env, row.id);
    if (follows !== true) continue;
    try {
      await sendDirectMessage(env, row.ig_user_id, row.resource_text ?? "Here you go!");
      await markDelivered(env, row.id);
      await recordEvent(env, row.account_id, "resource_delivered", row.automation_id);
      await recordSend(env, row.account_id, { igUserId: row.ig_user_id, automationId: row.automation_id, messageType: "dm", ok: true });
    } catch {
      // window closed; will retry next pass or expire
    }
  }
}

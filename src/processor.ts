import { classifyComment } from "./classify";
import { getAccountId, getAutomationForMedia, getSteps, hasPriorSend, recordEvent, recordSend } from "./db";
import type { Automation } from "./db";
import { handleFollowGate, processMessaging } from "./followgate";
import { getMediaCaption, replyToComment, sendPrivateReply } from "./graph";
import { enqueueSequence, wakeScheduler } from "./jobs";
import { generateViaLLM } from "./llm/registry";
import { writeLog as log } from "./log";
import { getFallbackReply, isBlocked, matchRule } from "./rules";
import type { CommentWebhookValue, Env, LogEntry, ReplyDecision, WebhookPayload } from "./types";

const SEEN_TTL_SECONDS = 7 * 24 * 3600;
const MAX_REPLIES_PER_HOUR = 30;

export async function processWebhook(env: Env, payload: WebhookPayload): Promise<void> {
  if (payload.object !== "instagram") return;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      try {
        await processComment(env, change.value, entry.id);
      } catch (err) {
        await log(env, {
          ts: new Date().toISOString(),
          commentId: change.value?.id ?? "unknown",
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // Inbound user messages (replies to our DMs) drive the follow-gate funnel.
    for (const msg of entry.messaging ?? []) {
      try {
        await processMessaging(env, msg, entry.id);
      } catch {
        // best-effort; a bad message event shouldn't fail the batch
      }
    }
  }
}

async function processComment(env: Env, comment: CommentWebhookValue, entryId: string): Promise<void> {
  const now = new Date();
  const base: LogEntry = {
    ts: now.toISOString(),
    commentId: comment.id,
    mediaId: comment.media?.id,
    from: comment.from?.username ?? comment.from?.id,
    commentText: comment.text,
    status: "skipped",
  };

  // Kill switch — set KV key config:enabled to "false" to pause the bot.
  if ((await env.STATE.get("config:enabled")) === "false") {
    return log(env, { ...base, detail: "bot disabled" });
  }

  // Loop guard: never respond to our own comments (including the bot's own
  // public replies, which also arrive as webhook events). entry.id is the
  // account the webhook fired for, so from.id === entry.id means "own comment"
  // regardless of which ID scheme (IG user ID vs app-scoped) Meta uses.
  if (comment.from?.id === env.IG_USER_ID || comment.from?.id === entryId) return;

  if (!comment.text || !comment.text.trim()) {
    return log(env, { ...base, detail: "empty comment" });
  }

  // Dedupe — Meta may deliver the same webhook more than once.
  const seenKey = `seen:${comment.id}`;
  if (await env.STATE.get(seenKey)) return;
  await env.STATE.put(seenKey, "1", { expirationTtl: SEEN_TTL_SECONDS });

  if (await isBlocked(env, comment.text)) {
    return log(env, { ...base, detail: "blocklisted" });
  }

  // Per-post automation resolution. If a row exists for this media, it rules.
  // If none exists, the global mode decides: "all" (default — current global
  // behavior, nothing breaks) or "selected" (only explicitly enabled posts).
  const accountId = await getAccountId(env);
  const mediaId = comment.media?.id;
  let automation: Automation | null = null;
  let doReply = true;
  let doDm = true;
  if (mediaId) {
    automation = await getAutomationForMedia(env, accountId, mediaId);
    if (automation) {
      if (automation.enabled !== 1) {
        return log(env, { ...base, detail: "automation disabled for this post" });
      }
      doReply = automation.auto_reply_enabled === 1;
      doDm = automation.auto_dm_enabled === 1;
      if (!doReply && !doDm) {
        return log(env, { ...base, detail: "reply and DM both off for this post" });
      }
      if (automation.once_per_user === 1 && comment.from?.id) {
        // KV guard closes the race where a sequence hasn't written send_logs yet.
        const guardKey = `once:${automation.id}:${comment.from.id}`;
        if ((await env.STATE.get(guardKey)) ||
            (await hasPriorSend(env, accountId, comment.from.id, mediaId))) {
          return log(env, { ...base, detail: "once-per-user: already handled this user on this post" });
        }
        await env.STATE.put(guardKey, "1", { expirationTtl: SEEN_TTL_SECONDS });
      }
    } else if ((await env.STATE.get("config:post_mode")) === "selected") {
      return log(env, { ...base, detail: "post not enabled (selected-posts mode)" });
    }
  }
  await recordEvent(env, accountId, "comment_received", automation?.id);

  // Hourly budget. KV increments aren't atomic, but at personal scale an
  // occasional off-by-one is acceptable — this is a safety valve, not billing.
  const hourKey = `budget:${now.toISOString().slice(0, 13)}`;
  const count = parseInt((await env.STATE.get(hourKey)) ?? "0", 10);
  if (count >= MAX_REPLIES_PER_HOUR) {
    return log(env, { ...base, detail: "hourly budget exhausted" });
  }
  await env.STATE.put(hourKey, String(count + 1), { expirationTtl: 2 * 3600 });

  // Follow-gate mode: send the acknowledgment + the single proactive nudge DM,
  // then wait for the user to reply/follow before delivering the resource.
  if (automation?.require_follow === 1 && automation.resource_message?.trim()) {
    return handleFollowGate(env, accountId, automation, comment, base, doReply, doDm);
  }

  // Sequence mode: if this post has a message sequence, enqueue it (delayed,
  // jittered, queue-executed) and stop. Steps are filtered by the reply/DM
  // toggles so those still apply. No sequence -> fall through to simple mode.
  if (automation) {
    const steps = (await getSteps(env, automation.id)).filter(
      (s) => (s.type === "public_reply" && doReply) || (s.type === "dm" && doDm),
    );
    if (steps.length > 0) {
      const n = await enqueueSequence(env, accountId, automation.id, steps, comment);
      if (n > 0) {
        await wakeScheduler(env);
        return log(env, { ...base, status: "replied", source: "sequence", detail: `queued ${n}-step sequence` });
      }
    }
  }

  // Decide the reply: keyword rules first, then the configured LLM provider
  // chain (per-post -> default -> legacy Anthropic key), then the generic
  // fallback so a reply always goes out.
  let decision: ReplyDecision | null = await matchRule(env, comment.text);
  if (!decision) {
    try {
      const caption = comment.media?.id ? await getMediaCaption(env, comment.media.id) : undefined;
      decision = await generateViaLLM(env, accountId, automation, comment.text, caption);
    } catch (err) {
      base.detail = `AI failed, used fallback: ${err instanceof Error ? err.message : err}`;
    }
    if (!decision) decision = await getFallbackReply(env);
  }

  // Public reply first, then the DM. Each is best-effort independently so a
  // DM failure (e.g. commenter blocks DMs) doesn't lose the public reply.
  const commenterId = comment.from?.id ?? "unknown";
  let publicOk = false;
  let anyFailure = "";
  if (doReply) {
    try {
      await replyToComment(env, comment.id, decision.publicReply);
      publicOk = true;
      await recordEvent(env, accountId, "reply_sent", automation?.id);
    } catch (err) {
      anyFailure += `public reply failed: ${err instanceof Error ? err.message : err}; `;
    }
    await recordSend(env, accountId, {
      igUserId: commenterId, mediaId, automationId: automation?.id,
      messageType: "public_reply", ok: publicOk, error: publicOk ? undefined : anyFailure,
    });
  }
  let dmOk = false;
  if (doDm) {
    try {
      await sendPrivateReply(env, comment.id, decision.dmMessage);
      dmOk = true;
      await recordEvent(env, accountId, "dm_sent", automation?.id);
    } catch (err) {
      anyFailure += `DM failed: ${err instanceof Error ? err.message : err}`;
    }
    await recordSend(env, accountId, {
      igUserId: commenterId, mediaId, automationId: automation?.id,
      messageType: "dm", ok: dmOk, error: dmOk ? undefined : anyFailure,
    });
  }

  await log(env, {
    ...base,
    publicReply: doReply ? decision.publicReply : "(off)",
    dmMessage: doDm ? decision.dmMessage : "(off)",
    source: decision.source,
    status: publicOk || dmOk ? "replied" : "error",
    detail: [base.detail, anyFailure].filter(Boolean).join(" | ") || undefined,
  });

  // The AI path already recorded intent/sentiment in the same call. For
  // keyword/fallback replies, classify separately if the user opted in.
  if (decision.source !== "ai") {
    await classifyComment(env, accountId, automation, comment.text);
  }
}

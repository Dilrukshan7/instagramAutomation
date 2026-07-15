import type { Env } from "./types";

const BASE = "https://graph.instagram.com";

/** Carries the HTTP status so the job runner can tell terminal (4xx) from retryable (5xx/429). */
export class GraphError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`Graph API ${status} on ${path}: ${body}`);
    this.name = "GraphError";
  }
}

/**
 * The access token is initially provided as a Worker secret; the token-refresh
 * cron stores refreshed copies in KV, which take precedence once present.
 */
export async function getAccessToken(env: Env): Promise<string> {
  const stored = await env.STATE.get("config:token");
  return stored ?? env.IG_ACCESS_TOKEN;
}

async function graphFetch(
  env: Env,
  path: string,
  init: { method?: string; body?: Record<string, unknown> } = {},
  retries = 2,
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(env);
  const url = `${BASE}/${env.GRAPH_API_VERSION}/${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new GraphError(res.status, path, JSON.stringify(data));
    }
    return data;
  }
}

/** Public reply to a comment: POST /{comment-id}/replies */
export async function replyToComment(env: Env, commentId: string, message: string): Promise<void> {
  await graphFetch(env, `${commentId}/replies`, { method: "POST", body: { message } });
}

/**
 * Private reply (DM) to the author of a comment.
 * Meta allows exactly one private reply per comment, within 7 days.
 */
export async function sendPrivateReply(env: Env, commentId: string, text: string): Promise<void> {
  // "me" avoids ambiguity between the account's IG user ID and app-scoped ID.
  await graphFetch(env, `me/messages`, {
    method: "POST",
    body: {
      recipient: { comment_id: commentId },
      message: { text },
    },
  });
}

/**
 * Send a message to a user by their Instagram-scoped ID (not tied to a comment).
 * Works within an open 24h messaging window (i.e. after the user has messaged
 * us). Used to deliver the resource once a follow is confirmed.
 */
export async function sendDirectMessage(env: Env, igsid: string, text: string): Promise<void> {
  await graphFetch(env, `me/messages`, {
    method: "POST",
    body: {
      recipient: { id: igsid },
      message: { text },
    },
  });
}

/**
 * Whether a user follows the business account, via the Instagram messaging
 * user-profile lookup. Returns true/false, or null when it can't be determined
 * (no messaging context / outside the window / field unavailable) — callers
 * treat null as "unknown, nudge to follow".
 */
export async function getUserFollowStatus(env: Env, igsid: string): Promise<boolean | null> {
  try {
    const data = await graphFetch(env, `${igsid}?fields=is_user_follow_business`);
    return typeof data.is_user_follow_business === "boolean" ? data.is_user_follow_business : null;
  } catch {
    return null;
  }
}

/** Fetch the media caption to give the AI context. Best-effort. */
export async function getMediaCaption(env: Env, mediaId: string): Promise<string | undefined> {
  try {
    const data = await graphFetch(env, `${mediaId}?fields=caption`);
    return typeof data.caption === "string" ? data.caption : undefined;
  } catch {
    return undefined;
  }
}

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

/** Recent posts/reels for the dashboard's per-post automation controls. */
export async function getRecentMedia(env: Env, limit = 25): Promise<MediaItem[]> {
  const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";
  const data = await graphFetch(env, `me/media?fields=${fields}&limit=${limit}`);
  return (data.data as MediaItem[]) ?? [];
}

/**
 * Refresh the long-lived token (valid 60 days, refreshable once >24h old).
 * Called by the weekly cron; stores the new token in KV.
 */
export async function refreshToken(env: Env): Promise<void> {
  const token = await getAccessToken(env);
  const url = `${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(data)}`);
  }
  await env.STATE.put("config:token", data.access_token);
  await env.STATE.put(
    "config:token_meta",
    JSON.stringify({ refreshedAt: new Date().toISOString(), expiresIn: data.expires_in }),
  );
}

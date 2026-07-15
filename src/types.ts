import type { Scheduler } from "./scheduler";

export interface Env {
  STATE: KVNamespace;
  DB: D1Database;
  SCHEDULER: DurableObjectNamespace<Scheduler>;
  IG_USER_ID: string;
  GRAPH_API_VERSION: string;
  IG_ACCESS_TOKEN: string;
  META_APP_SECRET: string;
  WEBHOOK_VERIFY_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
}

/** Webhook payload for the `comments` field (Instagram API with Instagram Login). */
export interface CommentWebhookValue {
  id: string;
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  parent_id?: string;
}

/** Inbound message event (`messages` webhook field). */
export interface MessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

export interface WebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    time: number;
    changes?: Array<{ field: string; value: CommentWebhookValue }>;
    messaging?: MessagingEvent[];
  }>;
}

export interface ReplyDecision {
  publicReply: string;
  dmMessage: string;
  source: "rule" | "ai" | "fallback";
}

export interface LogEntry {
  ts: string;
  commentId: string;
  mediaId?: string;
  from?: string;
  commentText?: string;
  publicReply?: string;
  dmMessage?: string;
  source?: string;
  status: "replied" | "skipped" | "error";
  detail?: string;
}

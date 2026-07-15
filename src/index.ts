import { Hono } from "hono";
import { DASHBOARD_HTML } from "./dashboard";
import {
  expireOldPending,
  getAccountId,
  getOrCreateAutomationId,
  getStepsForMedia,
  listAutomations,
  listPending,
  replaceSteps,
  upsertAutomation,
} from "./db";
import { runPendingRecheck } from "./followgate";
import { getRecentMedia, refreshToken } from "./graph";
import { getProviderRow, KIND_PRESETS, testProviderRow } from "./llm/registry";
import type { ProviderRow } from "./llm/registry";
import { processWebhook } from "./processor";
import { getBlocklist, getFallback, getRules, normalizeRule } from "./rules";
import type { Env, WebhookPayload } from "./types";

export { Scheduler } from "./scheduler";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

// Admin dashboard (static HTML; all data calls go through the token-protected /api).
app.get("/", (c) => c.html(DASHBOARD_HTML));
app.get("/dashboard", (c) => c.redirect("/"));

// Meta webhook verification handshake (performed once when you register the URL).
app.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === c.env.WEBHOOK_VERIFY_TOKEN && challenge) {
    return c.text(challenge);
  }
  return c.text("Forbidden", 403);
});

// Comment events. ACK immediately; process async via waitUntil so Meta never
// sees a slow response (slow/failed responses trigger redelivery and eventually
// unsubscription).
app.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Hub-Signature-256");
  const sigOk = await verifySignature(rawBody, signature, c.env.META_APP_SECRET);
  // Diagnostic trace of every delivery attempt (raw), kept 3 days. Lets us
  // distinguish "Meta never delivered" from "delivered but rejected/ignored".
  c.executionCtx.waitUntil(
    c.env.STATE.put(
      `hook:${new Date().toISOString()}`,
      JSON.stringify({ sigOk, sigHeader: signature ?? null, body: rawBody.slice(0, 4000) }),
      { expirationTtl: 3 * 24 * 3600 },
    ),
  );
  if (!sigOk) {
    return c.text("Invalid signature", 401);
  }
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return c.text("Bad payload", 400);
  }
  c.executionCtx.waitUntil(processWebhook(c.env, payload));
  return c.text("OK");
});

// ---------- Admin API (used by the dashboard) ----------

app.use("/api/*", async (c, next) => {
  if (c.req.header("x-admin-token") !== c.env.ADMIN_TOKEN) {
    return c.text("Forbidden", 403);
  }
  await next();
});

app.get("/api/settings", async (c) => {
  const kvKey = await c.env.STATE.get("config:anthropic_key");
  const secretKey = c.env.ANTHROPIC_API_KEY && c.env.ANTHROPIC_API_KEY.trim() !== "";
  return c.json({
    enabled: (await c.env.STATE.get("config:enabled")) !== "false",
    aiEnabled: (await c.env.STATE.get("config:ai_enabled")) !== "false",
    aiKeySource: kvKey ? "dashboard" : secretKey ? "secret" : "none",
    tokenMeta: JSON.parse((await c.env.STATE.get("config:token_meta")) ?? "null"),
  });
});

app.put("/api/settings", async (c) => {
  const body = (await c.req.json()) as {
    enabled?: boolean;
    aiEnabled?: boolean;
    anthropicKey?: string;
  };
  if (typeof body.enabled === "boolean") {
    await c.env.STATE.put("config:enabled", String(body.enabled));
  }
  if (typeof body.aiEnabled === "boolean") {
    await c.env.STATE.put("config:ai_enabled", String(body.aiEnabled));
  }
  if (typeof body.anthropicKey === "string") {
    if (body.anthropicKey.trim() === "") {
      await c.env.STATE.delete("config:anthropic_key");
    } else {
      await c.env.STATE.put("config:anthropic_key", body.anthropicKey.trim());
    }
  }
  return c.json({ ok: true });
});

app.get("/api/rules", async (c) => c.json(await getRules(c.env)));

app.put("/api/rules", async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>[];
  if (!Array.isArray(body)) return c.text("Expected an array of rules", 400);
  const rules = body.map(normalizeRule);
  if (rules.some((r) => r === null)) {
    return c.text("Each rule needs keywords, publicReplies and dmMessages", 400);
  }
  await c.env.STATE.put("config:rules", JSON.stringify(rules));
  return c.json({ ok: true });
});

app.get("/api/fallback", async (c) => c.json(await getFallback(c.env)));

app.put("/api/fallback", async (c) => {
  const body = (await c.req.json()) as { publicReplies?: string[]; dmMessages?: string[] };
  if (!Array.isArray(body.publicReplies) || body.publicReplies.length === 0 ||
      !Array.isArray(body.dmMessages) || body.dmMessages.length === 0) {
    return c.text("Need at least one public reply and one DM message", 400);
  }
  await c.env.STATE.put("config:fallback", JSON.stringify(body));
  return c.json({ ok: true });
});

app.get("/api/blocklist", async (c) => c.json(await getBlocklist(c.env)));

app.put("/api/blocklist", async (c) => {
  const body = (await c.req.json()) as string[];
  if (!Array.isArray(body)) return c.text("Expected an array of strings", 400);
  await c.env.STATE.put("config:blocklist", JSON.stringify(body));
  return c.json({ ok: true });
});

// Recent posts/reels merged with their automation settings.
app.get("/api/media", async (c) => {
  const accountId = await getAccountId(c.env);
  const [media, automations] = await Promise.all([
    getRecentMedia(c.env),
    listAutomations(c.env, accountId),
  ]);
  const byMedia = new Map(automations.map((a) => [a.media_id, a]));
  const postMode = (await c.env.STATE.get("config:post_mode")) === "selected" ? "selected" : "all";
  return c.json({
    postMode,
    media: media.map((m) => {
      const a = byMedia.get(m.id);
      return {
        ...m,
        caption: m.caption?.slice(0, 120),
        automation: a
          ? {
              enabled: a.enabled === 1,
              autoReply: a.auto_reply_enabled === 1,
              autoDm: a.auto_dm_enabled === 1,
              oncePerUser: a.once_per_user === 1,
              providerId: a.provider_id,
              requireFollow: a.require_follow === 1,
              resourceMessage: a.resource_message ?? "",
              nudgeMessage: a.nudge_message ?? "",
            }
          : null,
      };
    }),
  });
});

// Update per-post automation settings (upsert), or the global post mode.
app.put("/api/automations", async (c) => {
  const body = (await c.req.json()) as {
    postMode?: "all" | "selected";
    mediaId?: string;
    enabled?: boolean;
    autoReply?: boolean;
    autoDm?: boolean;
    oncePerUser?: boolean;
    providerId?: number | null;
    requireFollow?: boolean;
    resourceMessage?: string;
    nudgeMessage?: string;
  };
  if (body.postMode === "all" || body.postMode === "selected") {
    await c.env.STATE.put("config:post_mode", body.postMode);
  }
  if (body.mediaId) {
    const accountId = await getAccountId(c.env);
    await upsertAutomation(c.env, accountId, body.mediaId, {
      enabled: body.enabled,
      auto_reply_enabled: body.autoReply,
      auto_dm_enabled: body.autoDm,
      once_per_user: body.oncePerUser,
      provider_id: body.providerId,
      require_follow: body.requireFollow,
      resource_message: body.resourceMessage === undefined ? undefined : body.resourceMessage,
      nudge_message: body.nudgeMessage === undefined ? undefined : body.nudgeMessage,
    });
  }
  return c.json({ ok: true });
});

// Follow-gate funnel: pending / delivered / expired deliveries.
app.get("/api/pending", async (c) => {
  const accountId = await getAccountId(c.env);
  const rows = await listPending(c.env, accountId, 60);
  return c.json(
    rows.map((r) => ({
      igUserId: r.ig_user_id,
      status: r.status,
      nudges: r.nudge_count,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      resourcePreview: (r.resource_text ?? "").slice(0, 60),
    })),
  );
});

// ---------- Message sequences (per post) ----------

app.get("/api/steps", async (c) => {
  const mediaId = c.req.query("mediaId");
  if (!mediaId) return c.text("mediaId required", 400);
  const accountId = await getAccountId(c.env);
  const steps = await getStepsForMedia(c.env, accountId, mediaId);
  return c.json(
    steps.map((s) => ({
      type: s.type,
      variations: JSON.parse(s.content_variations) as string[],
      delaySeconds: s.delay_seconds,
    })),
  );
});

app.put("/api/steps", async (c) => {
  const body = (await c.req.json()) as {
    mediaId?: string;
    steps?: Array<{ type: string; variations: string[]; delaySeconds: number }>;
  };
  if (!body.mediaId || !Array.isArray(body.steps)) return c.text("mediaId and steps required", 400);
  for (const s of body.steps) {
    if (s.type !== "public_reply" && s.type !== "dm") return c.text(`invalid step type: ${s.type}`, 400);
    if (!Array.isArray(s.variations) || s.variations.filter((v) => v.trim() !== "").length === 0) {
      return c.text("each step needs at least one non-empty message", 400);
    }
  }
  const accountId = await getAccountId(c.env);
  const automationId = await getOrCreateAutomationId(c.env, accountId, body.mediaId);
  await replaceSteps(
    c.env,
    automationId,
    body.steps.map((s) => ({
      type: s.type,
      content_variations: s.variations.map((v) => v.trim()).filter(Boolean),
      delay_seconds: Math.max(0, Math.floor(s.delaySeconds || 0)),
    })),
  );
  return c.json({ ok: true });
});

// ---------- LLM providers ----------

app.get("/api/providers", async (c) => {
  const accountId = await getAccountId(c.env);
  const res = await c.env.DB.prepare(
    "SELECT id, kind, label, base_url, default_model, enabled, last_test_at, last_test_ok, (api_key IS NOT NULL AND api_key != '') AS has_key FROM llm_providers WHERE account_id = ?",
  )
    .bind(accountId)
    .all();
  const defaultId = await c.env.STATE.get("config:default_provider_id");
  return c.json({
    presets: KIND_PRESETS,
    defaultId: defaultId ? parseInt(defaultId, 10) : null,
    providers: res.results,
  });
});

app.post("/api/providers", async (c) => {
  const accountId = await getAccountId(c.env);
  const b = (await c.req.json()) as {
    kind: string; label: string; apiKey?: string; baseUrl?: string; model?: string;
  };
  if (!b.kind || !b.label) return c.text("kind and label required", 400);
  const preset = KIND_PRESETS[b.kind];
  if (!preset) return c.text("unknown provider kind", 400);
  const row = await c.env.DB.prepare(
    `INSERT INTO llm_providers (account_id, kind, label, base_url, api_key, default_model)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      accountId,
      b.kind,
      b.label,
      b.baseUrl?.trim() || preset.baseUrl,
      b.apiKey?.trim() || null,
      b.model?.trim() || preset.model,
    )
    .first<{ id: number }>();
  // First provider added becomes the default automatically.
  const existing = await c.env.STATE.get("config:default_provider_id");
  if (!existing && row) await c.env.STATE.put("config:default_provider_id", String(row.id));
  return c.json({ ok: true, id: row?.id });
});

app.put("/api/providers/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const row = await getProviderRow(c.env, id);
  if (!row) return c.text("not found", 404);
  const b = (await c.req.json()) as {
    label?: string; apiKey?: string; baseUrl?: string; model?: string; enabled?: boolean; makeDefault?: boolean;
  };
  await c.env.DB.prepare(
    `UPDATE llm_providers SET
       label = COALESCE(?, label),
       base_url = COALESCE(?, base_url),
       api_key = CASE WHEN ? = 1 THEN ? ELSE api_key END,
       default_model = COALESCE(?, default_model),
       enabled = COALESCE(?, enabled)
     WHERE id = ?`,
  )
    .bind(
      b.label ?? null,
      b.baseUrl?.trim() || null,
      b.apiKey !== undefined ? 1 : 0,
      b.apiKey?.trim() || null,
      b.model?.trim() || null,
      b.enabled === undefined ? null : b.enabled ? 1 : 0,
      id,
    )
    .run();
  if (b.makeDefault) await c.env.STATE.put("config:default_provider_id", String(id));
  return c.json({ ok: true });
});

app.delete("/api/providers/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare("DELETE FROM llm_providers WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE automations SET provider_id = NULL WHERE provider_id = ?").bind(id).run();
  if ((await c.env.STATE.get("config:default_provider_id")) === String(id)) {
    await c.env.STATE.delete("config:default_provider_id");
  }
  return c.json({ ok: true });
});

app.post("/api/providers/:id/test", async (c) => {
  const row = await getProviderRow(c.env, parseInt(c.req.param("id"), 10));
  if (!row) return c.text("not found", 404);
  return c.json(await testProviderRow(c.env, row as ProviderRow));
});

// AI usage summary (tokens per provider, last 30 days).
app.get("/api/usage", async (c) => {
  const accountId = await getAccountId(c.env);
  const res = await c.env.DB.prepare(
    `SELECT provider, COUNT(*) AS calls, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out
     FROM analytics_events
     WHERE account_id = ? AND event_type = 'ai_generation' AND ts > datetime('now', '-30 days')
     GROUP BY provider`,
  )
    .bind(accountId)
    .all();
  return c.json(res.results);
});

// Raw webhook delivery trace (diagnostics).
app.get("/api/hooks", async (c) => {
  const list = await c.env.STATE.list({ prefix: "hook:", limit: 50 });
  const entries = await Promise.all(
    list.keys
      .map((k) => k.name)
      .sort()
      .reverse()
      .map(async (name) => ({ ts: name.slice(5), ...JSON.parse((await c.env.STATE.get(name)) ?? "{}") })),
  );
  return c.json(entries);
});

app.get("/api/logs", async (c) => {
  const list = await c.env.STATE.list({ prefix: "log:", limit: 100 });
  const entries = await Promise.all(
    list.keys
      .map((k) => k.name)
      .sort()
      .reverse()
      .map(async (name) => JSON.parse((await c.env.STATE.get(name)) ?? "{}")),
  );
  return c.json(entries);
});

async function verifySignature(body: string, header: string | undefined, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice("sha256=".length);
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        // Every-minute backstop: poke the scheduler so any due jobs drain even
        // if a DO alarm was lost. The DO is the single execution path.
        try {
          await env.SCHEDULER.get(env.SCHEDULER.idFromName("main")).wake();
        } catch {
          // scheduler unavailable this tick; next tick retries
        }
        if (controller.cron === "* * * * *") {
          // Follow-gate housekeeping: expire stale waits + best-effort delivery
          // for users who have since followed (strict: confirmed follow only).
          try {
            await expireOldPending(env, 7);
            await runPendingRecheck(env, 5);
          } catch {
            // best-effort
          }
        }
        // Weekly cron: keep the 60-day long-lived token fresh.
        if (controller.cron === "0 3 * * 1") await refreshToken(env);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

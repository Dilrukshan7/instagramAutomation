# ig-auto-responder

Automatically replies to comments on your own Instagram posts/reels — a public reply on the comment **and** a private DM to the commenter — using Meta's official Instagram API. Runs free on Cloudflare Workers, managed entirely from a **web dashboard** (no code edits needed day-to-day).

Reply logic, in order:
1. **Keyword rules** — if the comment contains a keyword, one public reply and one DM are picked **at random** from your configured lists (so visitors don't all get identical replies).
2. **AI (optional)** — comments matching no keyword get a reply written by Claude Haiku using your post caption as context. Needs an Anthropic API key (add it in the dashboard).
3. **Fallback** — if AI is off or unavailable, a randomized generic reply/DM is used. A reply always goes out.

> **Known limitation:** the official Instagram API cannot *like* a comment (no such endpoint exists). The public reply is the acknowledgment. Unofficial bots that can like comments violate Instagram's terms and risk your account.

## Architecture

```
Someone comments → Meta webhook → Cloudflare Worker
  → verify X-Hub-Signature-256 → dedupe → guards (own-comment loop, blocklist, hourly budget, kill switch)
  → rule match? random pick : AI : fallback
  → POST public reply + POST private DM → log to KV
```

Meta's rules baked in: **one DM per comment**, within 7 days of the comment, max 750 DMs/hour (the bot self-limits to 30 replies/hour — `MAX_REPLIES_PER_HOUR` in `src/processor.ts`).

Files: `src/index.ts` (routes + admin API), `src/dashboard.ts` (web UI), `src/processor.ts` (guards + orchestration), `src/rules.ts` (rules/fallback/blocklist), `src/ai.ts` (Claude), `src/graph.ts` (Instagram API + token refresh).

Secrets handling and key rotation: see **SECURITY.md**.

---

# First-time setup

Follow in order. Every step lists how to *verify* it worked — don't skip those; every silent failure mode below was hit in real life.

## Step 1 — Instagram Professional account (public)

1. Instagram app → Settings → *Account type and tools* → *Switch to professional account* → **Creator** or **Business**. Free.
2. Make sure the account is **Public** (Settings → Account privacy). Private accounts can silently stop comment webhooks.

## Step 2 — Meta app

1. https://developers.facebook.com → *My Apps* → **Create App** → type **Business** (or any flow offering the *Instagram* product).
2. Add the **Instagram** product → **API setup with Instagram login**.
3. Under *Generate access tokens*: add your IG account, click **Generate token**, log in, grant all three scopes:
   `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.
   Save the **long-lived access token**.
4. Collect four more values:
   - **Instagram user ID** — run: `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=<TOKEN>` → the `user_id` field.
   - **App ID** — App settings → Basic (top).
   - **App Secret** — App settings → Basic (top). Used only for API management commands.
   - **Instagram app secret** — App settings → Basic → scroll down to the **Instagram** section → *Show*.

> ⚠️ **TWO DIFFERENT SECRETS — the #1 trap in this whole setup.** The *App Secret* (top of Basic settings) authenticates management API calls. The *Instagram app secret* (Instagram section, further down the same page) is what Meta uses to **sign webhook deliveries**. The Worker's `META_APP_SECRET` must be the **Instagram app secret** — if you use the general App Secret, every webhook is rejected with an invalid signature and the bot silently never replies.

## Step 3 — Go Live

Webhook events are reliably delivered only to **Live** apps.

1. App settings → Basic: fill **Privacy policy URL** and (if shown) **Data deletion instructions URL** — any valid page you control works for personal use. Select an **App category**. Save.
2. Flip the **App Mode** toggle (top of dashboard) from Development to **Live**. On newer dashboards the switch may be under **Review → Publish** instead.

Personal use never needs App Review — Standard Access keeps working for your own account even in Live mode.

## Step 4 — Deploy the Worker

```powershell
cd ig-auto-responder
npm install
npx wrangler login

npx wrangler kv namespace create STATE     # paste the returned id into wrangler.toml

# Edit wrangler.toml: set IG_USER_ID to your Instagram user ID (step 2.4)

npx wrangler secret put IG_ACCESS_TOKEN       # long-lived token (step 2.3)
npx wrangler secret put META_APP_SECRET       # the INSTAGRAM app secret (step 2.4 — see warning!)
npx wrangler secret put WEBHOOK_VERIFY_TOKEN  # invent a random string, MAX 64 CHARACTERS
npx wrangler secret put ADMIN_TOKEN           # invent a random string; your dashboard password
npx wrangler secret put ANTHROPIC_API_KEY     # optional — can be added later in the dashboard

npm run deploy
```

> ⚠️ **`WEBHOOK_VERIFY_TOKEN` must be ≤ 64 characters.** Meta rejects longer ones — and the dashboard UI fails *silently*, leaving the webhook unregistered.

> ⚠️ Never put real secret values in `wrangler.toml` (not even comments) — it's a committed file. See SECURITY.md.

**Verify:** `https://<your-worker>.workers.dev/health` returns `{"ok":true}`. Note: after each deploy, edge propagation can take **2–5 minutes** — a stale 404 right after deploying is normal.

## Step 5 — Register the webhook (TWO levels, both required)

This is the top source of "everything looks right but nothing happens". Meta needs both registrations:

Subscribe to **both `comments` and `messages`** — `comments` drives replies/DMs; `messages` is required for the follow-gate funnel (it fires when a user replies to a DM).

**(a) App-level** — where to deliver events (uses App ID + general App Secret):

```powershell
curl.exe -X POST "https://graph.facebook.com/v23.0/<APP_ID>/subscriptions?object=instagram&callback_url=https%3A%2F%2F<WORKER>.workers.dev%2Fwebhook&fields=comments,messages&verify_token=<VERIFY_TOKEN>&access_token=<APP_ID>|<APP_SECRET>"
```

Expect `{"success":true}` (this also proves the handshake passed). **Verify it saved:**

```powershell
curl.exe "https://graph.facebook.com/v23.0/<APP_ID>/subscriptions?access_token=<APP_ID>|<APP_SECRET>"
# must show: object=instagram, your callback_url, fields containing "comments" AND "messages", active=true
```

**(b) Account-level** — whose events to deliver (uses the IG access token):

```powershell
curl.exe -X POST "https://graph.instagram.com/v23.0/me/subscribed_apps?subscribed_fields=comments,messages&access_token=<IG_ACCESS_TOKEN>"
curl.exe "https://graph.instagram.com/v23.0/me/subscribed_apps?access_token=<IG_ACCESS_TOKEN>"
# subscribed_fields must include "comments" and "messages"
```

## Step 6 — End-to-end test

From a **different** Instagram account, comment `price` on one of your posts:

- Public reply appears under the comment within seconds, DM lands in the commenter's message requests.
- Dashboard → Activity log shows the entry with status `replied`.

Then try a free-form comment (AI or fallback reply expected).

---

# The dashboard

Open `https://<your-worker>.workers.dev/` and sign in with your `ADMIN_TOKEN`:

- **Bot on/off** and **AI on/off** toggles
- **Anthropic API key** — add / replace / remove (stored in KV; overrides the wrangler secret)
- **Keyword rules** — keywords + lists of public replies and DMs; one of each picked randomly per commenter
- **Fallback reply** — randomized lists used when nothing matches and AI is unavailable
- **Blocklist** — phrases that make the bot stay silent
- **Activity log** — every comment, the reply sent, and any errors

Dashboard changes are instant (stored in KV). Only *code* deploys have the 2–5 min propagation delay.

---

# Troubleshooting: no replies

The Worker records **every** webhook delivery attempt (raw) for 3 days. This makes diagnosis mechanical:

```powershell
curl.exe -H "x-admin-token: <ADMIN_TOKEN>" https://<WORKER>.workers.dev/api/hooks
```

| What you see | Meaning | Fix |
|---|---|---|
| `[]` (nothing, even after a fresh comment) | Meta isn't delivering | Check Step 5a AND 5b registrations; app must be **Live** (Step 3); account must be **public**; comment must be *new* (old comments never fire) and from *another* account (own comments are loop-guarded) |
| Entries with `"sigOk": false` | Deliveries rejected: wrong signing secret | `META_APP_SECRET` must be the **Instagram app secret**, not the general App Secret (Step 2 warning). Update: `npx wrangler secret put META_APP_SECRET` |
| Entries with `"sigOk": true` but no reply | Event accepted, reply failed | Check `/api/logs` (or dashboard Activity log) — the `detail` field contains Instagram's exact error |

Common `/api/logs` errors:

- *"requested user cannot be found"* on the DM — the commenter's privacy settings block message requests, or 7-day window passed. Public reply still works; not fixable bot-side.
- *"hourly budget exhausted"* — raise `MAX_REPLIES_PER_HOUR` in `src/processor.ts` and redeploy.
- *"bot disabled"* — flip the toggle in the dashboard.

Other gotchas:

- **Webhook config "saved" in the Meta UI but `subscriptions` returns `{"data":[]}`** — usually the >64-char verify token. Re-do Step 5a via API where errors are visible.
- **Dev-mode tester restriction** — if you stay in Development mode instead of going Live, events may only fire for accounts with app roles.
- **`wrangler tail` keeps disconnecting** — known flakiness; rely on `/api/hooks` + `/api/logs` instead, they're persistent.

# Costs

- Cloudflare Workers/KV: free tier (100k requests/day).
- Meta API: free.
- Claude Haiku: ~$0.001 per AI reply; keyword/fallback replies cost nothing. No key → AI simply skipped.

# Scaling to production later

The processor is already parameterized by account. The path: Meta App Review for Advanced Access (`instagram_business_manage_comments`/`_messages`), an OAuth "Login with Instagram" flow with per-user tokens in D1/Postgres, per-account rule sets, and a queue between webhook and processor for burst handling. No rewrite of the webhook/processor/graph modules needed.

# ig-auto-responder

Automatically replies to comments on your own Instagram posts/reels — a public reply on the comment **and** a private DM to the commenter — using Meta's official Instagram API. Runs free on Cloudflare Workers, controlled entirely from a browser dashboard (no code edits for day-to-day changes).

It's grown from a simple auto-responder into a small automation platform: keyword rules, multi-provider AI replies, per-post control, follow-gated resource delivery, message sequences, analytics, prompt versioning, and a **knowledge base (RAG)** that makes replies mimic text you paste in (e.g. movie dialogs).

> **Known limitation:** the official Instagram API cannot *like* a comment (no such endpoint exists). The public reply is the acknowledgment. Unofficial bots that can like comments violate Instagram's terms and risk your account.

## How it works

```
Someone comments → Meta webhook → Cloudflare Worker
  → verify HMAC signature → dedupe → loop/spam guards
  → resolve per-post automation (on? public-reply/DM? follow-gate? sequence?)
  → keyword rule match?  use a random template
       else → AI reply via your chosen provider
              (optionally grounded in your Knowledge base / persona)
  → POST public reply + POST private DM
  → log + analytics (intent / sentiment)
```

Meta's rules are baked in: **one DM per comment**, within 7 days, max 750 DMs/hour. The bot self-limits to 30 replies/hour (`MAX_REPLIES_PER_HOUR` in `src/processor.ts`).

## Features

- **Public reply + private DM** to each commenter, with per-post on/off for each.
- **Keyword rules** — arrays of replies/DMs, one picked at random per match.
- **Multi-provider AI** for non-keyword comments: Gemini, Grok, Groq, OpenRouter, OpenAI, Anthropic, or any OpenAI-compatible / local (Ollama, LM Studio) endpoint. Set a default and override per post.
- **Knowledge base (RAG)** — paste reference text; replies mimic its style, in any language (Tamil/Tanglish included). Uses free Cloudflare Workers AI embeddings.
- **Per-post automation** — enable only selected posts, once-per-user suppression, per-post AI provider.
- **Follow-gated delivery** — send a resource only after the commenter follows and replies.
- **Message sequences** — ordered, delayed, jittered multi-step reply flows with random variations.
- **AI prompt management** — edit the reply tone/style with full version history and rollback.
- **Analytics** — funnel counts, comment intent + sentiment, daily activity.
- **Safety** — kill switch, hourly budget, blocklist, dedupe, self-reply loop guard, HMAC verification.

---

## Setup (one-time, ~30 min)

### 1. Instagram Professional account

Instagram app → Settings → *Account type and tools* → *Switch to professional account* → pick **Creator** or **Business**. Free.

### 2. Meta app

1. Go to https://developers.facebook.com → *My Apps* → **Create App**.
2. Use case: **Other** → type: **Business** (or the flow that offers the *Instagram* product).
3. In the app dashboard, add the **Instagram** product → choose **API setup with Instagram login**.
4. Under *Generate access tokens*: add your Instagram account and click **Generate token**. Log in with your IG account and grant:
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
5. Copy the **long-lived access token** (valid 60 days; this bot auto-refreshes it weekly).
6. Note your **Instagram user ID** (shown next to your account in the token generator, or call `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=...`).
7. Copy the **Instagram app secret**. In *API setup with Instagram login* this is shown as **Instagram app secret** (NOT the general *App settings → Basic → App Secret* — Meta signs Instagram webhooks with the Instagram one).

Because only your own account uses this app, it stays in **Development mode** — no App Review needed.

### 3. Cloudflare Worker

```powershell
cd ig-auto-responder
npm install
npx wrangler login

# Create the KV namespace and paste the returned id into wrangler.toml
npx wrangler kv namespace create STATE

# Create the D1 database and paste the returned database_id into wrangler.toml
npx wrangler d1 create ig-auto-responder

# Apply every migration in order to the production database
npx wrangler d1 execute ig-auto-responder --remote --file ./migrations/0001_init.sql
npx wrangler d1 execute ig-auto-responder --remote --file ./migrations/0002_followgate.sql
npx wrangler d1 execute ig-auto-responder --remote --file ./migrations/0003_phase5.sql
npx wrangler d1 execute ig-auto-responder --remote --file ./migrations/0004_rag.sql

# Fill in IG_USER_ID in wrangler.toml [vars], then set secrets:
npx wrangler secret put IG_ACCESS_TOKEN       # long-lived token from step 2.5
npx wrangler secret put META_APP_SECRET       # the Instagram app secret (webhook signing) from step 2.7
npx wrangler secret put WEBHOOK_VERIFY_TOKEN  # invent a random string (<=64 chars), note it down
npx wrangler secret put ANTHROPIC_API_KEY     # optional — or add Gemini/Grok/etc. keys later in the dashboard
npx wrangler secret put ADMIN_TOKEN           # invent another random string (this logs you into the dashboard)

npm run deploy
```

The `[ai]` binding for Workers AI (used by the knowledge base for embeddings) is already in `wrangler.toml` — no key needed, it's free-tier and deploys automatically.

> When you add a new migration later, run the same `d1 execute ... --file ./migrations/<file>.sql` command for it. Migrations are additive, so re-running an already-applied one is safe.

Note the deployed URL, e.g. `https://ig-auto-responder.<you>.workers.dev`.

### 4. Register the webhook with Meta

1. In the Meta app dashboard → Instagram product → **Webhooks** (or *Configure webhooks* under API setup).
2. Callback URL: `https://ig-auto-responder.<you>.workers.dev/webhook`
3. Verify token: the exact `WEBHOOK_VERIFY_TOKEN` string you chose.
4. Click *Verify and save* — the Worker answers the handshake automatically.
5. **Subscribe to both the `comments` and `messages` fields.** `comments` drives replies; `messages` is required for the follow-gate funnel (it fires when a commenter replies to your nudge DM).

Done. Comment on one of your posts from another account to test.

---

## Dashboard

Open the deployed URL in a browser and paste your `ADMIN_TOKEN` to sign in (stored only in your browser). Everything below is controlled here — no redeploys needed.

| Tab | What it does |
|---|---|
| **Overview** | Activity summary: funnel counts (comments → replies → DMs → resources delivered), comment **intent** and **sentiment**, daily activity over a 1/7/30/90-day window. |
| **Activity** | Recent bot activity log (time, commenter, comment, reply, status). |
| **Posts** | Per-post/reel control: enable automation, public-reply/DM toggles, once-per-user, pick the AI provider, follow-gate, and multi-step message sequences. Choose "all posts" or "only selected". |
| **Funnel** | Follow-gated deliveries: who commented, nudge count, and delivery status. |
| **AI** | Enable AI replies + comment classification; add/enable/test AI providers and set the default; edit the system prompt with version history; view 30-day token usage; optional legacy Anthropic key. |
| **Knowledge** | The RAG knowledge base — see below. |
| **Content** | Keyword rules, fallback reply, and blocklist. |
| **Settings** | Bot on/off (pause/resume) and Instagram token health. |

**Comment classification (intent + sentiment):** every AI-generated reply classifies the comment for free (intent: question/interested/praise/complaint/spam/other; sentiment: positive/neutral/negative). Turn on *Classify comments* in the AI tab to also classify keyword/fallback replies (one small extra AI call each). Results feed the Overview tab.

## Knowledge base (RAG / persona replies)

Make AI replies mimic a body of text you paste in — e.g. answer commenters with movie-dialog flavor.

1. **AI tab** → add a provider (your OpenRouter/NVIDIA/Gemini/etc. key) and set it as default. This is the model that writes the reply.
2. **Knowledge tab** → **Create collection** (e.g. "Tamil movie dialogs"), optionally add a style note (e.g. *reply with dramatic, filmy energy*).
3. Open the collection, paste your reference text **one line per entry**, and **Save**. The lines are embedded and stored (raw text isn't shown back; re-paste to change it).
4. Turn on **Use the knowledge base for AI replies**.
5. Use **Test retrieval** to type a sample comment and see which lines it would pull in.

How it works: for each comment the bot embeds the text with Cloudflare **Workers AI `bge-m3`** (free, multilingual), finds the most similar stored lines by cosine similarity, and injects them + your style note into the AI prompt. The strict JSON output format is enforced separately, so a persona can never break replies. Keyword rules are unaffected; if the KB is off/empty or no provider is set, replies behave exactly as without it.

## AI providers

In the **AI** tab, add any of: Gemini, Grok, Groq, OpenRouter, OpenAI, Anthropic, or a **Custom / Local** OpenAI-compatible endpoint. Local models (Ollama / LM Studio) run on your PC, so the cloud Worker reaches them via a public tunnel URL (e.g. cloudflared) pasted as the Base URL. **Test** each provider to verify the key, **Make default** for the account, and override per post in the Posts tab. With no provider and no key, non-keyword comments fall back to the templates in Content → Fallback reply.

## Day-to-day operations

| Action | How |
|---|---|
| Pause / resume the bot | **Settings** tab toggle |
| Review what the bot sent | **Activity** tab (or `npm run tail` for live logs) |
| Edit keyword rules / fallback / blocklist | **Content** tab |
| Add or switch AI models | **AI** tab |
| Change reply tone | **AI** tab → System prompt (versioned) |
| Check token / delivery health | **Settings** and **Funnel** tabs |

## Costs

- **Cloudflare Workers / KV / D1 / Workers AI:** free tier (100k requests/day; Workers AI has a free daily allowance — plenty for personal volume).
- **Meta API:** free.
- **AI replies:** use free models (Gemini, Groq, OpenRouter free tiers, or a local model) or paid ones — your choice. With no key, the bot simply uses templates.

## Scaling to production later

The processor is already parameterized by IG user ID and every table carries an `account_id`, so the path to multi-user is: Meta App Review for Advanced Access (`instagram_business_manage_comments` / `_messages`), an OAuth "Login with Instagram" flow storing per-user tokens, and per-account config. The knowledge base can move from brute-force cosine over D1 to Cloudflare Vectorize (paid) if a corpus grows large. The webhook / processor / graph modules need no rewrite.

## Project layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Hono routes: `/webhook`, the dashboard, and the token-protected `/api/*`. |
| `src/processor.ts` | Comment pipeline: guards, automation resolution, reply decision, send. |
| `src/graph.ts` | Instagram Graph API client (replies, DMs, follow status, media, token refresh). |
| `src/llm/` | Provider adapters (`anthropic`, `gemini`, `openaiCompat`), the `registry`, and `embed` (Workers AI). |
| `src/rag.ts` | Chunking + retrieval for the knowledge base. |
| `src/followgate.ts` | Follow-gated resource funnel. |
| `src/jobs.ts` + `src/scheduler.ts` | Delayed/sequenced sends via a Durable Object alarm queue. |
| `src/db.ts` | D1 data access. |
| `src/dashboard.ts` | Single-file admin dashboard (HTML/CSS/JS). |
| `migrations/` | D1 schema (apply in order). |

See `SECURITY.md` for rotating keys.

# ig-auto-responder

Automatically replies to comments on your own Instagram posts/reels — a public reply on the comment **and** a private DM to the commenter — using Meta's official Instagram API. Runs free on Cloudflare Workers. Keyword rules answer common comments; Claude AI generates replies for everything else.

> **Known limitation:** the official Instagram API cannot *like* a comment (no such endpoint exists). The public reply is the acknowledgment. Unofficial bots that can like comments violate Instagram's terms and risk your account.

## How it works

```
Someone comments → Meta webhook → Cloudflare Worker
  → verify signature → dedupe → loop/spam guards
  → keyword rule match? use template : ask Claude Haiku
  → POST public reply + POST private DM → log to KV
```

Meta's rules baked in: **one DM per comment**, within 7 days, max 750 DMs/hour (this bot self-limits to 30 replies/hour — raise `MAX_REPLIES_PER_HOUR` in `src/processor.ts` if needed).

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
7. From *App settings → Basic*, copy the **App Secret**.

Because only your own account uses this app, it stays in **Development mode** — no App Review needed.

### 3. Cloudflare Worker

```powershell
cd ig-auto-responder
npm install
npx wrangler login

# Create the KV namespace and paste the returned id into wrangler.toml
npx wrangler kv namespace create STATE

# Fill in IG_USER_ID in wrangler.toml [vars], then set secrets:
npx wrangler secret put IG_ACCESS_TOKEN       # long-lived token from step 2.5
npx wrangler secret put META_APP_SECRET       # from step 2.7
npx wrangler secret put WEBHOOK_VERIFY_TOKEN  # invent a random string, note it down
npx wrangler secret put ANTHROPIC_API_KEY     # from console.anthropic.com
npx wrangler secret put ADMIN_TOKEN           # invent another random string

npm run deploy
```

Note the deployed URL, e.g. `https://ig-auto-responder.<you>.workers.dev`.

### 4. Register the webhook with Meta

1. In the Meta app dashboard → Instagram product → **Webhooks** (or *Configure webhooks* under API setup).
2. Callback URL: `https://ig-auto-responder.<you>.workers.dev/webhook`
3. Verify token: the exact `WEBHOOK_VERIFY_TOKEN` string you chose.
4. Click *Verify and save* — the Worker answers the handshake automatically.
5. **Subscribe to the `comments` field.**

Done. Comment on one of your posts from another account to test.

---

## Verifying it works

1. **Handshake:** step 4.4 succeeding proves `GET /webhook` works.
2. **Test delivery:** in the webhook config, use Meta's **Test** button on `comments` — then check `npm run tail` (live logs) or `GET /log?token=<ADMIN_TOKEN>`.
3. **End-to-end:** from a friend's account, comment `price` on a post → expect the template reply + DM within seconds. Comment a free-form question → expect an AI reply.
4. **Guards:** reply from your own account → no bot response. Meta redelivering the same event → no duplicate reply (deduped by comment ID).

## Day-to-day operations

| Action | How |
|---|---|
| Watch live activity | `npm run tail` |
| Review what the bot sent | `GET https://.../log?token=<ADMIN_TOKEN>` |
| Pause the bot | `GET https://.../config?token=<ADMIN_TOKEN>&enabled=false` |
| Resume | `...&enabled=true` |
| Edit keyword rules without redeploy | write a JSON array of `{keywords, publicReply, dmMessage}` to KV key `config:rules` (`npx wrangler kv key put --binding STATE config:rules "<json>"`) |
| Edit blocklist | KV key `config:blocklist` (JSON array of strings) |
| Token health | `GET /config?token=...` shows the last refresh; a cron refreshes weekly |

## Costs

- Cloudflare Workers/KV: free tier (100k requests/day — far beyond personal volume).
- Meta API: free.
- You can use models like Gemini, Claude, or OpenAI’s paid models, or even free models from operators or locally  deployed models. Small free models are sufficient for this because it is just for replying to comments
## Scaling to production later

The processor is already parameterized by IG user ID, so the path to multi-user is: Meta App Review for Advanced Access (`instagram_business_manage_comments`/`_messages`), an OAuth "Login with Instagram" flow storing per-user tokens (D1/Postgres instead of the single KV token), and per-account rule sets. The webhook/processor/graph modules need no rewrite.

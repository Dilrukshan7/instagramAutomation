# Security: secrets, .gitignore, and key rotation

Several secrets for this project were exposed during development (pasted into config comments and chat). **Rotate all of them before pushing this repo anywhere or scaling up.** This guide covers what to protect, how to rotate every key, and how to verify nothing breaks.

---

## 1. What must never be committed

Already in `.gitignore`:

```gitignore
node_modules/
dist/
.wrangler/
.dev.vars
```

Rules:

- **`.dev.vars`** is the ONLY local file allowed to hold real secret values (used by `wrangler dev`). It is gitignored — keep it that way. `.dev.vars.example` holds placeholders only.
- **`wrangler.toml` is committed and must contain zero secrets** — not even in comments. It holds only: KV namespace ID, `IG_USER_ID`, Graph API version, cron schedule. (KV IDs and IG user IDs are identifiers, not credentials — safe to commit.)
- Never paste secrets into README, commit messages, code comments, or issue trackers.
- Before the first `git push`, audit history: if a secret was ever committed, rotating the key is the only real fix — deleting the file in a later commit does not remove it from history.

Quick audit command:

```powershell
# search the repo (including this file's own examples) for likely leaked values
git grep -I -n -E "sk-ant-|IGAA|whsec_" -- . ':!SECURITY.md'
```

---

## 2. The secrets inventory

| Secret (Worker name) | What it is | Where it comes from |
|---|---|---|
| `IG_ACCESS_TOKEN` | Long-lived Instagram token — full control of comments/DMs | Meta dashboard token generator |
| `META_APP_SECRET` | **Instagram app secret** — validates webhook authenticity | App settings → Basic → *Instagram* section (NOT the general App Secret — see README warning) |
| `WEBHOOK_VERIFY_TOKEN` | Handshake password for webhook registration (≤64 chars) | You invent it |
| `ADMIN_TOKEN` | Dashboard/API password | You invent it |
| `ANTHROPIC_API_KEY` | Claude API billing key | console.anthropic.com |

One more hidden copy: the weekly cron stores **refreshed Instagram tokens in KV** under `config:token`. Rotation must clear it (step below). The dashboard can also store an Anthropic key in KV under `config:anthropic_key`.

---

## 3. Rotation runbook (do all five)

Work from the project folder. Each `wrangler secret put` prompts for the value — paste it at the prompt, never on the command line (shell history!).

### 3.1 Instagram access token

1. Meta dashboard → **Instagram → API setup with Instagram login → Generate token** → log in → copy the new long-lived token.
2. ```powershell
   npx wrangler secret put IG_ACCESS_TOKEN
   ```
3. **Delete the old KV-cached token** (otherwise the Worker keeps using the old one — it prefers the KV copy):
   ```powershell
   npx wrangler kv key delete --binding STATE "config:token" --remote
   npx wrangler kv key delete --binding STATE "config:token_meta" --remote
   ```
4. Verify: `https://graph.instagram.com/v23.0/me?fields=username&access_token=<NEW_TOKEN>` returns your username.

> Note: generating a new token does not always invalidate old ones. To hard-revoke, remove the app from Instagram (*Settings → Website permissions → Apps and websites*) and re-add it, then generate fresh.

### 3.2 Instagram app secret (`META_APP_SECRET`)

1. App settings → Basic → *Instagram* section → **Reset** the Instagram app secret → copy the new value.
2. ```powershell
   npx wrangler secret put META_APP_SECRET
   ```
3. Verify: comment on a post from a second account → the comment appears in the dashboard Activity log. (If you see nothing, check `/api/hooks` — `sigOk:false` means the wrong secret was pasted.)

### 3.3 Webhook verify token

1. Generate a new random string **64 characters or fewer**:
   ```powershell
   -join ((48..57)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```
2. ```powershell
   npx wrangler secret put WEBHOOK_VERIFY_TOKEN
   ```
3. Re-register the webhook so Meta learns the new token (uses App ID + **general** App Secret):
   ```powershell
   curl.exe -X POST "https://graph.facebook.com/v23.0/<APP_ID>/subscriptions?object=instagram&callback_url=https%3A%2F%2F<WORKER_URL>%2Fwebhook&fields=comments&verify_token=<NEW_TOKEN>&access_token=<APP_ID>|<APP_SECRET>"
   ```
   Expect `{"success":true}`.

### 3.4 Admin (dashboard) token

1. Generate a new random string (any length).
2. ```powershell
   npx wrangler secret put ADMIN_TOKEN
   ```
3. Open the dashboard → *Change token* (top right) → sign in with the new value.

### 3.5 Anthropic API key

1. console.anthropic.com → API keys → delete the old key, create a new one.
2. Either set it in the **dashboard** (Bot settings → API key — stored in KV), or:
   ```powershell
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   The dashboard-stored key overrides the wrangler secret; make sure you update whichever one is in use (the dashboard shows which source is active).

### 3.6 General App Secret (bonus)

The general App Secret (App settings → Basic, top) isn't stored in the Worker but was exposed too. Reset it in the dashboard. It's used in the `<APP_ID>|<APP_SECRET>` app token for webhook registration commands — nothing deployed needs updating, just use the new value next time.

---

## 4. After rotating — full verification

1. `npx wrangler secret list` → all five names present.
2. Dashboard loads and accepts the new admin token.
3. Fresh comment from a second account → public reply + DM arrive, Activity log shows `replied`.
4. `GET /api/hooks` (with the new admin token header) → newest entry has `sigOk: true`.

## 5. Ongoing hygiene

- Rotate the Instagram app secret and admin token if you ever share your screen/repo.
- The IG access token auto-refreshes weekly via cron; no manual action needed.
- If the Worker URL ever leaks into spam lists, requests without valid signatures are rejected and logged — check `/api/hooks` occasionally and ignore `sigOk:false` noise from scanners.
- When you later add collaborators or go multi-tenant, move secrets to per-environment Wrangler configs and never share the production `ADMIN_TOKEN`.

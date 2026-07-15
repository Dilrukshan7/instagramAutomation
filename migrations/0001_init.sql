-- Full platform schema. Phase 1 uses accounts/automations/send_logs;
-- later phases fill the rest (created now to avoid migration churn).

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ig_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  media_id TEXT,                          -- NULL = account-level default (future use)
  enabled INTEGER NOT NULL DEFAULT 0,
  auto_reply_enabled INTEGER NOT NULL DEFAULT 1,
  auto_dm_enabled INTEGER NOT NULL DEFAULT 1,
  once_per_user INTEGER NOT NULL DEFAULT 0,  -- suppress repeat automation for same user on same post
  require_follow INTEGER NOT NULL DEFAULT 0, -- Phase 4
  provider_id INTEGER,                       -- Phase 2 (references llm_providers)
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  system_prompt TEXT,
  keyword_triggers TEXT,                     -- JSON; Phase 3
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_automations_media ON automations(account_id, media_id);

CREATE TABLE IF NOT EXISTS message_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL REFERENCES automations(id),
  sort_order INTEGER NOT NULL,
  type TEXT NOT NULL,                        -- public_reply | dm | follow_check | resource
  content_variations TEXT NOT NULL,          -- JSON array of strings
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL,                        -- anthropic | openai_compat | gemini
  label TEXT NOT NULL,
  base_url TEXT,                             -- for openai_compat (incl. local LLM tunnels)
  api_key TEXT,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_test_at TEXT,
  last_test_ok INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  ig_user_id TEXT NOT NULL,
  comment_id TEXT,
  automation_id INTEGER,
  resource_step_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting_follow',  -- waiting_follow | delivered | expired
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_deliveries(status);

CREATE TABLE IF NOT EXISTS send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  ig_user_id TEXT NOT NULL,
  media_id TEXT,
  automation_id INTEGER,
  message_type TEXT NOT NULL,                -- public_reply | dm
  status TEXT NOT NULL,                      -- sent | failed
  error TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_send_logs_user_media ON send_logs(account_id, ig_user_id, media_id);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  ig_user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'auto',        -- auto | human
  flag_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, ig_user_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  automation_id INTEGER,
  event_type TEXT NOT NULL,                  -- comment_received | reply_sent | dm_sent | ...
  provider TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_estimate REAL,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_type_ts ON analytics_events(event_type, ts);

CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  scope TEXT NOT NULL DEFAULT 'global',      -- global | automation
  automation_id INTEGER,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  payload TEXT NOT NULL,                     -- JSON
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | running | done | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_at);

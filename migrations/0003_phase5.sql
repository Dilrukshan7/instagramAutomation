-- Phase 5: comment classification, prompt versioning, analytics.

-- Classification tags on analytics rows (intent/sentiment of a comment).
ALTER TABLE analytics_events ADD COLUMN intent TEXT;      -- question | interested | praise | complaint | spam | other
ALTER TABLE analytics_events ADD COLUMN sentiment TEXT;   -- positive | neutral | negative
CREATE INDEX IF NOT EXISTS idx_analytics_intent ON analytics_events(account_id, intent);

-- Prompt versioning: append-only rows, exactly one is_active per (account, scope).
ALTER TABLE prompts ADD COLUMN label TEXT;
ALTER TABLE prompts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompts ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_prompts_scope ON prompts(account_id, scope, is_active);

-- Phase 4: follow-gated resource delivery.

-- Per-post follow-gate content.
ALTER TABLE automations ADD COLUMN resource_message TEXT;  -- delivered after follow confirmed (or immediately if require_follow off)
ALTER TABLE automations ADD COLUMN nudge_message TEXT;     -- the single proactive DM: thank-you + "follow & reply to get it"

-- Store the resolved resource text on the pending row so delivery is deterministic.
ALTER TABLE pending_deliveries ADD COLUMN resource_text TEXT;
ALTER TABLE pending_deliveries ADD COLUMN nudge_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pending_deliveries ADD COLUMN last_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_deliveries(account_id, ig_user_id, status);

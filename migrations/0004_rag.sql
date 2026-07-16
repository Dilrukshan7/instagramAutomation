-- Phase 6 (RAG): knowledge base for persona/style replies.

-- A named body of reference text (e.g. "Tamil movie dialogs").
CREATE TABLE IF NOT EXISTS kb_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  style_note TEXT,                         -- optional persona hint appended to the prompt
  enabled INTEGER NOT NULL DEFAULT 1,
  embed_model TEXT,                         -- model used to embed its chunks (guards against mixing)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One embeddable chunk (usually a single line/dialog) of a collection.
CREATE TABLE IF NOT EXISTS kb_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  collection_id INTEGER NOT NULL REFERENCES kb_collections(id),
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,                  -- JSON array of floats
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_coll ON kb_chunks(account_id, collection_id);

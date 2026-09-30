-- Run ONCE in the NEW, separate D1 database (Cloudflare dashboard > D1 > Console).
-- This file creates only the Business English tables. Never run it on your piano database.
CREATE TABLE IF NOT EXISTS lesson_progress (
  sync_key_hash TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sync_key_hash, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_updated_at ON lesson_progress (updated_at);

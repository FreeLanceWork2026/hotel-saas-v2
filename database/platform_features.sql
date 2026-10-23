-- Platform feature switches (owner-only, see src/lib/features.ts for the key list).
-- Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.
--
-- Missing rows fall back to the defaults in src/lib/features.ts, so no seed is needed.
-- RLS is ON with no policies: only the service role (server code) can read or write,
-- so a client's admin cannot flip switches from the browser.

CREATE TABLE IF NOT EXISTS platform_features (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_features ENABLE ROW LEVEL SECURITY;

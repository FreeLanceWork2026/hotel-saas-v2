-- Payment checks: receipt image fingerprints + check results + fast duplicate lookups.
-- Idempotent: safe to run more than once in the Supabase SQL Editor.
-- The app keeps working before this runs (it skips the new columns), but
-- image-reuse detection only starts once these columns exist.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_sha256 TEXT;   -- exact image fingerprint (server-computed)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_phash  TEXT;   -- perceptual hash, 16 hex chars (browser-computed, a hint only)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checks       JSONB;  -- { verdict, provider, manual, referenceAgeDays, duplicates[] }

-- Phase 2 POS columns, in case that migration was never run on this database.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS source         TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_amount NUMERIC(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ocr_reference  TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ocr_amount     NUMERIC(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC(5,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ocr_text       TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS flags          JSONB DEFAULT '[]';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS captured_by    TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments (reference_number) WHERE reference_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_sha256    ON payments (proof_sha256)     WHERE proof_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_phash_recent ON payments (created_at DESC) WHERE proof_phash IS NOT NULL;

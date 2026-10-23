-- ============================================================
-- Neil Lewz — Master Database Schema
-- Version: 1.0.0
-- Last Updated: 2026-10-14
--
-- HOW TO USE:
--   Run this entire file in your Supabase SQL Editor.
--   Each section is idempotent (uses IF NOT EXISTS / OR REPLACE).
--   When adding new SQL, append to the relevant section below
--   and add a comment with the date and what changed.
-- ============================================================


-- ============================================================
-- SECTION 1: Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- SECTION 2: Core Tables
-- ============================================================

-- Products catalog
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  name_am      TEXT,
  description  TEXT,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  category     TEXT NOT NULL DEFAULT 'general',
  size         TEXT,
  sku          TEXT UNIQUE,
  barcode      TEXT UNIQUE,
  image_url    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  tag          TEXT,           -- 'bestseller' | 'new' | 'popular'
  stock_qty    INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 5,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT UNIQUE NOT NULL DEFAULT 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6),
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  delivery_type    TEXT NOT NULL DEFAULT 'pickup',  -- 'pickup' | 'delivery'
  delivery_address TEXT,
  items            JSONB NOT NULL DEFAULT '[]',
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
  coins_applied    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'telebirr',
  payment_proof    TEXT,
  status           TEXT NOT NULL DEFAULT 'payment_pending',
  channel          TEXT DEFAULT 'online',    -- 'online' | 'pos'
  operator_id      UUID,
  is_anonymous     BOOLEAN DEFAULT FALSE,
  transaction_id   TEXT UNIQUE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by     UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID REFERENCES orders(id) ON DELETE CASCADE,
  method           TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  transaction_id   TEXT,
  reference_number TEXT,
  payer_name       TEXT,
  proof_path       TEXT,
  proof_filename   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'rejected'
  reviewed_by_label TEXT,
  reviewed_at      TIMESTAMPTZ,
  source           TEXT DEFAULT 'online',   -- 'online' | 'pos'
  receipt_amount   NUMERIC(12,2),
  ocr_reference    TEXT,
  ocr_amount       NUMERIC(12,2),
  ocr_confidence   NUMERIC(5,2),
  ocr_text         TEXT,
  flags            JSONB DEFAULT '[]',
  captured_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order status audit log
CREATE TABLE IF NOT EXISTS order_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (extended user info)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'customer',  -- 'admin' | 'employee' | 'kiosk_operator' | 'customer'
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  pin_hash   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 3: Stock Ledger (Phase 2.5)
-- ============================================================

-- Stock lots / batches
CREATE TABLE IF NOT EXISTS stock_lots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_code   TEXT,
  qty_received INTEGER NOT NULL DEFAULT 0,
  qty_remaining INTEGER NOT NULL DEFAULT 0,
  unit_cost    NUMERIC(12,2),
  expires_at   DATE,
  supplier     TEXT,
  produced_by  TEXT,
  source       TEXT DEFAULT 'purchase',  -- 'purchase' | 'opening' | 'return' | 'adjustment'
  note         TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock movement ledger (append-only)
CREATE TABLE IF NOT EXISTS stock_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_id       UUID REFERENCES stock_lots(id) ON DELETE SET NULL,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_number TEXT,
  delta        INTEGER NOT NULL,  -- positive = in, negative = out
  type         TEXT NOT NULL,     -- 'receive' | 'sell' | 'adjust' | 'return' | 'transfer'
  channel      TEXT,              -- 'pos' | 'online'
  actor        TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- stock_receive RPC: add stock to a product
CREATE OR REPLACE FUNCTION stock_receive(
  p_product    UUID,
  p_qty        INTEGER,
  p_batch_code TEXT    DEFAULT NULL,
  p_expires    DATE    DEFAULT NULL,
  p_supplier   TEXT    DEFAULT NULL,
  p_produced_by TEXT   DEFAULT NULL,
  p_unit_cost  NUMERIC DEFAULT NULL,
  p_note       TEXT    DEFAULT NULL,
  p_actor      TEXT    DEFAULT NULL,
  p_source     TEXT    DEFAULT 'purchase'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Create a lot
  INSERT INTO stock_lots (product_id, batch_code, qty_received, qty_remaining, unit_cost, expires_at, supplier, produced_by, source, note, created_by)
  VALUES (p_product, p_batch_code, p_qty, p_qty, p_unit_cost, p_expires, p_supplier, p_produced_by, p_source, p_note, p_actor);

  -- Log the movement
  INSERT INTO stock_movements (product_id, delta, type, actor, note)
  VALUES (p_product, p_qty, 'receive', p_actor, p_note);

  -- Update product stock_qty
  UPDATE products SET stock_qty = stock_qty + p_qty, updated_at = now()
  WHERE id = p_product;
END;
$$;

-- stock_sell RPC: deduct stock (FEFO order)
CREATE OR REPLACE FUNCTION stock_sell(
  p_product      UUID,
  p_qty          INTEGER,
  p_order_id     UUID    DEFAULT NULL,
  p_order_number TEXT    DEFAULT NULL,
  p_channel      TEXT    DEFAULT 'online',
  p_actor        TEXT    DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  remaining INTEGER := p_qty;
  lot       RECORD;
BEGIN
  -- Deduct from lots in FEFO order (nearest expiry first, then oldest first)
  FOR lot IN
    SELECT id, qty_remaining
    FROM stock_lots
    WHERE product_id = p_product AND qty_remaining > 0
    ORDER BY expires_at NULLS LAST, created_at ASC
  LOOP
    EXIT WHEN remaining <= 0;
    DECLARE
      take INTEGER := LEAST(remaining, lot.qty_remaining);
    BEGIN
      UPDATE stock_lots SET qty_remaining = qty_remaining - take WHERE id = lot.id;
      INSERT INTO stock_movements (product_id, lot_id, order_id, order_number, delta, type, channel, actor)
      VALUES (p_product, lot.id, p_order_id, p_order_number, -take, 'sell', p_channel, p_actor);
      remaining := remaining - take;
    END;
  END LOOP;

  -- Update product stock_qty
  UPDATE products SET stock_qty = GREATEST(0, stock_qty - p_qty), updated_at = now()
  WHERE id = p_product;
END;
$$;

-- stock_return RPC: restore stock when order is cancelled
CREATE OR REPLACE FUNCTION stock_return(
  p_order_id UUID,
  p_actor    TEXT DEFAULT NULL,
  p_reason   TEXT DEFAULT 'Order cancelled'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  mv RECORD;
BEGIN
  FOR mv IN
    SELECT product_id, lot_id, ABS(delta) AS qty
    FROM stock_movements
    WHERE order_id = p_order_id AND type = 'sell'
  LOOP
    -- Restore to lot if still exists
    IF mv.lot_id IS NOT NULL THEN
      UPDATE stock_lots SET qty_remaining = qty_remaining + mv.qty WHERE id = mv.lot_id;
    END IF;

    -- Log the return
    INSERT INTO stock_movements (product_id, lot_id, order_id, delta, type, actor, note)
    VALUES (mv.product_id, mv.lot_id, p_order_id, mv.qty, 'return', p_actor, p_reason);

    -- Update product stock_qty
    UPDATE products SET stock_qty = stock_qty + mv.qty, updated_at = now()
    WHERE id = mv.product_id;
  END LOOP;
END;
$$;

-- stock_adjust RPC: manual correction
CREATE OR REPLACE FUNCTION stock_adjust(
  p_product UUID,
  p_delta   INTEGER,
  p_reason  TEXT DEFAULT NULL,
  p_actor   TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_movements (product_id, delta, type, actor, note)
  VALUES (p_product, p_delta, 'adjust', p_actor, p_reason);

  UPDATE products SET stock_qty = GREATEST(0, stock_qty + p_delta), updated_at = now()
  WHERE id = p_product;
END;
$$;

-- stock_available RPC: check how much stock is available
CREATE OR REPLACE FUNCTION stock_available(p_products UUID[])
RETURNS TABLE(product_id UUID, on_hand INTEGER) LANGUAGE sql AS $$
  SELECT id AS product_id, stock_qty AS on_hand
  FROM products
  WHERE id = ANY(p_products);
$$;


-- ============================================================
-- SECTION 4: Announcements (Added 2026-10-14)
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',   -- 'info' | 'warning' | 'promo' | 'success'
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast active announcement lookups
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (is_active, starts_at, ends_at);


-- ============================================================
-- SECTION 5: Multi-Image Support (Added 2026-10-14)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  storage_path TEXT,           -- path in Supabase Storage (for deletion)
  label       TEXT,            -- e.g. 'front', 'back', 'detail'
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- 0 = primary image
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id, sort_order);


-- ============================================================
-- SECTION 6: Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_lots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images   ENABLE ROW LEVEL SECURITY;

-- Products: public read, admin write
CREATE POLICY IF NOT EXISTS "products_public_read"
  ON products FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "products_admin_write"
  ON products FOR ALL
  USING (auth.role() = 'service_role');

-- Announcements: public read active ones, admin write
CREATE POLICY IF NOT EXISTS "announcements_public_read"
  ON announcements FOR SELECT USING (is_active = TRUE);

CREATE POLICY IF NOT EXISTS "announcements_admin_write"
  ON announcements FOR ALL
  USING (auth.role() = 'service_role');

-- Product images: public read, admin write
CREATE POLICY IF NOT EXISTS "product_images_public_read"
  ON product_images FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "product_images_admin_write"
  ON product_images FOR ALL
  USING (auth.role() = 'service_role');

-- Orders: owner read, service_role write
CREATE POLICY IF NOT EXISTS "orders_owner_read"
  ON orders FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "orders_service_write"
  ON orders FOR ALL
  USING (auth.role() = 'service_role');

-- Payments: service_role only
CREATE POLICY IF NOT EXISTS "payments_service_role"
  ON payments FOR ALL
  USING (auth.role() = 'service_role');

-- Profiles: owner read, service_role write
CREATE POLICY IF NOT EXISTS "profiles_owner_read"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "profiles_service_write"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================
-- SECTION 7: Indexes for Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id    ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments (status);
CREATE INDEX IF NOT EXISTS idx_stock_lots_product   ON stock_lots (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ord  ON stock_movements (order_id);


-- ============================================================
-- SECTION 8: Auto-update updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Added 2026-10-17: payment checks (image fingerprints, verdict, duplicate lookups)
-- ── Payment checks (see database/payment_checks.sql) ──
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_sha256 TEXT;   -- exact image fingerprint (server-computed)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_phash  TEXT;   -- perceptual hash, 16 hex chars (browser-computed, a hint only)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checks       JSONB;  -- { verdict, provider, manual, referenceAgeDays, duplicates[] }
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

-- ============================================================
-- END OF SCHEMA — v1.0.0
-- Next time you add SQL, paste it ABOVE this line in the
-- relevant section. Add a comment: -- Added YYYY-MM-DD: reason
-- ============================================================

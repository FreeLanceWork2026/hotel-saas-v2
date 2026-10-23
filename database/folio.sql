-- ============================================================
-- Entoto Haven — Guest bills (folio), payments, services, credit
-- Run AFTER database/hotel.sql. Safe to run multiple times.
-- ============================================================

-- ── Services catalog (event packages, per-plate meals, extras) ──
-- Prices are defaults: staff can change the price on each bill line.
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_am     TEXT,
  unit        TEXT NOT NULL DEFAULT 'each' CHECK (unit IN ('each', 'plate', 'person', 'day', 'hour')),
  price       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Bill lines on a booking (room/hall price itself = bookings.total_amount) ──
CREATE TABLE IF NOT EXISTS booking_charges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('food', 'service', 'custom')),
  description  TEXT NOT NULL,
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  amount       NUMERIC(12,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  service_id   UUID REFERENCES services(id) ON DELETE SET NULL,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,   -- room-service order from the POS
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at    TIMESTAMPTZ,
  voided_by    TEXT,
  void_reason  TEXT
);
CREATE INDEX IF NOT EXISTS booking_charges_booking_idx ON booking_charges (booking_id);

-- ── Payments against a booking (retainer, part payments, settling credit) ──
CREATE TABLE IF NOT EXISTS booking_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('retainer', 'payment')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash', 'telebirr', 'cbe', 'other')),
  reference    TEXT,
  note         TEXT,
  received_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at    TIMESTAMPTZ,
  voided_by    TEXT,
  void_reason  TEXT
);
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON booking_payments (booking_id);

-- ── Halls/events may check in without a guest ID (rooms still require it, in the app) ──
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_id_on_checkin;

-- ── Credit: an admin must approve before a guest leaves owing money ──
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS credit_approved_by TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS credit_approved_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS credit_note TEXT;

-- ── Old single "deposit" fields → payment rows (one-time move) ──
INSERT INTO booking_payments (booking_id, kind, amount, method, reference, received_by, created_at)
SELECT b.id, 'retainer', b.deposit_amount,
       CASE WHEN b.deposit_method IN ('cash', 'telebirr', 'cbe') THEN b.deposit_method ELSE 'other' END,
       b.deposit_reference, b.created_by, b.created_at
FROM bookings b
WHERE b.deposit_amount > 0
  AND NOT EXISTS (SELECT 1 FROM booking_payments p WHERE p.booking_id = b.id);
UPDATE bookings SET deposit_amount = 0 WHERE deposit_amount > 0;

-- ── Balance per booking (voided lines/payments excluded) ──
-- security_invoker: the view obeys the tables' RLS, so it is never public.
CREATE OR REPLACE VIEW booking_balances WITH (security_invoker = true) AS
SELECT
  b.id AS booking_id,
  b.total_amount AS room_total,
  COALESCE(c.total, 0) AS extras_total,
  b.total_amount + COALESCE(c.total, 0) AS total_due,
  COALESCE(p.total, 0) AS paid,
  b.total_amount + COALESCE(c.total, 0) - COALESCE(p.total, 0) AS balance
FROM bookings b
LEFT JOIN (SELECT booking_id, SUM(amount) AS total FROM booking_charges  WHERE voided_at IS NULL GROUP BY booking_id) c ON c.booking_id = b.id
LEFT JOIN (SELECT booking_id, SUM(amount) AS total FROM booking_payments WHERE voided_at IS NULL GROUP BY booking_id) p ON p.booking_id = b.id;

ALTER TABLE services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_charges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

-- ── Starter services (only when the list is empty) ──
INSERT INTO services (name, name_am, unit, price, sort_order)
SELECT * FROM (VALUES
  ('Wedding package',  'የሰርግ ጥቅል',        'each',  20000::numeric, 1),
  ('Event meal',       'የዝግጅት ምግብ',       'plate',   600::numeric, 2),
  ('Event refreshment','የዝግጅት መስተንግዶ',    'person',  150::numeric, 3)
) AS v(name, name_am, unit, price, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM services);

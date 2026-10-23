-- ============================================================
-- Entoto Haven — Hotel module (rooms, halls, bookings)
-- Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.
-- Demo data lives in database/seed_hotel_demo.sql (run after this).
-- ============================================================

-- Needed for the "no double booking" exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Room types (also meeting halls) ─────────────────────────
-- pricing = 'per_room'  → flat price per night (or per day for halls)
-- pricing = 'per_guest' → price × number of guests (multi-bed rooms: the party
--                         gets the whole room, every guest pays one bed)
CREATE TABLE IF NOT EXISTS room_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  name_am         TEXT,
  kind            TEXT NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'hall')),
  pricing         TEXT NOT NULL DEFAULT 'per_room' CHECK (pricing IN ('per_room', 'per_guest')),
  base_price      NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  weekend_price   NUMERIC(12,2) CHECK (weekend_price >= 0),      -- optional, Fri & Sat
  deposit_amount  NUMERIC(12,2) CHECK (deposit_amount >= 0),     -- optional
  bed_width_m     NUMERIC(3,2),                                  -- optional
  capacity_min    INTEGER,                                       -- halls: people range
  capacity_max    INTEGER,
  description     TEXT,
  description_am  TEXT,
  image_url       TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Seasonal / special prices (optional) ────────────────────
CREATE TABLE IF NOT EXISTS room_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id  UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  label         TEXT,
  starts_on     DATE NOT NULL,
  ends_on       DATE NOT NULL,             -- inclusive
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

-- ── Physical rooms / halls ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        TEXT NOT NULL UNIQUE,
  room_type_id  UUID NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  beds          INTEGER NOT NULL DEFAULT 1 CHECK (beds >= 1),
  housekeeping  TEXT NOT NULL DEFAULT 'clean' CHECK (housekeeping IN ('clean', 'dirty', 'out_of_service')),
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Bookings ────────────────────────────────────────────────
-- Dates are nights for rooms and days for halls: check_out is exclusive
-- (a 1-day hall booking on the 5th is check_in=5th, check_out=6th).
CREATE TABLE IF NOT EXISTS bookings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE
                       DEFAULT 'EH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  room_id            UUID REFERENCES rooms(id) ON DELETE RESTRICT,   -- NULL = guest request, not assigned yet
  room_type_id       UUID REFERENCES room_types(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'reserved'
                       CHECK (status IN ('requested', 'reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  check_in           DATE NOT NULL,
  check_out          DATE NOT NULL,
  guests             INTEGER NOT NULL DEFAULT 1 CHECK (guests >= 1),
  guest_name         TEXT NOT NULL,
  guest_phone        TEXT NOT NULL,
  guest_id_number    TEXT,
  guest_id_photo     TEXT,              -- path in the private "guest-ids" bucket
  nationality        TEXT,
  total_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_method     TEXT,
  deposit_reference  TEXT,
  notes              TEXT,
  source             TEXT NOT NULL DEFAULT 'front_desk',   -- 'front_desk' | 'admin' | 'website'
  created_by         TEXT,
  checked_in_at      TIMESTAMPTZ,
  checked_out_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_dates_check CHECK (check_out > check_in),
  -- The database itself refuses two active bookings for one room on overlapping dates
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out) WITH &&
  ) WHERE (room_id IS NOT NULL AND status IN ('reserved', 'checked_in'))
);

-- Guest ID is required for rooms only (checked in the app); halls/events may skip it.
-- Dropped here for databases created by an earlier version of this file.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_id_on_checkin;

CREATE INDEX IF NOT EXISTS bookings_dates_idx ON bookings (check_in, check_out);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);

-- Service role only (server code). No browser access.
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings   ENABLE ROW LEVEL SECURITY;

-- Private bucket for guest ID photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-ids', 'guest-ids', false)
ON CONFLICT (id) DO NOTHING;

-- ── Restaurant: made-to-order items skip stock tracking ─────
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT TRUE;

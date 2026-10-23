-- ============================================================
-- Entoto Haven — DEMO DATA
-- ⚠ DESTRUCTIVE: wipes products, orders, payments, stock history and
-- all hotel data, then loads the demo hotel. Logins/staff are kept.
-- Run database/hotel.sql first. Everything here can be edited later in the admin UI.
-- ============================================================

-- ── 1. Wipe old shop + hotel data (only tables that exist) ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'room_rates', 'rooms', 'room_types',
    'payment_checks', 'payments', 'order_status_log',
    'stock_movements', 'stock_lots', 'stock_batches', 'inventory_batches',
    'product_images', 'orders', 'products'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. Room types ───────────────────────────────────────────
INSERT INTO room_types (name, name_am, kind, pricing, base_price, bed_width_m, capacity_min, capacity_max, description, description_am, sort_order) VALUES
  ('Suite',          'ስዊት',            'room', 'per_room',  1500, 1.50, NULL, NULL, 'Private room with a 1.5 m bed.',                         'ባለ 1.5 ሜትር አልጋ የግል ክፍል።', 1),
  ('Standard Room',  'መደበኛ ክፍል',      'room', 'per_room',   800, 1.20, NULL, NULL, 'Private room with a 1.2 m bed.',                         'ባለ 1.2 ሜትር አልጋ የግል ክፍል።', 2),
  ('Twin Room',      'ባለ ሁለት አልጋ ክፍል', 'room', 'per_guest',  500, 1.00, NULL, NULL, 'Two 1 m beds. Priced per guest; your party gets the whole room.', 'ሁለት ባለ 1 ሜትር አልጋዎች። ዋጋ በእንግዳ ብዛት ነው፤ ክፍሉ ሙሉ ለእርስዎ ነው።', 3),
  ('Dormitory',      'ዶርሚተሪ',          'room', 'per_guest',  400, 1.00, NULL, NULL, '4, 6 or 8 beds (1 m). Priced per guest; ideal for groups.', '4፣ 6 ወይም 8 አልጋዎች (1 ሜትር)። ዋጋ በእንግዳ ብዛት ነው፤ ለቡድኖች ተመራጭ።', 4),
  ('Meeting Hall A', 'የስብሰባ አዳራሽ ሀ',  'hall', 'per_room',  2000, NULL, 200, 250, 'Large hall for 200–250 people. Priced per day.',          'ለ200–250 ሰዎች ትልቅ አዳራሽ። ዋጋ በቀን።', 5),
  ('Meeting Hall B', 'የስብሰባ አዳራሽ ለ',  'hall', 'per_room',  1000, NULL,  40,  50, 'Hall for 40–50 people. Priced per day.',                  'ለ40–50 ሰዎች አዳራሽ። ዋጋ በቀን።', 6),
  ('Meeting Hall C', 'የስብሰባ አዳራሽ ሐ',  'hall', 'per_room',   800, NULL,  20,  30, 'Hall for 20–30 people. Priced per day.',                  'ለ20–30 ሰዎች አዳራሽ። ዋጋ በቀን።', 7);

-- ── 3. Rooms ────────────────────────────────────────────────
-- Suites: 1, 6, 13
INSERT INTO rooms (number, room_type_id, beds)
SELECT n::text, (SELECT id FROM room_types WHERE name = 'Suite'), 1
FROM unnest(ARRAY[1, 6, 13]) AS n;

-- Standard: 21–25, 27, 29–34
INSERT INTO rooms (number, room_type_id, beds)
SELECT n::text, (SELECT id FROM room_types WHERE name = 'Standard Room'), 1
FROM unnest(ARRAY[21, 22, 23, 24, 25, 27, 29, 30, 31, 32, 33, 34]) AS n;

-- Twin (2 beds): 2–5, 7–12, 26, 28
INSERT INTO rooms (number, room_type_id, beds)
SELECT n::text, (SELECT id FROM room_types WHERE name = 'Twin Room'), 2
FROM unnest(ARRAY[2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 26, 28]) AS n;

-- Dormitory: 14–20 and 35–41 → 4, 4, 4, 4, 6, 6, 8 beds per block (72 beds)
INSERT INTO rooms (number, room_type_id, beds)
SELECT r.n::text, (SELECT id FROM room_types WHERE name = 'Dormitory'), r.beds
FROM (VALUES
  (14, 4), (15, 4), (16, 4), (17, 4), (18, 6), (19, 6), (20, 8),
  (35, 4), (36, 4), (37, 4), (38, 4), (39, 6), (40, 6), (41, 8)
) AS r(n, beds);

-- Halls
INSERT INTO rooms (number, room_type_id, beds) VALUES
  ('Hall A', (SELECT id FROM room_types WHERE name = 'Meeting Hall A'), 1),
  ('Hall B', (SELECT id FROM room_types WHERE name = 'Meeting Hall B'), 1),
  ('Hall C', (SELECT id FROM room_types WHERE name = 'Meeting Hall C'), 1);

-- ── 4. Restaurant menu (made to order → no stock tracking) ──
INSERT INTO products (name, name_am, category, size, price, sku, track_stock, is_active, stock_qty) VALUES
  ('Meal (3 items)',      'ምግብ (3 ዓይነት)',    'Meals',        NULL,    600, 'MEAL-3',   FALSE, TRUE, 0),
  ('Meal (4 items)',      'ምግብ (4 ዓይነት)',    'Meals',        NULL,    700, 'MEAL-4',   FALSE, TRUE, 0),
  ('Meal (5 items)',      'ምግብ (5 ዓይነት)',    'Meals',        NULL,    800, 'MEAL-5',   FALSE, TRUE, 0),
  ('Breakfast (1 item)',  'ቁርስ (1 ዓይነት)',    'Breakfast',    NULL,    200, 'BRK-1',    FALSE, TRUE, 0),
  ('Breakfast (2 items)', 'ቁርስ (2 ዓይነት)',    'Breakfast',    NULL,    300, 'BRK-2',    FALSE, TRUE, 0),
  ('Soup',                'ሾርባ',             'Meals',        NULL,    200, 'SOUP',     FALSE, TRUE, 0),
  ('Tea',                 'ሻይ',              'Refreshments', NULL,     69, 'TEA',      FALSE, TRUE, 0),
  ('Coffee',              'ቡና',              'Refreshments', NULL,     69, 'COFFEE',   FALSE, TRUE, 0),
  ('Macchiato',           'ማኪያቶ',            'Refreshments', NULL,     69, 'MACCHIATO',FALSE, TRUE, 0),
  ('Juice',               'ጭማቂ',             'Refreshments', NULL,    150, 'JUICE',    FALSE, TRUE, 0),
  ('Water',               'ውሃ',              'Refreshments', '500ml',  40, 'WATER-500',FALSE, TRUE, 0);

-- ── 5. Brand ────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    INSERT INTO site_settings (key, value) VALUES
      ('brand_name',     'Entoto Haven'),
      ('brand_tagline',  'Hotel & Restaurant'),
      ('brand_icon',     '🏨'),
      ('hero_title',     'Rest, Meet and Eat Well'),
      ('hero_subtitle',  'Comfortable rooms, meeting halls for up to 250 people, and fresh meals all day.')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;
END $$;

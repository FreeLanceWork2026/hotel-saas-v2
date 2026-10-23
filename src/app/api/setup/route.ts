import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/setup?secret=<SETUP_SECRET>
 * Step 2: Fix orders CHECK constraint + seed products
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  // No fallback: without a configured secret these endpoints stay closed
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const results: Record<string, unknown> = {};

  // ── 1. Fix orders_status_check constraint ──────────────────────────────────
  // The check constraint is blocking under_review and shipped.
  // We need to drop it and recreate with all 7 values.
  // We do this by calling a Postgres function via rpc if available,
  // otherwise we try direct approach.
  //
  // Strategy: Try setting under_review directly — if it works, constraint is fixed.
  // If not, we return the SQL the user must run.

  const { data: firstOrder } = await supabase
    .from("orders")
    .select("id, status")
    .limit(1)
    .single();

  if (firstOrder) {
    const { error: testErr } = await supabase
      .from("orders")
      .update({ status: "payment_review" })
      .eq("id", firstOrder.id);

    if (!testErr) {
      // Restore
      await supabase.from("orders").update({ status: firstOrder.status }).eq("id", firstOrder.id);
      results.ordersConstraint = "✓ payment_review already works — constraint is fixed";
    } else {
      results.ordersConstraint = {
        status: "NEEDS UPDATE — run this SQL in Supabase SQL Editor:",
        sql: `
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'payment_pending',
    'payment_review',
    'confirmed',
    'preparing',
    'packing',
    'on_route',
    'ready_for_pickup',
    'delivered',
    'cancelled'
  ));
`.trim(),
      };
    }
  } else {
    results.ordersConstraint = "No orders in DB — constraint will be tested on next order";
  }

  // ── 2. Check products columns ──────────────────────────────────────────────
  // Try inserting a minimal test row to see what columns exist
  const { data: colCheck, error: colErr } = await supabase
    .from("products")
    .select("*")
    .limit(1);

  const existingCols = colCheck !== null ? (colCheck.length > 0 ? Object.keys(colCheck[0]) : "empty") : `err: ${colErr?.message}`;
  results.productColumns = existingCols;

  // ── 3. Seed products ───────────────────────────────────────────────────────
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    results.seed = `Skipped — ${count} products already in DB`;
  } else {
    // Check if description_am column exists by attempting insert
    const PB1 = "https://images.pexels.com/photos/1618922/pexels-photo-1618922.jpeg?w=600&h=450&fit=crop";
    const PB2 = "https://images.pexels.com/photos/4110255/pexels-photo-4110255.jpeg?w=600&h=450&fit=crop";
    const PB3 = "https://images.pexels.com/photos/8108063/pexels-photo-8108063.jpeg?w=600&h=450&fit=crop";
    const RN  = "https://images.pexels.com/photos/1295572/pexels-photo-1295572.jpeg?w=600&h=450&fit=crop";

    const seeds = [
      {
        name: "Natural Peanut Butter",
        name_am: "ተፈጥሯዊ የለውዝ ቅቤ",
        description: "Our classic 250g jar — stone-pressed from 100% Ethiopian peanuts.",
        description_am: "ክላሲኩ 250ግ ጃር — ከ100% ኢትዮጵያ ለውዝ የድንጋይ ጭነት።",
        size: "250g", price: 120, category: "Spreads",
        image_url: PB1, stock_kg: 15, is_active: true, tag: "popular",  sku: "NL-SPR-250",
      },
      {
        name: "Natural Peanut Butter",
        name_am: "ተፈጥሯዊ የለውዝ ቅቤ",
        description: "Our most popular size. 500g of fresh peanut butter, no additives.",
        description_am: "እጅግ ተወዳጅ መጠናችን። 500ግ ትኩስ ለውዝ ቅቤ፣ ምንም ተጨማሪ የለም።",
        size: "500g", price: 220, category: "Spreads",
        image_url: PB2, stock_kg: 28, is_active: true, tag: "bestseller", sku: "NL-SPR-500",
      },
      {
        name: "Natural Peanut Butter",
        name_am: "ተፈጥሯዊ የለውዝ ቅቤ",
        description: "The family pack. 1kg of pure peanut butter — best value per gram.",
        description_am: "የቤተሰብ ፓኬት። 1ኪግ ንፁህ ትኩስ የለውዝ ቅቤ — ለእያንዳንዱ ግራም ምርጥ ዋጋ።",
        size: "1kg",  price: 400, category: "Spreads",
        image_url: PB3, stock_kg: 12, is_active: true, tag: null,        sku: "NL-SPR-1KG",
      },
      {
        name: "Roasted Peanuts",
        name_am: "ቀቅሎ ለውዝ",
        description: "Slow-roasted in-house with a pinch of sea salt. Crunchy and fresh.",
        description_am: "ትንሽ የባህር ጨው ታከሎ በቤት ውስጥ ቀስ ብሎ ቀቅሎ። አስደናቂ፣ ትኩስ።",
        size: "250g", price: 75,  category: "Nuts",
        image_url: RN,  stock_kg: 8,  is_active: true, tag: "new",       sku: "NL-NUT-250",
      },
    ];

    const { data: seeded, error: seedErr } = await supabase
      .from("products")
      .insert(seeds)
      .select("id, name, sku, size");

    if (seedErr) {
      results.seed = {
        error: seedErr.message,
        hint: "Run this SQL in Supabase first, then call /api/setup again:",
        sql: `
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_am        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_am text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stock_kg       numeric       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tag            text;
`.trim(),
      };
    } else {
      results.seed = {
        ok: true,
        seeded: seeded?.map((p) => `${p.name} ${p.size} (${p.sku})`),
      };
    }
  }

  // ── 4. Inventory Batches Schema ────────────────────────────────────────────
  // Check if expires_at column exists
  const { data: invCols } = await supabase
    .from("inventory_batches")
    .select("expires_at")
    .limit(0);

  if (invCols !== null) {
    results.inventorySchema = "✓ inventory_batches.expires_at exists";
  } else {
    results.inventorySchema = {
      status: "MISSING COLUMNS — run this SQL in Supabase SQL Editor:",
      sql: `
-- Fix inventory_batches schema
ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes       text        DEFAULT NULL;

-- Fix orders status constraint to include all new statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'payment_pending', 'payment_review', 'confirmed',
    'preparing', 'packing', 'on_route', 'ready_for_pickup',
    'delivered', 'cancelled'
  ));
`.trim(),
    };
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  results.nextStep = typeof results.seed === "object" && (results.seed as Record<string,unknown>).ok
    ? "🎉 All done! Visit /shop and /admin/inventory to verify."
    : "Check the 'sql' fields above and run them in Supabase SQL Editor, then call this URL again.";

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

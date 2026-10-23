import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/migrate?secret=<SETUP_SECRET>
 *
 * Runs all pending schema migrations safely (IF NOT EXISTS everywhere).
 * Safe to run multiple times — idempotent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  // No fallback: without a configured secret these endpoints stay closed
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const results: Record<string, string> = {};

  // ── 1. inventory_batches: add expires_at ───────────────────────────────────
  try {
    await supabase.rpc("exec_sql" as never, {
      sql: "ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;",
    });
    results.expires_at = "✓ added (or already exists)";
  } catch {
    results.expires_at = "⚠ rpc unavailable — see manual SQL below";
  }

  // ── 2. inventory_batches: add notes ────────────────────────────────────────
  try {
    await supabase.rpc("exec_sql" as never, {
      sql: "ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;",
    });
    results.notes = "✓ added (or already exists)";
  } catch {
    results.notes = "⚠ rpc unavailable — see manual SQL below";
  }

  // ── 3. orders: fix status check constraint ─────────────────────────────────
  try {
    await supabase.rpc("exec_sql" as never, {
      sql: `
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_status_check
          CHECK (status IN (
            'payment_pending','payment_review','confirmed',
            'preparing','packing','on_route','ready_for_pickup',
            'delivered','cancelled'
          ));
      `,
    });
    results.orders_constraint = "✓ updated";
  } catch {
    results.orders_constraint = "⚠ rpc unavailable — see manual SQL below";
  }

  // ── Test: verify expires_at column exists by attempting a select ───────────
  const { error: testErr } = await supabase
    .from("inventory_batches")
    .select("expires_at")
    .limit(0);

  const expiresAtExists = !testErr;
  results.verify_expires_at = expiresAtExists
    ? "✅ Column exists — inventory logging will work"
    : "❌ Column still missing — run the manual SQL below";

  // ── Manual SQL (always shown as fallback) ──────────────────────────────────
  const manualSQL = `
-- Run this in Supabase Dashboard → SQL Editor
-- Safe to run multiple times

ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes       text        DEFAULT NULL;

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
`.trim();

  return NextResponse.json(
    {
      ok: true,
      results,
      action_needed: !expiresAtExists,
      manual_sql: !expiresAtExists ? manualSQL : "Not needed — schema is up to date ✅",
    },
    { status: 200 }
  );
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/site-settings/migrate
 * Creates the site_settings table if it doesn't exist and seeds defaults.
 * Run once from: Admin → Site Settings (auto-called on first load via page).
 */
export async function POST() {
  const sb = getSupabaseAdmin();

  const sql = `
    CREATE TABLE IF NOT EXISTS site_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL DEFAULT '',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO site_settings (key, value) VALUES
      ('brand_name',     'Addis Bites'),
      ('brand_tagline',  'Fresh Food. Real Flavour.'),
      ('logo_url',       ''),
      ('brand_icon',     '🍽️'),
      ('address',        'Bole Road, Addis Ababa, Ethiopia'),
      ('phone',          '+251 91 234 5678'),
      ('whatsapp',       '+251912345678'),
      ('business_hours', 'Mon–Sun: 7AM – 10PM'),
      ('hero_title',     'Real Food, Real Flavour'),
      ('hero_subtitle',  'From sizzling plates to refreshing drinks — every order prepared fresh.'),
      ('facebook_url',   ''),
      ('instagram_url',  ''),
      ('telegram_url',   ''),
      ('primary_color',  '#d94f28')
    ON CONFLICT (key) DO NOTHING;
  `;

  // Try via RPC exec_sql (if the function exists)
  const { error: rpcErr } = await sb.rpc("exec_sql" as never, { sql } as never);

  if (!rpcErr) {
    return NextResponse.json({ ok: true, message: "site_settings table ready" });
  }

  // Fallback: return the SQL for manual execution
  return NextResponse.json({
    ok: false,
    message: "Auto-migration not available. Run this SQL in your Supabase SQL editor:",
    sql: sql.trim(),
  });
}

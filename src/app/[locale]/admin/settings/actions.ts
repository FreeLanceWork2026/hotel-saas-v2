"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";
import { SETTING_DEFAULTS, type SiteSettings } from "./defaults";

export type { SiteSettings };

/** Fetch all settings as a flat object. Falls back to defaults for missing keys or missing table. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("site_settings").select("key, value");
    if (error) return { ...SETTING_DEFAULTS };
    const map: Record<string, string> = {};
    (data ?? []).forEach(({ key, value }: { key: string; value: string }) => {
      map[key] = value ?? "";
    });
    return Object.fromEntries(
      Object.entries(SETTING_DEFAULTS).map(([k, def]) => [k, map[k] || def])
    ) as SiteSettings;
  } catch {
    return { ...SETTING_DEFAULTS };
  }
}

/** Update one or many settings. Admin-only. */
export async function updateSiteSettings(
  _prev: unknown,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await getAdminActor();
  if (!actor) return { ok: false, error: "Unauthorized" };

  const sb = getSupabaseAdmin();
  const rows = Object.keys(SETTING_DEFAULTS).map((key) => ({
    key,
    value: (formData.get(key) as string | null) ?? "",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/** Ensure the site_settings table exists — called by /api/setup. */
export async function ensureSiteSettingsTable(): Promise<string> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.rpc("exec_sql" as never, {
    sql: `
      CREATE TABLE IF NOT EXISTS site_settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL DEFAULT '',
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      -- Seed defaults if empty
      INSERT INTO site_settings (key, value) VALUES
        ('brand_name',     'Entoto Haven'),
        ('brand_tagline',  'Hotel & Restaurant'),
        ('logo_url',       ''),
        ('brand_icon',     '🏨'),
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
    `,
  } as never);
  return error ? `Error: ${error.message}` : "site_settings table ready";
}

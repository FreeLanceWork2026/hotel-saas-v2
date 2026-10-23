// SERVER-SIDE ONLY — never import this in client components or pages
// Uses the service role key which bypasses Row Level Security
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — only initialized at request time (not at build time).
// This prevents "supabaseUrl is required" errors during static builds on
// Vercel / Cloudflare Pages where env vars are not injected at build time.
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("[AI Studio] Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY) — using fallback client.");
    }
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

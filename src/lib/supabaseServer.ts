// SERVER-SIDE ONLY — cookie-aware Supabase client + current-user helpers
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type Role = "admin" | "employee" | "kiosk_operator" | "customer";

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
  role: Role;
}

/** Supabase client bound to the request cookies (works in RSC, route handlers, actions). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    }
  );
}

/** Returns the signed-in user with their role + display name, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Service role so role lookup never depends on RLS policies
  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const profileName = (profile?.full_name ?? "").trim();

  const name =
    profileName ||
    meta.full_name ||
    meta.name ||
    (user.email ? user.email.split("@")[0] : "Account");

  const rawRole = (profile?.role ?? "customer") as string;
  const role: Role = (["admin", "employee", "kiosk_operator", "customer"] as const).includes(
    rawRole as Role
  )
    ? (rawRole as Role)
    : "customer";

  return {
    id: user.id,
    email: user.email ?? null,
    name,
    avatar: meta.avatar_url || meta.picture || null,
    role,
  };
}

/** Where each role lands right after signing in. */
export function homeForRole(role: Role, locale: string): string {
  switch (role) {
    case "admin":
      return `/${locale}/admin`;
    case "employee":
    case "kiosk_operator":
      return `/${locale}/kiosk`;
    default:
      return `/${locale}/account`;
  }
}

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export interface AdminActor {
  id: string;
  /** e.g. "admin:you@mail.com" — stored in audit/ledger rows */
  label: string;
}

/**
 * Resolve the signed-in admin for server actions / route handlers.
 * Returns null when the caller is not signed in or is not an admin.
 */
export async function getAdminActor(): Promise<AdminActor | null> {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* read-only here */
        },
      },
    }
  );

  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") return null;
  return { id: user.id, label: `admin:${user.email ?? user.id}` };
}

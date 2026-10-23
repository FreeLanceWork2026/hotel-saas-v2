"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// ── Shared Supabase client factory for Server Actions ──────────────────────
async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            // Safe to ignore in middleware/RSC contexts
          }
        },
      },
    }
  );
}

// ── Email / password sign-in ───────────────────────────────────────────────
export async function login(formData: FormData) {
  const email    = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  return { success: true };
}

// ── Google OAuth sign-in ───────────────────────────────────────────────────
export async function signInWithGoogle(redirectTo?: string, locale: string = "en") {
  const headerStore = await headers();

  // Build origin dynamically — works on localhost AND any production domain
  const host   = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const proto  = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const supabase = await getSupabaseServerClient();

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("locale", locale === "am" ? "am" : "en");
  if (redirectTo) callbackUrl.searchParams.set("next", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: {
        access_type: "offline",
        prompt: "consent", // forces account picker every time
      },
    },
  });

  if (error || !data.url) {
    return { error: error?.message ?? "Could not initiate Google sign-in." };
  }

  return { url: data.url };
}

// ── Sign out ───────────────────────────────────────────────────────────────
export async function logout() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return { success: true };
}

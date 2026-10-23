import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { homeForRole, type Role } from "@/lib/supabaseServer";

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth.
 * Exchanges the `code` param for a session, then sends the user to:
 *   - the explicit `next` destination if one was requested, otherwise
 *   - the home for their role (admin → dashboard, employee → kiosk,
 *     customer → account).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code      = searchParams.get("code");
  const next      = searchParams.get("next");
  const locale    = searchParams.get("locale") === "am" ? "am" : "en";
  const error     = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  // If Google returned an OAuth error, redirect to login with the message
  if (error) {
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("oauth_error", errorDesc ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    // No code — something went wrong upstream
    return NextResponse.redirect(new URL(`/${locale}/login?oauth_error=no_code`, origin));
  }

  // Collect cookies on a scratch response; attach them to the final redirect
  const pendingCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => pendingCookies.push(c));
        },
      },
    }
  );

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    console.error("OAuth code exchange error:", exchangeError?.message);
    return NextResponse.redirect(
      new URL(`/${locale}/login?oauth_error=${encodeURIComponent(exchangeError?.message ?? "session_error")}`, origin)
    );
  }

  // Decide where to go
  let destination: string;
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    destination = next;
  } else {
    const { data: profile } = await getSupabaseAdmin()
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    destination = homeForRole((profile?.role ?? "customer") as Role, locale);
  }

  const response = NextResponse.redirect(new URL(destination, origin));
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { featuresForPath, isPathBlocked, type FeatureMap } from "./lib/features";
import { loadFeatures } from "./lib/featuresServer";

// next-intl handles locale detection and redirects
const intlMiddleware = createMiddleware(routing);

// Strip optional locale prefix (/en, /am) from pathname for clean route matching
function stripLocale(pathname: string): string {
  return pathname.replace(/(^\/(en|am))(?=\/|$)/, "") || "/";
}

// Best-effort short cache so gated routes don't hit the DB on every request.
// Platform switch changes therefore take up to FEATURE_TTL_MS to apply everywhere.
const FEATURE_TTL_MS = 15_000;
let featureCache: { at: number; map: FeatureMap } | null = null;

async function cachedFeatures(): Promise<FeatureMap> {
  if (featureCache && Date.now() - featureCache.at < FEATURE_TTL_MS) return featureCache.map;
  const map = await loadFeatures();
  featureCache = { at: Date.now(), map };
  return map;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const bare = stripLocale(pathname);
  const isAmharicPath = /^\/am(\/|$)/.test(pathname);

  // ── 0. Platform feature switches (OFF = hidden completely) ──
  // Only gated paths and /am pay for the lookup; everything else skips it.
  if (featuresForPath(bare).length > 0 || isAmharicPath) {
    const features = await cachedFeatures();

    if (isPathBlocked(bare, features)) {
      if (bare.startsWith("/api")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // The [locale] catch-all calls notFound() → localized 404 page
      const url = request.nextUrl.clone();
      url.pathname = `/${isAmharicPath && features.amharic ? "am" : "en"}/feature-unavailable`;
      return NextResponse.rewrite(url, { status: 404 });
    }

    if (isAmharicPath && !features.amharic) {
      const url = request.nextUrl.clone();
      url.pathname = bare;
      const res = NextResponse.redirect(url);
      // Stop next-intl from detecting Amharic again and bouncing back to /am
      res.cookies.set("NEXT_LOCALE", "en", { path: "/", sameSite: "lax" });
      return res;
    }
  }

  // ── 1. Routes that must bypass ALL middleware ─────────────
  // /auth/callback is the OAuth landing page — intlMiddleware would
  // redirect /auth/callback → /en/auth/callback breaking the code exchange.
  // Sign-out pages redirect immediately so intl is unnecessary.
  const bypassAll =
    bare.startsWith("/auth") ||
    bare.startsWith("/api") ||
    bare.startsWith("/admin/sign-out") ||
    bare.startsWith("/staff/sign-out");

  if (bypassAll) return NextResponse.next();

  // ── 1b. Stray OAuth code on the site root ─────────────────
  // If the redirect URL isn't on Supabase's allow-list, Supabase falls back to the
  // Site URL ("/?code=…"). Forward it to the real callback so sign-in still completes.
  if (bare === "/" && request.nextUrl.searchParams.has("code")) {
    const cb = request.nextUrl.clone();
    cb.pathname = "/auth/callback";
    if (pathname.startsWith("/am")) cb.searchParams.set("locale", "am");
    return NextResponse.redirect(cb);
  }

  // ── 2. Public locale-aware routes — run intl, skip auth ──
  if (bare.startsWith("/login")) return intlMiddleware(request);

  // ── 3. Determine if this route needs protection ─────────
  const isAdminRoute = bare.startsWith("/admin");
  // /kiosk is intentionally NOT protected here: staff can enter with a PIN (no login)
  // or a staff Google account. The kiosk page resolves that itself (see lib/kioskOperator).
  const isStaffRoute = bare.startsWith("/staff");
  const isAccountRoute = bare.startsWith("/account");
  const isProtected  = isAdminRoute || isStaffRoute || isAccountRoute;

  if (!isProtected) return intlMiddleware(request);

  // ── 3. Build Supabase SSR client (Edge-compatible) ─────
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates server-side — more secure than getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 4. Not authenticated → redirect to locale-aware login ──
  if (!user) {
    const localeMatch = pathname.match(/^\/(en|am)\//);
    const locale = localeMatch ? localeMatch[1] : "en";
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 4b. Customer account area — any signed-in user may enter ──
  if (isAccountRoute) return intlMiddleware(request);

  // ── 5. Fetch role — one DB call for all protected routes ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | null;

  // ── 6. Role-based access control ─────────────────────────
  if (isAdminRoute && role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isStaffRoute && role !== "admin" && role !== "employee") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── 7. Authorised — continue with intl middleware ─────────
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Run on every route except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|images|icons|robots.txt|sitemap.xml).*)",
  ],
};

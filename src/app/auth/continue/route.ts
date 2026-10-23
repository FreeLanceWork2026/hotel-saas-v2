import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, homeForRole } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /auth/continue?locale=en
 *
 * Used after email/password sign-in: looks up the signed-in user's role
 * and forwards them to the right place.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const locale = searchParams.get("locale") === "am" ? "am" : "en";

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, origin));
  }
  return NextResponse.redirect(new URL(homeForRole(user.role, locale), origin));
}

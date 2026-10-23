import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** GET /api/me — current signed-in user (or { user: null }). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("/api/me error:", err);
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

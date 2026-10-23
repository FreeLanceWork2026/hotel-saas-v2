import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Lightweight endpoint used by the GitHub Actions keep-alive cron job.
// Performs a minimal DB read to reset the Supabase 7-day inactivity timer.
export async function GET() {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from("orders")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Keep-alive query failed:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Supabase is alive",
      count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Keep-alive error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getKioskAccess } from "@/lib/kioskOperator";

export const dynamic = "force-dynamic";

/**
 * GET /api/kiosk/orders?today=1
 * Returns the authenticated kiosk operator's POS orders from today,
 * with payment status embedded so the queue can show confirmation state.
 */
export async function GET(request: Request) {
  try {
    const { operator } = await getKioskAccess();
    if (!operator) {
      return NextResponse.json({ error: "Kiosk not authenticated." }, { status: 401 });
    }

    const url = new URL(request.url);
    const todayOnly = url.searchParams.get("today") === "1";
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sb = getSupabaseAdmin();

    // Fetch orders with their latest payment record embedded
    let query = sb
      .from("orders")
      .select(`
        id, order_number, customer_name, total, status,
        payment_method, items, created_at, operator_id, channel,
        payments(status, method, flags, created_at)
      `)
      .eq("channel", "pos")
      .order("created_at", { ascending: false })
      .limit(50);

    if (todayOnly) {
      query = query.gte("created_at", todayStart.toISOString());
    }

    if (operator.id) {
      query = query.eq("operator_id", operator.id);
    }

    const { data, error } = await query;

    if (error) {
      // operator_id column may not exist before phase2_pos.sql — retry without it
      if (/operator_id|payments/.test(error.message)) {
        const fallback = await sb
          .from("orders")
          .select("id, order_number, customer_name, total, status, payment_method, items, created_at")
          .eq("channel", "pos")
          .gte("created_at", todayOnly ? todayStart.toISOString() : "1970-01-01")
          .order("created_at", { ascending: false })
          .limit(50);
        return NextResponse.json({ orders: fallback.data ?? [], note: "simplified" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten: attach most recent payment status to each order
    const orders = (data ?? []).map((o) => {
      const pays = Array.isArray(o.payments) ? o.payments : o.payments ? [o.payments] : [];
      // Sort descending to get latest first
      pays.sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestPay = pays[0] ?? null;
      return {
        ...o,
        payments: undefined, // remove the nested array
        payment_status: latestPay?.status ?? null,   // "confirmed" | "pending" | "rejected" | null
        payment_flags: latestPay?.flags ?? [],
        needs_review: latestPay?.status === "pending",
      };
    });

    return NextResponse.json({ orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

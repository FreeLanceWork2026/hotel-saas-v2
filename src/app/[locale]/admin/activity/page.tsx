import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUser } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import ActivityClient from "./ActivityClient";
import LiveRefresh from "@/components/ui/LiveRefresh";


export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/en/login");


  const sb = getSupabaseAdmin();

  // Parallel fetch: status log + stock movements (if available)
  const [statusLog, stockMoves] = await Promise.all([
    sb
      .from("order_status_log")
      .select("id, order_id, from_status, to_status, changed_by, note, created_at, orders(order_number, customer_name, total)")
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("stock_movements")
      .select("id, type, qty, balance_after, reason, actor, channel, order_number, created_at, products(name, size)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <>
      <LiveRefresh intervalMs={10000} tables={["order_status_log", "stock_movements"]} />
      <ActivityClient
        statusLogs={(statusLog.data ?? []) as unknown as Parameters<typeof ActivityClient>[0]["statusLogs"]}
        stockMoves={(stockMoves.data ?? []) as unknown as Parameters<typeof ActivityClient>[0]["stockMoves"]}
        stockReady={!stockMoves.error}
      />
    </>
  );
}

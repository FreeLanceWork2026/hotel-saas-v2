import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import OrdersClient from "./OrdersClient";
import LiveRefresh from "@/components/ui/LiveRefresh";

// Always render fresh — orders change constantly (online + POS + Telegram).
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = getSupabaseAdmin();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, delivery_type, delivery_address, items, subtotal, delivery_fee, total, status, payment_method, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch orders:", error);
  }

  return (
    <>
      <LiveRefresh intervalMs={6000} tables={["orders"]} />
      <OrdersClient initialOrders={orders ?? []} />
    </>
  );
}

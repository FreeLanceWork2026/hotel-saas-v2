"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordReturn, recordSale } from "@/lib/stock";

const VALID_STATUSES = [
  "payment_pending",
  "payment_review",
  "confirmed",
  "preparing",
  "packing",
  "on_route",
  "ready_for_pickup",
  "delivered",
  "cancelled",
] as const;

type OrderStatus = (typeof VALID_STATUSES)[number];

// Once an order reaches one of these, the goods are committed → stock leaves inventory.
const STOCK_COMMITTED: OrderStatus[] = [
  "confirmed", "preparing", "packing", "on_route", "ready_for_pickup", "delivered",
];

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    return { error: "Invalid status value." };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error("Update order status error:", error);
    return { error: error.message };
  }

  // Keep the stock ledger in step with the order (both calls are idempotent in the DB)
  try {
    if (newStatus === "cancelled") {
      await recordReturn(orderId, "admin", "Order cancelled");
    } else if (STOCK_COMMITTED.includes(newStatus)) {
      const { data: order } = await supabase
        .from("orders")
        .select("order_number, items, channel")
        .eq("id", orderId)
        .maybeSingle();
      if (order && Array.isArray(order.items)) {
        await recordSale(
          (order.items as { productId?: string; quantity?: number }[])
            .filter((i) => i?.productId)
            .map((i) => ({ productId: String(i.productId), quantity: Number(i.quantity) || 0 })),
          {
            orderId,
            orderNumber: String(order.order_number),
            channel: order.channel === "pos" ? "pos" : "online",
            actor: "admin",
          }
        );
      }
    }
  } catch (e) {
    console.error("stock sync failed:", e instanceof Error ? e.message : e);
  }

  revalidatePath("/", "layout");
  return { success: true };
}

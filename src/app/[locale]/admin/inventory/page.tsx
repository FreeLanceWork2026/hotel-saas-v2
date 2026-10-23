import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import LiveRefresh from "@/components/ui/LiveRefresh";
import InventoryClient, { type StockRow } from "./InventoryClient";

export const dynamic = "force-dynamic";

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

export default async function AdminInventoryPage() {
  const sb = getSupabaseAdmin();

  const { data: products, error } = await sb
    .from("products")
    .select("*")
    .order("name");
  if (error) console.error("inventory: products failed", error.message);

  const list = products ?? [];
  const stockReady = list.length === 0 || "stock_qty" in list[0];

  const expiryBy = new Map<string, string>();
  const soldBy = new Map<string, number>();

  if (stockReady && list.length > 0) {
    const since = daysAgoIso(30);
    const [batches, sales] = await Promise.all([
      sb
        .from("stock_batches")
        .select("product_id, expires_at")
        .gt("qty_remaining", 0)
        .not("expires_at", "is", null)
        .order("expires_at", { ascending: true })
        .limit(2000),
      sb
        .from("stock_movements")
        .select("product_id, qty")
        .eq("type", "sale")
        .gte("created_at", since)
        .limit(10000),
    ]);
    for (const b of batches.data ?? []) {
      if (!expiryBy.has(b.product_id)) expiryBy.set(b.product_id, b.expires_at as string);
    }
    for (const s of sales.data ?? []) {
      soldBy.set(s.product_id, (soldBy.get(s.product_id) ?? 0) + Math.abs(Number(s.qty)));
    }
  }

  const rows: StockRow[] = list.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    size: (p.size ?? null) as string | null,
    sku: (p.sku ?? null) as string | null,
    barcode: (p.barcode ?? null) as string | null,
    image_url: (p.image_url ?? null) as string | null,
    is_active: !!p.is_active,
    stock_qty: stockReady ? Number(p.stock_qty ?? 0) : 0,
    reorder_level: stockReady ? Number(p.reorder_level ?? 5) : 5,
    next_expiry: expiryBy.get(p.id) ?? null,
    sold_30d: soldBy.get(p.id) ?? 0,
  }));

  return (
    <>
      <LiveRefresh intervalMs={15000} />
      <InventoryClient rows={rows} stockReady={stockReady} />
    </>
  );
}

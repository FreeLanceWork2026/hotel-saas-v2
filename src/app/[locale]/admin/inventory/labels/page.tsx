import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import LabelsClient, { type LabelProduct, type LabelBatch } from "./LabelsClient";

export const dynamic = "force-dynamic";

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; batch?: string; copies?: string }>;
}) {
  const sp = await searchParams;
  const sb = getSupabaseAdmin();

  const { data: products } = await sb
    .from("products")
    .select("id, name, size, price, sku, barcode")
    .order("name");

  const { data: batches, error } = await sb
    .from("stock_batches")
    .select("product_id, batch_code, expires_at, qty_remaining")
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) console.error("labels: batches unavailable:", error.message);

  const list: LabelProduct[] = (products ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    size: (p.size ?? null) as string | null,
    price: Number(p.price),
    sku: (p.sku ?? null) as string | null,
    barcode: (p.barcode ?? null) as string | null,
  }));
  const bl: LabelBatch[] = (batches ?? []).map((b) => ({
    product_id: b.product_id as string,
    batch_code: b.batch_code as string,
    expires_at: (b.expires_at ?? null) as string | null,
    qty_remaining: Number(b.qty_remaining),
  }));

  return (
    <LabelsClient
      products={list}
      batches={bl}
      initialProduct={sp.product ?? ""}
      initialBatch={sp.batch ?? ""}
      initialCopies={Math.min(60, Math.max(1, parseInt(sp.copies ?? "6", 10) || 6))}
    />
  );
}

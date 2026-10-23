import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import ProductsClient from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = getSupabaseAdmin();

  // stock_qty / reorder_level exist only after phase25_stock.sql — fall back to "*" without them
  let stockReady = true;
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) console.error("Failed to fetch products:", error);
  const products = error ? [] : data;
  if (products && products.length > 0 && !("stock_qty" in products[0])) stockReady = false;

  // Fetch extra images for all products in one query
  const productIds = (products ?? []).map((p) => p.id as string);
  const extraImagesMap: Record<string, { id: string; url: string; label: string | null; sort_order: number }[]> = {};

  if (productIds.length > 0) {
    const { data: imgs } = await supabase
      .from("product_images")
      .select("id, product_id, url, label, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });

    if (imgs) {
      for (const img of imgs) {
        const pid = img.product_id as string;
        if (!extraImagesMap[pid]) extraImagesMap[pid] = [];
        extraImagesMap[pid].push({
          id: img.id as string,
          url: img.url as string,
          label: (img.label ?? null) as string | null,
          sort_order: Number(img.sort_order ?? 0),
        });
      }
    }
  }

  const rows = (products ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    name_am: (p.name_am ?? null) as string | null,
    description: (p.description ?? null) as string | null,
    price: Number(p.price),
    category: (p.category ?? "Other") as string,
    size: (p.size ?? null) as string | null,
    barcode: (p.barcode ?? null) as string | null,
    sku: (p.sku ?? null) as string | null,
    image_url: (p.image_url ?? null) as string | null,
    is_active: !!p.is_active,
    stock_qty: stockReady ? Number(p.stock_qty ?? 0) : null,
    reorder_level: stockReady ? Number(p.reorder_level ?? 5) : null,
    extra_images: extraImagesMap[p.id as string] ?? [],
  }));

  return <ProductsClient initialProducts={rows} stockReady={stockReady} />;
}

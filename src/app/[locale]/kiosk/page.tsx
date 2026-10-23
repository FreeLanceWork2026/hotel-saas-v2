import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import KioskClient from "./KioskClient";
import { getKioskAccess } from "@/lib/kioskOperator";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entoto Haven — In-Store Kiosk",
  description: "In-store ordering kiosk for Entoto Haven.",
};

// Kiosk page is fullscreen — no nav bar or footer
export const dynamic = "force-dynamic";

export default async function KioskPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = getSupabaseAdmin();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("price");

  const { operator, deniedAccount } = await getKioskAccess();

  return (
    <KioskClient
      products={(products ?? []).map((p) => ({
        id: p.id, name: p.name, name_am: p.name_am, size: p.size, price: p.price, category: p.category,
        image_url: p.image_url, barcode: p.barcode, sku: p.sku, reorder_level: p.reorder_level,
        // Made-to-order items (meals, drinks) are never "out of stock"
        stock_qty: p.track_stock === false ? null : p.stock_qty ?? null,
      }))}
      locale={locale}
      initialOperator={operator}
      deniedAccount={deniedAccount}
    />
  );
}
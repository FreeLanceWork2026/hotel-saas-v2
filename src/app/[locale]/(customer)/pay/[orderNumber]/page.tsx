import React from "react";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PayClient, { type PayOrder } from "./PayClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete your payment — Entoto Haven",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}) {
  const { locale, orderNumber } = await params;
  const num = decodeURIComponent(orderNumber).trim().toUpperCase();

  const { data: order } = await getSupabaseAdmin()
    .from("orders")
    .select(
      "order_number, status, total, subtotal, delivery_fee, transaction_id, payment_method, payment_note, delivery_type, items, created_at"
    )
    .eq("order_number", num)
    .maybeSingle();

  if (!order) notFound();

  const items = (Array.isArray(order.items) ? order.items : []) as {
    nameEn?: string;
    nameAm?: string;
    size?: string;
    quantity?: number;
    price?: number;
  }[];

  const payOrder: PayOrder = {
    orderNumber: order.order_number,
    status: order.status,
    total: Number(order.total) || 0,
    subtotal: Number(order.subtotal) || 0,
    deliveryFee: Number(order.delivery_fee) || 0,
    reference: order.transaction_id ?? order.order_number,
    hasTransactionId: Boolean(order.transaction_id),
    paymentMethod: order.payment_method === "cbe" ? "cbe" : "telebirr",
    rejectionNote: order.payment_note ?? null,
    deliveryType: order.delivery_type ?? "pickup",
    items: items.map((i) => ({
      name: (locale === "am" ? i.nameAm : i.nameEn) || i.nameEn || "",
      size: i.size ?? "",
      quantity: Number(i.quantity) || 1,
      price: Number(i.price) || 0,
    })),
  };

  return <PayClient order={payOrder} locale={locale === "am" ? "am" : "en"} />;
}

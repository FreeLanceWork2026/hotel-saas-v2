import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import StaffClient from "./StaffClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entoto Haven — Staff Portal",
};

export const dynamic = "force-dynamic";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieStore = await cookies();

  // ── Auth check ──────────────────────────────────────────
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect(`/${locale}/login?redirectTo=/${locale}/staff`);

  // ── Fetch profile to verify employee role ──────────────
  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  // Both "employee" and "admin" roles can access the staff portal
  if (!profile || !["employee", "admin"].includes(profile.role ?? "")) {
    redirect(`/${locale}/login?redirectTo=/${locale}/staff`);
  }

  const staffName = profile.full_name || user.email || "Staff";

  // ── Fetch recent orders (last 100) ─────────────────────
  const { data: rawOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, status, delivery_type, delivery_address, total, items, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // `items` is a JSON array on the order: {nameEn, price, quantity, ...}
  const orders = (rawOrders ?? []).map((o) => {
    const { total, items, ...rest } = o as typeof o & { items: unknown };
    const list = Array.isArray(items)
      ? (items as { nameEn?: string; name?: string; price?: number; quantity?: number }[])
      : [];
    return {
      ...rest,
      total_amount: Number(total) || 0,
      items: list.map((i) => ({
        name_en: i.nameEn ?? i.name ?? "Item",
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.price) || 0,
      })),
    };
  });

  return (
    <StaffClient
      orders={(orders ?? []) as Parameters<typeof StaffClient>[0]["orders"]}
      staffName={staffName}
      locale={locale}
    />
  );
}

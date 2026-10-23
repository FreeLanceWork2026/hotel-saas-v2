import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import shared from "../admin.shared.module.css";
import styles from "./Reports.module.css";
import { BarChart2, TrendingUp, ShoppingBag, Package } from "lucide-react";

export default async function AdminReportsPage() {
  const supabase = getSupabaseAdmin();

  // ── Fetch all orders ────────────────────────────────────
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, total, subtotal, delivery_fee, items, created_at")
    .order("created_at", { ascending: false });

  const allOrders = orders ?? [];

  // ── KPIs ────────────────────────────────────────────────
  const totalRevenue = allOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = allOrders.filter((o) => new Date(o.created_at) >= today);
  const todayRevenue = todayOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthOrders = allOrders.filter((o) => new Date(o.created_at) >= thisMonthStart);
  const monthRevenue = monthOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const avgOrderValue = allOrders.length > 0
    ? totalRevenue / allOrders.filter((o) => o.status !== "cancelled").length
    : 0;

  // ── Revenue by day (last 7 days) ────────────────────────
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const dailyRevenue = last7Days.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const rev = allOrders
      .filter((o) => {
        const d = new Date(o.created_at);
        return d >= day && d < nextDay && o.status !== "cancelled";
      })
      .reduce((s, o) => s + (o.total ?? 0), 0);
    return {
      label: day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      revenue: rev,
    };
  });

  const maxDailyRevenue = Math.max(...dailyRevenue.map((d) => d.revenue), 1);

  // ── Top products by units sold ──────────────────────────
  const productSales: Record<string, { name: string; units: number; revenue: number }> = {};

  for (const order of allOrders.filter((o) => o.status !== "cancelled")) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items as { nameEn?: string; name?: string; quantity: number; price: number }[]) {
      const name = item.nameEn ?? item.name ?? "Unknown";
      if (!productSales[name]) productSales[name] = { name, units: 0, revenue: 0 };
      productSales[name].units   += item.quantity;
      productSales[name].revenue += item.price * item.quantity;
    }
  }

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // ── Order status breakdown ──────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const o of allOrders) {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  }

  const STATUS_DISPLAY: [string, string][] = [
    ["payment_pending",  "Pending"],
    ["payment_review",   "Review"],
    ["confirmed",        "Confirmed"],
    ["preparing",        "Preparing"],
    ["packing",          "Packing"],
    ["on_route",         "On Route"],
    ["ready_for_pickup", "Pickup"],
    ["delivered",        "Delivered"],
    ["cancelled",        "Cancelled"],
  ];

  return (
    <div className={styles.container}>
      {/* ── Page header */}
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Reports &amp; Analytics</h1>
          <p className={shared.pageSubtitle}>Revenue and sales performance at a glance</p>
        </div>
      </div>

      {/* ── KPI cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>
            <TrendingUp size={13} style={{ display: "inline", marginRight: 4 }} />
            Total Revenue
          </p>
          <p className={styles.kpiValue}>{totalRevenue.toLocaleString()} ብር</p>
          <p className={styles.kpiSub}>All time, excl. cancelled</p>
        </div>

        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>
            <BarChart2 size={13} style={{ display: "inline", marginRight: 4 }} />
            This Month
          </p>
          <p className={styles.kpiValue}>{monthRevenue.toLocaleString()} ብር</p>
          <p className={styles.kpiSub}>{monthOrders.length} orders in {today.toLocaleString("default", { month: "long" })}</p>
        </div>

        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>
            <ShoppingBag size={13} style={{ display: "inline", marginRight: 4 }} />
            Today
          </p>
          <p className={styles.kpiValue}>{todayRevenue.toLocaleString()} ብር</p>
          <p className={styles.kpiSub}>{todayOrders.length} orders today</p>
        </div>

        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>
            <Package size={13} style={{ display: "inline", marginRight: 4 }} />
            Avg Order Value
          </p>
          <p className={styles.kpiValue}>{avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ብር</p>
          <p className={styles.kpiSub}>{allOrders.length} total orders</p>
        </div>
      </div>

      {/* ── Revenue last 7 days + Top Products */}
      <div className={styles.grid2}>
        {/* Daily revenue bar chart */}
        <div className={shared.card}>
          <div className={shared.cardHeader}>
            <span className={shared.cardTitle}>Revenue — Last 7 Days</span>
          </div>
          <div className={shared.cardBody}>
            {dailyRevenue.every((d) => d.revenue === 0) ? (
              <p className={styles.empty}>No revenue recorded in the last 7 days.</p>
            ) : (
              <div className={styles.barList}>
                {dailyRevenue.map((day) => (
                  <div key={day.label} className={styles.barRow}>
                    <div className={styles.barLabel}>
                      <span className={styles.barDate}>{day.label}</span>
                      <span className={styles.barAmt}>{day.revenue.toLocaleString()} ብር</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${(day.revenue / maxDailyRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top products */}
        <div className={shared.card}>
          <div className={shared.cardHeader}>
            <span className={shared.cardTitle}>Top Products by Revenue</span>
          </div>
          <div className={shared.cardBody}>
            {topProducts.length === 0 ? (
              <p className={styles.empty}>No sales data yet.</p>
            ) : (
              topProducts.map((p, i) => (
                <div key={p.name} className={styles.productRow}>
                  <span className={styles.productRank}>{i + 1}</span>
                  <span className={styles.productName}>{p.name}</span>
                  <div className={styles.productMeta}>
                    <span className={styles.productUnits}>{p.units} units</span>
                    <span className={styles.productRev}>{p.revenue.toLocaleString()} ብር</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Order status breakdown */}
      <div className={shared.card}>
        <div className={shared.cardHeader}>
          <span className={shared.cardTitle}>Order Status Breakdown</span>
        </div>
        <div className={shared.cardBody}>
          <div className={styles.statusGrid}>
            {STATUS_DISPLAY.map(([key, label]) => (
              <div key={key} className={styles.statusCell}>
                <div className={styles.statusCount}>{statusCounts[key] ?? 0}</div>
                <div className={styles.statusLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

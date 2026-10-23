import React from "react";
import Link from "next/link";
import styles from "./AdminDashboard.module.css";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import LiveRefresh from "@/components/ui/LiveRefresh";
import {
  Package,
  TrendingUp,
  Archive,
  Users,
  ShoppingCart,
  Plus,
  ClipboardList,
} from "lucide-react";

// Map DB status → CSS class
function getStatusClass(status: string) {
  const map: Record<string, string> = {
    payment_pending:  styles.statusPending,
    payment_review:   styles.statusReview,
    confirmed:        styles.statusConfirmed,
    preparing:        styles.statusPreparing,
    packing:          styles.statusPacking,
    on_route:         styles.statusOnRoute,
    ready_for_pickup: styles.statusPickup,
    delivered:        styles.statusDelivered,
    cancelled:        styles.statusCancelled,
  };
  return map[status] ?? styles.statusPending;
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    payment_pending:  "Pending",
    payment_review:   "Review",
    confirmed:        "Confirmed",
    preparing:        "Preparing",
    packing:          "Packing",
    on_route:         "On Route",
    ready_for_pickup: "For Pickup",
    delivered:        "Delivered",
    cancelled:        "Cancelled",
  };
  return map[status] ?? status;
}

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = getSupabaseAdmin();

  // Parallel data fetch
  const [
    { count: productsCount },
    { count: employeesCount },
    { count: ordersCount },
    { data: recentOrders },
    { data: todayOrders },
    { data: lowStockBatches },
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, total, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    supabase
      .from("inventory_batches")
      .select("id, quantity, product:products(name)")
      .lt("quantity", 10)
      .order("quantity", { ascending: true })
      .limit(5),
  ]);

  const todaySales = (todayOrders ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
  const todayOrderCount = (todayOrders ?? []).length;

  const now = new Date();
  const timeStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <LiveRefresh intervalMs={10000} tables={["orders"]} />
      {/* Page header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>{timeStr} · Welcome back!</p>
      </div>

      {/* KPI Stat Cards */}
      <div className={styles.statGrid}>
        <div className={`${styles.statCard} ${styles.orange}`}>
          <div className={styles.statTop}>
            <div className={styles.statIconWrap}>
              <TrendingUp size={18} className={styles.statIcon} />
            </div>
            <span className={`${styles.statTrend} ${todaySales > 0 ? styles.statTrendUp : styles.statTrendNeutral}`}>
              Today
            </span>
          </div>
          <div className={styles.statBottom}>
            <p className={styles.statLabel}>Today&apos;s Revenue</p>
            <p className={styles.statValue}>{todaySales.toLocaleString()} ብር</p>
            <p className={styles.statSub}>{todayOrderCount} order{todayOrderCount !== 1 ? "s" : ""} placed today</p>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.blue}`}>
          <div className={styles.statTop}>
            <div className={styles.statIconWrap}>
              <ShoppingCart size={18} className={styles.statIcon} />
            </div>
          </div>
          <div className={styles.statBottom}>
            <p className={styles.statLabel}>Total Orders</p>
            <p className={styles.statValue}>{ordersCount ?? 0}</p>
            <p className={styles.statSub}>All time</p>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.green}`}>
          <div className={styles.statTop}>
            <div className={styles.statIconWrap}>
              <Package size={18} className={styles.statIcon} />
            </div>
          </div>
          <div className={styles.statBottom}>
            <p className={styles.statLabel}>Active Products</p>
            <p className={styles.statValue}>{productsCount ?? 0}</p>
            <p className={styles.statSub}>Listed in store</p>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.purple}`}>
          <div className={styles.statTop}>
            <div className={styles.statIconWrap}>
              <Users size={18} className={styles.statIcon} />
            </div>
          </div>
          <div className={styles.statBottom}>
            <p className={styles.statLabel}>Active Employees</p>
            <p className={styles.statValue}>{employeesCount ?? 0}</p>
            <p className={styles.statSub}>Team members</p>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.amber}`}>
          <div className={styles.statTop}>
            <div className={styles.statIconWrap}>
              <Archive size={18} className={styles.statIcon} />
            </div>
            {(lowStockBatches?.length ?? 0) > 0 && (
              <span className={`${styles.statTrend} ${styles.statTrendDown}`}>
                ⚠ Alert
              </span>
            )}
          </div>
          <div className={styles.statBottom}>
            <p className={styles.statLabel}>Low Stock Batches</p>
            <p className={styles.statValue}>{lowStockBatches?.length ?? 0}</p>
            <p className={styles.statSub}>Below 10 units</p>
          </div>
        </div>
      </div>

      {/* Lower Section */}
      <div className={styles.lowerGrid}>
        {/* Recent Orders */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Recent Orders</span>
            <Link href={`/${locale}/admin/orders`} className={styles.panelLink}>View all →</Link>
          </div>
          <div className={styles.panelBody}>
            {(recentOrders ?? []).length === 0 ? (
              <p className={styles.emptyState}>No orders yet.</p>
            ) : (
              <table className={styles.ordersTable}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders!.map((order) => (
                    <tr key={order.id}>
                      <td><span className={styles.orderNum}>#{order.order_number}</span></td>
                      <td><span className={styles.orderCustomer}>{order.customer_name}</span></td>
                      <td><span className={styles.orderTotal}>{order.total?.toLocaleString()} ብር</span></td>
                      <td>
                        <span className={`${styles.statusBadge} ${getStatusClass(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Quick Actions */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Quick Actions</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.quickGrid}>
                <Link href={`/${locale}/admin/orders`} className={styles.quickBtn}>
                  <div className={styles.quickBtnIcon} style={{ background: "rgba(59,130,246,0.12)" }}>
                    <ClipboardList size={16} color="var(--a-blue)" />
                  </div>
                  <span className={styles.quickBtnLabel}>View Orders</span>
                  <span className={styles.quickBtnSub}>Manage incoming</span>
                </Link>
                <Link href={`/${locale}/admin/products`} className={styles.quickBtn}>
                  <div className={styles.quickBtnIcon} style={{ background: "rgba(200,137,30,0.12)" }}>
                    <Plus size={16} color="var(--a-gold)" />
                  </div>
                  <span className={styles.quickBtnLabel}>Add Product</span>
                  <span className={styles.quickBtnSub}>Product catalog</span>
                </Link>
                <Link href={`/${locale}/admin/inventory`} className={styles.quickBtn}>
                  <div className={styles.quickBtnIcon} style={{ background: "rgba(124,58,237,0.12)" }}>
                    <Archive size={16} color="var(--a-violet)" />
                  </div>
                  <span className={styles.quickBtnLabel}>Log Batch</span>
                  <span className={styles.quickBtnSub}>Inventory</span>
                </Link>
                <Link href={`/${locale}/admin/employees`} className={styles.quickBtn}>
                  <div className={styles.quickBtnIcon} style={{ background: "rgba(61,122,82,0.15)" }}>
                    <Users size={16} color="var(--a-green)" />
                  </div>
                  <span className={styles.quickBtnLabel}>Employees</span>
                  <span className={styles.quickBtnSub}>Manage team</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Low Stock Alert */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Low Stock</span>
                <Link href={`/${locale}/admin/inventory`} className={styles.panelLink}>Manage →</Link>
            </div>
            <div className={styles.panelBody}>
              {(lowStockBatches ?? []).length === 0 ? (
                <p className={styles.emptyState}>All stock levels are healthy ✓</p>
              ) : (
                lowStockBatches!.map((batch) => (
                  <div key={batch.id} className={styles.stockItem}>
                    <span className={styles.stockName}>
                      {(batch.product as unknown as { name: string } | null)?.name ?? "Unknown"}
                    </span>
                    <span className={`${styles.stockQty} ${batch.quantity < 5 ? styles.stockQtyLow : styles.stockQtyOk}`}>
                      {batch.quantity} units
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { LogOut, Loader2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import styles from "./Staff.module.css";
import { updateOrderStatus } from "../admin/orders/actions";
import { useToast } from "@/components/ui/Toast";
import LiveRefresh from "@/components/ui/LiveRefresh";

// ── Types ────────────────────────────────────────────────
type OrderStatus =
  | "payment_pending" | "payment_review" | "confirmed"
  | "preparing" | "packing" | "on_route" | "ready_for_pickup"
  | "delivered" | "cancelled";

interface OrderItem {
  name_en: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  delivery_type: string;
  delivery_address: string | null;
  total_amount: number;
  created_at: string;
  items: OrderItem[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  payment_pending:   "⏳ Payment Pending",
  payment_review:    "🔍 Under Review",
  confirmed:         "✅ Confirmed",
  preparing:         "👨‍🍳 Preparing",
  packing:           "📦 Packing",
  on_route:          "🚗 On Route",
  ready_for_pickup:  "🏪 Ready for Pickup",
  delivered:         "✅ Delivered",
  cancelled:         "❌ Cancelled",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  payment_pending:  styles.statusPending,
  payment_review:   styles.statusReview,
  confirmed:        styles.statusConfirmed,
  preparing:        styles.statusPreparing,
  packing:          styles.statusPacking,
  on_route:         styles.statusOnRoute,
  ready_for_pickup: styles.statusReady,
  delivered:        styles.statusDelivered,
  cancelled:        styles.statusCancelled,
};

// Statuses staff are allowed to set (subset of all statuses — no payment decisions)
const STAFF_STATUSES: OrderStatus[] = [
  "confirmed", "preparing", "packing", "on_route", "ready_for_pickup", "delivered",
];

const FILTER_TABS: { label: string; value: OrderStatus | "all" | "active" }[] = [
  { label: "All",         value: "all" },
  { label: "Active",      value: "active" },
  { label: "Preparing",   value: "preparing" },
  { label: "Packing",     value: "packing" },
  { label: "On Route",    value: "on_route" },
  { label: "Ready",       value: "ready_for_pickup" },
  { label: "Delivered",   value: "delivered" },
];

const ACTIVE_STATUSES: OrderStatus[] = ["confirmed", "preparing", "packing", "on_route", "ready_for_pickup"];

// ── Order Card ───────────────────────────────────────────
const msSince = (iso: string) => Date.now() - new Date(iso).getTime();

function OrderCard({ order, locale }: { order: Order; locale: string }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(order.status);
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order.status);
  const [isPending, startTransition] = useTransition();
  const { success, error } = useToast();

  // Follow the server when someone else (admin / Telegram) changes this order's status.
  const [lastStatus, setLastStatus] = useState(order.status);
  if (order.status !== lastStatus) {
    setLastStatus(order.status);
    setCurrentStatus(order.status);
    setSelectedStatus(order.status);
  }

  const handleUpdate = () => {
    if (selectedStatus === currentStatus) return;
    startTransition(async () => {
      const res = await updateOrderStatus(order.id, selectedStatus);
      if (res?.error) {
        error("Update Failed", res.error);
      } else {
        setCurrentStatus(selectedStatus);
        success("Status Updated", `Order #${order.order_number} → ${STATUS_LABELS[selectedStatus]}`);
      }
    });
  };

  const timeAgo = (() => {
    const diff = msSince(order.created_at);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(order.created_at).toLocaleDateString();
  })();

  return (
    <div className={styles.orderCard}>
      <div className={styles.orderHead} onClick={() => setExpanded((v) => !v)}>
        <span className={styles.orderNum}>#{order.order_number}</span>

        <div className={styles.orderCustomer}>
          <div className={styles.orderName}>{order.customer_name}</div>
          <div className={styles.orderPhone}>{order.customer_phone}</div>
        </div>

        <div className={styles.orderMeta}>
          <span className={`${styles.badge} ${STATUS_BADGE[currentStatus]}`}>
            {STATUS_LABELS[currentStatus]}
          </span>
          <span className={styles.orderTotal}>{order.total_amount.toLocaleString()} ብር</span>
          <span className={styles.orderTime}>{timeAgo}</span>
          {expanded ? <ChevronUp size={16} style={{ color: "#5e5141" }} /> : <ChevronDown size={16} style={{ color: "#5e5141" }} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.orderBody}>
          {/* Items */}
          <div className={styles.orderItems}>
            {(order.items ?? []).map((item, i) => (
              <div key={i} className={styles.orderItem}>
                <span>
                  <span className={styles.orderItemQty}>{item.quantity}×</span>{" "}
                  {item.name_en}
                </span>
                <span>{(item.unit_price * item.quantity).toLocaleString()} ብር</span>
              </div>
            ))}
          </div>

          {/* Delivery info */}
          <div className={styles.orderDelivery}>
            {order.delivery_type === "delivery" ? (
              <>🚗 Delivery to: <strong>{order.delivery_address || "—"}</strong></>
            ) : (
              <>🏪 Pickup — customer will collect in store</>
            )}
          </div>

          {/* Status updater — only for non-terminal statuses */}
          {currentStatus !== "delivered" && currentStatus !== "cancelled" && (
            <div className={styles.statusUpdater}>
              <span className={styles.statusLabel}>Update status:</span>
              <select
                className={styles.statusSelect}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
              >
                {STAFF_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                className={styles.updateBtn}
                onClick={handleUpdate}
                disabled={isPending || selectedStatus === currentStatus}
              >
                {isPending
                  ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                  : <RefreshCw size={14} />
                }
                Update
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────
export default function StaffClient({
  orders: initialOrders,
  staffName,
  locale,
}: {
  orders: Order[];
  staffName: string;
  locale: string;
}) {
  const [filter, setFilter] = useState<"all" | "active" | OrderStatus>("active");

  const filtered = initialOrders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return ACTIVE_STATUSES.includes(o.status);
    return o.status === filter;
  });

  const pending    = initialOrders.filter((o) => o.status === "payment_pending").length;
  const active     = initialOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const delivered  = initialOrders.filter((o) => o.status === "delivered").length;

  return (
    <div className={styles.shell}>
      <LiveRefresh intervalMs={6000} tables={["orders"]} />
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🍽️</div>
          <div>
            <div className={styles.brandName}>Entoto Haven</div>
          </div>
          <span className={styles.brandBadge}>Staff</span>
        </div>

        <span className={styles.staffName}>👤 {staffName}</span>

        <div className={styles.topRight}>
          <Link href={`/${locale}/staff/sign-out`} className={styles.signOutBtn}>
            <LogOut size={14} />
            Sign Out
          </Link>
        </div>
      </div>

      <div className={styles.page}>
        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Active Orders</span>
            <span className={styles.statValue}>{active}</span>
            <span className={styles.statSub}>in progress</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Awaiting Payment</span>
            <span className={styles.statValue}>{pending}</span>
            <span className={styles.statSub}>need admin action</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Delivered Today</span>
            <span className={styles.statValue}>{delivered}</span>
            <span className={styles.statSub}>completed</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Orders</span>
            <span className={styles.statValue}>{initialOrders.length}</span>
            <span className={styles.statSub}>all time shown</span>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>Filter:</span>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              className={`${styles.filterTab} ${filter === tab.value ? styles.filterTabActive : ""}`}
              onClick={() => setFilter(tab.value as typeof filter)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders */}
        <div className={styles.orderList}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No orders matching this filter.</div>
          ) : (
            filtered.map((order) => (
              <OrderCard key={order.id} order={order} locale={locale} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

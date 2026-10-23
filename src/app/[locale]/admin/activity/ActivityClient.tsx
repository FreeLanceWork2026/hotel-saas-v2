"use client";

import React, { useMemo, useState } from "react";
import {
  Activity, Package, ShoppingCart, RefreshCw, AlertTriangle,
  ArrowRight, Search, Filter,
} from "lucide-react";
import shared from "../admin.shared.module.css";
import styles from "./Activity.module.css";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface StatusLogRow {
  id: string;
  order_id: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  note: string | null;
  created_at: string;
  orders: { order_number: string; customer_name: string; total: number } | null;
}

interface StockMoveRow {
  id: string;
  type: string;
  qty: number;
  balance_after: number | null;
  reason: string | null;
  actor: string | null;
  channel: string | null;
  order_number: string | null;
  created_at: string;
  products: { name: string; size: string | null } | null;
}

type LogEntry = {
  id: string;
  kind: "order" | "stock";
  ts: Date;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  actor: string;
  note?: string;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
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

const MOVE_LABEL: Record<string, string> = {
  receive: "Stock received",
  produce: "Produced",
  sale:    "Sold",
  adjust:  "Adjusted",
  waste:   "Written off",
  return:  "Returned",
};

const MOVE_COLOR: Record<string, string> = {
  receive: "var(--a-green, #22c55e)",
  produce: "var(--a-blue, #3b82f6)",
  sale:    "var(--a-red, #ef4444)",
  adjust:  "var(--a-gold)",
  waste:   "var(--a-muted-2)",
  return:  "var(--a-blue, #3b82f6)",
};

function timeAgo(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function actorLabel(raw: string | null | undefined) {
  if (!raw) return "System";
  if (raw.startsWith("admin:")) return raw.replace("admin:", "").split("@")[0];
  if (raw.startsWith("pos:"))   return raw.replace("pos:", "");
  if (raw.startsWith("telegram")) return "Telegram";
  return raw;
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function ActivityClient({
  statusLogs,
  stockMoves,
  stockReady,
}: {
  statusLogs: StatusLogRow[];
  stockMoves: StockMoveRow[];
  stockReady: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "order" | "stock">("all");

  // Merge and sort all events into one timeline
  const entries = useMemo<LogEntry[]>(() => {
    const list: LogEntry[] = [];

    for (const row of statusLogs) {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const title = `Order #${order?.order_number ?? "—"} → ${STATUS_LABEL[row.to_status] ?? row.to_status}`;
      const subtitle = order ? `${order.customer_name} · ${Number(order.total).toLocaleString()} ብር` : "";
      list.push({
        id: `s-${row.id}`,
        kind: "order",
        ts: new Date(row.created_at),
        icon: <ShoppingCart size={14} />,
        title,
        subtitle,
        badge: STATUS_LABEL[row.to_status] ?? row.to_status,
        badgeColor: row.to_status === "cancelled" ? "var(--a-red,#ef4444)"
          : row.to_status === "delivered"   ? "var(--a-green,#22c55e)"
          : row.to_status === "confirmed"   ? "var(--a-gold)"
          : "var(--a-muted-2)",
        actor: actorLabel(row.changed_by),
        note: row.note ?? undefined,
      });
    }

    for (const row of stockMoves) {
      const prod = Array.isArray(row.products) ? row.products[0] : row.products;
      const prodName = prod ? `${prod.name}${prod.size ? ` ${prod.size}` : ""}` : "Unknown product";
      const qtyAbs = Math.abs(row.qty);
      const title = `${MOVE_LABEL[row.type] ?? row.type}: ${qtyAbs} × ${prodName}`;
      const subtitle = row.order_number
        ? `Order #${row.order_number}${row.balance_after !== null ? ` · ${row.balance_after} remaining` : ""}`
        : row.balance_after !== null ? `Balance: ${row.balance_after}` : "";
      list.push({
        id: `m-${row.id}`,
        kind: "stock",
        ts: new Date(row.created_at),
        icon: <Package size={14} />,
        title,
        subtitle,
        badge: MOVE_LABEL[row.type] ?? row.type,
        badgeColor: MOVE_COLOR[row.type] ?? "var(--a-muted-2)",
        actor: actorLabel(row.actor),
        note: row.reason ?? undefined,
      });
    }

    list.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return list;
  }, [statusLogs, stockMoves]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.subtitle.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, search, filter]);

  return (
    <div>
      {/* Header */}
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Activity Log</h1>
          <p className={shared.pageSubtitle}>
            {entries.length} events — order changes + stock movements
            {!stockReady && <span style={{ color: "var(--a-gold)", marginLeft: 8 }}>· Stock events require phase25_stock.sql</span>}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search orders, products, actors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <Filter size={14} style={{ color: "var(--a-dim)" }} />
          {(["all", "order", "stock"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? `All (${entries.length})` : f === "order" ? `Orders (${entries.filter(e => e.kind === "order").length})` : `Stock (${entries.filter(e => e.kind === "stock").length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className={shared.card} style={{ textAlign: "center", padding: "3rem" }}>
          <Activity size={40} style={{ color: "var(--a-dim)", marginBottom: "1rem" }} />
          <p style={{ color: "var(--a-dim)" }}>{search ? "No matching events." : "No activity recorded yet."}</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {filtered.map((e, i) => (
            <div key={e.id} className={styles.event}>
              {/* Connector */}
              <div className={styles.connector}>
                <div className={`${styles.dot} ${e.kind === "stock" ? styles.dotStock : styles.dotOrder}`}>
                  {e.icon}
                </div>
                {i < filtered.length - 1 && <div className={styles.line} />}
              </div>

              {/* Content */}
              <div className={styles.eventBody}>
                <div className={styles.eventHead}>
                  <span className={styles.eventTitle}>{e.title}</span>
                  {e.badge && (
                    <span className={styles.badge} style={{ color: e.badgeColor, borderColor: e.badgeColor + "44", background: e.badgeColor + "18" }}>
                      {e.badge}
                    </span>
                  )}
                </div>
                {e.subtitle && <p className={styles.eventSub}>{e.subtitle}</p>}
                {e.note && <p className={styles.eventNote}>{e.note}</p>}
                <div className={styles.eventMeta}>
                  <span className={styles.actor}>{e.actor}</span>
                  <span className={styles.ts}>{timeAgo(e.ts)}</span>
                  <span className={styles.tsAbs}>{e.ts.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

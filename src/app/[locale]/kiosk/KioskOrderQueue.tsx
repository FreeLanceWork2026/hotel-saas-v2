"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  ListOrdered, Clock, CheckCircle2, AlertCircle, XCircle,
  Loader2, X, Banknote, Smartphone, Landmark, ShieldCheck, BedDouble } from "lucide-react";
import styles from "./OrderQueue.module.css";

interface QueueOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number;
  status: string;
  payment_method: string;
  items: { nameEn?: string; quantity?: number; name?: string }[];
  created_at: string;
  // Enriched by API
  payment_status: "confirmed" | "pending" | "rejected" | null;
  payment_flags: string[];
  needs_review: boolean;
}

/** What to actually display for each POS sale */
function PaymentStatusChip({ order }: { order: QueueOrder }) {
  const isCash    = order.payment_method === "cash";
  const isPaid    = order.payment_status === "confirmed";
  const isPending = order.payment_status === "pending" || order.needs_review;
  const isRejected = order.payment_status === "rejected";

  if (order.payment_method === "room") {
    // Charged to a guest's room bill — settled at check-out
    return (
      <span className={styles.chipGreen}>
        <BedDouble size={12} /> On room bill
      </span>
    );
  }

  if (isCash) {
    // Cash sales: payment is always instant
    return (
      <span className={styles.chipGreen}>
        <Banknote size={12} /> Cash — Collected
      </span>
    );
  }

  if (isPaid) {
    return (
      <span className={styles.chipGreen}>
        <ShieldCheck size={12} /> Payment confirmed
      </span>
    );
  }

  if (isPending) {
    return (
      <span className={styles.chipAmber}>
        <Clock size={12} /> Awaiting admin confirmation
      </span>
    );
  }

  if (isRejected) {
    return (
      <span className={styles.chipRed}>
        <XCircle size={12} /> Payment rejected
      </span>
    );
  }

  // No payment record yet
  return (
    <span className={styles.chipAmber}>
      <AlertCircle size={12} /> Payment not yet verified
    </span>
  );
}

const METHOD_ICON: Record<string, React.ReactNode> = {
  cash:      <Banknote size={12} />,
  telebirr:  <Smartphone size={12} />,
  cbe:       <Landmark size={12} />,
};

export default function KioskOrderQueue({ operatorId }: { operatorId: string }) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const load = () => {
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/kiosk/orders?today=1&t=${Date.now()}`);
        const json = await res.json();
        if (Array.isArray(json.orders)) setOrders(json.orders);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the server when the panel opens
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-refresh every 20s while open (payment confirmations come in async)
  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // How many digital orders need admin confirmation?
  const pendingCount = orders.filter(
    (o) => o.payment_method !== "cash" && o.payment_method !== "room" && o.payment_status !== "confirmed"
  ).length;

  const todayTotal = orders.reduce(
    (s, o) => (o.status !== "cancelled" ? s + o.total : s), 0
  );
  const cashTotal = orders
    .filter((o) => o.payment_method === "cash" && o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  const digitalConfirmed = orders
    .filter((o) => o.payment_method !== "cash" && o.payment_status === "confirmed")
    .reduce((s, o) => s + o.total, 0);

  return (
    <>
      {/* Toggle button */}
      <button
        className={styles.queueToggle}
        onClick={() => setOpen((v) => !v)}
        title="My orders today"
      >
        <ListOrdered size={18} />
        {pendingCount > 0 && (
          <span className={styles.pendingBadge}>{pendingCount}</span>
        )}
      </button>

      {/* Backdrop */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {/* Panel */}
      <div className={`${styles.panel} ${open ? styles.panelOpen : ""}`}>
        <div className={styles.panelHead}>
          <div>
            <div className={styles.panelTitle}>
              <ListOrdered size={16} /> My Orders Today
            </div>
            <div className={styles.panelSub}>
              {orders.length} orders · {todayTotal.toLocaleString()} ብር
              {pendingCount > 0 && (
                <span className={styles.pendingTag}>{pendingCount} need confirmation</span>
              )}
            </div>
            {orders.length > 0 && (
              <div className={styles.panelStats}>
                <span>💵 Cash: {cashTotal.toLocaleString()} ብር</span>
                <span>📱 Digital confirmed: {digitalConfirmed.toLocaleString()} ብር</span>
              </div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.panelBody}>
          {loading ? (
            <div className={styles.loadingRow}>
              <Loader2 size={20} className={styles.spin} />
              <span>Loading…</span>
            </div>
          ) : orders.length === 0 ? (
            <div className={styles.empty}>
              <ListOrdered size={36} style={{ opacity: 0.3 }} />
              <p>No orders processed today</p>
            </div>
          ) : (
            orders.map((o) => {
              const isDigitalUnconfirmed =
                o.payment_method !== "cash" && o.payment_status !== "confirmed";
              return (
                <div
                  key={o.id}
                  className={`${styles.orderRow} ${isDigitalUnconfirmed ? styles.orderRowPending : ""}`}
                >
                  {/* Order number + method */}
                  <div className={styles.orderMeta}>
                    <span className={styles.orderNum}>#{o.order_number}</span>
                    <span className={styles.methodLabel}>
                      {METHOD_ICON[o.payment_method] ?? null}
                      {o.payment_method.charAt(0).toUpperCase() + o.payment_method.slice(1)}
                    </span>
                  </div>

                  {/* Payment status — the KEY info */}
                  <div style={{ margin: "0.3rem 0" }}>
                    <PaymentStatusChip order={o} />
                  </div>

                  {/* Items */}
                  <div className={styles.orderItems}>
                    {(o.items ?? []).slice(0, 3).map((item, i) => (
                      <span key={i} className={styles.itemChip}>
                        {item.quantity}× {item.nameEn ?? item.name}
                      </span>
                    ))}
                    {(o.items?.length ?? 0) > 3 && (
                      <span className={styles.itemChip}>+{o.items.length - 3} more</span>
                    )}
                  </div>

                  {/* Customer + total */}
                  <div className={styles.orderBottom}>
                    <span className={styles.customer}>
                      {o.customer_name || "Walk-in"}
                    </span>
                    <span className={styles.total}>{o.total.toLocaleString()} ብር</span>
                  </div>

                  {/* Hold warning for digital unconfirmed */}
                  {isDigitalUnconfirmed && (
                    <div className={styles.pendingWarning}>
                      <Clock size={12} />
                      Hold items until admin confirms this payment
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className={styles.panelFoot}>
          <button className={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 size={13} className={styles.spin} />
            ) : (
              <CheckCircle2 size={13} />
            )}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
    </>
  );
}

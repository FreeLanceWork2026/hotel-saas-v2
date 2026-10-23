"use client";

import React, { useState, useTransition } from "react";
import {
  ChevronDown, Phone, MapPin, Package,
  Clock, Loader2, CheckCircle2,
} from "lucide-react";
import shared from "../admin.shared.module.css";
import styles from "./Orders.module.css";
import { updateOrderStatus } from "./actions";
import { useToast } from "@/components/ui/Toast";

type OrderStatus =
  | "payment_pending" | "payment_review" | "confirmed"
  | "preparing" | "packing" | "on_route"
  | "ready_for_pickup" | "delivered" | "cancelled";

interface OrderItem {
  nameEn: string;
  nameAm?: string;
  size: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: OrderStatus;
  payment_method: string;
  created_at: string;
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "payment_pending",  label: "Payment Pending"   },
  { value: "payment_review",   label: "Payment Review"    },
  { value: "confirmed",        label: "Confirmed"         },
  { value: "preparing",        label: "Preparing"         },
  { value: "packing",          label: "Packing"           },
  { value: "on_route",         label: "On Route"          },
  { value: "ready_for_pickup", label: "Ready for Pickup"  },
  { value: "delivered",        label: "Delivered"         },
  { value: "cancelled",        label: "Cancelled"         },
];

const STATUS_CLASS: Record<OrderStatus, string> = {
  payment_pending:  shared.statusPending,
  payment_review:   shared.statusReview,
  confirmed:        shared.statusConfirmed,
  preparing:        shared.statusPreparing,
  packing:          shared.statusPacking,
  on_route:         shared.statusOnRoute,
  ready_for_pickup: shared.statusPickup,
  delivered:        shared.statusDelivered,
  cancelled:        shared.statusCancelled,
};

const STATUS_LABEL: Record<OrderStatus, string> = {
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

// Toast messages per status change
const STATUS_TOAST: Record<OrderStatus, { title: string; msg: string }> = {
  payment_pending:  { title: "Awaiting Payment",     msg: "Order moved back to payment pending."       },
  payment_review:   { title: "Under Review 🔍",      msg: "Payment is being reviewed."                 },
  confirmed:        { title: "Order Confirmed ✓",    msg: "Customer will be notified."                 },
  preparing:        { title: "Preparing Order",      msg: "Kitchen/prep team notified."                },
  packing:          { title: "Packing 📦",            msg: "Order is being packed."                     },
  on_route:         { title: "On the Way 🚗",         msg: "Out for delivery."                          },
  ready_for_pickup: { title: "Ready for Pickup 🏪",  msg: "Customer can come pick up their order."     },
  delivered:        { title: "Delivered! 🎉",         msg: "Order marked as successfully delivered."    },
  cancelled:        { title: "Order Cancelled",       msg: "Order has been cancelled."                  },
};

type FilterStatus = "all" | OrderStatus;


export default function OrdersClient({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders]   = useState<Order[]>(initialOrders);
  // Live updates: the page re-renders on the server (see <LiveRefresh/>) and passes fresh orders.
  const [lastInitial, setLastInitial] = useState(initialOrders);
  if (initialOrders !== lastInitial) {
    setLastInitial(initialOrders);
    setOrders(initialOrders);
  }
  const [filter, setFilter]   = useState<FilterStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { success, error, info } = useToast();

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;

    setUpdatingId(orderId);
    startTransition(async () => {
      const res = await updateOrderStatus(orderId, newStatus);
      if (!res?.error) {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o)
        );
        const t = STATUS_TOAST[newStatus];
        if (newStatus === "delivered") success(t.title, t.msg);
        else if (newStatus === "cancelled") error(t.title, t.msg);
        else info(t.title, t.msg);
      } else {
        error("Update Failed", `Could not update order #${order.order_number}.`);
      }
      setUpdatingId(null);
    });
  };

  return (
    <div>
      {/* Header */}
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Orders</h1>
          <p className={shared.pageSubtitle}>
            {orders.length} total order{orders.length !== 1 ? "s" : ""}
            {orders.filter((o) => o.status === "payment_pending").length > 0 && (
              <span style={{ color: "var(--a-gold)", marginLeft: 8 }}>
                · {orders.filter((o) => o.status === "payment_pending").length} awaiting payment
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.filterRow}>
        {(["all", "payment_pending", "payment_review", "confirmed", "preparing", "packing", "on_route", "ready_for_pickup", "delivered", "cancelled"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`${styles.filterTab} ${filter === s ? styles.filterTabActive : ""}`}
          >
            {s === "all"
              ? `All (${orders.length})`
              : `${STATUS_LABEL[s as OrderStatus]} (${orders.filter((o) => o.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {filtered.length === 0 ? (
        <div className={shared.card} style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--a-dim)" }}>No orders found for this filter.</p>
        </div>
      ) : (
        <div className={styles.ordersList}>
          {filtered.map((order) => {
            const isUpdating = updatingId === order.id;
            return (
              <div
                key={order.id}
                className={styles.orderCard}
                style={{ opacity: isUpdating ? 0.75 : 1, transition: "opacity 200ms" }}
              >
                {/* Order Row */}
                <div
                  className={styles.orderRow}
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <div className={styles.orderMeta}>
                    <span className={styles.orderNum}>#{order.order_number}</span>
                    <span className={styles.orderCustomer}>{order.customer_name}</span>
                    <span className={styles.orderTime}>
                      <Clock size={11} style={{ display: "inline", marginRight: 3 }} />
                      {new Date(order.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className={styles.orderRight}>
                    <span className={styles.orderTotal}>{order.total.toLocaleString()} ብር</span>
                    <span className={`${shared.badge} ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>

                    {/* Status Dropdown */}
                    <div className={styles.statusDropWrapper} onClick={(e) => e.stopPropagation()}>
                      {isUpdating ? (
                        <div className={styles.statusUpdating}>
                          <Loader2 size={14} style={{ animation: "spin 0.7s linear infinite", color: "var(--a-gold)" }} />
                          <span>Saving…</span>
                        </div>
                      ) : (
                        <>
                          <select
                            className={styles.statusSelect}
                            value={order.status}
                            disabled={isPending}
                            onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className={styles.dropIcon} />
                        </>
                      )}
                    </div>

                    <ChevronDown
                      size={16}
                      style={{
                        color: "var(--a-dim)",
                        transform: expanded === order.id ? "rotate(180deg)" : "none",
                        transition: "transform 200ms",
                        flexShrink: 0,
                      }}
                    />
                  </div>
                </div>

                {/* Expanded Details */}
                {expanded === order.id && (
                  <div className={styles.orderDetails}>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailSection}>
                        <p className={styles.detailLabel}>Contact</p>
                        <p className={styles.detailValue}>
                          <Phone size={13} style={{ display: "inline", marginRight: 4 }} />
                          {order.customer_phone}
                        </p>
                      </div>

                      <div className={styles.detailSection}>
                        <p className={styles.detailLabel}>Delivery</p>
                        <p className={styles.detailValue}>
                          <MapPin size={13} style={{ display: "inline", marginRight: 4 }} />
                          {order.delivery_type === "delivery"
                            ? order.delivery_address ?? "N/A"
                            : "Pickup — In-store"}
                        </p>
                      </div>

                      <div className={styles.detailSection}>
                        <p className={styles.detailLabel}>Payment</p>
                        <p className={styles.detailValue}>{order.payment_method}</p>
                      </div>
                    </div>

                    {/* Items */}
                    <div className={styles.itemsList}>
                      <p className={styles.detailLabel} style={{ marginBottom: "0.5rem" }}>
                        <Package size={13} style={{ display: "inline", marginRight: 4 }} />
                        Items
                      </p>
                      {(Array.isArray(order.items) ? order.items : []).map((item, i) => (
                        <div key={i} className={styles.itemRow}>
                          <span className={styles.itemName}>
                            {item.quantity}× {item.nameEn} ({item.size})
                          </span>
                          <span className={styles.itemPrice}>
                            {(item.price * item.quantity).toLocaleString()} ብር
                          </span>
                        </div>
                      ))}
                      <div className={styles.orderSummary}>
                        <span className={styles.summaryRow}>
                          <span style={{ color: "var(--a-muted-2)" }}>Subtotal</span>
                          <span>{order.subtotal.toLocaleString()} ብር</span>
                        </span>
                        <span className={styles.summaryRow}>
                          <span style={{ color: "var(--a-muted-2)" }}>Delivery fee</span>
                          <span>{order.delivery_fee} ብር</span>
                        </span>
                        <span className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                          <span>Total</span>
                          <span>{order.total.toLocaleString()} ብር</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

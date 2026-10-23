"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, ORDER_STATUS_LABELS, STATUS_ORDER, type OrderStatus } from "@/lib/supabase";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "./TrackPage.module.css";

interface OrderItem {
  nameEn: string;
  nameAm: string;
  size: string;
  quantity: number;
  price: number;
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
  payment_method: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

interface StatusLog {
  id: string;
  to_status: string;
  created_at: string;
  note: string | null;
}

export default function TrackPageClient({ orderNumber }: { orderNumber: string }) {
  const locale = useLocale();
  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const loadedOnce = useRef(false);

  const fetchOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", orderNumber)
      .single();

    if (error || !data) {
      // A blip during background polling must not replace a loaded order with "not found"
      if (!loadedOnce.current) {
        setNotFound(true);
        setLoading(false);
      }
      return;
    }
    loadedOnce.current = true;
    setOrder(data as Order);
    setLoading(false);

    // Fetch status log
    const { data: logData } = await supabase
      .from("order_status_log")
      .select("id, to_status, created_at, note")
      .eq("order_id", data.id)
      .order("created_at", { ascending: true });

    if (logData) setLogs(logData);
  }, [orderNumber]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, then realtime subscription below
    fetchOrder();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`order-${orderNumber}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `order_number=eq.${orderNumber}`,
      }, (payload) => {
        setOrder(payload.new as Order);
        fetchOrder(); // refresh logs too
      })
      .subscribe();

    // Fallback: poll while the tab is visible (Realtime can be blocked by RLS / flaky networks)
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") fetchOrder();
    }, 8000);
    const wake = () => { if (document.visibilityState === "visible") fetchOrder(); };
    document.addEventListener("visibilitychange", wake);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
      supabase.removeChannel(channel);
    };
  }, [orderNumber, fetchOrder]);

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <p>{locale === "am" ? "በመጫን ላይ..." : "Loading order..."}</p>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className={styles.notFound}>
        <div style={{ fontSize: "4rem" }}>🔍</div>
        <h1>{locale === "am" ? "ትዕዛዝ አልተገኘም" : "Order Not Found"}</h1>
        <p className="text-muted">
          {locale === "am"
            ? `የትዕዛዝ ቁጥር "${orderNumber}" አልተገኘም።`
            : `No order found with ID "${orderNumber}".`}
        </p>
      </div>
    );
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status];
  const currentStepIndex = STATUS_ORDER.indexOf(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className="container">
          <div className={styles.orderMeta}>
            <div>
              <p className={`text-sm text-muted ${styles.orderLabel}`}>
                {locale === "am" ? "የትዕዛዝ ቁጥር" : "Order Number"}
              </p>
              <h1 className={styles.orderNumber}>#{order.order_number}</h1>
            </div>
            <div className={`${styles.statusBadge} ${isCancelled ? styles.statusCancelled : styles.statusActive}`}>
              <span className={styles.statusIcon}>{statusInfo.icon}</span>
              <span>{locale === "am" ? statusInfo.am : statusInfo.en}</span>
            </div>
          </div>
          <p className="text-sm text-muted">
            {locale === "am" ? "ለ" : "For"} {order.customer_name} · {order.customer_phone}
          </p>
        </div>
      </div>

      <div className="container section-sm">
        {(order.status === "payment_pending" || order.status === "payment_review") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
              borderRadius: 14,
              border: "1px solid rgba(224,166,60,0.35)",
              background: "rgba(224,166,60,0.08)",
            }}
          >
            <div>
              <strong>
                {order.status === "payment_review"
                  ? (locale === "am" ? "ክፍያዎ በመረጋገጥ ላይ ነው" : "Payment under review")
                  : (locale === "am" ? "ክፍያዎን ያጠናቅቁ" : "Complete your payment")}
              </strong>
              <div className="text-sm text-muted">
                {order.status === "payment_review"
                  ? (locale === "am" ? "ደረሰኝዎ ደርሶናል፤ እያረጋገጥን ነው።" : "We received your receipt and are checking it.")
                  : (locale === "am" ? "ገንዘቡን ይላኩና ትዕዛዝዎን ለማረጋገጥ ደረሰኝ ይጫኑ።" : "Send the amount and upload your receipt to confirm the order.")}
              </div>
            </div>
            <Link href={`/pay/${order.order_number}`} className="btn btn-primary">
              {order.status === "payment_review"
                ? (locale === "am" ? "ክፍያን ይመልከቱ" : "View payment")
                : (locale === "am" ? "አሁን ይክፈሉ →" : "Pay now →")}
            </Link>
          </div>
        )}
        <div className={styles.layout}>
          {/* Left — Progress + Log */}
          <div className={styles.main}>

            {/* Progress stepper */}
            {!isCancelled && (
              <div className={`card ${styles.progressCard}`}>
                <h2 className={styles.sectionTitle}>
                  {locale === "am" ? "የትዕዛዝ ሁኔታ" : "Order Progress"}
                </h2>
                <div className={styles.stepper}>
                  {STATUS_ORDER.map((step, i) => {
                    const info = ORDER_STATUS_LABELS[step];
                    const isDone = i < currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    return (
                      <div key={step} className={styles.stepRow}>
                        <div className={styles.stepLeft}>
                          <div className={`${styles.stepDot}
                            ${isDone ? styles.stepDone : ""}
                            ${isCurrent ? styles.stepCurrent : ""}
                          `}>
                            {isDone ? "✓" : info.icon}
                          </div>
                          {i < STATUS_ORDER.length - 1 && (
                            <div className={`${styles.stepLine} ${isDone ? styles.stepLineDone : ""}`} />
                          )}
                        </div>
                        <div className={`${styles.stepContent} ${isCurrent ? styles.stepContentActive : ""}`}>
                          <p className={styles.stepLabel}>
                            {locale === "am" ? info.am : info.en}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isCancelled && (
              <div className={`card ${styles.cancelCard}`}>
                <span className={styles.cancelIcon}>❌</span>
                <h2>{locale === "am" ? "ትዕዛዝ ተሰርዟል" : "Order Cancelled"}</h2>
                <p className="text-muted">
                  {locale === "am"
                    ? "ለዚህ ትዕዛዝ ድጋፍ ካስፈለገዎ ያናግሩን።"
                    : "Contact us if you need support regarding this order."}
                </p>
              </div>
            )}

            {/* Status log */}
            {logs.length > 0 && (
              <div className={`card ${styles.logCard}`}>
                <h2 className={styles.sectionTitle}>
                  {locale === "am" ? "ታሪክ" : "Status History"}
                </h2>
                <div className={styles.logList}>
                  {[...logs].reverse().map((log) => {
                    const info = ORDER_STATUS_LABELS[log.to_status as OrderStatus];
                    const time = new Date(log.created_at).toLocaleString(
                      locale === "am" ? "am-ET" : "en-ET"
                    );
                    return (
                      <div key={log.id} className={styles.logItem}>
                        <span className={styles.logIcon}>{info?.icon || "⏺"}</span>
                        <div>
                          <p className={styles.logStatus}>
                            {locale === "am" ? info?.am : info?.en}
                          </p>
                          <p className="text-xs text-muted">{time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right — Order summary */}
          <div className={styles.sidebar}>
            <div className={`card ${styles.summaryCard}`}>
              <h2 className={styles.sectionTitle}>
                {locale === "am" ? "የትዕዛዝ ዝርዝር" : "Order Details"}
              </h2>

              <div className={styles.itemsList}>
                {order.items.map((item, i) => (
                  <div key={i} className={styles.itemRow}>
                    <div>
                      <p className={styles.itemName}>
                        {locale === "am" ? item.nameAm : item.nameEn}
                      </p>
                      <p className="text-xs text-muted">{item.size} × {item.quantity}</p>
                    </div>
                    <p className={styles.itemPrice}>
                      {(item.price * item.quantity).toLocaleString()} ብር
                    </p>
                  </div>
                ))}
              </div>

              <div className={styles.totals}>
                <div className={styles.totalRow}>
                  <span className="text-muted">{locale === "am" ? "ድምር" : "Subtotal"}</span>
                  <span>{order.subtotal.toLocaleString()} ብር</span>
                </div>
                <div className={styles.totalRow}>
                  <span className="text-muted">{locale === "am" ? "ማድረሻ" : "Delivery"}</span>
                  <span>{order.delivery_fee === 0 ? (locale === "am" ? "ነፃ" : "Free") : `${order.delivery_fee} ብር`}</span>
                </div>
                <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                  <span>{locale === "am" ? "ጠቅላላ" : "Total"}</span>
                  <span className={styles.grandTotalAmt}>{order.total.toLocaleString()} ብር</span>
                </div>
              </div>

              <div className={styles.deliveryInfo}>
                <p className="text-sm text-muted">
                  {locale === "am" ? "አቅርቦት" : "Fulfillment"}:{" "}
                  <strong>
                    {order.delivery_type === "pickup"
                      ? (locale === "am" ? "ቀጥታ" : "Pickup")
                      : (locale === "am" ? "ማድረሻ" : "Delivery")}
                  </strong>
                </p>
                {order.delivery_address && (
                  <p className="text-sm text-muted">📍 {order.delivery_address}</p>
                )}
              </div>
            </div>

            {/* Live badge */}
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} />
              {locale === "am" ? "ቀጥታ ክትትል" : "Live tracking"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

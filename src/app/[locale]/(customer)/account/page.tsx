import React from "react";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ShoppingBag, PackageCheck, Wallet, Clock, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ORDER_STATUS_LABELS, STATUS_ORDER, type OrderStatus } from "@/lib/supabase";
import TrackLookup from "./TrackLookup";
import styles from "./Account.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Account — Entoto Haven",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

type OrderItem = { nameEn?: string; name_en?: string; size?: string; quantity?: number };

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total?: number | null;
  total_amount?: number | null;
  created_at: string;
  delivery_type?: string | null;
  items?: OrderItem[] | null;
}

const COPY = {
  en: {
    hello: "Hello",
    sub: "Track your orders and see everything you've bought.",
    orders: "Orders",
    active: "In progress",
    spent: "Total spent",
    lookupLabel: "Track an order",
    lookupPlaceholder: "Enter order number",
    lookupCta: "Track",
    activeTitle: "Orders in progress",
    historyTitle: "Purchase history",
    emptyTitle: "No orders yet",
    emptyText: "When you place an order while signed in, it will show up here.",
    shop: "Browse the shop",
    track: "Track order",
    view: "View",
    currency: "ETB",
    pickup: "Pickup",
    delivery: "Delivery",
  },
  am: {
    hello: "ሰላም",
    sub: "ትዕዛዞችዎን ይከታተሉ እና የገዙትን ሁሉ ይመልከቱ።",
    orders: "ትዕዛዞች",
    active: "በሂደት ላይ",
    spent: "ጠቅላላ ወጪ",
    lookupLabel: "ትዕዛዝ ይከታተሉ",
    lookupPlaceholder: "የትዕዛዝ ቁጥር ያስገቡ",
    lookupCta: "ተከታተል",
    activeTitle: "በሂደት ላይ ያሉ ትዕዛዞች",
    historyTitle: "የግዢ ታሪክ",
    emptyTitle: "እስካሁን ትዕዛዝ የለም",
    emptyText: "ገብተው ትዕዛዝ ሲያዝዙ እዚህ ይታያል።",
    shop: "ሱቁን ይጎብኙ",
    track: "ትዕዛዝ ተከታተል",
    view: "ይመልከቱ",
    currency: "ብር",
    pickup: "በአካል መውሰድ",
    delivery: "ማድረስ",
  },
} as const;

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === "am" ? "am-ET" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function itemsSummary(items?: OrderItem[] | null) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const parts = items
    .slice(0, 3)
    .map((i) => `${i.quantity ?? 1}× ${i.nameEn ?? i.name_en ?? ""}${i.size ? ` (${i.size})` : ""}`);
  const more = items.length > 3 ? ` +${items.length - 3}` : "";
  return parts.join(", ") + more;
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale === "am" ? "am" : "en";
  const t = COPY[locale];

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login?redirectTo=/${locale}/account`);

  // Orders linked to this account. If the user_id column hasn't been added yet
  // the query errors — we fall back to an empty list instead of crashing.
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) console.warn("Account orders query failed:", error.message);

  const orders = (data ?? []) as OrderRow[];
  const amountOf = (o: OrderRow) => Number(o.total ?? o.total_amount ?? 0);

  const isActive = (o: OrderRow) => o.status !== "delivered" && o.status !== "cancelled";
  const activeOrders = orders.filter(isActive);
  const spent = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + amountOf(o), 0);

  const statusLabel = (s: OrderStatus) => ORDER_STATUS_LABELS[s]?.[locale] ?? s;
  const statusIcon = (s: OrderStatus) => ORDER_STATUS_LABELS[s]?.icon ?? "📦";
  const progressOf = (s: OrderStatus) => {
    const idx = STATUS_ORDER.indexOf(s);
    return idx < 0 ? 0 : Math.round(((idx + 1) / STATUS_ORDER.length) * 100);
  };

  return (
    <div className={`container ${styles.page}`}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.avatar}>
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span>{user.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className={styles.heroText}>
          <h1 className={styles.title}>
            {t.hello}, {user.name.split(" ")[0]} 👋
          </h1>
          <p className={styles.sub}>{t.sub}</p>
          {user.email && <p className={styles.email}>{user.email}</p>}
        </div>
      </section>

      {/* ── Stats ── */}
      <section className={styles.stats}>
        <div className={styles.stat}>
          <ShoppingBag size={20} className={styles.statIcon} />
          <div className={styles.statValue}>{orders.length}</div>
          <div className={styles.statLabel}>{t.orders}</div>
        </div>
        <div className={styles.stat}>
          <Clock size={20} className={styles.statIcon} />
          <div className={styles.statValue}>{activeOrders.length}</div>
          <div className={styles.statLabel}>{t.active}</div>
        </div>
        <div className={styles.stat}>
          <Wallet size={20} className={styles.statIcon} />
          <div className={styles.statValue}>
            {spent.toLocaleString()} <small>{t.currency}</small>
          </div>
          <div className={styles.statLabel}>{t.spent}</div>
        </div>
      </section>

      <TrackLookup
        label={t.lookupLabel}
        placeholder={t.lookupPlaceholder}
        cta={t.lookupCta}
      />

      {orders.length === 0 ? (
        <section className={styles.empty}>
          <PackageCheck size={42} className={styles.emptyIcon} />
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <Link href="/shop" className={styles.primaryBtn} id="account-browse-shop">
            {t.shop} <ChevronRight size={16} />
          </Link>
        </section>
      ) : (
        <>
          {/* ── In progress ── */}
          {activeOrders.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t.activeTitle}</h2>
              <div className={styles.activeGrid}>
                {activeOrders.map((o) => (
                  <article key={o.id} className={styles.activeCard}>
                    <div className={styles.cardTop}>
                      <span className={styles.orderNo}>#{o.order_number}</span>
                      <span className={styles.badge}>
                        {statusIcon(o.status)} {statusLabel(o.status)}
                      </span>
                    </div>
                    <div className={styles.progress}>
                      <div
                        className={styles.progressBar}
                        style={{ width: `${progressOf(o.status)}%` }}
                      />
                    </div>
                    <p className={styles.items}>{itemsSummary(o.items)}</p>
                    <div className={styles.cardBottom}>
                      <span className={styles.total}>
                        {amountOf(o).toLocaleString()} {t.currency}
                      </span>
                      <Link
                        href={`/track/${o.order_number}`}
                        className={styles.linkBtn}
                      >
                        {t.track} <ChevronRight size={15} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ── History ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t.historyTitle}</h2>
            <div className={styles.history}>
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/track/${o.order_number}`}
                  className={styles.row}
                >
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className={styles.orderNo}>#{o.order_number}</span>
                      <span className={styles.rowDate}>
                        {formatDate(o.created_at, locale)}
                        {o.delivery_type
                          ? ` · ${o.delivery_type === "delivery" ? t.delivery : t.pickup}`
                          : ""}
                      </span>
                    </div>
                    <div className={styles.rowItems}>{itemsSummary(o.items)}</div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.badge}>
                      {statusIcon(o.status)} {statusLabel(o.status)}
                    </span>
                    <span className={styles.total}>
                      {amountOf(o).toLocaleString()} {t.currency}
                    </span>
                  </div>
                  <ChevronRight size={16} className={styles.chev} />
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

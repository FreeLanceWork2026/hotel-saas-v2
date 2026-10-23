// CLIENT-SIDE ONLY — safe to use in browser components
// Does NOT include any secret keys
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, anon);

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "payment_pending"
  | "payment_review"
  | "confirmed"
  | "preparing"
  | "packing"
  | "on_route"
  | "ready_for_pickup"
  | "delivered"
  | "cancelled";

export const ORDER_STATUS_LABELS: Record<
  OrderStatus,
  { en: string; am: string; icon: string }
> = {
  payment_pending:  { en: "Awaiting Payment",     am: "ክፍያ በመጠባበቅ ላይ",   icon: "💳" },
  payment_review:   { en: "Payment Under Review",  am: "ክፍያ በማረጋገጥ ላይ",   icon: "🔍" },
  confirmed:        { en: "Order Confirmed",        am: "ትዕዛዝ ተረጋግጧል",     icon: "✅" },
  preparing:        { en: "Being Prepared",         am: "እየተዘጋጀ ነው",        icon: "👨‍🍳" },
  packing:          { en: "Packing",               am: "እየታሸገ ነው",         icon: "📦" },
  on_route:         { en: "On the Way",            am: "በመምጣት ላይ ነው",     icon: "🚗" },
  ready_for_pickup: { en: "Ready for Pickup",       am: "ለቀጥታ ዝግጁ ነው",    icon: "🏪" },
  delivered:        { en: "Delivered",              am: "ደርሷል",             icon: "🎉" },
  cancelled:        { en: "Cancelled",              am: "ተሰርዟል",            icon: "❌" },
};

export const STATUS_ORDER: OrderStatus[] = [
  "payment_pending",
  "payment_review",
  "confirmed",
  "preparing",
  "packing",
  "on_route",
  "ready_for_pickup",
  "delivered",
];

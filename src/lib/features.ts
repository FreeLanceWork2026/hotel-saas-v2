// Feature registry — the single list of switchable modules.
// Pure module (no Next/Supabase imports) so the proxy, server, client and tests can share it.
//
// A feature that is OFF is hidden completely: nav items disappear and every path
// listed in `paths` returns 404 (enforced in src/proxy.ts).

export type FeatureKey =
  | "booking"
  | "guest_self_booking"
  | "room_service"
  | "retainer"
  | "events"
  | "credit"
  | "online_ordering"
  | "qr_menu"
  | "table_ordering"
  | "kitchen_display"
  | "kiosk_pos"
  | "inventory"
  | "labels"
  | "payment_ocr"
  | "telegram"
  | "announcements"
  | "reports"
  | "activity"
  | "amharic";

export type FeatureGroup = "Hotel" | "Restaurant" | "Operations" | "Extras";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  group: FeatureGroup;
  /** State used when the owner has never touched this switch. */
  defaultOn: boolean;
  /** Locale-less path prefixes (pages and APIs) that 404 while the feature is OFF. */
  paths: string[];
}

export const FEATURES: FeatureDef[] = [
  // ── Hotel ──
  { key: "booking", group: "Hotel", defaultOn: true,
    label: "Rooms & bookings",
    description: "Room setup, availability calendar and front-desk room assignment.",
    paths: ["/admin/rooms", "/admin/bookings", "/admin/balances", "/kiosk/rooms", "/rooms", "/bill", "/api/bookings"] },
  { key: "guest_self_booking", group: "Hotel", defaultOn: false,
    label: "Guest self-booking",
    description: "Guests can request a room from the website themselves.",
    paths: ["/api/bookings/request"] },
  { key: "room_service", group: "Hotel", defaultOn: true,
    label: "Room service / charge to room",
    description: "The POS can put food orders on an in-house guest's bill.",
    paths: [] },
  { key: "retainer", group: "Hotel", defaultOn: false,
    label: "Reservation retainer",
    description: "Ask for a % of the room price up front. Shows the amount due; never blocks a booking.",
    paths: [] },
  { key: "events", group: "Hotel", defaultOn: true,
    label: "Events & services",
    description: "Event packages (e.g. weddings), per-plate meals and other services on hall/room bills.",
    paths: [] },
  { key: "credit", group: "Hotel", defaultOn: true,
    label: "Credit (pay later)",
    description: "Admin can approve a guest leaving with a balance; tracked on Outstanding balances.",
    paths: ["/admin/balances"] },

  // ── Restaurant ──
  { key: "online_ordering", group: "Restaurant", defaultOn: false,
    label: "Customer online ordering",
    description: "Customers can add to cart and check out on the website. When OFF, only kiosk/admin take orders.",
    paths: ["/cart", "/api/checkout"] },
  { key: "qr_menu", group: "Restaurant", defaultOn: true,
    label: "Table QR menu",
    description: "Scanning a table QR opens a view-only menu.",
    paths: ["/table"] },
  { key: "table_ordering", group: "Restaurant", defaultOn: false,
    label: "Table self-ordering",
    description: "Guests can order from the table QR menu themselves.",
    paths: ["/api/table-orders"] },
  { key: "kitchen_display", group: "Restaurant", defaultOn: false,
    label: "Kitchen display screen",
    description: "Live order screen for the kitchen.",
    paths: ["/kitchen", "/api/kitchen"] },

  // ── Operations ──
  { key: "kiosk_pos", group: "Operations", defaultOn: true,
    label: "Kiosk / POS",
    description: "Front-desk and cashier point of sale with staff PIN login.",
    paths: ["/kiosk", "/api/pos", "/api/kiosk"] },
  { key: "inventory", group: "Operations", defaultOn: true,
    label: "Inventory & stock",
    description: "Stock ledger, receiving, adjustments and low-stock alerts.",
    paths: ["/admin/inventory"] },
  { key: "labels", group: "Operations", defaultOn: true,
    label: "Barcode & QR labels",
    description: "Printable product labels.",
    paths: ["/admin/inventory/labels"] },
  { key: "payment_ocr", group: "Operations", defaultOn: true,
    label: "Receipt auto-check (OCR)",
    description: "Reads CBE/Telebirr screenshots automatically to pre-fill the reference.",
    paths: [] },
  { key: "telegram", group: "Operations", defaultOn: true,
    label: "Telegram bot",
    description: "Staff notifications and approve/reject buttons in Telegram.",
    paths: ["/api/telegram"] },

  // ── Extras ──
  { key: "announcements", group: "Extras", defaultOn: true,
    label: "Announcements",
    description: "Banner messages on the public website.",
    paths: ["/admin/announcements"] },
  { key: "reports", group: "Extras", defaultOn: true,
    label: "Reports",
    description: "Sales and performance reports.",
    paths: ["/admin/reports"] },
  { key: "activity", group: "Extras", defaultOn: true,
    label: "Activity log",
    description: "Timeline of order and stock events.",
    paths: ["/admin/activity"] },
  { key: "amharic", group: "Extras", defaultOn: true,
    label: "Amharic language",
    description: "Offer the site in Amharic. When OFF, everything is English only.",
    paths: [] },
];

export type FeatureMap = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(key);
}

/** Merge stored rows over defaults. Unknown keys are ignored; `rows = null` means defaults only. */
export function resolveFeatures(rows: { key: string; enabled: boolean }[] | null): FeatureMap {
  const map = Object.fromEntries(FEATURES.map((f) => [f.key, f.defaultOn])) as FeatureMap;
  for (const row of rows ?? []) {
    if (isFeatureKey(row.key)) map[row.key] = row.enabled === true;
  }
  return map;
}

/** True when `path` is `prefix` or sits below it (segment boundary, so /cart ≠ /cartoon). */
function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** Every feature that guards this locale-less path (nested paths can need several). */
export function featuresForPath(path: string): FeatureKey[] {
  return FEATURES.filter((f) => f.paths.some((p) => underPrefix(path, p))).map((f) => f.key);
}

/** True when any feature guarding this path is OFF. */
export function isPathBlocked(path: string, map: FeatureMap): boolean {
  return featuresForPath(path).some((key) => !map[key]);
}

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyStaff } from "@/lib/telegram";

/**
 * Server-side stock ledger helpers.
 *
 * Everything goes through the Postgres functions from phase25_stock.sql so stock
 * changes are atomic, FEFO-allocated and idempotent. If that SQL hasn't been run
 * yet these helpers degrade gracefully (return `setupMissing`) — a sale is never
 * blocked by inventory bookkeeping.
 */

export interface StockLine {
  productId: string;
  quantity: number;
}

export interface SaleContext {
  orderId: string;
  orderNumber: string;
  channel: "pos" | "online";
  actor: string;
}

export interface StockResult {
  ok: boolean;
  setupMissing?: boolean;
  error?: string;
}

const MISSING = /stock_sell|stock_return|stock_receive|stock_adjust|schema cache|does not exist|Could not find/i;

export function isStockSetupError(message: string | undefined | null): boolean {
  return !!message && MISSING.test(message);
}

/** UUIDs only — storefront fallback products ("pb-500g") have no ledger. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Drop made-to-order products (track_stock = false, e.g. meals, drinks).
 * Before database/hotel.sql adds the column every product counts as tracked.
 */
async function trackedOnly(lines: StockLine[]): Promise<StockLine[]> {
  if (lines.length === 0) return lines;
  const { data, error } = await getSupabaseAdmin()
    .from("products")
    .select("id")
    .in("id", [...new Set(lines.map((l) => l.productId))])
    .eq("track_stock", false);
  if (error || !data?.length) return lines;
  const untracked = new Set(data.map((p) => String(p.id)));
  return lines.filter((l) => !untracked.has(l.productId));
}

/** Deduct sold lines (FEFO) and alert the admin if a product just dropped to its reorder level. */
export async function recordSale(lines: StockLine[], ctx: SaleContext): Promise<StockResult> {
  const sb = getSupabaseAdmin();
  const real = await trackedOnly(lines.filter((l) => UUID.test(l.productId) && l.quantity > 0));
  if (real.length === 0) return { ok: true };

  try {
    // Quantities per product (an order may list a product twice)
    const qtyBy = new Map<string, number>();
    for (const l of real) qtyBy.set(l.productId, (qtyBy.get(l.productId) ?? 0) + Math.floor(l.quantity));

    for (const [productId, qty] of qtyBy) {
      const { error } = await sb.rpc("stock_sell", {
        p_product: productId,
        p_qty: qty,
        p_order_id: ctx.orderId,
        p_order_number: ctx.orderNumber,
        p_channel: ctx.channel,
        p_actor: ctx.actor,
      });
      if (error) {
        if (isStockSetupError(error.message)) return { ok: false, setupMissing: true, error: error.message };
        console.error("stock_sell failed:", error.message);
        return { ok: false, error: error.message };
      }
    }

    await alertIfLow([...qtyBy.entries()]);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "stock error";
    console.error("recordSale error:", message);
    return { ok: false, error: message, setupMissing: isStockSetupError(message) };
  }
}

/** Put an order's stock back (cancel/refund). Idempotent. */
export async function recordReturn(orderId: string, actor: string, reason = "Order cancelled"): Promise<StockResult> {
  try {
    const { error } = await getSupabaseAdmin().rpc("stock_return", {
      p_order_id: orderId,
      p_actor: actor,
      p_reason: reason,
    });
    if (error) {
      if (isStockSetupError(error.message)) return { ok: false, setupMissing: true, error: error.message };
      console.error("stock_return failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "stock error" };
  }
}

/**
 * Tell the admin only when a sale CROSSES the reorder line (was above, now at/below),
 * so a busy day doesn't spam the chat.
 */
async function alertIfLow(sold: [string, number][]) {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("products")
      .select("id, name, size, stock_qty, reorder_level")
      .in("id", sold.map(([id]) => id));
    if (!data) return;

    const lines: string[] = [];
    for (const p of data) {
      const qty = sold.find(([id]) => id === p.id)?.[1] ?? 0;
      const now = Number(p.stock_qty ?? 0);
      const reorder = Number(p.reorder_level ?? 5);
      const before = now + qty;
      if (before > reorder && now <= reorder) {
        const label = `${p.name}${p.size ? ` ${p.size}` : ""}`;
        lines.push(now <= 0 ? `🔴 *${label}* is OUT of stock` : `🟠 *${label}* is low — ${now} left (reorder at ${reorder})`);
      }
    }
    if (lines.length) await notifyStaff(`📦 *Stock alert*\n\n${lines.join("\n")}`);
  } catch (e) {
    console.error("low-stock alert failed:", e instanceof Error ? e.message : e);
  }
}

export interface StockCheck {
  /** products that are fully out of stock for the requested quantity */
  outOfStock: { productId: string; name: string; requested: number; available: number }[];
  /** products with stock below the requested qty */
  insufficient: { productId: string; name: string; requested: number; available: number }[];
  ok: boolean;
  /** true when phase25_stock.sql hasn't been run yet — caller should not block */
  setupMissing: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pre-flight stock check. Returns which items cannot be fulfilled.
 * Never throws — if the stock SQL isn't set up, returns setupMissing=true
 * so the caller can decide whether to allow the sale anyway.
 */
export async function checkStock(lines: StockLine[]): Promise<StockCheck> {
  const empty = { ok: true, outOfStock: [], insufficient: [], setupMissing: false };
  const real = await trackedOnly(lines.filter((l) => UUID_RE.test(l.productId) && l.quantity > 0));
  if (real.length === 0) return empty;

  try {
    const sb = getSupabaseAdmin();
    const ids = real.map((l) => l.productId);

    // Try the stock_available RPC first (requires phase25_stock_enforce.sql)
    let available: { product_id: string; on_hand: number }[] = [];
    const setupMissing = false;

    const { data: fnData, error: fnErr } = await sb.rpc("stock_available", { p_products: ids });
    if (!fnErr && fnData) {
      available = fnData as { product_id: string; on_hand: number }[];
    } else {
      // Fallback: direct column read (works when only phase25_stock.sql has run)
      const { data, error: colErr } = await sb
        .from("products")
        .select("id, stock_qty")
        .in("id", ids);
      if (colErr || !data || (data.length > 0 && !("stock_qty" in data[0]))) {
        // stock_qty column doesn't exist yet
        return { ok: true, outOfStock: [], insufficient: [], setupMissing: true };
      }
      available = data.map((r) => ({
        product_id: String(r.id),
        on_hand: Number((r as Record<string, unknown>).stock_qty ?? 0),
      }));
      // setupMissing stays false — we have real stock data, so enforce it.
      // The enforce SQL (phase25_stock_enforce.sql) is missing but the column is there.
    }

    // Name lookup
    const { data: names } = await sb.from("products").select("id, name, size").in("id", ids);
    const nameMap = new Map(
      (names ?? []).map((p) => [
        String(p.id),
        `${String(p.name)}${p.size ? " " + String(p.size) : ""}`,
      ])
    );
    const availMap = new Map(available.map((a) => [a.product_id, a.on_hand]));

    // Aggregate qty per product
    const qtyBy = new Map<string, number>();
    for (const l of real)
      qtyBy.set(l.productId, (qtyBy.get(l.productId) ?? 0) + Math.floor(l.quantity));

    const outOfStock: StockCheck["outOfStock"] = [];
    const insufficient: StockCheck["insufficient"] = [];

    for (const [productId, requested] of qtyBy) {
      const avail = availMap.get(productId) ?? 0;
      const name  = nameMap.get(productId) ?? productId;
      if (avail <= 0) outOfStock.push({ productId, name, requested, available: avail });
      else if (avail < requested) insufficient.push({ productId, name, requested, available: avail });
    }

    return { ok: outOfStock.length === 0 && insufficient.length === 0, outOfStock, insufficient, setupMissing };
  } catch {
    // Never block a sale because of a stock-check failure
    return { ok: true, outOfStock: [], insufficient: [], setupMissing: true };
  }
}
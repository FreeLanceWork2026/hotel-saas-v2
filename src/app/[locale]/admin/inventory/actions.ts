"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";
import { isStockSetupError } from "@/lib/stock";

const UNAUTH = { error: "Unauthorized. Admin access required." } as const;
const SETUP = { error: "Stock tracking isn't set up yet — run phase25_stock.sql in the Supabase SQL Editor." } as const;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function dbError(message: string) {
  return isStockSetupError(message) ? SETUP : { error: message.replace(/^.*?exception:\s*/i, "") };
}

/** Bring a new batch into stock (bought-in or produced). */
export async function receiveStockAction(formData: FormData) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const productId = str(formData.get("productId"));
  const qty = Math.floor(Number(str(formData.get("qty"))));
  if (!productId || !Number.isFinite(qty) || qty <= 0) return { error: "Enter a quantity greater than zero." };

  const source = str(formData.get("source")) === "produced" ? "produced" : "received";
  const cost = str(formData.get("unitCost"));

  const { data, error } = await getSupabaseAdmin().rpc("stock_receive", {
    p_product: productId,
    p_qty: qty,
    p_batch_code: str(formData.get("batchCode")) || null,
    p_expires: str(formData.get("expiresAt")) || null,
    p_supplier: str(formData.get("supplier")) || null,
    p_produced_by: str(formData.get("producedBy")) || null,
    p_unit_cost: cost && Number.isFinite(Number(cost)) ? Number(cost) : null,
    p_note: str(formData.get("note")) || null,
    p_actor: actor.label,
    p_source: source,
  });
  if (error) {
    if (/batch_code/i.test(error.message) && /duplicate|unique/i.test(error.message))
      return { error: "That batch code already exists. Leave it blank to auto-generate one." };
    return dbError(error.message);
  }

  revalidatePath("/", "layout");
  const out = (data ?? {}) as { batch_id?: string; batch_code?: string; balance?: number };
  return { success: true, batchId: out.batch_id, batchCode: out.batch_code, balance: out.balance };
}

/**
 * Correct stock.  mode:
 *  - add     → + qty   (found stock)
 *  - remove  → − qty   (damaged / expired / sample → use type "waste", or "adjust")
 *  - set     → physical count: delta computed against the current on-hand number
 */
export async function adjustStockAction(formData: FormData) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const productId = str(formData.get("productId"));
  const mode = str(formData.get("mode"));
  const qty = Math.floor(Number(str(formData.get("qty"))));
  const reason = str(formData.get("reason"));
  const type = str(formData.get("type")) === "waste" ? "waste" : "adjust";

  if (!productId || !Number.isFinite(qty) || qty < 0) return { error: "Enter a valid quantity." };
  if (!reason) return { error: "A reason is required — it goes into the audit trail." };

  const sb = getSupabaseAdmin();
  let delta = mode === "remove" ? -qty : qty;

  if (mode === "set") {
    const { data: p, error: pErr } = await sb.from("products").select("stock_qty").eq("id", productId).single();
    if (pErr || !p) return dbError(pErr?.message ?? "Product not found");
    delta = qty - Number(p.stock_qty ?? 0);
    if (delta === 0) return { error: "The count matches the current stock — nothing to change." };
  }
  if (delta === 0) return { error: "Enter a quantity greater than zero." };

  const { data, error } = await sb.rpc("stock_adjust", {
    p_product: productId,
    p_delta: delta,
    p_type: delta < 0 ? type : "adjust",
    p_reason: mode === "set" ? `Stock count: ${reason}` : reason,
    p_actor: actor.label,
  });
  if (error) return dbError(error.message);

  revalidatePath("/", "layout");
  return { success: true, balance: Number(data ?? 0), delta };
}

export interface JourneyBatch {
  id: string;
  batch_code: string;
  source: string;
  qty_received: number;
  qty_remaining: number;
  received_at: string;
  expires_at: string | null;
  supplier: string | null;
  produced_by: string | null;
  unit_cost: number | null;
  note: string | null;
  created_by: string | null;
}

export interface JourneyMovement {
  id: string;
  type: string;
  qty: number;
  balance_after: number | null;
  reason: string | null;
  order_number: string | null;
  channel: string | null;
  actor: string | null;
  created_at: string;
  batch_code: string | null;
}

/** Batches + the last 100 movements for one product — the "journey". */
export async function getProductJourney(
  productId: string,
): Promise<{ batches: JourneyBatch[]; movements: JourneyMovement[]; error?: string }> {
  if (!(await getAdminActor())) return { batches: [], movements: [], error: UNAUTH.error };

  const sb = getSupabaseAdmin();
  const [b, m] = await Promise.all([
    sb
      .from("stock_batches")
      .select("id,batch_code,source,qty_received,qty_remaining,received_at,expires_at,supplier,produced_by,unit_cost,note,created_by")
      .eq("product_id", productId)
      .order("received_at", { ascending: false })
      .limit(50),
    sb
      .from("stock_movements")
      .select("id,type,qty,balance_after,reason,order_number,channel,actor,created_at,batch:stock_batches(batch_code)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const err = b.error?.message ?? m.error?.message;
  if (err) return { batches: [], movements: [], error: isStockSetupError(err) ? SETUP.error : err };

  const movements = (m.data ?? []).map((row) => {
    const batch = row.batch as unknown as { batch_code: string } | { batch_code: string }[] | null;
    return {
      id: row.id as string,
      type: row.type as string,
      qty: Number(row.qty),
      balance_after: row.balance_after === null ? null : Number(row.balance_after),
      reason: (row.reason ?? null) as string | null,
      order_number: (row.order_number ?? null) as string | null,
      channel: (row.channel ?? null) as string | null,
      actor: (row.actor ?? null) as string | null,
      created_at: row.created_at as string,
      batch_code: (Array.isArray(batch) ? batch[0]?.batch_code : batch?.batch_code) ?? null,
    };
  });

  return { batches: (b.data ?? []) as JourneyBatch[], movements };
}

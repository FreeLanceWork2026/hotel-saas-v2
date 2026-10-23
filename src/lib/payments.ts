// SERVER-SIDE ONLY — payment business logic shared by the admin UI, the Telegram bot and API routes.
import { randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyStaff } from "@/lib/telegram";
import { recordSale } from "@/lib/stock";

// ── Transaction ID ────────────────────────────────────────────────────────
// `NL-` + 8 chars from an unambiguous alphabet (no 0/O, 1/I/L).
// 32^8 ≈ 1.1 trillion combinations, generated with a CSPRNG → unforgeable and
// short enough for the Telebirr/CBE "remark" field (11 chars).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTransactionId(): string {
  let id = "";
  for (let i = 0; i < 8; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return `NL-${id}`;
}

// ── Review (confirm / reject) ─────────────────────────────────────────────
export type ReviewDecision = "confirm" | "reject";

export interface ReviewResult {
  ok: boolean;
  error?: string;
  orderNumber?: string;
  newStatus?: string;
}

/**
 * Confirm or reject the payment for an order.
 *  - confirm → order becomes `confirmed`, staff told to pack.
 *  - reject  → order returns to `payment_pending` (customer can upload again),
 *              staff told NOT to pack.
 * Always writes an audit row to order_status_log.
 */
export async function reviewPayment(opts: {
  orderNumber: string;
  decision: ReviewDecision;
  actor: string; // e.g. "admin:you@mail.com" or "telegram"
  reason?: string;
}): Promise<ReviewResult> {
  const sb = getSupabaseAdmin();
  const orderNumber = opts.orderNumber.trim().toUpperCase();

  const { data: order, error } = await sb
    .from("orders")
    .select("*") // `channel` only exists after phase2_pos.sql, so don't name it
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) return { ok: false, error: `Order ${orderNumber} not found.` };

  // ── POS sale: the goods already left the counter; this only verifies the money ──
  // (Detected by `channel`, or — before phase2_pos.sql is run — by "already past the
  //  payment stage yet still has a pending payment".)
  const pastPaymentStage = order.status !== "payment_pending" && order.status !== "payment_review";
  if (order.channel === "pos" || (pastPaymentStage && order.status !== "cancelled")) {
    if (order.channel === "pos") return reviewPosPayment(order, opts);
    const { data: stillPending } = await sb
      .from("payments")
      .select("id")
      .eq("order_id", order.id)
      .eq("status", "pending")
      .limit(1);
    if (stillPending && stillPending.length > 0) return reviewPosPayment(order, opts);
  }

  if (order.status !== "payment_pending" && order.status !== "payment_review") {
    return { ok: false, error: `Order #${orderNumber} is already "${order.status}".` };
  }

  const newStatus = opts.decision === "confirm" ? "confirmed" : "payment_pending";
  const now = new Date().toISOString();

  // 1. Latest pending payment record (table may not exist on older setups)
  const { data: payment } = await sb
    .from("payments")
    .select("id")
    .eq("order_id", order.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment) {
    await sb
      .from("payments")
      .update({
        status: opts.decision === "confirm" ? "confirmed" : "rejected",
        reviewed_by_label: opts.actor,
        reviewed_at: now,
        reject_reason: opts.decision === "reject" ? opts.reason ?? null : null,
      })
      .eq("id", payment.id);
  }

  // 2. Order status
  const { error: updErr } = await sb
    .from("orders")
    .update({
      status: newStatus,
      updated_at: now,
      payment_note: opts.decision === "reject" ? opts.reason ?? "Payment rejected" : null,
    })
    .eq("id", order.id);

  if (updErr) return { ok: false, error: updErr.message };

  // 3. Audit trail
  await sb.from("order_status_log").insert({
    order_id: order.id,
    from_status: order.status,
    to_status: newStatus,
    changed_by: opts.actor,
    note:
      opts.decision === "confirm"
        ? "Payment confirmed"
        : `Payment rejected${opts.reason ? `: ${opts.reason}` : ""}`,
  });

  // 3b. Stock: an online order leaves inventory once the payment is confirmed.
  //     (Idempotent in the DB — confirming twice never double-deducts.)
  if (opts.decision === "confirm" && Array.isArray(order.items)) {
    await recordSale(
      (order.items as { productId?: string; quantity?: number }[])
        .filter((i) => i?.productId)
        .map((i) => ({ productId: String(i.productId), quantity: Number(i.quantity) || 0 })),
      { orderId: order.id, orderNumber, channel: "online", actor: opts.actor }
    );
  }

  // 4. Tell the staff chat
  const tx = order.transaction_id ? ` (${order.transaction_id})` : "";
  if (opts.decision === "confirm") {
    await notifyStaff(
      `✅ *Payment confirmed* for Order *#${orderNumber}*${tx}\n` +
        `👤 ${order.customer_name} · ${Number(order.total).toLocaleString()} ብር\n\n` +
        `➡️ Proceed with packing.`
    );
  } else {
    await notifyStaff(
      `❌ *Payment NOT found* for Order *#${orderNumber}*${tx}\n` +
        `👤 ${order.customer_name} · ${Number(order.total).toLocaleString()} ብር\n` +
        (opts.reason ? `📝 ${opts.reason}\n` : "") +
        `\n⛔ Do not pack. The customer was asked to upload a valid proof.`
    );
  }

  return { ok: true, orderNumber, newStatus };
}

// ── POS payment verification ──────────────────────────────────────────────
// confirm → payment verified (admin has checked the receipt)
// reject  → payment marked rejected, order untouched but flagged + loud alert,
//           because the goods were already handed over.
async function reviewPosPayment(
  order: Record<string, unknown>,
  opts: { orderNumber: string; decision: ReviewDecision; actor: string; reason?: string }
): Promise<ReviewResult> {
  const sb = getSupabaseAdmin();
  const orderNumber = String(order.order_number);
  const now = new Date().toISOString();

  const { data: payment } = await sb
    .from("payments")
    .select("*")
    .eq("order_id", order.id as string)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    return { ok: false, error: `POS sale #${orderNumber} has no payment waiting for review.` };
  }

  const confirming = opts.decision === "confirm";
  await sb
    .from("payments")
    .update({
      status: confirming ? "confirmed" : "rejected",
      reviewed_by_label: opts.actor,
      reviewed_at: now,
      reject_reason: confirming ? null : opts.reason ?? null,
    })
    .eq("id", payment.id);

  if (!confirming) {
    await sb
      .from("orders")
      .update({ payment_note: `POS payment rejected: ${opts.reason ?? "not found"}`, updated_at: now })
      .eq("id", order.id as string);
  }

  await sb.from("order_status_log").insert({
    order_id: order.id as string,
    from_status: order.status as string,
    to_status: order.status as string,
    changed_by: opts.actor,
    note: confirming
      ? "POS payment verified by admin"
      : `POS payment REJECTED${opts.reason ? `: ${opts.reason}` : ""}`,
  });

  const who = (payment as { captured_by?: string | null }).captured_by;
  const total = Number(order.total).toLocaleString();
  if (confirming) {
    await notifyStaff(`✅ *POS payment verified* — Order *#${orderNumber}* · ${total} ብር${who ? ` (sold by ${who})` : ""}`, undefined, true);
  } else {
    await notifyStaff(
      `🚨 *POS payment REJECTED* — Order *#${orderNumber}* · ${total} ብር\n` +
        (who ? `🧑‍💼 Sold by ${who}\n` : "") +
        (opts.reason ? `📝 ${opts.reason}\n` : "") +
        `\nThe goods were already handed over — follow up with the employee.`
    );
  }

  return { ok: true, orderNumber, newStatus: String(order.status) };
}

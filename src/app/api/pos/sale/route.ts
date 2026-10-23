import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getKioskAccess } from "@/lib/kioskOperator";
import { generateTransactionId } from "@/lib/payments";
import { notifyStaff, notifyStaffPhoto, reviewKeyboard } from "@/lib/telegram";
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_BYTES,
  PAYMENT_METHODS,
  PROOF_BUCKET,
} from "@/lib/paymentConfig";
import { FLAG_LABELS } from "@/lib/receiptParser";
import { insertPayment, runPaymentChecks, telegramChecksText, type PipelineResult } from "@/lib/paymentPipeline";
import { verdictFor } from "@/lib/paymentChecks";
import { recordSale, checkStock } from "@/lib/stock";
import { getFeatures } from "@/lib/featuresServer";

export const dynamic = "force-dynamic";

type Method = "cash" | "telebirr" | "cbe" | "room";

const safeFilename = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80) || "receipt.jpg";

/** Escape Telegram legacy-Markdown specials in user-provided text. */
const md = (s: string) => s.replace(/([_*`\[])/g, "\\$1");

const methodName = (m: Method) => (m === "cash" ? "Cash" : m === "room" ? "Room bill" : PAYMENT_METHODS[m].label);

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Columns that only exist after phase2_pos.sql — dropped (and retried) if missing,
// so a sale is never lost because a migration hasn't been run.
const ORDER_OPTIONAL = ["channel", "is_anonymous", "operator_id", "transaction_id"] as const;

/**
 * POST /api/pos/sale  (multipart/form-data) — kiosk sale with payment.
 *  items         JSON [{productId, quantity}]  (prices are re-read from the DB, never trusted)
 *  delivery      pickup | delivery,  address?
 *  customerName? customerPhone?   → both empty ⇒ anonymous sale (silent admin alert)
 *  method        cash | telebirr | cbe
 *  file?         receipt photo (digital methods)
 *  reference?    receiptAmount?  ocrText?  ocrConfidence?   payerName?
 *
 * The sale ALWAYS completes. Anything suspicious is recorded as flags and the
 * payment is left "pending" for an admin to review (Telegram + dashboard).
 */
export async function POST(request: Request) {
  try {
    const { operator } = await getKioskAccess();
    if (!operator) {
      return NextResponse.json({ success: false, error: "Kiosk is locked. Enter your PIN." }, { status: 401 });
    }
    const operatorName = `${operator.first_name} ${operator.last_name}`.trim();

    const form = await request.formData();
    const method = String(form.get("method") ?? "") as Method;
    if (!["cash", "telebirr", "cbe", "room"].includes(method)) {
      return NextResponse.json({ success: false, error: "Choose a payment method." }, { status: 400 });
    }

    // Charge to room: the guest must be checked in right now
    let roomBooking: { id: string; guest_name: string; guest_phone: string; room: string } | null = null;
    if (method === "room") {
      const features = await getFeatures();
      if (!features.booking || !features.room_service) {
        return NextResponse.json({ success: false, error: "Charge to room is not enabled." }, { status: 400 });
      }
      const { data: bk } = await getSupabaseAdmin()
        .from("bookings")
        .select("id, guest_name, guest_phone, status, rooms(number)")
        .eq("id", String(form.get("bookingId") ?? ""))
        .maybeSingle();
      if (!bk || bk.status !== "checked_in") {
        return NextResponse.json({ success: false, error: "Pick a checked-in guest to charge." }, { status: 400 });
      }
      roomBooking = {
        id: String(bk.id), guest_name: String(bk.guest_name), guest_phone: String(bk.guest_phone),
        room: String((bk.rooms as unknown as { number: string } | null)?.number ?? "?"),
      };
    }

    // ── Items: authoritative prices from the DB ───────────────────────
    let rawItems: { productId: string; quantity: number }[] = [];
    try {
      rawItems = JSON.parse(String(form.get("items") ?? "[]"));
    } catch {
      /* handled below */
    }
    rawItems = rawItems.filter((i) => i?.productId && Number(i.quantity) > 0);
    if (rawItems.length === 0) {
      return NextResponse.json({ success: false, error: "The order is empty." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data: products } = await sb
      .from("products")
      .select("id, name, name_am, size, price, is_active")
      .in("id", rawItems.map((i) => i.productId));

    const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
    const items = [];
    for (const i of rawItems) {
      const p = byId.get(i.productId);
      if (!p || p.is_active === false) {
        return NextResponse.json({ success: false, error: "A product in the order is no longer available." }, { status: 400 });
      }
      items.push({
        productId: p.id as string,
        nameEn: p.name as string,
        nameAm: (p.name_am as string | null) ?? (p.name as string),
        size: (p.size as string | null) ?? "",
        price: Number(p.price),
        quantity: Math.min(999, Math.floor(Number(i.quantity))),
      });
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryType = String(form.get("delivery") ?? "pickup") === "delivery" ? "delivery" : "pickup";
    const deliveryFee = deliveryType === "delivery" ? (subtotal >= 500 ? 0 : 50) : 0;
    const total = subtotal + deliveryFee;

    // ── Customer (optional for pickup → anonymous) ────────────────────
    const name = String(form.get("customerName") ?? "").trim().slice(0, 80);
    const phone = String(form.get("customerPhone") ?? "").trim().slice(0, 30);
    const address = String(form.get("address") ?? "").trim().slice(0, 200);
    const isAnonymous = !name && !phone;

    if (deliveryType === "delivery" && (!phone || !address)) {
      return NextResponse.json(
        { success: false, error: "Delivery orders need a phone number and an address." },
        { status: 400 }
      );
    }

    // ── Stock pre-flight check ────────────────────────────────────────
    const stockCheck = await checkStock(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
    );
    if (!stockCheck.ok && !stockCheck.setupMissing) {
      const msgs: string[] = [];
      for (const item of stockCheck.outOfStock)
        msgs.push(`"${item.name}" is out of stock (you requested ${item.requested}, we have 0)`);
      for (const item of stockCheck.insufficient)
        msgs.push(`"${item.name}" only has ${item.available} unit(s) left (you requested ${item.requested})`);
      return NextResponse.json(
        { success: false, error: msgs.join("\n"), stockError: true, outOfStock: stockCheck.outOfStock, insufficient: stockCheck.insufficient },
        { status: 409 }
      );
    }

    // ── Receipt photo + evidence (digital only) ───────────────────────
    const file = form.get("file");
    const hasPhoto = file instanceof File && file.size > 0;
    if (hasPhoto) {
      if (file.size > MAX_PROOF_BYTES) {
        return NextResponse.json({ success: false, error: "Photo is too large (max 8 MB)." }, { status: 413 });
      }
      if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
        return NextResponse.json({ success: false, error: "Photo must be JPG, PNG or WebP." }, { status: 415 });
      }
    }

    const rawReference = String(form.get("reference") ?? "").trim() || null;
    const receiptAmount = num(form.get("receiptAmount"));
    const ocrText = String(form.get("ocrText") ?? "").slice(0, 4000);
    const ocrConfidenceRaw = num(form.get("ocrConfidence"));
    const payerName = String(form.get("payerName") ?? "").trim().slice(0, 80) || null;
    const phash = String(form.get("proofPhash") ?? "").trim().toLowerCase() || null;

    // A transaction reference is required for every digital payment.
    if (method !== "cash" && method !== "room" && !rawReference?.replace(/[^A-Za-z0-9]/g, "")) {
      return NextResponse.json(
        { success: false, error: "Enter the transaction reference from the customer's receipt." },
        { status: 400 }
      );
    }

    const photoFile = hasPhoto && method !== "cash" && method !== "room" ? (file as File) : null;
    const photoBytes = photoFile ? new Uint8Array(await photoFile.arrayBuffer()) : null;

    let checked: PipelineResult | null = null;
    let flags: string[] = [];
    if (method === "telebirr" || method === "cbe") {
      checked = await runPaymentChecks(sb, {
        method,
        rawReference,
        expectedAmount: total,
        receiptAmount,
        ocrText,
        ocrConfidence: ocrConfidenceRaw,
        photo: photoBytes,
        phash,
      });
      flags = checked.flags;
    }
    const reference = checked?.reference ?? null;

    // ── 1. Order ──────────────────────────────────────────────────────
    const finalStatus = deliveryType === "pickup" ? "delivered" : "confirmed";
    const orderRow: Record<string, unknown> = {
      customer_name: roomBooking ? `${roomBooking.guest_name} (Room ${roomBooking.room})` : name || "Walk-in customer",
      customer_phone: roomBooking ? roomBooking.guest_phone : phone || "—",
      delivery_type: deliveryType,
      delivery_address: deliveryType === "delivery" ? address : null,
      items,
      subtotal,
      delivery_fee: deliveryFee,
      coins_applied: 0,
      total,
      payment_method: method,
      status: finalStatus,
    };
    const orderOptional: Record<string, unknown> = {
      channel: "pos",
      is_anonymous: isAnonymous,
      ...(operator.id ? { operator_id: operator.id } : {}),
      transaction_id: generateTransactionId(),
    };

    let order: { id: string; order_number: string } | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 8 && !order; attempt++) {
      const { data, error } = await sb
        .from("orders")
        .insert({ ...orderRow, ...orderOptional })
        .select("id, order_number")
        .single();
      if (!error && data) { order = data; break; }
      lastErr = error?.message ?? "Order failed";
      if (error?.code === "23505" && "transaction_id" in orderOptional) {
        orderOptional.transaction_id = generateTransactionId();
        continue;
      }
      const missing = ORDER_OPTIONAL.find((c) => c in orderOptional && lastErr.includes(c));
      if (missing) { delete orderOptional[missing]; continue; }
      break;
    }
    if (!order) {
      console.error("POS order insert failed:", lastErr);
      return NextResponse.json({ success: false, error: lastErr }, { status: 500 });
    }
    const txId = (orderOptional.transaction_id as string | undefined) ?? order.order_number;

    // ── 2. Receipt image ──────────────────────────────────────────────
    let proofPath: string | null = null;
    let proofName: string | null = null;
    if (photoFile && photoBytes) {
      proofName = photoFile.name || "receipt.jpg";
      const path = `${order.order_number}/${Date.now()}-${safeFilename(proofName)}`;
      const { error: upErr } = await sb.storage
        .from(PROOF_BUCKET)
        .upload(path, photoBytes, { contentType: photoFile.type, upsert: false });
      if (upErr) {
        console.error("POS proof upload failed:", upErr.message);
        flags.push("no_proof");
      } else {
        proofPath = path;
        await sb.from("orders").update({ payment_proof: path }).eq("id", order.id);
      }
    }
    const finalNeedsReview = flags.length > 0;

    // ── 3. Payment record ─────────────────────────────────────────────
    const payRow: Record<string, unknown> = {
      order_id: order.id,
      method,
      amount: total,
      transaction_id: txId,
      reference_number: reference,
      payer_name: payerName,
      proof_path: proofPath,
      proof_filename: proofName,
      status: finalNeedsReview ? "pending" : "confirmed",
      ...(finalNeedsReview
        ? {}
        : {
            reviewed_by_label: `pos:${operatorName}`,
            reviewed_at: new Date().toISOString(),
          }),
    };
    if (checked) checked.checks.verdict = verdictFor(flags); // upload failure may have added no_proof
    const payOptional: Record<string, unknown> = {
      source: "pos",
      receipt_amount: receiptAmount,
      ocr_reference: checked?.ocr.reference ?? null,
      ocr_amount: checked?.ocr.amount ?? null,
      ocr_confidence: ocrConfidenceRaw,
      ocr_text: ocrText || null,
      flags,
      captured_by: operatorName,
      proof_sha256: proofPath ? checked?.sha256 ?? null : null,
      proof_phash: proofPath ? checked?.phash ?? null : null,
      checks: checked?.checks ?? null,
    };
    // Room orders are paid at check-out: the bill line replaces the payment record
    let columnsMissing = false;
    if (roomBooking) {
      const { error: chErr } = await sb.from("booking_charges").insert({
        booking_id: roomBooking.id,
        kind: "food",
        description: `Room service #${order.order_number}`,
        quantity: 1,
        unit_price: total,
        order_id: order.id,
        created_by: `pos:${operatorName}`,
      });
      if (chErr) {
        console.error("Room charge failed:", chErr.message);
        return NextResponse.json({ success: false, error: `Order #${order.order_number} saved but NOT added to the room bill: ${chErr.message}` }, { status: 500 });
      }
    } else {
      const res = await insertPayment(sb, payRow, payOptional);
      columnsMissing = !!res.columnsMissing;
      if (res.error) console.error("POS payment insert failed:", res.error);
    }

    // ── 4. Audit trail ────────────────────────────────────────────────
    await sb.from("order_status_log").insert({
      order_id: order.id,
      from_status: "payment_pending",
      to_status: finalStatus,
      changed_by: `pos:${operatorName}`,
      note:
        (roomBooking ? `Charged to room ${roomBooking.room}` : `POS sale (${methodName(method)})`) +
        (isAnonymous ? " · anonymous customer" : "") +
        (finalNeedsReview ? ` · NEEDS REVIEW: ${flags.join(", ")}` : ""),
    });

    // ── 4b. Stock ledger (FEFO deduction, attributed to the operator) ─
    const stock = await recordSale(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      { orderId: order.id, orderNumber: order.order_number, channel: "pos", actor: `pos:${operatorName}` }
    );

    // ── 5. Telegram ───────────────────────────────────────────────────
    const methodLabel = roomBooking ? `🛏 Room ${roomBooking.room} bill` : methodName(method);
    let msg =
      `${finalNeedsReview ? "⚠️ *POS payment needs review*" : "🛍 *POS sale*"}\n\n` +
      `🧾 Order *#${order.order_number}* · \`${txId}\`\n` +
      `💰 *${total.toLocaleString()} ብር* via ${methodLabel}\n` +
      `🧑‍💼 Sold by ${md(operatorName)}\n` +
      (isAnonymous
        ? `👤 _Anonymous customer_ (no name/phone)\n`
        : `👤 ${md(name || "—")}${phone ? ` · 📞 ${md(phone)}` : ""}\n`);
    if (reference) msg += `🔢 Reference: \`${reference}\`${checked?.checks.manual ? " _(typed by hand)_" : ""}\n`;
    if (receiptAmount !== null && method !== "cash") msg += `🧮 Receipt amount: ${receiptAmount.toLocaleString()} ብር\n`;
    if (checked) msg += `\n${telegramChecksText(checked.checks, md)}`;
    if (finalNeedsReview) {
      msg += `\n🚩 *Flags*\n` + flags.map((f) => `• ${FLAG_LABELS[f] ?? f}`).join("\n");
      msg += `\n\n_The sale went through. Please verify the payment._`;
    }

    const keyboard = finalNeedsReview ? reviewKeyboard(order.order_number) : undefined;
    const silent = !finalNeedsReview; // only buzz the admin when something is off
    if (proofPath) {
      const { data: signed } = await sb.storage.from(PROOF_BUCKET).createSignedUrl(proofPath, 600);
      if (signed?.signedUrl) await notifyStaffPhoto(signed.signedUrl, msg, keyboard, silent);
      else await notifyStaff(msg, keyboard, silent);
    } else {
      await notifyStaff(msg, keyboard, silent);
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      transactionId: txId,
      total,
      status: finalStatus,
      anonymous: isAnonymous,
      flags,
      needsReview: finalNeedsReview,
      verdict: checked?.checks.verdict ?? null,
      duplicates: checked?.checks.duplicates ?? [],
      setupWarning: columnsMissing ? "Run phase2_pos.sql so receipt evidence is fully recorded." : null,
      stockWarning: stock.setupMissing ? "Run phase25_stock.sql to track stock." : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("POS sale error:", message);
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

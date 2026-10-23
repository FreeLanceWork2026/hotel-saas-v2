import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyStaffPhoto, reviewKeyboard } from "@/lib/telegram";
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_BYTES,
  PAYMENT_METHODS,
  PROOF_BUCKET,
  type PaymentMethodId,
} from "@/lib/paymentConfig";
import { FLAG_LABELS } from "@/lib/receiptParser";
import { insertPayment, runPaymentChecks, telegramChecksText } from "@/lib/paymentPipeline";

/** Escape Telegram legacy-Markdown specials in user-provided text. */
const md = (s: string) => s.replace(/([_*`\[])/g, "\\$1");

export const dynamic = "force-dynamic";

/** Keep the original filename recognisable but safe for storage paths. */
function safeFilename(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80);
  return cleaned || "proof.jpg";
}

/**
 * POST /api/payments/proof  (multipart/form-data)
 *   orderNumber, method (telebirr|cbe), file, referenceNumber?, payerName?
 *
 * Stores the screenshot in the private `payment-proofs` bucket, records a
 * pending payment, moves the order to `payment_review` and pings staff on
 * Telegram with Confirm / Reject buttons.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const orderNumber = String(form.get("orderNumber") ?? "").trim().toUpperCase();
    const method = String(form.get("method") ?? "telebirr") as PaymentMethodId;
    const rawReference = String(form.get("referenceNumber") ?? "").trim().slice(0, 60) || null;
    const payerName = String(form.get("payerName") ?? "").trim().slice(0, 80) || null;
    const ocrText = String(form.get("ocrText") ?? "").slice(0, 4000);
    const ocrConfRaw = Number(form.get("ocrConfidence"));
    const ocrConfidence = form.get("ocrConfidence") !== null && Number.isFinite(ocrConfRaw) ? Math.round(ocrConfRaw) : null;
    const phash = String(form.get("proofPhash") ?? "").trim().toLowerCase() || null;
    const file = form.get("file");

    if (!orderNumber) {
      return NextResponse.json({ success: false, error: "Missing order number." }, { status: 400 });
    }
    if (!(method in PAYMENT_METHODS)) {
      return NextResponse.json({ success: false, error: "Unknown payment method." }, { status: 400 });
    }
    if (!rawReference?.replace(/[^A-Za-z0-9]/g, "")) {
      return NextResponse.json(
        { success: false, error: "Please enter the transaction reference from your receipt." },
        { status: 400 }
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: "Please attach a screenshot of your payment." }, { status: 400 });
    }
    if (file.size > MAX_PROOF_BYTES) {
      return NextResponse.json({ success: false, error: "Image is too large (max 8 MB)." }, { status: 413 });
    }
    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Please upload a JPG, PNG or WebP image." }, { status: 415 });
    }

    const sb = getSupabaseAdmin();

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id, order_number, status, total, customer_name, customer_phone, transaction_id")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
    }
    if (order.status !== "payment_pending" && order.status !== "payment_review") {
      return NextResponse.json(
        { success: false, error: "This order no longer needs a payment." },
        { status: 409 }
      );
    }

    // ── 1. Store the image ────────────────────────────────────────────
    const originalName = file.name || "proof.jpg";
    const path = `${order.order_number}/${Date.now()}-${safeFilename(originalName)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await sb.storage
      .from(PROOF_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (upErr) {
      console.error("Proof upload failed:", upErr.message);
      const hint = /bucket/i.test(upErr.message)
        ? "Payment storage isn't set up yet (run the Phase 1 SQL)."
        : "Could not save your image. Please try again.";
      return NextResponse.json({ success: false, error: hint }, { status: 500 });
    }

    // ── 2. Checks: format, OCR evidence, earlier use of reference / image ─
    const checked = await runPaymentChecks(sb, {
      method,
      rawReference,
      expectedAmount: Number(order.total),
      receiptAmount: null,
      ocrText,
      ocrConfidence,
      photo: bytes,
      phash,
      excludeOrderId: order.id,
    });
    const referenceNumber = checked.reference;

    // ── 3. Payment record (always pending: online payments are confirmed by staff) ─
    const { id: paymentId, error: payErr } = await insertPayment(
      sb,
      {
        order_id: order.id,
        method,
        amount: order.total,
        transaction_id: order.transaction_id ?? order.order_number,
        reference_number: referenceNumber,
        payer_name: payerName,
        proof_path: path,
        proof_filename: originalName,
        status: "pending",
      },
      {
        source: "online",
        receipt_amount: checked.ocr.amount,
        ocr_reference: checked.ocr.reference,
        ocr_amount: checked.ocr.amount,
        ocr_confidence: ocrConfidence,
        ocr_text: ocrText || null,
        flags: checked.flags,
        proof_sha256: checked.sha256,
        proof_phash: checked.phash,
        checks: checked.checks,
      }
    );

    if (payErr) {
      console.error("Payment insert failed:", payErr);
      await sb.storage.from(PROOF_BUCKET).remove([path]);
      return NextResponse.json(
        { success: false, error: "Payments aren't set up yet (run the Phase 1 SQL)." },
        { status: 500 }
      );
    }

    // ── 4. Order → payment_review ────────────────────────────────────
    const previous = order.status;
    await sb
      .from("orders")
      .update({
        status: "payment_review",
        payment_method: method,
        payment_proof: path,
        payment_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await sb.from("order_status_log").insert({
      order_id: order.id,
      from_status: previous,
      to_status: "payment_review",
      changed_by: "customer",
      note: `Proof uploaded (${PAYMENT_METHODS[method].label})${referenceNumber ? ` · ref ${referenceNumber}` : ""}`,
    });

    // ── 5. Telegram: photo + verdict + Confirm/Reject buttons ────────
    const { data: signed } = await sb.storage.from(PROOF_BUCKET).createSignedUrl(path, 600);
    const caption =
      `🔍 *Payment proof received*\n\n` +
      `🧾 Order *#${order.order_number}*\n` +
      (order.transaction_id ? `🔖 \`${order.transaction_id}\`\n` : "") +
      `💰 *${Number(order.total).toLocaleString()} ብር* via ${PAYMENT_METHODS[method].label}\n` +
      `👤 ${md(order.customer_name ?? "—")} · 📞 ${md(order.customer_phone ?? "—")}\n` +
      (payerName ? `🏷️ Sender name: ${md(payerName)}\n` : "") +
      (referenceNumber ? `🔢 Reference: \`${referenceNumber}\`${checked.checks.manual ? " _(typed by hand)_" : ""}\n` : "") +
      `\n${telegramChecksText(checked.checks, md)}` +
      (checked.flags.length ? checked.flags.map((f) => `• ${FLAG_LABELS[f] ?? f}`).join("\n") + "\n" : "") +
      `\n_Check the reference in the Telebirr/CBE app before confirming._`;

    if (signed?.signedUrl) {
      await notifyStaffPhoto(signed.signedUrl, caption, reviewKeyboard(order.order_number), false);
    }

    return NextResponse.json({ success: true, paymentId, status: "payment_review" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Proof upload error:", message);
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

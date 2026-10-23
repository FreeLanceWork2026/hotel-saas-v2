import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PROOF_BUCKET } from "@/lib/paymentConfig";
import PaymentsClient, { type PaymentRow } from "./PaymentsClient";
import LiveRefresh from "@/components/ui/LiveRefresh";

export const dynamic = "force-dynamic";

type OrderEmbed = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: string;
  transaction_id: string | null;
  delivery_type: string | null;
  is_anonymous?: boolean | null;
};

// Crude name similarity: share at least one meaningful token (case/diacritics-insensitive)
function namesMatch(a?: string | null, b?: string | null) {
  if (!a || !b) return null; // unknown
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const ta = new Set(tokens(a));
  return tokens(b).some((t) => ta.has(t));
}

export default async function AdminPaymentsPage() {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("payments")
    .select("*, order:orders(order_number, customer_name, customer_phone, total, status, transaction_id, delivery_type, is_anonymous)")
    .order("created_at", { ascending: false })
    .limit(100);

  // Table not created yet → friendly setup notice (orders.is_anonymous may not exist before phase 2)
  if (error && /is_anonymous/.test(error.message)) {
    const retry = await sb
      .from("payments")
      .select("*, order:orders(order_number, customer_name, customer_phone, total, status, transaction_id, delivery_type)")
      .order("created_at", { ascending: false })
      .limit(100);
    return renderRows(sb, retry.data, retry.error?.message);
  }
  return renderRows(sb, data, error?.message);
}

async function renderRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  data: Record<string, unknown>[] | null,
  errorMessage?: string
) {
  if (errorMessage) {
    return <PaymentsClient payments={[]} setupError={errorMessage} />;
  }


  const rows: PaymentRow[] = await Promise.all(
    (data ?? []).map(async (p) => {
      const order = (Array.isArray(p.order) ? p.order[0] : p.order) as OrderEmbed | null;
      let proofUrl: string | null = null;
      if (p.proof_path) {
        const { data: signed } = await sb.storage
          .from(PROOF_BUCKET)
          .createSignedUrl(p.proof_path as string, 3600);
        proofUrl = signed?.signedUrl ?? null;
      }
      return {
        id: p.id as string,
        method: p.method as string,
        amount: Number(p.amount) || 0,
        transactionId: (p.transaction_id as string) ?? "",
        referenceNumber: (p.reference_number as string | null) ?? null,
        payerName: (p.payer_name as string | null) ?? null,
        proofUrl,
        proofFilename: (p.proof_filename as string | null) ?? null,
        status: p.status as "pending" | "confirmed" | "rejected",
        reviewedBy: (p.reviewed_by_label as string | null) ?? null,
        reviewedAt: (p.reviewed_at as string | null) ?? null,
        rejectReason: (p.reject_reason as string | null) ?? null,
        createdAt: p.created_at as string,
        orderNumber: order?.order_number ?? "",
        orderStatus: order?.status ?? "",
        customerName: order?.customer_name ?? "—",
        customerPhone: order?.customer_phone ?? "",
        orderTotal: Number(order?.total) || 0,
        deliveryType: order?.delivery_type ?? "pickup",
        nameMatch: namesMatch(p.payer_name as string | null, order?.customer_name),
        source: (p.source as string | null) === "pos" ? "pos" : "online",
        flags: Array.isArray(p.flags) ? (p.flags as string[]) : [],
        checks: (p.checks as PaymentRow["checks"]) ?? null,
        receiptAmount: p.receipt_amount === null || p.receipt_amount === undefined ? null : Number(p.receipt_amount),
        ocrConfidence: p.ocr_confidence === null || p.ocr_confidence === undefined ? null : Number(p.ocr_confidence),
        capturedBy: (p.captured_by as string | null) ?? null,
        anonymous: !!order?.is_anonymous,
      };
    })
  );

  return (
    <>
      <LiveRefresh intervalMs={5000} tables={["payments", "orders"]} />
      <PaymentsClient payments={rows} />
    </>
  );
}

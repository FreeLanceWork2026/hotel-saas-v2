// Server-only payment checks shared by POS (/api/pos/sale) and online (/api/payments/proof).
// Order: normalise reference → format/date → OCR evidence → duplicates (reference, image) → verdict.
// OCR is never proof; the verdict tells staff how hard to look.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateProof, parseReceipt } from "@/lib/receiptParser";
import {
  PHASH_RE,
  PHASH_SIMILAR_MAX,
  cbeReferenceAgeDays,
  hammingHex,
  isReferenceFormatValid,
  normalizeReference,
  verdictFor,
  type DigitalMethod,
  type Verdict,
} from "@/lib/paymentChecks";

export interface DuplicateMatch {
  kind: "reference" | "image" | "similar_image";
  orderNumber: string;
  amount: number;
  createdAt: string;
  status: string;
  capturedBy: string | null;
  customerName: string | null;
  source: string | null;
}

export interface PaymentChecks {
  verdict: Verdict;
  provider: DigitalMethod;
  manual: boolean;
  referenceAgeDays: number | null;
  duplicates: DuplicateMatch[];
}

export interface PipelineResult {
  reference: string | null;
  flags: string[];
  checks: PaymentChecks;
  sha256: string | null;
  phash: string | null;
  ocr: { reference: string | null; amount: number | null };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type PaymentHit = {
  reference_number?: string | null;
  proof_phash?: string | null;
  amount: number | string;
  created_at: string;
  status: string;
  captured_by?: string | null;
  source?: string | null;
  order_id: string;
  order: { order_number: string; customer_name: string | null } | { order_number: string; customer_name: string | null }[] | null;
};

function toMatch(kind: DuplicateMatch["kind"], p: PaymentHit): DuplicateMatch {
  const order = Array.isArray(p.order) ? p.order[0] : p.order;
  return {
    kind,
    orderNumber: order?.order_number ?? "?",
    amount: Number(p.amount) || 0,
    createdAt: p.created_at,
    status: p.status,
    capturedBy: p.captured_by ?? null,
    customerName: order?.customer_name ?? null,
    source: p.source ?? null,
  };
}

// captured_by / source / proof_* only exist after the phase2 + payment_checks migrations;
// fall back to fewer columns so a missing migration never blocks a sale.
const SELECTS = [
  "reference_number, proof_phash, amount, created_at, status, captured_by, source, order_id, order:orders(order_number, customer_name)",
  "reference_number, amount, created_at, status, order_id, order:orders(order_number, customer_name)",
];

async function queryPayments(
  sb: SupabaseClient,
  apply: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<PaymentHit[]> {
  for (const cols of SELECTS) {
    const { data, error } = await apply(sb.from("payments").select(cols));
    if (!error) return (data as PaymentHit[]) ?? [];
  }
  return [];
}

/** Earlier, non-rejected payments that reuse this reference or receipt image. */
export async function findDuplicates(
  sb: SupabaseClient,
  opts: { reference: string | null; sha256: string | null; phash: string | null; excludeOrderId?: string }
): Promise<DuplicateMatch[]> {
  const out: DuplicateMatch[] = [];
  const keep = (p: PaymentHit) => p.order_id !== opts.excludeOrderId;

  if (opts.reference) {
    const hits = await queryPayments(sb, (q) =>
      q.eq("reference_number", opts.reference).neq("status", "rejected").order("created_at", { ascending: false }).limit(5)
    );
    for (const p of hits.filter(keep)) out.push(toMatch("reference", p));
  }

  if (opts.sha256) {
    const hits = await queryPayments(sb, (q) =>
      q.eq("proof_sha256", opts.sha256).neq("status", "rejected").order("created_at", { ascending: false }).limit(5)
    );
    for (const p of hits.filter(keep)) out.push(toMatch("image", p));
  }

  if (opts.phash) {
    const recent = await queryPayments(sb, (q) =>
      q.not("proof_phash", "is", null).neq("status", "rejected").order("created_at", { ascending: false }).limit(500)
    );
    const exactOrders = new Set(out.filter((d) => d.kind === "image").map((d) => d.orderNumber));
    for (const p of recent.filter(keep)) {
      if (!p.proof_phash || !PHASH_RE.test(p.proof_phash)) continue;
      if (hammingHex(p.proof_phash, opts.phash) > PHASH_SIMILAR_MAX) continue;
      const m = toMatch("similar_image", p);
      if (!exactOrders.has(m.orderNumber)) out.push(m);
      if (out.filter((d) => d.kind === "similar_image").length >= 5) break;
    }
  }
  return out;
}

export async function runPaymentChecks(
  sb: SupabaseClient,
  input: {
    method: DigitalMethod;
    rawReference: string | null;
    expectedAmount: number;
    /** amount the cashier confirmed; online uses the OCR amount */
    receiptAmount: number | null;
    ocrText: string;
    ocrConfidence: number | null;
    photo: Uint8Array | null;
    phash: string | null;
    excludeOrderId?: string;
  }
): Promise<PipelineResult> {
  const parsed = input.ocrText ? parseReceipt(input.ocrText) : null;
  const reference = normalizeReference(input.rawReference, input.method);
  const ocrReference = parsed?.reference ? normalizeReference(parsed.reference, input.method) : null;
  const receiptAmount = input.receiptAmount ?? parsed?.amount ?? null;

  const flags: string[] = evaluateProof({
    expectedAmount: input.expectedAmount,
    chosenMethod: input.method,
    reference,
    receiptAmount,
    ocrReference,
    ocrAmount: parsed?.amount ?? null,
    ocrConfidence: input.ocrConfidence,
    ocrMethod: parsed?.method,
    hasPhoto: !!input.photo,
  });

  const manual = !!reference && !ocrReference;
  if (manual) flags.push("manual_reference");

  let referenceAgeDays: number | null = null;
  if (reference) {
    if (!isReferenceFormatValid(reference, input.method)) flags.push("bad_reference_format");
    else if (input.method === "cbe") {
      referenceAgeDays = cbeReferenceAgeDays(reference);
      if (referenceAgeDays !== null && (referenceAgeDays > 1 || referenceAgeDays < -1)) flags.push("old_reference");
    }
  }

  const sha256 = input.photo ? await sha256Hex(input.photo) : null;
  const phash = input.phash && PHASH_RE.test(input.phash) ? input.phash : null;
  const duplicates = await findDuplicates(sb, { reference, sha256, phash, excludeOrderId: input.excludeOrderId });
  if (duplicates.some((d) => d.kind === "reference")) flags.push("duplicate_reference");
  if (duplicates.some((d) => d.kind === "image")) flags.push("duplicate_image");
  else if (duplicates.some((d) => d.kind === "similar_image")) flags.push("similar_image");

  const unique = [...new Set(flags)];
  return {
    reference,
    flags: unique,
    checks: { verdict: verdictFor(unique), provider: input.method, manual, referenceAgeDays, duplicates },
    sha256,
    phash,
    ocr: { reference: ocrReference, amount: parsed?.amount ?? null },
  };
}

/** Insert a payment, dropping optional columns a missing migration doesn't have yet. */
export async function insertPayment(
  sb: SupabaseClient,
  base: Record<string, unknown>,
  optional: Record<string, unknown>
): Promise<{ id: string | null; error: string; columnsMissing: boolean }> {
  const opt = { ...optional };
  let columnsMissing = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const { data, error } = await sb.from("payments").insert({ ...base, ...opt }).select("id").single();
    if (!error) return { id: (data?.id as string) ?? null, error: "", columnsMissing };
    const missing = Object.keys(opt).find((c) => error.message.includes(c));
    if (!missing) return { id: null, error: error.message, columnsMissing };
    delete opt[missing];
    columnsMissing = true;
  }
  return { id: null, error: "Too many missing columns", columnsMissing: true };
}

const VERDICT_LINE: Record<Verdict, string> = {
  green: "🟢 *Checks passed*",
  yellow: "🟡 *Needs a look*",
  red: "🔴 *Possible fraud: receipt used before*",
};

/** Telegram (legacy Markdown) lines describing the verdict and any earlier use.
 *  Reference reuse gets a dramatically different, high-priority format. */
export function telegramChecksText(checks: PaymentChecks, escape: (s: string) => string): string {
  const refDupes = checks.duplicates.filter((d) => d.kind === "reference");
  const imgDupes = checks.duplicates.filter((d) => d.kind !== "reference");

  // ── Reference reuse: alarming, standalone block ─────────────────────
  if (refDupes.length > 0) {
    let msg = `🚨🚨 *RECEIPT REUSE DETECTED* 🚨🚨\n`;
    msg += `💀 *This reference number was already paid with on ${refDupes.length} earlier order${refDupes.length > 1 ? "s" : ""}.*\n\n`;
    for (const d of refDupes) {
      const when = new Date(d.createdAt).toLocaleString("en-GB", {
        timeZone: "Africa/Addis_Ababa",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      msg += `┌─ 🔁 *Previously used on #${escape(d.orderNumber)}*\n`;
      msg += `│  💰 ${d.amount.toLocaleString()} ብር`;
      if (d.capturedBy) msg += ` · 🧑‍💼 Sold by ${escape(d.capturedBy)}`;
      else if (d.customerName) msg += ` · 👤 ${escape(d.customerName)}`;
      msg += `\n│  📅 ${when}\n`;
      msg += `│  Status: \`${d.status}\`\n`;
      msg += `└─────────────\n`;
    }
    msg += `\n⛔️ *DO NOT CONFIRM* until verified in the bank app.\n`;
    // Still append image dupes beneath
    for (const d of imgDupes.slice(0, 2)) {
      const what = d.kind === "image" ? "Same image" : "Similar image";
      const when = new Date(d.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      msg += `🖼 ${what} on *#${escape(d.orderNumber)}* · ${d.amount.toLocaleString()} ብར · ${when}` +
        (d.capturedBy ? ` · by ${escape(d.capturedBy)}` : d.customerName ? ` · ${escape(d.customerName)}` : "") +
        ` · ${d.status}\n`;
    }
    return msg;
  }

  // ── Normal verdict + image duplicates ────────────────────────────────
  let msg = VERDICT_LINE[checks.verdict] + "\n";
  for (const d of checks.duplicates.slice(0, 3)) {
    const what = d.kind === "image" ? "Same image" : "Similar image";
    const when = new Date(d.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    msg +=
      `🔁 ${what} on *#${escape(d.orderNumber)}* · ${d.amount.toLocaleString()} ብር · ${when}` +
      (d.capturedBy ? ` · by ${escape(d.capturedBy)}` : d.customerName ? ` · ${escape(d.customerName)}` : "") +
      ` · ${d.status}\n`;
  }
  return msg;
}

// Receipt text parsing + validation — pure functions, safe for client AND server.
// Built against real CBE (PDF + mobile "Thank you") and Telebirr receipts.

export type ReceiptMethod = "telebirr" | "cbe" | "unknown";

export interface ParsedReceipt {
  /** Bank/Telebirr transaction reference (FT26278YHRLD / DJ56FIAEH2) */
  reference: string | null;
  /** Our own NL-XXXXXXXX code if the customer put it in the remark */
  ourReference: string | null;
  /** Amount that actually reached us (NOT the "total debited" incl. fees) */
  amount: number | null;
  method: ReceiptMethod;
}

const toNumber = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Tesseract often reads 0↔O, 1↔I/l inside IDs; normalise inside the numeric parts. */
function fixDigits(s: string) {
  return s.replace(/O/g, "0").replace(/[Il]/g, "1");
}

export function parseReceipt(raw: string): ParsedReceipt {
  const text = raw.replace(/\u00a0/g, " ");
  const flat = text.replace(/\s+/g, " ");

  // ── Reference ──────────────────────────────────────────────────────
  let reference: string | null = null;
  let method: ReceiptMethod = "unknown";

  // CBE: FT + 5 digits + 5 alphanumerics (e.g. FT26278YHRLD)
  const cbe = flat.match(/\bF[T7]\s?([0-9OIl]{5})\s?([A-Z0-9]{5})\b/);
  if (cbe) {
    reference = `FT${fixDigits(cbe[1])}${cbe[2]}`;
    method = "cbe";
  }

  // Telebirr: labelled "Transaction Number: DJ56FIAEH2"
  if (!reference) {
    const labelled = flat.match(/transaction\s*(?:number|no\.?|id)\s*[:\-]?\s*([A-Z0-9]{8,12})\b/i);
    if (labelled) {
      reference = labelled[1].toUpperCase();
      method = "telebirr";
    }
  }
  if (!reference) {
    // Unlabelled Telebirr-looking token: 2 letters, 2 digits, 6 alphanumerics
    const loose = flat.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{6})\b/);
    if (loose) {
      reference = loose[1];
      method = "telebirr";
    }
  }
  if (method === "unknown" && /commercial\s+bank/i.test(flat)) method = "cbe";
  if (method === "unknown" && /tele\s?birr|ethio\s?telecom/i.test(flat)) method = "telebirr";

  // Our NL-XXXXXXXX remark (alphabet excludes 0/O/1/I/L)
  const ours = flat.toUpperCase().match(/\bNL[-\s]?([A-HJKMNP-Z2-9]{8})\b/);
  const ourReference = ours ? `NL-${ours[1]}` : null;

  // ── Amount ─────────────────────────────────────────────────────────
  const money = "([\\d]{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)";
  let amount: number | null = null;
  const tries: RegExp[] = [
    new RegExp(`transferred\\s+amount[^0-9]{0,40}${money}`, "i"), // CBE PDF
    new RegExp(`transferred\\s+ETB\\s*${money}`, "i"),            // CBE mobile summary
    new RegExp(`-\\s?${money}\\s*\\(?\\s*ETB`, "i"),               // Telebirr "-2.00 (ETB)"
    new RegExp(`${money}\\s*\\(?\\s*ETB\\)?`, "i"),                // fallback: first "N ETB"
    new RegExp(`ETB\\s*${money}`, "i"),
  ];
  for (const re of tries) {
    const m = flat.match(re);
    if (m) {
      amount = toNumber(m[1]);
      if (amount !== null) break;
    }
  }

  return { reference, ourReference, amount, method };
}

// ── Validation (the server re-runs this; never trust the client's verdict) ──

export const MIN_OCR_CONFIDENCE = 85;
export const AMOUNT_TOLERANCE = 0.5; // ETB

export type PaymentFlag =
  | "amount_mismatch"    // receipt amount ≠ sale total
  | "no_amount"          // couldn't read an amount
  | "no_reference"       // no transaction reference
  | "low_ocr_confidence" // OCR unsure → human should look
  | "edited_by_employee" // employee changed what OCR read
  | "duplicate_reference"// same receipt already used on another sale
  | "no_proof"           // employee could not capture a receipt photo
  | "method_mismatch"    // receipt looks like CBE but Telebirr was chosen (or vice-versa)
  | "manual_reference"   // reference typed by hand, not read from the receipt
  | "bad_reference_format" // doesn't look like a CBE / Telebirr reference
  | "old_reference"      // CBE reference dated more than a day ago
  | "duplicate_image"    // exact same receipt image uploaded before
  | "similar_image";     // near-identical receipt image uploaded before

export const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: "Receipt amount is less than the sale",
  no_amount: "Amount not readable",
  no_reference: "No transaction reference",
  low_ocr_confidence: "Low OCR confidence",
  edited_by_employee: "Reference or amount changed after scanning",
  duplicate_reference: "Reference already used on another sale",
  no_proof: "No receipt photo captured",
  method_mismatch: "Receipt doesn't match the chosen method",
  manual_reference: "Reference typed by hand (not read from the receipt)",
  bad_reference_format: "Reference doesn't look like a real one",
  old_reference: "Reference is dated more than a day ago",
  duplicate_image: "This exact receipt image was used before",
  similar_image: "A near-identical receipt image was used before",
};

export function evaluateProof(input: {
  expectedAmount: number;
  chosenMethod: "telebirr" | "cbe";
  /** what the employee confirmed in the form */
  reference: string | null;
  receiptAmount: number | null;
  /** raw OCR result (may be empty if OCR failed) */
  ocrReference: string | null;
  ocrAmount: number | null;
  ocrConfidence: number | null;
  ocrMethod?: ReceiptMethod;
  hasPhoto: boolean;
}): PaymentFlag[] {
  const flags: PaymentFlag[] = [];

  if (!input.hasPhoto) flags.push("no_proof");

  if (!input.reference) flags.push("no_reference");

  if (input.receiptAmount === null) flags.push("no_amount");
  // Paying more than due is fine; paying less is not.
  else if (input.expectedAmount - input.receiptAmount > AMOUNT_TOLERANCE) flags.push("amount_mismatch");

  if (input.hasPhoto && (input.ocrConfidence === null || input.ocrConfidence < MIN_OCR_CONFIDENCE)) {
    flags.push("low_ocr_confidence");
  }

  const norm = (s: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();
  const refEdited = norm(input.reference) !== norm(input.ocrReference) && !!input.ocrReference;
  const amtEdited =
    input.receiptAmount !== null &&
    input.ocrAmount !== null &&
    Math.abs(input.receiptAmount - input.ocrAmount) > 0.001;
  if (refEdited || amtEdited) flags.push("edited_by_employee");

  if (
    input.ocrMethod &&
    input.ocrMethod !== "unknown" &&
    input.ocrMethod !== input.chosenMethod
  ) {
    flags.push("method_mismatch");
  }

  return flags;
}

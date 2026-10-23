// Barcode helpers — pure functions, safe on both server and client.

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(first12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Internal in-store barcode: EAN-13 in the "20–29" restricted-distribution range,
 * which GS1 reserves for store-internal use — it can never clash with a real
 * manufacturer barcode (jelly, pumpkin-seed oil, …) and every scanner reads it.
 */
export function generateInternalEan13(): string {
  let body = "20";
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10);
  return body + ean13CheckDigit(body);
}

/** Normalise what a scanner/camera produced so it can be matched against the catalog. */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** QR payload for batch labels: NL:<sku>:<batch> */
export function batchQrPayload(sku: string, batchCode?: string | null): string {
  return `NL:${sku}${batchCode ? `:${batchCode}` : ""}`;
}

/** Parse a scanned value that might be a batch-label QR; returns the SKU if so. */
export function skuFromScan(raw: string): string {
  const v = raw.trim();
  if (/^NL:/i.test(v)) return normalizeCode(v.split(":")[1] ?? "");
  return normalizeCode(v);
}

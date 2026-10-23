// Reference-number rules — pure functions, safe for client AND server.
// Formats come from real receipts (see RESEARCH.md in retail-saas, §1.2).

export type DigitalMethod = "telebirr" | "cbe";
export type Verdict = "green" | "yellow" | "red";

/** Uppercase, strip separators, and fix OCR digit slips where the format is known. */
export function normalizeReference(raw: string | null | undefined, method: DigitalMethod): string | null {
  let s = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  if (method === "cbe") {
    // "F7" is a common misread of "FT"; positions 3-7 are always digits (YYDDD).
    if (s.startsWith("F7")) s = "FT" + s.slice(2);
    if (s.startsWith("FT") && s.length >= 7) {
      const digits = s.slice(2, 7).replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
      s = "FT" + digits + s.slice(7);
    }
  }
  return s.slice(0, 40);
}

/** CBE: FT + YY + day-of-year + 5 alphanumerics. Telebirr: 10 alphanumerics with letters and digits. */
export function isReferenceFormatValid(ref: string, method: DigitalMethod): boolean {
  if (method === "cbe") {
    if (!/^FT\d{5}[A-Z0-9]{5}$/.test(ref)) return false;
    const day = Number(ref.slice(4, 7));
    return day >= 1 && day <= 366;
  }
  return /^[A-Z0-9]{10}$/.test(ref) && /[A-Z]/.test(ref) && /\d/.test(ref);
}

/** The date encoded in a CBE reference (FT26278… → 2026, day 278), or null. */
export function cbeReferenceDate(ref: string): Date | null {
  const m = ref.match(/^FT(\d{2})(\d{3})/);
  if (!m) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 366) return null;
  return new Date(Date.UTC(2000 + Number(m[1]), 0, day));
}

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // Ethiopia is UTC+3, no DST

/** Whole days between the reference date and today in Ethiopia (positive = in the past). */
export function cbeReferenceAgeDays(ref: string, now: Date = new Date()): number | null {
  const d = cbeReferenceDate(ref);
  if (!d) return null;
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return Math.round((today - d.getTime()) / 86_400_000);
}

/** Flags that mean "this is very likely a reused receipt". */
export const FRAUD_FLAGS = new Set(["duplicate_reference", "duplicate_image"]);

export function verdictFor(flags: string[]): Verdict {
  if (flags.some((f) => FRAUD_FLAGS.has(f))) return "red";
  return flags.length > 0 ? "yellow" : "green";
}

// ── Perceptual hash helpers (dHash, 64 bits as 16 hex chars) ──────────

export const PHASH_RE = /^[0-9a-f]{16}$/;
/** Hamming distance at or below this = same picture (recompressed, resized, slightly cropped). */
export const PHASH_SIMILAR_MAX = 6;

export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

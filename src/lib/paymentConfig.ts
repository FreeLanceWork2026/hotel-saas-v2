// Payment account details shown to customers (client + server safe — no secrets).
// When you move to merchant accounts, change the values here in one place.

export type PaymentMethodId = "telebirr" | "cbe";

// MULTI-TENANT NOTE: PAYEE_NAME and PAYMENT_METHODS below are per-business values.
// They are the default Entoto Haven settings; later they move to a per-tenant
// `settings` table and are read via one accessor so callers don't change.
export const PAYEE_NAME = "Entoto Haven";

export const PAYMENT_METHODS: Record<
  PaymentMethodId,
  {
    id: PaymentMethodId;
    label: string;
    labelAm: string;
    /** The number the customer sends money to (phone for Telebirr, account for CBE) */
    account: string;
    accountLabel: string;
    accountLabelAm: string;
    /** Static QR image (personal accounts can't pre-fill the amount) */
    qr?: string;
    accent: string;
  }
> = {
  telebirr: {
    id: "telebirr",
    label: "Telebirr",
    labelAm: "ቴሌብር",
    account: "0920375262",
    accountLabel: "Telebirr phone number",
    accountLabelAm: "የቴሌብር ስልክ ቁጥር",
    accent: "#2fa4e7",
  },
  cbe: {
    id: "cbe",
    label: "CBE (Commercial Bank of Ethiopia)",
    labelAm: "የኢትዮጵያ ንግድ ባንክ",
    account: "1000496230489",
    accountLabel: "CBE account number",
    accountLabelAm: "የባንክ ሂሳብ ቁጥር",
    qr: "/payments/cbe-qr.png",
    accent: "#8b2fc9",
  },
};

export const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const PROOF_BUCKET = "payment-proofs";

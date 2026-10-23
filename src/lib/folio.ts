// Guest bill (folio) maths. Pure module so server, client and tests share it.
// The room/hall price is bookings.total_amount; extras and payments are rows.

export type ChargeKind = "food" | "service" | "custom";
export type PaymentMethod = "cash" | "telebirr" | "cbe" | "other";
export type ServiceUnit = "each" | "plate" | "person" | "day" | "hour";

export interface Charge {
  id: string;
  booking_id: string;
  kind: ChargeKind;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  order_id: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface Payment {
  id: string;
  booking_id: string;
  kind: "retainer" | "payment";
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  received_by: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface Service {
  id: string;
  name: string;
  name_am: string | null;
  unit: ServiceUnit;
  price: number;
  sort_order: number;
  is_active: boolean;
}

export interface FolioTotals {
  roomTotal: number;
  extrasTotal: number;
  totalDue: number;
  paid: number;
  balance: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function folioTotals(roomTotal: number, charges: Pick<Charge, "amount" | "voided_at">[], payments: Pick<Payment, "amount" | "voided_at">[]): FolioTotals {
  const extrasTotal = money(charges.filter((c) => !c.voided_at).reduce((s, c) => s + Number(c.amount), 0));
  const paid = money(payments.filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0));
  const totalDue = money(Number(roomTotal) + extrasTotal);
  return { roomTotal: money(Number(roomTotal)), extrasTotal, totalDue, paid, balance: money(totalDue - paid) };
}

/** Retainer asked for the room/hall price (whole birr, rounded up). */
export function retainerAmount(roomTotal: number, percent: number): number {
  if (!(percent > 0)) return 0;
  return Math.ceil((roomTotal * Math.min(100, percent)) / 100);
}

/** How much of the retainer is still unpaid (0 when covered). */
export function retainerOutstanding(roomTotal: number, percent: number, paid: number): number {
  return Math.max(0, money(retainerAmount(roomTotal, percent) - paid));
}

/** Parse the admin's retainer setting ("25", "50%") → 0–100, 0 when unset/invalid. */
export function parsePercent(raw: string | null | undefined): number {
  const n = Number(String(raw ?? "").replace("%", "").trim());
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash", telebirr: "Telebirr", cbe: "CBE Birr", other: "Other",
};

export const UNIT_LABEL: Record<ServiceUnit, string> = {
  each: "each", plate: "per plate", person: "per person", day: "per day", hour: "per hour",
};

"use server";

// Guest bill (folio) actions — charges, payments, credit approval.
// Staff (admin or kiosk operator) can add; only admins can void or approve credit.
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getFeatures } from "@/lib/featuresServer";
import { notifyStaff } from "@/lib/telegram";
import { getStaffActor } from "@/lib/bookingServer";
import { getSiteSettings } from "@/app/[locale]/admin/settings/actions";
import {
  folioTotals, parsePercent,
  type Charge, type ChargeKind, type FolioTotals, type Payment, type PaymentMethod, type Service,
} from "@/lib/folio";
import type { Booking } from "@/lib/booking";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export interface Folio {
  booking: Booking & { credit_approved_by: string | null; credit_approved_at: string | null; credit_note: string | null };
  roomNumber: string | null;
  typeName: string | null;
  isHall: boolean;
  charges: Charge[];
  payments: Payment[];
  totals: FolioTotals;
  services: Service[];
  menu: { id: string; name: string; price: number; category: string }[];
  retainerPercent: number;   // 0 when the retainer switch is OFF
  canAdmin: boolean;
  allow: { events: boolean; credit: boolean };
}

const OPEN = ["requested", "reserved", "checked_in", "checked_out"];
const num = (v: unknown) => Number(v ?? 0);

function refresh() {
  revalidatePath("/[locale]/admin/bookings", "page");
  revalidatePath("/[locale]/admin/balances", "page");
  revalidatePath("/[locale]/kiosk/rooms", "page");
}

async function staff() {
  const features = await getFeatures();
  if (!features.booking) return { error: "Bookings are not enabled." } as const;
  const actor = await getStaffActor();
  if (!actor) return { error: "Sign in to the front desk first." } as const;
  return { actor, features } as const;
}

async function loadCharges(bookingId: string) {
  const sb = getSupabaseAdmin();
  const [c, p] = await Promise.all([
    sb.from("booking_charges").select("*").eq("booking_id", bookingId).order("created_at"),
    sb.from("booking_payments").select("*").eq("booking_id", bookingId).order("created_at"),
  ]);
  if (c.error || p.error) return null;
  const charges = (c.data ?? []).map((x) => ({ ...x, quantity: num(x.quantity), unit_price: num(x.unit_price), amount: num(x.amount) })) as Charge[];
  const payments = (p.data ?? []).map((x) => ({ ...x, amount: num(x.amount) })) as Payment[];
  return { charges, payments };
}

export async function getFolio(bookingId: string): Promise<Result<Folio>> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };

  const sb = getSupabaseAdmin();
  const { data: b } = await sb.from("bookings").select("*, rooms(number), room_types(name, kind)").eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false, error: "Booking not found." };

  const lines = await loadCharges(bookingId);
  if (!lines) return { ok: false, error: "Bill tables missing — run database/folio.sql in Supabase." };

  const [svc, menu, settings] = await Promise.all([
    sb.from("services").select("*").eq("is_active", true).order("sort_order").order("name"),
    sb.from("products").select("id, name, price, category").eq("is_active", true).order("category").order("name"),
    getSiteSettings(),
  ]);

  const { rooms, room_types, ...booking } = b as Record<string, unknown> & { rooms: { number: string } | null; room_types: { name: string; kind: string } | null };
  const totalAmount = num(booking.total_amount);
  return {
    ok: true,
    data: {
      booking: { ...(booking as unknown as Folio["booking"]), total_amount: totalAmount, deposit_amount: num(booking.deposit_amount) },
      roomNumber: rooms?.number ?? null,
      typeName: room_types?.name ?? null,
      isHall: room_types?.kind === "hall",
      ...lines,
      totals: folioTotals(totalAmount, lines.charges, lines.payments),
      services: ((svc.data ?? []) as Service[]).map((x) => ({ ...x, price: num(x.price) })),
      menu: (menu.data ?? []).map((x) => ({ id: String(x.id), name: String(x.name), price: num(x.price), category: String(x.category ?? "") })),
      retainerPercent: g.features.retainer ? parsePercent(settings.retainer_percent) : 0,
      canAdmin: g.actor.isAdmin,
      allow: { events: g.features.events, credit: g.features.credit },
    },
  };
}

export interface ChargeInput {
  bookingId: string;
  kind: ChargeKind;
  description: string;
  quantity: number;
  unitPrice: number;
  serviceId?: string;
  productId?: string;
}

export async function addCharge(input: ChargeInput): Promise<Result> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  if (input.kind === "service" && !g.features.events) return { ok: false, error: "Events & services are not enabled." };
  if (!input.description.trim()) return { ok: false, error: "Description is required." };
  if (!(input.quantity > 0)) return { ok: false, error: "Quantity must be more than 0." };
  if (!(input.unitPrice >= 0)) return { ok: false, error: "Price must be 0 or more." };

  const sb = getSupabaseAdmin();
  const { data: b } = await sb.from("bookings").select("status").eq("id", input.bookingId).maybeSingle();
  if (!b || !OPEN.includes(b.status)) return { ok: false, error: "This booking can't take charges." };

  const { error } = await sb.from("booking_charges").insert({
    booking_id: input.bookingId,
    kind: input.kind,
    description: input.description.trim().slice(0, 200),
    quantity: input.quantity,
    unit_price: input.unitPrice,
    service_id: input.serviceId || null,
    product_id: input.productId || null,
    created_by: g.actor.label,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export interface PaymentInput {
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  kind?: "retainer" | "payment";
}

export async function addPayment(input: PaymentInput): Promise<Result> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  return insertPayment(input, g.actor.label);
}

/** Not exported: every export of a "use server" file is a public endpoint. Caller has checked auth. */
async function insertPayment(input: PaymentInput, actorLabel: string): Promise<Result> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { ok: false, error: "Amount must be more than 0." };
  if (!["cash", "telebirr", "cbe", "other"].includes(input.method)) return { ok: false, error: "Choose a payment method." };
  if (input.method !== "cash" && !input.reference?.trim()) return { ok: false, error: "Enter the transaction reference." };

  const sb = getSupabaseAdmin();
  const { data: bal } = await sb.from("booking_balances").select("balance").eq("booking_id", input.bookingId).maybeSingle();
  if (bal && amount > num(bal.balance) + 0.009) {
    return { ok: false, error: `That is more than the balance (${num(bal.balance).toLocaleString()} ETB).` };
  }

  const { error } = await sb.from("booking_payments").insert({
    booking_id: input.bookingId,
    kind: input.kind ?? "payment",
    amount,
    method: input.method,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    received_by: actorLabel,
  });
  if (error) return { ok: false, error: /booking_payments/.test(error.message) ? "Run database/folio.sql in Supabase first." : error.message };
  refresh();
  return { ok: true };
}

async function voidRow(table: "booking_charges" | "booking_payments", id: string, reason: string): Promise<Result> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  if (!g.actor.isAdmin) return { ok: false, error: "Only an admin can void." };
  if (!reason.trim()) return { ok: false, error: "Give a reason." };
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .update({ voided_at: new Date().toISOString(), voided_by: g.actor.label, void_reason: reason.trim() })
    .eq("id", id)
    .is("voided_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Already voided." };
  refresh();
  return { ok: true };
}

export async function voidCharge(id: string, reason: string) { return voidRow("booking_charges", id, reason); }
export async function voidPayment(id: string, reason: string) { return voidRow("booking_payments", id, reason); }

/** Admin lets this guest leave with an unpaid balance. */
export async function approveCredit(bookingId: string, note: string): Promise<Result> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  if (!g.features.credit) return { ok: false, error: "Credit is not enabled." };
  if (!g.actor.isAdmin) return { ok: false, error: "Only an admin can approve credit." };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bookings")
    .update({ credit_approved_by: g.actor.label, credit_approved_at: new Date().toISOString(), credit_note: note.trim() || null })
    .eq("id", bookingId)
    .select("code, guest_name")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Booking not found." };
  refresh();
  return { ok: true };
}

/** Front desk asks the admin (via Telegram) to approve credit. */
export async function requestCredit(bookingId: string): Promise<Result> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  const sb = getSupabaseAdmin();
  const [{ data: b }, { data: bal }] = await Promise.all([
    sb.from("bookings").select("code, guest_name, guest_phone").eq("id", bookingId).maybeSingle(),
    sb.from("booking_balances").select("balance").eq("booking_id", bookingId).maybeSingle(),
  ]);
  if (!b) return { ok: false, error: "Booking not found." };
  await notifyStaff(
    `💳 *Credit approval requested* ${b.code}\n${b.guest_name} · ${b.guest_phone}\n` +
      `Balance: *${num(bal?.balance).toLocaleString()} ETB*\nRequested by ${g.actor.label}\n\nApprove on the bookings board.`
  );
  return { ok: true };
}

/** In-house guests (checked in) for "charge to room" at the POS. */
export async function listInHouse(): Promise<Result<{ bookingId: string; room: string; guest: string }[]>> {
  const g = await staff();
  if ("error" in g) return { ok: false, error: g.error! };
  if (!g.features.room_service) return { ok: false, error: "Charge to room is not enabled." };
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .select("id, guest_name, rooms(number)")
    .eq("status", "checked_in")
    .order("guest_name");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((b) => ({
      bookingId: String(b.id),
      room: String((b.rooms as unknown as { number: string } | null)?.number ?? "?"),
      guest: String(b.guest_name),
    })),
  };
}

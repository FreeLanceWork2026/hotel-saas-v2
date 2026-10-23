"use server";

// Front-desk booking actions — shared by /admin/bookings and /kiosk/rooms.
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getFeatures, isFeatureOn } from "@/lib/featuresServer";
import { notifyStaff } from "@/lib/telegram";
import { addPayment } from "./folioActions";
import type { PaymentMethod } from "@/lib/folio";
import { getStaffActor, loadBlockingBookings, loadHotelSetup } from "@/lib/bookingServer";
import {
  availableRooms, isIsoDate, quoteStay, roomCapacity, suggestRooms,
  type Housekeeping, type Room, type RoomType,
} from "@/lib/booking";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export interface BookingInput {
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestPhone: string;
  guestIdNumber?: string;
  nationality?: string;
  notes?: string;
  /** Optional money taken while booking (recorded as a retainer payment on create) */
  payNow?: { amount: number; method: PaymentMethod; reference?: string };
}

export interface RoomSuggestion {
  roomId: string;
  number: string;
  typeName: string;
  kind: "room" | "hall";
  beds: number;
  total: number;
}

const ID_BUCKET = "guest-ids";
const clean = (s: string | undefined) => (s ?? "").trim() || null;

async function guard(): Promise<Result<{ label: string }>> {
  if (!(await isFeatureOn("booking"))) return { ok: false, error: "Bookings are not enabled." };
  const actor = await getStaffActor();
  if (!actor) return { ok: false, error: "Sign in to the front desk first." };
  return { ok: true, data: { label: actor.label } };
}

function refresh() {
  revalidatePath("/[locale]/admin/bookings", "page");
  revalidatePath("/[locale]/kiosk/rooms", "page");
  revalidatePath("/[locale]/rooms", "page");
}

function dbError(message: string, code?: string): string {
  if (code === "23P01" || /bookings_no_overlap/.test(message)) return "That room is already booked for some of those dates.";
  if (/bookings_id_on_checkin/.test(message)) return "Guest ID number is required to check in.";
  if (/bookings_dates_check/.test(message)) return "Check-out must be after check-in.";
  return message;
}

/** Validate a stay against the current setup and price it. */
async function priceStay(
  roomId: string, checkIn: string, checkOut: string, guests: number
): Promise<Result<{ room: Room; type: RoomType; total: number }>> {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return { ok: false, error: "Pick valid dates." };
  if (checkOut <= checkIn) return { ok: false, error: "Check-out must be after check-in." };
  if (!Number.isInteger(guests) || guests < 1) return { ok: false, error: "Guests must be at least 1." };

  const setup = await loadHotelSetup();
  if (!setup.ready) return { ok: false, error: "Hotel tables missing — run database/hotel.sql in Supabase." };
  const room = setup.rooms.find((r) => r.id === roomId);
  const type = room && setup.types.find((t) => t.id === room.room_type_id);
  if (!room || !type) return { ok: false, error: "Room not found." };
  if (!room.is_active || room.housekeeping === "out_of_service") return { ok: false, error: `Room ${room.number} is out of service.` };
  const cap = roomCapacity(room, type);
  if (guests > cap) return { ok: false, error: `Room ${room.number} fits at most ${cap} ${type.kind === "hall" ? "people" : "guests"}.` };

  const rates = setup.rates.filter((r) => r.room_type_id === type.id);
  return { ok: true, data: { room, type, total: quoteStay(type, rates, checkIn, checkOut, guests).total } };
}

/** Free rooms for the dates, best fit first (keeps big rooms for groups). */
export async function findRooms(
  checkIn: string, checkOut: string, guests: number, ignoreBookingId?: string
): Promise<Result<RoomSuggestion[]>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return { ok: false, error: "Pick valid dates." };

  const [setup, bookings] = await Promise.all([loadHotelSetup({ activeOnly: true }), loadBlockingBookings(checkIn, checkOut)]);
  const types = new Map(setup.types.map((t) => [t.id, t]));
  const free = suggestRooms(availableRooms(setup.rooms, bookings, checkIn, checkOut, ignoreBookingId), types, guests);
  return {
    ok: true,
    data: free.map((r) => {
      const t = types.get(r.room_type_id)!;
      const rates = setup.rates.filter((x) => x.room_type_id === t.id);
      return { roomId: r.id, number: r.number, typeName: t.name, kind: t.kind, beds: r.beds, total: quoteStay(t, rates, checkIn, checkOut, guests).total };
    }),
  };
}

export async function createBooking(input: BookingInput): Promise<Result<{ id: string; code: string; warning?: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!input.guestName.trim() || !input.guestPhone.trim()) return { ok: false, error: "Guest name and phone are required." };

  const priced = await priceStay(input.roomId, input.checkIn, input.checkOut, input.guests);
  if (!priced.ok) return priced;

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .insert({
      room_id: input.roomId,
      room_type_id: priced.data!.type.id,
      status: "reserved",
      check_in: input.checkIn,
      check_out: input.checkOut,
      guests: input.guests,
      guest_name: input.guestName.trim(),
      guest_phone: input.guestPhone.trim(),
      guest_id_number: clean(input.guestIdNumber),
      nationality: clean(input.nationality),
      total_amount: priced.data!.total,
      notes: clean(input.notes),
      source: g.data!.label.startsWith("admin:") ? "admin" : "front_desk",
      created_by: g.data!.label,
    })
    .select("id, code")
    .single();

  if (error) return { ok: false, error: dbError(error.message, error.code) };

  // Money taken at booking time → retainer payment (booking stands even if this fails)
  let warning: string | undefined;
  if (input.payNow && input.payNow.amount > 0) {
    const pay = await addPayment({ bookingId: data.id, kind: "retainer", ...input.payNow });
    if (!pay.ok) warning = `Booking saved, but the payment was not recorded: ${pay.error}`;
  }
  refresh();
  return { ok: true, data: { ...(data as { id: string; code: string }), warning } };
}

/** Edit / move a booking (dates, room, guests, guest details). Re-prices the stay. */
export async function updateBooking(id: string, input: BookingInput): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;
  if (!input.guestName.trim() || !input.guestPhone.trim()) return { ok: false, error: "Guest name and phone are required." };

  const sb = getSupabaseAdmin();
  const { data: current } = await sb.from("bookings").select("status").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "Booking not found." };
  if (!["requested", "reserved", "checked_in"].includes(current.status)) return { ok: false, error: "This booking is closed." };

  const priced = await priceStay(input.roomId, input.checkIn, input.checkOut, input.guests);
  if (!priced.ok) return priced;

  const { error } = await sb
    .from("bookings")
    .update({
      room_id: input.roomId,
      room_type_id: priced.data!.type.id,
      status: current.status === "requested" ? "reserved" : current.status,
      check_in: input.checkIn,
      check_out: input.checkOut,
      guests: input.guests,
      guest_name: input.guestName.trim(),
      guest_phone: input.guestPhone.trim(),
      guest_id_number: clean(input.guestIdNumber),
      nationality: clean(input.nationality),
      total_amount: priced.data!.total,
      notes: clean(input.notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error.message, error.code) };
  refresh();
  return { ok: true };
}

/** Check in: ID number required, nationality and ID photo optional. */
export async function checkInBooking(formData: FormData): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;

  const id = String(formData.get("id") ?? "");
  const idNumber = String(formData.get("idNumber") ?? "").trim();
  const nationality = String(formData.get("nationality") ?? "").trim();
  const photo = formData.get("photo");
  const sb = getSupabaseAdmin();
  // ID is required for room guests; optional for halls / events
  const { data: bk } = await sb.from("bookings").select("room_types(kind)").eq("id", id).maybeSingle();
  const isHall = (bk?.room_types as unknown as { kind: string } | null)?.kind === "hall";
  if (!idNumber && !isHall) return { ok: false, error: "Guest ID / passport number is required." };

  const update: Record<string, unknown> = {
    status: "checked_in",
    guest_id_number: idNumber || null,
    checked_in_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (nationality) update.nationality = nationality;

  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return { ok: false, error: "ID photo must be an image." };
    const path = `${id}/${Date.now()}.${photo.type.split("/")[1] || "jpg"}`;
    const { error: upErr } = await sb.storage.from(ID_BUCKET).upload(path, photo, { contentType: photo.type, upsert: false });
    if (upErr) return { ok: false, error: `ID photo upload failed: ${upErr.message}` };
    update.guest_id_photo = path;
  }

  const { error } = await sb.from("bookings").update(update).eq("id", id).eq("status", "reserved");
  if (error) return { ok: false, error: dbError(error.message, error.code) };
  refresh();
  return { ok: true };
}

/**
 * Check out and mark the room for cleaning.
 * With money still owed, an admin must have approved credit first.
 */
export async function checkOutBooking(id: string): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;
  const sb = getSupabaseAdmin();

  const [{ data: bal, error: balErr }, { data: b }, features] = await Promise.all([
    sb.from("booking_balances").select("balance").eq("booking_id", id).maybeSingle(),
    sb.from("bookings").select("code, guest_name, guest_phone, credit_approved_by, credit_approved_at").eq("id", id).maybeSingle(),
    getFeatures(),
  ]);
  if (balErr) return { ok: false, error: "Bill tables missing — run database/folio.sql in Supabase." };
  const balance = Number(bal?.balance ?? 0);
  const onCredit = balance > 0.009;
  if (onCredit) {
    if (!features.credit) return { ok: false, error: `Balance ${balance.toLocaleString()} ETB is still due. Take payment first.` };
    if (!b?.credit_approved_at) {
      return { ok: false, error: `Balance ${balance.toLocaleString()} ETB is still due. Take payment, or ask an admin to approve credit.` };
    }
  }

  const { data, error } = await sb
    .from("bookings")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "checked_in")
    .select("room_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only checked-in guests can check out." };
  if (data.room_id) await sb.from("rooms").update({ housekeeping: "dirty" }).eq("id", data.room_id);
  if (onCredit && b) {
    await notifyStaff(
      `📒 *Checked out on credit* ${b.code}\n${b.guest_name} · ${b.guest_phone}\n` +
        `Owes *${balance.toLocaleString()} ETB* (approved by ${b.credit_approved_by})`
    );
  }
  refresh();
  revalidatePath("/[locale]/admin/balances", "page");
  return { ok: true };
}

export async function cancelBooking(id: string, noShow = false): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .update({ status: noShow ? "no_show" : "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["requested", "reserved"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only open bookings can be cancelled." };
  refresh();
  return { ok: true };
}

export async function setHousekeeping(roomId: string, status: Housekeeping): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;
  if (!["clean", "dirty", "out_of_service"].includes(status)) return { ok: false, error: "Unknown status." };
  const { error } = await getSupabaseAdmin().from("rooms").update({ housekeeping: status }).eq("id", roomId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Short-lived link to view a guest's ID photo. */
export async function getIdPhotoUrl(id: string): Promise<Result<string>> {
  const g = await guard();
  if (!g.ok) return g;
  const sb = getSupabaseAdmin();
  const { data: b } = await sb.from("bookings").select("guest_id_photo").eq("id", id).maybeSingle();
  if (!b?.guest_id_photo) return { ok: false, error: "No ID photo." };
  const { data, error } = await sb.storage.from(ID_BUCKET).createSignedUrl(b.guest_id_photo, 300);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not open photo." };
  return { ok: true, data: data.signedUrl };
}

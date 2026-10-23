"use server";

// Room setup (admin only): room types, rooms/halls, seasonal prices.
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";
import { isIsoDate, type Housekeeping, type Pricing, type RoomKind } from "@/lib/booking";
import type { ServiceUnit } from "@/lib/folio";

type Result = { ok: true } | { ok: false; error: string };

export interface RoomTypeInput {
  id?: string;
  name: string;
  name_am: string;
  kind: RoomKind;
  pricing: Pricing;
  base_price: number;
  weekend_price: number | null;
  deposit_amount: number | null;
  bed_width_m: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  description: string;
  description_am: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface RoomInput {
  id?: string;
  number: string;
  room_type_id: string;
  beds: number;
  housekeeping: Housekeeping;
  notes: string;
  is_active: boolean;
}

const UNAUTH: Result = { ok: false, error: "Unauthorized. Admin access required." };
const blank = (s: string) => s.trim() || null;
const optNum = (n: number | null) => (n === null || Number.isNaN(n) ? null : n);

function refresh() {
  revalidatePath("/[locale]/admin/rooms", "page");
  revalidatePath("/[locale]/admin/bookings", "page");
  revalidatePath("/[locale]/kiosk/rooms", "page");
  revalidatePath("/[locale]/rooms", "page");
}

export async function saveRoomType(input: RoomTypeInput): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!(input.base_price >= 0)) return { ok: false, error: "Price must be 0 or more." };

  const row = {
    name: input.name.trim(),
    name_am: blank(input.name_am),
    kind: input.kind === "hall" ? "hall" : "room",
    pricing: input.pricing === "per_guest" ? "per_guest" : "per_room",
    base_price: input.base_price,
    weekend_price: optNum(input.weekend_price),
    deposit_amount: optNum(input.deposit_amount),
    bed_width_m: optNum(input.bed_width_m),
    capacity_min: optNum(input.capacity_min),
    capacity_max: optNum(input.capacity_max),
    description: blank(input.description),
    description_am: blank(input.description_am),
    image_url: blank(input.image_url),
    sort_order: Math.floor(input.sort_order) || 0,
    is_active: input.is_active,
    updated_at: new Date().toISOString(),
  };
  const sb = getSupabaseAdmin();
  const { error } = input.id
    ? await sb.from("room_types").update(row).eq("id", input.id)
    : await sb.from("room_types").insert(row);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function saveRoom(input: RoomInput): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  if (!input.number.trim()) return { ok: false, error: "Room number is required." };
  if (!input.room_type_id) return { ok: false, error: "Pick a room type." };
  if (!Number.isInteger(input.beds) || input.beds < 1) return { ok: false, error: "Beds must be at least 1." };

  const row = {
    number: input.number.trim(),
    room_type_id: input.room_type_id,
    beds: input.beds,
    housekeeping: input.housekeeping,
    notes: blank(input.notes),
    is_active: input.is_active,
  };
  const sb = getSupabaseAdmin();
  const { error } = input.id
    ? await sb.from("rooms").update(row).eq("id", input.id)
    : await sb.from("rooms").insert(row);
  if (error) {
    return { ok: false, error: /rooms_number_key|duplicate/.test(error.message) ? `Room ${row.number} already exists.` : error.message };
  }
  refresh();
  return { ok: true };
}

/** Delete a room with no booking history; otherwise ask to deactivate instead. */
export async function deleteRoom(id: string): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  const { error } = await getSupabaseAdmin().from("rooms").delete().eq("id", id);
  if (error) {
    return { ok: false, error: /foreign key|violates/.test(error.message) ? "This room has bookings — switch it to inactive instead." : error.message };
  }
  refresh();
  return { ok: true };
}

export async function addRate(input: { room_type_id: string; label: string; starts_on: string; ends_on: string; price: number }): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  if (!isIsoDate(input.starts_on) || !isIsoDate(input.ends_on) || input.ends_on < input.starts_on) {
    return { ok: false, error: "Pick a valid date range." };
  }
  if (!(input.price >= 0)) return { ok: false, error: "Price must be 0 or more." };
  const { error } = await getSupabaseAdmin().from("room_rates").insert({
    room_type_id: input.room_type_id,
    label: blank(input.label),
    starts_on: input.starts_on,
    ends_on: input.ends_on,
    price: input.price,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export interface ServiceInput {
  id?: string;
  name: string;
  name_am: string;
  unit: ServiceUnit;
  price: number;
  sort_order: number;
  is_active: boolean;
}

/** Event packages / per-plate meals. Prices are defaults; staff can change them per bill line. */
export async function saveService(input: ServiceInput): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!(input.price >= 0)) return { ok: false, error: "Price must be 0 or more." };
  if (!["each", "plate", "person", "day", "hour"].includes(input.unit)) return { ok: false, error: "Pick a unit." };
  const row = {
    name: input.name.trim(),
    name_am: blank(input.name_am),
    unit: input.unit,
    price: input.price,
    sort_order: Math.floor(input.sort_order) || 0,
    is_active: input.is_active,
  };
  const sb = getSupabaseAdmin();
  const { error } = input.id
    ? await sb.from("services").update(row).eq("id", input.id)
    : await sb.from("services").insert(row);
  if (error) return { ok: false, error: /services/.test(error.message) && /exist|schema/.test(error.message) ? "Run database/folio.sql in Supabase first." : error.message };
  refresh();
  return { ok: true };
}

export async function deleteService(id: string): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  const { error } = await getSupabaseAdmin().from("services").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteRate(id: string): Promise<Result> {
  if (!(await getAdminActor())) return UNAUTH;
  const { error } = await getSupabaseAdmin().from("room_rates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

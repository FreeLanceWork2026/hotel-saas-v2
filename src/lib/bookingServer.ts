// SERVER-SIDE ONLY — hotel data loading + who is allowed to run the front desk.
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";
import { getKioskAccess } from "@/lib/kioskOperator";
import { getFeatures } from "@/lib/featuresServer";
import { parsePercent } from "@/lib/folio";
import { getSiteSettings } from "@/app/[locale]/admin/settings/actions";
import {
  BLOCKING, compareRoomNumbers,
  type Booking, type Room, type RoomRate, type RoomType,
} from "@/lib/booking";

export interface StaffActor {
  label: string;
  isAdmin: boolean;
}

/** Admin (web login) or a signed-in kiosk operator (PIN / staff account). */
export async function getStaffActor(): Promise<StaffActor | null> {
  const admin = await getAdminActor();
  if (admin) return { label: admin.label, isAdmin: true };
  const { operator } = await getKioskAccess();
  if (!operator) return null;
  return {
    label: `kiosk:${operator.first_name} ${operator.last_name}`.trim(),
    isAdmin: operator.isAdmin,
  };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function mapType(r: Record<string, unknown>): RoomType {
  return {
    ...(r as unknown as RoomType),
    base_price: Number(r.base_price),
    weekend_price: num(r.weekend_price),
    deposit_amount: num(r.deposit_amount),
    bed_width_m: num(r.bed_width_m),
  };
}

export interface HotelSetup {
  types: RoomType[];
  rates: RoomRate[];
  rooms: Room[];
  /** false when database/hotel.sql has not been run yet */
  ready: boolean;
}

export async function loadHotelSetup(opts: { activeOnly?: boolean } = {}): Promise<HotelSetup> {
  const sb = getSupabaseAdmin();
  const [t, r, rm] = await Promise.all([
    sb.from("room_types").select("*").order("sort_order").order("name"),
    sb.from("room_rates").select("*").order("starts_on"),
    sb.from("rooms").select("*"),
  ]);
  if (t.error || rm.error) return { types: [], rates: [], rooms: [], ready: false };

  let types = (t.data ?? []).map(mapType);
  let rooms = (rm.data ?? []) as Room[];
  if (opts.activeOnly) {
    types = types.filter((x) => x.is_active);
    const ids = new Set(types.map((x) => x.id));
    rooms = rooms.filter((x) => x.is_active && ids.has(x.room_type_id));
  }
  rooms.sort((a, b) => compareRoomNumbers(a.number, b.number));
  const rates = ((r.data ?? []) as RoomRate[]).map((x) => ({ ...x, price: Number(x.price) }));
  return { types, rates, rooms, ready: true };
}

function mapBooking(b: Record<string, unknown>): Booking {
  return {
    ...(b as unknown as Booking),
    total_amount: Number(b.total_amount ?? 0),
    deposit_amount: Number(b.deposit_amount ?? 0),
  };
}

/** Blocking bookings overlapping [from, to). */
export async function loadBlockingBookings(from: string, to: string): Promise<Booking[]> {
  const { data } = await getSupabaseAdmin()
    .from("bookings")
    .select("*")
    .in("status", BLOCKING)
    .lt("check_in", to)
    .gt("check_out", from);
  return (data ?? []).map(mapBooking);
}

/** Everything the board shows: any status overlapping the window, plus open requests. */
export async function loadBoardBookings(from: string, to: string): Promise<{ bookings: Booking[]; requests: Booking[] }> {
  const sb = getSupabaseAdmin();
  const [win, req] = await Promise.all([
    sb.from("bookings").select("*").not("room_id", "is", null).lt("check_in", to).gt("check_out", from)
      .in("status", ["reserved", "checked_in", "checked_out", "no_show"]),
    sb.from("bookings").select("*").eq("status", "requested").order("check_in"),
  ]);
  const bookings = (win.data ?? []).map(mapBooking);
  // Paid / balance per booking (view from folio.sql; skipped if not installed yet)
  if (bookings.length > 0) {
    const { data: bal } = await sb
      .from("booking_balances")
      .select("booking_id, paid, balance")
      .in("booking_id", bookings.map((b) => b.id));
    const byId = new Map((bal ?? []).map((x) => [String(x.booking_id), x]));
    for (const b of bookings) {
      const x = byId.get(b.id);
      if (x) { b.paid = Number(x.paid); b.balance = Number(x.balance); }
    }
  }
  return { bookings, requests: (req.data ?? []).map(mapBooking) };
}

/** Retainer % when the platform switch is ON and the admin set one, else 0. */
export async function getRetainerPercent(): Promise<number> {
  const [features, settings] = await Promise.all([getFeatures(), getSiteSettings()]);
  return features.retainer ? parsePercent(settings.retainer_percent) : 0;
}

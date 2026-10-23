// Booking rules — pricing, overlap and room suggestions.
// Pure module (no Next/Supabase imports) so server, client and tests share it.
//
// Dates are "YYYY-MM-DD" strings. check_out is exclusive: for rooms each date in
// [check_in, check_out) is a night, for halls each date is a day.

export type RoomKind = "room" | "hall";
export type Pricing = "per_room" | "per_guest";
export type Housekeeping = "clean" | "dirty" | "out_of_service";
export type BookingStatus = "requested" | "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";

export interface RoomType {
  id: string;
  name: string;
  name_am: string | null;
  kind: RoomKind;
  pricing: Pricing;
  base_price: number;
  weekend_price: number | null;
  deposit_amount: number | null;
  bed_width_m: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  description: string | null;
  description_am: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface RoomRate {
  id: string;
  room_type_id: string;
  label: string | null;
  starts_on: string;
  ends_on: string; // inclusive
  price: number;
}

export interface Room {
  id: string;
  number: string;
  room_type_id: string;
  beds: number;
  housekeeping: Housekeeping;
  notes: string | null;
  is_active: boolean;
}

export interface Booking {
  id: string;
  code: string;
  room_id: string | null;
  room_type_id: string | null;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  guests: number;
  guest_name: string;
  guest_phone: string;
  guest_id_number: string | null;
  guest_id_photo: string | null;
  nationality: string | null;
  total_amount: number;
  deposit_amount: number;
  deposit_method: string | null;
  deposit_reference: string | null;
  notes: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  /** From the booking_balances view (board only; absent before folio.sql) */
  paid?: number;
  balance?: number;
}

/** Statuses that occupy a room (mirrors the DB exclusion constraint). */
export const BLOCKING: BookingStatus[] = ["reserved", "checked_in"];

/** Fri & Sat nights use the weekend price when one is set. */
export const WEEKEND_DAYS = [5, 6];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Today's date at the hotel (Addis Ababa), independent of server/browser timezone. */
export function hotelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(now);
}

/** Each night (room) or day (hall) covered by [checkIn, checkOut). */
export function stayDates(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

/** Price of one night/day: seasonal rate → weekend price → base price. Later-starting rates win. */
export function priceForDate(type: Pick<RoomType, "base_price" | "weekend_price">, rates: RoomRate[], date: string): number {
  const rate = rates
    .filter((r) => r.starts_on <= date && date <= r.ends_on)
    .sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1))[0];
  if (rate) return Number(rate.price);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (type.weekend_price !== null && WEEKEND_DAYS.includes(dow)) return Number(type.weekend_price);
  return Number(type.base_price);
}

export interface Quote {
  units: number;        // nights or days
  perUnit: { date: string; price: number }[];
  multiplier: number;   // guests for per_guest pricing, else 1
  total: number;
}

export function quoteStay(
  type: Pick<RoomType, "pricing" | "base_price" | "weekend_price">,
  rates: RoomRate[],
  checkIn: string,
  checkOut: string,
  guests: number
): Quote {
  const perUnit = stayDates(checkIn, checkOut).map((date) => ({ date, price: priceForDate(type, rates, date) }));
  const multiplier = type.pricing === "per_guest" ? Math.max(1, Math.floor(guests)) : 1;
  const total = perUnit.reduce((s, n) => s + n.price, 0) * multiplier;
  return { units: perUnit.length, perUnit, multiplier, total: Math.round(total * 100) / 100 };
}

/** Max people a room accepts: beds for rooms, capacity_max for halls (unlimited if unset). */
export function roomCapacity(room: Pick<Room, "beds">, type: Pick<RoomType, "kind" | "capacity_max">): number {
  return type.kind === "hall" ? type.capacity_max ?? Infinity : room.beds;
}

/** Rooms free for the whole range (active, not out of service, no blocking booking). */
export function availableRooms(
  rooms: Room[],
  bookings: Pick<Booking, "id" | "room_id" | "status" | "check_in" | "check_out">[],
  checkIn: string,
  checkOut: string,
  ignoreBookingId?: string
): Room[] {
  const busy = new Set(
    bookings
      .filter((b) => b.room_id && b.id !== ignoreBookingId && BLOCKING.includes(b.status))
      .filter((b) => rangesOverlap(b.check_in, b.check_out, checkIn, checkOut))
      .map((b) => b.room_id as string)
  );
  return rooms.filter((r) => r.is_active && r.housekeeping !== "out_of_service" && !busy.has(r.id));
}

/**
 * Best-fit suggestion: the smallest room that fits the party comes first, so big
 * multi-bed rooms stay free for groups (group priority).
 */
export function suggestRooms(available: Room[], types: Map<string, RoomType>, guests: number): Room[] {
  return available
    .filter((r) => {
      const t = types.get(r.room_type_id);
      return !!t && roomCapacity(r, t) >= guests;
    })
    .sort((a, b) => a.beds - b.beds || compareRoomNumbers(a.number, b.number));
}

/** Natural order: "2" < "10" < "Hall A". */
export function compareRoomNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** "400 ETB / guest / night", "800 ETB / night", "2,000 ETB / day" */
export function priceUnitLabel(type: Pick<RoomType, "kind" | "pricing">): string {
  const per = type.kind === "hall" ? "day" : "night";
  return type.pricing === "per_guest" ? `guest / ${per}` : per;
}

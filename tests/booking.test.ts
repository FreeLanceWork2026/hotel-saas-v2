import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, availableRooms, isIsoDate, quoteStay, rangesOverlap, stayDates, suggestRooms,
  type Room, type RoomRate, type RoomType,
} from "../src/lib/booking.ts";

const type = (over: Partial<RoomType>): RoomType => ({
  id: "t", name: "T", name_am: null, kind: "room", pricing: "per_room", base_price: 800,
  weekend_price: null, deposit_amount: null, bed_width_m: null, capacity_min: null, capacity_max: null,
  description: null, description_am: null, image_url: null, sort_order: 0, is_active: true, ...over,
});
const room = (id: string, beds: number, over: Partial<Room> = {}): Room => ({
  id, number: id, room_type_id: "t", beds, housekeeping: "clean", notes: null, is_active: true, ...over,
});

test("dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(stayDates("2026-10-01", "2026-10-03"), ["2026-10-01", "2026-10-02"]);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-02-28"), true);
});

test("overlap: checkout day is free for the next check-in", () => {
  assert.equal(rangesOverlap("2026-10-01", "2026-10-03", "2026-10-03", "2026-10-05"), false);
  assert.equal(rangesOverlap("2026-10-01", "2026-10-03", "2026-10-02", "2026-10-04"), true);
  assert.equal(rangesOverlap("2026-10-02", "2026-10-03", "2026-10-01", "2026-10-05"), true);
});

test("per-room price is flat; per-guest multiplies (2 guests in a twin = 2 × 500)", () => {
  assert.equal(quoteStay(type({ base_price: 800 }), [], "2026-10-05", "2026-10-07", 1).total, 1600);
  const twin = type({ pricing: "per_guest", base_price: 500 });
  assert.equal(quoteStay(twin, [], "2026-10-05", "2026-10-06", 1).total, 500);
  assert.equal(quoteStay(twin, [], "2026-10-05", "2026-10-06", 2).total, 1000);
});

test("weekend and seasonal prices", () => {
  // 2026-10-09 is a Friday, 2026-10-11 a Sunday
  const t = type({ base_price: 800, weekend_price: 1000 });
  assert.equal(quoteStay(t, [], "2026-10-09", "2026-10-12", 1).total, 1000 + 1000 + 800);
  const rates: RoomRate[] = [
    { id: "r1", room_type_id: "t", label: "Holiday", starts_on: "2026-10-10", ends_on: "2026-10-10", price: 1500 },
  ];
  assert.equal(quoteStay(t, rates, "2026-10-09", "2026-10-12", 1).total, 1000 + 1500 + 800);
});

test("availability ignores cancelled bookings and out-of-service rooms", () => {
  const rooms = [room("a", 1), room("b", 1), room("c", 1, { housekeeping: "out_of_service" })];
  const bookings = [
    { id: "1", room_id: "a", status: "reserved" as const, check_in: "2026-10-01", check_out: "2026-10-04" },
    { id: "2", room_id: "b", status: "cancelled" as const, check_in: "2026-10-01", check_out: "2026-10-04" },
  ];
  const free = availableRooms(rooms, bookings, "2026-10-02", "2026-10-03").map((r) => r.id);
  assert.deepEqual(free, ["b"]);
  // Editing booking 1 itself must not count as a clash
  assert.deepEqual(availableRooms(rooms, bookings, "2026-10-02", "2026-10-03", "1").map((r) => r.id), ["a", "b"]);
});

test("suggestions: smallest room that fits first (groups keep big rooms)", () => {
  const types = new Map([["t", type({})]]);
  const rooms = [room("8bed", 8), room("2bed", 2), room("4bed", 4)];
  assert.deepEqual(suggestRooms(rooms, types, 1).map((r) => r.id), ["2bed", "4bed", "8bed"]);
  assert.deepEqual(suggestRooms(rooms, types, 5).map((r) => r.id), ["8bed"]);
});

test("halls fit by capacity, not beds", () => {
  const types = new Map([["h", type({ id: "h", kind: "hall", capacity_max: 50 })]]);
  const hall = room("hall", 1, { room_type_id: "h" });
  assert.equal(suggestRooms([hall], types, 45).length, 1);
  assert.equal(suggestRooms([hall], types, 60).length, 0);
});

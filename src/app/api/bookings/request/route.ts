import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyStaff } from "@/lib/telegram";
import { loadBlockingBookings, loadHotelSetup } from "@/lib/bookingServer";
import { availableRooms, hotelToday, isIsoDate, quoteStay, suggestRooms } from "@/lib/booking";

/**
 * POST /api/bookings/request — guest asks for a room from the website.
 * Gated in proxy.ts by both "booking" and "guest_self_booking".
 * Creates a `requested` booking with no room; staff assign one on the board.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Honeypot filled → pretend success, store nothing
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const roomTypeId = String(body.roomTypeId ?? "");
  const checkIn = String(body.checkIn ?? "");
  const checkOut = String(body.checkOut ?? "");
  const guests = Math.floor(Number(body.guests));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const phone = String(body.phone ?? "").trim().slice(0, 20);

  if (!name || !/^[+\d][\d\s-]{6,19}$/.test(phone)) {
    return NextResponse.json({ error: "Name and a valid phone number are required." }, { status: 400 });
  }
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn || checkIn < hotelToday()) {
    return NextResponse.json({ error: "Invalid dates." }, { status: 400 });
  }
  if (!Number.isInteger(guests) || guests < 1 || guests > 300) {
    return NextResponse.json({ error: "Invalid number of guests." }, { status: 400 });
  }

  const setup = await loadHotelSetup({ activeOnly: true });
  const type = setup.types.find((t) => t.id === roomTypeId);
  if (!type) return NextResponse.json({ error: "Room type not found." }, { status: 404 });

  const bookings = await loadBlockingBookings(checkIn, checkOut);
  const free = suggestRooms(
    availableRooms(setup.rooms.filter((r) => r.room_type_id === type.id), bookings, checkIn, checkOut),
    new Map([[type.id, type]]),
    guests
  );
  if (free.length === 0) return NextResponse.json({ error: "No longer available for those dates." }, { status: 409 });

  const total = quoteStay(type, setup.rates.filter((r) => r.room_type_id === type.id), checkIn, checkOut, guests).total;
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .insert({
      room_id: null,
      room_type_id: type.id,
      status: "requested",
      check_in: checkIn,
      check_out: checkOut,
      guests,
      guest_name: name,
      guest_phone: phone,
      total_amount: total,
      source: "website",
      created_by: "website",
    })
    .select("code")
    .single();

  if (error) {
    console.error("[bookings/request]", error.message);
    return NextResponse.json({ error: "Could not save the request." }, { status: 500 });
  }

  await notifyStaff(
    `🛎️ *New booking request* ${data.code}\n${type.name} · ${guests} guest${guests > 1 ? "s" : ""}\n` +
      `${checkIn} → ${checkOut}\n${name} · ${phone}\nTotal: ${total.toLocaleString()} ETB\n\nAssign a room on the bookings board.`
  );
  return NextResponse.json({ ok: true, code: data.code });
}

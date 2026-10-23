import type { Metadata } from "next";
import shared from "../admin.shared.module.css";
import BookingBoard from "@/components/hotel/BookingBoard";
import { getRetainerPercent, loadBoardBookings, loadHotelSetup } from "@/lib/bookingServer";
import { addDays, hotelToday, isIsoDate } from "@/lib/booking";

export const metadata: Metadata = { title: "Bookings — Admin" };
export const dynamic = "force-dynamic";

const DAYS = 14;

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start: rawStart } = await searchParams;
  const today = hotelToday();
  const start = rawStart && isIsoDate(rawStart) ? rawStart : addDays(today, -1);

  const [setup, { bookings, requests }, retainerPercent] = await Promise.all([
    loadHotelSetup({ activeOnly: true }),
    loadBoardBookings(start, addDays(start, DAYS)),
    getRetainerPercent(),
  ]);

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Bookings</h1>
          <p className={shared.pageSubtitle}>Live availability. Click an empty cell to book, a bar to check in / out.</p>
        </div>
      </div>
      <BookingBoard
        {...setup}
        bookings={bookings}
        requests={requests}
        start={start}
        days={DAYS}
        today={today}
        retainerPercent={retainerPercent}
        basePath="/admin/bookings"
      />
    </div>
  );
}

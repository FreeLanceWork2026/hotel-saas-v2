import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import adminLayout from "../../admin/AdminLayout.module.css";
import BookingBoard from "@/components/hotel/BookingBoard";
import { getRetainerPercent, getStaffActor, loadBoardBookings, loadHotelSetup } from "@/lib/bookingServer";
import { addDays, hotelToday, isIsoDate } from "@/lib/booking";

export const metadata: Metadata = { title: "Front Desk — Rooms" };
export const dynamic = "force-dynamic";

const DAYS = 10;

export default async function KioskRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const [{ locale }, { start: rawStart }] = await Promise.all([params, searchParams]);
  const actor = await getStaffActor();
  if (!actor) redirect(`/${locale}/kiosk`);

  const today = hotelToday();
  const start = rawStart && isIsoDate(rawStart) ? rawStart : addDays(today, -1);
  const [setup, { bookings, requests }, retainerPercent] = await Promise.all([
    loadHotelSetup({ activeOnly: true }),
    loadBoardBookings(start, addDays(start, DAYS)),
    getRetainerPercent(),
  ]);

  return (
    <div className={adminLayout.adminContainer}>
      <main style={{ flex: 1, minWidth: 0, padding: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <Link href="/kiosk" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--a-gold)", fontWeight: 600 }}>
            <ArrowLeft size={16} /> POS
          </Link>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Front desk · Rooms</h1>
          <span style={{ marginLeft: "auto", color: "var(--a-muted)", fontSize: "0.85rem" }}>{actor.label.replace(/^\w+:/, "")}</span>
        </div>
        <BookingBoard
          {...setup}
          bookings={bookings}
          requests={requests}
          start={start}
          days={DAYS}
          today={today}
          retainerPercent={retainerPercent}
          basePath="/kiosk/rooms"
        />
      </main>
    </div>
  );
}

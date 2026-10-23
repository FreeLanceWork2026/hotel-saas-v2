import type { Metadata } from "next";
import shared from "../admin.shared.module.css";
import RoomsClient from "./RoomsClient";
import { loadHotelSetup } from "@/lib/bookingServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getFeatures } from "@/lib/featuresServer";
import type { Service } from "@/lib/folio";

export const metadata: Metadata = { title: "Rooms — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
  const [setup, features, svc] = await Promise.all([
    loadHotelSetup(),
    getFeatures(),
    getSupabaseAdmin().from("services").select("*").order("sort_order").order("name"),
  ]);
  // null = folio.sql not run yet (section shows a hint)
  const services = svc.error ? null : ((svc.data ?? []) as Service[]).map((x) => ({ ...x, price: Number(x.price) }));
  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Rooms, halls &amp; services</h1>
          <p className={shared.pageSubtitle}>Room types, prices, rooms and housekeeping. Changes apply to new bookings.</p>
        </div>
      </div>
      {setup.ready ? (
        <RoomsClient types={setup.types} rates={setup.rates} rooms={setup.rooms} services={features.events ? services : undefined} />
      ) : (
        <div className={shared.feedbackError}>
          Hotel tables are missing. Run <code>database/hotel.sql</code> in the Supabase SQL Editor.
        </div>
      )}
    </div>
  );
}

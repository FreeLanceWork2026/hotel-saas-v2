import type { Metadata } from "next";
import shared from "../admin.shared.module.css";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import BalancesClient, { type BalanceRow } from "./BalancesClient";

export const metadata: Metadata = { title: "Outstanding balances — Admin" };
export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const sb = getSupabaseAdmin();
  const { data: bal, error } = await sb.from("booking_balances").select("booking_id, total_due, paid, balance").gt("balance", 0.009);

  let rows: BalanceRow[] = [];
  if (!error && bal && bal.length > 0) {
    const { data: bookings } = await sb
      .from("bookings")
      .select("id, code, guest_name, guest_phone, status, check_in, check_out, credit_approved_by, credit_note, rooms(number)")
      .in("id", bal.map((b) => b.booking_id))
      .in("status", ["checked_in", "checked_out"]);
    const byId = new Map(bal.map((b) => [String(b.booking_id), b]));
    rows = (bookings ?? [])
      .map((b) => {
        const x = byId.get(String(b.id))!;
        return {
          id: String(b.id),
          code: String(b.code),
          guest: String(b.guest_name),
          phone: String(b.guest_phone),
          room: String((b.rooms as unknown as { number: string } | null)?.number ?? "—"),
          status: b.status as BalanceRow["status"],
          checkOut: String(b.check_out),
          approvedBy: b.credit_approved_by ? String(b.credit_approved_by).replace(/^\w+:/, "") : null,
          note: b.credit_note ? String(b.credit_note) : null,
          totalDue: Number(x.total_due),
          paid: Number(x.paid),
          balance: Number(x.balance),
        };
      })
      .sort((a, b) => (a.status === b.status ? a.checkOut.localeCompare(b.checkOut) : a.status === "checked_out" ? -1 : 1));
  }

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Outstanding balances</h1>
          <p className={shared.pageSubtitle}>Guests who left on credit, and in-house guests with money still due.</p>
        </div>
      </div>
      {error ? (
        <div className={shared.feedbackError}>Bill tables missing — run <code>database/folio.sql</code> in Supabase.</div>
      ) : (
        <BalancesClient rows={rows} />
      )}
    </div>
  );
}

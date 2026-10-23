import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStaffActor } from "@/lib/bookingServer";
import { getFolio } from "@/app/[locale]/admin/bookings/folioActions";
import { getSiteSettings } from "@/app/[locale]/admin/settings/actions";
import { METHOD_LABEL } from "@/lib/folio";
import { addDays, daysBetween } from "@/lib/booking";
import PrintButton from "./PrintButton";
import styles from "./Bill.module.css";

export const metadata: Metadata = { title: "Guest bill", robots: { index: false } };
export const dynamic = "force-dynamic";

const birr = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Printable guest bill (staff only). */
export default async function BillPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await getStaffActor())) redirect(`/${locale}/kiosk`);

  const [res, settings] = await Promise.all([getFolio(id), getSiteSettings()]);
  if (!res.ok || !res.data) notFound();
  const f = res.data;
  const b = f.booking;
  const units = daysBetween(b.check_in, b.check_out);
  const lastDay = f.isHall ? addDays(b.check_out, -1) : b.check_out;

  return (
    <div className={styles.page}>
      <div className={styles.noPrint}><PrintButton /></div>

      <header className={styles.head}>
        <div>
          <h1>{settings.brand_name}</h1>
          <div>{settings.address}</div>
          <div>{settings.phone}</div>
        </div>
        <div className={styles.meta}>
          <strong>BILL</strong>
          <div>{b.code}</div>
          <div>{new Date().toLocaleDateString("en-GB")}</div>
        </div>
      </header>

      <section className={styles.guest}>
        <div><span>Guest</span>{b.guest_name}</div>
        <div><span>Phone</span>{b.guest_phone}</div>
        <div><span>{f.isHall ? "Hall" : "Room"}</span>{f.roomNumber} · {f.typeName}</div>
        <div><span>{f.isHall ? "Days" : "Stay"}</span>{b.check_in} → {lastDay} ({units} {f.isHall ? "day" : "night"}{units > 1 ? "s" : ""})</div>
      </section>

      <table className={styles.table}>
        <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>{f.typeName} {f.roomNumber}{!f.isHall && b.guests > 1 ? ` (${b.guests} guests)` : ""}</td>
            <td>{units}</td>
            <td />
            <td>{birr(f.totals.roomTotal)}</td>
          </tr>
          {f.charges.filter((c) => !c.voided_at).map((c) => (
            <tr key={c.id}>
              <td>{c.description}</td>
              <td>{c.quantity}</td>
              <td>{birr(c.unit_price)}</td>
              <td>{birr(c.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>Total (ETB)</td><td>{birr(f.totals.totalDue)}</td></tr>
          {f.payments.filter((p) => !p.voided_at).map((p) => (
            <tr key={p.id} className={styles.payRow}>
              <td colSpan={3}>
                Paid · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""} · {new Date(p.created_at).toLocaleDateString("en-GB")}
              </td>
              <td>− {birr(p.amount)}</td>
            </tr>
          ))}
          <tr className={styles.balance}>
            <td colSpan={3}>{f.totals.balance > 0 ? "Balance due" : "Paid in full"}</td>
            <td>{birr(Math.max(0, f.totals.balance))}</td>
          </tr>
        </tfoot>
      </table>

      {b.credit_approved_at && f.totals.balance > 0 && (
        <p className={styles.note}>Credit approved{b.credit_note ? ` — ${b.credit_note}` : ""}.</p>
      )}
      <footer className={styles.foot}>Thank you for staying with {settings.brand_name}.</footer>
    </div>
  );
}

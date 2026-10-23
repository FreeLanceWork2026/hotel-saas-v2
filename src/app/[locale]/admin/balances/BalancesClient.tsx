"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Receipt } from "lucide-react";
import shared from "../admin.shared.module.css";
import { Drawer } from "@/components/hotel/BookingBoard";
import FolioPanel from "@/components/hotel/FolioPanel";

export interface BalanceRow {
  id: string;
  code: string;
  guest: string;
  phone: string;
  room: string;
  status: "checked_in" | "checked_out";
  checkOut: string;
  approvedBy: string | null;
  note: string | null;
  totalDue: number;
  paid: number;
  balance: number;
}

const birr = (n: number) => `${n.toLocaleString()} ETB`;

export default function BalancesClient({ rows }: { rows: BalanceRow[] }) {
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState<BalanceRow | null>(null);
  const credit = rows.filter((r) => r.status === "checked_out");
  const owed = credit.reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <div className={shared.card} style={{ marginBottom: "1rem" }}>
        <div className={shared.cardBody}>
          <strong>{birr(owed)}</strong> owed by {credit.length} guest{credit.length === 1 ? "" : "s"} who already left
          {rows.length > credit.length && <> · {rows.length - credit.length} in-house guest(s) with a balance</>}
        </div>
      </div>

      <div className={shared.tableWrapper}>
        <table className={shared.table}>
          <thead>
            <tr><th>Guest</th><th>Room</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th>Credit approved</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className={shared.cellEmptyRow}>Nobody owes anything. 🎉</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={shared.cellName}>
                  {r.guest}
                  <div style={{ fontSize: "0.75rem", opacity: 0.7 }}><a href={`tel:${r.phone}`}>{r.phone}</a> · {r.code}</div>
                </td>
                <td>{r.room}</td>
                <td>
                  <span className={`${shared.badge} ${r.status === "checked_out" ? shared.badgeWarning : shared.badgeActive}`}>
                    {r.status === "checked_out" ? `Left ${r.checkOut}` : "In house"}
                  </span>
                </td>
                <td>{birr(r.totalDue)}</td>
                <td>{birr(r.paid)}</td>
                <td><strong>{birr(r.balance)}</strong></td>
                <td>{r.approvedBy ? `${r.approvedBy}${r.note ? ` — ${r.note}` : ""}` : "—"}</td>
                <td><button type="button" className={shared.actionBtn} onClick={() => setOpen(r)}><Receipt size={13} /> Bill</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Drawer title={open.guest} subtitle={`${open.code} · Room ${open.room}`} onClose={() => setOpen(null)}>
          <FolioPanel bookingId={open.id} locale={locale} onChanged={() => router.refresh()} />
        </Drawer>
      )}
    </>
  );
}

"use client";

// Guest bill: room/hall price + extras (food, services, custom) − payments = balance.
import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Printer, Trash2, Wallet, ShieldCheck, Send } from "lucide-react";
import shared from "@/app/[locale]/admin/admin.shared.module.css";
import s from "./BookingBoard.module.css";
import { useToast } from "@/components/ui/Toast";
import { METHOD_LABEL, UNIT_LABEL, retainerAmount, retainerOutstanding, type ChargeKind, type PaymentMethod } from "@/lib/folio";
import { addDays, daysBetween } from "@/lib/booking";
import {
  addCharge, addPayment, approveCredit, getFolio, requestCredit, voidCharge, voidPayment, type Folio,
} from "@/app/[locale]/admin/bookings/folioActions";

const birr = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETB`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function FolioPanel({ bookingId, locale, onChanged }: { bookingId: string; locale: string; onChanged?: () => void }) {
  const toast = useToast();
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [pending, start] = useTransition();

  // Bumping `version` re-fetches the bill
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    getFolio(bookingId).then((res) => {
      if (!live) return;
      if (res.ok && res.data) { setFolio(res.data); setLoadErr(""); }
      else if (!res.ok) setLoadErr(res.error);
    });
    return () => { live = false; };
  }, [bookingId, version]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) { toast.error("Could not save", res.error); return; }
      toast.success(okMsg);
      reload();
      onChanged?.();
    });

  if (loadErr) return <div className={shared.feedbackError}>{loadErr}</div>;
  if (!folio) return <div className={s.sub}><Loader2 size={14} className={s.spin} /> Loading bill…</div>;

  const { booking: b, totals, charges, payments, retainerPercent, canAdmin, allow } = folio;
  const isHall = folio.isHall;
  const units = daysBetween(b.check_in, b.check_out);
  const retainer = retainerPercent > 0 ? retainerAmount(totals.roomTotal, retainerPercent) : 0;
  const retainerLeft = retainerPercent > 0 ? retainerOutstanding(totals.roomTotal, retainerPercent, totals.paid) : 0;
  const closed = b.status === "cancelled" || b.status === "no_show";

  const askVoid = (kind: "charge" | "payment", id: string) => {
    const reason = prompt(`Why void this ${kind}?`);
    if (!reason?.trim()) return;
    run(() => (kind === "charge" ? voidCharge(id, reason) : voidPayment(id, reason)), "Voided");
  };

  return (
    <div className={s.folio}>
      <div className={s.folioHead}>
        <strong>Bill</strong>
        <a className={shared.actionBtn} href={`/${locale}/bill/${b.id}`} target="_blank" rel="noopener">
          <Printer size={13} /> Print
        </a>
      </div>

      <table className={s.folioTable}>
        <tbody>
          <tr>
            <td>
              {folio.typeName ?? "Room"} {folio.roomNumber ? `· ${folio.roomNumber}` : ""}
              <div className={s.sub}>
                {units} {isHall ? "day" : "night"}{units > 1 ? "s" : ""}
                {!isHall && b.guests > 1 ? ` · ${b.guests} guests` : ""}
                {" · "}{b.check_in} → {isHall ? addDays(b.check_out, -1) : b.check_out}
              </div>
            </td>
            <td className={s.amt}>{birr(totals.roomTotal)}</td>
            <td />
          </tr>
          {charges.map((c) => (
            <tr key={c.id} className={c.voided_at ? s.voided : ""}>
              <td>
                {c.description}
                <div className={s.sub}>
                  {c.quantity} × {birr(c.unit_price)} · {c.created_by?.replace(/^\w+:/, "")} · {when(c.created_at)}
                  {c.voided_at && ` · VOID: ${c.void_reason}`}
                </div>
              </td>
              <td className={s.amt}>{birr(c.amount)}</td>
              <td>
                {canAdmin && !c.voided_at && (
                  <button type="button" className={`${shared.actionBtn} ${shared.actionBtnDanger}`} title="Void" disabled={pending} onClick={() => askVoid("charge", c.id)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className={s.totalRow}><td>Total</td><td className={s.amt}>{birr(totals.totalDue)}</td><td /></tr>
          {payments.map((p) => (
            <tr key={p.id} className={p.voided_at ? s.voided : ""}>
              <td>
                {p.kind === "retainer" ? "Retainer" : "Payment"} · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                <div className={s.sub}>
                  {p.received_by?.replace(/^\w+:/, "")} · {when(p.created_at)}
                  {p.voided_at && ` · VOID: ${p.void_reason}`}
                </div>
              </td>
              <td className={s.amt}>− {birr(p.amount)}</td>
              <td>
                {canAdmin && !p.voided_at && (
                  <button type="button" className={`${shared.actionBtn} ${shared.actionBtnDanger}`} title="Void" disabled={pending} onClick={() => askVoid("payment", p.id)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className={`${s.totalRow} ${totals.balance > 0 ? s.due : s.paidUp}`}>
            <td>{totals.balance > 0 ? "Balance due" : totals.balance < 0 ? "Overpaid" : "Paid in full"}</td>
            <td className={s.amt}>{birr(Math.abs(totals.balance))}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {retainerPercent > 0 && b.status === "reserved" && (
        <div className={retainerLeft > 0 ? s.retainerDue : s.retainerOk}>
          Retainer {retainerPercent}% = {birr(retainer)} · {retainerLeft > 0 ? `${birr(retainerLeft)} still due` : "covered"}
        </div>
      )}

      {allow.credit && totals.balance > 0 && (b.status === "checked_in" || b.status === "checked_out") && (
        b.credit_approved_at ? (
          <div className={s.retainerOk}>
            <ShieldCheck size={14} /> Credit approved by {b.credit_approved_by?.replace(/^\w+:/, "")}
            {b.credit_note ? ` — ${b.credit_note}` : ""}
          </div>
        ) : canAdmin ? (
          <button type="button" className={shared.actionBtn} disabled={pending}
            onClick={() => {
              const note = prompt("Approve credit for this guest. Note (when will they pay?):", "");
              if (note === null) return;
              run(() => approveCredit(b.id, note), "Credit approved");
            }}>
            <ShieldCheck size={13} /> Approve credit (pay later)
          </button>
        ) : (
          <button type="button" className={shared.actionBtn} disabled={pending} onClick={() => run(() => requestCredit(b.id), "Admin notified on Telegram")}>
            <Send size={13} /> Ask admin to approve credit
          </button>
        )
      )}

      {!closed && (
        <>
          {totals.balance > 0 && (
            <PaymentForm
              key={`pay-${totals.balance}`}
              balance={totals.balance}
              suggest={retainerLeft > 0 ? retainerLeft : totals.balance}
              defaultKind={b.status === "reserved" && retainerLeft > 0 ? "retainer" : "payment"}
              pending={pending}
              onSubmit={(amount, method, reference, kind) =>
                run(() => addPayment({ bookingId: b.id, amount, method, reference, kind }), "Payment recorded")}
            />
          )}
          <ChargeForm
            folio={folio}
            pending={pending}
            onSubmit={(input) => run(() => addCharge({ bookingId: b.id, ...input }), "Added to bill")}
          />
        </>
      )}
    </div>
  );
}

function PaymentForm({ balance, suggest, defaultKind, pending, onSubmit }: {
  balance: number; suggest: number; defaultKind: "retainer" | "payment"; pending: boolean;
  onSubmit: (amount: number, method: PaymentMethod, reference: string, kind: "retainer" | "payment") => void;
}) {
  const [amount, setAmount] = useState(String(suggest));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const n = Number(amount);

  return (
    <div className={s.formBox}>
      <strong><Wallet size={14} /> Take payment</strong>
      <div className={s.row3}>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Amount (max {balance.toLocaleString()})</label>
          <input className={shared.input} type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Method</label>
          <select className={shared.select} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Reference{method !== "cash" ? " *" : ""}</label>
          <input className={shared.input} value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className={s.actions}>
        <button type="button" className={shared.headerBtn}
          disabled={pending || !(n > 0) || n > balance + 0.009 || (method !== "cash" && !reference.trim())}
          onClick={() => onSubmit(n, method, reference, defaultKind)}>
          {pending ? <Loader2 size={16} className={s.spin} /> : <Wallet size={16} />} Record {birr(n || 0)}
        </button>
        {n < balance && n > 0 && <span className={s.sub}>Part payment — {birr(balance - n)} will remain</span>}
      </div>
    </div>
  );
}

type ChargeDraft = { kind: ChargeKind; description: string; quantity: number; unitPrice: number; serviceId?: string; productId?: string };

function ChargeForm({ folio, pending, onSubmit }: { folio: Folio; pending: boolean; onSubmit: (c: ChargeDraft) => void }) {
  const tabs: { id: ChargeKind; label: string }[] = [
    { id: "food", label: "Food & drinks" },
    ...(folio.allow.events ? [{ id: "service" as const, label: "Event / service" }] : []),
    { id: "custom", label: "Other item" },
  ];
  const [tab, setTab] = useState<ChargeKind>(folio.allow.events && folio.isHall ? "service" : "food");
  const [pickId, setPickId] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const choose = (id: string) => {
    setPickId(id);
    const item = tab === "food" ? folio.menu.find((m) => m.id === id) : folio.services.find((x) => x.id === id);
    if (item) { setDescription(item.name); setPrice(String(item.price)); }
  };
  const switchTab = (t: ChargeKind) => { setTab(t); setPickId(""); setDescription(""); setPrice(""); setQty("1"); };

  const q = Number(qty);
  const p = Number(price);
  const valid = description.trim() && q > 0 && p >= 0 && price !== "";
  const service = tab === "service" ? folio.services.find((x) => x.id === pickId) : undefined;

  return (
    <div className={s.formBox}>
      <strong><Plus size={14} /> Add to bill</strong>
      <div className={s.tabs}>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`${s.tab} ${tab === t.id ? s.tabOn : ""}`} onClick={() => switchTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab !== "custom" && (
        <select className={shared.select} value={pickId} onChange={(e) => choose(e.target.value)}>
          <option value="">Select…</option>
          {tab === "food"
            ? folio.menu.map((m) => <option key={m.id} value={m.id}>{m.name} · {birr(m.price)}</option>)
            : folio.services.map((x) => <option key={x.id} value={x.id}>{x.name} · {birr(x.price)} {UNIT_LABEL[x.unit]}</option>)}
        </select>
      )}
      {tab === "custom" && (
        <input className={shared.input} placeholder="Description (e.g. Laundry, Extra mattress)" value={description} onChange={(e) => setDescription(e.target.value)} />
      )}

      <div className={s.row2}>
        <div className={shared.inputGroup}>
          <label className={shared.label}>{service?.unit === "plate" ? "Plates" : service?.unit === "person" ? "People" : "Quantity"}</label>
          <input className={shared.input} type="number" min={1} step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Unit price (ETB){tab === "service" ? " — editable" : ""}</label>
          <input className={shared.input} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} readOnly={tab === "food"} />
        </div>
      </div>

      <div className={s.actions}>
        <button type="button" className={shared.headerBtn} disabled={pending || !valid}
          onClick={() => {
            onSubmit({
              kind: tab, description, quantity: q, unitPrice: p,
              serviceId: tab === "service" ? pickId || undefined : undefined,
              productId: tab === "food" ? pickId || undefined : undefined,
            });
            switchTab(tab);
          }}>
          {pending ? <Loader2 size={16} className={s.spin} /> : <Plus size={16} />} Add {valid ? birr(q * p) : ""}
        </button>
      </div>
    </div>
  );
}

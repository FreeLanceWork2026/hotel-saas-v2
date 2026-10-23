"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Boxes, Search, X, PackagePlus, SlidersHorizontal, History, Printer, Loader2, AlertTriangle,
  Package, ArrowDownRight, ArrowUpRight, ShoppingBag, RotateCcw, Trash2, Factory, Truck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import shared from "../admin.shared.module.css";
import p from "../products/Products.module.css";
import styles from "./Inventory.module.css";
import { useToast } from "@/components/ui/Toast";
import { useFeature } from "@/context/FeaturesContext";
import {
  receiveStockAction, adjustStockAction, getProductJourney,
  type JourneyBatch, type JourneyMovement,
} from "./actions";

export interface StockRow {
  id: string;
  name: string;
  size: string | null;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  is_active: boolean;
  stock_qty: number;
  reorder_level: number;
  next_expiry: string | null;
  sold_30d: number;
}

type Filter = "all" | "low" | "out" | "expiring" | "hidden";
type Dialog = { kind: "receive" | "adjust" | "journey"; row: StockRow } | null;

const EXPIRING_DAYS = 14;

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date + "T00:00:00").getTime() - Date.now()) / 86400_000);
}

function state(r: StockRow): "out" | "low" | "ok" {
  if (r.stock_qty <= 0) return "out";
  if (r.stock_qty <= r.reorder_level) return "low";
  return "ok";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InventoryClient({ rows, stockReady }: { rows: StockRow[]; stockReady: boolean }) {
  const canPrint = useFeature("labels");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);

  const stats = useMemo(() => {
    const live = rows.filter((r) => r.is_active);
    return {
      skus: live.length,
      units: rows.reduce((s, r) => s + r.stock_qty, 0),
      low: rows.filter((r) => r.is_active && state(r) === "low").length,
      out: rows.filter((r) => r.is_active && state(r) === "out").length,
      expiring: rows.filter((r) => {
        const d = daysUntil(r.next_expiry);
        return d !== null && d <= EXPIRING_DAYS && r.stock_qty > 0;
      }).length,
      hidden: rows.filter((r) => !r.is_active).length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const d = daysUntil(r.next_expiry);
        if (filter === "low" && !(state(r) === "low")) return false;
        if (filter === "out" && state(r) !== "out") return false;
        if (filter === "expiring" && !(d !== null && d <= EXPIRING_DAYS && r.stock_qty > 0)) return false;
        if (filter === "hidden" && r.is_active) return false;
        if (!q) return true;
        return [r.name, r.sku, r.barcode, r.size].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      })
      // most urgent first
      .sort((a, b) => {
        const rank = { out: 0, low: 1, ok: 2 } as const;
        return rank[state(a)] - rank[state(b)] || a.name.localeCompare(b.name);
      });
  }, [rows, query, filter]);

  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "low", label: "Low", n: stats.low },
    { id: "out", label: "Out", n: stats.out },
    { id: "expiring", label: "Expiring", n: stats.expiring },
    { id: "hidden", label: "Hidden", n: stats.hidden },
  ];

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Inventory</h1>
          <p className={shared.pageSubtitle}>What you have, what&apos;s running low, and where every unit went.</p>
        </div>
        {canPrint && (
          <Link href="/admin/inventory/labels" className={shared.headerBtn}>
            <Printer size={16} /> Print labels
          </Link>
        )}
      </div>

      {!stockReady && (
        <div className={p.banner}>
          <AlertTriangle size={16} />
          <span>
            Stock tracking isn&apos;t set up yet. Run <code>phase25_stock.sql</code> in the Supabase SQL Editor, then
            refresh. Until then, quantities shown here are placeholders and actions are disabled.
          </span>
        </div>
      )}

      <div className={styles.kpis}>
        <Kpi label="Products on sale" value={stats.skus} />
        <Kpi label="Units on hand" value={stats.units} />
        <Kpi label="Low stock" value={stats.low} tone={stats.low ? "warn" : undefined} onClick={() => setFilter("low")} />
        <Kpi label="Out of stock" value={stats.out} tone={stats.out ? "bad" : undefined} onClick={() => setFilter("out")} />
        <Kpi label={`Expiring ≤ ${EXPIRING_DAYS}d`} value={stats.expiring} tone={stats.expiring ? "warn" : undefined} onClick={() => setFilter("expiring")} />
      </div>

      <div className={shared.card}>
        <div className={p.toolbar}>
          <label className={p.search}>
            <Search size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, barcode…" aria-label="Search stock" />
          </label>
          <div className={p.chips} role="tablist" aria-label="Filter stock">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={filter === c.id}
                className={`${p.chip} ${filter === c.id ? p.chipOn : ""}`}
                onClick={() => setFilter(c.id)}
              >
                {c.label} <span>{c.n}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={p.empty}>
            <Boxes size={28} />
            <p>{rows.length === 0 ? "No products yet. Add products first, then receive stock here." : "Nothing matches this filter."}</p>
            {rows.length === 0 && (
              <Link href="/admin/products" className={shared.headerBtn}>Go to Products</Link>
            )}
          </div>
        ) : (
          <>
            <div className={`${shared.tableWrapper} ${p.desktopOnly}`}>
              <table className={shared.table}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>On hand</th>
                    <th>Reorder at</th>
                    <th>Status</th>
                    <th>Next expiry</th>
                    <th>Sold (30d)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const s = state(r);
                    const d = daysUntil(r.next_expiry);
                    return (
                      <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                        <td>
                          <div className={p.prodCell}>
                            <Thumb r={r} />
                            <div>
                              <div className={shared.cellName}>{r.name}{r.size ? ` · ${r.size}` : ""}</div>
                              <div className={p.sub}>{r.sku ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.qty}>{stockReady ? r.stock_qty : "—"}</td>
                        <td>{r.reorder_level}</td>
                        <td><StatusBadge s={s} active={r.is_active} /></td>
                        <td>
                          {r.next_expiry ? (
                            <span className={d !== null && d <= EXPIRING_DAYS ? styles.warnText : ""}>
                              {r.next_expiry}{d !== null && d <= EXPIRING_DAYS ? ` (${d < 0 ? "expired" : `${d}d`})` : ""}
                            </span>
                          ) : <span className={p.muted}>—</span>}
                        </td>
                        <td>{r.sold_30d}</td>
                        <td>
                          <RowActions r={r} disabled={!stockReady} onOpen={(kind) => setDialog({ kind, row: r })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className={`${p.cards} ${p.mobileOnly}`}>
              {visible.map((r) => (
                <li key={r.id} className={p.pcard} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                  <div className={p.pcardMain} style={{ cursor: "default" }}>
                    <Thumb r={r} size={56} />
                    <div className={p.pcardBody}>
                      <div className={shared.cellName}>{r.name}{r.size ? ` · ${r.size}` : ""}</div>
                      <div className={p.sub}>{r.sku ?? "—"}</div>
                      <div className={p.pcardMeta}>
                        <span className={styles.qtyBig}>{stockReady ? r.stock_qty : "—"}</span>
                        <StatusBadge s={state(r)} active={r.is_active} />
                        {r.next_expiry && <span className={p.sub}>exp {r.next_expiry}</span>}
                      </div>
                    </div>
                  </div>
                  <RowActions r={r} disabled={!stockReady} onOpen={(kind) => setDialog({ kind, row: r })} mobile />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {dialog?.kind === "receive" && <ReceiveSheet row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "adjust" && <AdjustSheet row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "journey" && <JourneySheet row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

/* ───────────── small pieces ───────────── */

function Kpi({ label, value, tone, onClick }: { label: string; value: number; tone?: "warn" | "bad"; onClick?: () => void }) {
  return (
    <button type="button" className={`${styles.kpi} ${tone === "warn" ? styles.kpiWarn : tone === "bad" ? styles.kpiBad : ""}`} onClick={onClick} disabled={!onClick}>
      <span className={styles.kpiValue}>{value.toLocaleString()}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </button>
  );
}

function Thumb({ r, size = 40 }: { r: StockRow; size?: number }) {
  return r.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={r.image_url} alt={r.name} className={p.thumb} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className={p.thumbEmpty} style={{ width: size, height: size }} aria-hidden><Package size={size / 2.4} /></span>
  );
}

function StatusBadge({ s, active }: { s: "out" | "low" | "ok"; active: boolean }) {
  if (!active) return <span className={`${shared.badge} ${shared.badgeInactive}`}>Hidden</span>;
  return s === "out" ? <span className={`${shared.badge} ${shared.badgeExpired}`}>Out of stock</span>
    : s === "low" ? <span className={`${shared.badge} ${shared.badgeWarning}`}>Low</span>
    : <span className={`${shared.badge} ${shared.badgeGood}`}>In stock</span>;
}

function RowActions({ r, disabled, onOpen, mobile }: { r: StockRow; disabled: boolean; onOpen: (k: "receive" | "adjust" | "journey") => void; mobile?: boolean }) {
  const canPrint = useFeature("labels");
  return (
    <div className={mobile ? p.pcardActions : p.rowActions} style={mobile ? { flexWrap: "wrap" } : undefined}>
      <button type="button" className={shared.actionBtn} disabled={disabled} onClick={() => onOpen("receive")}><PackagePlus size={13} /> Receive</button>
      <button type="button" className={shared.actionBtn} disabled={disabled} onClick={() => onOpen("adjust")}><SlidersHorizontal size={13} /> Adjust</button>
      <button type="button" className={shared.actionBtn} disabled={disabled} onClick={() => onOpen("journey")}><History size={13} /> Journey</button>
      {canPrint && <Link href={`/admin/inventory/labels?product=${r.id}`} className={shared.actionBtn} title="Print label"><Printer size={13} /></Link>}
    </div>
  );
}

function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={p.sheetRoot} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={p.sheetBackdrop} onClick={onClose} aria-label="Close" />
      <div className={p.sheet}>
        <div className={p.sheetHead}>
          <div>
            <h2>{title}</h2>
            {subtitle && <div className={p.sub}>{subtitle}</div>}
          </div>
          <button type="button" className={p.sheetClose} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───────────── Receive ───────────── */

function ReceiveSheet({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const canPrint = useFeature("labels");
  const { success } = useToast();
  const [source, setSource] = useState<"received" | "produced">("received");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ code?: string; balance?: number; batchId?: string } | null>(null);

  const submit = (fd: FormData) => {
    setErr(null);
    fd.set("productId", row.id);
    fd.set("source", source);
    start(async () => {
      const res = await receiveStockAction(fd);
      if ("error" in res && res.error) return setErr(res.error);
      const ok = res as { success: true; batchId?: string; batchCode?: string; balance?: number };
      success("Stock received", `${row.name}: now ${ok.balance} on hand`);
      setDone({ code: ok.batchCode, balance: ok.balance, batchId: ok.batchId });
    });
  };

  return (
    <Sheet title="Receive stock" subtitle={`${row.name}${row.size ? ` · ${row.size}` : ""} — ${row.stock_qty} on hand`} onClose={onClose}>
      {done ? (
        <div className={p.sheetBody}>
          <div className={shared.feedbackSuccess}>Batch <strong>{done.code}</strong> added. On hand: <strong>{done.balance}</strong>.</div>
          {canPrint && <Link href={`/admin/inventory/labels?product=${row.id}&batch=${encodeURIComponent(done.code ?? "")}&copies=12`} className={shared.headerBtn} style={{ justifyContent: "center" }}>
            <Printer size={16} /> Print labels for this batch
          </Link>}
          <button type="button" className={shared.actionBtn} onClick={onClose} style={{ padding: "0.7rem" }}>Done</button>
        </div>
      ) : (
        <form action={submit} className={p.sheetBody}>
          {err && <div className={shared.feedbackError}>{err}</div>}

          <div className={styles.seg} role="radiogroup" aria-label="Source">
            <button type="button" role="radio" aria-checked={source === "received"} className={source === "received" ? styles.segOn : ""} onClick={() => setSource("received")}><Truck size={14} /> Bought in</button>
            <button type="button" role="radio" aria-checked={source === "produced"} className={source === "produced" ? styles.segOn : ""} onClick={() => setSource("produced")}><Factory size={14} /> Produced</button>
          </div>

          <div className={p.row2}>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="r-qty">Quantity (units) <span className={shared.labelRequired}>*</span></label>
              <input className={shared.input} id="r-qty" name="qty" type="number" inputMode="numeric" min="1" step="1" required autoFocus />
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="r-exp">Expiry date</label>
              <input className={shared.input} id="r-exp" name="expiresAt" type="date" />
            </div>
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="r-who">{source === "produced" ? "Produced by" : "Supplier"}</label>
            <input className={shared.input} id="r-who" name={source === "produced" ? "producedBy" : "supplier"} placeholder={source === "produced" ? "e.g. Abebe (kitchen)" : "e.g. Addis Nuts Trading"} />
          </div>

          <div className={p.row2}>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="r-cost">Unit cost (ETB)</label>
              <input className={shared.input} id="r-cost" name="unitCost" type="number" inputMode="decimal" min="0" step="0.01" />
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="r-code">Batch code</label>
              <input className={shared.input} id="r-code" name="batchCode" placeholder="Auto" />
            </div>
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="r-note">Note</label>
            <input className={shared.input} id="r-note" name="note" placeholder="Optional" />
          </div>

          <div className={p.sheetFoot}>
            <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={p.saveBtn} disabled={pending}>
              {pending ? <><Loader2 size={16} className={p.spin} /> Saving…</> : <><PackagePlus size={16} /> Add to stock</>}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/* ───────────── Adjust ───────────── */

function AdjustSheet({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { success } = useToast();
  const [mode, setMode] = useState<"set" | "add" | "remove">("set");
  const [type, setType] = useState<"adjust" | "waste">("adjust");
  const [qty, setQty] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = Math.floor(Number(qty));
  const preview =
    qty === "" || !Number.isFinite(n) ? null
    : mode === "set" ? n
    : mode === "add" ? row.stock_qty + n
    : row.stock_qty - n;

  const REASONS = mode === "remove"
    ? ["Damaged", "Expired", "Sample / tasting", "Lost", "Other"]
    : mode === "add" ? ["Found in recount", "Returned unopened", "Other"]
    : ["Physical count", "Correction", "Other"];

  const submit = (fd: FormData) => {
    setErr(null);
    fd.set("productId", row.id);
    fd.set("mode", mode);
    fd.set("type", mode === "remove" ? type : "adjust");
    start(async () => {
      const res = await adjustStockAction(fd);
      if ("error" in res && res.error) return setErr(res.error);
      const ok = res as { success: true; balance: number; delta: number };
      success("Stock updated", `${row.name}: now ${ok.balance} on hand`);
      onClose();
    });
  };

  return (
    <Sheet title="Adjust stock" subtitle={`${row.name}${row.size ? ` · ${row.size}` : ""} — ${row.stock_qty} on hand`} onClose={onClose}>
      <form action={submit} className={p.sheetBody}>
        {err && <div className={shared.feedbackError}>{err}</div>}

        <div className={styles.seg} role="radiogroup" aria-label="Adjustment type">
          <button type="button" role="radio" aria-checked={mode === "set"} className={mode === "set" ? styles.segOn : ""} onClick={() => setMode("set")}>Count</button>
          <button type="button" role="radio" aria-checked={mode === "add"} className={mode === "add" ? styles.segOn : ""} onClick={() => setMode("add")}><ArrowUpRight size={14} /> Add</button>
          <button type="button" role="radio" aria-checked={mode === "remove"} className={mode === "remove" ? styles.segOn : ""} onClick={() => setMode("remove")}><ArrowDownRight size={14} /> Remove</button>
        </div>

        <div className={shared.inputGroup}>
          <label className={shared.label} htmlFor="a-qty">
            {mode === "set" ? "Counted quantity (what's actually on the shelf)" : "Quantity (units)"} <span className={shared.labelRequired}>*</span>
          </label>
          <input className={shared.input} id="a-qty" name="qty" type="number" inputMode="numeric" min="0" step="1" required value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          {preview !== null && (
            <p className={shared.inputHint}>
              {row.stock_qty} → <strong style={{ color: preview < 0 ? "var(--a-red)" : "var(--a-gold)" }}>{preview}</strong>
              {preview < 0 && " (below zero)"}
            </p>
          )}
        </div>

        {mode === "remove" && (
          <div className={styles.seg} role="radiogroup" aria-label="Record as">
            <button type="button" role="radio" aria-checked={type === "adjust"} className={type === "adjust" ? styles.segOn : ""} onClick={() => setType("adjust")}>Correction</button>
            <button type="button" role="radio" aria-checked={type === "waste"} className={type === "waste" ? styles.segOn : ""} onClick={() => setType("waste")}><Trash2 size={14} /> Waste / loss</button>
          </div>
        )}

        <div className={shared.inputGroup}>
          <label className={shared.label} htmlFor="a-reason">Reason <span className={shared.labelRequired}>*</span></label>
          <input className={shared.input} id="a-reason" name="reason" list="reasons" required placeholder="Required — saved in the audit trail" />
          <datalist id="reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>

        <div className={p.sheetFoot}>
          <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={p.saveBtn} disabled={pending}>
            {pending ? <><Loader2 size={16} className={p.spin} /> Saving…</> : "Apply adjustment"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ───────────── Journey ───────────── */

const MOVE_META: Record<string, { label: string; icon: React.ReactNode; tone: "in" | "out" | "neutral" }> = {
  receive: { label: "Received", icon: <Truck size={14} />, tone: "in" },
  produce: { label: "Produced", icon: <Factory size={14} />, tone: "in" },
  opening: { label: "Opening stock", icon: <Package size={14} />, tone: "in" },
  sale: { label: "Sold", icon: <ShoppingBag size={14} />, tone: "out" },
  return: { label: "Returned to stock", icon: <RotateCcw size={14} />, tone: "in" },
  adjust: { label: "Adjusted", icon: <SlidersHorizontal size={14} />, tone: "neutral" },
  waste: { label: "Waste / loss", icon: <Trash2 size={14} />, tone: "out" },
};

function JourneySheet({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [data, setData] = useState<{ batches: JourneyBatch[]; movements: JourneyMovement[]; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    getProductJourney(row.id).then((d) => alive && setData(d));
    return () => { alive = false; };
  }, [row.id]);

  return (
    <Sheet title="Item journey" subtitle={`${row.name}${row.size ? ` · ${row.size}` : ""} — ${row.stock_qty} on hand`} onClose={onClose}>
      <div className={p.sheetBody}>
        {!data && <div className={p.empty}><Loader2 size={22} className={p.spin} /></div>}
        {data?.error && <div className={shared.feedbackError}>{data.error}</div>}

        {data && !data.error && (
          <>
            <h3 className={styles.h3}>Batches</h3>
            {data.batches.length === 0 ? (
              <p className={p.sub}>No batches yet. Use <strong>Receive</strong> to bring stock in.</p>
            ) : (
              <ul className={styles.batchList}>
                {data.batches.map((b) => {
                  const d = daysUntil(b.expires_at);
                  return (
                    <li key={b.id} className={styles.batch}>
                      <div className={styles.batchTop}>
                        <code>{b.batch_code}</code>
                        <span className={`${shared.badge} ${b.qty_remaining === 0 ? shared.badgeInactive : shared.badgeGood}`}>
                          {b.qty_remaining} / {b.qty_received} left
                        </span>
                      </div>
                      <div className={p.sub}>
                        {b.source === "produced" ? "Produced" : b.source === "opening" ? "Opening" : "Received"} {fmtDate(b.received_at)}
                        {b.produced_by ? ` by ${b.produced_by}` : b.supplier ? ` from ${b.supplier}` : ""}
                        {b.expires_at ? ` · expires ${b.expires_at}${d !== null && d <= EXPIRING_DAYS && b.qty_remaining > 0 ? ` (${d < 0 ? "expired" : `${d}d`})` : ""}` : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className={styles.h3}>History</h3>
            {data.movements.length === 0 ? (
              <p className={p.sub}>Nothing has happened to this item yet.</p>
            ) : (
              <ol className={styles.timeline}>
                {data.movements.map((m) => {
                  const meta = MOVE_META[m.type] ?? { label: m.type, icon: <Package size={14} />, tone: "neutral" as const };
                  return (
                    <li key={m.id} className={`${styles.tItem} ${styles[`tone_${meta.tone}`]}`}>
                      <span className={styles.tDot}>{meta.icon}</span>
                      <div className={styles.tBody}>
                        <div className={styles.tTop}>
                          <strong>{meta.label}</strong>
                          <span className={m.qty > 0 ? styles.plus : styles.minus}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                        </div>
                        <div className={p.sub}>
                          {fmtDate(m.created_at)}
                          {m.order_number ? ` · order ${m.order_number}` : ""}
                          {m.channel ? ` · ${m.channel}` : ""}
                          {m.actor ? ` · ${m.actor}` : ""}
                          {m.batch_code ? ` · ${m.batch_code}` : ""}
                          {m.balance_after !== null ? ` · balance ${m.balance_after}` : ""}
                        </div>
                        {m.reason && <div className={styles.reason}>{m.reason}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

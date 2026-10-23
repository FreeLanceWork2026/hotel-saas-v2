"use client";

import React, { useMemo, useState, useTransition, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, ShieldAlert, Loader2, ZoomIn, X, Phone, User, Hash,
  FileImage, Database, Copy, Check, Search, Filter, TrendingUp, AlertTriangle,
  BarChart3, ChevronDown, ChevronUp, History, Eye, EyeOff,
  ArrowUpDown, ArrowUp, ArrowDown, Download,
} from "lucide-react";
import type { PaymentChecks } from "@/lib/paymentPipeline";
import shared from "../admin.shared.module.css";
import styles from "./Payments.module.css";
import { confirmPaymentAction, rejectPaymentAction } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { FLAG_LABELS } from "@/lib/receiptParser";

export interface PaymentRow {
  id: string;
  method: string;
  amount: number;
  transactionId: string;
  referenceNumber: string | null;
  payerName: string | null;
  proofUrl: string | null;
  proofFilename: string | null;
  status: "pending" | "confirmed" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string;
  customerPhone: string;
  orderTotal: number;
  deliveryType: string;
  nameMatch: boolean | null;
  source: "pos" | "online";
  flags: string[];
  receiptAmount: number | null;
  ocrConfidence: number | null;
  capturedBy: string | null;
  anonymous: boolean;
  checks: PaymentChecks | null;
}

// ── Constants ─────────────────────────────────────────────────────────
const VERDICT_TEXT = {
  green: "Checks passed: still compare with the bank app before confirming",
  yellow: "Needs a look",
  red: "Possible fraud: this receipt was used before",
} as const;

const DUP_TEXT: Record<string, string> = {
  reference: "Same reference",
  image: "Same image",
  similar_image: "Similar image",
};

const METHOD_LABEL: Record<string, string> = { telebirr: "Telebirr", cbe: "CBE", cash: "Cash" };

const QUICK_REASONS = [
  "Payment not received",
  "Amount doesn't match",
  "Unreadable screenshot",
  "Wrong account / name",
];

const FLAG_SEVERITY: Record<string, "critical" | "warning" | "info"> = {
  duplicate_reference: "critical",
  duplicate_image: "critical",
  similar_image: "critical",
  amount_mismatch: "critical",
  edited_by_employee: "warning",
  method_mismatch: "warning",
  old_reference: "warning",
  manual_reference: "warning",
  bad_reference_format: "warning",
  low_ocr_confidence: "info",
  no_amount: "info",
  no_reference: "info",
  no_proof: "info",
};

function flagSeverity(flags: string[]): "critical" | "warning" | "info" | "none" {
  if (flags.some((f) => FLAG_SEVERITY[f] === "critical")) return "critical";
  if (flags.some((f) => FLAG_SEVERITY[f] === "warning")) return "warning";
  if (flags.length > 0) return "info";
  return "none";
}

function flagSeverityScore(flags: string[]): number {
  const sev = flagSeverity(flags);
  if (sev === "critical") return 3;
  if (sev === "warning") return 2;
  if (sev === "info") return 1;
  return 0;
}

function isRefReuse(p: PaymentRow) {
  return p.checks?.duplicates.some((d) => d.kind === "reference") ?? false;
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Tiny helpers ──────────────────────────────────────────────────────
function CopyRef({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyBtn}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      aria-label="Copy reference"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

// ── Mini bar chart (pure CSS) ─────────────────────────────────────────
function MiniBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={styles.barChart}>
      {data.map((d) => (
        <div key={d.label} className={styles.barGroup}>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ height: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <div className={styles.barLabel}>{d.value}</div>
          <div className={styles.barName}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart (SVG) ─────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { value: number; color: string; label: string }[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const R = 40; const cx = 50; const cy = 50;
  const paths = slices.map((s, i) => {
    const prior = slices.slice(0, i).reduce((sum, item) => sum + item.value, 0);
    const start = (prior / total) * 360;
    const sweep = (s.value / total) * 360;
    const startRad = ((start - 90) * Math.PI) / 180;
    const endRad = ((start + sweep - 90) * Math.PI) / 180;
    const x1 = cx + R * Math.cos(startRad); const y1 = cy + R * Math.sin(startRad);
    const x2 = cx + R * Math.cos(endRad);   const y2 = cy + R * Math.sin(endRad);
    const large = sweep > 180 ? 1 : 0;
    return { path: `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`, color: s.color, label: s.label, value: s.value };
  });
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 100 100" className={styles.donutSvg}>
        <circle cx={cx} cy={cy} r={R} fill="var(--a-surface)" />
        {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} opacity={0.85} />)}
        <circle cx={cx} cy={cy} r={26} fill="var(--a-card)" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="var(--a-text)" fontSize="13" fontWeight="700">{total}</text>
      </svg>
      <div className={styles.donutLegend}>
        {slices.map((s, i) => (
          <div key={i} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className={styles.legendVal}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BI Analytics Panel ────────────────────────────────────────────────
function AnalyticsPanel({ payments }: { payments: PaymentRow[] }) {
  const stats = useMemo(() => {
    const pending = payments.filter((p) => p.status === "pending").length;
    const confirmed = payments.filter((p) => p.status === "confirmed").length;
    const rejected = payments.filter((p) => p.status === "rejected").length;
    const totalVolume = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
    const refReuse = payments.filter(isRefReuse).length;
    const criticalFlags = payments.filter((p) => flagSeverity(p.flags) === "critical").length;
    const avgAmount = payments.length ? payments.reduce((s, p) => s + p.amount, 0) / payments.length : 0;
    const flagFreq: Record<string, number> = {};
    for (const p of payments) for (const f of p.flags) flagFreq[f] = (flagFreq[f] ?? 0) + 1;
    const topFlags = Object.entries(flagFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, count]) => ({
      label: (FLAG_LABELS[f] ?? f).slice(0, 22), value: count,
      color: FLAG_SEVERITY[f] === "critical" ? "#f87171" : FLAG_SEVERITY[f] === "warning" ? "#fbbf24" : "#60a5fa",
    }));
    const byMethod: Record<string, number> = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + 1;
    return { pending, confirmed, rejected, totalVolume, refReuse, criticalFlags, avgAmount, topFlags, byMethod };
  }, [payments]);

  const methodSlices = Object.entries(stats.byMethod).map(([m, v]) => ({
    value: v, color: m === "telebirr" ? "#7c3aed" : m === "cbe" ? "#2563eb" : "#059669", label: METHOD_LABEL[m] ?? m,
  }));

  return (
    <div className={styles.analytics}>
      <div className={styles.statCards}>
        <div className={`${styles.statCard} ${styles.statCardGold}`}><div className={styles.statValue}>{stats.pending}</div><div className={styles.statLabel}>Pending Review</div></div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}><div className={styles.statValue}>{stats.totalVolume.toLocaleString()}</div><div className={styles.statLabel}>ብር Confirmed</div></div>
        <div className={`${styles.statCard} ${stats.refReuse > 0 ? styles.statCardRed : styles.statCardNeutral}`}><div className={styles.statValue}>{stats.refReuse}</div><div className={styles.statLabel}>Ref. Reuses</div></div>
        <div className={`${styles.statCard} ${stats.criticalFlags > 0 ? styles.statCardRed : styles.statCardNeutral}`}><div className={styles.statValue}>{stats.criticalFlags}</div><div className={styles.statLabel}>Critical Flags</div></div>
        <div className={`${styles.statCard} ${styles.statCardNeutral}`}><div className={styles.statValue}>{Math.round(stats.avgAmount).toLocaleString()}</div><div className={styles.statLabel}>Avg Amount ብር</div></div>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}><div className={styles.statValue}>{stats.confirmed}</div><div className={styles.statLabel}>Confirmed</div></div>
      </div>
      <div className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}><BarChart3 size={13} /> Status Split</div>
          <DonutChart slices={[{ value: stats.pending, color: "#f59e0b", label: "Pending" }, { value: stats.confirmed, color: "#34d399", label: "Confirmed" }, { value: stats.rejected, color: "#f87171", label: "Rejected" }]} />
        </div>
        {methodSlices.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}><TrendingUp size={13} /> By Method</div>
            <DonutChart slices={methodSlices} />
          </div>
        )}
        {stats.topFlags.length > 0 && (
          <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
            <div className={styles.chartTitle}><AlertTriangle size={13} /> Top Flags</div>
            <MiniBarChart data={stats.topFlags} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filters Bar ───────────────────────────────────────────────────────
type FilterState = {
  search: string; method: string; flagType: string;
  status: string; amountMin: string; amountMax: string; timeRange: string;
};
const INITIAL_FILTERS: FilterState = { search: "", method: "all", flagType: "all", status: "all", amountMin: "", amountMax: "", timeRange: "all" };

function FiltersBar({ filters, onChange, payments }: { filters: FilterState; onChange: (f: Partial<FilterState>) => void; payments: PaymentRow[] }) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.entries(filters).filter(([k, v]) => k === "search" ? v !== "" : v !== "all" && v !== "").length;
  const allFlags = useMemo(() => { const s = new Set<string>(); for (const p of payments) for (const f of p.flags) s.add(f); return [...s]; }, [payments]);

  return (
    <div className={styles.filtersWrap}>
      <div className={styles.filtersTop}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input id="payments-search" type="search" placeholder="Search order, name, phone, reference…" className={styles.searchInput} value={filters.search} onChange={(e) => onChange({ search: e.target.value })} />
          {filters.search && <button type="button" className={styles.searchClear} onClick={() => onChange({ search: "" })}><X size={13} /></button>}
        </div>
        <button type="button" className={`${styles.filterToggle} ${activeCount > 0 ? styles.filterToggleActive : ""}`} onClick={() => setOpen((o) => !o)} id="payments-filter-toggle">
          <Filter size={14} /> Filters {activeCount > 0 && <span className={styles.filterBadge}>{activeCount}</span>}
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {activeCount > 0 && <button type="button" className={styles.clearFilters} onClick={() => onChange(INITIAL_FILTERS)}><X size={12} /> Clear all</button>}
      </div>
      {open && (
        <div className={styles.filterGrid}>
          {[
            { label: "Status", id: "payments-filter-status", key: "status" as const, opts: [["all","All statuses"],["pending","Pending"],["confirmed","Confirmed"],["rejected","Rejected"]] },
            { label: "Method", id: "payments-filter-method", key: "method" as const, opts: [["all","All methods"],["telebirr","Telebirr"],["cbe","CBE"],["cash","Cash"]] },
            { label: "Time range", id: "payments-filter-time", key: "timeRange" as const, opts: [["all","All time"],["1h","Last hour"],["6h","Last 6 hours"],["24h","Last 24 hours"],["7d","Last 7 days"],["30d","Last 30 days"]] },
          ].map(({ label, id, key, opts }) => (
            <div key={key} className={styles.filterGroup}>
              <label className={styles.filterLabel}>{label}</label>
              <select className={styles.filterSelect} value={filters[key]} onChange={(e) => onChange({ [key]: e.target.value })} id={id}>
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Flag type</label>
            <select className={styles.filterSelect} value={filters.flagType} onChange={(e) => onChange({ flagType: e.target.value })} id="payments-filter-flag">
              <option value="all">Any / none</option>
              <option value="__has_any">Has any flag</option>
              <option value="__critical">Critical flags only</option>
              <option value="__ref_reuse">Reference reuse</option>
              <option value="__money_mismatch">Money mismatch</option>
              {allFlags.map((f) => <option key={f} value={f}>{FLAG_LABELS[f] ?? f}</option>)}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Min amount (ብር)</label>
            <input type="number" className={styles.filterInput} placeholder="0" value={filters.amountMin} onChange={(e) => onChange({ amountMin: e.target.value })} min={0} id="payments-filter-amount-min" />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Max amount (ብር)</label>
            <input type="number" className={styles.filterInput} placeholder="∞" value={filters.amountMax} onChange={(e) => onChange({ amountMax: e.target.value })} min={0} id="payments-filter-amount-max" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort Bar ──────────────────────────────────────────────────────────
type SortKey = "time" | "amount" | "flags";
type SortDir = "asc" | "desc";

function SortBar({ sortKey, sortDir, onSort, onExport, count }: {
  sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void;
  onExport: () => void;
  count: number;
}) {
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={12} className={styles.sortIconNeutral} />;
    return sortDir === "desc" ? <ArrowDown size={12} className={styles.sortIconActive} /> : <ArrowUp size={12} className={styles.sortIconActive} />;
  };

  return (
    <div className={styles.sortBar}>
      <span className={styles.sortLabel}>Sort by</span>
      {(["time", "amount", "flags"] as SortKey[]).map((k) => (
        <button key={k} type="button" className={`${styles.sortPill} ${sortKey === k ? styles.sortPillActive : ""}`} onClick={() => onSort(k)} id={`payments-sort-${k}`}>
          <SortIcon k={k} />
          {k === "time" ? "Time" : k === "amount" ? "Amount" : "Risk"}
        </button>
      ))}
      <div className={styles.sortSpacer} />
      <button type="button" className={styles.exportBtn} onClick={onExport} title={`Export ${count} payments to CSV`} id="payments-export-csv">
        <Download size={13} /> Export CSV
      </button>
    </div>
  );
}

// ── Reference Reuse History Panel ─────────────────────────────────────
function RefReusePanel({ p }: { p: PaymentRow }) {
  const [expanded, setExpanded] = useState(false);
  const refDupes = p.checks?.duplicates.filter((d) => d.kind === "reference") ?? [];
  if (refDupes.length === 0) return null;
  return (
    <div className={styles.reusePanel}>
      <div className={styles.reuseBanner}>
        <ShieldAlert size={16} className={styles.reuseBannerIcon} />
        <div className={styles.reuseBannerText}>
          <strong>⚠️ REFERENCE REUSE</strong>
          <span>This reference was already submitted on {refDupes.length} previous order{refDupes.length > 1 ? "s" : ""}.</span>
        </div>
        <button type="button" className={styles.reuseExpandBtn} onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}>
          <History size={13} /> {expanded ? "Hide" : "History"} {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      {expanded && (
        <div className={styles.reuseHistory}>
          {refDupes.map((d, i) => (
            <div key={i} className={styles.reuseEntry}>
              <div className={styles.reuseEntryTop}>
                <span className={styles.reuseOrderNum}>Order #{d.orderNumber}</span>
                <span className={`${styles.reuseStatus} ${d.status === "confirmed" ? styles.reuseStatusOk : d.status === "rejected" ? styles.reuseStatusBad : styles.reuseStatusPending}`}>{d.status}</span>
              </div>
              <div className={styles.reuseEntryMeta}>
                <span className={styles.reuseAmount}>{d.amount.toLocaleString()} ብር</span>
                {d.capturedBy && <span>Sold by <strong>{d.capturedBy}</strong></span>}
                {!d.capturedBy && d.customerName && <span>Customer: <strong>{d.customerName}</strong></span>}
                {d.source && <span className={styles.reuseSource}>{d.source.toUpperCase()}</span>}
              </div>
              <div className={styles.reuseWhen}>{new Date(d.createdAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Collapsible Payment Card ──────────────────────────────────────────
function PaymentCard({
  p, busyId, rejectingId, reason, setReason, setRejectingId, setLightbox, onConfirm, onReject,
}: {
  p: PaymentRow;
  busyId: string | null;
  rejectingId: string | null;
  reason: string;
  setReason: (r: string) => void;
  setRejectingId: (id: string | null) => void;
  setLightbox: (url: string | null) => void;
  onConfirm: (row: PaymentRow) => void;
  onReject: (row: PaymentRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const busy = busyId === p.id;
  const refReuse = isRefReuse(p);
  const severity = flagSeverity(p.flags);

  // Auto-expand critical/ref-reuse cards
  const isAutoExpand = refReuse || severity === "critical";

  const effectiveExpanded = expanded || isAutoExpand;

  const cardClass = [
    styles.card,
    busy ? styles.busy : "",
    refReuse ? styles.cardRefReuse : severity === "critical" ? styles.cardCritical : severity === "warning" ? styles.cardWarning : "",
  ].filter(Boolean).join(" ");

  if (!effectiveExpanded) {
    return (
      <article className={cardClass}>
        <button
          type="button"
          className={styles.cardSummary}
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`Expand payment for order ${p.orderNumber}`}
        >
          {/* Thumb */}
          <div className={styles.summaryThumb}>
            {p.proofUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.proofUrl} alt="" className={styles.summaryThumbImg} />
              : <FileImage size={16} className={styles.summaryThumbIcon} />
            }
          </div>

          {/* Order + method */}
          <div className={styles.summaryMain}>
            <span className={styles.summaryOrder}>#{p.orderNumber}</span>
            <span className={styles.summaryMeta}>{METHOD_LABEL[p.method] ?? p.method} · {timeAgo(p.createdAt)}</span>
          </div>

          {/* Customer */}
          <div className={styles.summaryCustomer}>
            <span className={styles.summaryName}>{p.customerName}</span>
            {p.capturedBy && <span className={styles.summaryBy}>by {p.capturedBy}</span>}
          </div>

          {/* Amount */}
          <div className={styles.summaryAmount}>{p.amount.toLocaleString()} <small>ብር</small></div>

          {/* Risk badge */}
          <div className={styles.summaryRisk}>
            {refReuse && <span className={styles.riskBadgeCritical}>🚨 Reuse</span>}
            {!refReuse && (severity as string) === "critical" && <span className={styles.riskBadgeCritical}>⚠ Critical</span>}
            {!refReuse && severity === "warning" && <span className={styles.riskBadgeWarning}>⚠ Warning</span>}
            {severity === "none" && p.checks?.verdict === "green" && <span className={styles.riskBadgeOk}>✓ Clean</span>}
            {p.flags.length > 0 && <span className={styles.summaryFlagCount}>{p.flags.length} flag{p.flags.length > 1 ? "s" : ""}</span>}
          </div>

          {/* Status */}
          {p.status !== "pending" && (
            <span className={`${styles.summaryStatus} ${p.status === "confirmed" ? styles.summaryStatusOk : styles.summaryStatusBad}`}>
              {p.status === "confirmed" ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {p.status}
            </span>
          )}

          <ChevronDown size={15} className={styles.summaryChevron} />
        </button>
      </article>
    );
  }

  return (
    <article className={`${cardClass} ${styles.cardExpanded}`}>
      {/* Collapse handle */}
      {!isAutoExpand && (
        <button type="button" className={styles.collapseHandle} onClick={() => setExpanded(false)} aria-label="Collapse">
          <ChevronUp size={14} /> Collapse
        </button>
      )}

      <div className={styles.cardInner}>
        {/* Proof image */}
        <button type="button" className={styles.proof} onClick={() => p.proofUrl && setLightbox(p.proofUrl)} disabled={!p.proofUrl} aria-label="View receipt">
          {p.proofUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.proofUrl} alt={`Receipt for order ${p.orderNumber}`} />
            : <span className={styles.noProof}><FileImage size={28} /> No image</span>}
          {p.proofUrl && <span className={styles.zoom}><ZoomIn size={14} /> Enlarge</span>}
        </button>

        <div className={styles.body}>
          <div className={styles.top}>
            <div>
              <div className={styles.orderNo}>
                Order #{p.orderNumber}
                {p.source === "pos" && <span className={styles.badgePos}>POS</span>}
                {refReuse && <span className={styles.badgeRefReuse}>🚨 REF REUSE</span>}
              </div>
              <div className={styles.when}>{timeAgo(p.createdAt)} · {METHOD_LABEL[p.method] ?? p.method}{p.capturedBy ? ` · sold by ${p.capturedBy}` : ""}</div>
            </div>
            <div className={styles.amount}>{p.amount.toLocaleString()} <small>ብር</small></div>
          </div>

          {refReuse && <RefReusePanel p={p} />}

          {p.checks && !refReuse && (
            <div className={`${styles.verdict} ${styles[`verdict_${p.checks.verdict}`]}`}>
              {p.checks.verdict === "green" ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
              {VERDICT_TEXT[p.checks.verdict]}
            </div>
          )}

          {p.checks && p.checks.duplicates.filter((d) => d.kind !== "reference").length > 0 && (
            <ul className={styles.dupes}>
              {p.checks.duplicates.filter((d) => d.kind !== "reference").slice(0, 3).map((d, i) => (
                <li key={i}>
                  <strong>{DUP_TEXT[d.kind] ?? d.kind}</strong> on #{d.orderNumber} · {d.amount.toLocaleString()} ብር · {new Date(d.createdAt).toLocaleString()}
                  {d.capturedBy ? ` · sold by ${d.capturedBy}` : d.customerName ? ` · ${d.customerName}` : ""} · {d.status}
                </li>
              ))}
            </ul>
          )}

          {p.flags.length > 0 && (
            <ul className={styles.flags}>
              {p.flags.map((f) => (
                <li key={f} className={[styles.flag, FLAG_SEVERITY[f] === "critical" ? styles.flagCritical : FLAG_SEVERITY[f] === "warning" ? styles.flagWarning : ""].filter(Boolean).join(" ")}>
                  <ShieldAlert size={12} /> {FLAG_LABELS[f] ?? f}
                </li>
              ))}
            </ul>
          )}

          <dl className={styles.facts}>
            {p.receiptAmount !== null && (
              <div>
                <dt><Hash size={13} /> Receipt amount</dt>
                <dd className={styles.mono}>
                  {p.receiptAmount.toLocaleString()} ብር
                  {p.amount - p.receiptAmount > 0.5
                    ? <span className={styles.warn}><ShieldAlert size={12} /> sale is {p.amount.toLocaleString()}</span>
                    : <span className={styles.ok}><CheckCircle2 size={12} /> matches</span>}
                </dd>
              </div>
            )}
            {p.ocrConfidence !== null && <div><dt><FileImage size={13} /> OCR confidence</dt><dd className={styles.mono}>{p.ocrConfidence}%</dd></div>}
            <div><dt><Hash size={13} /> Transaction ID</dt><dd className={styles.mono}>{p.transactionId || "—"}</dd></div>
            <div><dt><User size={13} /> Customer</dt><dd>{p.customerName}</dd></div>
            <div><dt><Phone size={13} /> Phone</dt><dd className={styles.mono}>{p.customerPhone || "—"}</dd></div>
            {p.payerName && (
              <div>
                <dt><User size={13} /> Sender name</dt>
                <dd>{p.payerName}{p.nameMatch === false && <span className={styles.warn}><ShieldAlert size={12} /> differs from customer</span>}{p.nameMatch === true && <span className={styles.ok}><CheckCircle2 size={12} /> matches</span>}</dd>
              </div>
            )}
            {p.referenceNumber && (
              <div>
                <dt><Hash size={13} /> Receipt ref</dt>
                <dd className={styles.mono}>{p.referenceNumber}{p.checks?.manual && <span className={styles.warn}>typed by hand</span>}<CopyRef value={p.referenceNumber} /></dd>
              </div>
            )}
          </dl>

          {p.status === "pending" ? (
            rejectingId === p.id ? (
              <div className={styles.rejectBox}>
                <div className={styles.chips}>
                  {QUICK_REASONS.map((r) => (
                    <button key={r} type="button" className={`${styles.chip} ${reason === r ? styles.chipOn : ""}`} onClick={() => setReason(r)}>{r}</button>
                  ))}
                </div>
                <input className={styles.reasonInput} placeholder="Reason shown to the customer" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                <div className={styles.actions}>
                  <button className={styles.btnDanger} disabled={busy} onClick={() => onReject(p)}>
                    {busy ? <Loader2 size={15} className={styles.spin} /> : <XCircle size={15} />} Reject payment
                  </button>
                  <button className={styles.btnGhost} disabled={busy} onClick={() => { setRejectingId(null); setReason(""); }}><X size={15} /> Cancel</button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <button className={styles.btnOk} disabled={busy} onClick={() => onConfirm(p)} id={`confirm-${p.orderNumber}`}>
                  {busy ? <Loader2 size={15} className={styles.spin} /> : <CheckCircle2 size={15} />} Confirm
                </button>
                <button className={styles.btnGhostDanger} disabled={busy} onClick={() => { setRejectingId(p.id); setReason(""); }} id={`reject-${p.orderNumber}`}>
                  <XCircle size={15} /> Reject
                </button>
              </div>
            )
          ) : (
            <div className={`${styles.result} ${p.status === "confirmed" ? styles.resultOk : styles.resultBad}`}>
              {p.status === "confirmed" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              <span>{p.status === "confirmed" ? "Confirmed" : "Rejected"}{p.reviewedBy ? ` by ${p.reviewedBy.replace(/^admin:/, "")}` : ""}{p.rejectReason ? ` — ${p.rejectReason}` : ""}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Apply filters ─────────────────────────────────────────────────────
function applyFilters(rows: PaymentRow[], f: FilterState): PaymentRow[] {
  const q = f.search.toLowerCase().trim();
  const now = Date.now();
  const timeMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  return rows.filter((p) => {
    if (f.status !== "all" && p.status !== f.status) return false;
    if (f.method !== "all" && p.method !== f.method) return false;
    if (f.flagType !== "all") {
      if (f.flagType === "__has_any" && p.flags.length === 0) return false;
      else if (f.flagType === "__critical" && flagSeverity(p.flags) !== "critical") return false;
      else if (f.flagType === "__ref_reuse" && !isRefReuse(p)) return false;
      else if (f.flagType === "__money_mismatch" && !p.flags.includes("amount_mismatch")) return false;
      else if (!["all", "__has_any", "__critical", "__ref_reuse", "__money_mismatch"].includes(f.flagType) && !p.flags.includes(f.flagType)) return false;
    }
    if (f.timeRange !== "all") { const ms = timeMs[f.timeRange]; if (ms && now - new Date(p.createdAt).getTime() > ms) return false; }
    if (f.amountMin && p.amount < Number(f.amountMin)) return false;
    if (f.amountMax && p.amount > Number(f.amountMax)) return false;
    if (q) {
      const hay = [p.orderNumber, p.customerName, p.customerPhone, p.referenceNumber ?? "", p.payerName ?? "", p.capturedBy ?? ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function applySort(rows: PaymentRow[], key: SortKey, dir: SortDir): PaymentRow[] {
  return [...rows].sort((a, b) => {
    let diff = 0;
    if (key === "time") diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    else if (key === "amount") diff = b.amount - a.amount;
    else if (key === "flags") diff = flagSeverityScore(b.flags) - flagSeverityScore(a.flags);
    return dir === "asc" ? -diff : diff;
  });
}

// ── CSV Export ────────────────────────────────────────────────────────
function exportCsv(rows: PaymentRow[]) {
  const headers = ["Order #", "Status", "Method", "Amount (ብር)", "Customer", "Phone", "Payer Name", "Reference", "Transaction ID", "Receipt Amount", "OCR Confidence", "Flags", "Verdict", "Source", "Captured By", "Reviewed By", "Reject Reason", "Created At", "Reviewed At"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((p) => [
      p.orderNumber, p.status, METHOD_LABEL[p.method] ?? p.method, p.amount,
      p.customerName, p.customerPhone, p.payerName ?? "", p.referenceNumber ?? "",
      p.transactionId, p.receiptAmount ?? "", p.ocrConfidence ?? "",
      p.flags.map((f) => FLAG_LABELS[f] ?? f).join(" | "),
      p.checks?.verdict ?? "", p.source, p.capturedBy ?? "",
      p.reviewedBy?.replace(/^admin:/, "") ?? "", p.rejectReason ?? "",
      new Date(p.createdAt).toLocaleString("en-GB"),
      p.reviewedAt ? new Date(p.reviewedAt).toLocaleString("en-GB") : "",
    ].map(escape).join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ────────────────────────────────────────────────────
export default function PaymentsClient({ payments, setupError }: { payments: PaymentRow[]; setupError?: string }) {
  const [rows, setRows] = useState<PaymentRow[]>(payments);
  const [lastPayments, setLastPayments] = useState(payments);
  if (payments !== lastPayments) { setLastPayments(payments); setRows(payments); }

  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [, startTransition] = useTransition();
  const { success, error } = useToast();

  const pending  = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const reviewed = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);
  const baseList = tab === "pending" ? pending : reviewed;
  const filtered = useMemo(() => applyFilters(baseList, filters), [baseList, filters]);
  const list     = useMemo(() => applySort(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const updateFilter = (f: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...f }));

  const handleSort = useCallback((k: SortKey) => {
    setSortKey((prev) => {
      if (prev === k) setSortDir((d) => d === "desc" ? "asc" : "desc");
      else { setSortDir("desc"); }
      return k;
    });
  }, []);

  const markLocal = (id: string, status: "confirmed" | "rejected", why?: string) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, status, rejectReason: why ?? null, reviewedAt: new Date().toISOString(), reviewedBy: "you" } : r));

  const confirm = (row: PaymentRow) => {
    setBusyId(row.id);
    startTransition(async () => {
      const res = await confirmPaymentAction(row.orderNumber);
      if (res?.error) error("Could not confirm", res.error);
      else { markLocal(row.id, "confirmed"); success("Payment confirmed", row.source === "pos" ? `POS sale #${row.orderNumber} verified.` : `Order #${row.orderNumber} — staff notified to pack.`); }
      setBusyId(null);
    });
  };

  const reject = (row: PaymentRow) => {
    const why = reason.trim() || "Payment not received";
    setBusyId(row.id);
    startTransition(async () => {
      const res = await rejectPaymentAction(row.orderNumber, why);
      if (res?.error) error("Could not reject", res.error);
      else { markLocal(row.id, "rejected", why); success("Payment rejected", row.source === "pos" ? `POS sale #${row.orderNumber} flagged.` : `Order #${row.orderNumber} — customer can upload again.`); setRejectingId(null); setReason(""); }
      setBusyId(null);
    });
  };

  if (setupError) {
    return (
      <div>
        <div className={shared.pageHeader}><div><h1 className={shared.pageTitle}>Payments</h1><p className={shared.pageSubtitle}>Review customer payment proofs</p></div></div>
        <div className={styles.setup}><Database size={28} /><div><h2>Payments database isn&apos;t set up yet</h2><p>Run the <strong>Phase 1 SQL</strong> (<code>phase1_payments.sql</code>) in the Supabase SQL Editor, then refresh.</p><code className={styles.err}>{setupError}</code></div></div>
      </div>
    );
  }

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Payments</h1>
          <p className={shared.pageSubtitle}>{pending.length} waiting for review · {reviewed.length} reviewed</p>
        </div>
        <button type="button" className={styles.analyticsToggle} onClick={() => setShowAnalytics((s) => !s)} id="payments-analytics-toggle">
          {showAnalytics ? <EyeOff size={14} /> : <Eye size={14} />} {showAnalytics ? "Hide" : "Show"} Analytics
        </button>
      </div>

      {showAnalytics && <AnalyticsPanel payments={rows} />}

      {/* Tabs */}
      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "pending"} className={`${styles.tab} ${tab === "pending" ? styles.tabActive : ""}`} onClick={() => setTab("pending")} id="payments-tab-pending">
          <Clock size={14} /> To review {pending.length > 0 && <span className={styles.count}>{pending.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === "reviewed"} className={`${styles.tab} ${tab === "reviewed" ? styles.tabActive : ""}`} onClick={() => setTab("reviewed")} id="payments-tab-reviewed">
          <CheckCircle2 size={14} /> Reviewed
        </button>
      </div>

      {/* Filters + Sort + Export */}
      <FiltersBar filters={filters} onChange={updateFilter} payments={rows} />
      <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} onExport={() => exportCsv(list)} count={list.length} />

      {filtered.length !== baseList.length && (
        <div className={styles.filterSummary}>Showing <strong>{filtered.length}</strong> of {baseList.length} payments</div>
      )}

      {list.length === 0 ? (
        <div className={styles.empty}>
          <CheckCircle2 size={40} />
          <h2>{filters.search || Object.values(filters).some((v) => v !== "all" && v !== "") ? "No matches" : tab === "pending" ? "All caught up" : "Nothing reviewed yet"}</h2>
          <p>{filters.search || Object.values(filters).some((v) => v !== "all" && v !== "") ? "Try different filters." : tab === "pending" ? "New payment proofs will appear here the moment customers upload them." : "Confirmed and rejected payments show up here."}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {list.map((p) => (
            <PaymentCard
              key={p.id}
              p={p}
              busyId={busyId}
              rejectingId={rejectingId}
              reason={reason}
              setReason={setReason}
              setRejectingId={setRejectingId}
              setLightbox={setLightbox}
              onConfirm={confirm}
              onReject={reject}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Close"><X size={22} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Receipt enlarged" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

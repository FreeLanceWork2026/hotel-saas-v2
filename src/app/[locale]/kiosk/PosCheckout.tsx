"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Banknote, Smartphone, Landmark, Camera, Loader2, Copy, Check, ArrowLeft, AlertTriangle, ScanLine, ShieldCheck, BedDouble } from "lucide-react";
import styles from "./PosCheckout.module.css";
import { PAYMENT_METHODS, PAYEE_NAME } from "@/lib/paymentConfig";
import { FLAG_LABELS, MIN_OCR_CONFIDENCE, AMOUNT_TOLERANCE, parseReceipt } from "@/lib/receiptParser";
import { dHash } from "@/lib/imageHash";
import { useFeature, useFeatures } from "@/context/FeaturesContext";
import { listInHouse } from "@/app/[locale]/admin/bookings/folioActions";

export interface PosCartLine {
  productId: string;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
}

type Step = "details" | "method" | "pay" | "success";
type Method = "cash" | "telebirr" | "cbe" | "room";

interface SaleResult {
  orderNumber: string;
  transactionId: string;
  total: number;
  anonymous: boolean;
  needsReview: boolean;
  flags: string[];
  setupWarning: string | null;
  verdict: "green" | "yellow" | "red" | null;
  duplicates: { kind: string; orderNumber: string; amount: number; createdAt: string; capturedBy: string | null; customerName: string | null }[];
}

/** Downscale big phone photos so OCR is fast and uploads stay small. */
async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.85)
    );
  } catch {
    return file; // HEIC etc. — send as-is, server validates
  }
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function PosCheckout({
  lines,
  delivery,
  subtotal,
  deliveryFee,
  total,
  onClose,
  onNewOrder,
}: {
  lines: PosCartLine[];
  delivery: "pickup" | "delivery";
  subtotal: number;
  deliveryFee: number;
  total: number;
  onClose: () => void;
  onNewOrder: () => void;
}) {
  const [step, setStep] = useState<Step>("details");
  const [method, setMethod] = useState<Method>("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // receipt evidence
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("receipt.jpg");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [ocrConf, setOcrConf] = useState<number | null>(null);
  const [ocrFailed, setOcrFailed] = useState(false);
  const ocrOn = useFeature("payment_ocr");
  const features = useFeatures();
  const canChargeRoom = features.booking && features.room_service;
  const [inHouse, setInHouse] = useState<{ bookingId: string; room: string; guest: string }[] | null>(null);
  const [roomBookingId, setRoomBookingId] = useState("");
  const [roomErr, setRoomErr] = useState("");
  const pickRoomMethod = async () => {
    setMethod("room");
    setRoomErr("");
    const res = await listInHouse();
    if (res.ok) setInHouse(res.data ?? []);
    else { setInHouse([]); setRoomErr(res.error); }
  };
  const roomPick = inHouse?.find((g) => g.bookingId === roomBookingId);
  const [reference, setReference] = useState("");
  const [photoHash, setPhotoHash] = useState<string | null>(null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [payerName, setPayerName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SaleResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const isAnonymous = !name.trim() && !phone.trim();
  const detailsOk = delivery === "pickup" || (phone.trim() && address.trim());
  const acct = method === "telebirr" || method === "cbe" ? PAYMENT_METHODS[method] : null;

  const amountNum = receiptAmount.trim() === "" ? null : Number(receiptAmount.replace(/,/g, ""));
  const amountMismatch = amountNum !== null && Number.isFinite(amountNum) && total - amountNum > AMOUNT_TOLERANCE;
  const lowConf = ocrConf !== null && ocrConf < MIN_OCR_CONFIDENCE;

  // ── OCR ────────────────────────────────────────────────────────────
  const runOcr = useCallback(async (blob: Blob) => {
    setOcrBusy(true);
    setOcrPct(0);
    setOcrFailed(false);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setOcrPct(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(blob);
      await worker.terminate();

      setOcrText(data.text);
      setOcrConf(Math.round(data.confidence));
      const parsed = parseReceipt(data.text);
      if (parsed.reference) setReference(parsed.reference);
      if (parsed.amount !== null) setReceiptAmount(String(parsed.amount));
    } catch (e) {
      console.error("OCR failed", e);
      setOcrFailed(true);
      setOcrConf(null);
    } finally {
      setOcrBusy(false);
    }
  }, []);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setPhotoName(file.name || "receipt.jpg");
    const blob = await shrinkImage(file);
    setPhoto(blob);
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    setReference("");
    setReceiptAmount("");
    setOcrText("");
    setPhotoHash(null);
    void dHash(blob).then(setPhotoHash);
    if (ocrOn) void runOcr(blob);
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("items", JSON.stringify(lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))));
      fd.append("delivery", delivery);
      fd.append("address", address);
      fd.append("customerName", name);
      fd.append("customerPhone", phone);
      fd.append("method", method);
      if (method === "room") fd.append("bookingId", roomBookingId);
      if (method === "telebirr" || method === "cbe") {
        if (photo) fd.append("file", new File([photo], photoName.replace(/\.\w+$/, "") + ".jpg", { type: photo.type || "image/jpeg" }));
        fd.append("reference", reference);
        fd.append("receiptAmount", receiptAmount);
        fd.append("ocrText", ocrText);
        if (ocrConf !== null) fd.append("ocrConfidence", String(ocrConf));
        if (photo && photoHash) fd.append("proofPhash", photoHash);
        fd.append("payerName", payerName);
      }
      const res = await fetch("/api/pos/sale", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not complete the sale.");
      } else {
        setResult(data as SaleResult);
        setStep("success");
      }
    } catch {
      setError("Network problem — the sale was NOT recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && step !== "success" && !busy && onClose()}>
      <div className={styles.sheet}>
        {/* ── header ── */}
        <div className={styles.head}>
          {step !== "details" && step !== "success" ? (
            <button className={styles.back} onClick={() => setStep(step === "pay" ? "method" : "details")} disabled={busy}>
              <ArrowLeft size={16} />
            </button>
          ) : <span />}
          <div className={styles.title}>
            {step === "details" && "Customer"}
            {step === "method" && "How is the customer paying?"}
            {step === "pay" && (method === "cbe" ? "CBE payment" : "Telebirr payment")}
            {step === "success" && "Sale complete"}
          </div>
          <div className={styles.totalPill}>{total.toLocaleString()} ብር</div>
        </div>

        {/* ── 1. details ── */}
        {step === "details" && (
          <div className={styles.body}>
            <p className={styles.hint}>
              {delivery === "pickup"
                ? "Optional for walk-in sales. Leave both empty to record an anonymous sale."
                : "Delivery needs a phone number and an address."}
            </p>
            <label className={styles.label}>Full name</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Abebe Kebede" autoFocus />
            <label className={styles.label}>Phone {delivery === "delivery" && "*"}</label>
            <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0911234567" inputMode="tel" />
            {delivery === "delivery" && (
              <>
                <label className={styles.label}>Delivery address *</label>
                <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Bole, near Edna Mall" />
              </>
            )}
            {isAnonymous && delivery === "pickup" && (
              <div className={styles.note}><ShieldCheck size={14} /> Anonymous sale — the admin gets a quiet notification.</div>
            )}

            <div className={styles.summary}>
              {lines.map((l) => (
                <div key={l.productId} className={styles.sumRow}>
                  <span>{l.quantity}× {l.name}{l.size ? ` (${l.size})` : ""}</span>
                  <span>{(l.price * l.quantity).toLocaleString()} ብር</span>
                </div>
              ))}
              {deliveryFee > 0 && <div className={styles.sumRow}><span>Delivery</span><span>{deliveryFee} ብር</span></div>}
            </div>

            <div className={styles.actions}>
              <button className={styles.ghost} onClick={onClose}>Cancel</button>
              <button className={styles.primary} disabled={!detailsOk} onClick={() => setStep("method")}>Continue</button>
            </div>
          </div>
        )}

        {/* ── 2. method ── */}
        {step === "method" && (
          <div className={styles.body}>
            <div className={styles.methods}>
              {([
                ["cash", "Cash", Banknote],
                ["telebirr", "Telebirr", Smartphone],
                ["cbe", "CBE", Landmark],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={`${styles.method} ${method === id ? styles.methodOn : ""}`}
                  onClick={() => setMethod(id)}
                >
                  <Icon size={26} />
                  <span>{label}</span>
                </button>
              ))}
              {canChargeRoom && (
                <button className={`${styles.method} ${method === "room" ? styles.methodOn : ""}`} onClick={() => void pickRoomMethod()}>
                  <BedDouble size={26} />
                  <span>Room</span>
                </button>
              )}
            </div>

            {method === "room" ? (
              <div className={styles.cashBox}>
                <div className={styles.cashLabel}>Add to the guest&apos;s room bill (paid at check-out)</div>
                {inHouse === null ? (
                  <Loader2 size={18} className={styles.spin} />
                ) : inHouse.length === 0 ? (
                  <p className={styles.hint}>{roomErr || "No guests are checked in right now."}</p>
                ) : (
                  <select className={styles.input} value={roomBookingId} onChange={(e) => setRoomBookingId(e.target.value)}>
                    <option value="">Choose room / guest…</option>
                    {inHouse.map((g) => <option key={g.bookingId} value={g.bookingId}>Room {g.room} — {g.guest}</option>)}
                  </select>
                )}
                <div className={styles.cashAmt}>{total.toLocaleString()} <small>ብር</small></div>
              </div>
            ) : method === "cash" ? (
              <div className={styles.cashBox}>
                <div className={styles.cashLabel}>Collect from customer</div>
                <div className={styles.cashAmt}>{total.toLocaleString()} <small>ብር</small></div>
              </div>
            ) : (
              <p className={styles.hint}>Next you&apos;ll show the customer where to send the money, then photograph their payment confirmation.</p>
            )}

            {error && <div className={styles.error}><AlertTriangle size={14} /> {error}</div>}

            <div className={styles.actions}>
              <button className={styles.ghost} onClick={() => setStep("details")} disabled={busy}>Back</button>
              {method === "room" ? (
                <button className={styles.primary} onClick={submit} disabled={busy || !roomPick}>
                  {busy ? <Loader2 size={16} className={styles.spin} /> : roomPick ? `✓ Charge to room ${roomPick.room}` : "Choose a room"}
                </button>
              ) : method === "cash" ? (
                <button className={styles.primary} onClick={submit} disabled={busy}>
                  {busy ? <Loader2 size={16} className={styles.spin} /> : "✓ Cash received — complete sale"}
                </button>
              ) : (
                <button className={styles.primary} onClick={() => setStep("pay")}>Continue</button>
              )}
            </div>
          </div>
        )}

        {/* ── 3. digital payment + receipt capture ── */}
        {step === "pay" && acct && (
          <div className={styles.body}>
            <div className={styles.payGrid}>
              <div className={styles.payCard} style={{ borderColor: acct.accent }}>
                <div className={styles.cashLabel}>Customer sends exactly</div>
                <div className={styles.cashAmt}>{total.toLocaleString()} <small>ብር</small></div>
                <div className={styles.acctLabel}>{acct.accountLabel}</div>
                <div className={styles.acctRow}>
                  <span className={styles.acct}>{acct.account}</span>
                  <CopyBtn value={acct.account} />
                </div>
                <div className={styles.payee}>{PAYEE_NAME}</div>
                {acct.qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={acct.qr} alt={`${acct.label} QR`} className={styles.qr} />
                )}
                <p className={styles.tiny}>Personal account — the QR doesn&apos;t include the amount, so the customer types it.</p>
              </div>

              <div className={styles.capture}>
                <div className={styles.cashLabel}>Customer&apos;s payment confirmation</div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }}
                />

                {photoUrl ? (
                  <div className={styles.preview}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt="Receipt preview" />
                    {ocrBusy && (
                      <div className={styles.scan}>
                        <ScanLine size={18} /> Reading receipt… {ocrPct}%
                      </div>
                    )}
                  </div>
                ) : (
                  <button className={styles.camera} onClick={() => fileRef.current?.click()}>
                    <Camera size={28} />
                    <span>Take photo of the customer&apos;s screen</span>
                  </button>
                )}
                {photoUrl && !ocrBusy && (
                  <button className={styles.ghostSm} onClick={() => fileRef.current?.click()}>Retake photo</button>
                )}

                {!ocrBusy && (
                  <div className={styles.fields}>
                    {ocrFailed && <div className={styles.warn}><AlertTriangle size={14} /> Couldn&apos;t read the photo automatically — type the details from the receipt.</div>}
                    {!ocrFailed && lowConf && <div className={styles.warn}><AlertTriangle size={14} /> Low confidence ({ocrConf}%) — double-check the values below.</div>}
                    {!ocrFailed && ocrConf !== null && !lowConf && <div className={styles.okLine}><Check size={14} /> Read automatically ({ocrConf}% confidence) — verify against the photo.</div>}

                    <label className={styles.label}>Transaction reference</label>
                    <input className={styles.input} value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="e.g. FT26278YHRLD / DJ56FIAEH2" />

                    <label className={styles.label}>Amount on the receipt (ETB)</label>
                    <input className={`${styles.input} ${amountMismatch ? styles.inputBad : ""}`} value={receiptAmount} onChange={(e) => setReceiptAmount(e.target.value)} placeholder={String(total)} inputMode="decimal" />
                    {amountMismatch && (
                      <div className={styles.warn}><AlertTriangle size={14} /> Receipt shows {amountNum?.toLocaleString()} ብር but the sale is {total.toLocaleString()} ብር. You can still finish — the admin will be alerted.</div>
                    )}

                    <label className={styles.label}>Sender name (optional)</label>
                    <input className={styles.input} value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Name shown on the receipt" />
                  </div>
                )}
              </div>
            </div>

            {error && <div className={styles.error}><AlertTriangle size={14} /> {error}</div>}

            <div className={styles.actions}>
              <button className={styles.ghost} onClick={() => setStep("method")} disabled={busy}>Back</button>
              <button
                className={styles.primary}
                onClick={submit}
                disabled={busy || ocrBusy || !photo || !reference.trim()}
              >
                {busy ? <Loader2 size={16} className={styles.spin} /> : "✓ Complete sale"}
              </button>
            </div>
            {!ocrBusy && !reference.trim() && (
              <div className={styles.warn}><AlertTriangle size={14} /> Type the transaction reference from the receipt to continue.</div>
            )}
            {!photo && (
              <button className={styles.linkWarn} onClick={submit} disabled={busy || !reference.trim()}>
                Can&apos;t capture a photo? Complete anyway (admin will be alerted)
              </button>
            )}
          </div>
        )}

        {/* ── 4. success ── */}
        {step === "success" && result && (
          <div className={`${styles.body} ${styles.successBody}`}>
            <div className={styles.tick}>{result.needsReview ? "⚠️" : "🎉"}</div>
            <div className={styles.bigTitle}>{result.needsReview ? "Sale recorded — flagged for review" : "Sale complete"}</div>
            <div className={styles.orderNo}>#{result.orderNumber}</div>
            <div className={styles.cashLabel}>{result.total.toLocaleString()} ብር · {method === "cash" ? "Cash" : method === "room" ? `Room ${roomPick?.room ?? ""} bill` : PAYMENT_METHODS[method].label}</div>
            <div className={styles.txn}>Ref {result.transactionId}</div>

            {result.verdict === "red" && result.duplicates.length > 0 && (
              <div className={styles.error}>
                <AlertTriangle size={14} />
                <div>
                  <strong>This receipt was used before.</strong> Ask the customer to show the payment in their Telebirr/CBE app.
                  <ul>
                    {result.duplicates.slice(0, 3).map((d, i) => (
                      <li key={i}>
                        #{d.orderNumber} · {d.amount.toLocaleString()} ብር · {new Date(d.createdAt).toLocaleString()}
                        {d.capturedBy ? ` · by ${d.capturedBy}` : d.customerName ? ` · ${d.customerName}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {result.needsReview && (
              <div className={styles.warnBox}>
                <strong>The admin will double-check this payment:</strong>
                <ul>{result.flags.map((f) => <li key={f}>{FLAG_LABELS[f] ?? f}</li>)}</ul>
                <span>You can hand over the goods.</span>
              </div>
            )}
            {result.anonymous && <div className={styles.note}><ShieldCheck size={14} /> Recorded as an anonymous sale.</div>}
            {result.setupWarning && <div className={styles.note}>{result.setupWarning}</div>}

            <button className={styles.primary} onClick={onNewOrder}>＋ New order</button>
          </div>
        )}
      </div>
    </div>
  );
}

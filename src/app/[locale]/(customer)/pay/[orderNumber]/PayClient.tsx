"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Copy, Check, UploadCloud, Loader2, ShieldCheck, Clock, PartyPopper,
  AlertTriangle, MapPin, ImageIcon, X, ScanSearch,
} from "lucide-react";
import {
  PAYMENT_METHODS, PAYEE_NAME, MAX_PROOF_BYTES, type PaymentMethodId,
} from "@/lib/paymentConfig";
import { parseReceipt } from "@/lib/receiptParser";
import { dHash } from "@/lib/imageHash";
import { useFeature } from "@/context/FeaturesContext";
import { useToast } from "@/components/ui/Toast";
import LiveRefresh from "@/components/ui/LiveRefresh";
import styles from "./Pay.module.css";

export interface PayOrder {
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  reference: string;
  hasTransactionId: boolean;
  paymentMethod: PaymentMethodId;
  rejectionNote: string | null;
  deliveryType: string;
  items: { name: string; size: string; quantity: number; price: number }[];
}

const T = {
  en: {
    title: "Complete your payment",
    sub: "Send the exact amount, then upload a screenshot of your receipt.",
    order: "Order",
    amount: "Amount to pay",
    reference: "Payment reference",
    referenceHint: "Put this in the payment remark / reason so we can match it.",
    copy: "Copy",
    copied: "Copied",
    choose: "Choose how you'll pay",
    stepsTitle: "How to pay",
    verify: "Check that the account name shows",
    verifyEnd: "before you confirm.",
    qrHint: "Scan with CBE Birr / Mobile Banking. The QR doesn't fill in the amount — type it yourself.",
    uploadTitle: "Upload your receipt",
    uploadHelp: "A clear screenshot showing the amount, sender and transaction ID.",
    drop: "Tap to choose a screenshot",
    dropSub: "JPG, PNG or WebP · max 8 MB",
    refLabel: "Receipt / transaction number",
    refPlaceholder: "e.g. FT26278YHRLD or DJ56FIAEH2",
    needRef: "Please enter the transaction number from your receipt.",
    nameLabel: "Name on the sending account (optional)",
    namePlaceholder: "Name shown on your receipt",
    submit: "Submit payment proof",
    submitting: "Uploading…",
    needFile: "Please attach your receipt screenshot first.",
    tooBig: "That image is larger than 8 MB.",
    badType: "Please choose an image file.",
    failed: "Upload failed",
    reviewTitle: "Payment under review",
    reviewText: "Thanks! We received your receipt and are checking it now. This usually takes a few minutes during opening hours.",
    reuploadTitle: "Wrong screenshot?",
    reupload: "Upload a different receipt",
    confirmedTitle: "Payment confirmed!",
    confirmedText: "Thank you — your order is confirmed and we're getting it ready.",
    rejectedTitle: "We couldn't find your payment",
    rejectedText: "Please check the details below and upload a clear receipt.",
    cancelledTitle: "This order was cancelled",
    cancelledText: "Contact us if you think this is a mistake.",
    track: "Track my order",
    summary: "Order summary",
    delivery: "Delivery",
    free: "Free",
    total: "Total",
    stepPay: "Pay",
    stepProof: "Upload proof",
    stepDone: "Confirmed",
    secure: "Your receipt is stored privately and only used to verify this payment.",
    currency: "ETB",
    pickup: "Store pickup",
    home: "Home delivery",
  },
  am: {
    title: "ክፍያዎን ያጠናቅቁ",
    sub: "ትክክለኛውን መጠን ይላኩ፣ ከዚያ የደረሰኝ ፎቶ (screenshot) ይጫኑ።",
    order: "ትዕዛዝ",
    amount: "የሚከፈል መጠን",
    reference: "የክፍያ ማጣቀሻ",
    referenceHint: "ክፍያውን ስንመሳስል እንዲረዳን ይህንን በክፍያ ማስታወሻ ውስጥ ያስገቡ።",
    copy: "ቅዳ",
    copied: "ተቀድቷል",
    choose: "እንዴት እንደሚከፍሉ ይምረጡ",
    stepsTitle: "እንዴት እንደሚከፍሉ",
    verify: "ከማረጋገጥዎ በፊት የሂሳቡ ስም",
    verifyEnd: "መሆኑን ያረጋግጡ።",
    qrHint: "በCBE Birr / Mobile Banking ይቃኙ። QR መጠኑን አይሞላም — እራስዎ ያስገቡ።",
    uploadTitle: "ደረሰኝዎን ይጫኑ",
    uploadHelp: "መጠን፣ ላኪ እና የግብይት ቁጥር የሚታይበት ግልጽ ፎቶ።",
    drop: "ፎቶ ለመምረጥ ይንኩ",
    dropSub: "JPG፣ PNG ወይም WebP · ከፍተኛ 8 ሜባ",
    refLabel: "የደረሰኝ / ግብይት ቁጥር",
    refPlaceholder: "ለምሳሌ FT26278YHRLD ወይም DJ56FIAEH2",
    needRef: "እባክዎ ከደረሰኙ ላይ ያለውን የግብይት ቁጥር ያስገቡ።",
    nameLabel: "የላኪ ሂሳብ ስም (አማራጭ)",
    namePlaceholder: "በደረሰኝዎ ላይ የሚታየው ስም",
    submit: "የክፍያ ማስረጃ አስገባ",
    submitting: "በመጫን ላይ…",
    needFile: "እባክዎ መጀመሪያ የደረሰኝ ፎቶ ያያይዙ።",
    tooBig: "ምስሉ ከ8 ሜባ በላይ ነው።",
    badType: "እባክዎ የምስል ፋይል ይምረጡ።",
    failed: "መጫን አልተሳካም",
    reviewTitle: "ክፍያዎ በመረጋገጥ ላይ ነው",
    reviewText: "እናመሰግናለን! ደረሰኝዎን ተቀብለናል፣ አሁን እየፈተሽነው ነው። በስራ ሰዓት ጥቂት ደቂቃዎች ይወስዳል።",
    reuploadTitle: "ሌላ ፎቶ ነበር የሚፈለገው?",
    reupload: "ሌላ ደረሰኝ ይጫኑ",
    confirmedTitle: "ክፍያ ተረጋግጧል!",
    confirmedText: "እናመሰግናለን — ትዕዛዝዎ ተረጋግጧል፣ እያዘጋጀነው ነው።",
    rejectedTitle: "ክፍያዎን ማግኘት አልቻልንም",
    rejectedText: "እባክዎ ዝርዝሩን ያረጋግጡ እና ግልጽ ደረሰኝ ይጫኑ።",
    cancelledTitle: "ይህ ትዕዛዝ ተሰርዟል",
    cancelledText: "ስህተት ነው ብለው ካሰቡ ያግኙን።",
    track: "ትዕዛዜን ተከታተል",
    summary: "የትዕዛዝ ማጠቃለያ",
    delivery: "ማድረሻ",
    free: "ነፃ",
    total: "ጠቅላላ",
    stepPay: "ክፍያ",
    stepProof: "ማስረጃ",
    stepDone: "ተረጋግጧል",
    secure: "ደረሰኝዎ በግል ተቀምጦ ይህን ክፍያ ለማረጋገጥ ብቻ ይጠቅማል።",
    currency: "ብር",
    pickup: "በሱቅ መውሰድ",
    home: "ወደ ቤት ማድረስ",
  },
} as const;

function CopyButton({ value, label, doneLabel }: { value: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button type="button" className={`${styles.copyBtn} ${done ? styles.copied : ""}`} onClick={copy}>
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? doneLabel : label}
    </button>
  );
}

export default function PayClient({ order, locale }: { order: PayOrder; locale: "en" | "am" }) {
  const t = T[locale];
  const { error: toastError, success: toastSuccess } = useToast();

  const [method, setMethod] = useState<PaymentMethodId>(order.paymentMethod);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [refNo, setRefNo] = useState("");
  const [payer, setPayer] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [showUploader, setShowUploader] = useState(order.status === "payment_pending");
  const [ocrState, setOcrState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const ocrOn = useFeature("payment_ocr");
  const [ocrText, setOcrText] = useState("");
  const [ocrConf, setOcrConf] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const m = PAYMENT_METHODS[method];
  const amountText = `${order.total.toLocaleString()} ${t.currency}`;

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // The page is kept live by <LiveRefresh/>: when the server-side status changes
  // (admin/Telegram confirms or rejects) the new props flow in — mirror them here.
  const [lastSeen, setLastSeen] = useState({ status: order.status, note: order.rejectionNote });
  if (lastSeen.status !== order.status || lastSeen.note !== order.rejectionNote) {
    setLastSeen({ status: order.status, note: order.rejectionNote });
    setStatus(order.status);
    setShowUploader(order.status === "payment_pending");
  }

  const runOcr = useCallback(async (f: File) => {
    setOcrState("running");
    try {
      const { createWorker } = await import("tesseract.js");
      // v7: createWorker(langs, oem, options) — default CDN works in browser
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(f);
      await worker.terminate();
      const text = data.text ?? "";
      const conf  = data.confidence ?? 0;
      setOcrText(text);
      setOcrConf(conf);
      const parsed = parseReceipt(text);
      // Only pre-fill if the customer hasn't typed anything yet
      const found = parsed?.reference;
      if (found) setRefNo((current) => current || found);
      setOcrState("done");
    } catch (err) {
      console.warn("[OCR]", err);
      setOcrState("failed");
    }
  }, []);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toastError(t.failed, t.badType); return; }
    if (f.size > MAX_PROOF_BYTES) { toastError(t.failed, t.tooBig); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setOcrState("idle");
    setOcrText("");
    setOcrConf(null);
    if (ocrOn) void runOcr(f);
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file) { toastError(t.failed, t.needFile); return; }
    if (!refNo.trim()) { toastError(t.failed, t.needRef); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("orderNumber", order.orderNumber);
      fd.append("method", method);
      fd.append("file", file);
      if (refNo.trim()) fd.append("referenceNumber", refNo.trim());
      if (payer.trim()) fd.append("payerName", payer.trim());
      if (ocrText) fd.append("ocrText", ocrText);
      if (ocrConf !== null) fd.append("ocrConfidence", String(ocrConf));
      const phash = await dHash(file);
      if (phash) fd.append("proofPhash", phash);

      const res = await fetch("/api/payments/proof", { method: "POST", body: fd });
      const data = await res.json();

      if (data.success) {
        setStatus("payment_review");
        setShowUploader(false);
        clearFile();
        toastSuccess(t.reviewTitle, t.reviewText);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toastError(t.failed, data.error ?? "");
      }
    } catch {
      toastError(t.failed, "Network error");
    } finally {
      setLoading(false);
    }
  };

  const isPaid = ["confirmed", "preparing", "packing", "on_route", "ready_for_pickup", "delivered"].includes(status);
  const isCancelled = status === "cancelled";
  const isReview = status === "payment_review";
  const rejected = status === "payment_pending" && Boolean(order.rejectionNote);
  const step = isPaid ? 3 : isReview ? 2 : 1;

  const steps = method === "telebirr"
    ? locale === "am"
      ? [
          "የቴሌብር መተግበሪያውን ይክፈቱ → «ገንዘብ ላክ» ይምረጡ።",
          `ቁጥር ${m.account} ያስገቡ (${PAYEE_NAME})።`,
          `መጠን፦ ${amountText}`,
          `በ«ምክንያት / ማስታወሻ» ውስጥ ይህንን ይጻፉ፦ ${order.reference}`,
          "ይላኩ፣ ከዚያ የደረሰኙን ፎቶ (screenshot) ያንሱ።",
        ]
      : [
          "Open the Telebirr app → tap Send Money.",
          `Enter the number ${m.account} (${PAYEE_NAME}).`,
          `Amount: ${amountText}`,
          `In the Reason / Remark box type: ${order.reference}`,
          "Send, then take a screenshot of the receipt.",
        ]
    : locale === "am"
      ? [
          "CBE Birr ወይም Mobile Banking ይክፈቱ እና QR ይቃኙ (ወይም ወደ ሂሳብ ቁጥር ያስተላልፉ)።",
          `መጠን ያስገቡ፦ ${amountText}`,
          `በ«ምክንያት» ውስጥ ይህንን ይጻፉ፦ ${order.reference}`,
          "ዝውውሩን ያረጋግጡ፣ ከዚያ የደረሰኙን ፎቶ ያንሱ።",
        ]
      : [
          "Open CBE Birr / Mobile Banking and scan the QR (or transfer to the account number).",
          `Enter the amount: ${amountText}`,
          `In the Reason box type: ${order.reference}`,
          "Confirm the transfer, then screenshot the receipt.",
        ];

  return (
    <div className={`container ${styles.page}`}>
      {/* Auto-refresh while the payment is still moving; paused during upload */}
      <LiveRefresh intervalMs={4000} enabled={!loading && !isPaid && !isCancelled} tables={["orders"]} />

      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.sub}>{t.sub}</p>
        <div className={styles.orderChip}>
          {t.order} <strong>#{order.orderNumber}</strong>
        </div>
      </header>

      {/* Progress */}
      <ol className={styles.steps} aria-label="progress">
        {[t.stepPay, t.stepProof, t.stepDone].map((label, i) => (
          <li
            key={label}
            className={`${styles.stepItem} ${step > i + 1 ? styles.stepDone : ""} ${step === i + 1 ? styles.stepActive : ""}`}
          >
            <span className={styles.stepDot}>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        ))}
      </ol>

      {/* State banners */}
      {isPaid && (
        <section className={`${styles.banner} ${styles.bannerOk}`}>
          <PartyPopper size={28} />
          <div>
            <h2>{t.confirmedTitle}</h2>
            <p>{t.confirmedText}</p>
          </div>
        </section>
      )}
      {isCancelled && (
        <section className={`${styles.banner} ${styles.bannerBad}`}>
          <AlertTriangle size={28} />
          <div>
            <h2>{t.cancelledTitle}</h2>
            <p>{t.cancelledText}</p>
          </div>
        </section>
      )}
      {isReview && (
        <section className={`${styles.banner} ${styles.bannerWait}`}>
          <Clock size={28} />
          <div>
            <h2>{t.reviewTitle}</h2>
            <p>{t.reviewText}</p>
          </div>
        </section>
      )}
      {rejected && (
        <section className={`${styles.banner} ${styles.bannerBad}`}>
          <AlertTriangle size={28} />
          <div>
            <h2>{t.rejectedTitle}</h2>
            <p>{order.rejectionNote || t.rejectedText}</p>
          </div>
        </section>
      )}

      <div className={styles.layout}>
        {/* ── Left: how to pay + upload ── */}
        <div className={styles.main}>
          {/* Key facts */}
          <section className={styles.facts}>
            <div className={styles.factCard}>
              <span className={styles.factLabel}>{t.amount}</span>
              <span className={styles.factValue}>{amountText}</span>
              <CopyButton value={String(order.total)} label={t.copy} doneLabel={t.copied} />
            </div>
            <div className={`${styles.factCard} ${styles.factRef}`}>
              <span className={styles.factLabel}>{t.reference}</span>
              <span className={`${styles.factValue} ${styles.mono}`}>{order.reference}</span>
              <CopyButton value={order.reference} label={t.copy} doneLabel={t.copied} />
              <span className={styles.factHint}>{t.referenceHint}</span>
            </div>
          </section>

          {!isPaid && !isCancelled && (
            <>
              {/* Method picker */}
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t.choose}</h2>
                <div className={styles.methods}>
                  {(Object.keys(PAYMENT_METHODS) as PaymentMethodId[]).map((id) => {
                    const pm = PAYMENT_METHODS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        id={`pay-method-${id}`}
                        className={`${styles.method} ${method === id ? styles.methodActive : ""}`}
                        style={{ ["--accent" as string]: pm.accent }}
                        onClick={() => setMethod(id)}
                      >
                        <span className={styles.methodDot} />
                        <span className={styles.methodName}>{locale === "am" ? pm.labelAm : pm.label}</span>
                        {method === id && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.accountBox} style={{ ["--accent" as string]: m.accent }}>
                  <div>
                    <span className={styles.factLabel}>{locale === "am" ? m.accountLabelAm : m.accountLabel}</span>
                    <div className={`${styles.accountNumber} ${styles.mono}`}>{m.account}</div>
                    <div className={styles.accountName}>{PAYEE_NAME}</div>
                  </div>
                  <CopyButton value={m.account} label={t.copy} doneLabel={t.copied} />
                </div>

                {m.qr && (
                  <div className={styles.qrWrap}>
                    <Image
                      src={m.qr}
                      alt={`${m.label} QR`}
                      width={497}
                      height={690}
                      className={styles.qr}
                      priority
                    />
                    <p className={styles.qrHint}>{t.qrHint}</p>
                  </div>
                )}

                <h3 className={styles.stepsTitle}>{t.stepsTitle}</h3>
                <ol className={styles.howto}>
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <p className={styles.verify}>
                  <ShieldCheck size={16} /> {t.verify} <strong>{PAYEE_NAME}</strong> {t.verifyEnd}
                </p>
              </section>

              {/* Upload */}
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t.uploadTitle}</h2>

                {!showUploader ? (
                  <div className={styles.reupload}>
                    <p>{t.reuploadTitle}</p>
                    <button type="button" className={styles.ghostBtn} onClick={() => setShowUploader(true)}>
                      <UploadCloud size={16} /> {t.reupload}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={styles.help}>{t.uploadHelp}</p>

                    {preview ? (
                      <div className={styles.preview}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt="Receipt preview" />
                        <button type="button" className={styles.removeBtn} onClick={clearFile} aria-label="Remove">
                          <X size={16} />
                        </button>
                        <span className={styles.fileName}><ImageIcon size={14} /> {file?.name}</span>
                      </div>
                    ) : (
                      <label
                        className={styles.drop}
                        htmlFor="proof-file"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
                      >
                        <UploadCloud size={30} />
                        <strong>{t.drop}</strong>
                        <span>{t.dropSub}</span>
                      </label>
                    )}
                    <input
                      ref={inputRef}
                      id="proof-file"
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => pickFile(e.target.files?.[0])}
                    />

                    <div className={styles.fields}>
                      {/* OCR status banner */}
                      {ocrState === "running" && (
                        <div className={styles.ocrBanner}>
                          <Loader2 size={14} className={styles.spin} />
                          Reading your receipt…
                        </div>
                      )}
                      {ocrState === "done" && (
                        <div className={`${styles.ocrBanner} ${styles.ocrDone}`}>
                          <ScanSearch size={14} />
                          Receipt scanned{refNo ? ` — reference pre-filled${ocrConf !== null && ocrConf < 70 ? " (low confidence — please verify)" : ""}` : " — enter reference manually below"}
                        </div>
                      )}
                      {ocrState === "failed" && (
                        <div className={`${styles.ocrBanner} ${styles.ocrFail}`}>
                          <AlertTriangle size={14} />
                          Could not read receipt automatically — please fill in below.
                        </div>
                      )}

                      <label className={styles.field}>
                        <span>{t.refLabel}</span>
                        <input
                          value={refNo}
                          onChange={(e) => setRefNo(e.target.value)}
                          placeholder={t.refPlaceholder}
                          maxLength={60}
                          autoComplete="off"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>{t.nameLabel}</span>
                        <input
                          value={payer}
                          onChange={(e) => setPayer(e.target.value)}
                          placeholder={t.namePlaceholder}
                          maxLength={80}
                          autoComplete="off"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      id="submit-proof"
                      className={styles.submit}
                      onClick={submit}
                      disabled={loading || !file || !refNo.trim()}
                    >
                      {loading ? (
                        <><Loader2 size={18} className={styles.spin} /> {t.submitting}</>
                      ) : (
                        <><UploadCloud size={18} /> {t.submit}</>
                      )}
                    </button>
                    <p className={styles.secure}><ShieldCheck size={14} /> {t.secure}</p>
                  </>
                )}
              </section>
            </>
          )}
        </div>

        {/* ── Right: summary ── */}
        <aside className={styles.aside}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t.summary}</h2>
            <ul className={styles.items}>
              {order.items.map((i, idx) => (
                <li key={idx}>
                  <span>
                    {i.quantity}× {i.name} {i.size && <em>({i.size})</em>}
                  </span>
                  <span>{(i.price * i.quantity).toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <div className={styles.sumRow}>
              <span>{t.delivery} · {order.deliveryType === "delivery" ? t.home : t.pickup}</span>
              <span>{order.deliveryFee > 0 ? order.deliveryFee.toLocaleString() : t.free}</span>
            </div>
            <div className={`${styles.sumRow} ${styles.sumTotal}`}>
              <span>{t.total}</span>
              <span>{amountText}</span>
            </div>
          </section>

          <Link href={`/track/${order.orderNumber}`} className={styles.trackBtn} id="pay-track-order">
            <MapPin size={16} /> {t.track}
          </Link>
        </aside>
      </div>
    </div>
  );
}

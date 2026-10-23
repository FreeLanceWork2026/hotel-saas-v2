"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Trash2, Plus, Minus, ShoppingBag, ArrowLeft,
  CheckCircle, MapPin, Send, Loader2, Package, XCircle, X,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import styles from "./CartPage.module.css";

type DeliveryType = "pickup" | "delivery";

export default function CartPage() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const router = useRouter();
  const { items, total, count, removeItem, updateQty, clearCart } = useCart();
  const { error, warning } = useToast();

  const [name, setName]               = useState("");
  const [phone, setPhone]             = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [address, setAddress]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [successOrder, setSuccessOrder] = useState<{ id: string; number: string } | null>(null);
  const [errorBanner, setErrorBanner]  = useState<{ title: string; message: string } | null>(null);

  const deliveryFee = deliveryType === "delivery" ? (total >= 500 ? 0 : 50) : 0;
  const orderTotal  = total + deliveryFee;

  // ── Empty cart ─────────────────────────────────────────────
  if (items.length === 0 && !successOrder) {
    return (
      <div style={{ paddingTop: "var(--nav-height)" }}>
        <div className={`container ${styles.emptyWrap}`}>
          <div className={styles.emptyState}>
            <ShoppingBag size={64} className={styles.emptyIcon} />
            <h1 className="display-md">{t("title")}</h1>
            <p className="text-lg text-muted">{t("empty")}</p>
            <p className="text-muted">{t("emptySubtitle")}</p>
            <Link href="/shop" className="btn btn-primary btn-lg" style={{ marginTop: "var(--space-lg)" }}>
              {locale === "am" ? "ወደ ሱቅ ሂድ" : "Browse Products"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Order success screen ───────────────────────────────────
  if (successOrder) {
    return (
      <div style={{ paddingTop: "var(--nav-height)" }}>
        <div className={`container ${styles.emptyWrap}`}>
          <div className={styles.successCard}>
            {/* Animated checkmark */}
            <div className={styles.successIconWrap}>
              <div className={styles.successRing} />
              <CheckCircle size={48} className={styles.successIcon} />
            </div>

            <div className={styles.successBadge}>
              {locale === "am" ? "✦ ትዕዛዝ ደርሷል" : "✦ Order Received"}
            </div>

            <h1 className={`display-md ${styles.successTitle}`}>
              {locale === "am" ? "ምስጋና ይቅበሉ!" : "Thank You!"}
            </h1>
            <p className="text-lg text-muted">
              {locale === "am"
                ? "ትዕዛዝዎ ደርሷል። ቡድናችን ብዙ ሳይቆይ ያናግርዎታል።"
                : "Your order has been received. Our team will contact you shortly."}
            </p>

            {/* Order ID chip */}
            <div className={styles.orderChip}>
              <Package size={15} />
              <span className={styles.orderChipLabel}>
                {locale === "am" ? "የትዕዛዝ ቁጥር:" : "Order #"}
              </span>
              <span className={styles.orderChipId}>{successOrder.number}</span>
            </div>

            {/* Payment instruction */}
            <div className={styles.paymentNote}>
              <div className={styles.paymentNoteIcon}>💳</div>
              <p>
                {locale === "am"
                  ? "ክፍያዎን ለማጠናቀቅ ወደ ክፍያ ገጽ በመሄድ ላይ ነዎት…"
                  : "Taking you to the payment page to finish your order…"}
              </p>
            </div>
            <Link href={`/pay/${successOrder.number}`} className="btn btn-primary btn-lg" style={{ marginBottom: "var(--space-md)" }}>
              {locale === "am" ? "አሁን ይክፈሉ →" : "Pay now →"}
            </Link>

            {/* Actions */}
            <div className={styles.successActions}>
              <Link href={`/track/${successOrder.number}`} className="btn btn-primary btn-lg">
                <MapPin size={16} />
                {locale === "am" ? "ትዕዛዝ ይከታተሉ" : "Track My Order"}
              </Link>
              <a
                href="https://wa.me/251912345678"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                {/* WhatsApp inline */}
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              <a
                href="https://t.me/addisbites"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                <Send size={16} />
                Telegram
              </a>
            </div>

            <Link href="/shop" className={styles.continueLink}>
              {locale === "am" ? "ግዥ ቀጥሉ →" : "Continue Shopping →"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Checkout handler ────────────────────────────────────────
  const handleCheckout = async () => {
    if (!name.trim()) {
      warning(
        locale === "am" ? "ስም ያስፈልጋል" : "Name Required",
        locale === "am" ? "እባክዎ ሙሉ ስምዎን ያስገቡ" : "Please enter your full name to continue."
      );
      return;
    }
    if (!phone.trim()) {
      warning(
        locale === "am" ? "ስልክ ቁጥር ያስፈልጋል" : "Phone Required",
        locale === "am" ? "ስልክ ቁጥርዎን ያስገቡ" : "Please enter your phone number."
      );
      return;
    }
    if (deliveryType === "delivery" && !address.trim()) {
      warning(
        locale === "am" ? "አድራሻ ያስፈልጋል" : "Address Required",
        locale === "am" ? "ለማድረሻ አድራሻ ያስፈልጋል" : "Please enter your delivery address."
      );
      return;
    }

    setLoading(true);
    setErrorBanner(null); // clear previous banner on retry
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items, total, deliveryFee,
          name, phone,
          address: deliveryType === "delivery" ? address : null,
          paymentMethod: "telebirr",
        }),
      });
      const data = await res.json();
      if (data.success) {
        clearCart();
        const number = data.orderNumber ?? data.orderId;
        setSuccessOrder({ id: data.orderId, number });
        router.push(`/pay/${number}`);
      } else {
        const title   = locale === "am" ? "ስህተት ተፈጥሯል" : "Order Failed";
        const message = data.error ?? (locale === "am" ? "እንደገና ይሞክሩ" : "Please try again.");
        error(title, message);
        setErrorBanner({ title, message });
      }
    } catch (err: unknown) {
      const msg     = err instanceof Error ? err.message : "";
      const title   = locale === "am" ? "የኔትወርክ ስህተት" : "Connection Error";
      const message = locale === "am" ? "ኢንተርኔት ያረጋግጡ" : `Network error. ${msg}`;
      error(title, message);
      setErrorBanner({ title, message });
    } finally {
      setLoading(false);
    }
  };

  // ── Main cart view ─────────────────────────────────────────
  return (
    <div style={{ paddingTop: "var(--nav-height)" }}>
      <div className="container section-sm">
        {/* Header */}
        <div className={styles.header}>
          <Link href="/shop" className={styles.backLink}>
            <ArrowLeft size={16} /> {locale === "am" ? "ወደ ሱቅ ተመለስ" : "Continue Shopping"}
          </Link>
          <h1 className="display-md">{t("title")}</h1>
          <button className={`btn btn-ghost btn-sm ${styles.clearBtn}`} onClick={clearCart}>
            <Trash2 size={15} /> {locale === "am" ? "ሁሉን ጽዳ" : "Clear all"}
          </button>
        </div>

        <div className={styles.layout}>
          {/* ── Cart items ── */}
          <div className={styles.items}>
            {items.map((item) => {
              const itemName = locale === "am" ? item.nameAm : item.nameEn;
              return (
                <div key={item.id} className={`card ${styles.itemCard}`}>
                  <div className={styles.itemImage}>
                    <Image src={item.image} alt={itemName} fill sizes="100px" style={{ objectFit: "cover" }} />
                  </div>
                  <div className={styles.itemInfo}>
                    <div>
                      <p className={styles.itemSize}>{item.size}</p>
                      <h3 className={styles.itemName}>{itemName}</h3>
                      <p className={styles.itemUnitPrice}>
                        {item.price.toLocaleString()} ብር {locale === "am" ? "ለእያንዳንዱ" : "each"}
                      </p>
                    </div>
                    <div className={styles.itemControls}>
                      <div className={styles.qtyGroup}>
                        <button className={styles.qtyBtn} onClick={() => updateQty(item.id, item.quantity - 1)}>
                          <Minus size={14} />
                        </button>
                        <span className={styles.qtyNum}>{item.quantity}</span>
                        <button className={styles.qtyBtn} onClick={() => updateQty(item.id, item.quantity + 1)}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className={styles.lineTotal}>{(item.price * item.quantity).toLocaleString()} ብር</p>
                      <button className={styles.removeBtn} onClick={() => removeItem(item.id)} aria-label="Remove item">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Summary & checkout ── */}
          <div className={styles.summary}>
            <div className={`card ${styles.summaryCard}`}>
              <h2 className={styles.summaryTitle}>
                {locale === "am" ? "የትዕዛዝ ማጠቃለያ" : "Order Summary"}
              </h2>

              <div className={styles.summaryLines}>
                <div className={styles.summaryLine}>
                  <span className="text-muted">{count} {locale === "am" ? "ምርቶች" : count === 1 ? "item" : "items"}</span>
                  <span>{total.toLocaleString()} ብር</span>
                </div>
                <div className={styles.summaryLine}>
                  <span className="text-muted">{locale === "am" ? "ማድረሻ" : "Delivery"}</span>
                  {deliveryFee === 0
                    ? <span className={styles.freeDelivery}>{locale === "am" ? "ነፃ!" : "Free!"}</span>
                    : <span>{deliveryFee} ብር</span>
                  }
                </div>
                {deliveryType === "delivery" && deliveryFee > 0 && (
                  <p className={`text-xs text-muted ${styles.freeDeliveryHint}`}>
                    {locale === "am"
                      ? `ከ500 ብር በላይ ነፃ ማድረሻ (${(500 - total).toLocaleString()} ቀሪ)`
                      : `Free delivery over 500 ብር (${(500 - total).toLocaleString()} ብር away)`}
                  </p>
                )}
              </div>

              <div className={styles.summaryTotal}>
                <span>{locale === "am" ? "ጠቅላላ" : "Total"}</span>
                <span className={styles.totalAmt}>{orderTotal.toLocaleString()} ብር</span>
              </div>

              {/* ── Checkout form ── */}
              <div className={styles.checkoutForm}>
                {/* Delivery type */}
                <div className={styles.fulfillmentToggle}>
                  {(["pickup", "delivery"] as DeliveryType[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`${styles.fulfillmentOption} ${deliveryType === opt ? styles.fulfillmentActive : ""}`}
                      onClick={() => { setDeliveryType(opt); if (opt === "pickup") setAddress(""); }}
                    >
                      <span className={styles.fulfillmentIcon}>{opt === "pickup" ? "🏪" : "🚗"}</span>
                      <span className={styles.fulfillmentLabel}>
                        {opt === "pickup" ? (locale === "am" ? "ቀጥታ" : "Pickup") : (locale === "am" ? "ማድረሻ" : "Delivery")}
                      </span>
                      <span className={styles.fulfillmentSub}>
                        {opt === "pickup" ? (locale === "am" ? "ሱቃችን ይምጡ" : "Come to our store") : (locale === "am" ? "ወደ ቤትዎ" : "To your door")}
                      </span>
                      {deliveryType === opt && <span className={styles.fulfillmentCheck}>✓</span>}
                    </button>
                  ))}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>{locale === "am" ? "ሙሉ ስም" : "Full Name"}</label>
                  <input
                    type="text" className={styles.input}
                    placeholder={locale === "am" ? "ለምሳሌ፦ አበበ ከበደ" : "e.g. John Doe"}
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>{locale === "am" ? "ስልክ ቁጥር" : "Phone Number"}</label>
                  <input
                    type="tel" className={styles.input}
                    placeholder="09XX XXX XXX"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                {deliveryType === "delivery" && (
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>
                      {locale === "am" ? "ሙሉ አድራሻ" : "Delivery Address"}
                      <span className={styles.inputRequired}>*</span>
                    </label>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      placeholder={locale === "am" ? "የሰፈር ስም፣ ቤት ቁጥር..." : "Neighbourhood, building, landmark..."}
                      rows={3} value={address} onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Submit button — with animated spinner */}
              <button
                className={`btn btn-primary btn-lg ${styles.orderBtn}`}
                onClick={handleCheckout}
                disabled={loading || (deliveryType === "delivery" && !address.trim())}
                style={{ marginTop: "var(--space-lg)", width: "100%", justifyContent: "center" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className={styles.spinner} />
                    {locale === "am" ? "በመላክ ላይ..." : "Processing..."}
                  </>
                ) : (
                  <>{locale === "am" ? "ትዕዛዙን አረጋግጥ" : "Confirm Order"}</>
                )}
              </button>

              {/* ── Inline error banner ── */}
              {errorBanner && (
                <div className={styles.errorBanner} role="alert">
                  <XCircle size={16} className={styles.errorBannerIcon} />
                  <div className={styles.errorBannerBody}>
                    <span className={styles.errorBannerTitle}>{errorBanner.title}</span>
                    {" — "}
                    <span className={styles.errorBannerMsg}>{errorBanner.message}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.errorBannerClose}
                    onClick={() => setErrorBanner(null)}
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <p className={`text-xs text-muted ${styles.orderHint}`}>
                {locale === "am"
                  ? "ትዕዛዝዎ ወዲያው ወደ ቡድናችን ይላካል"
                  : "Your order is submitted securely to our team"}
              </p>
            </div>

            {/* Trust row */}
            <div className={styles.trustRow}>
              {["🌿 Natural", "✓ Fresh Press", "📦 Fast Delivery"].map((s) => (
                <span key={s} className={styles.trustItem}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

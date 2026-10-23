"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShoppingBag, MessageCircle, Phone, Send } from "lucide-react";
import styles from "./CtaSection.module.css";

export default function CtaSection() {
  const t = useTranslations("home.cta");
  const locale = useLocale();

  return (
    <section className={styles.section}>
      <div className={`container ${styles.inner}`}>
        {/* Ambient glow */}
        <div className={styles.glow} />

        <div className={styles.content}>
          {/* Badge */}
          <div className="badge badge-brand">
            <ShoppingBag size={12} />
            {locale === "am" ? "ዛሬ ይዘዙ" : "Order Today"}
          </div>

          <h2 className={`display-md ${styles.title}`}>{t("title")}</h2>
          <p className={`text-lg text-muted ${styles.subtitle}`}>{t("subtitle")}</p>

          {/* Primary CTA */}
          <Link href="/shop" className="btn btn-primary btn-lg">
            <ShoppingBag size={18} />
            {t("button")}
          </Link>

          {/* Trust micro-copy */}
          <p className={styles.micro}>
            {locale === "am"
              ? "ምንም ቅድሚያ ክፍያ አያስፈልግም — ሲያስረዱ ብቻ ይክፈሉ"
              : "No upfront payment · Pay after confirmation"}
          </p>

          {/* Contact strip */}
          <div className={styles.contactStrip}>
            <span className={styles.contactLabel}>
              {locale === "am" ? "ወይም ቀጥታ ያናግሩን:" : "Or reach us directly:"}
            </span>
            <a
              href="https://wa.me/251912345678"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactBtn}
            >
              <Phone size={14} />
              WhatsApp
            </a>
            <a
              href="https://t.me/addisbites"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactBtn}
            >
              <Send size={14} />
              Telegram
            </a>
            <a
              href="https://wa.me/251912345678"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactBtn}
            >
              <MessageCircle size={14} />
              {locale === "am" ? "ቀጥታ ትዕዛዝ" : "Direct Order"}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

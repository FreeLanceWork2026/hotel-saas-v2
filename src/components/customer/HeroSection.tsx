"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import styles from "./HeroSection.module.css";

export default function HeroSection() {
  const t = useTranslations("home.hero");
  const locale = useLocale();
  // locale-aware Links via @/i18n/navigation

  return (
    <section className={styles.hero}>
      {/* Background image */}
      <div className={styles.bg}>
        <Image
          src="https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=1600&q=80"
          alt="Fresh Ethiopian food spread"
          fill
          priority
          style={{ objectFit: "cover", objectPosition: "center 40%" }}
        />
        <div className={styles.overlay} />
      </div>

      <div className={`container ${styles.content}`}>
        {/* Badge */}
        <div className={`badge badge-brand animate-fade-up ${styles.badge}`}>
          <span>&#x1F37D;&#xFE0F;</span>
          {t("badge")}
        </div>

        {/* Headline */}
        <h1 className={`display-xl animate-fade-up delay-100 ${styles.title}`}>
          {t("title")}
        </h1>

        {/* Subtitle */}
        <p className={`text-lg animate-fade-up delay-200 ${styles.subtitle}`}>
          {t("subtitle")}
        </p>

        {/* CTAs */}
        <div className={`animate-fade-up delay-300 ${styles.ctas}`}>
          <Link href={"/shop"} className="btn btn-primary btn-lg">
            {t("ctaShop")}
          </Link>
          <Link href={"/how-its-made"} className="btn btn-outline btn-lg">
            {t("ctaHow")}
          </Link>
        </div>

        {/* Fresh badge */}
        <div className={`animate-fade-up delay-400 ${styles.freshBadge}`}>
          <span className={styles.freshDot} />
          {t("freshBadge")}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className={styles.scrollIndicator}>
        <div className={styles.scrollLine} />
      </div>
    </section>
  );
}

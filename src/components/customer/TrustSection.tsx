"use client";

import { useTranslations } from "next-intl";
import { Leaf, Sparkles, MapPin, Flame, Star, Users, Package } from "lucide-react";
import styles from "./TrustSection.module.css";

const TRUST_ITEMS = [
  {
    key: "natural" as const,
    Icon: Leaf,
    color: "#5a9e6f",
    bg: "rgba(61,122,82,0.1)",
    stat: "100%",
    statLabel: "Pure Ingredients",
  },
  {
    key: "fresh" as const,
    Icon: Sparkles,
    color: "#e4a840",
    bg: "rgba(200,137,30,0.1)",
    stat: "Made to Order",
    statLabel: "Kitchen Fresh",
  },
  {
    key: "local" as const,
    Icon: MapPin,
    color: "#60a5fa",
    bg: "rgba(59,130,246,0.1)",
    stat: "Ethiopia",
    statLabel: "Locally Sourced",
  },
  {
    key: "quality" as const,
    Icon: Flame,
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    stat: "Small Batch",
    statLabel: "Every Time",
  },
];

const STATS = [
  { icon: Users, value: "500+", label: "Happy Customers" },
  { icon: Package, value: "1,200+", label: "Orders Served" },
  { icon: Star, value: "4.9", label: "Average Rating" },
];

export default function TrustSection() {
  const t = useTranslations("home.trust");

  return (
    <section className={styles.trust}>
      <div className="container">
        {/* Section header */}
        <div className={`section-header ${styles.header}`}>
          <div className="badge badge-brand">✦ Our Promise</div>
          <h2 className="display-md" style={{ marginTop: "var(--space-md)" }}>
            {t("title")}
          </h2>
        </div>

        {/* Trust cards */}
        <div className={`grid-4 ${styles.grid}`}>
          {TRUST_ITEMS.map(({ key, Icon, color, bg, stat, statLabel }, i) => (
            <div
              key={key}
              className={`card ${styles.card} animate-fade-up`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={styles.iconWrap} style={{ background: bg }}>
                <Icon size={22} style={{ color }} />
              </div>
              <div className={styles.stat} style={{ color }}>{stat}</div>
              <div className={styles.statLabel}>{statLabel}</div>
              <h3 className={styles.cardTitle}>{t(`${key}.title`)}</h3>
              <p className={`text-sm text-muted ${styles.cardDesc}`}>
                {t(`${key}.desc`)}
              </p>
            </div>
          ))}
        </div>

        {/* Social proof stats bar */}
        <div className={styles.statsBar}>
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className={styles.statItem}>
              <Icon size={18} className={styles.statBarIcon} />
              <span className={styles.statValue}>{value}</span>
              <span className={styles.statBarLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

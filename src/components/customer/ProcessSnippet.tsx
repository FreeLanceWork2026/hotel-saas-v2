"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "./ProcessSnippet.module.css";

const steps = [
  { key: "step1", emoji: "🥬" },
  { key: "step2", emoji: "🔥" },
  { key: "step3", emoji: "🍽️" },
  { key: "step4", emoji: "🛵" },
] as const;

export default function ProcessSnippet() {
  const t = useTranslations("home.process");
  const tSteps = useTranslations("howItsMade.steps");
  const locale = useLocale();
  // locale-aware Links via @/i18n/navigation

  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className={`section-header ${styles.header}`}>
          <div className="badge badge-brand">{t("badge")}</div>
          <h2 className="display-md" style={{ marginTop: "var(--space-md)" }}>
            {t("title")}
          </h2>
          <p className="text-lg text-muted" style={{ marginTop: "var(--space-md)", maxWidth: 520, margin: "var(--space-md) auto 0" }}>
            {t("subtitle")}
          </p>
        </div>

        <div className={styles.steps}>
          {steps.map(({ key, emoji }, i) => (
            <div key={key} className={styles.step}>
              {/* Number + connector line */}
              <div className={styles.stepMeta}>
                <div className={styles.stepNum}>{tSteps(`${key}.number`)}</div>
                {i < steps.length - 1 && <div className={styles.connector} />}
              </div>
              <div className={styles.stepBody}>
                <div className={styles.stepEmoji}>{emoji}</div>
                <h3 className={styles.stepTitle}>{tSteps(`${key}.title`)}</h3>
                <p className={`text-sm text-muted ${styles.stepDesc}`}>
                  {tSteps(`${key}.desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.cta}>
          <Link href={"/how-its-made"} className="btn btn-outline">
            {t("learnMore")} →
          </Link>
        </div>
      </div>
    </section>
  );
}

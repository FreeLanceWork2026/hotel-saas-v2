import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import FaqAccordion from "@/components/customer/FaqAccordion";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItsMade" });
  return { title: t("title") };
}

export default async function HowItsMadePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItsMade" });

  const steps = ["step1", "step2", "step3", "step4"] as const;
  const emojis = ["🥬", "🔥", "🍽️", "🛵"];

  const faqItems = [0, 1, 2, 3].map((i) => ({
    q: t(`faq.items.${i}.q` as Parameters<typeof t>[0]),
    a: t(`faq.items.${i}.a` as Parameters<typeof t>[0]),
  }));

  return (
    <div style={{ paddingTop: "var(--nav-height)" }}>
      {/* Hero */}
      <div style={{
        background: "var(--color-bg-muted)",
        borderBottom: "1px solid var(--color-bg-border)",
        padding: "var(--space-4xl) 0",
        textAlign: "center"
      }}>
        <div className="container">
          <div className="badge badge-brand" style={{ marginBottom: "var(--space-md)" }}>
            {t("badge")}
          </div>
          <h1 className="display-lg" style={{ marginBottom: "var(--space-lg)" }}>
            {t("title")}
          </h1>
          <p className="text-lg text-muted" style={{ maxWidth: 560, margin: "0 auto" }}>
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="container section">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
          {steps.map((step, i) => (
            <div key={step} className="card" style={{
              padding: "var(--space-2xl)",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "var(--space-xl)",
              alignItems: "start"
            }}>
              <div style={{
                fontSize: "3rem",
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--color-bg-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "1px solid var(--color-bg-border)"
              }}>
                {emojis[i]}
              </div>
              <div>
                <div className="badge badge-brand" style={{ marginBottom: "var(--space-md)" }}>
                  {t(`steps.${step}.number`)}
                </div>
                <h2 className="display-md" style={{ marginBottom: "var(--space-md)" }}>
                  {t(`steps.${step}.title`)}
                </h2>
                <p className="text-lg text-muted">{t(`steps.${step}.desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{
        background: "var(--color-bg-muted)",
        borderTop: "1px solid var(--color-bg-border)",
        padding: "var(--space-4xl) 0"
      }}>
        <div className="container">
          <h2 className="display-md" style={{ marginBottom: "var(--space-2xl)", textAlign: "center" }}>
            {t("faq.title")}
          </h2>
          <FaqAccordion items={faqItems} />
        </div>
      </div>
    </div>
  );
}

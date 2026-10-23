// HomeFaq — Server Component wrapper for the homepage FAQ section
// Pulls questions from the existing en.json howItsMade.faq.items
import { getTranslations } from "next-intl/server";
import FaqAccordion from "./FaqAccordion";

export default async function HomeFaq() {
  const t = await getTranslations("howItsMade");

  // Build FAQ items from the shared howItsMade translations
  const items = [
    {
      q: t("faq.items.0.q"),
      a: t("faq.items.0.a"),
    },
    {
      q: t("faq.items.1.q"),
      a: t("faq.items.1.a"),
    },
    {
      q: t("faq.items.2.q"),
      a: t("faq.items.2.a"),
    },
    {
      q: t("faq.items.3.q"),
      a: t("faq.items.3.a"),
    },
  ];

  return (
    <section
      className="section"
      style={{
        background: "var(--color-bg)",
        borderTop: "1px solid var(--color-bg-border)",
      }}
    >
      <div className="container">
        <div className="section-header">
          <div className="badge badge-brand">✦ FAQ</div>
          <h2 className="display-md" style={{ marginTop: "var(--space-md)" }}>
            {t("faq.title")}
          </h2>
          <p
            className="text-lg text-muted"
            style={{ marginTop: "var(--space-md)", maxWidth: 480, margin: "var(--space-md) auto 0" }}
          >
            {t("faq.intro")}
          </p>
        </div>

        <div style={{ marginTop: "var(--space-2xl)" }}>
          <FaqAccordion items={items} />
        </div>
      </div>
    </section>
  );
}

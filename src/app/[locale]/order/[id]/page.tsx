import { getTranslations } from "next-intl/server";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function OrderPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "order" });

  return (
    <div style={{ paddingTop: "var(--nav-height)" }}>
      <div className="container section">
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: "3.5rem", marginBottom: "var(--space-lg)" }}>✅</p>
          <h1 className="display-md" style={{ marginBottom: "var(--space-md)" }}>
            {t("confirmed")}
          </h1>
          <p className="text-lg text-muted">{t("confirmedSubtitle")}</p>
          <div className="card" style={{ padding: "var(--space-xl)", marginTop: "var(--space-2xl)", textAlign: "left" }}>
            <p className="text-muted text-sm">{t("orderNumber")}</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--color-brand-400)" }}>
              #{id.toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// FeaturedProducts — Server Component (homepage section)
// Fetches top 3 active products from Supabase with static fallback
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { mapSupabaseProduct, FALLBACK_PRODUCTS, type Product } from "@/lib/products";
import FeaturedProductsClient from "./FeaturedProductsClient";

async function fetchFeatured(): Promise<Product[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error || !data || data.length === 0) return FALLBACK_PRODUCTS.slice(0, 3);
    return data.map((row) => mapSupabaseProduct(row as Record<string, unknown>));
  } catch {
    return FALLBACK_PRODUCTS.slice(0, 3);
  }
}

export default async function FeaturedProducts() {
  const t = await getTranslations("home.featured");
  const products = await fetchFeatured();

  return (
    <section className="section" style={{ background: "var(--color-bg)" }}>
      <div className="container">
        <div className="section-header">
          <div className="badge badge-brand">{t("badge")}</div>
          <h2 className="display-md" style={{ marginTop: "var(--space-md)" }}>
            {t("title")}
          </h2>
          <p
            className="text-lg text-muted"
            style={{ marginTop: "var(--space-md)", maxWidth: 480, margin: "var(--space-md) auto 0" }}
          >
            {t("subtitle")}
          </p>
        </div>

        {/* Client component handles cart add / toast */}
        <FeaturedProductsClient products={products} />

        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <Link href="/shop" className="btn btn-outline">
            {t("viewAll")} →
          </Link>
        </div>
      </div>
    </section>
  );
}

// Shop page — Server Component (fetches from Supabase, great for SEO)
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { mapSupabaseProduct, FALLBACK_PRODUCTS, type Product } from "@/lib/products";
import ShopClient from "./ShopClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "am" ? "ምናሌ | እንጦጦ ሄቨን" : "Menu | Entoto Haven",
    description:
      locale === "am"
        ? "ትኩስ ምግብ እና መጠጦች — የእንጦጦ ሄቨን ምናሌ።"
        : "Fresh food and drinks made to order in Addis Ababa. Browse the Entoto Haven menu.",
  };
}

async function fetchProducts(): Promise<Product[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return FALLBACK_PRODUCTS;
    }

    return data.map((row) => mapSupabaseProduct(row as Record<string, unknown>));
  } catch {
    // If Supabase is unavailable (e.g. build time), use static fallback
    return FALLBACK_PRODUCTS;
  }
}

export default async function ShopPage({ params }: Props) {
  const { locale } = await params;
  await getTranslations({ locale, namespace: "shop" });

  const products = await fetchProducts();

  return <ShopClient products={products} />;
}

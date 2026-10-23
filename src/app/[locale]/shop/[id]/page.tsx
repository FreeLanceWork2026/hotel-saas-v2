// Server component — fetches product + extra images from Supabase
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { mapSupabaseProduct, FALLBACK_PRODUCTS, getProductById, type Product } from "@/lib/products";
import ProductDetailClient from "./ProductDetailClient";

export function generateStaticParams() {
  return FALLBACK_PRODUCTS.map((p) => ({ id: p.id }));
}

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const fallback = getProductById(id);
  return {
    title: fallback ? `${fallback.nameEn} | Entoto Haven` : "Product | Entoto Haven",
  };
}

async function fetchProductWithImages(id: string): Promise<{ product: Product; images: string[] } | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data: row } = await sb.from("products").select("*").eq("id", id).single();
    if (!row) return null;

    const product = mapSupabaseProduct(row as Record<string, unknown>);

    // Fetch extra images
    const { data: imgs } = await sb
      .from("product_images")
      .select("url, sort_order")
      .eq("product_id", id)
      .order("sort_order", { ascending: true });

    const extraImages = (imgs ?? []).map((i) => i.url as string);
    return { product, images: extraImages };
  } catch {
    return null;
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { id, locale } = await params;

  // Try live DB first, fallback to static
  const live = await fetchProductWithImages(id);
  const product = live?.product ?? getProductById(id);
  if (!product) notFound();

  const extraImages = live?.images ?? [];

  // Related products (same category or same name, different size)
  let related: Product[] = [];
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("category", product.size) // use size as category proxy for food items
      .neq("id", id)
      .limit(4);
    if (data && data.length > 0) {
      related = data.map((r) => mapSupabaseProduct(r as Record<string, unknown>));
    }
  } catch {
    related = FALLBACK_PRODUCTS.filter((p) => p.id !== id && p.nameEn === product.nameEn);
  }

  void locale; // used by parent layout for i18n

  return <ProductDetailClient product={product} related={related} extraImages={extraImages} />;
}

// Shared Product type used across storefront — mirrors Supabase products table
// but with the storefront-specific fields added for display.

export interface Product {
  id: string;
  nameEn: string;
  nameAm: string;
  descriptionEn: string;
  descriptionAm: string;
  size: string;
  price: number;    // ETB
  image: string;
  images?: string[]; // additional images (product_images table)
  stockKg: number;  // legacy weight-based stock
  stockQty: number; // unit-based stock count (from stock_qty column)
  isActive: boolean;
  tag?: string;     // "bestseller" | "new" | "popular"
  madeToOrder?: boolean; // track_stock = false → no stock badge, never sold out
}

// Maps a raw Supabase `products` row → our storefront Product shape.
// Supabase columns use snake_case and may differ from our camelCase fields.
export function mapSupabaseProduct(row: Record<string, unknown>): Product {
  return {
    id:            String(row.id ?? ""),
    nameEn:        String(row.name ?? row.name_en ?? ""),
    nameAm:        String(row.name_am ?? row.name ?? ""),
    descriptionEn: String(row.description ?? row.description_en ?? ""),
    descriptionAm: String(row.description_am ?? row.description ?? ""),
    size:          String(row.size ?? row.category ?? ""),
    price:         Number(row.price ?? 0),
    image:         String(row.image_url ?? row.image ?? ""),
    stockKg:       Number(row.stock_qty ?? row.stock_kg ?? row.quantity ?? 0),
    stockQty:      Number(row.stock_qty ?? row.quantity ?? 0),
    isActive:      Boolean(row.is_active ?? true),
    tag:           row.tag ? String(row.tag) : undefined,
    madeToOrder:   row.track_stock === false,
  };
}

// ── Fallback static products ─────────────────────────────────────────────────
// Used when Supabase returns nothing (e.g. empty catalog on first run).
const PB_IMG_1 = "https://images.pexels.com/photos/1618922/pexels-photo-1618922.jpeg?w=600&h=450&fit=crop";
const PB_IMG_2 = "https://images.pexels.com/photos/4110255/pexels-photo-4110255.jpeg?w=600&h=450&fit=crop";
const PB_IMG_3 = "https://images.pexels.com/photos/8108063/pexels-photo-8108063.jpeg?w=600&h=450&fit=crop";
const PB_IMG_ROASTED = "https://images.pexels.com/photos/1295572/pexels-photo-1295572.jpeg?w=600&h=450&fit=crop";

export const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "pb-250g",
    nameEn: "Natural Peanut Butter",
    nameAm: "ተፈጥሯዊ የለውዝ ቅቤ",
    descriptionEn: "Our classic 250g jar — stone-pressed from 100% Ethiopian peanuts.",
    descriptionAm: "ክላሲኩ 250ግ ጃር — ከ100% ኢትዮጵያ ለውዝ የድንጋይ ጭነት።",
    size: "250g",
    price: 120,
    image: PB_IMG_1,
    stockKg: 15,
    stockQty: 15,
    isActive: true,
    tag: "popular",
  },
  {
    id: "pb-500g",
    nameEn: "Natural Peanut Butter",
    nameAm: "ተፈጥሯዊ የለውዝ ቅቤ",
    descriptionEn: "Our most popular size. 500g of fresh peanut butter, no additives.",
    descriptionAm: "እጅግ ተወዳጅ መጠናችን። 500ግ ትኩስ ለውዝ ቅቤ፣ ምንም ተጨማሪ የለም።",
    size: "500g",
    price: 220,
    image: PB_IMG_2,
    stockKg: 28,
    stockQty: 28,
    isActive: true,
    tag: "bestseller",
  },
  {
    id: "pb-1kg",
    nameEn: "Natural Peanut Butter",
    nameAm: "ተፈጥሯዊ የለውዝ ቅቤ",
    descriptionEn: "The family pack. 1kg of pure fresh peanut butter — best value per gram.",
    descriptionAm: "የቤተሰብ ፓኬት። 1ኪግ ንፁህ ትኩስ የለውዝ ቅቤ — ለእያንዳንዱ ግራም ምርጥ ዋጋ።",
    size: "1kg",
    price: 400,
    image: PB_IMG_3,
    stockKg: 12,
    stockQty: 12,
    isActive: true,
  },
  {
    id: "roasted-250g",
    nameEn: "Roasted Peanuts",
    nameAm: "ቀቅሎ ለውዝ",
    descriptionEn: "Slow-roasted in-house with a pinch of sea salt. Crunchy and fresh.",
    descriptionAm: "ትንሽ የባህር ጨው ታከሎ በቤት ውስጥ ቀስ ብሎ ቀቅሎ። አስደናቂ፣ ትኩስ።",
    size: "250g",
    price: 75,
    image: PB_IMG_ROASTED,
    stockKg: 8,
    stockQty: 8,
    isActive: true,
    tag: "new",
  },
];

export function getProductById(id: string): Product | undefined {
  return FALLBACK_PRODUCTS.find((p) => p.id === id);
}

export function getActiveProducts(): Product[] {
  return FALLBACK_PRODUCTS.filter((p) => p.isActive);
}

"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SlidersHorizontal, Check, ShoppingCart, ArrowRight } from "lucide-react";
import ProductCard from "@/components/customer/ProductCard";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/context/CartContext";
import { useFeature } from "@/context/FeaturesContext";
import type { Product } from "@/lib/products";
import styles from "./ShopPage.module.css";

type SortOption = "default" | "price-asc" | "price-desc";

interface Props {
  products: Product[];
}

export default function ShopClient({ products }: Props) {
  const t = useTranslations("shop");
  const locale = useLocale();
  const [sort, setSort] = useState<SortOption>("default");
  const { count: cartCount, total: cartTotal } = useCart();
  const canOrder = useFeature("online_ordering");

  const sorted = [...products].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    return 0;
  });

  return (
    <div style={{ paddingTop: "var(--nav-height)" }}>
      {/* Hero banner */}
      <div className={styles.banner}>
        <div className="container">
          <div className="badge badge-brand" style={{ marginBottom: "var(--space-md)" }}>
            ✦ {locale === "am" ? "ምርቶቻችን" : "Our Products"}
          </div>
          <h1 className={`display-lg ${styles.bannerTitle}`}>{t("title")}</h1>
          <p className={`text-lg text-muted ${styles.bannerSub}`}>{t("subtitle")}</p>
        </div>
      </div>

      <div className="container section-sm">
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <p className="text-muted text-sm">
            {sorted.length} {locale === "am" ? "ምርቶች" : "products"}
          </p>
          <div className={styles.sortGroup}>
            <SlidersHorizontal size={15} className="text-muted" />
            <span className="text-sm text-muted">{t("sortLabel")}:</span>
            {(
              [
                { value: "default", label: t("sortNewest") },
                { value: "price-asc", label: t("sortPriceAsc") },
                { value: "price-desc", label: t("sortPriceDesc") },
              ] as { value: SortOption; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                className={`${styles.sortBtn} ${sort === opt.value ? styles.sortBtnActive : ""}`}
                onClick={() => setSort(opt.value)}
              >
                {sort === opt.value && <Check size={12} />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {sorted.length === 0 ? (
          <div className={styles.empty}>
            <span style={{ fontSize: "3rem" }}>🍽️</span>
            <p className="text-lg text-muted">{t("noProducts")}</p>
          </div>
        ) : (
          <div className={`grid-3 ${styles.grid}`}>
            {sorted.map((product, i) => (
              <div
                key={product.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <ProductCard
                  product={product}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky "Go to Cart" bar (kiosk-style) ── */}
      {canOrder && <Link
        href="/cart"
        className={`${styles.cartBar} ${cartCount > 0 ? styles.cartBarVisible : ""}`}
        aria-label="Go to cart"
      >
        <span className={styles.cartBarLeft}>
          <ShoppingCart size={18} />
          {locale === "am" ? "ወደ ጋሪ ሂድ" : "Go to Cart"}
          {cartCount > 0 && (
            <span className={styles.cartBarCount}>{cartCount}</span>
          )}
        </span>
        <span className={styles.cartBarRight}>
          <span>{cartTotal.toLocaleString()} ብር</span>
          <ArrowRight size={16} />
        </span>
      </Link>}
    </div>
  );
}

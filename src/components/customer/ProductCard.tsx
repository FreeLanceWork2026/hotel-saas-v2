"use client";

import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { ShoppingCart, Plus, CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useFeature } from "@/context/FeaturesContext";
import type { Product } from "@/lib/products";
import styles from "./ProductCard.module.css";
import { useState } from "react";

interface Props {
  product: Product;
  onAdd?: () => void;
}

/** Smart stock badge: exact count when under 10, "10+ in stock" otherwise, red if OOS */
function getStockBadge(qty: number, outOfStockLabel: string) {
  if (qty <= 0) return { label: outOfStockLabel, cls: "badge-red"   };
  if (qty < 10) return { label: `${qty} left`,   cls: "badge-amber" };
  return          { label: "10+ in stock",        cls: "badge-green" };
}

export default function ProductCard({ product, onAdd }: Props) {
  const t      = useTranslations("product");
  const tShop  = useTranslations("shop");
  const locale = useLocale();
  const { addItem } = useCart();
  const canOrder = useFeature("online_ordering");
  const [justAdded, setJustAdded] = useState(false);

  const name    = locale === "am" ? product.nameAm : product.nameEn;
  const qty     = product.stockQty ?? product.stockKg ?? 0;
  const inStock = product.madeToOrder || qty > 0;
  const badge   = getStockBadge(qty, tShop("outOfStock"));

  const handleAddToCart = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!inStock) return;
    addItem({
      id:        product.id,
      productId: product.id,
      nameEn:    product.nameEn,
      nameAm:    product.nameAm,
      size:      product.size,
      price:     product.price,
      image:     product.image,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
    onAdd?.();
  };

  return (
    /* Entire card is clickable — adds to cart, no navigation */
    <div
      className={`card ${styles.card} ${!inStock ? styles.cardDisabled : ""}`}
      onClick={inStock ? handleAddToCart : undefined}
      role={inStock ? "button" : undefined}
      tabIndex={inStock ? 0 : undefined}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleAddToCart(); }}
      aria-label={inStock ? `${name} — add to cart` : `${name} — out of stock`}
    >
      {/* Image */}
      <div className={styles.imageWrap}>
        <Image
          src={product.image}
          alt={name}
          fill
          sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, 33vw"
          style={{ objectFit: "cover" }}
        />

        {/* Tags */}
        <div className={styles.tags}>
          {product.tag === "bestseller" && (
            <span className={`badge badge-brand ${styles.tag}`}>⭐ Bestseller</span>
          )}
          {product.tag === "new" && (
            <span className={`badge badge-green ${styles.tag}`}>✦ New</span>
          )}
          {product.tag === "popular" && (
            <span className={`badge badge-brand ${styles.tag}`}>🔥 Popular</span>
          )}
        </div>

        {/* Out of stock overlay */}
        {!inStock && (
          <div className={styles.outOfStockOverlay}>
            <span>{tShop("outOfStock")}</span>
          </div>
        )}

        {/* Quick add button */}
        {canOrder && <button
          className={`${styles.quickAdd} ${justAdded ? styles.quickAddDone : ""} ${!inStock ? styles.quickAddDisabled : ""}`}
          onClick={handleAddToCart}
          aria-label={t("addToCart")}
          disabled={!inStock}
        >
          {justAdded ? <CheckCircle2 size={18} /> : <Plus size={18} />}
        </button>}
      </div>

      {/* Info */}
      <div className={styles.info}>
        <div className={styles.topRow}>
          <span className={styles.size}>{product.size}</span>
          {!product.madeToOrder && (
            <span className={`badge ${badge.cls} ${styles.stockBadge}`}>
              {badge.label}
            </span>
          )}
        </div>

        <h3 className={styles.name}>{name}</h3>

        <div className={styles.bottom}>
          <p className={styles.price}>
            {product.price.toLocaleString()}
            <span className={styles.currency}> ብር</span>
          </p>
          {canOrder && <button
            className={`btn btn-primary btn-sm ${styles.addBtn} ${justAdded ? styles.addBtnDone : ""}`}
            onClick={handleAddToCart}
            disabled={!inStock}
          >
            {justAdded ? (
              <><CheckCircle2 size={15} /> Added!</>
            ) : (
              <><ShoppingCart size={15} /> {t("addToCart")}</>
            )}
          </button>}
        </div>
      </div>
    </div>
  );
}

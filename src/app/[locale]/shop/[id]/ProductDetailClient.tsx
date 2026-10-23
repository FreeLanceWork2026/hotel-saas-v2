"use client";

import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { ShoppingCart, ArrowLeft, Minus, Plus, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useFeature } from "@/context/FeaturesContext";
import type { Product } from "@/lib/products";
import styles from "./ProductDetail.module.css";

interface Props {
  product: Product;
  related: Product[];
  extraImages?: string[];
}

export default function ProductDetailClient({ product, related, extraImages = [] }: Props) {
  const t = useTranslations("product");
  const tShop = useTranslations("shop");
  const locale = useLocale();
  const { addItem } = useCart();
  const canOrder = useFeature("online_ordering");

  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Build the full image gallery: primary + extras
  const allImages = [
    ...(product.image ? [product.image] : []),
    ...extraImages,
  ].filter(Boolean);

  const [activeIdx, setActiveIdx] = useState(0);
  const activeImage = allImages[activeIdx] ?? product.image;

  const prev = () => setActiveIdx((i) => (i - 1 + allImages.length) % allImages.length);
  const next = () => setActiveIdx((i) => (i + 1) % allImages.length);

  const name = locale === "am" ? product.nameAm : product.nameEn;
  const description = locale === "am" ? product.descriptionAm : product.descriptionEn;
  const qty2 = product.madeToOrder ? 99 : product.stockQty ?? product.stockKg ?? 0;
  const inStock = qty2 > 0;

  const handleAdd = () => {
    addItem({
      id: product.id,
      productId: product.id,
      nameEn: product.nameEn,
      nameAm: product.nameAm,
      size: product.size,
      price: product.price,
      image: product.image,
    }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div style={{ paddingTop: "var(--nav-height)" }}>
      <div className="container section-sm">
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/shop" className={styles.backLink}>
            <ArrowLeft size={16} /> {tShop("title")}
          </Link>
          <span className={styles.sep}>/</span>
          <span className="text-muted">{name}</span>
        </nav>

        {/* Main layout */}
        <div className={styles.layout}>
          {/* Image gallery */}
          <div className={styles.imageSection}>
            <div className={styles.mainImage}>
              <Image
                src={activeImage}
                alt={name}
                fill
                sizes="(max-width:768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
                priority
              />
              {product.tag && (
                <div className={`badge badge-brand ${styles.imageTag}`}>
                  {product.tag === "bestseller" && "⭐ Bestseller"}
                  {product.tag === "new" && "✦ New"}
                  {product.tag === "popular" && "🔥 Popular"}
                </div>
              )}

              {/* Prev/Next arrows — only show when multiple images */}
              {allImages.length > 1 && (
                <>
                  <button className={`${styles.galleryArrow} ${styles.galleryArrowLeft}`} onClick={prev} aria-label="Previous image">
                    <ChevronLeft size={20} />
                  </button>
                  <button className={`${styles.galleryArrow} ${styles.galleryArrowRight}`} onClick={next} aria-label="Next image">
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {allImages.length > 1 && (
              <div className={styles.thumbStrip}>
                {allImages.map((src, i) => (
                  <button
                    key={i}
                    className={`${styles.thumbBtn} ${i === activeIdx ? styles.thumbBtnActive : ""}`}
                    onClick={() => setActiveIdx(i)}
                    aria-label={`View image ${i + 1}`}
                  >
                    <Image
                      src={src}
                      alt={`${name} view ${i + 1}`}
                      fill
                      sizes="80px"
                      style={{ objectFit: "cover" }}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Other sizes */}
            {related.length > 0 && (
              <div className={styles.otherSizes}>
                <p className={`text-sm text-muted ${styles.sizesLabel}`}>
                  {t("otherSizes")}
                </p>
                <div className={styles.sizeLinks}>
                  {related.map((r) => (
                    <Link key={r.id} href={`/shop/${r.id}`} className={styles.sizeLink}>
                      {r.size}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className={styles.details}>
            <div className={styles.topMeta}>
              {!product.madeToOrder && <span className={`badge ${inStock ? (qty2 < 10 ? "badge-amber" : "badge-green") : "badge-red"}`}>
                {inStock ? (qty2 < 10 ? `${qty2} left` : "In Stock") : tShop("outOfStock")}
              </span>}
              <span className="text-muted text-sm">{product.size}</span>
            </div>

            <h1 className={`display-md ${styles.name}`}>{name}</h1>

            <p className={styles.price}>
              {product.price.toLocaleString()}
              <span className={styles.currency}> ብር</span>
            </p>

            <p className={`text-muted ${styles.description}`}>{description}</p>

            {/* Benefits */}
            <ul className={styles.benefits}>
              {[t("benefit1"), t("benefit2"), t("benefit3")].map((b) => (
                <li key={b}>
                  <Check size={15} className={styles.checkIcon} />
                  {b}
                </li>
              ))}
            </ul>

            {/* Qty + Add to cart */}
            {inStock && canOrder && (
              <div className={styles.actions}>
                <div className={styles.qtySelector}>
                  <button
                    className={styles.qtyBtn}
                    onClick={() => setQty(Math.max(1, qty - 1))}
                  >
                    <Minus size={16} />
                  </button>
                  <span className={styles.qtyNum}>{qty}</span>
                  <button
                    className={styles.qtyBtn}
                    onClick={() => setQty(Math.min(qty2, qty + 1))}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <button
                  className={`btn btn-primary btn-lg ${styles.addBtn} ${added ? styles.addBtnSuccess : ""}`}
                  onClick={handleAdd}
                >
                  {added ? (
                    <><Check size={18} /> {t("added")}</>
                  ) : (
                    <><ShoppingCart size={18} /> {t("addToCart")}</>
                  )}
                </button>
              </div>
            )}

            {/* Subtotal hint */}
            {inStock && canOrder && qty > 1 && (
              <p className={`text-sm text-muted ${styles.subtotal}`}>
                {t("subtotal")}: {(product.price * qty).toLocaleString()} ብር
              </p>
            )}

            {/* WhatsApp order */}
            <a
              href={`https://wa.me/251912345678?text=${encodeURIComponent(
                `Hello, I'd like to order ${qty}x ${product.nameEn} (${product.size}) — ${product.price * qty} ETB`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-outline btn-lg ${styles.waBtn}`}
            >
              📱 {t("orderWhatsApp")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

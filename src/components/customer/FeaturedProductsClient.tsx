"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Check } from "lucide-react";
import ProductCard from "./ProductCard";
import type { Product } from "@/lib/products";
import styles from "./FeaturedProducts.module.css";

export default function FeaturedProductsClient({ products }: { products: Product[] }) {
  const locale = useLocale();
  const [addedId, setAddedId] = useState<string | null>(null);

  return (
    <>
      <div className={`grid-3 ${styles.grid}`}>
        {products.map((product, i) => (
          <div
            key={product.id}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <ProductCard
              product={product}
              onAdd={() => {
                setAddedId(product.id);
                setTimeout(() => setAddedId(null), 1800);
              }}
            />
          </div>
        ))}
      </div>

      {/* Toast */}
      <div className={`${styles.toast} ${addedId ? styles.toastVisible : ""}`}>
        <Check size={16} />
        {locale === "am" ? "ወደ ጋሪ ተጨምሯል!" : "Added to cart!"}
      </div>
    </>
  );
}

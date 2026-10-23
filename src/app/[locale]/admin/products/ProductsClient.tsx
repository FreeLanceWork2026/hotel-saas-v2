"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import {
  Plus, Loader2, Package, Search, X, Camera, ImagePlus, Trash2, ScanLine, Sparkles,
  Pencil, Eye, EyeOff, Printer, AlertTriangle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import shared from "../admin.shared.module.css";
import styles from "./Products.module.css";
import { addProduct, updateProduct, toggleProductActive, generateBarcodeAction } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { useFeatures } from "@/context/FeaturesContext";
import { uploadProductImage } from "@/lib/clientImage";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/scan/BarcodeScanner"), { ssr: false });

export interface AdminProduct {
  id: string;
  name: string;
  name_am: string | null;
  description: string | null;
  price: number;
  category: string;
  size: string | null;
  barcode: string | null;
  sku: string | null;
  image_url: string | null;
  is_active: boolean;
  stock_qty: number | null;
  reorder_level: number | null;
  extra_images?: { id: string; url: string; label: string | null; sort_order: number }[];
}

type Filter = "all" | "active" | "hidden" | "low" | "out";

const SIZES = ["250g", "500g", "1kg", "2kg", "5kg", "100ml", "250ml", "500ml", "1L"];
const CATEGORIES = ["Spreads", "Honey", "Jelly", "Oils", "Nuts", "Other"];

export function stockState(p: Pick<AdminProduct, "stock_qty" | "reorder_level">): "out" | "low" | "ok" | "unknown" {
  if (p.stock_qty === null) return "unknown";
  if (p.stock_qty <= 0) return "out";
  if (p.stock_qty <= (p.reorder_level ?? 5)) return "low";
  return "ok";
}

function StockBadge({ p }: { p: AdminProduct }) {
  const s = stockState(p);
  if (s === "unknown") return <span className={styles.muted}>—</span>;
  const cls = s === "out" ? shared.badgeExpired : s === "low" ? shared.badgeWarning : shared.badgeGood;
  return (
    <span className={`${shared.badge} ${cls}`}>
      {p.stock_qty} {s === "out" ? "· out" : s === "low" ? "· low" : ""}
    </span>
  );
}

export default function ProductsClient({
  initialProducts,
  stockReady,
}: {
  initialProducts: AdminProduct[];
  stockReady: boolean;
}) {
  const [products, setProducts] = useState<AdminProduct[]>(initialProducts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { success, error } = useToast();
  const features = useFeatures();
  const canPrint = features.inventory && features.labels;

  // keep local list in sync when the server re-renders (after save / live refresh)
  const [lastServer, setLastServer] = useState(initialProducts);
  if (lastServer !== initialProducts) {
    setLastServer(initialProducts);
    setProducts(initialProducts);
  }

  const counts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => p.is_active).length,
      hidden: products.filter((p) => !p.is_active).length,
      low: products.filter((p) => stockState(p) === "low").length,
      out: products.filter((p) => stockState(p) === "out").length,
    }),
    [products],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "active" && !p.is_active) return false;
      if (filter === "hidden" && p.is_active) return false;
      if (filter === "low" && stockState(p) !== "low") return false;
      if (filter === "out" && stockState(p) !== "out") return false;
      if (!q) return true;
      return [p.name, p.name_am, p.sku, p.barcode, p.category, p.size]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [products, query, filter]);

  const handleToggle = (p: AdminProduct) => {
    setTogglingId(p.id);
    startTransition(async () => {
      const res = await toggleProductActive(p.id, p.is_active);
      if (res && "error" in res && res.error) {
        error("Update failed", res.error);
      } else {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)));
        success(p.is_active ? "Hidden from shop" : "Now visible in shop", p.name);
      }
      setTogglingId(null);
    });
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "hidden", label: "Hidden" },
    ...(stockReady ? [{ id: "low" as Filter, label: "Low" }, { id: "out" as Filter, label: "Out" }] : []),
  ];

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Products</h1>
          <p className={shared.pageSubtitle}>
            {products.length} product{products.length !== 1 ? "s" : ""} · {counts.active} on sale
          </p>
        </div>
        <button type="button" className={shared.headerBtn} onClick={() => setEditing("new")}>
          <Plus size={16} /> Add product
        </button>
      </div>

      {!stockReady && (
        <div className={styles.banner}>
          <AlertTriangle size={16} />
          <span>
            Stock tracking isn&apos;t set up yet. Run <code>phase25_stock.sql</code> in the Supabase SQL Editor to
            turn on stock levels, batches and the item journey. Products still work without it.
          </span>
        </div>
      )}

      <div className={shared.card}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, SKU, barcode…"
              aria-label="Search products"
            />
          </label>
          <div className={styles.chips} role="tablist" aria-label="Filter products">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`${styles.chip} ${filter === f.id ? styles.chipOn : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <span>{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <Package size={28} />
            <p>{products.length === 0 ? "No products yet — add your first item." : "Nothing matches this filter."}</p>
            {products.length === 0 && (
              <button type="button" className={shared.headerBtn} onClick={() => setEditing("new")}>
                <Plus size={16} /> Add product
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={`${shared.tableWrapper} ${styles.desktopOnly}`}>
              <table className={shared.table}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price (ETB)</th>
                    <th>SKU / Barcode</th>
                    {stockReady && <th>In stock</th>}
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} style={{ opacity: togglingId === p.id ? 0.5 : 1 }}>
                      <td>
                        <div className={styles.prodCell}>
                          <Thumb url={p.image_url} name={p.name} />
                          <div>
                            <div className={shared.cellName}>{p.name}</div>
                            <div className={styles.sub}>{p.size ?? "—"}{p.name_am ? ` · ${p.name_am}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.category}</td>
                      <td className={styles.price}>{p.price.toFixed(2)}</td>
                      <td>
                        <div className={shared.cellMono}>{p.sku ?? "—"}</div>
                        <div className={styles.sub}>{p.barcode ?? "no barcode"}</div>
                      </td>
                      {stockReady && <td><StockBadge p={p} /></td>}
                      <td>
                        <span className={`${shared.badge} ${p.is_active ? shared.badgeActive : shared.badgeInactive}`}>
                          {p.is_active ? "On sale" : "Hidden"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className={shared.actionBtn} onClick={() => setEditing(p)} title="Edit">
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className={shared.actionBtn}
                            onClick={() => handleToggle(p)}
                            disabled={isPending}
                            title={p.is_active ? "Hide from shop" : "Show in shop"}
                          >
                            {p.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          {canPrint && (
                            <Link href={`/admin/inventory/labels?product=${p.id}`} className={shared.actionBtn} title="Print label">
                              <Printer size={13} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className={`${styles.cards} ${styles.mobileOnly}`}>
              {visible.map((p) => (
                <li key={p.id} className={styles.pcard} style={{ opacity: p.is_active ? 1 : 0.6 }}>
                  <button type="button" className={styles.pcardMain} onClick={() => setEditing(p)}>
                    <Thumb url={p.image_url} name={p.name} size={64} />
                    <div className={styles.pcardBody}>
                      <div className={shared.cellName}>{p.name}</div>
                      <div className={styles.sub}>{[p.size, p.category].filter(Boolean).join(" · ")}</div>
                      <div className={styles.pcardMeta}>
                        <span className={styles.price}>{p.price.toFixed(2)} ETB</span>
                        {stockReady && <StockBadge p={p} />}
                        {!p.is_active && <span className={`${shared.badge} ${shared.badgeInactive}`}>Hidden</span>}
                      </div>
                    </div>
                  </button>
                  <div className={styles.pcardActions}>
                    <button type="button" className={shared.actionBtn} onClick={() => handleToggle(p)} disabled={isPending}>
                      {p.is_active ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                    </button>
                    {canPrint && (
                      <Link href={`/admin/inventory/labels?product=${p.id}`} className={shared.actionBtn}>
                        <Printer size={13} /> Label
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <ProductSheet
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          stockReady={stockReady}
          categories={Array.from(new Set([...CATEGORIES, ...products.map((p) => p.category)]))}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setProducts((prev) => {
              const i = prev.findIndex((x) => x.id === saved.id);
              if (i === -1) return [saved, ...prev];
              const next = [...prev];
              next[i] = { ...next[i], ...saved };
              return next;
            });
          }}
        />
      )}
    </div>
  );
}

function Thumb({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className={styles.thumb} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className={styles.thumbEmpty} style={{ width: size, height: size }} aria-hidden>
      <Package size={size / 2.4} />
    </span>
  );
}

/* ───────────────────────── Add / edit sheet ───────────────────────── */

function ProductSheet({
  product,
  stockReady,
  categories,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  stockReady: boolean;
  categories: string[];
  onClose: () => void;
  onSaved: (p: AdminProduct) => void;
}) {
  const isEdit = !!product;
  const { success, error, warning } = useToast();
  const [saving, startSave] = useTransition();
  const [imageUrl, setImageUrl] = useState<string>(product?.image_url ?? "");
  const [removeImage, setRemoveImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [genBusy, setGenBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Extra images state (only relevant in edit mode)
  const [extraImages, setExtraImages] = useState<{ id: string; url: string; label: string | null; sort_order: number }[]>(
    product?.extra_images ?? []
  );
  const [extraUploading, setExtraUploading] = useState(false);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const addExtraImage = async (file: File | undefined) => {
    if (!file || !product?.id) return;
    setExtraUploading(true);
    try {
      const url = await uploadProductImage(file);
      // Persist to product_images table
      const res = await fetch(`/api/admin/product-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          url,
          sort_order: extraImages.length + 1,
          label: null,
        }),
      });
      const data = await res.json();
      if (data.success && data.image) {
        setExtraImages((prev) => [...prev, data.image]);
        success("Image added", "Extra product image saved");
      } else {
        error("Upload failed", data.error ?? "Could not save image");
      }
    } catch (e) {
      error("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setExtraUploading(false);
    }
  };

  const removeExtraImage = async (imgId: string) => {
    try {
      await fetch(`/api/admin/product-images/${imgId}`, { method: "DELETE" });
      setExtraImages((prev) => prev.filter((i) => i.id !== imgId));
    } catch {
      error("Failed", "Could not remove image");
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadProductImage(file);
      setImageUrl(url);
      setRemoveImage(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const generate = async () => {
    setGenBusy(true);
    const res = await generateBarcodeAction();
    setGenBusy(false);
    if (res.barcode) setBarcode(res.barcode);
    else error("Could not generate", res.error);
  };

  const onSubmit = (formData: FormData) => {
    setFormError(null);
    formData.set("imageUrl", removeImage ? "" : imageUrl);
    formData.set("barcode", barcode);
    if (removeImage) formData.set("removeImage", "1");

    startSave(async () => {
      const res = isEdit ? await updateProduct(product!.id, formData) : await addProduct(formData);
      if (res && "error" in res && res.error) {
        setFormError(res.error);
        return;
      }
      const g = (k: string) => String(formData.get(k) ?? "").trim();
      type SavedProduct = {
        id: string; name: string; name_am?: string | null; description?: string | null;
        price: number; category: string; size?: string | null; barcode?: string | null;
        sku?: string | null; image_url?: string | null; is_active?: boolean;
      };
      const rawProduct = (res && "product" in res ? res.product : null) as SavedProduct | null;
      const saved: AdminProduct =
        rawProduct
          ? {
              id: rawProduct.id,
              name: rawProduct.name,
              name_am: rawProduct.name_am ?? null,
              description: rawProduct.description ?? null,
              price: Number(rawProduct.price),
              category: rawProduct.category,
              size: rawProduct.size ?? null,
              barcode: rawProduct.barcode ?? null,
              sku: rawProduct.sku ?? null,
              image_url: rawProduct.image_url ?? null,
              is_active: !!rawProduct.is_active,
              stock_qty: stockReady ? Number(g("openingStock") || 0) : null,
              reorder_level: stockReady ? Number(g("reorderLevel") || 5) : null,
            }
          : {
              ...product!,
              name: g("name"),
              name_am: g("nameAm") || null,
              description: g("description") || null,
              price: Number(g("price")),
              category: g("category"),
              size: g("size") || null,
              barcode: barcode || null,
              sku: g("sku") || product!.sku,
              image_url: removeImage ? null : imageUrl || product!.image_url,
              reorder_level: stockReady ? Number(g("reorderLevel") || product!.reorder_level || 5) : null,
            };
      onSaved(saved);
      if (res && "stockNote" in res && res.stockNote) warning("Saved", String(res.stockNote));
      else success(isEdit ? "Product updated" : "Product added", saved.name);
      onClose();
    });
  };

  const shownImage = removeImage ? "" : imageUrl;

  return (
    <div className={styles.sheetRoot} role="dialog" aria-modal="true" aria-label={isEdit ? "Edit product" : "Add product"}>
      <button type="button" className={styles.sheetBackdrop} onClick={onClose} aria-label="Close" />
      <div className={styles.sheet}>
        <div className={styles.sheetHead}>
          <h2>{isEdit ? "Edit product" : "Add product"}</h2>
          <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form action={onSubmit} className={styles.sheetBody}>
          {formError && <div className={shared.feedbackError}>{formError}</div>}

          {/* Photo */}
          <div className={styles.photoRow}>
            <div className={styles.photoBox}>
              {shownImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownImage} alt="Product preview" />
              ) : (
                <ImagePlus size={28} />
              )}
              {uploading && (
                <div className={styles.photoBusy}>
                  <Loader2 size={20} className={styles.spin} />
                </div>
              )}
            </div>
            <div className={styles.photoBtns}>
              <button type="button" className={shared.actionBtn} onClick={() => cameraRef.current?.click()} disabled={uploading}>
                <Camera size={14} /> Take photo
              </button>
              <button type="button" className={shared.actionBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
                <ImagePlus size={14} /> Upload
              </button>
              {shownImage && (
                <button
                  type="button"
                  className={`${shared.actionBtn} ${shared.actionBtnDanger}`}
                  onClick={() => (imageUrl && !product?.image_url ? setImageUrl("") : setRemoveImage(true))}
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
              <p className={shared.inputHint}>JPG, PNG or WebP. Photos are resized automatically.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>

          {/* Extra images (edit mode only) */}
          {isEdit && (
            <div className={shared.inputGroup}>
              <label className={shared.label}>Additional Images <span style={{ color: "var(--a-muted-2)", fontWeight: 400 }}>(front, back, detail — max 5)</span></label>
              <div className={styles.extraImagesGrid}>
                {extraImages.map((img) => (
                  <div key={img.id} className={styles.extraThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.label ?? "Extra image"} />
                    <button
                      type="button"
                      className={styles.extraRemove}
                      onClick={() => removeExtraImage(img.id)}
                      title="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {extraImages.length < 5 && (
                  <button
                    type="button"
                    className={styles.extraAdd}
                    onClick={() => extraFileRef.current?.click()}
                    disabled={extraUploading}
                    title="Add image"
                  >
                    {extraUploading ? <Loader2 size={18} className={styles.spin} /> : <ImagePlus size={18} />}
                    <span>{extraUploading ? "Uploading…" : "Add image"}</span>
                  </button>
                )}
              </div>
              <input
                ref={extraFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => addExtraImage(e.target.files?.[0])}
              />
              <p className={shared.inputHint}>Up to 5 images (front view, back view, detail, etc.)</p>
            </div>
          )}

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-name">Name (English) <span className={shared.labelRequired}>*</span></label>
            <input className={shared.input} id="p-name" name="name" required defaultValue={product?.name} placeholder="e.g. Chicken Tibs" />
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-nameAm">Name (Amharic)</label>
            <input className={shared.input} id="p-nameAm" name="nameAm" dir="auto" defaultValue={product?.name_am ?? ""} placeholder="ለምሳሌ: የዶሮ ጥብስ" />
          </div>

          <div className={styles.row2}>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="p-price">Price (ETB) <span className={shared.labelRequired}>*</span></label>
              <input className={shared.input} id="p-price" name="price" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={product?.price} placeholder="0.00" />
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="p-size">Size</label>
              <input className={shared.input} id="p-size" name="size" list="size-list" defaultValue={product?.size ?? ""} placeholder="e.g. 500g" />
              <datalist id="size-list">{SIZES.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-category">Category <span className={shared.labelRequired}>*</span></label>
            <input
              className={shared.input}
              id="p-category"
              name="category"
              list="cat-list"
              required
              defaultValue={product?.category ?? "Spreads"}
              placeholder="Choose or type a new category…"
              autoComplete="off"
            />
            <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <p className={shared.inputHint}>Pick from the list or just type a new one — it will be created automatically.</p>
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-barcode">Barcode</label>
            <div className={styles.inline}>
              <input
                className={shared.input}
                id="p-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                inputMode="numeric"
                placeholder="Scan, type, or generate"
              />
              <button type="button" className={shared.actionBtn} onClick={() => setScanOpen(true)} title="Scan with camera">
                <ScanLine size={15} />
              </button>
              <button type="button" className={shared.actionBtn} onClick={generate} disabled={genBusy} title="Generate an internal EAN-13">
                {genBusy ? <Loader2 size={14} className={styles.spin} /> : <Sparkles size={15} />} Generate
              </button>
            </div>
            <p className={shared.inputHint}>Leave blank to auto-generate. Scan an existing product barcode to reuse it.</p>
          </div>

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-sku">SKU</label>
            <input className={shared.input} id="p-sku" name="sku" defaultValue={product?.sku ?? ""} placeholder="Auto-generated if blank" />
          </div>

          {stockReady && (
            <div className={styles.row2}>
              {!isEdit && (
                <div className={shared.inputGroup}>
                  <label className={shared.label} htmlFor="p-open">Opening stock (units)</label>
                  <input className={shared.input} id="p-open" name="openingStock" type="number" inputMode="numeric" min="0" step="1" placeholder="0" />
                </div>
              )}
              <div className={shared.inputGroup}>
                <label className={shared.label} htmlFor="p-reorder">Low-stock alert at</label>
                <input className={shared.input} id="p-reorder" name="reorderLevel" type="number" inputMode="numeric" min="0" step="1" defaultValue={product?.reorder_level ?? 5} />
              </div>
              {!isEdit && (
                <div className={shared.inputGroup}>
                  <label className={shared.label} htmlFor="p-exp">Opening batch expiry</label>
                  <input className={shared.input} id="p-exp" name="expiresAt" type="date" />
                </div>
              )}
            </div>
          )}
          {isEdit && stockReady && (
            <p className={shared.inputHint}>Change quantities from the Inventory page so every movement is recorded.</p>
          )}

          <div className={shared.inputGroup}>
            <label className={shared.label} htmlFor="p-desc">Description</label>
            <textarea className={shared.textarea} id="p-desc" name="description" defaultValue={product?.description ?? ""} placeholder="Product details…" />
          </div>

          <div className={styles.sheetFoot}>
            <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving || uploading}>
              {saving ? <><Loader2 size={16} className={styles.spin} /> Saving…</> : isEdit ? "Save changes" : <><Plus size={16} /> Add product</>}
            </button>
          </div>
        </form>
      </div>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Scan the product barcode"
        onScan={(code) => {
          setBarcode(code);
          success("Barcode captured", code);
        }}
      />
    </div>
  );
}

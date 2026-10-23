"use client";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { ShoppingCart, Search, Settings, Lock, X, ScanLine, AlertTriangle, Sun, Moon, Monitor } from "lucide-react";
import Link from "next/link";
import styles from "./Kiosk.module.css";
import PinPad from "./PinPad";
import PosCheckout from "./PosCheckout";
import { lockKiosk } from "./pinActions";
import type { KioskOperator } from "@/lib/kioskOperator";
import { useScanner } from "@/components/scan/useScanner";
import { skuFromScan } from "@/lib/barcode";
import dynamic from "next/dynamic";
import KioskOrderQueue from "./KioskOrderQueue";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { useFeature } from "@/context/FeaturesContext";

const BarcodeScanner = dynamic(() => import("@/components/scan/BarcodeScanner"), { ssr: false });

export interface Product {
  id: string;
  name: string;
  name_am: string | null;
  size: string | null;
  price: number;
  category: string;
  image_url: string | null;
  barcode: string | null;
  sku: string | null;
  /** null → phase25_stock.sql not yet run */
  stock_qty: number | null;
  reorder_level: number | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type DeliveryType = "pickup" | "delivery";
type ModalStep = "idle" | "checkout";

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-ET", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className={styles.clock}>{time}</span>;
}

interface Employee { id: string; first_name: string; last_name: string; }

export default function KioskClient({
  products,
  locale,
  initialOperator,
  deniedAccount,
}: {
  products: Product[];
  locale: string;
  initialOperator: KioskOperator | null;
  deniedAccount: { email: string | null; name: string } | null;
}) {
  const [operator, setOperator] = useState<KioskOperator | null>(initialOperator);
  const hasBooking = useFeature("booking");
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [search, setSearch]     = useState("");
  const [activeCategory, setCategory] = useState("All");
  const [delivery, setDelivery] = useState<DeliveryType>("pickup");
  const [modal, setModal]       = useState<ModalStep>("idle");
  const [cartOpen, setCartOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  const THEME_CYCLE: Theme[] = ["dark", "light", "system"];
  const themeIcon = theme === "light" ? <Sun size={14} /> : theme === "dark" ? <Moon size={14} /> : <Monitor size={14} />;
  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = activeCategory === "All" || p.category === activeCategory;
      if (!q) return matchCat;
      return matchCat && (
        p.name.toLowerCase().includes(q) ||
        (p.name_am ?? "").includes(search) ||
        (p.barcode ?? "").includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, activeCategory]);

  // ── cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((product: Product, qty = 1) => {
    const maxQty = product.stock_qty !== null && product.stock_qty > 0
      ? product.stock_qty
      : product.stock_qty === 0
        ? 0  // out of stock — allow but warn (cashier override)
        : Infinity; // stock not tracked yet

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      const newQty = currentQty + qty;

      if (product.stock_qty !== null && newQty > maxQty) {
        // Show a capped warning (non-blocking for cashier override)
        setScanSuccess(null);
        setScanFeedback(
          maxQty <= 0
            ? `"${product.name}" is out of stock — proceeding with caution`
            : `Only ${maxQty} unit(s) of "${product.name}" available`
        );
        setTimeout(() => setScanFeedback(null), 3000);
        // Cap at available (or allow going to 1 if forced)
        const capped = Math.min(newQty, Math.max(maxQty, currentQty + 1));
        if (capped === currentQty) return prev; // nothing changed
        if (existing)
          return prev.map((i) => i.product.id === product.id ? { ...i, quantity: capped } : i);
        return [...prev, { product, quantity: capped }];
      }

      if (existing)
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: newQty } : i);
      return [...prev, { product, quantity: qty }];
    });
  }, []);

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart((prev) => prev.filter((i) => i.product.id !== id)); return; }
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === id);
      if (!item) return prev;
      const max = item.product.stock_qty !== null ? item.product.stock_qty : Infinity;
      const safe = item.product.stock_qty !== null ? Math.min(qty, Math.max(max, 1)) : qty;
      return prev.map((i) => i.product.id === id ? { ...i, quantity: safe } : i);
    });
  };

  const subtotal    = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const deliveryFee = delivery === "delivery" ? (subtotal >= 500 ? 0 : 50) : 0;
  const total       = subtotal + deliveryFee;
  const totalItems  = cart.reduce((s, i) => s + i.quantity, 0);

  const resetOrder = () => { setCart([]); setDelivery("pickup"); setModal("idle"); setCartOpen(false); };

  // ── scanning ──────────────────────────────────────────────────────────────
  /** Find a product by barcode (EAN/UPC) or SKU (incl. batch-label QR NL:<sku>:<batch>). */
  const findProduct = useCallback((raw: string) => {
    const code = skuFromScan(raw);
    return products.find((p) =>
      p.barcode === raw.trim() ||
      (p.sku && p.sku.toUpperCase() === code) ||
      p.barcode === code
    ) ?? null;
  }, [products]);

  const handleScan = useCallback((code: string): string => {
    const p = findProduct(code);
    if (!p) {
      setScanSuccess(null);
      setScanFeedback(`Not found: ${code}`);
      setTimeout(() => setScanFeedback(null), 2500);
      return `Not found: ${code}`;
    }
    const stockWarning =
      p.stock_qty !== null && p.stock_qty <= 0
        ? " ⚠️ Out of stock"
        : p.stock_qty !== null && p.stock_qty <= (p.reorder_level ?? 5)
          ? " ⚠️ Low stock"
          : "";
    addToCart(p);
    // Show green confirmation for 1 second, then clear
    setScanFeedback(null);
    const label = `${p.name}${p.size ? ` — ${p.size}` : ""}`;
    setScanSuccess(stockWarning ? `${label}${stockWarning}` : `✓ ${label}`);
    setTimeout(() => setScanSuccess(null), 1000);
    return `${p.name}${p.size ? ` ${p.size}` : ""} added${stockWarning}`;
  }, [findProduct, addToCart]);

  // Keyboard-wedge scanner — active when the kiosk is unlocked and the camera isn't open
  useScanner(handleScan, { enabled: !!operator && !cameraOpen, minLength: 4 });

  // Search-box Enter key: if the query is an exact barcode/SKU, add that product
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const p = findProduct(search);
    if (p) { addToCart(p); setSearch(""); }
  };

  const stockState = (p: Product) => {
    if (p.stock_qty === null) return "unknown";
    if (p.stock_qty <= 0) return "out";
    if (p.stock_qty <= (p.reorder_level ?? 5)) return "low";
    return "ok";
  };

  return (
    <div className={styles.kiosk}>
      {/* ── PIN Gate ── */}
      {!operator && (
        <PinPad
          locale={locale}
          deniedAccount={deniedAccount}
          onUnlock={(emp: Employee) => setOperator({ ...emp, via: "pin", isAdmin: false })}
        />
      )}

      {/* ── Top Bar ── */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🏨</div>
          <div>
            <div className={styles.brandName}>Entoto Haven</div>
            <div className={styles.brandSub}>In-Store Kiosk</div>
          </div>
        </div>

        <LiveClock />

        <div className={styles.topRight}>
          {operator && (
            <span className={styles.operatorBadge}>
              👤 {operator.first_name} {operator.last_name}
            </span>
          )}
          {operator && hasBooking && (
            <Link href={`/${locale}/kiosk/rooms`} className={styles.adminBtn} title="Rooms & bookings">
              🛏 Rooms
            </Link>
          )}
          {operator && (
            <KioskOrderQueue operatorId={String(operator.id ?? "")} />
          )}
          {/* Theme cycle button */}
          <button
            className={styles.adminBtn}
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            {themeIcon} {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </button>
          <button
            className={styles.adminBtn}
            onClick={() => { setCart([]); setOperator(null); void lockKiosk(); }}
            title="Lock terminal"
          >
            <Lock size={14} /> Lock
          </button>
          {operator?.isAdmin && (
            <Link href={`/${locale}/admin`} className={styles.adminBtn}>
              <Settings size={14} /> Admin
            </Link>
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className={styles.content}>
        {/* Products Panel */}
        <div className={styles.productsPanel}>
          {/* Search + Scan */}
          <div className={styles.searchRow}>
            <div className={styles.searchBar}>
              <Search size={18} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Search or scan barcode / SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
              />
              {search && (
                <button type="button" className={styles.searchClear} onClick={() => setSearch("")} aria-label="Clear">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={styles.scanBtn}
              onClick={() => setCameraOpen(true)}
              title="Open camera scanner"
              disabled={!operator}
            >
              <ScanLine size={20} />
            </button>
          </div>


          {scanFeedback && (
            <div className={styles.scanFeedback}>
              <AlertTriangle size={14} /> {scanFeedback}
            </div>
          )}

          {/* Category Tabs */}
          <div className={styles.categoryTabs}>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`${styles.catTab} ${activeCategory === cat ? styles.catTabActive : ""}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className={styles.productGrid}>
            {filtered.map((p) => {
              const ss = stockState(p);
              const cartItem = cart.find((i) => i.product.id === p.id);
              return (
                <button
                  key={p.id}
                  className={`${styles.productCard} ${ss === "out" ? styles.productCardOut : ""}`}
                  onClick={() => addToCart(p)}
                  title={ss === "out" ? "Out of stock" : undefined}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className={styles.productImg} />
                  ) : (
                    <div className={styles.productImgPlaceholder}>🍽️</div>
                  )}
                  {/* Stock badge */}
                  {ss === "out" && <span className={styles.stockBadgeOut}>Out</span>}
                  {ss === "low" && <span className={styles.stockBadgeLow}>Low</span>}
                  {/* Cart qty badge */}
                  {cartItem && <span className={styles.cartQtyBadge}>{cartItem.quantity}</span>}
                  <div className={styles.productInfo}>
                    <div className={styles.productName}>{p.name}</div>
                    {p.size && <div className={styles.productSize}>{p.size}</div>}
                    <div className={styles.productPrice}>{p.price.toLocaleString()} ብር</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cart Panel (bottom sheet on phones) ── */}
        <div
          className={`${styles.cartBackdrop} ${cartOpen ? styles.cartBackdropOpen : ""}`}
          onClick={() => setCartOpen(false)}
          aria-hidden="true"
        />
        <div className={`${styles.cartPanel} ${cartOpen ? styles.cartPanelOpen : ""}`}>
          <div className={styles.cartHeader}>
            <div className={styles.cartTitle}>
              <ShoppingCart size={17} />
              Order
              {totalItems > 0 && <span className={styles.cartCount}>{totalItems}</span>}
            </div>
            {cart.length > 0 && (
              <button className={styles.clearBtn} onClick={() => setCart([])}>Clear all</button>
            )}
            <button className={styles.cartClose} onClick={() => setCartOpen(false)} aria-label="Close order">
              <X size={18} />
            </button>
          </div>

          {cart.length === 0 ? (
            <div className={styles.emptyCart}>
              <div className={styles.emptyCartIcon}>🛒</div>
              <p className={styles.emptyCartText}>Tap a product or scan a barcode to add it</p>
            </div>
          ) : (
            <div className={styles.cartItems}>
              {cart.map((item) => (
                <div key={item.product.id} className={styles.cartItem}>
                  <div className={styles.cartItemName}>
                    {item.product.name}
                    {item.product.size && (
                      <div className={styles.cartItemSize}>{item.product.size}</div>
                    )}
                  </div>
                  <div className={styles.qtyControls}>
                    <button className={styles.qtyBtn} onClick={() => setQty(item.product.id, item.quantity - 1)}>−</button>
                    <span className={styles.qtyNum}>{item.quantity}</span>
                    <button className={styles.qtyBtn} onClick={() => setQty(item.product.id, item.quantity + 1)}>+</button>
                  </div>
                  <div className={styles.cartItemPrice}>
                    {(item.product.price * item.quantity).toLocaleString()} ብር
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.cartFooter}>
            {/* Delivery toggle */}
            <div className={styles.deliveryToggle}>
              <button
                className={`${styles.deliveryBtn} ${delivery === "pickup" ? styles.deliveryBtnActive : ""}`}
                onClick={() => setDelivery("pickup")}
              >
                🏪 Pickup
              </button>
              <button
                className={`${styles.deliveryBtn} ${delivery === "delivery" ? styles.deliveryBtnActive : ""}`}
                onClick={() => setDelivery("delivery")}
              >
                🚗 Delivery
              </button>
            </div>

            {/* Totals */}
            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{subtotal.toLocaleString()} ብር</span>
              </div>
              <div className={styles.totalRow}>
                <span>Delivery</span>
                <span>{deliveryFee === 0 ? (delivery === "pickup" ? "—" : "Free") : `${deliveryFee} ብር`}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.totalRowFinal}`}>
                <span>Total</span>
                <span>{total.toLocaleString()} ብር</span>
              </div>
            </div>

            <button
              className={styles.checkoutBtn}
              disabled={cart.length === 0}
              onClick={() => setModal("checkout")}
            >
              <ShoppingCart size={18} />
              Place Order
            </button>
          </div>
        </div>
      </div>

      {/* ── Sticky order bar (phones) ── */}
      <button
        className={styles.mobileCartBar}
        onClick={() => setCartOpen(true)}
        disabled={cart.length === 0}
      >
        <span className={styles.mobileCartLeft}>
          <ShoppingCart size={18} />
          {cart.length === 0 ? "Order is empty" : "View order"}
          {totalItems > 0 && <span className={styles.mobileCartCount}>{totalItems}</span>}
        </span>
        <span>{subtotal.toLocaleString()} ብር</span>
      </button>

      {/* ── Camera scanner ── */}
      <BarcodeScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        continuous
        title="Scan to add to cart"
        onScan={handleScan}
      />

      {/* ── Checkout ── */}
      {modal === "checkout" && (
        <PosCheckout
          lines={cart.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            size: i.product.size,
            price: i.product.price,
            quantity: i.quantity,
          }))}
          delivery={delivery}
          subtotal={subtotal}
          deliveryFee={deliveryFee}
          total={total}
          onClose={() => setModal("idle")}
          onNewOrder={resetOrder}
        />
      )}
      {/* ── Fixed scan success toast (no layout blink) ── */}
      {scanSuccess && (
        <div className={styles.scanSuccessToast}>
          <span className={styles.scanSuccessCheck}>✓</span>
          <span>{scanSuccess}</span>
        </div>
      )}
    </div>
  );
}
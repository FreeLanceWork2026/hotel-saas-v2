"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Link } from "@/i18n/navigation";
import shared from "../../admin.shared.module.css";
import styles from "./Labels.module.css";
import { batchQrPayload, isValidEan13 } from "@/lib/barcode";

export interface LabelProduct {
  id: string;
  name: string;
  size: string | null;
  price: number;
  sku: string | null;
  barcode: string | null;
}
export interface LabelBatch {
  product_id: string;
  batch_code: string;
  expires_at: string | null;
  qty_remaining: number;
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: isValidEan13(value) ? "EAN13" : "CODE128",
        height: 44,
        width: 1.6,
        margin: 0,
        fontSize: 12,
        displayValue: true,
        background: "transparent",
      });
    } catch {
      /* invalid value for the chosen format — leave blank */
    }
  }, [value]);
  return <svg ref={ref} className={styles.barcode} />;
}

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 0, width: 160, errorCorrectionLevel: "M" }).then((u) => alive && setSrc(u));
    return () => { alive = false; };
  }, [value]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="Batch QR" className={styles.qr} /> : <span className={styles.qr} />;
}

export default function LabelsClient({
  products,
  batches,
  initialProduct,
  initialBatch,
  initialCopies,
}: {
  products: LabelProduct[];
  batches: LabelBatch[];
  initialProduct: string;
  initialBatch: string;
  initialCopies: number;
}) {
  const [productId, setProductId] = useState(initialProduct || products[0]?.id || "");
  const [batchCode, setBatchCode] = useState(initialBatch);
  const [copies, setCopies] = useState(initialCopies);
  const [showPrice, setShowPrice] = useState(true);

  const product = products.find((p) => p.id === productId);
  const productBatches = useMemo(() => batches.filter((b) => b.product_id === productId), [batches, productId]);
  const batch = productBatches.find((b) => b.batch_code === batchCode);

  const code = product?.barcode || product?.sku || "";
  const qrValue = product?.sku ? batchQrPayload(product.sku, batch?.batch_code) : "";

  return (
    <div>
      <div className={`${shared.pageHeader} ${styles.noPrint}`}>
        <div>
          <h1 className={shared.pageTitle}>Print labels</h1>
          <p className={shared.pageSubtitle}>Barcode for the till, QR with batch &amp; expiry for traceability.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/admin/inventory" className={shared.actionBtn} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "0.5rem 0.9rem" }}>
            <ArrowLeft size={14} /> Inventory
          </Link>
          <button type="button" className={shared.headerBtn} onClick={() => window.print()} disabled={!product}>
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div className={`${shared.card} ${styles.noPrint}`} style={{ marginBottom: "1.25rem" }}>
        <div className={shared.cardBody}>
          <div className={styles.controls}>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="l-product">Product</label>
              <select className={shared.select} id="l-product" value={productId} onChange={(e) => { setProductId(e.target.value); setBatchCode(""); }}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.size ? ` · ${p.size}` : ""}</option>)}
              </select>
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="l-batch">Batch (optional)</label>
              <select className={shared.select} id="l-batch" value={batchCode} onChange={(e) => setBatchCode(e.target.value)}>
                <option value="">No batch — product code only</option>
                {productBatches.map((b) => <option key={b.batch_code} value={b.batch_code}>{b.batch_code}{b.expires_at ? ` · exp ${b.expires_at}` : ""}</option>)}
              </select>
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label} htmlFor="l-copies">Copies</label>
              <input className={shared.input} id="l-copies" type="number" min={1} max={60} value={copies} onChange={(e) => setCopies(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price
            </label>
          </div>
          {product && !product.barcode && (
            <p className={shared.inputHint} style={{ marginTop: "0.75rem" }}>
              This product has no barcode yet — the SKU is used. Edit the product and press <strong>Generate</strong> for a scannable EAN-13.
            </p>
          )}
        </div>
      </div>

      {!product ? (
        <p className={styles.noPrint}>Add a product first.</p>
      ) : (
        <div className={styles.sheet}>
          {Array.from({ length: copies }).map((_, i) => (
            <div key={i} className={styles.label}>
              <div className={styles.lTop}>
                <div className={styles.lName}>{product.name}</div>
                {product.size && <div className={styles.lSize}>{product.size}</div>}
              </div>
              <div className={styles.lMid}>
                <div className={styles.lCode}>{code && <Barcode value={code} />}</div>
                {qrValue && <Qr value={qrValue} />}
              </div>
              <div className={styles.lBottom}>
                <span>{batch ? `Batch ${batch.batch_code}` : product.sku ?? ""}</span>
                {batch?.expires_at && <span>Exp {batch.expires_at}</span>}
                {showPrice && <strong>{product.price.toFixed(2)} ETB</strong>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

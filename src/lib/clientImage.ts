/** Browser-only: shrink a photo to a web-friendly WebP before upload (phones shoot 4–12 MB JPEGs). */
export async function resizeImage(file: File, maxSide = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unsupported format → let the server validate the original

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  return blob ?? file;
}

/** Resize + POST to the admin upload route. Resolves to the public URL. */
export async function uploadProductImage(file: File): Promise<string> {
  const blob = await resizeImage(file);
  const fd = new FormData();
  fd.append("file", blob, blob.type === "image/webp" ? "product.webp" : file.name);
  const res = await fetch("/api/admin/product-image", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
  return json.url;
}

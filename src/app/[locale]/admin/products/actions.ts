"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";
import { generateInternalEan13 } from "@/lib/barcode";

const UNAUTH = { error: "Unauthorized. Admin access required." } as const;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const int = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Math.floor(Number(String(v ?? "").replace(/,/g, "")));
  return Number.isFinite(n) ? n : fallback;
};

function friendlyDbError(message: string): string {
  if (/products_barcode_key|barcode/i.test(message) && /duplicate|unique/i.test(message))
    return "That barcode is already used by another product.";
  if (/products_sku_key|sku/i.test(message) && /duplicate|unique/i.test(message))
    return "That SKU is already used by another product.";
  return message;
}

/** NL-<initials>-<size>, made unique with a numeric suffix if needed. */
async function uniqueSku(name: string, size: string | null): Promise<string> {
  const sb = getSupabaseAdmin();
  const initials =
    name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "GEN";
  const sizePart = (size ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const base = `NL-${initials}${sizePart ? `-${sizePart}` : ""}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await sb.from("products").select("id").eq("sku", candidate).limit(1);
    if (!data || data.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** An internal EAN-13 not used by any product yet. */
export async function generateBarcodeAction(): Promise<{ barcode?: string; error?: string }> {
  if (!(await getAdminActor())) return UNAUTH;
  const sb = getSupabaseAdmin();
  for (let i = 0; i < 10; i++) {
    const code = generateInternalEan13();
    const { data } = await sb.from("products").select("id").eq("barcode", code).limit(1);
    if (!data || data.length === 0) return { barcode: code };
  }
  return { error: "Could not generate a unique barcode. Try again." };
}

export async function addProduct(formData: FormData) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const name = str(formData.get("name"));
  const price = parseFloat(str(formData.get("price")));
  const category = str(formData.get("category"));
  if (!name || isNaN(price) || price < 0 || !category) {
    return { error: "Name, price and category are required." };
  }

  const size = str(formData.get("size")) || null;
  const sku = str(formData.get("sku")) || (await uniqueSku(name, size));
  let barcode = str(formData.get("barcode"));
  if (!barcode) {
    const gen = await generateBarcodeAction();
    if (gen.error) return { error: gen.error };
    barcode = gen.barcode!;
  }

  const sb = getSupabaseAdmin();
  const baseRow = {
    name,
    name_am: str(formData.get("nameAm")) || null,
    description: str(formData.get("description")) || null,
    price,
    category,
    size,
    barcode,
    sku,
    image_url: str(formData.get("imageUrl")) || null,
    is_active: true,
  };

  // reorder_level only exists after phase25_stock.sql — retry without it if missing
  let { data, error } = await sb
    .from("products")
    .insert([{ ...baseRow, reorder_level: Math.max(0, int(formData.get("reorderLevel"), 5)) }])
    .select()
    .single();
  if (error && /reorder_level/i.test(error.message)) {
    ({ data, error } = await sb.from("products").insert([baseRow]).select().single());
  }
  if (error || !data) {
    console.error("Error adding product:", error);
    return { error: friendlyDbError(error?.message ?? "Could not add product") };
  }

  // Optional opening stock → first batch in the ledger
  const opening = int(formData.get("openingStock"), 0);
  let stockNote: string | undefined;
  if (opening > 0) {
    const { error: stockErr } = await sb.rpc("stock_receive", {
      p_product: data.id,
      p_qty: opening,
      p_batch_code: null,
      p_expires: str(formData.get("expiresAt")) || null,
      p_supplier: null,
      p_produced_by: null,
      p_unit_cost: null,
      p_note: "Opening stock",
      p_actor: actor.label,
      p_source: "opening",
    });
    if (stockErr) stockNote = "Product saved, but stock could not be recorded — run phase25_stock.sql.";
  }

  revalidatePath("/", "layout");
  return { success: true, product: data, stockNote };
}

export async function updateProduct(productId: string, formData: FormData) {
  if (!(await getAdminActor())) return UNAUTH;

  const name = str(formData.get("name"));
  const price = parseFloat(str(formData.get("price")));
  const category = str(formData.get("category"));
  if (!name || isNaN(price) || price < 0 || !category) {
    return { error: "Name, price and category are required." };
  }

  const row: Record<string, unknown> = {
    name,
    name_am: str(formData.get("nameAm")) || null,
    description: str(formData.get("description")) || null,
    price,
    category,
    size: str(formData.get("size")) || null,
    sku: str(formData.get("sku")) || undefined,
    barcode: str(formData.get("barcode")) || undefined,
  };
  const imageUrl = str(formData.get("imageUrl"));
  if (imageUrl) row.image_url = imageUrl;
  if (formData.get("removeImage") === "1") row.image_url = null;
  const reorder = formData.get("reorderLevel");
  if (reorder !== null && reorder !== "") row.reorder_level = Math.max(0, int(reorder, 5));
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

  const sb = getSupabaseAdmin();
  let { error } = await sb.from("products").update(row).eq("id", productId);
  if (error && /reorder_level/i.test(error.message)) {
    delete row.reorder_level;
    ({ error } = await sb.from("products").update(row).eq("id", productId));
  }
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function toggleProductActive(productId: string, currentStatus: boolean) {
  if (!(await getAdminActor())) return UNAUTH;

  const { error } = await getSupabaseAdmin()
    .from("products")
    .update({ is_active: !currentStatus })
    .eq("id", productId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

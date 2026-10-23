import { NextResponse } from "next/server";
import { getAdminActor } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BUCKET = "product-images";
const MAX_BYTES = 6 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * POST /api/admin/product-image  (multipart/form-data, field "file")
 * Admin only. Stores the (already client-resized) image in the public
 * `product-images` bucket — created on first use — and returns its public URL.
 */
export async function POST(request: Request) {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: "No image received." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Image is too large (max 6 MB)." }, { status: 413 });
    }
    const ext = TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ success: false, error: "Use a JPG, PNG or WebP image." }, { status: 415 });
    }

    const sb = getSupabaseAdmin();

    // Create the public bucket the first time
    const { data: bucket } = await sb.storage.getBucket(BUCKET);
    if (!bucket) {
      const { error: createErr } = await sb.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: Object.keys(TYPES),
      });
      if (createErr && !/already exists/i.test(createErr.message)) {
        console.error("createBucket failed:", createErr.message);
        return NextResponse.json({ success: false, error: "Could not prepare image storage." }, { status: 500 });
      }
    }

    const path = `${new Date().getFullYear()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) {
      console.error("product image upload failed:", upErr.message);
      return NextResponse.json({ success: false, error: upErr.message }, { status: 500 });
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl });
  } catch (e) {
    console.error("product-image error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: "Upload failed. Try again." }, { status: 500 });
  }
}

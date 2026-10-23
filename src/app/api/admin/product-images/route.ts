import { NextResponse } from "next/server";
import { getAdminActor } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/** POST /api/admin/product-images — save an image record to product_images table */
export async function POST(request: Request) {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { product_id, url, sort_order = 0, label = null } = body;

    if (!product_id || !url) {
      return NextResponse.json({ success: false, error: "product_id and url are required." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("product_images")
      .insert([{ product_id, url, sort_order, label }])
      .select()
      .single();

    if (error) {
      // Table might not exist yet — fail gracefully
      if (/does not exist/i.test(error.message)) {
        return NextResponse.json({ success: false, error: "Run schema.sql first to create the product_images table." }, { status: 503 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, image: data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

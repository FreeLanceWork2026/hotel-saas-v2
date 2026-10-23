import { NextResponse } from "next/server";
import { getAdminActor } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/** DELETE /api/admin/product-images/[id] — remove a product image record */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Image ID required." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("product_images")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

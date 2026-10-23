"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/supabaseServer";
import { reviewPayment } from "@/lib/payments";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function confirmPaymentAction(orderNumber: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Unauthorized. Admin access required." };

  const res = await reviewPayment({
    orderNumber,
    decision: "confirm",
    actor: `admin:${admin.email ?? admin.id}`,
  });
  if (!res.ok) return { error: res.error ?? "Could not confirm." };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function rejectPaymentAction(orderNumber: string, reason: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Unauthorized. Admin access required." };

  const res = await reviewPayment({
    orderNumber,
    decision: "reject",
    actor: `admin:${admin.email ?? admin.id}`,
    reason: reason.trim().slice(0, 200) || "Payment not found",
  });
  if (!res.ok) return { error: res.error ?? "Could not reject." };

  revalidatePath("/", "layout");
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminActor } from "@/lib/adminAuth";

const UNAUTH = { error: "Unauthorized. Admin access required." } as const;

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

export async function createAnnouncement(formData: FormData) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const title   = str(formData.get("title"));
  const body    = str(formData.get("body"));
  const type    = str(formData.get("type")) || "info";
  const startsAt = str(formData.get("startsAt")) || null;
  const endsAt  = str(formData.get("endsAt")) || null;

  if (!title || !body) {
    return { error: "Title and message are required." };
  }

  const { error } = await getSupabaseAdmin()
    .from("announcements")
    .insert([{
      title,
      body,
      type,
      is_active: true,
      starts_at: startsAt || null,
      ends_at:   endsAt   || null,
      created_by: actor.label,
    }]);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateAnnouncement(id: string, formData: FormData) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const title   = str(formData.get("title"));
  const body    = str(formData.get("body"));
  const type    = str(formData.get("type")) || "info";
  const startsAt = str(formData.get("startsAt")) || null;
  const endsAt  = str(formData.get("endsAt")) || null;

  if (!title || !body) return { error: "Title and message are required." };

  const { error } = await getSupabaseAdmin()
    .from("announcements")
    .update({ title, body, type, starts_at: startsAt, ends_at: endsAt })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function toggleAnnouncement(id: string, currentStatus: boolean) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const { error } = await getSupabaseAdmin()
    .from("announcements")
    .update({ is_active: !currentStatus })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAnnouncement(id: string) {
  const actor = await getAdminActor();
  if (!actor) return UNAUTH;

  const { error } = await getSupabaseAdmin()
    .from("announcements")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

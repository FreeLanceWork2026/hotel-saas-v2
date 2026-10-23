"use server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "crypto";

// Helper function to verify admin access
async function verifyAdminAccess() {
  const cookieStore = await cookies();
  
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return false;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin";
}

// Returns the signed-in admin's user id, or null when the caller is not an admin
async function getAdminUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return null;

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin" ? user.id : null;
}

const ASSIGNABLE_ROLES = ["customer", "employee", "kiosk_operator", "admin"] as const;

/** Change the role of a login account (Google / email user). Admin only. */
export async function setUserRole(userId: string, role: string) {
  const adminId = await getAdminUserId();
  if (!adminId) return { error: "Unauthorized. Admin access required." };

  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    return { error: "Invalid role." };
  }
  if (userId === adminId && role !== "admin") {
    return { error: "You can't remove your own admin access." };
  }

  const supabase = getSupabaseAdmin();

  // Upsert so accounts without a profile row yet are handled too
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, role }, { onConflict: "id" });

  if (error) {
    if (/invalid input value for enum/i.test(error.message)) {
      return {
        error: `The database doesn't have the "${role}" role yet. Run fix_roles_enum.sql in the Supabase SQL Editor.`,
      };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function addEmployee(formData: FormData) {
  const isAdmin = await verifyAdminAccess();
  if (!isAdmin) {
    return { error: "Unauthorized. Admin access required." };
  }

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const pin = formData.get("pin") as string;
  
  if (!firstName || !lastName || !pin) {
    return { error: "All fields are required." };
  }
  
  if (pin.length !== 4 || isNaN(Number(pin))) {
    return { error: "PIN must be exactly 4 digits." };
  }

  // Hash the PIN (simple SHA256)
  const pin_hash = crypto.createHash("sha256").update(pin).digest("hex");

  const supabase = getSupabaseAdmin();

  // The PIN is what identifies the person at the kiosk, so it must be unique
  const { data: clash } = await supabase
    .from("employees")
    .select("id")
    .eq("pin_hash", pin_hash)
    .limit(1);
  if (clash && clash.length > 0) {
    return { error: "That PIN is already used by another employee. Choose a different one." };
  }

  const { data, error } = await supabase
    .from("employees")
    .insert([{
      first_name: firstName,
      last_name: lastName,
      pin_hash,
      is_active: true,
    }])
    .select();

  if (error) {
    console.error("Error adding employee:", error);
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true, employee: data[0] };
}

export async function toggleEmployeeActive(employeeId: string, currentStatus: boolean) {
  const isAdmin = await verifyAdminAccess();
  if (!isAdmin) {
    return { error: "Unauthorized. Admin access required." };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: !currentStatus })
    .eq("id", employeeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

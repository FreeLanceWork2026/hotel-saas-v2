"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import {
  OWNER_COOKIE, OWNER_SESSION_SECONDS, configuredPassword,
  createOwnerToken, passwordMatches, verifyOwnerToken,
} from "@/lib/ownerSession";

type Result = { ok: boolean; error?: string } | null;

export async function isPlatformOwner(): Promise<boolean> {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  return verifyOwnerToken(token, configuredPassword(process.env.PLATFORM_OWNER_PASSWORD));
}

export async function ownerLogin(_prev: Result, formData: FormData): Promise<Result> {
  const password = configuredPassword(process.env.PLATFORM_OWNER_PASSWORD);
  if (!password) return { ok: false, error: "Platform password is not configured on this deployment." };

  const input = String(formData.get("password") ?? "");
  if (!(await passwordMatches(input, password))) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 1000));
    return { ok: false, error: "Wrong password." };
  }

  (await cookies()).set(OWNER_COOKIE, await createOwnerToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: OWNER_SESSION_SECONDS,
  });
  revalidatePath("/[locale]/platform", "page");
  return { ok: true };
}

export async function ownerLogout(): Promise<void> {
  (await cookies()).delete(OWNER_COOKIE);
  revalidatePath("/[locale]/platform", "page");
}

/** Save every switch at once. Checkbox present = ON. */
export async function saveFeatures(_prev: Result, formData: FormData): Promise<Result> {
  if (!(await isPlatformOwner())) return { ok: false, error: "Session expired — sign in again." };

  const now = new Date().toISOString();
  const rows = FEATURES.map((f) => ({ key: f.key, enabled: formData.get(f.key) === "on", updated_at: now }));

  const { error } = await getSupabaseAdmin()
    .from("platform_features")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("platform_features")
        ? "Table missing — run database/platform_features.sql in Supabase first."
        : error.message,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

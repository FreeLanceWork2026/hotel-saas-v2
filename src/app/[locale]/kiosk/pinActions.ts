"use server";

import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { KIOSK_COOKIE, KIOSK_SESSION_HOURS, createKioskToken } from "@/lib/kioskSession";

// ── Brute-force guard: 4-digit PINs have only 10 000 combinations ────────────
// 5 wrong tries from one device → locked for 60 s. (In-memory: per server instance,
// a first line of defence; move to the DB if the kiosk is ever exposed more widely.)
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

async function clientKey(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}

export async function verifyEmployeePin(pin: string): Promise<{
  success: boolean;
  employee?: { id: string; first_name: string; last_name: string };
  error?: string;
}> {
  if (!pin || pin.length !== 4 || isNaN(Number(pin))) {
    return { success: false, error: "PIN must be 4 digits." };
  }

  const key = await clientKey();
  const now = Date.now();
  const state = attempts.get(key);
  if (state && state.lockedUntil > now) {
    const secs = Math.ceil((state.lockedUntil - now) / 1000);
    return { success: false, error: `Too many wrong tries. Wait ${secs}s and try again.` };
  }

  const pin_hash = crypto.createHash("sha256").update(pin).digest("hex");

  const supabase = getSupabaseAdmin();

  // limit(2) so a (mistakenly) duplicated PIN is detected instead of silently picking one
  const { data: matches, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, is_active")
    .eq("pin_hash", pin_hash)
    .limit(2);

  if (error || !matches || matches.length === 0) {
    const count = (state?.count ?? 0) + 1;
    attempts.set(key, {
      count: count >= MAX_ATTEMPTS ? 0 : count,
      lockedUntil: count >= MAX_ATTEMPTS ? now + LOCK_MS : 0,
    });
    return { success: false, error: "Incorrect PIN. Please try again." };
  }

  if (matches.length > 1) {
    return { success: false, error: "This PIN is shared by two employees. Ask your manager to give you a new one." };
  }

  const employee = matches[0];
  if (!employee.is_active) {
    return { success: false, error: "This employee account is inactive. Contact your manager." };
  }

  attempts.delete(key);

  // Remember who is at the terminal (signed, httpOnly) — survives page refresh
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_COOKIE, createKioskToken(employee.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KIOSK_SESSION_HOURS * 3600,
  });

  return {
    success: true,
    employee: {
      id: employee.id,
      first_name: employee.first_name,
      last_name: employee.last_name,
    },
  };
}

/** Lock the terminal: forget the PIN operator. */
export async function lockKiosk(): Promise<{ success: true }> {
  const cookieStore = await cookies();
  cookieStore.delete(KIOSK_COOKIE);
  return { success: true };
}

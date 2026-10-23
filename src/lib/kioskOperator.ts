// SERVER-SIDE ONLY — works out who is currently operating the kiosk.
// Two ways in: (1) a PIN session cookie, or (2) a Google/email account with a staff role.
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUser } from "@/lib/supabaseServer";
import { KIOSK_COOKIE, readKioskToken } from "@/lib/kioskSession";

export interface KioskOperator {
  /** employees.id — only set for PIN sign-ins (used to attribute sales) */
  id: string | null;
  first_name: string;
  last_name: string;
  via: "pin" | "google";
  /** Admins get an "Admin" shortcut on the kiosk */
  isAdmin: boolean;
}

export interface KioskAccess {
  operator: KioskOperator | null;
  /** Signed in with Google/email but the role doesn't allow the kiosk */
  deniedAccount: { email: string | null; name: string } | null;
}

const STAFF_ROLES = ["admin", "employee", "kiosk_operator"];

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || "Staff", last: parts.slice(1).join(" ") };
}

export async function getKioskAccess(): Promise<KioskAccess> {
  // 1) Account sign-in (Google / email)
  const user = await getCurrentUser();
  if (user && STAFF_ROLES.includes(user.role)) {
    const { first, last } = splitName(user.name);
    return {
      operator: { id: null, first_name: first, last_name: last, via: "google", isAdmin: user.role === "admin" },
      deniedAccount: null,
    };
  }

  // 2) PIN session cookie (re-checked against the DB so deactivated staff are locked out)
  const cookieStore = await cookies();
  const session = readKioskToken(cookieStore.get(KIOSK_COOKIE)?.value);
  if (session) {
    const { data: emp } = await getSupabaseAdmin()
      .from("employees")
      .select("id, first_name, last_name, is_active")
      .eq("id", session.eid)
      .maybeSingle();
    if (emp?.is_active) {
      return {
        operator: { id: emp.id, first_name: emp.first_name, last_name: emp.last_name, via: "pin", isAdmin: false },
        deniedAccount: null,
      };
    }
  }

  return {
    operator: null,
    deniedAccount: user ? { email: user.email, name: user.name } : null,
  };
}

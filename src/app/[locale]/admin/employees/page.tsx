import React from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUser } from "@/lib/supabaseServer";
import EmployeesClient from "./EmployeesClient";
import AccountsClient, { type AccountRow } from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const supabase = getSupabaseAdmin();

  // POS operators (PIN-based)
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch employees:", error);
  }

  // Sign-in accounts (Google / email) merged with their profile role
  const [{ data: usersPage }, { data: profiles }, me] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabase.from("profiles").select("id, role, full_name"),
    getCurrentUser(),
  ]);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  const accounts: AccountRow[] = (usersPage?.users ?? [])
    .map((u) => {
      const p = profileById.get(u.id);
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      const profileName = ((p?.full_name as string | null) ?? "").trim();
      return {
        id: u.id,
        email: u.email ?? null,
        name:
          profileName ||
          meta.full_name ||
          meta.name ||
          (u.email ? u.email.split("@")[0] : "Unknown"),
        avatar: meta.avatar_url || meta.picture || null,
        role: (p?.role as string) ?? "customer",
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at,
      };
    })
    .sort((a, b) => {
      // Admins first, then staff, then customers; newest sign-ins first within a group
      const rank = (r: string) => (r === "admin" ? 0 : r === "customer" ? 2 : 1);
      return (
        rank(a.role) - rank(b.role) ||
        (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? "")
      );
    });

  return (
    <div>
      <EmployeesClient initialEmployees={employees || []} />
      <AccountsClient initialAccounts={accounts} currentUserId={me?.id ?? null} />
    </div>
  );
}

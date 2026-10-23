"use client";

import React, { useMemo, useState, useTransition } from "react";
import { ShieldCheck, Search, Loader2 } from "lucide-react";
import shared from "../admin.shared.module.css";
import { setUserRole } from "./actions";
import { useToast } from "@/components/ui/Toast";

export interface AccountRow {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
  role: string;
  last_sign_in_at: string | null;
  created_at: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "employee", label: "Employee" },
  { value: "kiosk_operator", label: "Kiosk operator" },
  { value: "admin", label: "Admin" },
];

export default function AccountsClient({
  initialAccounts,
  currentUserId,
}: {
  initialAccounts: AccountRow[];
  currentUserId: string | null;
}) {
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { success, error } = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
    );
  }, [accounts, query]);

  const handleRoleChange = (id: string, role: string) => {
    const previous = accounts.find((a) => a.id === id)?.role;
    setSavingId(id);
    // optimistic update
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, role } : a)));

    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (res?.error) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, role: previous ?? a.role } : a))
        );
        error("Role not changed", res.error);
      } else {
        success("Role updated", "The new permissions apply on their next page load.");
      }
      setSavingId(null);
    });
  };

  return (
    <div className={shared.card} style={{ marginTop: "1.5rem" }}>
      <div className={shared.cardHeader}>
        <span className={shared.cardTitle}>
          <ShieldCheck size={15} style={{ display: "inline", marginRight: 8 }} />
          Accounts &amp; Roles
        </span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          {accounts.length} sign-in accounts
        </span>
      </div>

      <div className={shared.cardBody}>
        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
          <input
            className={shared.input}
            style={{ paddingLeft: 36 }}
            placeholder="Search by name, email or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            id="accounts-search"
          />
        </div>

        <p className={shared.inputHint} style={{ marginBottom: "1rem" }}>
          People appear here after they sign in once (Google or email). Promote a
          customer to <strong>Employee</strong> to give them kiosk access, or{" "}
          <strong>Admin</strong> for the full dashboard.
        </p>

        <div className={shared.tableWrapper}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Last sign-in</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className={shared.cellEmptyRow}>
                  <td colSpan={3}>No accounts match.</td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const isSelf = a.id === currentUserId;
                  return (
                    <tr
                      key={a.id}
                      style={{
                        opacity: savingId === a.id ? 0.6 : 1,
                        transition: "opacity 200ms",
                      }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              overflow: "hidden",
                              flexShrink: 0,
                              background: "linear-gradient(135deg,#c8891e,#e0a63c)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                            }}
                          >
                            {a.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.avatar}
                                alt=""
                                referrerPolicy="no-referrer"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              a.name.slice(0, 2).toUpperCase()
                            )}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className={shared.cellName}>
                              {a.name}
                              {isSelf && (
                                <span
                                  className={`${shared.badge} ${shared.badgeActive}`}
                                  style={{ marginLeft: 8 }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <div className={shared.cellMono} style={{ fontSize: "0.75rem" }}>
                              {a.email ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={shared.cellMono}>
                        {a.last_sign_in_at
                          ? new Date(a.last_sign_in_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <select
                            className={shared.input}
                            style={{ minWidth: 150, padding: "6px 10px" }}
                            value={a.role}
                            onChange={(e) => handleRoleChange(a.id, e.target.value)}
                            disabled={savingId === a.id || isSelf}
                            title={isSelf ? "You can't change your own role" : undefined}
                            aria-label={`Role for ${a.name}`}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          {savingId === a.id && (
                            <Loader2
                              size={14}
                              style={{ animation: "spin 0.8s linear infinite" }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

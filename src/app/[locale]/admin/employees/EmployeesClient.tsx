"use client";

import React, { useRef, useState, useTransition } from "react";
import { Plus, Loader2, UserCheck, UserX, Users } from "lucide-react";
import shared from "../admin.shared.module.css";
import styles from "./Employees.module.css";
import { addEmployee, toggleEmployeeActive } from "./actions";
import { useToast } from "@/components/ui/Toast";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: string;
}

export default function EmployeesClient({ initialEmployees }: { initialEmployees: Employee[] }) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { success, error } = useToast();

  const handleAdd = async (formData: FormData) => {
    startTransition(async () => {
      const res = await addEmployee(formData);
      if (res.error) {
        error("Failed to Add Employee", res.error);
      } else {
        success("Employee Added!", "New team member is now in the system.");
        formRef.current?.reset();
      }
    });
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    setTogglingId(id);
    startTransition(async () => {
      const res = await toggleEmployeeActive(id, currentStatus);
      if (!res?.error) {
        setEmployees((prev) =>
          prev.map((e) => e.id === id ? { ...e, is_active: !currentStatus } : e)
        );
        success(
          currentStatus ? "Employee Deactivated" : "Employee Activated",
          currentStatus
            ? "They will no longer appear in active team."
            : "Employee is now active and can use the POS."
        );
      } else {
        error("Update Failed", "Could not change employee status.");
      }
      setTogglingId(null);
    });
  };

  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Employees</h1>
          <p className={shared.pageSubtitle}>
            {activeCount} active · {employees.length} total team members
          </p>
        </div>
      </div>

      <div className={styles.container}>
        {/* ── Team Table ── */}
        <div className={shared.card}>
          <div className={shared.cardHeader}>
            <span className={shared.cardTitle}>
              <Users size={15} style={{ display: "inline", marginRight: 8 }} />
              Team Members
            </span>
          </div>
          <div className={shared.tableWrapper}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr className={shared.cellEmptyRow}>
                    <td colSpan={4}>No employees found. Add your first team member.</td>
                  </tr>
                ) : (
                  employees.map((e) => (
                    <tr
                      key={e.id}
                      style={{
                        opacity: togglingId === e.id ? 0.5 : 1,
                        transition: "opacity 200ms",
                      }}
                    >
                      <td>
                        <span className={shared.cellName}>{e.first_name} {e.last_name}</span>
                      </td>
                      <td className={shared.cellMono}>
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <span
                          className={`${shared.badge} ${e.is_active ? shared.badgeActive : shared.badgeInactive}`}
                        >
                          {e.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggle(e.id, e.is_active)}
                          className={`${shared.actionBtn} ${e.is_active ? shared.actionBtnDanger : ""}`}
                          disabled={isPending}
                        >
                          {togglingId === e.id ? (
                            <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                          ) : e.is_active ? (
                            <><UserX size={13} /> Deactivate</>
                          ) : (
                            <><UserCheck size={13} /> Activate</>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Add Employee Form ── */}
        <div className={shared.card}>
          <div className={shared.cardHeader}>
            <span className={shared.cardTitle}>Add Team Member</span>
            <Plus size={16} style={{ color: "var(--a-gold)" }} />
          </div>
          <div className={shared.cardBody}>
            <form ref={formRef} action={handleAdd} className={shared.form}>
              <div className={shared.inputGroup}>
                <label className={shared.label} htmlFor="firstName">
                  First Name <span className={shared.labelRequired}>*</span>
                </label>
                <input
                  className={shared.input} type="text" id="firstName" name="firstName"
                  required placeholder="e.g. Abebe"
                />
              </div>

              <div className={shared.inputGroup}>
                <label className={shared.label} htmlFor="lastName">
                  Last Name <span className={shared.labelRequired}>*</span>
                </label>
                <input
                  className={shared.input} type="text" id="lastName" name="lastName"
                  required placeholder="e.g. Kebede"
                />
              </div>

              <div className={shared.inputGroup}>
                <label className={shared.label} htmlFor="pin">
                  POS PIN (4 digits) <span className={shared.labelRequired}>*</span>
                </label>
                <input
                  className={shared.input} type="password" id="pin" name="pin"
                  required maxLength={4} pattern="[0-9]{4}"
                  placeholder="••••" title="Must be exactly 4 digits"
                />
                <p className={shared.inputHint}>Used to unlock the Point of Sale system.</p>
              </div>

              <button type="submit" className={shared.submitBtn} disabled={isPending}>
                {isPending ? (
                  <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Adding…</>
                ) : (
                  <><Plus size={16} /> Add Employee</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Megaphone, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check, AlertTriangle, Info, Zap } from "lucide-react";
import {
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
} from "./actions";
import styles from "./Announcements.module.css";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  created_by?: string | null;
}

const TYPE_OPTIONS = [
  { value: "info",    label: "Info",    icon: Info,           color: "#60a5fa" },
  { value: "warning", label: "Warning", icon: AlertTriangle,  color: "#f5a623" },
  { value: "promo",   label: "Promo",   icon: Zap,            color: "#c88a1e" },
  { value: "success", label: "Success", icon: Check,          color: "#7dc494" },
] as const;

function typeConfig(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
}

interface FormState {
  mode: "create" | "edit";
  item?: Announcement;
}

export default function AnnouncementsClient({ announcements: initial }: { announcements: Announcement[] }) {
  const [announcements, setAnnouncements] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openCreate = () => setForm({ mode: "create" });
  const openEdit   = (item: Announcement) => setForm({ mode: "edit", item });
  const closeForm  = () => { setForm(null); setError(null); };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = form?.mode === "edit" && form.item
        ? await updateAnnouncement(form.item.id, fd)
        : await createAnnouncement(fd);

      if ("error" in res) { setError(res.error ?? "Could not save the announcement."); return; }
      closeForm();
      // Refresh by navigating (server re-renders the page)
      window.location.reload();
    });
  };

  const handleToggle = (id: string, current: boolean) => {
    startTransition(async () => {
      await toggleAnnouncement(id, current);
      setAnnouncements((prev) =>
        prev.map((a) => a.id === id ? { ...a, is_active: !current } : a)
      );
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this announcement permanently?")) return;
    startTransition(async () => {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    });
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Megaphone size={22} />
          <div>
            <h1 className={styles.title}>Announcements</h1>
            <p className={styles.subtitle}>Publish banners visible to customers on the storefront</p>
          </div>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate} id="create-announcement-btn">
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div className={styles.empty}>
          <Megaphone size={40} opacity={0.3} />
          <p>No announcements yet. Create one to inform your customers.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {announcements.map((ann) => {
            const tc = typeConfig(ann.type);
            const Icon = tc.icon;
            return (
              <div key={ann.id} className={`${styles.card} ${!ann.is_active ? styles.cardDimmed : ""}`}>
                <div className={styles.cardLeft}>
                  <span className={styles.typeIcon} style={{ color: tc.color, background: tc.color + "18" }}>
                    <Icon size={14} />
                    {tc.label}
                  </span>
                  <h3 className={styles.annTitle}>{ann.title}</h3>
                  <p className={styles.annBody}>{ann.body}</p>
                  {(ann.starts_at || ann.ends_at) && (
                    <p className={styles.annDates}>
                      {ann.starts_at ? `From ${new Date(ann.starts_at).toLocaleDateString()}` : ""}
                      {ann.ends_at   ? ` · Until ${new Date(ann.ends_at).toLocaleDateString()}` : ""}
                    </p>
                  )}
                </div>
                <div className={styles.cardActions}>
                  <span className={`${styles.statusDot} ${ann.is_active ? styles.statusActive : styles.statusOff}`}>
                    {ann.is_active ? "Live" : "Off"}
                  </span>
                  <button
                    className={styles.iconBtn}
                    onClick={() => handleToggle(ann.id, ann.is_active)}
                    title={ann.is_active ? "Deactivate" : "Activate"}
                    disabled={isPending}
                    id={`toggle-ann-${ann.id}`}
                  >
                    {ann.is_active ? <ToggleRight size={18} color="#7dc494" /> : <ToggleLeft size={18} />}
                  </button>
                  <button className={styles.iconBtn} onClick={() => openEdit(ann)} title="Edit" id={`edit-ann-${ann.id}`}>
                    <Pencil size={15} />
                  </button>
                  <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDelete(ann.id)} title="Delete" id={`delete-ann-${ann.id}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer form */}
      {form && (
        <div className={styles.overlay} onClick={closeForm}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2>{form.mode === "create" ? "New Announcement" : "Edit Announcement"}</h2>
              <button className={styles.iconBtn} onClick={closeForm}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className={styles.drawerForm}>
              {error && <p className={styles.formError}>{error}</p>}

              <label className={styles.label}>
                Title *
                <input
                  name="title"
                  defaultValue={form.item?.title}
                  placeholder="e.g. We're open on holidays!"
                  required
                  className={styles.input}
                  id="ann-title-input"
                />
              </label>

              <label className={styles.label}>
                Message *
                <textarea
                  name="body"
                  defaultValue={form.item?.body}
                  placeholder="The message customers will see..."
                  required
                  rows={3}
                  className={styles.textarea}
                  id="ann-body-input"
                />
              </label>

              <label className={styles.label}>
                Type
                <select name="type" defaultValue={form.item?.type ?? "info"} className={styles.select} id="ann-type-select">
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <div className={styles.dateRow}>
                <label className={styles.label}>
                  Show from (optional)
                  <input type="datetime-local" name="startsAt" defaultValue={form.item?.starts_at?.slice(0, 16)} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Hide after (optional)
                  <input type="datetime-local" name="endsAt" defaultValue={form.item?.ends_at?.slice(0, 16)} className={styles.input} />
                </label>
              </div>

              <div className={styles.drawerActions}>
                <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={closeForm}>Cancel</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={isPending} id="ann-submit-btn">
                  {isPending ? "Saving…" : form.mode === "create" ? "Publish" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

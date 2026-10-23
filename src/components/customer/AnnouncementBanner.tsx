"use client";

import { useState } from "react";
import { X, Info, AlertTriangle, Zap, CheckCircle2 } from "lucide-react";
import type { Announcement } from "@/app/[locale]/admin/announcements/AnnouncementsClient";
import styles from "./AnnouncementBanner.module.css";

const ICONS = {
  info:    Info,
  warning: AlertTriangle,
  promo:   Zap,
  success: CheckCircle2,
} as const;

const COLORS = {
  info:    { bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.25)",  text: "#60a5fa" },
  warning: { bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)",  text: "#f5a623" },
  promo:   { bg: "rgba(200,137,30,0.1)",  border: "rgba(200,137,30,0.25)",  text: "#c88a1e" },
  success: { bg: "rgba(90,158,111,0.1)",  border: "rgba(90,158,111,0.25)",  text: "#7dc494" },
} as const;

/** Inside its start/end window right now (the server already filters; this covers long-open tabs). */
function isLive(a: Announcement) {
  const now = Date.now();
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
  if (a.ends_at   && new Date(a.ends_at).getTime()   < now) return false;
  return true;
}

export default function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = announcements.filter((a) => !dismissed.has(a.id) && isLive(a));

  if (visible.length === 0) return null;

  return (
    <div className={styles.stack}>
      {visible.map((ann) => {
        const type   = (ann.type in COLORS ? ann.type : "info") as keyof typeof COLORS;
        const color  = COLORS[type];
        const Icon   = ICONS[type];
        return (
          <div
            key={ann.id}
            className={styles.banner}
            style={{
              background:   color.bg,
              borderBottom: `1px solid ${color.border}`,
            }}
            role="alert"
            aria-live="polite"
          >
            <div className={styles.inner}>
              <Icon size={16} style={{ color: color.text, flexShrink: 0 }} />
              <div className={styles.content}>
                <strong style={{ color: color.text }}>{ann.title}</strong>
                <span className={styles.body}>{ann.body}</span>
              </div>
              <button
                className={styles.close}
                onClick={() => setDismissed((prev) => new Set([...prev, ann.id]))}
                aria-label="Dismiss announcement"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

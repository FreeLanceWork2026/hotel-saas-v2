"use client";

import { useEffect } from "react";
import styles from "./Modal.module.css";

export type ModalType = "error" | "success" | "warning" | "info";

interface ModalProps {
  open: boolean;
  type?: ModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}

const ICONS: Record<ModalType, string> = {
  error:   "❌",
  success: "✅",
  warning: "⚠️",
  info:    "ℹ️",
};

export default function Modal({
  open,
  type = "error",
  title,
  message,
  confirmLabel = "OK",
  onClose,
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`${styles.modal} ${styles[type]} animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.iconWrap}>
          <span className={styles.icon}>{ICONS[type]}</span>
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{message}</p>
        </div>
        <button className={styles.confirmBtn} onClick={onClose} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

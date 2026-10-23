"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error:   <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info:    <Info size={18} />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<(Toast & { removing?: boolean })[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    // Mark as removing to trigger exit animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, removing: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 320);
  }, []);

  const toast = useCallback(({ type, title, message, duration = 4000 }: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [{ id, type, title, message, duration }, ...prev].slice(0, 5));

    const timer = setTimeout(() => remove(id), duration);
    timers.current.set(id, timer);
  }, [remove]);

  const success = useCallback((title: string, msg?: string) => toast({ type: "success", title, message: msg }), [toast]);
  const error   = useCallback((title: string, msg?: string) => toast({ type: "error",   title, message: msg, duration: 6000 }), [toast]);
  const warning = useCallback((title: string, msg?: string) => toast({ type: "warning", title, message: msg, duration: 5000 }), [toast]);
  const info    = useCallback((title: string, msg?: string) => toast({ type: "info",    title, message: msg }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {/* Toast stack */}
      <div className={styles.stack} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.type]} ${t.removing ? styles.removing : ""}`}
            role="alert"
          >
            {/* Progress bar */}
            <div
              className={styles.progress}
              style={{ animationDuration: `${t.duration ?? 4000}ms` }}
            />

            <div className={styles.iconWrap}>
              {ICONS[t.type]}
            </div>
            <div className={styles.body}>
              <p className={styles.title}>{t.title}</p>
              {t.message && <p className={styles.message}>{t.message}</p>}
            </div>
            <button
              className={styles.closeBtn}
              onClick={() => {
                const timer = timers.current.get(t.id);
                if (timer) clearTimeout(timer);
                remove(t.id);
              }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

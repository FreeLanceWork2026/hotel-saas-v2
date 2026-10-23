"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./PageProgress.module.css";

/**
 * Amber top progress bar triggered on every client-side navigation.
 * Also shows a fixed "Loading..." label so users know something is happening.
 */
export default function PageProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname);

  const clear = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    clear();
    setActive(true);
    setProgress(5);

    let p = 5;
    intervalRef.current = setInterval(() => {
      p = Math.min(p + (100 - p) * 0.15 + Math.random() * 5, 90);
      setProgress(p);
    }, 200);

    // Auto-complete after max 1.5s
    completeTimer.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      hideTimer.current = setTimeout(() => {
        setActive(false);
        setProgress(0);
      }, 400);
    }, 1500);

    return clear;
  }, [pathname]);

  // Also reset on mount when path matches (handles direct nav)
  useEffect(() => {
    return () => clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active && progress === 0) return null;

  return (
    <>
      <div
        className={styles.bar}
        style={{ width: `${progress}%`, opacity: active || progress < 100 ? 1 : 0 }}
      />
      {active && progress < 95 && (
        <div className={styles.label}>
          <span className={styles.dot} />
          Loading…
        </div>
      )}
    </>
  );
}

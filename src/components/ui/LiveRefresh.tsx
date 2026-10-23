"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Keeps a server-rendered page "live" without a manual refresh.
 *
 * Industry-standard layering (each layer is a safety net for the one above):
 *  1. Supabase Realtime  — optional (`tables`), instant when the table is in the
 *                          realtime publication and readable by the client.
 *  2. Visibility-aware polling — every `intervalMs`, only while the tab is visible.
 *  3. Wake-up refresh    — immediately when the tab regains focus / comes online.
 *
 * It calls `router.refresh()`, which re-runs the server components and swaps in
 * fresh data while preserving client state (open dialogs, typed text, scroll).
 * Renders nothing.
 */
export default function LiveRefresh({
  intervalMs = 8000,
  enabled = true,
  tables = [],
}: {
  intervalMs?: number;
  enabled?: boolean;
  tables?: string[];
}) {
  const router = useRouter();
  const lastRun = useRef(0);
  const tablesKey = tables.join(",");

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      lastRun.current = Date.now();
      router.refresh();
    };

    // 2. polling
    const poll = setInterval(refresh, intervalMs);

    // 3. wake-up
    const wake = () => {
      if (Date.now() - lastRun.current > 1500) refresh();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);

    // 1. realtime (debounced so a burst of changes triggers one refresh)
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 400);
    };
    const channels = tablesKey
      ? tablesKey.split(",").map((table) =>
          supabase
            .channel(`live-${table}-${Math.random().toString(36).slice(2, 8)}`)
            .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
            .subscribe()
        )
      : [];

    return () => {
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [enabled, intervalMs, tablesKey, router]);

  return null;
}
